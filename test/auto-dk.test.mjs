import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as XLSX from 'xlsx';
import { generateAutoDK, synthesizeMock, _setSynthesisEngine } from '../src/ingest/auto-dk.js';
import { importBundle, kList, knowledgeCatalog, qualityNote, resetKnowledgeCache } from '../knowledge.js';
import { datasetGet, kvSet } from '../store.js';
import { handleFileUpload } from '../src/routes/upload.js';

test('Auto-DK: Bundle schema validity (fawaz-dk-bundle/1 and ds-xxxxxxxx)', async () => {
  const sampleText = `تقرير الأداء السنوي لعام 2026
بلغت الميزانية المعتمدة 5,300,000 ريال، ونسبة الإنجاز الكلية 88%.
حاشية 1: الأرقام خاضعة للمراجعة النهائية من قبل الإدارة المالية.`;

  const bundle = await generateAutoDK({
    text: sampleText,
    fileName: 'تقرير_الأداء_2026.txt',
    mimeType: 'text/plain',
  });

  // 1. Schema format & version
  assert.equal(bundle.format, 'fawaz-dk-bundle/1', 'Must match format fawaz-dk-bundle/1');
  assert.equal(bundle.version, 1);
  assert.equal(bundle.pipeline, 'auto-dk');
  assert.equal(bundle.status, 'جاهز');

  // 2. ID matching /^ds-[0-9a-f]{8}$/
  assert.match(bundle.id, /^ds-[0-9a-f]{8}$/, `ID ${bundle.id} must match ds-xxxxxxxx (8 hex chars)`);

  // 3. SHA-256 validity
  assert.match(bundle.sha256, /^[0-9a-f]{64}$/, 'SHA-256 must be a valid 64-character hex string');

  // 4. Semantic metadata fields
  assert.ok(typeof bundle.title === 'string' && bundle.title.length > 0, 'Title must be non-empty string');
  assert.ok(typeof bundle.purpose === 'string' && bundle.purpose.length > 0, 'Purpose must be non-empty string');
  assert.ok(typeof bundle.summary === 'string' && bundle.summary.length > 0, 'Summary must be non-empty string');
  assert.ok(Array.isArray(bundle.keywords), 'Keywords must be an array');
  assert.ok(bundle.keywords.length >= 5 && bundle.keywords.length <= 10, 'Keywords must have 5-10 items');
  assert.ok(Array.isArray(bundle.quality_pending), 'Quality pending must be an array');
  assert.ok(bundle.quality_pending.length > 0, 'Should capture the footnote caveat in sample text');

  // 5. Logical sections
  assert.ok(Array.isArray(bundle.sections), 'Sections must be an array');
  assert.ok(bundle.sections.length >= 1, 'Must have at least one logical section');
  for (const s of bundle.sections) {
    assert.equal(typeof s.n, 'number');
    assert.equal(typeof s.heading, 'string');
    assert.equal(typeof s.text, 'string');
  }
});

test('Auto-DK: Table extraction from spreadsheets (parseWorkbook)', async () => {
  // Create workbook with 2 sheets
  const wb = XLSX.utils.book_new();

  const ws1Data = [
    ['المنطقة', 'المبيعات', 'المستهدف'],
    ['الوسطى', 15000, 20000],
    ['الغربية', 12000, 15000],
    ['الشرقية', 18000, 18000],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(ws1Data);
  XLSX.utils.book_append_sheet(wb, ws1, 'مبيعات المناطق');

  const ws2Data = [
    ['المشروع', 'نسبة الإنجاز'],
    ['بوابة الرياض', '92%'],
    ['مركز جدة', '74%'],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(ws2Data);
  XLSX.utils.book_append_sheet(wb, ws2, 'المشاريع');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const bundle = await generateAutoDK({
    buffer,
    fileName: 'تقرير_المبيعات_الميدانية.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  assert.equal(bundle.kind, 'spreadsheet');
  assert.equal(bundle.tables.length, 2, 'Should extract 2 sheets');

  const t1 = bundle.tables.find(t => t.sheet === 'مبيعات المناطق');
  assert.ok(t1, 'Sheet 1 must be present');
  assert.ok(t1.csv.includes('المنطقة,المبيعات,المستهدف'), 'CSV must contain headers');
  assert.ok(t1.csv.includes('الوسطى,15000,20000'), 'CSV must contain row data');

  const t2 = bundle.tables.find(t => t.sheet === 'المشاريع');
  assert.ok(t2, 'Sheet 2 must be present');
  assert.ok(t2.csv.includes('المشروع,نسبة الإنجاز'), 'CSV must contain sheet 2 headers');

  // Verify aggregated columns and values
  assert.ok(bundle.columns.includes('المنطقة'));
  assert.ok(bundle.columns.includes('المبيعات'));
  assert.ok(bundle.columns.includes('المشروع'));
  assert.ok(bundle.values.includes('الوسطى'));
  assert.ok(bundle.values.includes('بوابة الرياض'));
});

test('Auto-DK: Synthesis logic and PDF processing', async () => {
  const pdfPath = new URL('./fixtures/sample-ar-stats.pdf', import.meta.url);
  const pdfBuffer = fs.readFileSync(pdfPath);

  const bundle = await generateAutoDK({
    buffer: pdfBuffer,
    fileName: 'sample-ar-stats.pdf',
    mimeType: 'application/pdf',
  });

  assert.match(bundle.id, /^ds-[0-9a-f]{8}$/);
  assert.equal(bundle.format, 'fawaz-dk-bundle/1');
  assert.ok(bundle.title.includes('تقرير') || bundle.title.includes('الخدمات') || bundle.title.length > 0);
  assert.ok(bundle.purpose.includes('توثيق وتحليل بيانات'));
  assert.ok(bundle.summary.includes('89,595') || bundle.summary.includes('تقرير'));
  assert.ok(bundle.keywords.length >= 5);
  assert.ok(bundle.sections.length >= 1);
});

test('Auto-DK: Custom synthesis engine injection', async () => {
  const customEngine = async ({ fileName }) => ({
    title: 'دراسة ميزانيات الابتكار 2026',
    purpose: 'تحليل توزيع ميزانيات البحث والابتكار للجهات الحكومية والخاصة.',
    summary: 'بلغ إجمالي الصرف 45,000,000 ريال بزيادة 15% عن العام المنصرم.',
    keywords: ['الابتكار', 'البحث والتطوير', 'الميزانية', 'الجهات الحكومية', 'التمويل'],
    quality_pending: ['ملاحظة: الصرف للربع الرابع تقديري قيد التدقيق النهائي.'],
    sections: [
      { n: 1, heading: 'ملخص الإنفاق', text: 'تفاصيل الإنفاق على الابتكار...' },
      { n: 2, heading: 'المحاور الاستراتيجية', text: 'توزيع الدعم على القطاعات...' },
    ],
    tables: [
      {
        sheet: 'ميزانية الابتكار',
        columns: ['الجهة', 'الميزانية المخصصة', 'المنفذ'],
        rows: [
          ['هيئة البحث', '20,000,000', '18,500,000'],
          ['الجامعات', '15,000,000', '14,000,000'],
        ],
      },
    ],
  });

  const bundle = await generateAutoDK({
    text: 'نص تجريبي لاختبار المحرك المخصص',
    fileName: 'innovation_budget.txt',
    options: { synthesisEngine: customEngine },
  });

  assert.equal(bundle.title, 'دراسة ميزانيات الابتكار 2026');
  assert.equal(bundle.purpose, 'تحليل توزيع ميزانيات البحث والابتكار للجهات الحكومية والخاصة.');
  assert.equal(bundle.quality_pending.length, 1);
  assert.equal(bundle.sections.length, 2);
  assert.equal(bundle.tables.length, 1);
  assert.equal(bundle.tables[0].sheet, 'ميزانية الابتكار');
  assert.ok(bundle.tables[0].csv.includes('هيئة البحث'));
});

test('Auto-DK: importBundle stores synthesized bundle into datasets and knowledge catalog', async () => {
  await kvSet('knowledge', { entries: [] });
  resetKnowledgeCache();

  // Create a structured dataset bundle
  const wb = XLSX.utils.book_new();
  const wsData = [
    ['القسم', 'الموازنة', 'المصروف'],
    ['تقنية المعلومات', 500000, 420000],
    ['الموارد البشرية', 250000, 230000],
    ['التسويق', 350000, 310000],
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, 'ميزانيات الأقسام');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const bundle = await generateAutoDK({
    buffer,
    fileName: 'ميزانيات_الأقسام_2026.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  // 1. Import bundle into knowledge library
  const result = await importBundle(bundle);
  assert.equal(result.status, 'imported');
  assert.equal(result.id, bundle.id);
  assert.equal(result.title, bundle.title);
  assert.ok(Array.isArray(result.dataset_ids));
  assert.equal(result.dataset_ids.length, 1, 'Should create 1 dataset in DB');

  const datasetId = result.dataset_ids[0];

  // 2. Verify dataset in database (Path A: Structured Data)
  const storedDs = await datasetGet(datasetId);
  assert.ok(storedDs, 'Dataset must be retrievable from datasets store');
  assert.equal(storedDs.sheet, 'ميزانيات الأقسام');
  const cols = Array.isArray(storedDs.columns) ? storedDs.columns : JSON.parse(storedDs.columns);
  assert.deepEqual(cols, ['القسم', 'الموازنة', 'المصروف']);
  const rows = Array.isArray(storedDs.rows) ? storedDs.rows : JSON.parse(storedDs.rows);
  assert.equal(rows.length, 3);
  assert.equal(rows[0][0], 'تقنية المعلومات');

  // 3. Verify knowledge catalog entry (Path B: Semantic Context)
  const entries = await kList();
  const entry = entries.find(e => e.id === bundle.id);
  assert.ok(entry, 'Entry must be present in knowledge catalog list');
  assert.equal(entry.title, bundle.title);
  assert.equal(entry.purpose, bundle.purpose);
  assert.equal(entry.summary, bundle.summary);
  assert.deepEqual(entry.dataset_ids, [datasetId]);

  // 4. Verify catalog display format
  const catalog = await knowledgeCatalog();
  assert.ok(catalog.includes(bundle.id), 'Catalog string must include bundle ID');
  assert.ok(catalog.includes(bundle.title), 'Catalog string must include bundle title');

  // 5. Verify qualityNote integration
  const note = await qualityNote(datasetId);
  assert.ok(note, 'Quality note should be available for the dataset');
  assert.ok(note.source.includes(bundle.id));

  // 6. Idempotency test: importing same bundle again returns 'unchanged'
  const repeat = await importBundle(bundle);
  assert.equal(repeat.status, 'unchanged');
});

test('Auto-DK: Upload flow triggers generateAutoDK and imports bundle', async () => {
  await kvSet('knowledge', { entries: [] });
  resetKnowledgeCache();

  const uid = Date.now() + Math.random().toString(36).slice(2, 7);
  const csvContent = `اسم الموظف,الراتب,القسم\nخالد_${uid},14000,المالية\nسارة,16000,التقنية\nعمر,12000,العمليات`;
  const buffer = Buffer.from(csvContent, 'utf8');

  let responseData = null;
  let responseStatus = 200;

  const req = {
    file: {
      originalname: `بيانات_الموظفين_${uid}.csv`,
      mimetype: 'text/csv',
      size: buffer.length,
      buffer,
    },
    get: () => 'trace-autodk-test-123',
  };

  const res = {
    status(code) {
      responseStatus = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    },
  };

  await handleFileUpload(req, res);

  assert.equal(responseStatus, 200);
  assert.ok(responseData, 'Upload response must be returned');
  assert.ok(responseData.id, 'Document ID must be present');
  assert.ok(responseData.knowledge, 'Knowledge result must be present in upload response');
  assert.equal(responseData.knowledge.status, 'imported');

  // Verify that the entry was stored in knowledge catalog
  const entries = await kList();
  const entry = entries.find(e => e.id === responseData.knowledge.id);
  assert.ok(entry, 'Auto-DK bundle must be in knowledge catalog after upload');
  assert.ok(entry.title.includes('الموظفين') || entry.title.includes('بيانات'));
});
