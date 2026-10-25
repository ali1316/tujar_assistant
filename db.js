// قاعدة بيانات تجريبية (SQLite) — بدّلها لاحقاً بـ Postgres/Supabase بنفس الدوال
import Database from 'better-sqlite3';

export const db = new Database(process.env.DB_PATH || 'demo.db');
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  department TEXT NOT NULL,
  status TEXT NOT NULL,          -- قيد التنفيذ | متأخر | مكتمل | متوقف
  progress INTEGER NOT NULL,     -- 0..100
  budget INTEGER NOT NULL,       -- بالريال
  spent INTEGER NOT NULL,
  owner TEXT NOT NULL,
  due_date TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  priority TEXT NOT NULL,        -- عالية | متوسطة | منخفضة
  status TEXT NOT NULL,          -- مفتوحة | قيد المعالجة | مغلقة
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

if (db.prepare('SELECT COUNT(*) c FROM projects').get().c === 0) {
  const p = db.prepare(`INSERT INTO projects (name, department, status, progress, budget, spent, owner, due_date)
                        VALUES (?,?,?,?,?,?,?,?)`);
  [
    ['بوابة الخدمات الإلكترونية', 'تقنية المعلومات', 'قيد التنفيذ', 65, 1200000, 700000, 'سارة العتيبي', '2026-12-31'],
    ['أتمتة رخص البناء', 'التخطيط العمراني', 'متأخر', 40, 850000, 600000, 'خالد الحربي', '2026-11-15'],
    ['لوحة مؤشرات الأداء', 'الاستراتيجية', 'مكتمل', 100, 300000, 280000, 'نورة القحطاني', '2026-09-30'],
    ['منصة البلاغات الذكية', 'خدمة المستفيدين', 'قيد التنفيذ', 30, 950000, 250000, 'فهد الشمري', '2027-03-01'],
    ['ترحيل الأنظمة للسحابة', 'تقنية المعلومات', 'متوقف', 15, 2000000, 300000, 'سارة العتيبي', '2027-06-30'],
  ].forEach(r => p.run(...r));
  const t = db.prepare('INSERT INTO tickets (project_id, title, priority, status) VALUES (?,?,?,?)');
  [
    [1, 'خلل في تسجيل الدخول عبر النفاذ الوطني', 'عالية', 'مفتوحة'],
    [1, 'تحسين سرعة صفحة الطلبات', 'متوسطة', 'قيد المعالجة'],
    [2, 'تأخر ربط نظام الأراضي', 'عالية', 'مفتوحة'],
    [2, 'مراجعة نموذج الطلب', 'منخفضة', 'مغلقة'],
    [4, 'تدريب فريق الاستقبال', 'متوسطة', 'مفتوحة'],
    [5, 'اعتماد مزود السحابة', 'عالية', 'قيد المعالجة'],
  ].forEach(r => t.run(...r));
}

// إعدادات الواجهة + طلبات التطوير الكبيرة
db.exec(`
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS dev_requests (
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, details TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'جديد', created_at TEXT NOT NULL DEFAULT (datetime('now'))
);`);

// ترقية: ملاحظة المطوّر (Claude) ووقت آخر تحديث لطلبات التطوير
for (const [c, t] of [['dev_note', 'TEXT'], ['updated_at', 'TEXT']])
  if (!db.prepare('PRAGMA table_info(dev_requests)').all().some(x => x.name === c)) db.exec(`ALTER TABLE dev_requests ADD COLUMN ${c} ${t}`);

// ترقية: تاريخ بداية لكل مشروع (للجانت) — آمنة لو انعادت
if (!db.prepare('PRAGMA table_info(projects)').all().some(c => c.name === 'start_date')) {
  db.exec('ALTER TABLE projects ADD COLUMN start_date TEXT');
  const upd = db.prepare('UPDATE projects SET start_date=? WHERE id=?');
  [['2026-03-01', 1], ['2026-02-15', 2], ['2026-01-10', 3], ['2026-06-01', 4], ['2026-05-15', 5]].forEach(([d, id]) => upd.run(d, id));
}

// ===== الأدوات اللي يقدر الموديل يناديها (Function Calling) =====
// كل أداة: تعريف (يروح لجيميناي) + تنفيذ (يصير في السيرفر فقط، المتصفح ما يلمس الداتابيس)
export const tools = {
  get_dashboard_summary: {
    declaration: {
      name: 'get_dashboard_summary',
      description: 'ملخص عام للوحة: عدد المشاريع حسب الحالة، إجمالي الميزانية والمصروف، وعدد التذاكر المفتوحة.',
      parameters: { type: 'OBJECT', properties: {} },
    },
    run: () => ({
      projects_by_status: db.prepare('SELECT status, COUNT(*) count FROM projects GROUP BY status').all(),
      total_budget: db.prepare('SELECT SUM(budget) v FROM projects').get().v,
      total_spent: db.prepare('SELECT SUM(spent) v FROM projects').get().v,
      open_tickets: db.prepare("SELECT COUNT(*) v FROM tickets WHERE status != 'مغلقة'").get().v,
      high_priority_open: db.prepare("SELECT COUNT(*) v FROM tickets WHERE status != 'مغلقة' AND priority='عالية'").get().v,
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
    run: ({ query, department, status } = {}) => {
      let sql = 'SELECT * FROM projects WHERE 1=1';
      const args = [];
      if (query) { sql += ' AND (name LIKE ? OR owner LIKE ?)'; args.push(`%${query}%`, `%${query}%`); }
      if (department) { sql += ' AND department LIKE ?'; args.push(`%${department}%`); }
      if (status) { sql += ' AND status = ?'; args.push(status); }
      return { projects: db.prepare(sql).all(...args) };
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
    run: ({ project_id, name } = {}) => {
      const p = project_id
        ? db.prepare('SELECT * FROM projects WHERE id=?').get(project_id)
        : db.prepare('SELECT * FROM projects WHERE name LIKE ? ORDER BY length(name) LIMIT 1').get(`%${(name || '').replace(/^ال/, '')}%`);
      if (!p) return { error: 'ما لقيت المشروع' };
      const tickets = db.prepare('SELECT id, title, priority, status FROM tickets WHERE project_id=? ORDER BY id DESC').all(p.id);
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
    run: ({ project_id, status, priority } = {}) => {
      let sql = `SELECT t.*, p.name project_name FROM tickets t JOIN projects p ON p.id=t.project_id WHERE 1=1`;
      const args = [];
      if (project_id) { sql += ' AND t.project_id = ?'; args.push(project_id); }
      if (status) { sql += ' AND t.status = ?'; args.push(status); }
      if (priority) { sql += ' AND t.priority = ?'; args.push(priority); }
      return { tickets: db.prepare(sql + ' ORDER BY t.id DESC').all(...args) };
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
    run: ({ project_id, title, priority }) => {
      if (!db.prepare('SELECT 1 FROM projects WHERE id=?').get(project_id)) return { error: 'المشروع غير موجود' };
      const r = db.prepare("INSERT INTO tickets (project_id, title, priority, status) VALUES (?,?,?,'مفتوحة')")
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
    run: ({ title, details }) => {
      const r = db.prepare('INSERT INTO dev_requests (title, details) VALUES (?,?)').run(title, details);
      return { ok: true, request_id: r.lastInsertRowid, status: 'جديد' };
    },
  },

  list_dev_requests: {
    declaration: {
      name: 'list_dev_requests',
      description: 'يعرض طلبات التطوير المسجّلة وحالتها.',
      parameters: { type: 'OBJECT', properties: {} },
    },
    run: () => ({ requests: db.prepare('SELECT * FROM dev_requests ORDER BY id DESC LIMIT 20').all() }),
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
    run: ({ ticket_id, status }) => {
      const r = db.prepare('UPDATE tickets SET status=? WHERE id=?').run(status, ticket_id);
      return r.changes ? { ok: true } : { error: 'التذكرة غير موجودة' };
    },
  },
};

