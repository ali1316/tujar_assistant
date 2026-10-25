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
      CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value JSONB NOT NULL, updated_at TIMESTAMPTZ DEFAULT now());`);
  } catch (e) {
    console.error('[store] postgres failed, falling back to sqlite:', e.message);
    pool = null; backend = 'sqlite';
  }
  if (!pool) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS memories (id INTEGER PRIMARY KEY, content TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'fact',
        embedding TEXT, hits INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
      CREATE TABLE IF NOT EXISTS dashboards (id INTEGER PRIMARY KEY, title TEXT NOT NULL, spec TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')));
      CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT DEFAULT (datetime('now')));`);
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
