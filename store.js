// تخزين دائم: Postgres لو فيه DATABASE_URL (Render)، وإلا SQLite محلي
// يحفظ: ذاكرة نورة، الداشبوردات المولّدة، إعدادات الواجهة
import pg from 'pg';
import { db } from './db.js';

const URL = process.env.DATABASE_URL;
export let backend = URL ? 'postgres' : 'sqlite';
let pool;

export async function initStore() {
  if (URL) try {
    pool = new pg.Pool({ connectionString: URL, ssl: /render\.com|sslmode=require/.test(URL) ? { rejectUnauthorized: false } : undefined, max: 5 });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS memories (id SERIAL PRIMARY KEY, content TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'fact',
        embedding JSONB, hits INT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());
      CREATE TABLE IF NOT EXISTS dashboards (id SERIAL PRIMARY KEY, title TEXT NOT NULL, spec JSONB NOT NULL, created_at TIMESTAMPTZ DEFAULT now());
      CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value JSONB NOT NULL, updated_at TIMESTAMPTZ DEFAULT now());
      CREATE TABLE IF NOT EXISTS chat_sessions (id SERIAL PRIMARY KEY, started_at TIMESTAMPTZ DEFAULT now(), last_at TIMESTAMPTZ DEFAULT now(),
        summary TEXT, embedding JSONB, turns INT NOT NULL DEFAULT 0, digested_turns INT NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS chat_turns (id SERIAL PRIMARY KEY, session_id INT NOT NULL, role TEXT NOT NULL, text TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now());
      CREATE INDEX IF NOT EXISTS chat_turns_session ON chat_turns(session_id, id);
      CREATE TABLE IF NOT EXISTS datasets (id SERIAL PRIMARY KEY, doc_id INT, doc_name TEXT, sheet TEXT NOT NULL, columns JSONB NOT NULL, rows JSONB NOT NULL, profile JSONB, created_at TIMESTAMPTZ DEFAULT now());`);
  } catch (e) {
    console.error('[store] postgres failed, falling back to sqlite:', e.message);
    pool = null; backend = 'sqlite';
  }
  if (!pool) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS memories (id INTEGER PRIMARY KEY, content TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'fact',
        embedding TEXT, hits INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
      CREATE TABLE IF NOT EXISTS dashboards (id INTEGER PRIMARY KEY, title TEXT NOT NULL, spec TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')));
      CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT DEFAULT (datetime('now')));
      CREATE TABLE IF NOT EXISTS chat_sessions (id INTEGER PRIMARY KEY, started_at TEXT DEFAULT (datetime('now')), last_at TEXT DEFAULT (datetime('now')),
        summary TEXT, embedding TEXT, turns INTEGER NOT NULL DEFAULT 0, digested_turns INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS chat_turns (id INTEGER PRIMARY KEY, session_id INTEGER NOT NULL, role TEXT NOT NULL, text TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')));
      CREATE INDEX IF NOT EXISTS chat_turns_session ON chat_turns(session_id, id);
      CREATE TABLE IF NOT EXISTS datasets (id INTEGER PRIMARY KEY, doc_id INTEGER, doc_name TEXT, sheet TEXT NOT NULL, columns TEXT NOT NULL, rows TEXT NOT NULL, profile TEXT, created_at TEXT DEFAULT (datetime('now')));`);
  }
  console.log(`[store] ${backend}`);
}

const parse = v => (typeof v === 'string' ? JSON.parse(v) : v);

// ===== KV =====
export async function kvGet(key) {
  if (pool) { const r = await pool.query('SELECT value FROM kv WHERE key=$1', [key]); return r.rows[0]?.value ?? null; }
  const r = db.prepare('SELECT value FROM kv WHERE key=?').get(key); return r ? parse(r.value) : null;
}
export async function kvSet(key, value) {
  if (pool) return pool.query('INSERT INTO kv (key, value, updated_at) VALUES ($1,$2,now()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()', [key, JSON.stringify(value)]);
  db.prepare("INSERT INTO kv (key, value, updated_at) VALUES (?,?,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at").run(key, JSON.stringify(value));
}

// ===== الذاكرة =====
const memRow = r => ({ ...r, embedding: r.embedding ? parse(r.embedding) : null });
export async function memAll() {
  if (pool) return (await pool.query('SELECT * FROM memories ORDER BY updated_at DESC')).rows.map(memRow);
  return db.prepare('SELECT * FROM memories ORDER BY updated_at DESC').all().map(memRow);
}
export async function memAdd({ content, category, embedding }) {
  const e = embedding ? JSON.stringify(embedding) : null;
  if (pool) return (await pool.query('INSERT INTO memories (content, category, embedding) VALUES ($1,$2,$3) RETURNING id', [content, category, e])).rows[0].id;
  return db.prepare('INSERT INTO memories (content, category, embedding) VALUES (?,?,?)').run(content, category, e).lastInsertRowid;
}
export async function memUpdate(id, { content, category, embedding }) {
  const e = embedding ? JSON.stringify(embedding) : null;
  if (pool) return pool.query('UPDATE memories SET content=$2, category=$3, embedding=$4, updated_at=now() WHERE id=$1', [id, content, category, e]);
  db.prepare("UPDATE memories SET content=?, category=?, embedding=?, updated_at=datetime('now') WHERE id=?").run(content, category, e, id);
}
export async function memHit(ids) {
  if (!ids.length) return;
  if (pool) return pool.query('UPDATE memories SET hits=hits+1 WHERE id = ANY($1)', [ids]);
  const s = db.prepare('UPDATE memories SET hits=hits+1 WHERE id=?'); ids.forEach(i => s.run(i));
}
export async function memDelete(id) {
  if (pool) return (await pool.query('DELETE FROM memories WHERE id=$1', [id])).rowCount;
  return db.prepare('DELETE FROM memories WHERE id=?').run(id).changes;
}

// ===== الداشبوردات =====
export async function dashAdd(title, spec) {
  if (pool) return (await pool.query('INSERT INTO dashboards (title, spec) VALUES ($1,$2) RETURNING id', [title, JSON.stringify(spec)])).rows[0].id;
  return db.prepare('INSERT INTO dashboards (title, spec) VALUES (?,?)').run(title, JSON.stringify(spec)).lastInsertRowid;
}
export async function dashGet(id) {
  const r = pool ? (await pool.query('SELECT * FROM dashboards WHERE id=$1', [id])).rows[0] : db.prepare('SELECT * FROM dashboards WHERE id=?').get(id);
  return r ? { ...r, spec: parse(r.spec) } : null;
}
export async function dashList() {
  if (pool) return (await pool.query('SELECT id, title, created_at FROM dashboards ORDER BY id DESC LIMIT 30')).rows;
  return db.prepare('SELECT id, title, created_at FROM dashboards ORDER BY id DESC LIMIT 30').all();
}

// ===== سجل المحادثات =====
const q = async (pgSql, liteSql, args = []) => pool ? (await pool.query(pgSql, args)).rows : db.prepare(liteSql).all(...args);
const run = async (pgSql, liteSql, args = []) => pool ? pool.query(pgSql, args) : db.prepare(liteSql).run(...args);

export async function chatStart() {
  if (pool) return (await pool.query('INSERT INTO chat_sessions DEFAULT VALUES RETURNING id')).rows[0].id;
  return db.prepare('INSERT INTO chat_sessions DEFAULT VALUES').run().lastInsertRowid;
}
export async function chatAppend(sessionId, turns) {
  for (const t of turns) await run('INSERT INTO chat_turns (session_id, role, text) VALUES ($1,$2,$3)', 'INSERT INTO chat_turns (session_id, role, text) VALUES (?,?,?)', [sessionId, t.role, t.text]);
  await run('UPDATE chat_sessions SET turns=turns+$1, last_at=now() WHERE id=$2', "UPDATE chat_sessions SET turns=turns+?, last_at=datetime('now') WHERE id=?", [turns.length, sessionId]);
}
export const chatTurns = (sessionId, afterIndex = 0) =>
  q('SELECT role, text, created_at FROM chat_turns WHERE session_id=$1 ORDER BY id OFFSET $2', 'SELECT role, text, created_at FROM chat_turns WHERE session_id=? ORDER BY id LIMIT -1 OFFSET ?', [sessionId, afterIndex]);
export const chatRecentTurns = (limit = 30) =>
  q('SELECT * FROM (SELECT id, session_id, role, text, created_at FROM chat_turns ORDER BY id DESC LIMIT $1) t ORDER BY id', 'SELECT * FROM (SELECT id, session_id, role, text, created_at FROM chat_turns ORDER BY id DESC LIMIT ?) ORDER BY id', [limit]);
export const chatSessions = (limit = 50) =>
  q('SELECT * FROM chat_sessions WHERE turns>0 ORDER BY id DESC LIMIT $1', 'SELECT * FROM chat_sessions WHERE turns>0 ORDER BY id DESC LIMIT ?', [limit]).then(r => r.map(s => ({ ...s, embedding: s.embedding ? parse(s.embedding) : null })));
export const chatPending = () =>
  q('SELECT id FROM chat_sessions WHERE turns > digested_turns ORDER BY id', 'SELECT id FROM chat_sessions WHERE turns > digested_turns ORDER BY id');
export async function chatSetDigest(id, { summary, embedding, digested }) {
  await run('UPDATE chat_sessions SET summary=$1, embedding=$2, digested_turns=$3 WHERE id=$4', 'UPDATE chat_sessions SET summary=?, embedding=?, digested_turns=? WHERE id=?',
    [summary, embedding ? JSON.stringify(embedding) : null, digested, id]);
}
export const chatGet = id => q('SELECT * FROM chat_sessions WHERE id=$1', 'SELECT * FROM chat_sessions WHERE id=?', [id]).then(r => r[0] || null);
export const chatSearchText = (word, limit = 8) =>
  q('SELECT session_id, role, text, created_at FROM chat_turns WHERE text ILIKE $1 ORDER BY id DESC LIMIT $2', 'SELECT session_id, role, text, created_at FROM chat_turns WHERE text LIKE ? ORDER BY id DESC LIMIT ?', [`%${word}%`, limit]);

// ===== البيانات المنظّمة من ملفات Excel/CSV (جاهزة للشارتات الفورية) =====
const dsRow = r => r && ({ ...r, columns: parse(r.columns), rows: parse(r.rows), profile: r.profile ? parse(r.profile) : null });
export async function datasetAdd({ doc_id, doc_name, sheet, columns, rows, profile }) {
  const a = [doc_id, doc_name, sheet, JSON.stringify(columns), JSON.stringify(rows), JSON.stringify(profile)];
  if (pool) return (await pool.query('INSERT INTO datasets (doc_id, doc_name, sheet, columns, rows, profile) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', a)).rows[0].id;
  return db.prepare('INSERT INTO datasets (doc_id, doc_name, sheet, columns, rows, profile) VALUES (?,?,?,?,?,?)').run(...a).lastInsertRowid;
}
export const datasetGet = id => q('SELECT * FROM datasets WHERE id=$1', 'SELECT * FROM datasets WHERE id=?', [id]).then(r => dsRow(r[0]));
export const datasetsForDoc = docId => q('SELECT * FROM datasets WHERE doc_id=$1 ORDER BY id', 'SELECT * FROM datasets WHERE doc_id=? ORDER BY id', [docId]).then(r => r.map(dsRow));
export const datasetsRecent = (n = 30) => q('SELECT * FROM datasets ORDER BY id DESC LIMIT $1', 'SELECT * FROM datasets ORDER BY id DESC LIMIT ?', [n]).then(r => r.map(dsRow));
export const datasetsLatest = () => q('SELECT * FROM datasets WHERE doc_id = (SELECT MAX(doc_id) FROM datasets) ORDER BY id', 'SELECT * FROM datasets WHERE doc_id = (SELECT MAX(doc_id) FROM datasets) ORDER BY id').then(r => r.map(dsRow));
