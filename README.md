# Gemini Live — مساعد صوتي عربي مربوط بالداتابيس

## التشغيل
```bash
npm install
cp .env.example .env      # وحط GEMINI_API_KEY من aistudio.google.com/apikey
npm start                 # افتح http://localhost:3000 واضغط المايك
node live-test.mjs "وش وضع المشاريع المتأخرة؟"   # اختبار بدون متصفح، يحفظ الرد في reply.wav
```

## الملفات
ارفع PDF / Word / Excel / CSV / TXT من زر 📎 أو بالسحب. النص ينحفظ في جدول `documents` ويتقطّع في بحث `doc_chunks` (FTS5 يوحّد الكتابة العربية)، والمساعد يستخدم `search_documents` و`read_document` و`list_documents`.

## المعمارية
```
المتصفح (gemini-live-agent.js) ── WebSocket مباشر بالصوت ──► Gemini Live (gemini-3.8-live)
     │  ▲                                                        │
     │  └──────────── toolCall {id,name,args} ◄──────────────────┘
     ▼
السيرفر (server.js) : /api/session = توكن مؤقت (المفتاح ما يطلع)  ·  /api/tools/:name = تنفيذ على الداتابيس
```
- الصوت يروح مباشرة من المتصفح لجوجل (أقل تأخير)، والداتابيس ما يلمسه إلا السيرفر.
- التوكن مؤقت (استخدام واحد، 30 دقيقة) ومقفول على الموديل والتعليمات والأدوات.

## تركيبه على أي واجهة ثانية
```js
import { GeminiLiveAgent } from './gemini-live-agent.js';
const agent = new GeminiLiveAgent({ on: { modelText: t => ..., toolResult: (fc, r) => refresh() } });
await agent.start();
```
وتضيف أدواتك في `db.js` (تعريف + دالة تنفيذ). لـ Supabase/Postgres بدّل دوال `run` فقط.

## إعدادات (.env)
| المتغير | الافتراضي |
|---|---|
| GEMINI_MODEL | gemini-3.8-live (البديل: gemini-3.1-flash-live-preview) |
| GEMINI_VOICE | Kore |
| GEMINI_API_VERSION | v1alpha (لو فشل، الواجهة تجرب v1beta تلقائياً) |
| LOCK_CONFIG | true |
| ALLOW_WRITES | true (false = قراءة فقط) |
| ACCESS_CODE | رمز دخول الصفحة (فاضي = بدون رمز) |
| MY_VOICE_ID | معرّف الصوت المستنسخ في Gemini (يُضبط في Render فقط) |
| TTS_MODEL | gemini-3.8-flash-tts |

## وضع «صوتي»
زر 🗣️ صوتي: Live يسمع ويفهم ويستخدم الأدوات ويرد **نص**، والنص يتحول جملة جملة لصوتك عبر Gemini 3.8 Flash TTS (`/api/speak`). أبطأ من ⚡ صوت Live بحوالي ثانية.

## مسار PDF الموثّق (`ingest/`)
رفع PDF ⇒ مهمة خلفية بمراحل حقيقية ⇒ استخراج صفحة صفحة (Gemini، واحتياطي طبقة النص) ⇒ تنظيم الجداول ⇒ تحقق المجاميع ⇒ حزمة خاصة في Drive لكل إصدار ⇒ أدوات `pdf_*` لنورة وداشبورد مربوط بالمصدر وتتبع كل رقم لصفحته.
- الإعداد والتشغيل: `docs/ingest/INGEST_SETUP.md`
- مصفوفة القدرات وقرار محرك الرسوم: `docs/ingest/CAPABILITY_MATRIX.md`
- الانتقال لقاعدة بيانات: `docs/ingest/MIGRATION.md`
- نتائج اختبار الإنتاج وما بقي متعذراً: `docs/ingest/TEST_RESULTS.md`
- عقود البيانات: `contracts/*.schema.json` · الاختبار: `node --test test/ingest.test.mjs`

## حدود لازم تعرفها
- جلسة الصوت ~15 دقيقة، والاتصال نفسه ~10 دقائق (لأطول: session resumption).
- العربية مدعومة والموديل يكتشف اللغة تلقائياً؛ اللهجة تتحدد من التعليمات.
