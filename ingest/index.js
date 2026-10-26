// ربط مسار PDF بنورة: مسارات API، أدوات وقت التشغيل، سياق الشاشة، والداشبورد المرتبط بالمصدر.
import { receive, reprocess, getJob, publicJob, kick, resumePending, getIndex, getData, currentVersions, onIngestChange } from './pipeline.js';
import { tools as queryTools, searchSources } from './query.js';
import { initExtract, visionReady, EXTRACT_MODEL, doclingReady } from './extract.js';
import { storage } from './storage.js';
import { STAGE_AR, TERMINAL, SCHEMA_VERSION } from './contracts.js';
import { dashboardTools } from '../dashboards.js';
import { registerSource, invalidateIndex, ensureIndex } from '../retrieval.js';

export function initIngest(ai) {
  initExtract(ai);
  registerSource(searchSources);
  onIngestChange(j => { if (TERMINAL.has(j.stage)) { invalidateIndex(); ensureIndex().catch(() => {}); } });
  setTimeout(() => resumePending().catch(e => console.warn('[ingest] resume failed:', e.message)), 3000);
}

const r6 = x => +(+x).toFixed(6);
const pdf_dashboard = {
  declaration: { name: 'pdf_dashboard', description: 'تبني داشبورد تفاعلي من جدول PDF محفوظ ومتحقق منه: مؤشر محسوب بالكود، رسم حسب بُعد موجود فعلاً، فلاتر بالأبعاد المتاحة، تفاصيل Drill-down بأرقام الصفحات، ومصدر البيانات وإصدارها وحالة التحقق. لا يستخدم جداول محجوبة.', parameters: { type: 'OBJECT', properties: {
    dataset: { type: 'STRING', description: 'معرّف المجموعة أو عنوان الجدول' }, measure: { type: 'STRING' }, group_by: { type: 'STRING' }, title: { type: 'STRING' } }, required: ['dataset'] } },
  write: true,
  run: async ({ dataset, measure, group_by, title } = {}) => {
    const total = await queryTools.pdf_metric.run({ dataset, measure, agg: 'sum' });
    if (!total.available) return { error: total.message };
    const data = await getData(total.version_id);
    const ds = data.datasets.find(d => d.id === total.dataset);
    const m = ds.measures.find(x => x.name === total.measure) || ds.measures[0];
    const dim = group_by ? ds.dimensions.find(d => d.includes(group_by) || group_by.includes(d)) : ds.dimensions[0];
    const grouped = dim ? await queryTools.pdf_metric.run({ dataset: ds.id, measure: m.name, agg: 'sum', group_by: dim }) : null;
    const rd = data.readiness.find(r => r.dataset === ds.id);
    const details = ds.rows.filter(r => r.kind === 'detail');
    const opt = grouped?.groups?.length ? { xAxis: { type: 'category', data: grouped.groups.map(g => g.key) }, yAxis: { type: 'value' }, series: [{ type: 'bar', data: grouped.groups.map(g => g.value) }] } : null;
    const interactive = {
      dataset: ds.id, dimensions: ds.dimensions, measures: ds.measures.map(x => x.name), measure: m.name, group_by: dim || null,
      filters: ds.dimensions.map(d => ({ dimension: d, values: [...new Set(details.map(r => r.dims[d]).filter(Boolean))] })).filter(f => f.values.length > 1 && f.values.length <= 200),
      rows: details.map(r => ({ row: r.row, page: r.page, dims: r.dims, values: Object.fromEntries(Object.entries(r.cells).map(([k, c]) => [k, c.value])), raw: Object.fromEntries(Object.entries(r.cells).map(([k, c]) => [k, c.raw])), records: Object.fromEntries(Object.entries(r.cells).map(([k, c]) => [k, c.record])) })),
    };
    const spec = {
      title: title || `${ds.title}`, subtitle: `${data.meta.file_name} · ${data.meta.version_id}`, kicker: 'من ملف PDF', designed_by: 'قواعد',
      headline: `${total.measure}: ${total.value.toLocaleString('en-US')}${total.printed_total ? ` — ${total.matches_printed_total ? 'يطابق الإجمالي المطبوع' : 'لا يطابق الإجمالي المطبوع'} (${total.printed_total})` : ''}`, headline_flag: total.printed_total ? !total.matches_printed_total : false,
      kpis: [{ label: `مجموع ${m.name}`, value: r6(total.value), unit: m.unit || '' }, { label: 'صفوف التفاصيل', value: details.length, unit: 'صف' }],
      charts: opt ? [{ title: `${m.name} حسب ${dim}`, echarts_option: JSON.stringify(opt), span: 2, insight: `الأعلى: ${grouped.groups[0].key} (${grouped.groups[0].value.toLocaleString('en-US')})` }] : [],
      tables: [], insights: [`المعادلة: ${total.formula}`, `الصفحات: ${ds.pages.join('، ')}`, ...(total.excluded_note ? [total.excluded_note] : [])],
      provenance: { document: data.meta.file_name, document_id: data.meta.document_id, version_id: data.meta.version_id, report_date: data.meta.report_date || null, data_period: data.meta.data_period || null,
        processed_at: data.meta.processed_at, verification: rd?.state, verification_note: rd?.reason || '', pages: ds.pages, formula: total.formula, folder: data.meta.drive?.folder || null },
      interactive,
    };
    const r = await dashboardTools.build_dashboard.run(spec);
    return { ...r, value: total.value, formula: total.formula, version_id: data.meta.version_id, pages: ds.pages, verification: rd?.state };
  },
};

const pdf_job_status = {
  declaration: { name: 'pdf_job_status', description: 'حالة معالجة ملف PDF مرفوع (المرحلة، الصفحات المعالجة، المشكلات). استخدميها لما يسأل «خلص الملف؟» أو بعد الرفع.', parameters: { type: 'OBJECT', properties: { attempt_id: { type: 'STRING' } } } },
  run: async ({ attempt_id } = {}) => {
    if (attempt_id) return publicJob(await getJob(attempt_id)) || { error: 'غير موجود' };
    const ix = await getIndex();
    const last = Object.values(ix.documents).flatMap(d => d.versions.map(v => ({ ...v, document_id: d.document_id }))).sort((a, b) => String(b.uploaded_at).localeCompare(String(a.uploaded_at)))[0];
    return last ? publicJob(await getJob(last.attempt_id)) : { message: 'لا توجد ملفات PDF معالجة' };
  },
};

export const ingestTools = { ...queryTools, pdf_dashboard, pdf_job_status };

export async function sourcesBlock() {
  try {
    const ix = await getIndex();
    const docs = Object.values(ix.documents);
    if (!docs.length) return 'لا يوجد';
    return docs.map(d => {
      const cur = d.versions.find(v => v.n === d.current_version), last = d.versions.at(-1);
      return `• ${d.document_id} «${d.file_name}» ${cur ? `الإصدار ${cur.version_id} (${STAGE_AR[cur.status]})، جداول: ${(cur.datasets || []).map(x => `${x.id.split('#')[1]} «${x.title}» [${x.state}]`).join('، ') || 'لا يوجد'}` : 'لا يوجد إصدار جاهز'}${last && last !== cur ? ` — قيد المعالجة: ${last.version_id} (${STAGE_AR[last.status]})` : ''}`;
    }).join('\n');
  } catch { return 'غير متاح'; }
}

export function ingestRoutes(app, upload) {
  app.get('/api/ingest/status', async (req, res) => res.json({ schema: SCHEMA_VERSION, storage: storage().kind, vision: visionReady() ? EXTRACT_MODEL() : null, docling: doclingReady(), documents: Object.keys((await getIndex()).documents).length }));
  app.get('/api/ingest/index', async (req, res) => res.json(await getIndex()));
  app.get('/api/ingest/jobs/:id', async (req, res) => { const j = await getJob(req.params.id); return j ? res.json(publicJob(j)) : res.status(404).json({ error: 'not found' }); });
  app.post('/api/ingest/jobs/:id/resume', async (req, res) => { const j = await getJob(req.params.id); if (!j) return res.status(404).json({ error: 'not found' }); kick(j.attempt_id); res.json({ ok: true, stage: j.stage }); });
  app.post('/api/ingest/versions/:vid/reprocess', async (req, res) => { try { res.json(await reprocess(decodeURIComponent(req.params.vid))); } catch (e) { res.status(400).json({ error: e.message }); } });
  app.post('/api/ingest/upload', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'ما وصل ملف' });
    const name = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    try { res.json(await receive({ buffer: req.file.buffer, fileName: name, mime: req.file.mimetype })); } catch (e) { res.status(400).json({ error: e.message }); }
  });
  // استيراد ملف موجود في Drive حق فواز (عبر نفس الجسر، بنفس الصلاحيات)
  app.post('/api/ingest/from-drive', async (req, res) => {
    try {
      const st = storage(); if (!st.getById) return res.status(400).json({ error: 'التخزين الحالي ليس Drive' });
      const f = await st.getById(String(req.body?.file_id || ''));
      res.json(await receive({ buffer: f.data, fileName: f.name, mime: f.mime, sourceRef: { drive_file_id: req.body.file_id, url: f.url } }));
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  // نفس الملف كبايتات (لاختبار الرفع من المتصفح بنفس مسار الواجهة)
  app.get('/api/ingest/drive-file/:id', async (req, res) => {
    try { const st = storage(); const f = await st.getById(req.params.id); res.type(f.mime).set('x-file-name', encodeURIComponent(f.name)).send(f.data); } catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.get('/api/ingest/trace/:rid', async (req, res) => res.json(await queryTools.pdf_trace.run({ record_id: decodeURIComponent(req.params.rid) })));
  app.get('/api/ingest/data/:vid/summary', async (req, res) => { const d = await getData(decodeURIComponent(req.params.vid)); if (!d) return res.status(404).json({ error: 'not found' }); res.json({ meta: d.meta, status: d.status, readiness: d.readiness, checks: d.checks, tables: d.tables.map(t => ({ id: t.id, title: t.title, pages: t.pages })), values: d.values.length }); });
}
export { currentVersions };
