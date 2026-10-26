// مهمة المعالجة الخلفية القابلة للاستكمال:
// تم الرفع ← في الانتظار ← استخراج ← تنظيم ← تحقق ← جاهز / جاهز جزئياً / فشل
// كل صفحة تُحفظ نتيجتها فور استخراجها (checkpoint) فلو انقطعت المهمة تكمل من حيث وقفت بدون إعادة الصفحات المنجزة.
import { kvGet, kvSet, withLock } from '../store.js';
import { sha256, documentId, versionId, attemptId, SCHEMA_VERSION, PIPELINE_VERSION, TERMINAL, STAGE_AR, VERSION_FILES } from './contracts.js';
import { analyze } from './pdf.js';
import { extractPageGemini, extractPageTextLayer, visionReady, EXTRACT_MODEL, doclingReady, doclingTables } from './extract.js';
import { organize } from './organize.js';
import { validate } from './validate.js';
import { buildPackage } from './package.js';
import { storage } from './storage.js';

const IDX = 'ingest:index', JOB = id => `ingest:job:${id}`, DATA = vid => `ingest:data:${vid}`;
const listeners = new Set();
export const onIngestChange = fn => listeners.add(fn);
const emit = (job) => listeners.forEach(fn => { try { fn(job); } catch {} });

export async function getIndex() { return (await kvGet(IDX)) || { schema: SCHEMA_VERSION, documents: {} }; }
async function saveIndex(ix) { await kvSet(IDX, ix); }
export async function getJob(id) { return kvGet(JOB(id)); }
async function saveJob(j) { j.updated_at = new Date().toISOString(); await kvSet(JOB(j.attempt_id), j); emit(publicJob(j)); }
export const publicJob = j => j && ({
  attempt_id: j.attempt_id, document_id: j.document_id, version: j.version, version_id: j.version_id, file_name: j.file_name, stage: j.stage, stage_ar: STAGE_AR[j.stage],
  pages_total: j.pages_total ?? null, pages_done: Object.keys(j.page_results || {}).length, issues: (j.issues || []).length, issue_list: (j.issues || []).slice(-12),
  errors: (j.errors || []).slice(-5), started_at: j.started_at, updated_at: j.updated_at, finished_at: j.finished_at || null, links: j.links || null, duplicate_of: j.duplicate_of || null,
});

// ===== الاستقبال =====
export async function receive({ buffer, fileName, mime = 'application/pdf', uploadedBy = 'fawaz', sourceRef = null, reprocessOf = null }) {
  if (!/pdf/i.test(mime) && !/\.pdf$/i.test(fileName)) throw new Error('المسار يقبل PDF فقط');
  const hash = sha256(buffer);
  const ix = await getIndex();
  // نفس المحتوى سبق رفعه (بأي اسم): لا نكرر المعالجة ولا البيانات
  if (!reprocessOf) for (const d of Object.values(ix.documents)) for (const v of d.versions) if (v.sha256 === hash) {
    if (!['failed'].includes(v.status)) {
      const j = v.attempt_id ? await getJob(v.attempt_id) : null;
      if (j && !TERMINAL.has(j.stage)) kick(j.attempt_id);
      return { duplicate: true, document_id: d.document_id, version: v.n, version_id: v.version_id, attempt_id: v.attempt_id, status: v.status, message: 'نفس الملف مرفوع سابقاً — لم تتكرر المعالجة' };
    }
  }
  const docId = documentId(fileName);
  const doc = ix.documents[docId] || (ix.documents[docId] = { document_id: docId, file_name: fileName, created_at: new Date().toISOString(), versions: [], current_version: null });
  const failedSame = reprocessOf ? null : doc.versions.find(v => v.sha256 === hash && v.status === 'failed');
  const n = failedSame ? failedSame.n : doc.versions.length + 1;
  const vid = versionId(docId, n);
  const att = attemptId();
  const st = storage();
  if (st.label) st.label(docId, fileName.replace(/\.pdf$/i, '').slice(0, 80));
  // الأصل أولاً كما هو (بدون تعديل) — هو مرجع الاستكمال
  const orig = await st.putFile(`${docId}/v${n}/original.pdf`, buffer, 'application/pdf');
  const v = failedSame || { n, version_id: vid, sha256: hash };
  Object.assign(v, { status: 'queued', attempt_id: att, file_name: fileName, size: buffer.length, uploaded_at: new Date().toISOString(), uploaded_by: uploadedBy, original: orig, source_ref: sourceRef, ...(reprocessOf ? { reprocess_of: reprocessOf, reason: 'إعادة معالجة بنسخة أحدث من المسار (نفس الأصل)' } : {}) });
  if (!failedSame) doc.versions.push(v);
  doc.file_name = fileName;
  await saveIndex(ix);
  const job = { attempt_id: att, document_id: docId, version: n, version_id: vid, file_name: fileName, sha256: hash, size: buffer.length, stage: 'uploaded', started_at: new Date().toISOString(), page_results: {}, issues: [], errors: [], history: [{ stage: 'uploaded', at: new Date().toISOString() }] };
  await saveJob(job);
  job.stage = 'queued'; job.history.push({ stage: 'queued', at: new Date().toISOString() }); await saveJob(job);
  kick(att);
  return { duplicate: false, document_id: docId, version: n, version_id: vid, attempt_id: att, status: 'queued' };
}

// إعادة معالجة صريحة لإصدار موجود (بعد تحسين المسار): إصدار جديد من نفس الأصل المحفوظ، والسابق يبقى كما هو
export async function reprocess(versionIdArg) {
  const ix = await getIndex();
  for (const d of Object.values(ix.documents)) {
    const v = d.versions.find(x => x.version_id === versionIdArg);
    if (!v) continue;
    const st = storage();
    const buf = await st.getFile(`${d.document_id}/v${v.n}/original.pdf`);
    return receive({ buffer: buf, fileName: v.file_name || d.file_name, uploadedBy: 'reprocess', reprocessOf: v.version_id });
  }
  throw new Error('الإصدار غير موجود');
}

// ===== المشغّل =====
const running = new Map();
export function kick(att) {
  if (running.has(att)) return running.get(att);
  const p = (async () => {
    const j = await getJob(att); if (!j) return null;
    // قفل على مستوى المستند: إصداران لنفس المستند ما يتعالجون في نفس الوقت
    const r = await withLock(`ingest:doc:${j.document_id}`, () => run(att));
    if (!r.locked) { console.log(`[ingest] ${j.document_id} مشغول — إعادة المحاولة بعد 20 ثانية`); setTimeout(() => kick(att), 20000); }
    return r.value;
  })().catch(e => console.error('[ingest] run crashed:', e)).finally(() => running.delete(att));
  running.set(att, p);
  return p;
}

// بعد إعادة تشغيل السيرفر: نكمل أي مهمة لم تنتهِ
export async function resumePending() {
  const ix = await getIndex();
  const pending = Object.values(ix.documents).flatMap(d => d.versions).filter(v => v.attempt_id && !TERMINAL.has(v.status));
  for (const v of pending) { console.log(`[ingest] resuming ${v.attempt_id} (${v.version_id}, ${v.status})`); kick(v.attempt_id); }
  return pending.length;
}

async function setStage(job, stage) { job.stage = stage; job.history.push({ stage, at: new Date().toISOString() }); await saveJob(job); await syncIndex(job); }
async function syncIndex(job, extra = {}) {
  const ix = await getIndex(); const d = ix.documents[job.document_id]; const v = d?.versions.find(x => x.n === job.version);
  if (!v) return; Object.assign(v, { status: job.stage, ...extra }); await saveIndex(ix); return ix;
}

let testEngine = null;
export function _setTestEngine(fn) { testEngine = fn; }
// للاختبار: إيقاف متعمد بعد عدد صفحات (يحاكي انقطاع السيرفر)
let interruptAfter = null;
export function _interruptAfterPages(n) { interruptAfter = n; }

async function run(att) {
  const job = await getJob(att);
  if (!job || TERMINAL.has(job.stage)) return job;
  const st = storage();
  try {
    const buffer = await st.getFile(`${job.document_id}/v${job.version}/original.pdf`);
    if (!buffer) throw new Error('الملف الأصلي غير موجود في التخزين');
    // 1) الاستخراج
    if (job.stage !== 'extracting') await setStage(job, 'extracting');
    const analysis = await analyze(buffer);
    job.pages_total = analysis.page_count; await saveJob(job);
    const todo = analysis.pages.filter(p => !job.page_results[p.page]);
    let since = 0;
    const work = async (p) => {
      let r;
      if (p.kind === 'empty') r = { engine: 'none', engine_detail: 'صفحة فارغة', printed_page_number: '', observed_kind: 'blank', blocks: [], tables: [], charts: [], images: [], problems: [] };
      else if (testEngine) r = await testEngine(buffer, p);
      else if (visionReady()) {
        try { r = await extractPageGemini(buffer, p); }
        catch (e) { r = extractPageTextLayer(p, `محرك الرؤية فشل: ${e.message.slice(0, 160)}`); job.errors.push({ page: p.page, error: e.message.slice(0, 300), at: new Date().toISOString() }); }
      } else r = extractPageTextLayer(p, 'لا يوجد محرك رؤية مهيأ (GEMINI_API_KEY)');
      r.page = p.page;
      job.page_results[p.page] = r;
      for (const pr of r.problems || []) job.issues.push({ page: p.page, element: pr.element, reason: pr.reason });
      await saveJob(job);
      since++;
      if (interruptAfter != null && since >= interruptAfter) { interruptAfter = null; throw Object.assign(new Error('انقطاع متعمد للاختبار'), { simulated: true }); }
    };
    const CONC = +(process.env.INGEST_CONCURRENCY || 2);
    for (let i = 0; i < todo.length; i += CONC) await Promise.all(todo.slice(i, i + CONC).map(work));

    // 2) التنظيم
    await setStage(job, 'organizing');
    const pages = analysis.pages.map(p => job.page_results[p.page]);
    const vid = job.version_id;
    const org = organize({ vid, analysis, pages });
    // Docling اختياري: مقارنة عدد الجداول وأبعادها
    if (doclingReady()) {
      try { const dt = await doclingTables(buffer, job.file_name); org.docling = { tables: dt.length, shapes: dt.map(t => ({ page: t.page, rows: t.grid.length, cols: t.grid[0]?.length || 0 })) }; }
      catch (e) { job.issues.push({ page: null, element: 'Docling', reason: `تعذّر التحقق المتقاطع: ${e.message}` }); }
    }

    // 3) التحقق + الحزمة
    await setStage(job, 'validating');
    const val = validate(org);
    const firstWith = k => pages.map(p => p[k]).find(Boolean) || null;
    const meta = {
      schema: SCHEMA_VERSION, document_id: job.document_id, version: job.version, version_id: vid, attempt_id: att, file_name: job.file_name, sha256: job.sha256, mime: 'application/pdf',
      size_bytes: job.size, page_count: analysis.page_count, language: 'ar', uploaded_at: job.started_at, processed_at: new Date().toISOString(),
      report_date: firstWith('report_date'), data_period: firstWith('data_period'), pdf_info: analysis.pdf_info,
      tools: { pipeline: PIPELINE_VERSION, pdf_analysis: 'pdfjs-dist 6.3.289', page_split: 'pdf-lib 1.17.1', vision: visionReady() ? EXTRACT_MODEL() : null, docling: doclingReady() ? process.env.DOCLING_URL.replace(/\/\/.*@/, '//') : null },
    };
    const { files, quality } = buildPackage({ meta, analysis, pages, org, val });
    const base = `${job.document_id}/v${job.version}`;
    const written = {};
    for (const [rel, f] of Object.entries(files)) written[rel] = await st.putFile(`${base}/${rel}`, f.data, f.mime);
    // التحقق من اكتمال الكتابة قبل تحديث manifest
    const missing = Object.keys(files).filter(rel => !written[rel]?.id);
    if (missing.length) throw new Error('كتابة ناقصة: ' + missing.join('، '));
    const folder = await st.dir(base);
    meta.drive = { folder: folder?.url || null, files: Object.fromEntries(Object.entries(written).map(([k, v]) => [k, { id: v.id, url: v.url, size: v.size }])) };
    meta.counts = quality.counts; meta.coverage = { pages_total: analysis.page_count, pages_structured: pages.filter(p => p.engine === 'gemini').length, pages_text_only: pages.filter(p => p.engine === 'text_layer').map(p => p.page) };
    meta.extraction_problems = quality.not_extracted;
    await st.putJSON(`${base}/metadata.json`, meta);
    const status = quality.status;
    const vmanifest = { schema: SCHEMA_VERSION, version_id: vid, status, files: Object.keys(files).concat('metadata.json', 'original.pdf').sort(), complete: true, written_at: new Date().toISOString() };
    await st.putJSON(`${base}/manifest.json`, vmanifest);

    // الكاش للاستعلام السريع (البيانات المنظمة نفسها، تُعاد من Drive لو ضاع الكاش)
    await kvSet(DATA(vid), cacheData({ meta, org, val, quality }));
    // manifest المستند يشير للإصدار الجاهز فقط — آخر خطوة
    if (status !== 'failed') {
      const ix = await getIndex(); const d = ix.documents[job.document_id];
      const prev = d.current_version;
      d.current_version = job.version; d.file_name = job.file_name;
      await st.putJSON(`${job.document_id}/manifest.json`, { schema: SCHEMA_VERSION, document_id: job.document_id, file_name: job.file_name, current_version: job.version, current_version_id: vid,
        previous_version: prev, versions: d.versions.map(x => ({ n: x.n, version_id: x.version_id, sha256: x.sha256, status: x.n === job.version ? status : x.status, uploaded_at: x.uploaded_at })), updated_at: new Date().toISOString() });
      await saveIndex(ix);
    }
    job.links = { folder: meta.drive.folder, review_xlsx: written['review.xlsx']?.url, quality_report: written['quality_report.md']?.url, document_md: written['document.md']?.url, original: (await getIndex()).documents[job.document_id].versions.find(x => x.n === job.version)?.original?.url || null };
    job.finished_at = new Date().toISOString();
    job.stage = status; job.history.push({ stage: status, at: job.finished_at });
    job.page_results = Object.fromEntries(Object.entries(job.page_results).map(([k, v]) => [k, { engine: v.engine, problems: v.problems?.length || 0 }])); // النتائج الكاملة صارت في الحزمة
    await saveJob(job);
    await syncIndex(job, { links: job.links, counts: quality.counts, processed_at: job.finished_at, datasets: quality.datasets.map(d => ({ id: d.dataset, title: d.title, state: d.state })) });
    console.log(`[ingest] ${vid} → ${status} (${analysis.page_count} pages, ${org.tables.length} tables, ${org.values.length} values)`);
    return job;
  } catch (e) {
    if (e.simulated) { console.warn('[ingest]', e.message); return job; } // تبقى المهمة في «استخراج» وتُستكمل
    job.errors.push({ stage: job.stage, error: String(e.message || e).slice(0, 500), at: new Date().toISOString() });
    job.stage = 'failed'; job.finished_at = new Date().toISOString(); job.history.push({ stage: 'failed', at: job.finished_at });
    await saveJob(job); await syncIndex(job);
    console.error(`[ingest] ${att} failed:`, e.message);
    return job; // الإصدار السابق يبقى current_version
  }
}

// ===== الكاش المنظم (ذاكرة المصادر) =====
function cacheData({ meta, org, val, quality }) {
  return {
    schema: SCHEMA_VERSION, meta: { document_id: meta.document_id, version: meta.version, version_id: meta.version_id, file_name: meta.file_name, page_count: meta.page_count, report_date: meta.report_date, data_period: meta.data_period, processed_at: meta.processed_at, drive: { folder: meta.drive.folder, files: meta.drive.files } },
    status: quality.status, readiness: val.readiness, checks: val.checks.map(c => ({ id: c.id, type: c.type, result: c.result, detail: c.detail, pages: c.pages })),
    datasets: org.datasets, tables: org.tables.map(t => ({ id: t.id, title: t.title, pages: t.pages, columns: t.columns, notes: t.notes, units: t.units })),
    values: org.values, blocks: org.blocks.map(b => ({ id: b.id, page: b.page, type: b.type, text: b.text })), charts: org.charts.map(c => ({ id: c.id, page: c.page, title: c.title })),
  };
}

export async function getData(vid) {
  let d = await kvGet(DATA(vid));
  if (d) return d;
  // الكاش ضاع: نعيد بناءه من الحزمة في التخزين (بدون إعادة تحليل الملف)
  const [docId, vn] = vid.split('@v');
  const st = storage(), base = `${docId}/v${vn}`;
  const meta = await st.getJSON(`${base}/metadata.json`); if (!meta) return null;
  const q = await st.getJSON(`${base}/quality_report.json`);
  const dsl = (await st.getText(`${base}/datasets/datasets.jsonl`) || '').split('\n').filter(Boolean).map(JSON.parse);
  const values = (await st.getText(`${base}/metrics.jsonl`) || '').split('\n').filter(Boolean).map(JSON.parse);
  const tj = await st.getJSON(`${base}/tables/tables.json`);
  d = { schema: SCHEMA_VERSION, meta: { ...meta, drive: meta.drive }, status: q.status, readiness: q.datasets, checks: q.checks, datasets: dsl.map(({ readiness, ...x }) => x), tables: tj.tables, values, blocks: [], charts: [], rebuilt_from_storage: true };
  await kvSet(DATA(vid), d);
  return d;
}

export async function currentVersions() {
  const ix = await getIndex();
  return Object.values(ix.documents).filter(d => d.current_version).map(d => ({ ...d, current: d.versions.find(v => v.n === d.current_version) }));
}
export { VERSION_FILES };
