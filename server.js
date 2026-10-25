// سيرفر خفيف: (1) توكن مؤقت لجيميناي لايف  (2) أدوات الداتابيس  (3) رفع الملفات  (4) الواجهة
import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import { GoogleGenAI } from '@google/genai';
import { db, tools as dataTools } from './db.js';
import { docTools, extractText, saveDocument } from './docs.js';
import { initStore, kvGet, kvSet, backend } from './store.js';
import { memoryTools, memoryBlock, initMemory, listForUI } from './memory.js';
import { dashboardTools, dashGet, dashList } from './dashboards.js';
import { memDelete } from './store.js';

const PORT = process.env.PORT || 3000;
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-live';
const VOICE = process.env.GEMINI_VOICE || 'Sulafat'; // صوت نورة الافتراضي
// أصوات نسائية جاهزة يدعمها Live (نختار منها لنورة)
const NORA_VOICES = ['Sulafat', 'Despina', 'Aoede', 'Leda', 'Kore', 'Zephyr', 'Achernar', 'Callirrhoe', 'Autonoe', 'Erinome', 'Laomedeia', 'Gacrux', 'Pulcherrima', 'Vindemiatrix'];
const pickVoice = v => (NORA_VOICES.includes(v) ? v : VOICE);
const API_VERSION = process.env.GEMINI_API_VERSION || 'v1alpha';
const LOCK_CONFIG = process.env.LOCK_CONFIG !== 'false';
const ALLOW_WRITES = process.env.ALLOW_WRITES !== 'false';
const ACCESS_CODE = process.env.ACCESS_CODE || ''; // لو فاضي = بدون رمز (للتجربة المحلية)
const MY_VOICE_ID = process.env.MY_VOICE_ID || 'voice_xb1ye60p9o3i'; // صوت فواز المستنسخ في Gemini
const TTS_MODEL = process.env.TTS_MODEL || 'gemini-3.8-flash-tts';

const tools = { ...dataTools, ...docTools, ...memoryTools, ...dashboardTools };

// أدوات «العرض»: تنفّذ في المتصفح (نوافذ منبثقة ورسوم) — السيرفر بس يعرّفها للموديل
const visualDeclarations = [
  {
    name: 'show_project_visual',
    description: 'يعرض للمستخدم نافذة منبثقة سينمائية لمشروع: عدّاد الإنجاز، الميزانية مقابل المصروف، التذاكر حسب الأولوية، والأيام المتبقية. استخدمها كل ما سأل المستخدم عن تفاصيل أو وضع مشروع معيّن.',
    parameters: { type: 'OBJECT', properties: { project_id: { type: 'INTEGER' }, name: { type: 'STRING', description: 'جزء من اسم المشروع' } } },
  },
  {
    name: 'show_chart',
    description: 'يرسم رسم بياني منبثق من أرقام حقيقية جبتها من الأدوات (للمقارنات والتوزيعات). لا تخترع أرقام.',
    parameters: {
      type: 'OBJECT',
      properties: {
        title: { type: 'STRING' },
        chart_type: { type: 'STRING', enum: ['bar', 'doughnut', 'line', 'radar'] },
        labels: { type: 'ARRAY', items: { type: 'STRING' } },
        values: { type: 'ARRAY', items: { type: 'NUMBER' } },
        unit: { type: 'STRING', description: 'مثل: ريال، ٪، تذكرة' },
      },
      required: ['title', 'chart_type', 'labels', 'values'],
    },
  },
  {
    name: 'render_visual',
    description: `يرسم أي رسم بياني تطلبه في اللحظة (دائري، جانت، خريطة حرارية، نقاط، مساحات، شلال، مركّب...) في نافذة HUD سينمائية مع عدّادات ووصف.
اكتب مواصفة Vega-Lite v5 كاملة كنص JSON في vega_lite، والبيانات داخلها في data.values (أرقام حقيقية من الأدوات فقط).
لا تحط width/height/background/config — الواجهة تضبطها. للعناوين العربية استخدم title في المعطيات وليس داخل المواصفة.
أمثلة: دائري = mark:"arc" مع theta و color. جانت = mark:"bar" مع y=name (nominal) و x=start_date (temporal) و x2=due_date.
لو رجع لك error صحّح المواصفة وأعد المحاولة مرة وحدة.`,
    parameters: {
      type: 'OBJECT',
      properties: {
        title: { type: 'STRING' },
        subtitle: { type: 'STRING' },
        vega_lite: { type: 'STRING', description: 'مواصفة Vega-Lite v5 كنص JSON' },
        kpis: {
          type: 'ARRAY',
          description: '2 إلى 4 أرقام رئيسية تظهر كعدّادات متحركة',
          items: { type: 'OBJECT', properties: { label: { type: 'STRING' }, value: { type: 'NUMBER' }, unit: { type: 'STRING' } }, required: ['label', 'value'] },
        },
        insights: { type: 'ARRAY', items: { type: 'STRING' }, description: '1 إلى 3 ملاحظات قصيرة تنكتب على الشاشة' },
      },
      required: ['title', 'vega_lite'],
    },
  },
  {
    name: 'show_overview',
    description: 'يعرض لوحة منبثقة شاملة لكل المشاريع (الحالات، الميزانيات، التذاكر). استخدمها لما يطلب نظرة عامة أو ملخص.',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'close_visuals',
    description: 'يقفل كل النوافذ المنبثقة لما يطلب المستخدم يقفلها أو يخلص منها.',
    parameters: { type: 'OBJECT', properties: {} },
  },
];

// أدوات «التحكم بالواجهة»: تنفّذ في المتصفح وتنحفظ في /api/ui
const FONT_LIST = ['IBM Plex Sans Arabic', 'Cairo', 'Tajawal', 'Almarai', 'Noto Kufi Arabic', 'Noto Naskh Arabic', 'Readex Pro', 'Changa', 'El Messiri', 'Reem Kufi', 'Lalezar', 'Amiri', 'Markazi Text', 'Rubik', 'Baloo Bhaijaan 2', 'Lemonada', 'Kufam', 'Aref Ruqaa', 'Mada', 'Harmattan'];
const THEME_LIST = ['ليلي أزرق', 'فاتح', 'أخضر سعودي', 'ذهبي صحراوي', 'بنفسجي ملكي', 'هولوجرام', 'وردي ليلي'];
const uiDeclarations = [
  { name: 'set_font', description: 'يغيّر خط الواجهة كاملة.', parameters: { type: 'OBJECT', properties: { font: { type: 'STRING', enum: FONT_LIST } }, required: ['font'] } },
  { name: 'show_fonts', description: 'يعرض معرض الخطوط المتاحة بعينات حيّة (لما يطلب يشوف خطوط أو يبي خطوط زيادة).', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'set_theme', description: 'يطبّق ثيم ألوان جاهز.', parameters: { type: 'OBJECT', properties: { theme: { type: 'STRING', enum: THEME_LIST } }, required: ['theme'] } },
  {
    name: 'set_colors', description: 'يغيّر ألوان محددة بصيغة hex. bg=الخلفية، card=البطاقات، line=الحدود، ink=النص، mute=النص الثانوي، acc=اللون الرئيسي، ok/warn/bad=ألوان الحالات.',
    parameters: { type: 'OBJECT', properties: Object.fromEntries(['bg', 'card', 'line', 'ink', 'mute', 'acc', 'ok', 'warn', 'bad'].map(k => [k, { type: 'STRING' }])) },
  },
  {
    name: 'set_text_size', description: 'يكبّر أو يصغّر الخط. scale من 0.6 إلى 2.2 (1 = الطبيعي، 1.2 = أكبر 20٪).',
    parameters: { type: 'OBJECT', properties: { target: { type: 'STRING', enum: ['all', 'table', 'kpi', 'chat', 'header', 'titles'] }, scale: { type: 'NUMBER' } }, required: ['scale'] },
  },
  { name: 'set_table_style', description: 'يغيّر شكل الجداول.', parameters: { type: 'OBJECT', properties: { style: { type: 'STRING', enum: ['default', 'striped', 'compact', 'bordered', 'glass', 'cards'] } }, required: ['style'] } },
  { name: 'set_corners', description: 'استدارة زوايا البطاقات بالبكسل (0 حادة، 24 دائرية).', parameters: { type: 'OBJECT', properties: { radius: { type: 'NUMBER' } }, required: ['radius'] } },
  {
    name: 'apply_custom_css', description: 'لأي تعديل شكلي ما تغطيه الأدوات الثانية: اكتبي CSS. المحددات المتاحة: header, h1, h2, .kpi, .kpi b, .card, table, th, td, .tag, .bar i, .mic, #log, .m.u, .m.a, aside.agent. المتغيرات: --bg --card --line --ink --mute --acc. ممنوع روابط خارجية.',
    parameters: { type: 'OBJECT', properties: { css: { type: 'STRING' }, description: { type: 'STRING', description: 'وصف قصير بالعربي للتعديل' } }, required: ['css', 'description'] },
  },
  { name: 'undo_ui', description: 'يتراجع عن آخر تغيير في الواجهة.', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'reset_ui', description: 'يرجّع الواجهة لشكلها الأصلي.', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'get_ui_state', description: 'يرجّع إعدادات الواجهة الحالية (الخط، الألوان، الأحجام...).', parameters: { type: 'OBJECT', properties: {} } },
];

// أدوات المساعد في المتصفح (فتح تطبيقات/روابط/داشبوردات)
const APP_LIST = ['whatsapp', 'gmail', 'calendar', 'drive', 'youtube', 'google', 'maps', 'notion', 'linkedin', 'x', 'github', 'claude', 'chatgpt', 'metricool', 'aistudio', 'render', 'outlook', 'teams'];
const assistantDeclarations = [
  {
    name: 'open_app', description: 'تفتح تطبيق ويب أو موقع في تبويب جديد. واتساب: phone + message تفتح محادثة مع مسودة جاهزة (المستخدم يضغط إرسال بنفسه). query للبحث داخل التطبيق (google, youtube, maps, gmail, drive, x, github, linkedin). url لأي رابط https.',
    parameters: { type: 'OBJECT', properties: { app: { type: 'STRING', enum: APP_LIST }, query: { type: 'STRING' }, url: { type: 'STRING' }, phone: { type: 'STRING', description: 'رقم الجوال مثل 0501234567' }, message: { type: 'STRING' } } },
  },
  { name: 'open_dashboard', description: 'تفتح داشبورد محفوظ سابقاً برقمه.', parameters: { type: 'OBJECT', properties: { id: { type: 'INTEGER' } }, required: ['id'] } },
];

const activeDeclarations = () => [
  ...Object.entries(tools).filter(([, t]) => ALLOW_WRITES || !t.write).map(([, t]) => t.declaration),
  ...visualDeclarations,
  ...uiDeclarations,
  ...assistantDeclarations,
].map(d => ({ ...d, behavior: 'BLOCKING' }));

const SYSTEM_PROMPT = `أنتِ "نورة"، المساعدة الذكية لمنصة متابعة مشاريع التحول الرقمي. أنثى، واثقة، حماسية وودودة.
- عرّفي بنفسك باسم نورة لو أحد سألك مين أنتِ.
- تكلّمي باللهجة السعودية البيضاء بصيغة المؤنث، بإيجاز وحماس، وجمل قصيرة تناسب الكلام.
- أنتِ تقدرين تعرضين نوافذ منبثقة ورسوم بيانية على الشاشة (مثل أفلام الخيال العلمي):
  * سؤال عن مشروع معيّن → نادي show_project_visual فوراً، وبعدها لخّصي أهم نقطتين بصوتك.
  * طلب نظرة عامة أو ملخص → show_overview.
  * أي نوع رسم يطلبه (باي، جانت، خريطة حرارية، نقاط، شلال، أي شي) → اجلبي الأرقام بالأدوات (search_projects فيها start_date و due_date و budget و spent و progress)
    ثم render_visual بمواصفة Vega-Lite تكتبينها بنفسك، مع 2-4 عدّادات kpis و 1-3 insights قصيرة. show_chart للأعمدة البسيطة السريعة فقط.
  * قولي جمل قصيرة حماسية مع العرض مثل "تفضّل، هذي الصورة كاملة قدامك".
  * "سكّري" أو "قفّلي الشاشات" → close_visuals.
- أنتِ الواجهة اللي تدير الشركة: تقدرين تعدّلين شكل اللوحة نفسها فوراً:
  * خط → set_font، "وريني خطوط"/"أبي خطوط زيادة" → show_fonts، ألوان أو ثيم → set_theme أو set_colors،
    "كبّري/صغّري" → set_text_size، شكل الجداول → set_table_style، الزوايا → set_corners،
    أي تعديل شكلي ثاني → apply_custom_css، "رجّعي" → undo_ui، "الشكل الأصلي" → reset_ui.
  * نفّذي مباشرة بدون استئذان (التعديلات الشكلية آمنة وتنتراجع)، وبعدها قولي بالتفصيل وش تغيّر.
  * لو الطلب أكبر من الشكل (ميزة جديدة، صفحة، تكامل، تعديل بالبيانات أو الباك اند) → request_dev_change
    واكتبي التفاصيل كاملة، وقولي له إن الطلب انسجّل برقم كذا عند فريق التطوير.
- أنتِ مساعدة فواز الشخصية:
  * "افتحي واتساب/جيميل/يوتيوب..." → open_app. "أرسلي لفلان على واتساب كذا" → open_app بـ phone و message (مسودة؛ هو يضغط إرسال).
    لو رجع opened=false قولي له يضغط زر «افتح» اللي طلع على الشاشة.
  * "سوّي لي داشبورد/لوحة/تقرير عن كذا" → اجلبي البيانات بالأدوات ثم build_dashboard بتصميم غني (بطاقات + رسوم ECharts متنوعة + جدول + ملاحظات)،
    وقولي له إنه انفتح برقم كذا. "افتحي الداشبورد رقم كذا" → open_dashboard، "وش الداشبوردات اللي سويتيها" → list_dashboards.
- أنتِ تتعلمين وتتذكرين:
  * لما فواز يقول "تذكّري"، أو يصحّحك، أو يذكر تفضيل أو أسلوب أو مصطلح خاص ومعناه، أو شخص ودوره → remember فوراً، وقولي "حفظتها" بكلمة.
  * لو احتجتِ معلومة شخصية مو موجودة في ملخص الذاكرة تحت → recall. "انسي كذا" → forget. "وش تتذكرين عني" → list_memories.
  * طبّقي الذاكرة بهدوء في كل رد (أسلوبه، مصطلحاته)، بدون ما تقولين "حسب ذاكرتي".
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
function buildSetup(mode, voice = VOICE, sys = promptFor(mode)) {
  return {
    model: `models/${MODEL}`,
    generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
    systemInstruction: { parts: [{ text: sys }] },
    tools: [{ functionDeclarations: activeDeclarations() }],
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    realtimeInputConfig: { automaticActivityDetection: { silenceDurationMs: 700, prefixPaddingMs: 40 } },
  };
}

const app = express();
app.use(express.json({ limit: '1mb' }));

// الواجهة (ملفات محددة فقط)
for (const f of ['index.html', 'gemini-live-agent.js', 'pcm-recorder.js', 'hud.js', 'ui-control.js', 'assistant.js'])
  app.get(f === 'index.html' ? '/' : `/${f}`, (req, res) => res.sendFile(f, { root: '.' }));
app.get('/health', (req, res) => res.send('ok'));
app.get('/d/:id', (req, res) => res.sendFile('dash.html', { root: '.' }));

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
    const sys = promptFor(mode) + await memoryBlock(); // ذاكرة نورة تنحقن مع كل جلسة
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
          systemInstruction: sys,
          tools: [{ functionDeclarations: activeDeclarations() }],
        },
      };
    }
    const token = await ai.authTokens.create({ config });
    res.json({ token: token.name, apiVersion, mode, voice: pickVoice(req.query.voice), setup: buildSetup(mode, pickVoice(req.query.voice), sys) });
  } catch (e) {
    console.error('token error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// 2) تنفيذ الأدوات
app.post('/api/tools/:name', async (req, res) => {
  const tool = tools[req.params.name];
  if (!tool) return res.status(404).json({ error: 'أداة غير معروفة' });
  if (tool.write && !ALLOW_WRITES) return res.status(403).json({ error: 'التعديل مقفل' });
  try {
    const result = await tool.run(req.body || {});
    console.log(`[tool] ${req.params.name}`, JSON.stringify(req.body), '→', JSON.stringify(result).slice(0, 200));
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 2.5) صوت فواز: نص → Gemini TTS (صوت مستنسخ) → PCM 24kHz يتبث للمتصفح أول بأول
app.post('/api/speak', async (req, res) => {
  const text = String(req.body?.text || '').trim().slice(0, 1500);
  const voice = NORA_VOICES.includes(req.body?.voice) ? req.body.voice : MY_VOICE_ID;
  if (!text) return res.status(400).json({ error: 'نص فاضي' });
  try {
    const stream = await ai.interactions.create({
      model: TTS_MODEL,
      input: text,
      response_format: { type: 'audio' },
      generation_config: { speech_config: [{ voice }] },
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

// إعدادات الواجهة (نورة تحفظها هنا)
app.get('/api/ui', async (req, res) => res.json((await kvGet('ui')) || {}));
app.post('/api/ui', async (req, res) => {
  if (JSON.stringify(req.body || {}).length > 20000) return res.status(413).json({ error: 'كبير' });
  await kvSet('ui', req.body || {});
  res.json({ ok: true });
});

// الذاكرة والداشبوردات
app.get('/api/memories', async (req, res) => res.json({ memories: await listForUI() }));
app.delete('/api/memories/:id', async (req, res) => res.json({ ok: !!(await memDelete(+req.params.id)) }));
app.get('/api/dashboards/:id', async (req, res) => {
  const d = await dashGet(+req.params.id);
  d ? res.json(d) : res.status(404).json({ error: 'غير موجود' });
});

app.get('/api/voices', (req, res) => res.json({ voices: NORA_VOICES, default: VOICE }));

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
app.get('/api/dashboard', async (req, res) => {
  res.json({
    dashboards: await dashList(),
    memories: await listForUI(),
    summary: dataTools.get_dashboard_summary.run(),
    projects: db.prepare('SELECT * FROM projects').all(),
    tickets: dataTools.list_tickets.run().tickets,
    documents: docTools.list_documents.run().documents,
    dev_requests: dataTools.list_dev_requests.run().requests,
  });
});

initMemory(ai);
initStore()
  .catch(e => console.error('[store] init failed:', e.message))
  .finally(() => app.listen(PORT, () => console.log(`✅ http://localhost:${PORT}  (model: ${MODEL}, api: ${API_VERSION}, code: ${ACCESS_CODE ? 'on' : 'off'}, store: ${backend})`)));
