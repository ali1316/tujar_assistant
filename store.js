// store.js - First-class persistent storage using PostgreSQL (with SQLite fallback)
// Entities: memories, dashboards, kv, chat_sessions, chat_turns, datasets
import { db, initDb, getPool, backend as dbBackend, pgFallback as dbPgFallback } from './db.js';

export let backend = dbBackend;
export let pgFallback = dbPgFallback;

export async function initStore() {
  await initDb();
  backend = (await import('./db.js')).backend;
  pgFallback = (await import('./db.js')).pgFallback;
  console.log(`[store] ${backend}`);
}

const parse = v => {
  if (v == null) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return v; }
};

// ===== KV =====
export async function kvGet(key) {
  const pool = getPool();
  if (backend === 'postgres' && pool) {
    const r = await pool.query('SELECT value FROM kv WHERE key=$1', [key]);
    return r.rows[0]?.value ?? null;
  }
  const r = await db.prepare('SELECT value FROM kv WHERE key=?').get(key);
  return r ? parse(r.value) : null;
}

export async function kvSet(key, value) {
  const pool = getPool();
  if (backend === 'postgres' && pool) {
    return pool.query(
      'INSERT INTO kv (key, value, updated_at) VALUES ($1,$2,now()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()',
      [key, JSON.stringify(value)]
    );
  }
  return db.prepare(
    "INSERT INTO kv (key, value, updated_at) VALUES (?,?,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at"
  ).run(key, JSON.stringify(value));
}

// ===== الذاكرة =====
const memRow = r => (r ? { ...r, embedding: r.embedding ? parse(r.embedding) : null } : null);

export async function memAll() {
  const rows = await db.prepare('SELECT * FROM memories ORDER BY updated_at DESC').all();
  return rows.map(memRow);
}

export async function memAdd({ content, category, embedding }) {
  const pool = getPool();
  const e = embedding ? JSON.stringify(embedding) : null;
  if (backend === 'postgres' && pool) {
    const r = await pool.query(
      'INSERT INTO memories (content, category, embedding) VALUES ($1,$2,$3) RETURNING id',
      [content, category, e]
    );
    return r.rows[0].id;
  }
  const r = await db.prepare('INSERT INTO memories (content, category, embedding) VALUES (?,?,?)').run(content, category, e);
  return r.lastInsertRowid;
}

export async function memUpdate(id, { content, category, embedding }) {
  const pool = getPool();
  const e = embedding ? JSON.stringify(embedding) : null;
  if (backend === 'postgres' && pool) {
    return pool.query(
      'UPDATE memories SET content=$2, category=$3, embedding=$4, updated_at=now() WHERE id=$1',
      [id, content, category, e]
    );
  }
  return db.prepare(
    "UPDATE memories SET content=?, category=?, embedding=?, updated_at=datetime('now') WHERE id=?"
  ).run(content, category, e, id);
}

export async function memHit(ids) {
  if (!ids || !ids.length) return;
  const pool = getPool();
  if (backend === 'postgres' && pool) {
    return pool.query('UPDATE memories SET hits=hits+1 WHERE id = ANY($1)', [ids]);
  }
  for (const i of ids) {
    await db.prepare('UPDATE memories SET hits=hits+1 WHERE id=?').run(i);
  }
}

export async function memDelete(id) {
  const pool = getPool();
  if (backend === 'postgres' && pool) {
    const r = await pool.query('DELETE FROM memories WHERE id=$1', [id]);
    return r.rowCount;
  }
  const r = await db.prepare('DELETE FROM memories WHERE id=?').run(id);
  return r.changes;
}

// ===== الداشبوردات =====
export async function dashAdd(title, spec) {
  const pool = getPool();
  const specStr = JSON.stringify(spec);
  if (backend === 'postgres' && pool) {
    const r = await pool.query(
      'INSERT INTO dashboards (title, spec) VALUES ($1,$2) RETURNING id',
      [title, specStr]
    );
    return r.rows[0].id;
  }
  const r = await db.prepare('INSERT INTO dashboards (title, spec) VALUES (?,?)').run(title, specStr);
  return r.lastInsertRowid;
}

export async function dashGet(id) {
  const pool = getPool();
  if (backend === 'postgres' && pool) {
    const r = await pool.query('SELECT * FROM dashboards WHERE id=$1', [id]);
    return r.rows[0] ? { ...r.rows[0], spec: parse(r.rows[0].spec) } : null;
  }
  const r = await db.prepare('SELECT * FROM dashboards WHERE id=?').get(id);
  return r ? { ...r, spec: parse(r.spec) } : null;
}

export async function dashList() {
  const pool = getPool();
  if (backend === 'postgres' && pool) {
    const r = await pool.query('SELECT id, title, created_at FROM dashboards ORDER BY id DESC LIMIT 30');
    return r.rows;
  }
  return db.prepare('SELECT id, title, created_at FROM dashboards ORDER BY id DESC LIMIT 30').all();
}

// ===== سجل المحادثات =====
export async function chatStart() {
  const pool = getPool();
  if (backend === 'postgres' && pool) {
    const r = await pool.query('INSERT INTO chat_sessions DEFAULT VALUES RETURNING id');
    return r.rows[0].id;
  }
  const r = await db.prepare('INSERT INTO chat_sessions DEFAULT VALUES').run();
  return r.lastInsertRowid;
}

export async function chatAppend(sessionId, turns) {
  for (const t of turns) {
    await db.prepare('INSERT INTO chat_turns (session_id, role, text) VALUES (?,?,?)').run(sessionId, t.role, t.text);
  }
  const pool = getPool();
  if (backend === 'postgres' && pool) {
    await pool.query('UPDATE chat_sessions SET turns=turns+$1, last_at=now() WHERE id=$2', [turns.length, sessionId]);
  } else {
    await db.prepare("UPDATE chat_sessions SET turns=turns+?, last_at=datetime('now') WHERE id=?").run(turns.length, sessionId);
  }
}

export async function chatTurns(sessionId, afterIndex = 0) {
  const pool = getPool();
  if (backend === 'postgres' && pool) {
    const r = await pool.query(
      'SELECT role, text, created_at FROM chat_turns WHERE session_id=$1 ORDER BY id OFFSET $2',
      [sessionId, afterIndex]
    );
    return r.rows;
  }
  return db.prepare(
    'SELECT role, text, created_at FROM chat_turns WHERE session_id=? ORDER BY id LIMIT -1 OFFSET ?'
  ).all(sessionId, afterIndex);
}

export async function chatRecentTurns(limit = 30) {
  const pool = getPool();
  if (backend === 'postgres' && pool) {
    const r = await pool.query(
      'SELECT * FROM (SELECT id, session_id, role, text, created_at FROM chat_turns ORDER BY id DESC LIMIT $1) t ORDER BY id',
      [limit]
    );
    return r.rows;
  }
  return db.prepare(
    'SELECT * FROM (SELECT id, session_id, role, text, created_at FROM chat_turns ORDER BY id DESC LIMIT ?) ORDER BY id'
  ).all(limit);
}

export async function chatSessions(limit = 50) {
  const pool = getPool();
  const rows = backend === 'postgres' && pool
    ? (await pool.query('SELECT * FROM chat_sessions WHERE turns>0 ORDER BY id DESC LIMIT $1', [limit])).rows
    : await db.prepare('SELECT * FROM chat_sessions WHERE turns>0 ORDER BY id DESC LIMIT ?').all(limit);
  return rows.map(s => ({ ...s, embedding: s.embedding ? parse(s.embedding) : null }));
}

export async function chatPending() {
  return db.prepare('SELECT id FROM chat_sessions WHERE turns > digested_turns ORDER BY id').all();
}

export async function chatSetDigest(id, { summary, embedding, digested }) {
  const pool = getPool();
  const e = embedding ? JSON.stringify(embedding) : null;
  if (backend === 'postgres' && pool) {
    return pool.query(
      'UPDATE chat_sessions SET summary=$1, embedding=$2, digested_turns=$3 WHERE id=$4',
      [summary, e, digested, id]
    );
  }
  return db.prepare(
    'UPDATE chat_sessions SET summary=?, embedding=?, digested_turns=? WHERE id=?'
  ).run(summary, e, digested, id);
}

export async function chatGet(id) {
  const r = await db.prepare('SELECT * FROM chat_sessions WHERE id=?').get(id);
  return r || null;
}

export async function chatSearchText(word, limit = 8) {
  const pool = getPool();
  if (backend === 'postgres' && pool) {
    const r = await pool.query(
      'SELECT session_id, role, text, created_at FROM chat_turns WHERE text ILIKE $1 ORDER BY id DESC LIMIT $2',
      [`%${word}%`, limit]
    );
    return r.rows;
  }
  return db.prepare(
    'SELECT session_id, role, text, created_at FROM chat_turns WHERE text LIKE ? ORDER BY id DESC LIMIT ?'
  ).all(`%${word}%`, limit);
}

// ===== البيانات المنظّمة من ملفات Excel/CSV =====
const dsRow = r => r && ({ ...r, columns: parse(r.columns), rows: parse(r.rows), profile: r.profile ? parse(r.profile) : null });

export async function datasetAdd({ doc_id, doc_name, sheet, columns, rows, profile }) {
  const a = [doc_id, doc_name, sheet, JSON.stringify(columns), JSON.stringify(rows), JSON.stringify(profile)];
  const pool = getPool();
  if (backend === 'postgres' && pool) {
    const r = await pool.query(
      'INSERT INTO datasets (doc_id, doc_name, sheet, columns, rows, profile) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      a
    );
    return r.rows[0].id;
  }
  const r = await db.prepare('INSERT INTO datasets (doc_id, doc_name, sheet, columns, rows, profile) VALUES (?,?,?,?,?,?)').run(...a);
  return r.lastInsertRowid;
}

export async function datasetGet(id) {
  const r = await db.prepare('SELECT * FROM datasets WHERE id=?').get(id);
  return dsRow(r);
}

export async function datasetsForDoc(docId) {
  const rows = await db.prepare('SELECT * FROM datasets WHERE doc_id=? ORDER BY id').all(docId);
  return rows.map(dsRow);
}

export async function datasetsRecent(n = 30) {
  const rows = await db.prepare('SELECT * FROM datasets ORDER BY id DESC LIMIT ?').all(n);
  return rows.map(dsRow);
}

export async function datasetsLatest() {
  const rows = await db.prepare('SELECT * FROM datasets WHERE doc_id = (SELECT MAX(doc_id) FROM datasets) ORDER BY id').all();
  return rows.map(dsRow);
}

// ===== قفل استشاري (Postgres) =====
const localLocks = new Set();
export async function withLock(key, fn) {
  if (localLocks.has(key)) return { locked: false };
  localLocks.add(key);
  let client = null;
  const pool = getPool();
  try {
    if (backend === 'postgres' && pool) {
      client = await pool.connect();
      const r = await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS ok', [key]);
      if (!r.rows[0].ok) return { locked: false };
    }
    return { locked: true, value: await fn() };
  } finally {
    localLocks.delete(key);
    if (client) {
      await client.query('SELECT pg_advisory_unlock(hashtext($1))', [key]).catch(() => {});
      client.release();
    }
  }
}

// ===== إدارة: قراءة/مسح الجداول =====
export const STORE_TABLES = ['memories', 'dashboards', 'chat_sessions', 'chat_turns', 'datasets'];

export async function storeDump(t) {
  if (!STORE_TABLES.includes(t)) throw new Error('جدول غير معروف');
  return db.prepare(`SELECT * FROM ${t}`).all();
}

export async function storeClear(t) {
  if (!STORE_TABLES.includes(t)) throw new Error('جدول غير معروف');
  const r = await db.prepare(`DELETE FROM ${t}`).run();
  return r.changes;
}

export async function kvKeys(prefixes) {
  const pool = getPool();
  const like = prefixes.map(p => (p.endsWith('*') ? p.slice(0, -1) + '%' : p));
  if (backend === 'postgres' && pool) {
    const r = await pool.query('SELECT key FROM kv WHERE key LIKE ANY($1)', [like]);
    return r.rows.map(x => x.key);
  }
  const where = like.map(() => 'key LIKE ?').join(' OR ');
  const rows = await db.prepare(`SELECT key FROM kv WHERE ${where}`).all(...like);
  return rows.map(x => x.key);
}

export async function kvDelete(keys) {
  if (!keys || !keys.length) return 0;
  const pool = getPool();
  if (backend === 'postgres' && pool) {
    const r = await pool.query('DELETE FROM kv WHERE key = ANY($1)', [keys]);
    return r.rowCount;
  }
  let total = 0;
  for (const k of keys) {
    const r = await db.prepare('DELETE FROM kv WHERE key=?').run(k);
    total += r.changes;
  }
  return total;
}
