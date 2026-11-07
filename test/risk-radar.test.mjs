// test/risk-radar.test.mjs — اختبارات رادار المخاطر والتناقضات التنفيذية
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { db } from '../db.js';
import { analyzeExecutiveRisks, check_risk_radar } from '../src/executive/radar.js';
import { tools } from '../src/tools/registry.js';
import { executeTool } from '../src/tools/handler.js';
import { importBundle, kList } from '../knowledge.js';
import { app } from '../server.js';

// -----------------------------------------------------------------------------
// 1. فحص تعريف الأداة والتسجيل في السجل العام للأدوات
// -----------------------------------------------------------------------------
test('check_risk_radar tool is declared correctly with Gemini schema', () => {
  const { declaration } = check_risk_radar;
  assert.equal(declaration.name, 'check_risk_radar');
  assert.ok(typeof declaration.description === 'string' && declaration.description.length > 10);
  assert.equal(declaration.parameters.type, 'OBJECT');
  assert.ok(declaration.parameters.properties.category);
  assert.ok(declaration.parameters.properties.severity);
  assert.deepEqual(declaration.parameters.properties.category.enum, ['all', 'budget', 'timeline', 'data', 'quality']);
  assert.deepEqual(declaration.parameters.properties.severity.enum, ['all', 'critical', 'warning', 'info']);
});

test('check_risk_radar is registered in src/tools/registry', () => {
  assert.ok(tools.check_risk_radar, 'check_risk_radar must be present in tools registry');
  assert.equal(typeof tools.check_risk_radar.run, 'function');
});

test('check_risk_radar can be executed through src/tools/handler', async () => {
  const result = await executeTool('check_risk_radar', {});
  assert.ok(result);
  assert.ok(typeof result.summary === 'string');
  assert.ok(typeof result.total_risks === 'number');
  assert.ok(Array.isArray(result.risks));
});

test('check_risk_radar tool supports category and severity filtering', async () => {
  const filteredTimeline = await check_risk_radar.run({ category: 'timeline' });
  assert.ok(filteredTimeline.risks.every(r => r.category === 'timeline'));

  const filteredCritical = await check_risk_radar.run({ severity: 'critical' });
  assert.ok(filteredCritical.risks.every(r => r.severity === 'critical'));
});

// -----------------------------------------------------------------------------
// 2. فحص خوارزميات رصد مخاطر الميزانية (Budget Risks)
// -----------------------------------------------------------------------------
test('Budget Risk: detects projects with spent > budget (overrun)', async () => {
  // إضافة مشروع متجاوز للميزانية
  await db.run(`
    INSERT INTO projects (name, department, status, progress, budget, spent, owner, due_date, start_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, ['مشروع البنية السحابية التجريبي', 'التقنية', 'قيد التنفيذ', 50, 1000000, 1300000, 'عبدالله', '2027-01-01', '2026-01-01']);

  try {
    const risks = await analyzeExecutiveRisks();
    const overrunRisk = risks.find(r => r.title.includes('مشروع البنية السحابية التجريبي') && r.category === 'budget');
    assert.ok(overrunRisk, 'Must detect budget overrun');
    assert.equal(overrunRisk.severity, 'critical');
    assert.match(overrunRisk.description, /تجاوزت المصروفات الفعلية/);
    assert.match(overrunRisk.description, /300,000/);
    assert.equal(overrunRisk.relatedProject, 'مشروع البنية السحابية التجريبي');
  } finally {
    await db.run("DELETE FROM projects WHERE name = 'مشروع البنية السحابية التجريبي'");
  }
});

test('Budget Risk: detects early budget exhaustion (spent/budget > 0.9 while progress < 0.7)', async () => {
  // إضافة مشروع استنزف ميزانيته مبكراً (صرف 92% مع إنجاز 35% فقط)
  await db.run(`
    INSERT INTO projects (name, department, status, progress, budget, spent, owner, due_date, start_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, ['مشروع الذكاء الاصطناعي التجريبي', 'الابتكار', 'قيد التنفيذ', 35, 500000, 465000, 'ريما', '2027-06-01', '2026-01-01']);

  try {
    const risks = await analyzeExecutiveRisks();
    const burnRisk = risks.find(r => r.title.includes('مشروع الذكاء الاصطناعي التجريبي') && r.category === 'budget');
    assert.ok(burnRisk, 'Must detect early budget exhaustion');
    assert.ok(['critical', 'warning'].includes(burnRisk.severity));
    assert.match(burnRisk.title, /استنزاف مبكر للميزانية/);
    assert.match(burnRisk.description, /93%/);
  } finally {
    await db.run("DELETE FROM projects WHERE name = 'مشروع الذكاء الاصطناعي التجريبي'");
  }
});

// -----------------------------------------------------------------------------
// 3. فحص خوارزميات رصد مخاطر الجدول الزمني (Timeline Risks)
// -----------------------------------------------------------------------------
test('Timeline Risk: detects overdue incomplete projects', async () => {
  // مشروع موعده النهائي انقضى في الماضي
  await db.run(`
    INSERT INTO projects (name, department, status, progress, budget, spent, owner, due_date, start_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, ['مشروع المنصة القديمة', 'التشغيل', 'قيد التنفيذ', 70, 400000, 200000, 'سلمان', '2025-12-31', '2025-01-01']);

  try {
    const risks = await analyzeExecutiveRisks({ now: new Date('2026-11-01') });
    const overdueRisk = risks.find(r => r.title.includes('مشروع المنصة القديمة') && r.category === 'timeline');
    assert.ok(overdueRisk, 'Must detect overdue project');
    assert.equal(overdueRisk.severity, 'critical');
    assert.match(overdueRisk.title, /متجاوز للموعد النهائي/);
  } finally {
    await db.run("DELETE FROM projects WHERE name = 'مشروع المنصة القديمة'");
  }
});

test('Timeline Risk: detects elapsed time > progress + 20%', async () => {
  // مشروع بدأ في 2026-01-01 وينتهي في 2026-12-31 (10 شهور مضت ~83%) ونسبة الإنجاز 30% فقط (فجوة 53%)
  await db.run(`
    INSERT INTO projects (name, department, status, progress, budget, spent, owner, due_date, start_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, ['مشروع التكامل الإلكتروني التجريبي', 'الربط', 'متأخر', 30, 800000, 300000, 'طارق', '2026-12-31', '2026-01-01']);

  try {
    const risks = await analyzeExecutiveRisks({ now: new Date('2026-11-01') });
    const slipRisk = risks.find(r => r.title.includes('مشروع التكامل الإلكتروني التجريبي') && r.category === 'timeline');
    assert.ok(slipRisk, 'Must detect timeline slippage');
    assert.ok(['critical', 'warning'].includes(slipRisk.severity));
    assert.match(slipRisk.title, /انحراف في وتيرة تنفيذ/);
  } finally {
    await db.run("DELETE FROM projects WHERE name = 'مشروع التكامل الإلكتروني التجريبي'");
  }
});

test('Timeline Risk: does not flag completed projects even if past due_date', async () => {
  await db.run(`
    INSERT INTO projects (name, department, status, progress, budget, spent, owner, due_date, start_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, ['مشروع منتهي بنجاح', 'التحول', 'مكتمل', 100, 600000, 580000, 'هند', '2025-06-30', '2025-01-01']);

  try {
    const risks = await analyzeExecutiveRisks({ now: new Date('2026-11-01') });
    const falsePositive = risks.find(r => r.relatedProject === 'مشروع منتهي بنجاح');
    assert.equal(falsePositive, undefined, 'Completed projects must not be flagged for timeline risk');
  } finally {
    await db.run("DELETE FROM projects WHERE name = 'مشروع منتهي بنجاح'");
  }
});

test('Timeline Risk: flags halted projects (status = متوقف)', async () => {
  const risks = await analyzeExecutiveRisks();
  const haltedRisk = risks.find(r => r.title.includes('ترحيل الأنظمة للسحابة'));
  assert.ok(haltedRisk, 'Must flag halted project');
  assert.equal(haltedRisk.severity, 'critical');
  assert.equal(haltedRisk.category, 'timeline');
});

// -----------------------------------------------------------------------------
// 4. فحص التذاكر الحرجة والمتقادمة (Critical Tickets)
// -----------------------------------------------------------------------------
test('Tickets Risk: flags open high-priority tickets', async () => {
  const risks = await analyzeExecutiveRisks();
  const ticketRisk = risks.find(r => r.title.includes('خلل في تسجيل الدخول عبر النفاذ الوطني'));
  assert.ok(ticketRisk, 'Must flag open high-priority ticket');
  assert.equal(ticketRisk.severity, 'critical');
  assert.equal(ticketRisk.category, 'timeline');
  assert.ok(ticketRisk.relatedProject);
});

test('Tickets Risk: detects ticket aging for aged open tickets', async () => {
  // تذكرة مفتوحة منذ أكثر من 20 يوماً
  const res = await db.run(`
    INSERT INTO tickets (project_id, title, priority, status, created_at)
    VALUES (?, ?, ?, ?, ?)
  `, [1, 'تذكرة متقادمة معلقة دون حل', 'متوسطة', 'مفتوحة', '2026-10-01 10:00:00']);
  const ticketId = res.lastInsertRowid;

  try {
    const risks = await analyzeExecutiveRisks({ now: new Date('2026-11-01') });
    const agedRisk = risks.find(r => r.title.includes('تذكرة متقادمة معلقة دون حل'));
    assert.ok(agedRisk, 'Must flag aged ticket as risk');
    assert.equal(agedRisk.severity, 'critical');
    assert.match(agedRisk.description, /يوماً/);
  } finally {
    if (ticketId) await db.run('DELETE FROM tickets WHERE id = ?', [ticketId]);
  }
});

// -----------------------------------------------------------------------------
// 5. فحص محاذير الجودة وتناقضات ملفات المعرفة (Auto-DK & Discrepancy)
// -----------------------------------------------------------------------------
test('Quality Risk: detects quality caveats (quality_pending) in knowledge catalog', async () => {
  const testBundle = {
    format: 'fawaz-dk-bundle/1',
    id: 'ds-11a22b33',
    sha256: '11a22b33445566778899aabbccddeeff112233445566778899aabbccddeeff00',
    title: 'تقرير المراجعة المالية التجريبي 2026',
    kind: 'document',
    status: 'مسودة قيد التدقيق',
    version: 1,
    pipeline: 'auto-dk',
    purpose: 'فحص الحسابات والتدفقات النقدية.',
    summary: 'تقرير يتضمن استثناءات غير مدققة وملاحظات حول الصرف.',
    keywords: ['مالية', 'مراجعة', 'تدقيق'],
    quality_pending: [
      'بيانات غير مدققة لحسابات الربع الثالث',
      'فارق حسابي في تسوية الحسابات البنكية',
    ],
    sections: [
      { n: 1, heading: 'الملاحظات', text: 'تفاصيل الملاحظات غير المدققة.' }
    ],
    tables: [],
  };

  await importBundle(testBundle);

  const risks = await analyzeExecutiveRisks();
  const qualityRisk = risks.find(r => r.id === 'risk-quality-ds-11a22b33');
  assert.ok(qualityRisk, 'Must detect quality caveats from Auto-DK catalog');
  assert.equal(qualityRisk.category, 'quality');
  assert.equal(qualityRisk.severity, 'critical'); // يحتوي على لفظ «فارق»
  assert.match(qualityRisk.description, /غير مدققة/);
});

test('Data Discrepancy: cross-references document table against database project budget', async () => {
  // حزمة مستند تتضمن جدولاً يذكر ميزانية مختلفة لمشروع «بوابة الخدمات الإلكترونية»
  // في قاعدة البيانات ميزانية هذا المشروع 1,200,000 بينما المستند يورد 1,800,000
  const uniqueSuffix = Date.now().toString(16).slice(-8);
  const bundleWithDiscrepancy = {
    format: 'fawaz-dk-bundle/1',
    id: `ds-${uniqueSuffix}`,
    sha256: `sha256_${uniqueSuffix}_${'0'.repeat(30)}`,
    title: 'جدول الاعتمادات المالية لمشاريع التحول',
    kind: 'spreadsheet',
    status: 'جاهز',
    version: 1,
    pipeline: 'auto-dk',
    purpose: 'مطابقة الاعتمادات مع الإدارات.',
    summary: 'مقارنة ميزانيات مشاريع التحول الرقمي.',
    keywords: ['ميزانية', 'بوابة الخدمات الإلكترونية', 'اعتمادات'],
    quality_pending: [],
    sections: [
      { n: 1, heading: 'جدول المشاريع', text: 'بيانات بوابة الخدمات الإلكترونية.' }
    ],
    tables: [
      {
        sheet: 'الاعتمادات',
        columns: ['اسم المشروع', 'الميزانية المعتمدة'],
        rows: [
          ['بوابة الخدمات الإلكترونية', '1,800,000'],
        ],
        csv: 'اسم المشروع,الميزانية المعتمدة\nبوابة الخدمات الإلكترونية,1800000\n',
      }
    ],
  };

  await importBundle(bundleWithDiscrepancy);

  const risks = await analyzeExecutiveRisks();
  const dataRisk = risks.find(r => r.id.includes('risk-data-budget-mismatch') && r.relatedProject === 'بوابة الخدمات الإلكترونية');
  assert.ok(dataRisk, 'Must detect budget discrepancy between document and DB');
  assert.equal(dataRisk.category, 'data');
  assert.equal(dataRisk.severity, 'critical');
  assert.match(dataRisk.description, /1,800,000/);
  assert.match(dataRisk.description, /1,200,000/);
});

// -----------------------------------------------------------------------------
// 6. فحص معايير ومواصفات كائنات المخاطر والترتيب حسب الأولوية
// -----------------------------------------------------------------------------
test('Risk Schema: all risks satisfy required properties and priorities', async () => {
  const risks = await analyzeExecutiveRisks();
  assert.ok(risks.length > 0, 'Should return detected risks');

  const validSeverities = new Set(['critical', 'warning', 'info']);
  const validCategories = new Set(['budget', 'timeline', 'data', 'quality']);

  for (const r of risks) {
    assert.ok(r.id, 'Risk must have an id');
    assert.ok(validSeverities.has(r.severity), `Invalid severity: ${r.severity}`);
    assert.ok(r.title, 'Risk must have a title');
    assert.ok(r.description, 'Risk must have a description');
    assert.ok(validCategories.has(r.category), `Invalid category: ${r.category}`);
    assert.ok(r.impact, 'Risk must have an impact statement');
    assert.ok(r.recommendation, 'Risk must have a recommendation');
    assert.ok(typeof r.action === 'string' && r.action.length > 0, 'Risk must have an action string');
  }

  // التحقق من أن العناصر الحرجة تسبق التحذيرات
  const priorityOrder = { critical: 0, warning: 1, info: 2 };
  for (let i = 0; i < risks.length - 1; i++) {
    const currentPri = priorityOrder[risks[i].severity];
    const nextPri = priorityOrder[risks[i + 1].severity];
    assert.ok(currentPri <= nextPri, `Prioritization violated: ${risks[i].severity} appeared before ${risks[i + 1].severity}`);
  }
});

// -----------------------------------------------------------------------------
// 7. فحص مسار API النمطي GET /api/executive/radar
// -----------------------------------------------------------------------------
test('Executive API: GET /api/executive/radar returns structured response', async () => {
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    const res = await fetch(`${baseUrl}/api/executive/radar`);
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.equal(data.ok, true);
    assert.ok(data.timestamp);
    assert.ok(data.summary);
    assert.equal(typeof data.summary.total, 'number');
    assert.equal(typeof data.summary.critical, 'number');
    assert.equal(typeof data.summary.warning, 'number');
    assert.equal(typeof data.summary.info, 'number');
    assert.ok(Array.isArray(data.risks));

    // اختبار التصفية عبر query params
    const critRes = await fetch(`${baseUrl}/api/executive/radar?severity=critical`);
    const critData = await critRes.json();
    assert.equal(critRes.status, 200);
    assert.ok(critData.risks.every(r => r.severity === 'critical'));

    const timelineRes = await fetch(`${baseUrl}/api/executive/radar?category=timeline`);
    const timelineData = await timelineRes.json();
    assert.equal(timelineRes.status, 200);
    assert.ok(timelineData.risks.every(r => r.category === 'timeline'));
  } finally {
    server.close();
  }
});
