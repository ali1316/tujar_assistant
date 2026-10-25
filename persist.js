// بيانات SQLite (المشاريع، التذاكر، طلبات التطوير، الملفات) تنمسح مع كل نشر في Render المجاني.
// الحل: نأخذ نسخة منها في Postgres بعد كل تعديل، ونرجّعها تلقائياً أول ما يشتغل السيرفر.
import { db } from './db.js';
import { indexDocument } from './docs.js';
import { kvGet, kvSet, backend } from './store.js';

const TABLES = ['projects', 'tickets', 'dev_requests', 'documents', 'tasks'];
let timer;

export async function snapshot() {
  if (backend !== 'postgres') return;
  for (const t of TABLES) await kvSet(`sqlite:${t}`, db.prepare(`SELECT * FROM ${t}`).all());
}
export function snapshotSoon() { clearTimeout(timer); timer = setTimeout(() => snapshot().catch(e => console.error('[persist]', e.message)), 1500); }

export async function restore() {
  if (backend !== 'postgres') return;
  let restored = 0;
  const fk = db.pragma('foreign_keys', { simple: true });
  db.pragma('foreign_keys = OFF'); // المشاريع والتذاكر مربوطة ببعض؛ نرجّعها كلها ثم نرجّع الفحص
  try { for (const t of TABLES) {
    const rows = await kvGet(`sqlite:${t}`);
    if (!Array.isArray(rows)) continue;
    db.transaction(() => {
      db.prepare(`DELETE FROM ${t}`).run();
      if (t === 'documents') db.prepare('DELETE FROM doc_chunks').run();
      for (const r of rows) {
        const cols = Object.keys(r);
        db.prepare(`INSERT INTO ${t} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...cols.map(c => r[c]));
      }
    })();
    if (t === 'documents') rows.forEach(r => indexDocument(r.id, r.content));
    restored += rows.length;
  } } finally { db.pragma(`foreign_keys = ${fk ? 'ON' : 'OFF'}`); }
  console.log(`[persist] restored ${restored} rows from postgres`);
  await snapshot(); // أول مرة: ناخذ نسخة من البيانات الحالية
}
