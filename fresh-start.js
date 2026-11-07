// «بداية جديدة»: نسخة احتياطية كاملة في Drive أولاً، ثم مسح بيانات نورة القديمة (الملفات، مصادر PDF، اللوحات، المحادثات، الذاكرة، المعرفة).
// لا يلمس: المشاريع والتذاكر وطلبات التطوير وإعدادات الواجهة والاستهلاك. لو فشل حفظ النسخة الاحتياطية ما يُمسح شيء.
import { db } from './db.js';
import { storeDump, storeClear, kvKeys, kvDelete, kvGet, STORE_TABLES } from './store.js';
import { DriveStorage } from './ingest/storage.js';
import { resetKnowledgeCache } from './knowledge.js';
import { invalidateIndex, ensureIndex } from './retrieval.js';

const DOMAIN_TABLES = ['documents', 'rag_chunks']; // + doc_chunks و rag_fts
const KV = ['knowledge', 'current_dash', 'ingest:*'];

async function collect() {
  const out = { domain: {}, store: {}, kv: {} };
  for (const t of DOMAIN_TABLES) {
    try {
      out.domain[t] = (await db.prepare(`SELECT * FROM ${t}`).all()).map(r => (t === 'rag_chunks' ? { ...r, vec: undefined } : r));
    } catch {
      out.domain[t] = [];
    }
  }
  for (const t of STORE_TABLES) {
    out.store[t] = (await storeDump(t)).map(r => (r.embedding ? { ...r, embedding: undefined } : r));
  }
  for (const k of await kvKeys(KV)) {
    out.kv[k] = await kvGet(k);
  }
  return out;
}

const counts = d => ({
  ملفات: (d.domain.documents || []).length,
  مقاطع_بحث: (d.domain.rag_chunks || []).length,
  جداول_بيانات: (d.store.datasets || []).length,
  لوحات: (d.store.dashboards || []).length,
  محادثات: (d.store.chat_sessions || []).length,
  رسائل: (d.store.chat_turns || []).length,
  ذاكرة: (d.store.memories || []).length,
  معرفة: d.kv.knowledge?.entries?.length || 0,
  مصادر_PDF: Object.keys(d.kv['ingest:index']?.documents || {}).length,
  مفاتيح_PDF: Object.keys(d.kv).filter(k => k.startsWith('ingest:')).length,
});

export async function freshStartPreview() {
  return { will_clear: counts(await collect()), keeps: ['المشاريع', 'التذاكر', 'طلبات التطوير', 'إعدادات الواجهة', 'سجل الاستهلاك'] };
}

export async function freshStart({ archiveName }) {
  const data = await collect();
  const before = counts(data);

  // 1) النسخة الاحتياطية أولاً — بدونها ما نمسح
  if (!process.env.DRIVE_SCRIPT_URL) throw new Error('Drive غير مربوط — ما أقدر أحفظ نسخة احتياطية، فما مسحت شيئاً');
  const st = new DriveStorage(process.env.DRIVE_SCRIPT_URL, archiveName);
  const bpath = `backup/nora-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const json = JSON.stringify({ created_at: new Date().toISOString(), note: 'نسخة احتياطية قبل البداية الجديدة لنورة', counts: before, data });
  const file = await st.putFile(bpath, Buffer.from(json, 'utf8'), 'application/json');
  const back = await st.getFile(bpath);
  if (!back || back.length !== Buffer.byteLength(json)) throw new Error('تعذّر التحقق من النسخة الاحتياطية — ما مسحت شيئاً');

  // 2) المسح
  const fk = db.pragma('foreign_keys', { simple: true });
  db.pragma('foreign_keys = OFF');
  try {
    await db.prepare('DELETE FROM doc_chunks').run();
    await db.prepare('DELETE FROM documents').run();
    await db.prepare('DELETE FROM rag_fts').run().catch(() => {});
    await db.prepare('DELETE FROM rag_chunks').run().catch(() => {});
  } finally {
    db.pragma(`foreign_keys = ${fk ? 'ON' : 'OFF'}`);
  }

  for (const t of STORE_TABLES) await storeClear(t);
  await kvDelete(Object.keys(data.kv));

  resetKnowledgeCache();
  invalidateIndex();
  ensureIndex().catch(() => {});

  const after = counts(await collect());
  return { ok: true, before, after, backup: { name: bpath, url: file?.url || null, bytes: Buffer.byteLength(json), archive: archiveName } };
}
