// schema.js - Native PostgreSQL & SQLite schemas for core domain entities
// Core entities: projects, tickets, dev_requests, documents, tasks, agent_jobs,
// datasets, memories, dashboards, chat_sessions, chat_turns, doc_chunks.
// Ingest schema references: docs/ingest/MIGRATION.md

export const PG_SCHEMA = `
-- 1. Projects
CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  department TEXT NOT NULL,
  status TEXT NOT NULL,
  progress INT NOT NULL DEFAULT 0,
  budget BIGINT NOT NULL DEFAULT 0,
  spent BIGINT NOT NULL DEFAULT 0,
  owner TEXT NOT NULL,
  due_date TEXT NOT NULL,
  start_date TEXT
);

-- 2. Tickets
CREATE TABLE IF NOT EXISTS tickets (
  id SERIAL PRIMARY KEY,
  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  priority TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tickets_project_id ON tickets(project_id);

-- 3. Dev Requests
CREATE TABLE IF NOT EXISTS dev_requests (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  details TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'جديد',
  dev_note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Tasks
CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  notes TEXT,
  due_date TEXT,
  priority TEXT NOT NULL DEFAULT 'متوسطة',
  status TEXT NOT NULL DEFAULT 'جديدة',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Documents
CREATE TABLE IF NOT EXISTS documents (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  size BIGINT NOT NULL DEFAULT 0,
  chars INT NOT NULL DEFAULT 0,
  content TEXT NOT NULL,
  sha256 TEXT,
  category TEXT,
  drive_id TEXT,
  drive_url TEXT,
  summary TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_documents_sha256 ON documents(sha256);

-- 6. Doc Chunks
CREATE TABLE IF NOT EXISTS doc_chunks (
  id SERIAL PRIMARY KEY,
  doc_id INT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  idx INT NOT NULL,
  norm TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_doc_chunks_doc_id ON doc_chunks(doc_id);

-- 7. Agent Jobs
CREATE TABLE IF NOT EXISTS agent_jobs (
  id SERIAL PRIMARY KEY,
  kind TEXT NOT NULL,
  request TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'قيد التنفيذ',
  result TEXT,
  steps JSONB DEFAULT '[]',
  dev_request_id INT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Datasets
CREATE TABLE IF NOT EXISTS datasets (
  id SERIAL PRIMARY KEY,
  doc_id INT,
  doc_name TEXT,
  sheet TEXT NOT NULL,
  columns JSONB NOT NULL,
  rows JSONB NOT NULL,
  profile JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_datasets_doc_id ON datasets(doc_id);

-- 9. Memories
CREATE TABLE IF NOT EXISTS memories (
  id SERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'fact',
  embedding JSONB,
  hits INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 10. Dashboards
CREATE TABLE IF NOT EXISTS dashboards (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  spec JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 11. Chat Sessions
CREATE TABLE IF NOT EXISTS chat_sessions (
  id SERIAL PRIMARY KEY,
  started_at TIMESTAMPTZ DEFAULT now(),
  last_at TIMESTAMPTZ DEFAULT now(),
  summary TEXT,
  embedding JSONB,
  turns INT NOT NULL DEFAULT 0,
  digested_turns INT NOT NULL DEFAULT 0
);

-- 12. Chat Turns
CREATE TABLE IF NOT EXISTS chat_turns (
  id SERIAL PRIMARY KEY,
  session_id INT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_turns_session ON chat_turns(session_id, id);

-- Key-Value Store & Settings
CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RAG Chunks
CREATE TABLE IF NOT EXISTS rag_chunks (
  id SERIAL PRIMARY KEY,
  src TEXT NOT NULL,
  src_hash TEXT,
  title TEXT,
  section TEXT,
  page INT,
  line_from INT,
  line_to INT,
  text TEXT NOT NULL,
  vec JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_src ON rag_chunks(src);

-- Ingest Tables (docs/ingest/MIGRATION.md)
CREATE TABLE IF NOT EXISTS ingest_document (
  document_id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  current_version INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ingest_version (
  version_id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES ingest_document(document_id) ON DELETE CASCADE,
  n INT NOT NULL,
  sha256 CHAR(64) NOT NULL,
  status TEXT NOT NULL,
  schema_version TEXT NOT NULL DEFAULT 'nora-ingest/1',
  original_ref TEXT,
  meta JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, n)
);
CREATE INDEX IF NOT EXISTS idx_ingest_version_sha256 ON ingest_version(sha256);
CREATE INDEX IF NOT EXISTS idx_ingest_version_doc_id ON ingest_version(document_id);

CREATE TABLE IF NOT EXISTS ingest_job (
  attempt_id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES ingest_version(version_id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  pages_total INT,
  pages_done INT NOT NULL DEFAULT 0,
  checkpoint JSONB NOT NULL DEFAULT '{}',
  issues JSONB NOT NULL DEFAULT '[]',
  errors JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ingest_job_version ON ingest_job(version_id);

CREATE TABLE IF NOT EXISTS ingest_dataset (
  dataset_id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES ingest_version(version_id) ON DELETE CASCADE,
  title TEXT,
  pages INT[] NOT NULL,
  dimensions TEXT[] NOT NULL,
  measures JSONB NOT NULL,
  readiness TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ingest_dataset_version ON ingest_dataset(version_id);

CREATE TABLE IF NOT EXISTS ingest_value (
  record_id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES ingest_version(version_id) ON DELETE CASCADE,
  dataset_id TEXT REFERENCES ingest_dataset(dataset_id) ON DELETE CASCADE,
  page INT NOT NULL,
  printed_page TEXT,
  bbox REAL[],
  source_type TEXT NOT NULL,
  raw TEXT NOT NULL,
  value NUMERIC,
  kind TEXT NOT NULL,
  unit TEXT,
  currency TEXT,
  period TEXT,
  dims JSONB NOT NULL DEFAULT '{}',
  row_kind TEXT,
  extraction TEXT NOT NULL,
  verification TEXT[] NOT NULL,
  usable_for_metrics BOOLEAN NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ingest_value_dataset ON ingest_value(dataset_id);
CREATE INDEX IF NOT EXISTS idx_ingest_value_version_page ON ingest_value(version_id, page);

CREATE TABLE IF NOT EXISTS ingest_lineage (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES ingest_version(version_id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  output TEXT NOT NULL,
  inputs TEXT[] NOT NULL,
  method TEXT NOT NULL,
  detail JSONB
);
CREATE INDEX IF NOT EXISTS idx_ingest_lineage_output ON ingest_lineage(output);
`;

export const SQLITE_SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  department TEXT NOT NULL,
  status TEXT NOT NULL,
  progress INTEGER NOT NULL,
  budget INTEGER NOT NULL,
  spent INTEGER NOT NULL,
  owner TEXT NOT NULL,
  due_date TEXT NOT NULL,
  start_date TEXT
);

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  priority TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dev_requests (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  details TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'جديد',
  dev_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  notes TEXT,
  due_date TEXT,
  priority TEXT NOT NULL DEFAULT 'متوسطة',
  status TEXT NOT NULL DEFAULT 'جديدة',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  size INTEGER NOT NULL,
  chars INTEGER NOT NULL,
  content TEXT NOT NULL,
  sha256 TEXT,
  category TEXT,
  drive_id TEXT,
  drive_url TEXT,
  summary TEXT,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE VIRTUAL TABLE IF NOT EXISTS doc_chunks USING fts5(
  norm, doc_id UNINDEXED, idx UNINDEXED, content UNINDEXED,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TABLE IF NOT EXISTS agent_jobs (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  request TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'قيد التنفيذ',
  result TEXT,
  steps TEXT,
  dev_request_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS datasets (
  id INTEGER PRIMARY KEY,
  doc_id INTEGER,
  doc_name TEXT,
  sheet TEXT NOT NULL,
  columns TEXT NOT NULL,
  rows TEXT NOT NULL,
  profile TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'fact',
  embedding TEXT,
  hits INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dashboards (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  spec TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id INTEGER PRIMARY KEY,
  started_at TEXT DEFAULT (datetime('now')),
  last_at TEXT DEFAULT (datetime('now')),
  summary TEXT,
  embedding TEXT,
  turns INTEGER NOT NULL DEFAULT 0,
  digested_turns INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS chat_turns (
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL,
  role TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS chat_turns_session ON chat_turns(session_id, id);

CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rag_chunks (
  id INTEGER PRIMARY KEY,
  src TEXT NOT NULL,
  src_hash TEXT NOT NULL,
  title TEXT NOT NULL,
  section TEXT,
  page INTEGER,
  line_from INTEGER,
  line_to INTEGER,
  text TEXT NOT NULL,
  vec TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE VIRTUAL TABLE IF NOT EXISTS rag_fts USING fts5(
  norm, chunk_id UNINDEXED, tokenize = 'unicode61 remove_diacritics 2'
);
`;

export const SEED_PROJECTS = [
  ['بوابة الخدمات الإلكترونية', 'تقنية المعلومات', 'قيد التنفيذ', 65, 1200000, 700000, 'سارة العتيبي', '2026-12-31', '2026-03-01'],
  ['أتمتة رخص البناء', 'التخطيط العمراني', 'متأخر', 40, 850000, 600000, 'خالد الحربي', '2026-11-15', '2026-02-15'],
  ['لوحة مؤشرات الأداء', 'الاستراتيجية', 'مكتمل', 100, 300000, 280000, 'نورة القحطاني', '2026-09-30', '2026-01-10'],
  ['منصة البلاغات الذكية', 'خدمة المستفيدين', 'قيد التنفيذ', 30, 950000, 250000, 'فهد الشمري', '2027-03-01', '2026-06-01'],
  ['ترحيل الأنظمة للسحابة', 'تقنية المعلومات', 'متوقف', 15, 2000000, 300000, 'سارة العتيبي', '2027-06-30', '2026-05-15'],
];

export const SEED_TICKETS = [
  [1, 'خلل في تسجيل الدخول عبر النفاذ الوطني', 'عالية', 'مفتوحة'],
  [1, 'تحسين سرعة صفحة الطلبات', 'متوسطة', 'قيد المعالجة'],
  [2, 'تأخر ربط نظام الأراضي', 'عالية', 'مفتوحة'],
  [2, 'مراجعة نموذج الطلب', 'منخفضة', 'مغلقة'],
  [4, 'تدريب فريق الاستقبال', 'متوسطة', 'مفتوحة'],
  [5, 'اعتماد مزود السحابة', 'عالية', 'قيد المعالجة'],
];
