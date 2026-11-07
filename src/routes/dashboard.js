import { Router, json } from 'express';
import { db, tools as dataTools } from '../../db.js';
import { docTools } from '../../docs.js';
import { kvGet, kvSet, memDelete } from '../../store.js';
import { listForUI } from '../../memory.js';
import { dashGet, dashList } from '../../dashboards.js';
import { getCurrentDash, setCurrentDash } from '../../file-dash.js';
import { importBundle, kList, legacyFind } from '../../knowledge.js';
import { ensureIndex, hybridSearch, evaluate, W_COS, W_COV } from '../../retrieval.js';
import { legacySearchDocs } from '../tools/registry.js';
import { freshStart, freshStartPreview } from '../../fresh-start.js';
import { driveSetup } from '../../drive.js';

const router = Router();

// إعدادات الواجهة (نورة تحفظها هنا)
router.get('/api/ui', async (req, res) => res.json((await kvGet('ui')) || {}));
router.post('/api/ui', async (req, res) => {
  if (JSON.stringify(req.body || {}).length > 20000) return res.status(413).json({ error: 'كبير' });
  await kvSet('ui', req.body || {});
  res.json({ ok: true });
});

// الذاكرة
router.get('/api/memories', async (req, res) => res.json({ memories: await listForUI() }));
router.delete('/api/memories/:id', async (req, res) => res.json({ ok: !!(await memDelete(+req.params.id)) }));

// الداشبوردات المولّدة
router.get('/api/dashboards/:id', async (req, res) => {
  const d = await dashGet(+req.params.id);
  d ? res.json(d) : res.status(404).json({ error: 'غير موجود' });
});

// لوحة آخر ملف المعروضة
router.get('/api/current-dash', async (req, res) => res.json((await getCurrentDash()) || {}));
router.post('/api/current-dash', async (req, res) => {
  await setCurrentDash(req.body?.id ? req.body : {});
  res.json({ ok: true });
});

// ملخص لوحة التحكم الشاملة
router.get('/api/dashboard', async (req, res) => {
  res.json({
    dashboards: await dashList(),
    memories: await listForUI(),
    summary: await dataTools.get_dashboard_summary.run(),
    projects: await db.prepare('SELECT * FROM projects').all(),
    tickets: (await dataTools.list_tickets.run()).tickets,
    documents: (await docTools.list_documents.run()).documents,
    dev_requests: (await dataTools.list_dev_requests.run()).requests,
    tasks: (await dataTools.list_tasks.run({ status: 'all' })).tasks,
  });
});

// طلبات التطوير
router.get('/api/dev-requests', async (req, res) => {
  const rows = await db.prepare('SELECT * FROM dev_requests ORDER BY id DESC').all();
  res.json({ requests: req.query.status ? rows.filter(r => r.status === req.query.status) : rows });
});
router.post('/api/dev-requests/:id', async (req, res) => {
  const { status, note } = req.body || {};
  const r = await db.prepare(
    "UPDATE dev_requests SET status=COALESCE(?, status), dev_note=COALESCE(?, dev_note), updated_at=datetime('now') WHERE id=?"
  ).run(status || null, note || null, +req.params.id);
  res.json({ ok: r.changes > 0 });
});

// استهلاك التوكنز
router.post('/api/usage', async (req, res) => {
  const { chatId, engine = 'gemini', input = 0, output = 0, total = 0 } = req.body || {};
  const u = (await kvGet('usage')) || { days: {}, sessions: [] };
  const day = new Date().toISOString().slice(0, 10);
  const d = (u.days[day] ||= {});
  const e = (d[engine] ||= { input: 0, output: 0, total: 0 });
  e.input += +input || 0;
  e.output += +output || 0;
  e.total += +total || 0;
  let s = u.sessions.find(x => x.chatId === chatId && x.engine === engine);
  if (!s) {
    s = { chatId, engine, day, input: 0, output: 0, total: 0 };
    u.sessions.push(s);
    u.sessions = u.sessions.slice(-50);
  }
  s.input += +input || 0;
  s.output += +output || 0;
  s.total += +total || 0;
  await kvSet('usage', u);
  res.json({ ok: true, today: d });
});

// مكتبة المعرفة
router.post('/api/knowledge/import', async (req, res) => {
  try {
    res.json(await importBundle(req.body));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
router.get('/api/knowledge', async (req, res) => {
  res.json({
    entries: (await kList()).map(({ sections, values, ...e }) => ({ ...e, sections: sections.length })),
  });
});

// تقييم وحالة الاسترجاع الهجين
router.get('/api/retrieval/status', async (req, res) => {
  res.json({ ...(await ensureIndex()), weights: { cos: W_COS, cov: W_COV } });
});
router.post('/api/retrieval/eval', json({ limit: '2mb' }), async (req, res) => {
  try {
    await ensureIndex();
    const cases = (req.body?.cases || []).slice(0, 200);
    const legacyKnTexts = async q => (await legacyFind({ question: q })).results.flatMap(r => [
      `${r.title} ${r.summary || ''} ${r.purpose || ''}`,
      ...(r.sections || []).map(x => (typeof x === 'string' ? x : x.text)),
    ]);
    const report = await evaluate(cases, {
      legacy_knowledge: legacyKnTexts,
      legacy_documents: async q => (legacySearchDocs({ query: q }).matches || []).map(m => m.content),
      keyword_only: async q => (await hybridSearch(q, { k: 5, useVectors: false })).hits.map(h => `${h.title} ${h.section || ''} ${h.text}`),
      hybrid: async q => (await hybridSearch(q, { k: 5 })).hits.map(h => `${h.title} ${h.section || ''} ${h.text}`),
    });
    res.json({ cases: cases.length, report });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// «بداية جديدة»
router.get('/api/admin/fresh-start', async (req, res) => {
  try {
    res.json(await freshStartPreview());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
router.post('/api/admin/fresh-start', async (req, res) => {
  if (req.body?.confirm !== 'ابدأ من جديد') return res.status(400).json({ error: 'لازم عبارة التأكيد' });
  try {
    res.json(await freshStart({ archiveName: String(req.body.archive || 'أرشيف نورة — قبل البداية الجديدة').slice(0, 80) }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// إعداد Google Drive
router.post('/api/drive/setup', async (req, res) => {
  try {
    res.json(await driveSetup());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export { router as dashboardRouter };
