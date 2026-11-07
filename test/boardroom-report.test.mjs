// test/boardroom-report.test.mjs
// اختبارات وحدة وتكامل لميزة تقرير المجلس التنفيذي (تقرير المعالي)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { generateExecutiveReport, generate_executive_report } from '../src/executive/report.js';

// 1. فحص توليد ملف PDF التنفيذي والتحقق من الترويسة والحجم
test('generateExecutiveReport generates a valid PDF buffer with %PDF- header and size > 1KB', async () => {
  const result = await generateExecutiveReport({
    title: 'تقرير مجلس الإدارة التنفيذي · التحول الرقمي',
  });

  assert.equal(result.success, true);
  assert.ok(result.pdfBuffer, 'pdfBuffer must be present');
  assert.ok(
    Buffer.isBuffer(result.pdfBuffer) || result.pdfBuffer instanceof Uint8Array,
    'pdfBuffer must be a Buffer or Uint8Array'
  );

  // التحقق من ترويسة ملفات الـ PDF القياسية
  const header = result.pdfBuffer.slice(0, 5).toString('ascii');
  assert.equal(header, '%PDF-', `PDF must start with %PDF-, got: ${header}`);

  // التحقق من أن الحجم يتجاوز 1 كيلوبايت (1024 بايت)
  assert.ok(
    result.pdfBuffer.length > 1024,
    `PDF size must be > 1KB (1024 bytes), got: ${result.pdfBuffer.length} bytes`
  );
});

// 2. فحص تنسيق موجز واتساب وملاءمته لرؤساء الغرف والوزراء
test('generateExecutiveReport generates rich WhatsApp Markdown text with emojis, KPIs and 2030 branding', async () => {
  const result = await generateExecutiveReport({
    title: 'تقرير المعالي التنفيذي',
  });

  const text = result.whatsappText;
  assert.ok(typeof text === 'string' && text.length > 50, 'whatsappText must be a non-empty string');

  // الهوية والمؤشرات ورؤية 2030
  assert.match(text, /اتحاد الغرف السعودية/, 'Must contain Federation identity');
  assert.match(text, /منصة تُجّار/, 'Must contain Tujar Platform identity');
  assert.match(text, /رؤية المملكة 2030/, 'Must contain Saudi Vision 2030 accent');
  assert.match(text, /المؤشرات القيادية الرئيسية/, 'Must contain KPIs section');
  assert.match(text, /رادار المخاطر/, 'Must contain risk radar section');
  assert.match(text, /موقف المشاريع الميدانية/, 'Must contain field projects status');
  assert.match(text, /\/api\/executive\/report\/pdf/, 'Must include PDF download reference');

  // الأرقام والرموز التعبيرية
  assert.match(text, /🏛️|📊|🇸🇦|📌|🚦|📈/, 'Must contain executive boardroom emojis');
  assert.match(text, /ر\.س/, 'Must format currency in Saudi Riyal');

  // البيانات الوصفية (Metadata)
  assert.ok(result.metadata, 'metadata must be present');
  assert.equal(result.metadata.title, 'تقرير المعالي التنفيذي');
  assert.ok(result.metadata.stats, 'metadata.stats must be present');
  assert.ok(typeof result.metadata.stats.total_projects === 'number');
  assert.ok(typeof result.metadata.stats.avg_progress === 'number');
  assert.ok(Array.isArray(result.metadata.risk_radar));
});

// 3. فحص فلترة التقرير
test('generateExecutiveReport respects filters for status or department', async () => {
  const filtered = await generateExecutiveReport({
    title: 'تقرير المشاريع المتأخرة فقط',
    filter: { status: 'متأخر' },
  });

  assert.equal(filtered.success, true);
  assert.equal(filtered.metadata.stats.total_projects, 1);
  assert.equal(filtered.metadata.stats.delayed_projects, 1);
  assert.match(filtered.whatsappText, /أتمتة رخص البناء/);
});

// 4. فحص تعريف وأداء أداة الذكاء الاصطناعي (AI Tool Definition)
test('generate_executive_report tool is properly declared and executes successfully', async () => {
  assert.equal(generate_executive_report.declaration.name, 'generate_executive_report');
  assert.ok(generate_executive_report.declaration.description.length > 10);
  assert.ok(generate_executive_report.declaration.parameters);
  assert.equal(typeof generate_executive_report.run, 'function');

  // تشغيل الأداة والتأكد من النتائج
  const runRes = await generate_executive_report.run({ title: 'تقرير المعالي التجريبي' });
  assert.equal(runRes.success, true);
  assert.ok(typeof runRes.whatsappText === 'string');
  assert.ok(typeof runRes.metadata === 'object');
  assert.equal(runRes.downloadUrl, '/api/executive/report/pdf');

  // التأكد من تسجيلها في سجل الأدوات العام
  const { tools } = await import('../src/tools/registry.js');
  assert.ok(tools.generate_executive_report, 'generate_executive_report must be registered in src/tools/registry.js');
});

// 5. فحص مسارات الـ API (/api/executive/report و /api/executive/report/pdf)
test('Executive report API endpoints respond correctly', async () => {
  const { app } = await import('../server.js');

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    // 5.1 POST /api/executive/report
    const postRes = await fetch(`${baseUrl}/api/executive/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'تقرير مجلس الإدارة لشهر نوفمبر' }),
    });

    assert.equal(postRes.status, 200, `POST /api/executive/report failed with ${postRes.status}`);
    const postData = await postRes.json();
    assert.ok(postData.whatsappText, 'Response must include whatsappText');
    assert.ok(postData.metadata, 'Response must include metadata');
    assert.equal(postData.downloadUrl, '/api/executive/report/pdf');
    assert.equal(postData.metadata.title, 'تقرير مجلس الإدارة لشهر نوفمبر');

    // 5.2 GET /api/executive/report/pdf
    const getPdfRes = await fetch(`${baseUrl}/api/executive/report/pdf`);
    assert.equal(getPdfRes.status, 200, `GET /api/executive/report/pdf failed with ${getPdfRes.status}`);

    // التحقق من ترويسات الاستجابة
    const contentType = getPdfRes.headers.get('content-type');
    assert.match(contentType, /application\/pdf/, 'Content-Type must be application/pdf');

    const contentDisposition = getPdfRes.headers.get('content-disposition');
    assert.match(contentDisposition, /attachment/, 'Content-Disposition must be attachment');
    assert.match(contentDisposition, /\.pdf/, 'Content-Disposition must specify a .pdf filename');

    // التحقق من المحتوى الثنائي لملف PDF
    const arrayBuffer = await getPdfRes.arrayBuffer();
    const pdfBuf = Buffer.from(arrayBuffer);
    assert.ok(pdfBuf.length > 1024, `Streamed PDF size must be > 1KB, got: ${pdfBuf.length}`);
    const pdfSig = pdfBuf.slice(0, 5).toString('ascii');
    assert.equal(pdfSig, '%PDF-', `Streamed content must start with %PDF-, got: ${pdfSig}`);
  } finally {
    server.close();
  }
});
