# دليل الإعداد والتشغيل — مسار PDF

> المزامنة مع Git تنقل الكود فقط. المحركات والمفاتيح والموصلات تُضبط على كل جهاز/سيرفر يدوياً كما هو موضح هنا.
> لا مفاتيح ولا ملفات عمل في المستودع: `demo.db*` و`ingest-data/` و`.env` مستثناة.

## 1) المتطلبات حسب المكان

| المكان | المطلوب | ملاحظة |
|---|---|---|
| السيرفر (Render `gemini-live-dashboard`) | Node ≥ 20، `npm ci` | يثبت pdfjs-dist 6.3.289 وpdf-lib 1.17.1 تلقائياً من package-lock |
| السيرفر — متغيرات البيئة | `GEMINI_API_KEY` (موجود)، `DRIVE_SCRIPT_URL` (موجود)، `DATABASE_URL` (موجود) | بدون مفتاح Gemini يعمل المسار بطبقة النص فقط وتُعلَّم النتيجة «جزئي» |
| السيرفر — اختياري | `INGEST_MODEL` (افتراضي `gemini-3.8-flash`)، `INGEST_CONCURRENCY` (افتراضي 2)، `INGEST_ROOT_NAME` (افتراضي «نورة — مصادر PDF»)، `DOCLING_URL` | — |
| Google Apps Script (جسر Drive) | لصق `drive-apps-script.gs` ثم **Deploy → Manage deployments → Edit → New version** | نفس الرابط يبقى؛ يضيف إجراءات `dir/put/get/ls/getById` تحت جذر واحد خاص |
| جهاز تطوير محلي | Node ≥ 20، `npm ci`، `.env` محلي | `INGEST_STORAGE=local` و`INGEST_LOCAL_DIR=./ingest-data` للتجربة بدون Drive |
| Docling (اختياري) | خادم docling-serve بذاكرة ≥ 4GB (torch) | لا يعمل على خطة 512MB؛ يُفعّل بوضع `DOCLING_URL` فقط |

## 2) التشغيل المحلي
```bash
npm ci
INGEST_STORAGE=local PORT=3999 node server.js
node test/fixtures/make-sample.cjs      # يولّد ملف اختبار عربي + الحقيقة المرجعية
node --test test/ingest.test.mjs        # 18 فحص: استئناف، تكرار، إصدارات، مجاميع، تتبع
```

## 3) مسار العمل
1. الرفع من واجهة نورة (أو `POST /api/ingest/upload` أو `POST /api/ingest/from-drive {file_id}`).
2. البصمة SHA-256: نفس المحتوى ⇒ لا معالجة. نفس الاسم بمحتوى مختلف ⇒ إصدار جديد.
3. حفظ `original.pdf` أولاً، ثم مهمة خلفية بمراحل حقيقية تُعرض في الواجهة (صفحات منجزة/الإجمالي، المشكلات).
4. استخراج صفحة صفحة مع نقطة استئناف ⇒ تنظيم (ربط الجداول الممتدة، صفوف الإجمالي) ⇒ تحقق ⇒ كتابة الحزمة ⇒ فحص اكتمالها ⇒ تحديث manifest.
5. لو فشل أي شيء: الإصدار السابق يبقى الحالي.

## 4) حزمة Drive (لكل إصدار)
```
نورة — مصادر PDF/<document_id> — <اسم الملف>/
  manifest.json                     ← آخر ما يُكتب
  v1/ original.pdf  metadata.json  manifest.json  document.md
      pages/pages-001-020.json …   tables/tables.json  tables/tNN.csv
      datasets/dsNN.csv  datasets/datasets.jsonl
      metrics.jsonl  data_dictionary.json  lineage.jsonl
      quality_report.json  quality_report.md  dashboard_catalog.json  review.xlsx
```
- مصدر الحساب: `datasets/*.csv` و`metrics.jsonl`. `review.xlsx` نسخة مراجعة مولّدة. `document.md` للسياق.
- الملفات خاصة بحساب Drive المالك؛ الجسر لا يغيّر صلاحيات المشاركة.

## 5) الـ API
| المسار | الغرض |
|---|---|
| `GET /api/ingest/status` | التخزين الحالي، محرك الرؤية، Docling |
| `GET /api/ingest/index` | كل المستندات والإصدارات |
| `GET /api/ingest/jobs/:attempt` | حالة مهمة (أرقام حقيقية) |
| `POST /api/ingest/jobs/:attempt/resume` | استئناف مهمة متوقفة |
| `GET /api/ingest/trace/:record_id` | الصفحة والموضع والقيمة كما طُبعت وحالة التحقق |
| `GET /api/ingest/data/:version_id/summary` | ملخص الإصدار والفحوص |

## 6) قواعد البيانات المطبقة
- أرقام عربية/لاتينية وفواصل `٫ ٬`، السالب بين قوسين، مقاييس ألف/مليون/مليار.
- التمييز بين صفر / مفقود / غير منطبق / شرطة.
- النسبة كما كُتبت + الكسر بجانبها. لا تحويل عملات ولا هجري↔ميلادي (يُسجّل التقويم فقط).
- المعرّفات بأصفار بادئة تبقى نصاً. صفوف الإجمالي لا تُجمع مع التفاصيل. لا دمج تلقائي لأسماء متشابهة.
- فرق التقريب: صفر للأعداد الصحيحة؛ نصف وحدة آخر خانة × عدد الحدود عند وجود كسور أو وحدات مقرّبة. لا تعديل للمصدر لإجباره على التطابق.
- الجاهزية لكل جدول: `ready` / `ready_with_notes` / `blocked` / `text_only`.

## 7) أمان
- محتوى الملف بيانات: البرومبت ينص على تجاهل أي تعليمات داخل الصفحة، ونورة تُبلَّغ بذلك.
- لا مفاتيح في الكود أو المستودع. لا جعل ملفات Drive عامة.
