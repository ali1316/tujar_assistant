# مصفوفة القدرات — مسار PDF في نورة

> المرجع: مراجعة المشروع في 2026-10-26 (Render 0.5 CPU / 512MB، Node 20، Postgres موجود، جسر Drive عبر Apps Script).
> المستودعات المرجعية فُحصت بنسخ سطحية مؤقتة ولم تُثبّت كاملة: docling `90234a7`، markitdown `7482c09`، anthropics/skills `dbd4588`، supabase/agent-skills `c9be0e9`، playwright-cli `b1a5903`، gemini-skills `ee9da52`، nivo `0dae2c3`.

| المجال | الموجود قبل | المضاف الآن | المهارة (تطوير) | محرك التشغيل | طريقة التحقق |
|---|---|---|---|---|---|
| رفع PDF | `/api/upload` + `docs.js` (pdf-parse نص خام) | مسار مستقل `ingest/` يبدأ من نفس الرفع، بصمة SHA-256، إصدارات، رقم محاولة | — | Node (multer) | اختبار: رفع مكرر لا يعيد المعالجة؛ محتوى جديد = إصدار جديد |
| مهمة خلفية | لا يوجد | مراحل حقيقية uploaded→…→ready/partial/failed، نقطة استئناف لكل صفحة، قفل لكل مستند | supabase `lock-advisory` | Postgres advisory lock + kv | اختبار: قطع بعد صفحتين ثم استئناف بدون إعادة الصفحات المنجزة |
| تصنيف الصفحات | لا يوجد | نصية/ممسوحة/مختلطة/فارغة من طبقة النص وعدد الصور | anthropics `pdf` | pdfjs-dist 6.3.289 | `pages/*.json` → `kind` |
| النص بترتيب عربي | pdf-parse (أحرف مقطّعة) | تطبيع NFKC، دمج بالمسافات الأفقية، كشف RTL مع أشكال العرض | anthropics `pdf` | pdfjs-dist | مقارنة الأرقام بطبقة النص (`matched_text_layer`) |
| الجداول/الرسوم/الصور/الحواشي/الصيغ | لا يوجد بنيوياً | مخطط JSON ثابت لكل صفحة، رؤية على صفحة مفردة، الرسوم: مكتوب مقابل مقدّر | `gemini-api-dev` | Gemini (`INGEST_MODEL`، افتراضي gemini-3.8-flash) عبر interactions ثم generateContent | الجاهزية لكل جدول + فحوص المجاميع |
| OCR للصفحات الممسوحة | لا يوجد | نفس محرك الرؤية؛ القيم تُعلَّم `vision_only` | `gemini-api-dev` | Gemini | لا يُعتبر متحققاً إلا بمجموع مطابق |
| Docling | لا يوجد | مهايئ اختياري للمقارنة المتقاطعة للجداول | docling | docling-serve خارجي (`DOCLING_URL`) — **لا يعمل على 512MB** | يظهر في تقرير الجودة لو مفعّل |
| markitdown | — | **لم يُعتمد**: Python، ولا يضيف على Docling/Gemini للعربية الممسوحة | — | — | — |
| التحقق | لا يوجد | أنواع، وحدات، بنية، مجموع مقابل إجمالي مطبوع بفرق تقريب موثّق، تعارض بين المواضع | `data:validate-data` (موجود) | Node | `quality_report.json` |
| الحفظ | SQLite + لقطات Postgres | حزمة Drive لكل إصدار، كتابة الملفات أولاً ثم manifest | supabase best practices (للتصميم) | StorageAdapter: Drive / Local | فحص اكتمال الملفات قبل manifest |
| Excel للمراجعة | — | `review.xlsx` مولّد (ليس مصدر حساب) | anthropics `xlsx` | SheetJS (xlsx موجود) | ورقة README تنص أنها نسخة مولّدة |
| الفهرسة والأسئلة | `retrieval.js` (ملفات/معرفة) | مصدر بحث إضافي `pdf:<vid>` + أدوات `pdf_*` | مهارات المعرفة الموجودة | Node | eval + اختبار سؤال في جلسة جديدة |
| الحساب | `query_data` على datasets | `pdf_metric`: الحساب بالكود، صفوف التفاصيل فقط، يرفض الأبعاد غير الموجودة | — | Node | يعيد المعادلة ومعرّفات السجلات |
| الداشبورد | ECharts في dash.html + build_dashboard | `pdf_dashboard`: مصدر/إصدار/تاريخ/تحقق/صفحات/معادلة، فلاتر بالأبعاد الموجودة، Drill-down + «من وين؟» | `dataviz` | ECharts 6.1 (أساسي) | فتح اللوحة والضغط على عمود |
| الصوت وسياق الشاشة | Gemini Live + look_at_screen | `look_at_screen` يرى مصدر اللوحة وفلاترها والأعمدة المعروضة وحالة المعالجة | — | Gemini Live / ElevenLabs | سؤال صوتي عن رقم في اللوحة |
| الاختبار الآلي للواجهة | `test/design-check.mjs` (Playwright) | — | playwright-cli (مرجع فقط) | Playwright المثبت | — |
| الذاكرة المنظمة | `memory.js` | الحالة في kv: `ingest:index`، `ingest:job:*`، `ingest:data:*` (مخبأ يُعاد بناؤه من Drive) | — | Postgres kv | اختبار: حذف المخبأ ثم إعادة البناء من التخزين |

## قرار محرك الرسوم
- **الأساسي: ECharts** (مستخدم فعلاً في `dash.html`، يدعم RTL والنقر على الأعمدة للتفصيل).
- **nivo مرفوض**: مكتبة React، والواجهة JavaScript بدون إطار — إضافته تعني React + bundler.
- موجود أيضاً: Chart.js وvega/vega-lite. لم تُحذف الآن (مستخدمة في أجزاء قائمة)، وتوصية لاحقة بتوحيدها على ECharts. لم تُثبّت أي مكتبة رسوم جديدة.

## فصل مهارات التطوير عن أدوات التشغيل
- **مهارات التطوير** (تُستخدم أثناء بناء المشروع فقط، لا تُشحن للسيرفر): anthropics `pdf`/`xlsx`، `gemini-api-dev`، `gemini-live-api-dev`، supabase `postgres-best-practices`، playwright-cli، `dataviz`، `data:validate-data`.
- **أدوات نورة وقت التشغيل** (في `ingest/` و`server.js`): `pdf_sources`، `pdf_find_value`، `pdf_get_table`، `pdf_metric`، `pdf_trace`، `pdf_dashboard`، `pdf_job_status`.
- لم تُنسخ أي مهارة إلى المستودع؛ لا تكرار للمهارات الموجودة.
