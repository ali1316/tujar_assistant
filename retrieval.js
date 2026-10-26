// البحث الهجين (مستوحى من SurfSense: FTS5 + متجهات في SQLite، ومزج موزون 0.65 معنى + 0.35 تغطية كلمات)
// + استشهاد بالمصدر (مستوحى من notebooklm-py: كل مقطع يحمل الملف والقسم والصفحة والأسطر)
// المصادر: الملفات المرفوعة (documents) + أقسام مكتبة المعرفة + «دليل» لكل مصدر (العنوان/الغرض/الملخص).
import crypto from 'node:crypto';
import { db } from './db.js';
import { normalize } from './docs.js';
import { embed, embedMany, cos } from './memory.js';
import { kList } from './knowledge.js';
import { snapshotSoon } from './persist.js';

for (const c of ['summary', 'sha256']) if (!db.prepare('PRAGMA table_info(documents)').all().some(x => x.name === c)) db.exec(`ALTER TABLE documents ADD COLUMN ${c} TEXT`);
db.exec(`
CREATE TABLE IF NOT EXISTS rag_chunks (id INTEGER PRIMARY KEY, src TEXT NOT NULL, src_hash TEXT NOT NULL, title TEXT, section TEXT,
  page TEXT, line_from INTEGER, line_to INTEGER, text TEXT NOT NULL, vec TEXT);
CREATE INDEX IF NOT EXISTS rag_src ON rag_chunks(src);
CREATE VIRTUAL TABLE IF NOT EXISTS rag_fts USING fts5(norm, chunk_id UNINDEXED, tokenize = 'unicode61 remove_diacritics 2');
`);

export const W_COS = 0.65, W_COV = 0.35; // أوزان SurfSense (ADR 0031)؛ تُقاس بمجموعة الأسئلة العربية
const TARGET = 900, MIN = 220;
const STOP = new Set(('في من على الى عن مع او و ثم لا ما هذا هذه ذلك التي الذي كل بين حتى عند قد هل كم وش ايش اش ليش ليه مين متى كيف وين اللي الي ' +
  'هو هي هم كان تم ان عطيني وريني ابي ابغى ابغا قولي قول اعرضي اعرض بكم قديش شنو يعني صار صارت فيها فيه عندنا عندهم لو').split(' ').map(normalize));
export const terms = q => [...new Set(normalize(String(q)).replace(/[^\p{L}\p{N}%.,–\-\s]/gu, ' ').split(/\s+/).map(w => w.replace(/^[وبلف](?=\p{L}{4,})/u, '')).filter(w => w.length > 1 && !STOP.has(w)))];
const squash = s => normalize(String(s)).replace(/[\s‏‎]+/g, '');
const sha = s => crypto.createHash('sha1').update(s).digest('hex');

// ===== 1) التقطيع حسب البنية: عناوين ← فقرات ← أسطر ← جمل ← كلمات =====
const SEPS = [[/\n(?=#{1,3} )/, '\n'], [/\n\s*\n/, '\n\n'], [/\n/, '\n'], [/(?<=[.!?؟؛])\s+/, ' '], [/\s+/, ' ']];
function splitRec(text, level = 0) {
  if (text.length <= TARGET) return [text];
  if (level >= SEPS.length) { const out = []; for (let i = 0; i < text.length; i += TARGET) out.push(text.slice(i, i + TARGET)); return out; }
  const [re, joiner] = SEPS[level];
  const parts = text.split(re).filter(p => p.trim());
  if (parts.length <= 1) return splitRec(text, level + 1);
  const out = []; let cur = '';
  for (const p of parts) {
    if (cur && (cur.length + joiner.length + p.length) > TARGET) { out.push(cur); cur = p; } else cur = cur ? cur + joiner + p : p;
  }
  if (cur) out.push(cur);
  return out.flatMap(c => (c.length > TARGET * 1.4 ? splitRec(c, level + 1) : [c]));
}
export function chunkText(text) {
  const raw = splitRec(String(text).trim());
  const merged = [];
  for (const c of raw) { if (merged.length && (merged.at(-1).length < MIN || c.length < MIN) && merged.at(-1).length + c.length < TARGET * 1.3) merged[merged.length - 1] += '\n' + c; else merged.push(c); }
  // مواقع المقاطع: رقم الصفحة (\f بين الصفحات) والأسطر
  let pos = 0;
  return merged.map(c => {
    const at = Math.max(0, text.indexOf(c.slice(0, 40), pos)); pos = at + 1;
    const before = text.slice(0, at);
    const line_from = before.split('\n').length, line_to = line_from + (c.match(/\n/g) || []).length;
    const pages = (before.match(/\f/g) || []).length;
    return { text: c.replace(/\f/g, '\n').trim(), line_from, line_to, page: text.includes('\f') ? String(pages + 1) : null };
  }).filter(c => c.text.length > 20);
}

// ===== 2) بناء الفهرس (تدريجي: يعيد بناء المصدر اللي تغيّر محتواه فقط) =====
async function sources() {
  const out = [];
  for (const d of db.prepare('SELECT id, name, content, summary FROM documents').all()) {
    const chunks = chunkText(d.content).map(c => ({ ...c, section: c.text.split('\n')[0].slice(0, 70) }));
    if (d.summary) chunks.unshift({ text: `${d.name}\n${d.summary}`, section: 'دليل الملف', page: null, line_from: null, line_to: null, guide: true });
    out.push({ src: `doc:${d.id}`, title: d.name, hash: sha(d.name + d.content + (d.summary || '')), chunks });
  }
  for (const e of await kList()) {
    const chunks = [{ text: `${e.title}\n${e.purpose || ''}\n${e.summary || ''}${e.columns?.length ? `\nالأعمدة: ${e.columns.join('، ')}` : ''}`, section: 'دليل الملف', page: null, line_from: null, line_to: null, guide: true }];
    for (const s of e.sections || []) {
      const page = (s.heading.match(/ص\s*(\d+)/) || [])[1] || null;
      for (const c of chunkText(s.text)) chunks.push({ ...c, section: `${s.n}. ${s.heading.replace(/\s*—\s*ص\s*\d+$/, '')}`, page: page || c.page });
    }
    out.push({ src: `kn:${e.id}`, title: e.title, hash: sha(e.sha256 + (e.pipeline || '') + (e.summary || '') + JSON.stringify(e.sections || []).length), chunks });
  }
  return out;
}

let building = null, vecCache = null, dirty = true, lastStatus = null, lastMissingTry = 0;
// يتعلّم الفهرس مرة عند التشغيل وبعد أي رفع/استيراد فقط؛ غير كذا يرجع فوراً (ما يأخر أدوات نورة)
export function invalidateIndex() { vecCache = null; dirty = true; }
export function ensureIndex() {
  if (!dirty && lastStatus && !building) return Promise.resolve(lastStatus);
  if (!building) building = (async () => {
    dirty = false;
    const t0 = Date.now(); let added = 0;
    const srcs = await sources();
    const have = new Map(db.prepare('SELECT src, MIN(src_hash) h FROM rag_chunks GROUP BY src').all().map(r => [r.src, r.h]));
    const live = new Set(srcs.map(s => s.src));
    const del = db.prepare('DELETE FROM rag_chunks WHERE src=?'), delF = db.prepare('DELETE FROM rag_fts WHERE chunk_id IN (SELECT id FROM rag_chunks WHERE src=?)');
    for (const src of have.keys()) if (!live.has(src)) { delF.run(src); del.run(src); }
    for (const s of srcs) {
      if (have.get(s.src) === s.hash) continue;
      const vecs = await embedMany(s.chunks.map(c => `${s.title} | ${c.section || ''}\n${c.text}`.slice(0, 6000)));
      const ins = db.prepare('INSERT INTO rag_chunks (src, src_hash, title, section, page, line_from, line_to, text, vec) VALUES (?,?,?,?,?,?,?,?,?)');
      const insF = db.prepare('INSERT INTO rag_fts (norm, chunk_id) VALUES (?,?)');
      db.transaction(() => {
        delF.run(s.src); del.run(s.src);
        s.chunks.forEach((c, i) => {
          const id = ins.run(s.src, s.hash, s.title, c.section || null, c.page, c.line_from, c.line_to, c.text, vecs?.[i] ? JSON.stringify(vecs[i].map(v => +v.toFixed(5))) : null).lastInsertRowid;
          insF.run(normalize(`${s.title} ${c.section || ''} ${c.text}`), id);
        });
      })();
      added += s.chunks.length;
    }
    if (added) { vecCache = null; snapshotSoon(); }
    // مصادر فهرسناها وقت تعطّل الـ embeddings: نكمل متجهاتها
    const missing = Date.now() - lastMissingTry > 600e3 ? db.prepare('SELECT id, title, section, text FROM rag_chunks WHERE vec IS NULL LIMIT 400').all() : [];
    if (missing.length) {
      lastMissingTry = Date.now();
      const vecs = await embedMany(missing.map(c => `${c.title} | ${c.section || ''}\n${c.text}`.slice(0, 6000)));
      if (vecs?.some(Boolean)) { const up = db.prepare('UPDATE rag_chunks SET vec=? WHERE id=?'); db.transaction(() => missing.forEach((c, i) => vecs[i] && up.run(JSON.stringify(vecs[i].map(v => +v.toFixed(5))), c.id)))(); vecCache = null; snapshotSoon(); }
    }
    const n = db.prepare('SELECT COUNT(*) c, SUM(vec IS NOT NULL) v FROM rag_chunks').get();
    console.log(`[rag] index ready: ${n.c} chunks (${n.v} with vectors), +${added} in ${Date.now() - t0}ms`);
    if (n.c && n.v < n.c) dirty = true; // نكمل المتجهات الناقصة في المرة الجاية (بعد 10 دقائق)
    lastStatus = n; return n;
  })().finally(() => { building = null; });
  return building;
}
function vectors() {
  if (!vecCache) {
    vecCache = db.prepare('SELECT id, vec FROM rag_chunks WHERE vec IS NOT NULL').all().map(r => ({ id: r.id, v: Float32Array.from(JSON.parse(r.vec)) }));
  }
  return vecCache;
}

// جودة النص: نسبة الكلمات المكسورة من استخراج PDF (حرف عربي مفرد، أو حروف ملتصقة بأرقام طويلة)
const SHORT_OK = new Set(['في', 'من', 'عن', 'او', 'أو', 'لا', 'ما', 'هو', 'هي', 'إن', 'أن', 'ان', 'لم', 'لن', 'قد', 'كل', 'ثم', 'بل', 'يا', 'إذ', 'به', 'له', 'لك', 'كم', 'مع', 'ذا', 'كي', 'و']);
export const badToken = t => { const w = t.replace(/[«»"'()،,:؛.؟?!·–-]/g, ''); return (/^\p{Script=Arabic}{1,2}$/u.test(w) && !SHORT_OK.has(w)) || /\p{Script=Arabic}[0-9٠-٩]|[0-9٠-٩]\p{Script=Arabic}/u.test(w); };
export function garble(text) {
  const toks = String(text || '').split(/\s+/).filter(t => /\p{Script=Arabic}/u.test(t));
  if (toks.length < 3) return 0;
  return toks.filter(badToken).length / toks.length;
}

// ===== 3) البحث الهجين =====
export async function hybridSearch(q, { k = 5, prefix = null, useVectors = true } = {}) {
  const t0 = performance.now();
  const ts = terms(q);
  const filt = r => !prefix || r.src.startsWith(prefix);
  const cand = new Map();
  if (ts.length) {
    const match = ts.map(t => `"${t.replace(/"/g, '')}"*`).join(' OR ');
    for (const r of db.prepare('SELECT chunk_id id, bm25(rag_fts) b FROM rag_fts WHERE rag_fts MATCH ? ORDER BY b LIMIT 40').all(match)) cand.set(r.id, { cos: 0 });
  }
  let qv = null;
  const st = lastStatus || db.prepare('SELECT COUNT(*) c, SUM(vec IS NOT NULL) v FROM rag_chunks').get();
  if (useVectors && st.c && st.v / st.c >= 0.9) {
    qv = await embed(String(q));
    if (qv) {
      const scored = vectors().map(x => ({ id: x.id, c: cos(qv, x.v) })).sort((a, b) => b.c - a.c).slice(0, 40);
      for (const s of scored) cand.set(s.id, { cos: s.c });
      if (cand.size) { for (const [id, o] of cand) if (!o.cos) { const x = vectors().find(y => y.id === id); if (x) o.cos = cos(qv, x.v); } }
    }
  }
  if (!cand.size) return { hits: [], ms: performance.now() - t0, mode: qv ? 'hybrid' : 'keyword' };
  const rows = db.prepare(`SELECT id, src, title, section, page, line_from, line_to, text FROM rag_chunks WHERE id IN (${[...cand.keys()].join(',')})`).all().filter(filt);
  const hits = rows.map(r => {
    const hay = normalize(`${r.title} ${r.section || ''} ${r.text}`), hs = hay.replace(/\s+/g, '');
    const cov = ts.length ? ts.filter(t => hay.includes(t) || hs.includes(t)).length / ts.length : 0;
    const c = Math.max(0, cand.get(r.id)?.cos || 0);
    const q = 1 - Math.min(0.4, garble(r.text) * 2); // نص PDF مكسور («غر فة تجار ية17») ينزل تحت النص السليم
    return { ...r, cos: +c.toFixed(4), cov: +cov.toFixed(3), quality: +q.toFixed(3), score: +((qv ? W_COS * c + W_COV * cov : cov) * q).toFixed(4) };
  }).sort((a, b) => b.score - a.score).slice(0, k).map((h, i) => ({ n: i + 1, ...h }));
  return { hits, ms: performance.now() - t0, mode: qv ? 'hybrid' : 'keyword' };
}
export const cite = h => `${h.title}${h.section && h.section !== 'دليل الملف' ? ` · ${h.section}` : ''}${h.page ? ` · ص${h.page}` : ''}`;

// ===== 4) تقييم الاسترجاع (أسئلة عربية مع نص متوقع، مثل retrieval_eval في SurfSense) =====
export async function evaluate(cases, runners) {
  const report = {};
  for (const [mode, run] of Object.entries(runners)) {
    let h1 = 0, h3 = 0, h5 = 0, rr = 0, ms = 0; const misses = [];
    for (const c of cases) {
      const t0 = performance.now(); const texts = (await run(c.q)).slice(0, 5); ms += performance.now() - t0;
      const exp = (Array.isArray(c.expect) ? c.expect : [c.expect]).map(squash);
      const rank = texts.findIndex(t => exp.some(e => squash(t).includes(e))) + 1;
      if (rank === 1) h1++; if (rank && rank <= 3) h3++; if (rank) { h5++; rr += 1 / rank; } else misses.push(c.q);
    }
    const n = cases.length || 1;
    report[mode] = { hit1: +(h1 / n).toFixed(3), hit3: +(h3 / n).toFixed(3), hit5: +(h5 / n).toFixed(3), mrr: +(rr / n).toFixed(3), avg_ms: Math.round(ms / n), misses };
  }
  return report;
}
