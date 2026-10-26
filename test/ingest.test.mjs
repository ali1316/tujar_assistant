// اختبار محلي لمسار PDF بمحرك رؤية وهمي (يقرأ طبقة النص) — يختبر الآليات لا جودة Gemini:
// التخزين، البصمة والإصدارات، عدم التكرار، الاستكمال بعد انقطاع، ضم الجدول الممتد، تحقق المجموع، الحزمة، التتبع.
// التشغيل: node test/ingest.test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nora-ingest-'));
process.env.INGEST_STORAGE = 'local'; process.env.INGEST_LOCAL_DIR = dir; delete process.env.DATABASE_URL;
process.env.DB_PATH = path.join(dir, 'test.db');
const { initStore } = await import('../store.js');
await initStore();
const P = await import('../ingest/pipeline.js');
const Q = await import('../ingest/query.js');
const { PDFDocument } = await import('pdf-lib');

const pdf = fs.readFileSync(new URL('./fixtures/sample-ar-stats.pdf', import.meta.url));
const truth = JSON.parse(fs.readFileSync(new URL('./fixtures/sample-ar-stats.truth.json', import.meta.url)));

// محرك وهمي: يحوّل أسطر طبقة النص إلى كتل وجداول بنفس عقد Gemini
P._setTestEngine(async (buf, p) => {
  const lines = p.text_layer.split('\n');
  const rowRe = /^(غرفة .+?|الإجمالي)\s+([\d,]+)\s+(\d+%|—)$/;
  const rows = lines.filter(l => rowRe.test(l)).map(l => { const m = l.match(rowRe); return [m[1], m[2], m[3]]; });
  const tables = rows.length ? [{ title: p.page === 1 ? 'جدول 1: الخدمات المنفذة حسب الغرفة' : '', caption: '', units: 'عدد الخدمات', notes: [], continues_from_previous: p.page === 2, continues_on_next: p.page === 1,
    header_rows: [], columns: [{ name: 'الغرفة', unit: '' }, { name: 'عدد الخدمات', unit: '' }, { name: 'نسبة الإنجاز (%)', unit: '%' }], rows, row_kinds: rows.map(r => (r[0] === 'الإجمالي' ? 'total' : 'detail')), bbox: [] }] : [];
  const blocks = lines.filter(l => !rowRe.test(l)).map(l => ({ type: /^\d[()]/.test(l) ? 'footnote' : /^(تقرير|جدول|شكل)/.test(l) ? 'heading' : 'paragraph', text: l, bbox: [] }));
  const charts = p.page === 3 ? [{ title: 'شكل 1: توزيع الخدمات حسب النوع', chart_type: 'bar', x_label: 'النوع', y_label: '', unit: 'خدمة', period: '', notes: '', bbox: [],
    points: [{ series: '', category: 'التصديق', value_text: '18,000', value_source: 'written' }, { series: '', category: 'العضوية', value_text: '9,000', value_source: 'written' }, { series: '', category: 'التصاريح', value_text: '4,500', value_source: 'estimated' }] }] : [];
  const problems = p.kind === 'scanned' ? [{ element: 'الصفحة كاملة', reason: 'المحرك الوهمي لا يقرأ الصور' }] : [];
  return { engine: 'test', engine_detail: 'mock from text layer', printed_page_number: String(p.page), observed_kind: p.kind, report_date: '', data_period: p.page === 1 ? 'الربع الثالث 2026م' : '', blocks, tables, charts, images: [], problems };
});

const wait = async (att) => { for (let i = 0; i < 200; i++) { const j = await P.getJob(att); if (['ready', 'partial', 'failed'].includes(j.stage)) return j; await new Promise(r => setTimeout(r, 100)); } throw new Error('timeout'); };
const results = [];
const ok = (name, cond, detail = '') => { results.push({ name, pass: !!cond, detail }); console.log(`${cond ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); };

// 1) رفع + انقطاع متعمد بعد صفحة واحدة ثم استكمال
P._interruptAfterPages(1);
const r1 = await P.receive({ buffer: pdf, fileName: 'تقرير الخدمات الاختباري.pdf' });
await new Promise(r => setTimeout(r, 800));
let j = await P.getJob(r1.attempt_id);
ok('انقطاع: المهمة توقفت في «استخراج» بعد صفحة', j.stage === 'extracting' && Object.keys(j.page_results).length >= 1, `${j.stage}, ${Object.keys(j.page_results).length} صفحة`);
const donePages = Object.keys(j.page_results).length;
P.kick(r1.attempt_id);
j = await wait(r1.attempt_id);
ok('استكمال: انتهت بدون إعادة الصفحات المنجزة', ['ready', 'partial'].includes(j.stage), `${j.stage}; صفحات قبل الانقطاع ${donePages}`);

// 2) الحزمة
const base = path.join(dir, r1.document_id, 'v1');
const need = ['original.pdf', 'manifest.json', 'metadata.json', 'document.md', 'metrics.jsonl', 'data_dictionary.json', 'lineage.jsonl', 'quality_report.json', 'quality_report.md', 'dashboard_catalog.json', 'review.xlsx', 'pages', 'tables', 'datasets'];
const have = fs.readdirSync(base);
ok('الحزمة: كل الملفات المطلوبة موجودة', need.every(f => have.includes(f)), need.filter(f => !have.includes(f)).join(', '));
ok('الأصل محفوظ بدون تعديل', fs.readFileSync(path.join(base, 'original.pdf')).equals(pdf));
ok('manifest المستند يشير للإصدار 1', JSON.parse(fs.readFileSync(path.join(dir, r1.document_id, 'manifest.json'))).current_version === 1);

// 3) الجدول الممتد + المجموع
const data = await P.getData(r1.version_id);
const t = data.tables[0];
ok('جدول ممتد عبر صفحتين ضُم كجدول واحد', t.pages.length === 2 && data.datasets[0].rows.filter(r => r.kind === 'detail').length === truth.rows, `صفحات ${t.pages}، صفوف ${data.datasets[0].rows.length}`);
const tot = data.checks.find(c => c.type === 'total');
ok('مجموع التفاصيل يطابق الإجمالي المطبوع', tot?.result === 'pass', tot?.detail);

// 4) أسئلة: فقرة، حاشية، جدول، مجموع محسوب، تفصيل غير موجود، تتبع
const para = await Q.tools.pdf_find_value.run({ query: 'المستخدمين النشطين' });
ok('قيمة داخل فقرة', para.matches?.some(m => m.value === truth.active_users), JSON.stringify(para.matches?.[0]?.raw));
const foot = await Q.tools.pdf_find_value.run({ query: 'الربع الثاني البالغ' });
ok('قيمة داخل حاشية', foot.matches?.some(m => m.value === truth.prev_quarter && m.source_type === 'footnote'));
const cell = await Q.tools.pdf_find_value.run({ query: 'غرفة جدة عدد الخدمات' });
ok('قيمة داخل جدول', cell.matches?.some(m => m.value === 1137 && m.source_type === 'table'));
const sum = await Q.tools.pdf_metric.run({ dataset: data.datasets[0].id, measure: 'عدد الخدمات', agg: 'sum' });
ok('مجموع محسوب بالكود يطابق المصدر', sum.value === truth.total && sum.matches_printed_total === true, `${sum.value} مقابل ${truth.total}`);
const missing = await Q.tools.pdf_metric.run({ dataset: data.datasets[0].id, measure: 'عدد الخدمات', agg: 'sum', filters: [{ column: 'الشهر', value: 'يوليو' }] });
ok('تفصيل غير موجود: يرفض بدل الاختلاق', missing.available === false, missing.message);
const est = await Q.tools.pdf_find_value.run({ query: 'التصاريح' });
ok('قيمة رسم مقدّرة لا تُستخدم في المؤشرات', est.matches?.every(m => m.usable_for_metrics === false || m.source_type !== 'chart'));
const tr = await Q.tools.pdf_trace.run({ record_id: cell.matches.find(m => m.value === 1137).record_id });
ok('تتبع رقم إلى موضعه في PDF', tr.page === 1 && /جدول/.test(tr.location) && tr.raw === '1,137', `${tr.location}`);

// 5) إعادة رفع نفس الملف (باسم مختلف) = لا تكرار
const r2 = await P.receive({ buffer: pdf, fileName: 'نسخة أخرى.pdf' });
ok('إعادة رفع نفس الملف لا تكرر المعالجة', r2.duplicate === true && r2.version_id === r1.version_id);

// 6) محتوى مختلف بنفس الاسم = إصدار جديد، والسابق يبقى
const d2 = await PDFDocument.load(pdf); d2.setTitle('نسخة معدلة'); const pdf2 = Buffer.from(await d2.save());
const r3 = await P.receive({ buffer: pdf2, fileName: 'تقرير الخدمات الاختباري.pdf' });
await wait(r3.attempt_id);
ok('محتوى مختلف = إصدار جديد بنفس المستند', r3.document_id === r1.document_id && r3.version === 2);
ok('الإصدار السابق محفوظ وقابل للرجوع', fs.existsSync(path.join(dir, r1.document_id, 'v1', 'metadata.json')));

// 7) جلسة جديدة: نمسح الكاش ونعيد البناء من الحزمة
const { kvSet } = await import('../store.js');
await kvSet(`ingest:data:${r1.version_id}`, null);
const again = await P.getData(r1.version_id);
ok('بعد ضياع الكاش: البيانات تُقرأ من الحزمة بدون إعادة تحليل', again?.rebuilt_from_storage === true && again.datasets.length === data.datasets.length);

// 8) جدول بلوحتين متجاورتين بنفس الأعمدة (حالة حقيقية من تقرير تجار ص6): لا تضيع اللوحة الثانية
const { unstackRepeated } = await import('../ingest/organize.js');
const two = unstackRepeated({ columns: ['الغرفة', 'المستخدمون', 'الغرفة', 'المستخدمون'].map(name => ({ name })), rows: [['أ', '10', 'ج', '3'], ['ب', '7', 'الإجمالي', '20']], row_kinds: ['detail', 'detail'], header_rows: [] });
ok('جدول بلوحتين متجاورتين يُفك إلى صفوف بدون فقد', two.columns.length === 2 && two.rows.length === 4 && two.rows.map(r => r[0]).join(',') === 'أ,ب,ج,الإجمالي', JSON.stringify(two.rows));

// 9) إعادة معالجة صريحة: إصدار جديد من نفس الأصل، والسابق يبقى
const r4 = await P.reprocess(r1.version_id);
await wait(r4.attempt_id);
ok('إعادة المعالجة تنشئ إصداراً جديداً وتبقي السابق', r4.duplicate === false && r4.version === 3 && fs.existsSync(path.join(dir, r1.document_id, 'v1', 'metadata.json')), `v${r4.version}`);

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed · storage: ${dir}`);
fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify(results, null, 1));
process.exit(failed.length ? 1 : 0);
