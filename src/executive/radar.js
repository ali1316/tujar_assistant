// src/executive/radar.js — رادار المخاطر والتناقضات التنفيذية
import { db } from '../../db.js';
import { kList } from '../../knowledge.js';
import { datasetGet } from '../../store.js';

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };

function parseArabicOrLatinNumber(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return isNaN(val) ? null : val;
  const s = String(val)
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/٫/g, '.')
    .replace(/[٬,\s]/g, '')
    .trim();
  const m = s.match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[ً-ْـ]/g, '')
    .replace(/[_\-()]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * يفحص ويحلل المخاطر التنفيذية في المشاريع والتذاكر وملفات المعرفة
 * @param {Object} options
 * @param {Date} [options.now] الوقت الحالي (مفيد للاختبارات والمحاكاة)
 * @returns {Promise<Array<Object>>} قائمة بالمخاطر مرتبة حسب الأولوية
 */
export async function analyzeExecutiveRisks({ now = new Date() } = {}) {
  const risks = [];
  const nowDate = now instanceof Date ? now : new Date(now);
  const nowMs = nowDate.getTime();

  // 1. استعلام المشاريع والتذاكر من قاعدة البيانات
  let projects = [];
  let tickets = [];
  try {
    projects = await db.all('SELECT * FROM projects');
  } catch (e) {
    console.warn('[radar] warning querying projects:', e.message);
  }

  try {
    tickets = await db.all(`
      SELECT t.*, p.name AS project_name
      FROM tickets t
      LEFT JOIN projects p ON p.id = t.project_id
    `);
  } catch (e) {
    console.warn('[radar] warning querying tickets:', e.message);
  }

  // فهرس للمشاريع لسرعة الوصول
  const projectMap = new Map();
  for (const p of projects) {
    projectMap.set(p.id, p);
    projectMap.set(p.name, p);
  }

  // 2. تحليل مخاطر المشاريع (الميزانية والجدول الزمني)
  for (const p of projects) {
    const isCompleted = p.status === 'مكتمل' || p.progress >= 100;

    // ----------------------------------------------------
    // أ) مخاطر الميزانية (Budget Risks)
    // ----------------------------------------------------
    const budget = Number(p.budget) || 0;
    const spent = Number(p.spent) || 0;
    const progressPct = Number(p.progress) || 0;
    const progressRatio = progressPct > 1 ? progressPct / 100 : progressPct;

    if (budget > 0) {
      // 1) تجاوز الميزانية المعتمدة (spent > budget)
      if (spent > budget) {
        const overrun = spent - budget;
        const overrunPct = Math.round((overrun / budget) * 100);
        risks.push({
          id: `risk-budget-overrun-${p.id}`,
          severity: 'critical',
          title: `تجاوز الميزانية المعتمدة لمشروع «${p.name}»`,
          description: `تجاوزت المصروفات الفعلية (${spent.toLocaleString()} ر.س) سقف الميزانية (${budget.toLocaleString()} ر.س) بزيادة قدرها ${overrun.toLocaleString()} ر.س (${overrunPct}% تجاوز).`,
          category: 'budget',
          impact: `عجز مالي مباشر وانكشاف تعاقدي في ميزانية قطاع ${p.department}.`,
          recommendation: `إيقاف أوامر التغيير غير المعتمدة والتحقيق في مبررات تجاوز سقف الاعتماد المالي فوراً.`,
          relatedProject: p.name,
          action: `سؤال نورة عن تفاصيل مصروفات مشروع ${p.name}`,
        });
      }
      // 2) استنزاف ميزانية مرتفع مقابل إنجاز منخفض (spent / budget > 0.9 while progress < 0.7)
      else if ((spent / budget) > 0.9 && progressRatio < 0.7) {
        const spendPct = Math.round((spent / budget) * 100);
        risks.push({
          id: `risk-budget-burn-${p.id}`,
          severity: (spent / budget) >= 0.95 ? 'critical' : 'warning',
          title: `استنزاف مبكر للميزانية في مشروع «${p.name}»`,
          description: `تم صرف ${spendPct}% من الميزانية المخصصة (${spent.toLocaleString()} من ${budget.toLocaleString()} ر.س) بينما نسبة الإنجاز بلغت ${Math.round(progressRatio * 100)}% فقط.`,
          category: 'budget',
          impact: `خطر نفاد المخصص المالي قبل تسليم المخرجات الأساسية مما يهدد بتعثر المشروع.`,
          recommendation: `إجراء مراجعة للقيمة المكتسبة (EV) وحساب تكلفة إكمال المشروع (ETC) وضبط وتيرة الصرف.`,
          relatedProject: p.name,
          action: `استدعاء تقرير التحليل المالي لمشروع ${p.name}`,
        });
      }
    }

    // ----------------------------------------------------
    // ب) مخاطر الجدول الزمني (Timeline Risks)
    // ----------------------------------------------------
    if (!isCompleted) {
      // 1) مشروع متوقف رسمياً
      if (p.status === 'متوقف') {
        risks.push({
          id: `risk-timeline-halted-${p.id}`,
          severity: 'critical',
          title: `توقف العمل كلياً في مشروع «${p.name}»`,
          description: `المشروع معلق ومتوقف رسمياً بنسبة إنجاز ${progressPct}% وميزانية معطلة قدرها ${budget.toLocaleString()} ر.س.`,
          category: 'timeline',
          impact: `تجميد الأصول والجهود التقنية وتأخر استراتيجية التحول الرقمي بإدارة ${p.department}.`,
          recommendation: `عقد جلسة حسم على مستوى الإدارة العليا لتفكيك العوائق أو إنهاء العقد وتصفية المستحقات.`,
          relatedProject: p.name,
          action: `سؤال نورة عن أسباب توقف مشروع ${p.name}`,
        });
      }

      // حساب المواعيد والمدد
      const hasDueDate = Boolean(p.due_date);
      const dueDate = hasDueDate ? new Date(p.due_date) : null;
      const dueMs = dueDate ? dueDate.getTime() : null;

      const hasStartDate = Boolean(p.start_date);
      const startDate = hasStartDate ? new Date(p.start_date) : null;
      const startMs = startDate ? startDate.getTime() : null;

      // 2) مشروع متأخر عن موعد التسليم (Overdue)
      if (dueMs && dueMs < nowMs) {
        const daysOverdue = Math.max(1, Math.floor((nowMs - dueMs) / (1000 * 60 * 60 * 24)));
        risks.push({
          id: `risk-timeline-overdue-${p.id}`,
          severity: 'critical',
          title: `مشروع متجاوز للموعد النهائي للتسليم: «${p.name}»`,
          description: `انتهى التاريخ المحدد للمشروع في ${p.due_date} (متأخر منذ ${daysOverdue} يوماً) وما زالت نسبة الإنجاز ${progressPct}% فقط.`,
          category: 'timeline',
          impact: `تأخر تسليم المخرجات التشغيلية وإخلال بالتزامات إدارة ${p.department}.`,
          recommendation: `إلزام مدير المشروع (${p.owner}) بوضع خطة تسليم حرجة ومكثفة لتدارك التأخير وإطلاق النسخة الأولية.`,
          relatedProject: p.name,
          action: `سؤال نورة عن أسباب تأخر تسليم مشروع ${p.name}`,
        });
      }
      // 3) elapsed time > progress + 20%
      else if (startMs && dueMs && dueMs > startMs) {
        const totalDuration = dueMs - startMs;
        const elapsedDuration = Math.max(0, nowMs - startMs);
        const elapsedRatio = Math.min(1.0, elapsedDuration / totalDuration);
        const elapsedPct = Math.round(elapsedRatio * 100);

        if (elapsedPct > progressPct + 20) {
          const gap = elapsedPct - progressPct;
          const severity = (gap >= 35 || elapsedPct >= 80 || p.status === 'متأخر') ? 'critical' : 'warning';
          risks.push({
            id: `risk-timeline-slippage-${p.id}`,
            severity,
            title: `انحراف في وتيرة تنفيذ مشروع «${p.name}»`,
            description: `مضى ${elapsedPct}% من زمن المشروع المحدد بينما نسبة الإنجاز لم تتجاوز ${progressPct}% (فجوة تأخر زمني بمقدار ${gap}%).`,
            category: 'timeline',
            impact: `احتمالية مرتفعة لتعثر المشروع وعدم اللحاق بموعد التسليم المحدد في ${p.due_date}.`,
            recommendation: `إعادة ترتيب الأولويات والتركيز على حزمة الأعمال الحرجة وزيادة الطاقة الاستيعابية لفريق العمل.`,
            relatedProject: p.name,
            action: `استدعاء تقرير الإنجاز والمسار الحرج لمشروع ${p.name}`,
          });
        }
      }
    }
  }

  // ----------------------------------------------------
  // ج) التذاكر الحرجة والمتقادمة (Critical Tickets)
  // ----------------------------------------------------
  for (const t of tickets) {
    const isClosed = t.status === 'مغلقة' || t.status === 'منتهية';
    if (isClosed) continue;

    const isHighOrCritical = t.priority === 'عالية' || t.priority === 'حرجة' || t.priority === 'critical' || t.priority === 'high';
    const isOpen = t.status === 'مفتوحة' || t.status === 'جديدة';

    // حساب تقادم التذكرة
    let ageDays = 0;
    if (t.created_at) {
      const createdMs = new Date(t.created_at).getTime();
      if (!isNaN(createdMs)) {
        ageDays = Math.max(0, Math.floor((nowMs - createdMs) / (1000 * 60 * 60 * 24)));
      }
    }

    if (isHighOrCritical || ageDays >= 14) {
      const severity = (isHighOrCritical && isOpen) || ageDays >= 14 ? 'critical' : 'warning';
      const projName = t.project_name || (projectMap.get(t.project_id)?.name) || 'غير محدد';

      risks.push({
        id: `risk-ticket-${t.id}`,
        severity,
        title: `تذكرة معلّقة ذات أولوية مرتفعة: «${t.title}»`,
        description: `تذكرة برتبة «${t.priority}» وحالة «${t.status}» مسجلة على مشروع «${projName}»${ageDays > 0 ? ` منذ ${ageDays} يوماً` : ''}.`,
        category: 'timeline',
        impact: `تعطيل إحدى العمليات الأساسية للمشروع واحتمال التأثير سلباً على المستفيدين النهائيين.`,
        recommendation: `إسناد التذكرة فوراً لمهندس مختص مع فرض حد أقصى للحل لا يتجاوز 24 ساعة.`,
        relatedProject: projName,
        action: `سؤال نورة عن تفاصيل التذكرة #${t.id}`,
      });
    }
  }

  // ----------------------------------------------------
  // د) ملفات مكتبة المعرفة (Auto-DK) ومحاذير الجودة والتناقضات
  // ----------------------------------------------------
  let knowledgeEntries = [];
  try {
    knowledgeEntries = await kList();
  } catch (e) {
    console.warn('[radar] warning querying knowledge catalog:', e.message);
  }

  for (const entry of knowledgeEntries || []) {
    const caveats = Array.isArray(entry.quality_pending) ? entry.quality_pending : [];

    // 1) محاذير جودة غير مدققة (Quality Caveats)
    if (caveats.length > 0) {
      const hasCriticalAlerts = caveats.some(c =>
        /(?:عجز|تناقض|تعارض|فارق|خطأ|تضارب|تجاوز|انحراف|غير مطابق|غير دقيق)/i.test(c)
      );
      risks.push({
        id: `risk-quality-${entry.id}`,
        severity: hasCriticalAlerts ? 'critical' : 'warning',
        title: `محاذير جودة وتحفظات بيانات في «${entry.title}»`,
        description: `يتضمن المستند ${caveats.length} ملاحظات جودة غير مدققة: ${caveats.slice(0, 3).join('؛ ')}`,
        category: 'quality',
        impact: `الاعتماد على بيانات غير مؤكدة قد يقود لقرارات خاطئة أو بناء خطط على فرضيات غير صحيحة.`,
        recommendation: `إلزام الإدارة المصدرة بمراجعة الملاحظات واعتماد نسخة منقحة ومطابقة.`,
        relatedProject: findMatchingProject(entry.title, projects)?.name || null,
        action: `سؤال نورة عن محاذير جودة ملف ${entry.title}`,
      });
    }

    // 2) فحص التناقضات بين الملفات وقاعدة البيانات (Data Discrepancies)
    // أ. فحص صريح في نصوص التحفظات أو ملخص الملف
    const combinedNotes = `${caveats.join(' ')} ${entry.summary || ''}`;
    if (/(?:تناقض|تعارض|تضارب|فارق غير مبرر|غير مطابق لقاعدة البيانات)/i.test(combinedNotes)) {
      risks.push({
        id: `risk-data-conflict-${entry.id}`,
        severity: 'critical',
        title: `تناقض بيانات مرصود في ملف «${entry.title}»`,
        description: `أظهرت المراجعة وجود تعارض أو عدم تطابق في الأرقام الواردة في المستند: ${caveats[0] || entry.summary?.slice(0, 160)}`,
        category: 'data',
        impact: `تضارب المخرجات الإحصائية والتقارير التنفيذية الصادرة للإدارة العليا.`,
        recommendation: `مطابقة أرقام المستند فوراً مع السجلات المحاسبية وقواعد البيانات التشغيلية.`,
        relatedProject: findMatchingProject(entry.title, projects)?.name || null,
        action: `سؤال نورة عن تناقضات بيانات ملف ${entry.title}`,
      });
    }

    // ب. مطابقة متقاطعة بين جداول/بيانات المستند ومشاريع قاعدة البيانات
    await crossCheckDocumentWithProjects(entry, projects, risks);
  }

  // ترتيب المخاطر تصاعدياً حسب الأولوية (critical أولاً ثم warning ثم info)
  risks.sort((a, b) => {
    const sa = SEVERITY_ORDER[a.severity] ?? 99;
    const sb = SEVERITY_ORDER[b.severity] ?? 99;
    if (sa !== sb) return sa - sb;
    return a.id.localeCompare(b.id);
  });

  return risks;
}

/**
 * يبحث عن مشروع مطابق لاسم أو محتوى المستند
 */
function findMatchingProject(title, projects) {
  const normTitle = normalizeText(title);
  for (const p of projects) {
    const normName = normalizeText(p.name);
    if (normTitle.includes(normName) || normName.includes(normTitle)) {
      return p;
    }
  }
  return null;
}

/**
 * مطابقة متقدمة بين جداول وأقسام المستند وأرقام المشاريع في قاعدة البيانات
 */
async function crossCheckDocumentWithProjects(entry, projects, risks) {
  if (!projects || !projects.length) return;

  const allText = `${entry.title} ${entry.summary || ''} ${(entry.keywords || []).join(' ')} ${(entry.sections || []).map(s => s.text).join(' ')}`;
  const normAllText = normalizeText(allText);

  // جمع الجداول المتاحة سواء المخزنة مباشرة في entry أو في جدول datasets
  const tables = [];
  if (Array.isArray(entry.tables)) {
    tables.push(...entry.tables);
  }
  if (Array.isArray(entry.dataset_ids) && entry.dataset_ids.length > 0) {
    for (const dsId of entry.dataset_ids) {
      try {
        const ds = await datasetGet(dsId);
        if (ds && ds.columns && ds.rows) {
          tables.push({ sheet: ds.sheet, columns: ds.columns, rows: ds.rows });
        }
      } catch {}
    }
  }

  for (const p of projects) {
    const normPName = normalizeText(p.name);
    const mentionsProject = normAllText.includes(normPName);

    // 1. فحص في الجداول
    for (const t of tables) {
      const colNames = (t.columns || []).map(c => normalizeText(c));
      const projColIdx = colNames.findIndex(c => c.includes('مشروع') || c.includes('اسم'));
      const budgetColIdx = colNames.findIndex(c => c.includes('ميزاني') || c.includes('معتمد') || c.includes('مبلغ') || c.includes('تكلف'));
      const progColIdx = colNames.findIndex(c => c.includes('انجاز') || c.includes('نسب'));

      if (projColIdx !== -1 && (budgetColIdx !== -1 || progColIdx !== -1) && Array.isArray(t.rows)) {
        for (const row of t.rows) {
          const rowProjName = normalizeText(row[projColIdx]);
          if (!rowProjName.includes(normPName) && !normPName.includes(rowProjName)) continue;

          // فحص ميزانية الجدول مقابل ميزانية المشروع في قاعدة البيانات
          if (budgetColIdx !== -1) {
            const docBudget = parseArabicOrLatinNumber(row[budgetColIdx]);
            if (docBudget !== null && p.budget > 0 && Math.abs(docBudget - p.budget) > 1000) {
              const diff = Math.abs(docBudget - p.budget);
              risks.push({
                id: `risk-data-budget-mismatch-${p.id}-${entry.id}`,
                severity: 'critical',
                title: `تناقض في ميزانية «${p.name}» بين المستند وقاعدة البيانات`,
                description: `الملف «${entry.title}» يذكر ميزانية بقيمة ${docBudget.toLocaleString()} ر.س بينما المسجل رسمياً في النظام ${p.budget.toLocaleString()} ر.س (فارق: ${diff.toLocaleString()} ر.س).`,
                category: 'data',
                impact: `تضارب الموازنات التنفيذية وانكشاف حسابي في التقارير الإدارية.`,
                recommendation: `إجراء مطابقة مالية بين بيانات المستند وقاعدة بيانات المشاريع واعتماد الرقم الصحيح.`,
                relatedProject: p.name,
                action: `سؤال نورة عن تناقض ميزانية مشروع ${p.name}`,
              });
            }
          }

          // فحص نسبة الإنجاز
          if (progColIdx !== -1) {
            const docProg = parseArabicOrLatinNumber(row[progColIdx]);
            if (docProg !== null && Math.abs(docProg - p.progress) >= 15) {
              risks.push({
                id: `risk-data-prog-mismatch-${p.id}-${entry.id}`,
                severity: 'warning',
                title: `تباين في نسبة إنجاز «${p.name}» بين التقرير والنظام`,
                description: `يذكر ملف «${entry.title}» نسبة إنجاز ${docProg}% بينما يظهر في النظام ${p.progress}%.`,
                category: 'data',
                impact: `تقدير غير دقيق لتقدم المشروع الحقيقي يربك اتخاذ القرارات التنفيذية.`,
                recommendation: `طلب تحديث ميداني معتمد من مدير المشروع لتأكيد نسبة الإنجاز الصحيحة.`,
                relatedProject: p.name,
                action: `استدعاء تقرير الإنجاز ومطابقته مع نورة`,
              });
            }
          }
        }
      }
    }

    // 2. فحص في نصوص الأقسام أو الملخص إذا ذكرت أرقام ميزانية صريحة متناقضة مع DB
    if (mentionsProject) {
      const matchBudget = allText.match(new RegExp(`${p.name}[^\\n.]{0,80}(?:ميزانية|مبلغ|تكلفة)[^\\d]{0,20}([\\d,]+)`, 'i'))
        || allText.match(new RegExp(`(?:ميزانية|مبلغ|تكلفة)[^\\n.]{0,40}${p.name}[^\\d]{0,20}([\\d,]+)`, 'i'));
      if (matchBudget) {
        const val = parseArabicOrLatinNumber(matchBudget[1]);
        if (val && p.budget > 0 && Math.abs(val - p.budget) > 1000) {
          const exists = risks.some(r => r.id === `risk-data-budget-mismatch-${p.id}-${entry.id}`);
          if (!exists) {
            risks.push({
              id: `risk-data-budget-mismatch-${p.id}-${entry.id}`,
              severity: 'critical',
              title: `تناقض في ميزانية «${p.name}» بين المستند وقاعدة البيانات`,
              description: `المستند «${entry.title}» يذكر ميزانية بقيمة ${val.toLocaleString()} ر.س بينما المسجل في النظام ${p.budget.toLocaleString()} ر.س.`,
              category: 'data',
              impact: `تضارب الموازنات التنفيذية وانكشاف حسابي في التقارير الإدارية.`,
              recommendation: `إجراء مطابقة مالية بين بيانات المستند وقاعدة بيانات المشاريع واعتماد الرقم الصحيح.`,
              relatedProject: p.name,
              action: `سؤال نورة عن تناقض ميزانية مشروع ${p.name}`,
            });
          }
        }
      }
    }
  }
}

/**
 * أداة فحص رادار المخاطر المتاحة لنورة ولموديل الذكاء الاصطناعي
 */
export const check_risk_radar = {
  declaration: {
    name: 'check_risk_radar',
    description: 'رادار المخاطر والتناقضات التنفيذية: يفحص تلقائياً تعثر المشاريع، انحرافات الجدول الزمني، تجاوز الميزانيات، التذاكر الحرجة، والتناقضات بين الملفات وقاعدة البيانات.',
    parameters: {
      type: 'OBJECT',
      properties: {
        category: {
          type: 'STRING',
          enum: ['all', 'budget', 'timeline', 'data', 'quality'],
          description: 'تصفية حسب نوع الخطر (اختياري: all, budget, timeline, data, quality)',
        },
        severity: {
          type: 'STRING',
          enum: ['all', 'critical', 'warning', 'info'],
          description: 'تصفية حسب مستوى الخطورة (اختياري: all, critical, warning, info)',
        },
      },
    },
  },
  run: async ({ category = 'all', severity = 'all' } = {}) => {
    const allRisks = await analyzeExecutiveRisks();
    let filtered = allRisks;

    if (category && category !== 'all') {
      filtered = filtered.filter(r => r.category === category);
    }
    if (severity && severity !== 'all') {
      filtered = filtered.filter(r => r.severity === severity);
    }

    const critical_count = allRisks.filter(r => r.severity === 'critical').length;
    const warning_count = allRisks.filter(r => r.severity === 'warning').length;
    const info_count = allRisks.filter(r => r.severity === 'info').length;

    return {
      summary: `رصد رادار المخاطر ${critical_count} مخاطر حرجة و ${warning_count} تحذيرات من إجمالي ${allRisks.length} عنصراً.`,
      total_risks: allRisks.length,
      filtered_count: filtered.length,
      critical_count,
      warning_count,
      info_count,
      risks: filtered,
    };
  },
};
