// بيانات SQLite (المشاريع، التذاكر، طلبات التطوير، الملفات) تنمسح مع كل نشر في Render المجاني.
// الحل: نأخذ نسخة منها في Postgres بعد كل تعديل، ونرجّعها تلقائياً أول ما يشتغل السيرفر.
import { db } from './db.js';
import { indexDocument, normalize } from './docs.js';
import { kvGet, kvSet, backend } from './store.js';
import { dataChanged } from './events.js';

export const TABLES = ['projects', 'tickets', 'dev_requests', 'documents', 'tasks', 'agent_jobs', 'rag_chunks']; // rag_chunks: مقاطع البحث مع متجهاتها (عشان ما نعيد الـ embeddings مع كل نشر)
// وضع محمي: لو فشل الاسترجاع (أو Postgres ما اشتغل) نوقف الحفظ عشان ما تنكتب نسخة ناقصة فوق البيانات السليمة
// ready: ما نكتب أي لقطة قبل ما ينجح الاسترجاع (SIGTERM أثناء التشغيل كان يقدر يكتب جداول فاضية فوق Postgres)
export const persistState = { protected: false, reason: '', ready: false };
export const pendingSnapshot = () => !!timer;
export const protect = reason => { persistState.protected = true; persistState.reason = String(reason || '').slice(0, 200); console.error('[persist] PROTECTED MODE:', persistState.reason); dataChanged('persist'); };
let timer;
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function snapshot({ set = kvSet, enabled = backend === 'postgres' } = {}) {
  if (!enabled || persistState.protected || !persistState.ready) return;
  for (const t of TABLES) await set(`sqlite:${t}`, db.prepare(`SELECT * FROM ${t}`).all());
}
export function snapshotSoon() { dataChanged('db'); clearTimeout(timer); timer = setTimeout(() => { timer = null; return snapshot().catch(e => console.error('[persist]', e.message)); }, 1500); }

// يجيب كل الجداول أولاً (3 محاولات)، يتحقق منها، ثم يطبقها كلها في معاملة وحدة — أو ما يطبق شي
export async function restore({ get = kvGet, set = kvSet, attempts = 3, wait = sleep, enabled = backend === 'postgres' } = {}) {
  if (!enabled) return;
  let data, lastErr;
  for (let a = 1; a <= attempts && !data; a++) {
    try {
      const d = {};
      for (const t of TABLES) d[t] = await get(`sqlite:${t}`);
      const bad = TABLES.filter(t => d[t] != null && !Array.isArray(d[t]));
      if (bad.length) throw new Error(`نسخة تالفة: ${bad.join('، ')}`);
      data = d;
    } catch (e) { lastErr = e; if (a < attempts) await wait(a === 1 ? 1000 : 3000); }
  }
  if (!data) return protect(`فشل استرجاع البيانات من Postgres: ${lastErr?.message || 'غير معروف'}`);
  let restored = 0;
  const fk = db.pragma('foreign_keys', { simple: true });
  db.pragma('foreign_keys = OFF'); // المشاريع والتذاكر مربوطة ببعض؛ نرجّعها كلها ثم نرجّع الفحص
  try {
    db.transaction(() => {
      for (const t of TABLES) {
        const rows = data[t]; if (!rows) continue;
        db.prepare(`DELETE FROM ${t}`).run();
        if (t === 'documents') db.prepare('DELETE FROM doc_chunks').run();
        if (t === 'rag_chunks') db.prepare('DELETE FROM rag_fts').run();
        for (const r of rows) {
          const cols = Object.keys(r);
          db.prepare(`INSERT INTO ${t} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...cols.map(c => r[c]));
        }
        if (t === 'rag_chunks') { const ins = db.prepare('INSERT INTO rag_fts (norm, chunk_id) VALUES (?,?)'); rows.forEach(r => ins.run(normalize(`${r.title} ${r.section || ''} ${r.text}`), r.id)); }
        restored += rows.length;
      }
    })();
  } catch (e) { return protect(`فشل تطبيق النسخة: ${e.message}`); }
  finally { db.pragma(`foreign_keys = ${fk ? 'ON' : 'OFF'}`); }
  (data.documents || []).forEach(r => indexDocument(r.id, r.content));
  persistState.ready = true;
  console.log(`[persist] restored ${restored} rows from postgres`);
  await snapshot({ set, enabled }); // أول مرة: ناخذ نسخة من البيانات الحالية
}
