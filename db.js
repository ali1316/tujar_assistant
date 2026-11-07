// db.js - First-class PostgreSQL storage with graceful SQLite fallback
import pg from 'pg';
import Database from 'better-sqlite3';
import { PG_SCHEMA, SQLITE_SCHEMA, SEED_PROJECTS, SEED_TICKETS } from './schema.js';

const URL = process.env.DATABASE_URL;
export let backend = URL ? 'postgres' : 'sqlite';
export let pgFallback = '';
export let pool = null;
let sqliteDb = null;
let initialized = false;

// Table column mappings for PostgreSQL PRAGMA table_info simulation
const TABLE_COLUMNS = {
  projects: ['id', 'name', 'department', 'status', 'progress', 'budget', 'spent', 'owner', 'due_date', 'start_date'],
  tickets: ['id', 'project_id', 'title', 'priority', 'status', 'created_at'],
  dev_requests: ['id', 'title', 'details', 'status', 'dev_note', 'created_at', 'updated_at'],
  documents: ['id', 'name', 'type', 'size', 'chars', 'content', 'sha256', 'category', 'drive_id', 'drive_url', 'summary', 'uploaded_at'],
  tasks: ['id', 'title', 'notes', 'due_date', 'priority', 'status', 'created_at', 'updated_at'],
  agent_jobs: ['id', 'kind', 'request', 'status', 'result', 'steps', 'dev_request_id', 'created_at', 'updated_at'],
  datasets: ['id', 'doc_id', 'doc_name', 'sheet', 'columns', 'rows', 'profile', 'created_at'],
  memories: ['id', 'content', 'category', 'embedding', 'hits', 'created_at', 'updated_at'],
  dashboards: ['id', 'title', 'spec', 'created_at'],
  chat_sessions: ['id', 'started_at', 'last_at', 'summary', 'embedding', 'turns', 'digested_turns'],
  chat_turns: ['id', 'session_id', 'role', 'text', 'created_at'],
  doc_chunks: ['id', 'doc_id', 'idx', 'norm', 'content', 'created_at'],
  kv: ['key', 'value', 'updated_at'],
  settings: ['key', 'value', 'updated_at'],
  rag_chunks: ['id', 'src', 'src_hash', 'title', 'section', 'page', 'line_from', 'line_to', 'text', 'vec', 'updated_at'],
};

function getTableColumns(tableName) {
  const cols = TABLE_COLUMNS[String(tableName || '').toLowerCase()] || [];
  return cols.map(name => ({ name }));
}

function normalizeArgs(args) {
  if (args.length === 1 && Array.isArray(args[0])) return args[0];
  return args.map(a => (a === undefined ? null : a));
}

// Convert SQLite '?' placeholders to PostgreSQL '$1, $2, ...'
export function toPgSql(sql) {
  if (/\$\d+/.test(sql)) {
    return sql
      .replace(/datetime\('now'\)/gi, 'now()')
      .replace(/SUM\(vec IS NOT NULL\)/gi, 'SUM(CASE WHEN vec IS NOT NULL THEN 1 ELSE 0 END)');
  }
  let paramIndex = 1;
  let inString = false;
  let quoteChar = '';
  let result = '';

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (inString) {
      result += ch;
      if (ch === quoteChar) {
        if (sql[i + 1] === quoteChar) {
          result += sql[i + 1];
          i++;
        } else {
          inString = false;
        }
      }
    } else {
      if (ch === "'" || ch === '"') {
        inString = true;
        quoteChar = ch;
        result += ch;
      } else if (ch === '?') {
        result += `$${paramIndex++}`;
      } else {
        result += ch;
      }
    }
  }

  return result
    .replace(/datetime\('now'\)/gi, 'now()')
    .replace(/SUM\(vec IS NOT NULL\)/gi, 'SUM(CASE WHEN vec IS NOT NULL THEN 1 ELSE 0 END)');
}

// Initialize SQLite synchronously on import if DATABASE_URL is not set
function getSqlite() {
  if (!sqliteDb) {
    sqliteDb = new Database(process.env.DB_PATH || 'demo.db');
    try { sqliteDb.pragma('journal_mode = WAL'); } catch {}
    sqliteDb.exec(SQLITE_SCHEMA);
    const count = sqliteDb.prepare('SELECT COUNT(*) c FROM projects').get()?.c || 0;
    if (count === 0) {
      const p = sqliteDb.prepare(`INSERT INTO projects (name, department, status, progress, budget, spent, owner, due_date, start_date)
                                 VALUES (?,?,?,?,?,?,?,?,?)`);
      SEED_PROJECTS.forEach(r => p.run(...r));
      const t = sqliteDb.prepare('INSERT INTO tickets (project_id, title, priority, status) VALUES (?,?,?,?)');
      SEED_TICKETS.forEach(r => t.run(...r));
    }
  }
  return sqliteDb;
}

if (!URL) {
  try { getSqlite(); } catch (e) { console.warn('[db] initial sqlite setup warning:', e.message); }
}

export async function initDb() {
  if (initialized && (backend === 'postgres' ? !!pool : !!sqliteDb)) return;

  if (URL) {
    try {
      pool = new pg.Pool({
        connectionString: URL,
        ssl: /render\.com|sslmode=require/.test(URL) ? { rejectUnauthorized: false } : undefined,
        max: 10,
      });
      pool.on('error', e => console.warn('[db] idle pg client error:', e.message));

      await pool.query('SELECT 1');
      await pool.query(PG_SCHEMA);

      const res = await pool.query('SELECT COUNT(*) c FROM projects');
      const count = Number(res.rows[0]?.c || 0);
      if (count === 0) {
        for (const r of SEED_PROJECTS) {
          await pool.query(
            'INSERT INTO projects (name, department, status, progress, budget, spent, owner, due_date, start_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
            r
          );
        }
        for (const r of SEED_TICKETS) {
          await pool.query(
            'INSERT INTO tickets (project_id, title, priority, status) VALUES ($1,$2,$3,$4)',
            r
          );
        }
      }

      backend = 'postgres';
      initialized = true;
      console.log('[db] PostgreSQL initialized successfully (first-class storage)');
      return;
    } catch (e) {
      console.error('[db] PostgreSQL connection failed, falling back to SQLite:', e.message);
      pool = null;
      backend = 'sqlite';
      pgFallback = e.message;
    }
  }

  // SQLite fallback
  backend = 'sqlite';
  getSqlite();
  initialized = true;
  console.log(`[db] SQLite initialized (${process.env.DB_PATH || 'demo.db'})`);
}

export function getPool() {
  return pool;
}

export function getBackend() {
  return backend;
}

// Unified db client interface
export const db = {
  async query(sql, params = []) {
    const cleanParams = normalizeArgs(params);
    if (backend === 'postgres' && pool) {
      const pgSql = toPgSql(sql);
      const res = await pool.query(pgSql, cleanParams);
      const lastInsertRowid = res.rows[0]?.id ?? res.rows[0]?.key ?? res.rows[0]?.record_id ?? null;
      return {
        rows: res.rows,
        rowCount: res.rowCount,
        changes: res.rowCount,
        lastInsertRowid,
      };
    }
    const stmt = getSqlite().prepare(sql);
    const upper = sql.trim().toUpperCase();
    if (upper.startsWith('SELECT') || upper.startsWith('PRAGMA')) {
      const rows = stmt.all(...cleanParams);
      return { rows, rowCount: rows.length, changes: 0, lastInsertRowid: null };
    }
    const info = stmt.run(...cleanParams);
    return { rows: [], rowCount: info.changes, changes: info.changes, lastInsertRowid: info.lastInsertRowid };
  },

  async all(sql, params = []) {
    const cleanParams = normalizeArgs(params);
    if (backend === 'postgres' && pool) {
      const m = sql.match(/PRAGMA\s+table_info\s*\(\s*['"]?(\w+)['"]?\s*\)/i);
      if (m) return getTableColumns(m[1]);
      const res = await pool.query(toPgSql(sql), cleanParams);
      return res.rows;
    }
    return getSqlite().prepare(sql).all(...cleanParams);
  },

  async get(sql, params = []) {
    const cleanParams = normalizeArgs(params);
    if (backend === 'postgres' && pool) {
      const m = sql.match(/PRAGMA\s+table_info\s*\(\s*['"]?(\w+)['"]?\s*\)/i);
      if (m) return getTableColumns(m[1])[0] || null;
      const res = await pool.query(toPgSql(sql), cleanParams);
      return res.rows[0] || null;
    }
    return getSqlite().prepare(sql).get(...cleanParams);
  },

  async run(sql, params = []) {
    const cleanParams = normalizeArgs(params);
    if (backend === 'postgres' && pool) {
      let pgSql = toPgSql(sql);
      const upper = pgSql.trim().toUpperCase();
      if (upper.startsWith('INSERT') && !upper.includes('RETURNING')) {
        pgSql += ' RETURNING *';
      }
      const res = await pool.query(pgSql, cleanParams);
      const lastInsertRowid = res.rows[0]?.id ?? res.rows[0]?.key ?? res.rows[0]?.record_id ?? null;
      return {
        changes: res.rowCount,
        rowCount: res.rowCount,
        lastInsertRowid,
        rows: res.rows,
      };
    }
    return getSqlite().prepare(sql).run(...cleanParams);
  },

  async exec(sql) {
    if (backend === 'postgres' && pool) {
      if (/PRAGMA/i.test(sql) || /USING\s+fts5/i.test(sql)) return;
      return pool.query(sql);
    }
    return getSqlite().exec(sql);
  },

  prepare(sql) {
    if (backend === 'postgres' && pool) {
      const pragmaMatch = sql.match(/PRAGMA\s+table_info\s*\(\s*['"]?(\w+)['"]?\s*\)/i);
      if (pragmaMatch) {
        const cols = getTableColumns(pragmaMatch[1]);
        return {
          all: () => cols,
          get: () => cols[0] || null,
          run: () => ({ changes: 0, rowCount: 0, lastInsertRowid: null, rows: [] }),
        };
      }
      return {
        all: (...params) => db.all(sql, params),
        get: (...params) => db.get(sql, params),
        run: (...params) => db.run(sql, params),
      };
    }
    // SQLite mode: better-sqlite3 statement supports synchronous calls
    const stmt = getSqlite().prepare(sql);
    return {
      all: (...params) => stmt.all(...normalizeArgs(params)),
      get: (...params) => stmt.get(...normalizeArgs(params)),
      run: (...params) => stmt.run(...normalizeArgs(params)),
    };
  },

  async transaction(fn) {
    if (backend === 'postgres' && pool) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const res = await fn(client);
        await client.query('COMMIT');
        return res;
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    }
    return getSqlite().transaction(fn)();
  },

  pragma(str, opt) {
    if (backend === 'postgres') {
      if (typeof str === 'string' && /foreign_keys/i.test(str)) return 1;
      return true;
    }
    return getSqlite().pragma(str, opt);
  },
};

// Function calling tools for Gemini / Nora
export const tools = {
  get_dashboard_summary: {
    declaration: {
      name: 'get_dashboard_summary',
      description: 'ملخص عام للوحة: عدد المشاريع حسب الحالة، إجمالي الميزانية والمصروف، وعدد التذاكر المفتوحة.',
      parameters: { type: 'OBJECT', properties: {} },
    },
    run: async () => ({
      projects_by_status: await db.prepare('SELECT status, COUNT(*) count FROM projects GROUP BY status').all(),
      total_budget: Number((await db.prepare('SELECT SUM(budget) v FROM projects').get())?.v || 0),
      total_spent: Number((await db.prepare('SELECT SUM(spent) v FROM projects').get())?.v || 0),
      open_tickets: Number((await db.prepare("SELECT COUNT(*) v FROM tickets WHERE status != 'مغلقة'").get())?.v || 0),
      high_priority_open: Number((await db.prepare("SELECT COUNT(*) v FROM tickets WHERE status != 'مغلقة' AND priority='عالية'").get())?.v || 0),
    }),
  },

  search_projects: {
    declaration: {
      name: 'search_projects',
      description: 'البحث في المشاريع بالاسم أو الإدارة أو الحالة أو المسؤول. كل المعاملات اختيارية.',
      parameters: {
        type: 'OBJECT',
        properties: {
          query: { type: 'STRING', description: 'جزء من اسم المشروع أو المسؤول' },
          department: { type: 'STRING', description: 'اسم الإدارة' },
          status: { type: 'STRING', enum: ['قيد التنفيذ', 'متأخر', 'مكتمل', 'متوقف'] },
        },
      },
    },
    run: async ({ query, department, status } = {}) => {
      let sql = 'SELECT * FROM projects WHERE 1=1';
      const args = [];
      if (query) { sql += ' AND (name LIKE ? OR owner LIKE ?)'; args.push(`%${query}%`, `%${query}%`); }
      if (department) { sql += ' AND department LIKE ?'; args.push(`%${department}%`); }
      if (status) { sql += ' AND status = ?'; args.push(status); }
      return { projects: await db.prepare(sql).all(...args) };
    },
  },

  get_project_details: {
    declaration: {
      name: 'get_project_details',
      description: 'كل تفاصيل مشروع واحد: الميزانية والمصروف والإنجاز والموعد والتذاكر. ابحث برقم المشروع أو جزء من اسمه.',
      parameters: {
        type: 'OBJECT',
        properties: {
          project_id: { type: 'INTEGER' },
          name: { type: 'STRING', description: 'جزء من اسم المشروع' },
        },
      },
    },
    run: async ({ project_id, name } = {}) => {
      const p = project_id
        ? await db.prepare('SELECT * FROM projects WHERE id=?').get(project_id)
        : await db.prepare('SELECT * FROM projects WHERE name LIKE ? ORDER BY length(name) LIMIT 1').get(`%${(name || '').replace(/^ال/, '')}%`);
      if (!p) return { error: 'ما لقيت المشروع' };
      const tickets = await db.prepare('SELECT id, title, priority, status FROM tickets WHERE project_id=? ORDER BY id DESC').all(p.id);
      const days_left = Math.round((new Date(p.due_date) - new Date()) / 864e5);
      return {
        project: p,
        tickets,
        stats: {
          budget_used_pct: Math.round((p.spent / p.budget) * 100),
          remaining: p.budget - p.spent,
          days_left,
          open_tickets: tickets.filter(t => t.status !== 'مغلقة').length,
          high_open: tickets.filter(t => t.status !== 'مغلقة' && t.priority === 'عالية').length,
        },
      };
    },
  },

  list_tickets: {
    declaration: {
      name: 'list_tickets',
      description: 'عرض التذاكر مع فلترة اختيارية بالحالة أو الأولوية أو رقم المشروع.',
      parameters: {
        type: 'OBJECT',
        properties: {
          project_id: { type: 'INTEGER' },
          status: { type: 'STRING', enum: ['مفتوحة', 'قيد المعالجة', 'مغلقة'] },
          priority: { type: 'STRING', enum: ['عالية', 'متوسطة', 'منخفضة'] },
        },
      },
    },
    run: async ({ project_id, status, priority } = {}) => {
      let sql = `SELECT t.*, p.name project_name FROM tickets t JOIN projects p ON p.id=t.project_id WHERE 1=1`;
      const args = [];
      if (project_id) { sql += ' AND t.project_id = ?'; args.push(project_id); }
      if (status) { sql += ' AND t.status = ?'; args.push(status); }
      if (priority) { sql += ' AND t.priority = ?'; args.push(priority); }
      return { tickets: await db.prepare(sql + ' ORDER BY t.id DESC').all(...args) };
    },
  },

  create_ticket: {
    declaration: {
      name: 'create_ticket',
      description: 'إنشاء تذكرة جديدة على مشروع. استخدمها فقط إذا طلب المستخدم صراحةً إضافة تذكرة، وأكّد معه العنوان والأولوية قبل التنفيذ.',
      parameters: {
        type: 'OBJECT',
        properties: {
          project_id: { type: 'INTEGER' },
          title: { type: 'STRING' },
          priority: { type: 'STRING', enum: ['عالية', 'متوسطة', 'منخفضة'] },
        },
        required: ['project_id', 'title', 'priority'],
      },
    },
    write: true,
    run: async ({ project_id, title, priority }) => {
      const exists = await db.prepare('SELECT 1 FROM projects WHERE id=?').get(project_id);
      if (!exists) return { error: 'المشروع غير موجود' };
      const r = await db.prepare("INSERT INTO tickets (project_id, title, priority, status) VALUES (?,?,?,'مفتوحة')")
        .run(project_id, title, priority);
      return { ok: true, ticket_id: r.lastInsertRowid };
    },
  },

  request_dev_change: {
    declaration: {
      name: 'request_dev_change',
      description: 'يسجّل طلب تطوير كبير ما تقدرين تنفذينه بأدوات الواجهة (ميزة جديدة، صفحة، تكامل، تقرير، تعديل بالباك اند). المطوّر (Claude) يستلمه ويطوّره وينعكس على هذي الواجهة. اكتبي التفاصيل كاملة كما قالها المستخدم.',
      parameters: {
        type: 'OBJECT',
        properties: { title: { type: 'STRING' }, details: { type: 'STRING' } },
        required: ['title', 'details'],
      },
    },
    write: true,
    run: async ({ title, details }) => {
      const r = await db.prepare('INSERT INTO dev_requests (title, details) VALUES (?,?)').run(title, details);
      return { ok: true, request_id: r.lastInsertRowid, status: 'جديد' };
    },
  },

  add_task: {
    declaration: {
      name: 'add_task',
      description: 'يضيف مهمة لقائمة مهام فواز (إدارة المهام). due_date بصيغة YYYY-MM-DD لو ذكر موعد (احسبيه من تاريخ اليوم). priority: عالية/متوسطة/منخفضة.',
      parameters: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          notes: { type: 'STRING' },
          due_date: { type: 'STRING' },
          priority: { type: 'STRING', enum: ['عالية', 'متوسطة', 'منخفضة'] },
        },
        required: ['title'],
      },
    },
    write: true,
    run: async ({ title, notes = null, due_date = null, priority = 'متوسطة' }) => {
      const r = await db.prepare('INSERT INTO tasks (title, notes, due_date, priority) VALUES (?,?,?,?)').run(title, notes, due_date, priority);
      return { ok: true, task_id: r.lastInsertRowid };
    },
  },

  list_tasks: {
    declaration: {
      name: 'list_tasks',
      description: 'يعرض مهام فواز (الافتراضي: المفتوحة). status: open (جديدة/قيد التنفيذ) أو all أو done.',
      parameters: { type: 'OBJECT', properties: { status: { type: 'STRING', enum: ['open', 'all', 'done'] } } },
    },
    run: async ({ status = 'open' } = {}) => {
      const where = status === 'all' ? '' : status === 'done' ? "WHERE status='منجزة'" : "WHERE status!='منجزة' AND status!='ملغاة'";
      return {
        today: new Date().toISOString().slice(0, 10),
        tasks: await db.prepare(`SELECT * FROM tasks ${where} ORDER BY CASE priority WHEN 'عالية' THEN 0 WHEN 'متوسطة' THEN 1 ELSE 2 END, COALESCE(due_date,'9999'), id`).all(),
      };
    },
  },

  update_task: {
    declaration: {
      name: 'update_task',
      description: 'يحدّث مهمة: status (جديدة/قيد التنفيذ/منجزة/ملغاة) أو العنوان أو الموعد أو الأولوية أو الملاحظات.',
      parameters: {
        type: 'OBJECT',
        properties: {
          id: { type: 'INTEGER' },
          status: { type: 'STRING', enum: ['جديدة', 'قيد التنفيذ', 'منجزة', 'ملغاة'] },
          title: { type: 'STRING' },
          due_date: { type: 'STRING' },
          priority: { type: 'STRING', enum: ['عالية', 'متوسطة', 'منخفضة'] },
          notes: { type: 'STRING' },
        },
        required: ['id'],
      },
    },
    write: true,
    run: async ({ id, ...f }) => {
      const keys = ['status', 'title', 'due_date', 'priority', 'notes'].filter(k => f[k] != null);
      if (!keys.length) return { error: 'ما فيه شي يتحدّث' };
      const r = await db.prepare(`UPDATE tasks SET ${keys.map(k => `${k}=?`).join(', ')}, updated_at=datetime('now') WHERE id=?`).run(...keys.map(k => f[k]), id);
      return r.changes ? { ok: true, task_id: id } : { error: 'المهمة غير موجودة' };
    },
  },

  list_dev_requests: {
    declaration: {
      name: 'list_dev_requests',
      description: 'يعرض طلبات التطوير المسجّلة وحالتها.',
      parameters: { type: 'OBJECT', properties: {} },
    },
    run: async () => ({ requests: await db.prepare('SELECT * FROM dev_requests ORDER BY id DESC LIMIT 20').all() }),
  },

  update_ticket_status: {
    declaration: {
      name: 'update_ticket_status',
      description: 'تغيير حالة تذكرة موجودة.',
      parameters: {
        type: 'OBJECT',
        properties: {
          ticket_id: { type: 'INTEGER' },
          status: { type: 'STRING', enum: ['مفتوحة', 'قيد المعالجة', 'مغلقة'] },
        },
        required: ['ticket_id', 'status'],
      },
    },
    write: true,
    run: async ({ ticket_id, status }) => {
      const r = await db.prepare('UPDATE tickets SET status=? WHERE id=?').run(status, ticket_id);
      return r.changes ? { ok: true } : { error: 'التذكرة غير موجودة' };
    },
  },
};
