# خريطة الانتقال إلى قاعدة بيانات (لاحقاً)

الآن: Drive هو التخزين الدائم للحزم، وPostgres الموجود يحفظ الفهرس وحالة المهام (kv). لا قاعدة جديدة ولا خدمة مدفوعة.
الانتقال يتم بكتابة `PostgresStorage` تحقق نفس واجهة `StorageAdapter` (`ingest/storage.js`) دون تغيير `pipeline.js` أو `query.js`.

## واجهة StorageAdapter
`putFile(path, buf, mime)`، `getFile(path)`، `getText(path)`، `getJSON(path)`، `putJSON(path, obj)`، `list(dir)`، `dir(path, label)`.

## مخطط مقترح (حسب Supabase Postgres Best Practices)
```sql
create table ingest_document (
  document_id text primary key,                -- pdf-<sha1(name)[:10]>
  file_name text not null,
  current_version int,
  created_at timestamptz not null default now()
);
create table ingest_version (
  version_id text primary key,                 -- <document_id>@vN
  document_id text not null references ingest_document on delete cascade,
  n int not null,
  sha256 char(64) not null,
  status text not null check (status in ('uploaded','queued','extracting','organizing','validating','ready','partial','failed')),
  schema_version text not null default 'nora-ingest/1',
  original_ref text,                           -- رابط Drive أو مسار تخزين الكائنات
  meta jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (document_id, n)
);
create index on ingest_version (sha256);        -- منع التكرار بالبصمة
create index on ingest_version (document_id);   -- فهرسة كل مفتاح أجنبي

create table ingest_job (
  attempt_id text primary key,
  version_id text not null references ingest_version on delete cascade,
  stage text not null,
  pages_total int, pages_done int not null default 0,
  checkpoint jsonb not null default '{}',
  issues jsonb not null default '[]', errors jsonb not null default '[]',
  updated_at timestamptz not null default now()
);
create index on ingest_job (version_id);

create table ingest_dataset (
  dataset_id text primary key,                 -- <version_id>#dsNN
  version_id text not null references ingest_version on delete cascade,
  title text, pages int[] not null, dimensions text[] not null, measures jsonb not null,
  readiness text not null check (readiness in ('ready','ready_with_notes','blocked','text_only'))
);
create index on ingest_dataset (version_id);

create table ingest_value (
  record_id text primary key,                  -- <version_id>#<kind>-<hash12>
  version_id text not null references ingest_version on delete cascade,
  dataset_id text references ingest_dataset on delete cascade,
  page int not null, printed_page text, bbox real[],
  source_type text not null, raw text not null,
  value numeric, kind text not null, unit text, currency text, period text,
  dims jsonb not null default '{}', row_kind text,
  extraction text not null, verification text[] not null,
  usable_for_metrics boolean not null
);
create index on ingest_value (dataset_id);
create index on ingest_value (version_id, page);
create index on ingest_value using gin (dims);

create table ingest_lineage (
  id text primary key, version_id text not null references ingest_version on delete cascade,
  kind text not null, output text not null, inputs text[] not null, method text not null, detail jsonb
);
create index on ingest_lineage (output);
```

## قواعد الانتقال
- الأقفال: `pg_try_advisory_lock(hashtext('ingest:doc:'||document_id))` كما الآن.
- الكتابة بمعاملة واحدة لكل إصدار؛ `current_version` يتحدث آخراً (نفس منطق manifest).
- `review.xlsx` و`document.md` يبقيان ملفات (Drive أو تخزين كائنات)، والجداول للبيانات المهيكلة.
- لو فُعّل RLS لاحقاً: سياسات على `document_id` مع فهرس، واستدعاء `(select auth.uid())` داخل السياسة.
- الترحيل: قراءة كل `manifest.json` ثم `metrics.jsonl` و`datasets.jsonl` و`lineage.jsonl` وإدخالها دفعة دفعة (COPY أو insert متعدد الصفوف).
