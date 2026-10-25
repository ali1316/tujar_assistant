// سيرفر خفيف: (1) توكن مؤقت لجيميناي لايف  (2) أدوات الداتابيس  (3) رفع الملفات  (4) الواجهة
import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import { GoogleGenAI } from '@google/genai';
import { db, tools as dataTools } from './db.js';
import { docTools, extractText, saveDocument } from './docs.js';

const PORT = process.env.PORT || 3000;
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-live';
const VOICE = process.env.GEMINI_VOICE || 'Kore';
const API_VERSION = process.env.GEMINI_API_VERSION || 'v1alpha';
const LOCK_CONFIG = process.env.LOCK_CONFIG !== 'false';
const ALLOW_WRITES = process.env.ALLOW_WRITES !== 'false';
const ACCESS_CODE = process.env.ACCESS_CODE || ''; // لو فاضي = بدون رمز (للتجربة المحلية)
const MY_VOICE_ID = process.env.MY_VOICE_ID || 'voice_xb1ye60p9o3i'; // صوت فواز المستنسخ في Gemini
const TTS_MODEL = process.env.TTS_MODEL || 'gemini-3.8-flash-tts';

const tools = { ...dataTools, ...docTools };
const activeDeclarations = () => Object.entries(tools)
  .filter(([, t]) => ALLOW_WRITES || !t.write)
  .map(([, t]) => ({ ...t.declaration, behavior: 'BLOCKING' }));

const SYSTEM_PROMPT = `أنت "مساعد اللوحة"، مساعد صوتي لمنصة متابعة مشاريع التحول الرقمي.
- تكلّم باللهجة السعودية البيضاء، بإيجاز ووضوح، وجمل قصيرة تناسب الكلام.
- أي رقم أو اسم أو حالة لازم تجيبه من الأدوات؛ لا تخمّن ولا تألّف بيانات.
- المبالغ بالريال، اقرأها بشكل طبيعي (مثلاً "مليون ومية ألف").
- قبل أي إضافة أو تعديل في البيانات، أكّد مع المستخدم بجملة وحدة وانتظر موافقته.
- المستخدم يقدر يرفع ملفات (PDF, Word, Excel...). لما يسأل عن ملف: استخدم search_documents للأسئلة المحددة،
  و read_document للتلخيص أو الملفات الصغيرة، و list_documents لو ما تعرف رقم الملف. اذكر اسم الملف اللي أخذت منه المعلومة.
- إذا جاتك رسالة تبدأ بـ [تنبيه النظام] فهي إشعار برفع ملف: رحّب باختصار واسأله وش يبي يعرف عنه.
- إذا المستخدم تكلّم إنجليزي، رد عليه إنجليزي.`;

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// mode = 'live' (صوت Live الأصلي، أسرع)  |  'mine' (نص ترجمة رد Live → يتحول لصوت فواز عبر Gemini TTS)
// ملاحظة: gemini-3.8-live ما يدعم TEXT كمخرج، فنخليه AUDIO ونستخدم outputAudioTranscription
const promptFor = mode => mode === 'mine'
  ? SYSTEM_PROMPT + '\n- ردك بيتحوّل لصوت، فاكتب كلام منطوق طبيعي بدون رموز أو نقاط أو جداول أو إيموجي.'
  : SYSTEM_PROMPT;
function buildSetup(mode) {
  return {
    model: `models/${MODEL}`,
    generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } } },
    systemInstruction: { parts: [{ text: promptFor(mode) }] },
    tools: [{ functionDeclarations: activeDeclarations() }],
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    realtimeInputConfig: { automaticActivityDetection: { silenceDurationMs: 700, prefixPaddingMs: 40 } },
  };
}

const app = express();
app.use(express.json({ limit: '1mb' }));

// الواجهة (ملفات محددة فقط)
for (const f of ['index.html', 'gemini-live-agent.js', 'pcm-recorder.js'])
  app.get(f === 'index.html' ? '/' : `/${f}`, (req, res) => res.sendFile(f, { root: '.' }));
app.get('/health', (req, res) => res.send('ok'));

// رمز الدخول لكل /api
app.use('/api', (req, res, next) => {
  if (!ACCESS_CODE || req.get('x-access-code') === ACCESS_CODE) return next();
  res.status(401).json({ error: 'رمز الدخول غلط' });
});
app.get('/api/ping', (req, res) => res.json({ ok: true }));

// 1) توكن مؤقت: مفتاح API الحقيقي ما يطلع من السيرفر أبداً
app.get('/api/session', async (req, res) => {
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY غير مضبوط' });
  const apiVersion = req.query.v || API_VERSION;
  const mode = req.query.mode === 'mine' ? 'mine' : 'live';
  try {
    const now = Date.now();
    const config = {
      uses: 1,
      expireTime: new Date(now + 30 * 60 * 1000).toISOString(),
      newSessionExpireTime: new Date(now + 60 * 1000).toISOString(),
      httpOptions: { apiVersion },
    };
    if (LOCK_CONFIG) {
      config.liveConnectConstraints = {
        model: MODEL,
        config: {
          responseModalities: ['AUDIO'],
          systemInstruction: promptFor(mode),
          tools: [{ functionDeclarations: activeDeclarations() }],
        },
      };
    }
    const token = await ai.authTokens.create({ config });
    res.json({ token: token.name, apiVersion, mode, setup: buildSetup(mode) });
  } catch (e) {
    console.error('token error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// 2) تنفيذ الأدوات
app.post('/api/tools/:name', (req, res) => {
  const tool = tools[req.params.name];
  if (!tool) return res.status(404).json({ error: 'أداة غير معروفة' });
  if (tool.write && !ALLOW_WRITES) return res.status(403).json({ error: 'التعديل مقفل' });
  try {
    const result = tool.run(req.body || {});
    console.log(`[tool] ${req.params.name}`, JSON.stringify(req.body), '→', JSON.stringify(result).slice(0, 200));
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 2.5) صوت فواز: نص → Gemini TTS (صوت مستنسخ) → PCM 24kHz يتبث للمتصفح أول بأول
app.post('/api/speak', async (req, res) => {
  const text = String(req.body?.text || '').trim().slice(0, 1500);
  if (!text) return res.status(400).json({ error: 'نص فاضي' });
  try {
    const stream = await ai.interactions.create({
      model: TTS_MODEL,
      input: text,
      response_format: { type: 'audio' },
      generation_config: { speech_config: [{ voice: MY_VOICE_ID }] },
      stream: true,
    });
    res.setHeader('Content-Type', 'audio/l16; rate=24000; channels=1');
    let sent = 0;
    for await (const ev of stream) {
      if (ev.event_type === 'step.delta' && ev.delta?.type === 'audio' && ev.delta.data) {
        const buf = Buffer.from(ev.delta.data, 'base64');
        res.write(buf); sent += buf.length;
      } else if (ev.event_type === 'error') {
        console.error('[speak] stream error', JSON.stringify(ev).slice(0, 300));
      }
    }
    console.log(`[speak] ${text.length} chars → ${(sent / 48000).toFixed(1)}s audio`);
    res.end();
  } catch (e) {
    console.error('[speak] error:', e.message);
    if (!res.headersSent) res.status(500).json({ error: e.message }); else res.end();
  }
});

// 3) رفع ملف → استخراج النص → الداتابيس
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'ما وصل ملف' });
  const name = Buffer.from(req.file.originalname, 'latin1').toString('utf8'); // أسماء عربية
  try {
    const text = await extractText(req.file.buffer, name);
    const doc = saveDocument(name, req.file.mimetype, req.file.size, text);
    console.log(`[upload] ${name} → doc #${doc.id} (${doc.chars} chars)`);
    res.json(doc);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 4) بيانات اللوحة
app.get('/api/dashboard', (req, res) => {
  res.json({
    summary: dataTools.get_dashboard_summary.run(),
    projects: db.prepare('SELECT * FROM projects').all(),
    tickets: dataTools.list_tickets.run().tickets,
    documents: docTools.list_documents.run().documents,
  });
});

app.listen(PORT, () => console.log(`✅ http://localhost:${PORT}  (model: ${MODEL}, api: ${API_VERSION}, code: ${ACCESS_CODE ? 'on' : 'off'})`));
