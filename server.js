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
import { restore as restoreSqlite, snapshotSoon } from './persist.js';
import { dashboardFromDocument, getCurrentDash, setCurrentDash } from './file-dash.js';
import { designerName } from './designer.js';
import { sseRoute, BOOT_ID } from './events.js';
import { agentTools, initAgent, agentStatus } from './agent.js';
import { driveTools, archiveToDrive, driveSetup, driveReady } from './drive.js';
import { mintSecret, listVoices, toRealtimeTools, elevenReady, ELEVEN_MODEL } from './eleven.js';
import { datasetTools, ingestDocument, latestCatalog } from './datasets.js';
import { knowledgeTools, importBundle, knowledgeCatalog, kList } from './knowledge.js';
import { historyTools, historyBlock, initHistory, chatStart, addTurns, digestNow, digestPending, recentForUI } from './history.js';

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

// استهلاك التوكنز: المتصفح يرسل أرقام كل جلسة، وننحفظ مجاميع يومية
const usageTools = {
  get_token_usage: {
    declaration: { name: 'get_token_usage', description: 'يعرض استهلاك التوكنز للمحادثات الصوتية: اليوم، آخر الأيام، وآخر الجلسات (لكل محرك).', parameters: { type: 'OBJECT', properties: {} } },
    run: async () => {
      const u = (await kvGet('usage')) || { days: {}, sessions: [] };
      const today = new Date().toISOString().slice(0, 10);
      return { today: u.days[today] || {}, last_days: Object.fromEntries(Object.entries(u.days).sort().slice(-7)), recent_sessions: u.sessions.slice(-8), note: 'محرك فواز ما يرجّع أرقام توكنز، فالأرقام لنورة (Gemini) بالأساس' };
    },
  },
};
const tools = { ...dataTools, ...docTools, ...memoryTools, ...dashboardTools, ...historyTools, ...datasetTools, ...knowledgeTools, ...usageTools, ...driveTools, ...agentTools };
initAgent(tools);

// أدوات «العرض»: تنفّذ في المتصفح (نوافذ منبثقة ورسوم) — السيرفر بس يعرّفها للموديل
const visualDeclarations = [
  {
    name: 'show_project_visual',
    description: 'يعرض على الشاشة الرئيسية تفاصيل مشروع: عدّاد الإنجاز، الميزانية مقابل المصروف، التذاكر حسب الأولوية، والأيام المتبقية. استخدمها كل ما سأل المستخدم عن تفاصيل أو وضع مشروع معيّن.',
    parameters: { type: 'OBJECT', properties: { project_id: { type: 'INTEGER' }, name: { type: 'STRING', description: 'جزء من اسم المشروع' } } },
  },
  {
    name: 'show_chart',
    description: 'يرسم رسم بياني على الشاشة الرئيسية من أرقام جبتها من الأدوات في نفس هذا الدور (مو من كلام سابق في المحادثة — ينرفض لو ما استدعيتي أداة بيانات قبله). لبيانات الملفات استخدمي data_chart بدلها لأنه يجيب ويرسم كل الفئات.',
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
    description: `يرسم أي رسم بياني تطلبه في اللحظة (دائري، جانت، خريطة حرارية، نقاط، مساحات، شلال، مركّب...) على الشاشة الرئيسية مع عدّادات ووصف.
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
    description: 'يعرض على الشاشة الرئيسية نظرة شاملة لكل المشاريع (الحالات، الميزانيات، التذاكر). استخدمها لما يطلب نظرة عامة أو ملخص.',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'close_visuals',
    description: 'يرجّع الشاشة الرئيسية (البيانات الأساسية) مكان الرسم المعروض. لما يقول: رجعي/ارجعي للرئيسية/للبيانات/الشاشة الأساسية/سكّري/خلاص.',
    parameters: { type: 'OBJECT', properties: {} },
  },
];

// أدوات «التحكم بالواجهة»: تنفّذ في المتصفح وتنحفظ في /api/ui
const FONT_LIST = ['IBM Plex Sans Arabic', 'Cairo', 'Tajawal', 'Almarai', 'Noto Kufi Arabic', 'Noto Naskh Arabic', 'Readex Pro', 'Changa', 'El Messiri', 'Reem Kufi', 'Lalezar', 'Amiri', 'Markazi Text', 'Rubik', 'Baloo Bhaijaan 2', 'Lemonada', 'Kufam', 'Aref Ruqaa', 'Mada', 'Harmattan'];
const THEME_LIST = ['ليلي أزرق', 'فاتح', 'أخضر سعودي', 'ذهبي صحراوي', 'بنفسجي ملكي', 'هولوجرام', 'وردي ليلي'];
const uiDeclarations = [
  { name: 'show_screen', description: 'تعرض قسم على الشاشة الرئيسية (اللي تبدأ فاضية). القسم الجديد ياخذ مكان اللي قبله. للرجوع للشاشة الفاضية: close_visuals.', parameters: { type: 'OBJECT', properties: { view: { type: 'STRING', enum: ['overview', 'projects', 'tickets', 'tasks', 'files', 'dashboards', 'memory', 'dev_requests', 'file_dashboard'] } }, required: ['view'] } },
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
    name: 'apply_custom_css', description: 'لأي تعديل شكلي ما تغطيه الأدوات الثانية: اكتبي CSS. المحددات المتاحة: header.top, h1, h2, .kpi, .kpi b, .card, table, th, td, .tag, .bar i, .composer, #caption, #log, .m.u, .m.a, .hud. المتغيرات: --bg --card --line --ink --mute --acc. ممنوع روابط خارجية.',
    parameters: { type: 'OBJECT', properties: { css: { type: 'STRING' }, description: { type: 'STRING', description: 'وصف قصير بالعربي للتعديل' } }, required: ['css', 'description'] },
  },
  {
    name: 'set_number_style', description: 'شكل الأرقام في الشاشة الرئيسية: digits=arabic (٥٣٠) أو latin (530)، و font خط مخصص للأرقام فقط (اختياري).',
    parameters: { type: 'OBJECT', properties: { digits: { type: 'STRING', enum: ['arabic', 'latin'] }, font: { type: 'STRING', enum: FONT_LIST } } },
  },
  { name: 'look_at_screen', description: 'تشوفين الشاشة اللي قدام فواز الحين: العنوان، البطاقات والأرقام، جدول المشاريع والتذاكر، الخط والألوان الحالية، والرسم المعروض حالياً (لو فيه). استخدميها كل ما تكلّم عن "الشاشة/اللوحة/الداشبورد/هذي الصفحة".', parameters: { type: 'OBJECT', properties: {} } },
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
].map(d => (/extended-thinking/.test(MODEL) ? d : { ...d, behavior: 'BLOCKING' })); // نسخة التفكير الموسّع ما تقبل BLOCKING

const SYSTEM_PROMPT = `أنتِ "نورة"، المساعدة الذكية لمنصة متابعة مشاريع التحول الرقمي. أنثى، واثقة، حماسية وودودة.
- عرّفي بنفسك باسم نورة لو أحد سألك مين أنتِ.
- قواعد النطق (كلامك يتحوّل صوت مباشرة، فاكتبيه زي ما ينقال):
  * الأرقام انطقيها كلمات باللهجة السعودية مو أرقام: ٤٦٬٩٧٠ = «ستة وأربعين ألف وتسعمية وسبعين»، ٧٫٨ = «سبعة وثمانية من عشرة»، ١٢ = «اثنعش».
    الأرقام الكبيرة قرّبيها لو الدقة مو مهمة: «تقريباً سبعة وأربعين ألف». النسب «بالمية» مو «٪»، والمبالغ «ريال».
  * التواريخ: «خمسة وعشرين أكتوبر» مو «٢٥/١٠». الأوقات: «الساعة تسع ونص».
  * لا تنطقين رموز أو اختصارات (# % / - * ⟨⟩) ولا تقرين جداول أو أكواد؛ لخّصيها بكلام.
  * لا تخلطين إنجليزي وسط الجملة؛ قولي الكلمة بالعربي (ملف إكسل، لوحة، رسم بياني) إلا اسم علم ما له مقابل.
  * جمل قصيرة بوقفات طبيعية، ونبرة سعودية بيضاء واضحة، بدون فصحى ثقيلة.
- الأدوات: نادي الأداة فوراً في نفس الرد (لا تنهين ردك بجملة انتظار بدون ما تنادين الأداة). لا تقولين أي رقم أو نتيجة قبل ما يوصلك ردها؛ جملة الانتظار اختيارية وقصيرة جداً، وبعدها جاوبي من الرد بالضبط.
- تكلّمي باللهجة السعودية البيضاء بصيغة المؤنث، بإيجاز وحماس، وجمل قصيرة تناسب الكلام.
- أنتِ تقدرين تعرضين رسوم وتفاصيل على الشاشة الرئيسية نفسها (تاخذ مكان البيانات الأساسية مؤقتاً، بهوية الاتحاد، بدون نوافذ منبثقة):
  * سؤال عن مشروع معيّن → نادي show_project_visual فوراً، وبعدها لخّصي أهم نقطتين بصوتك.
  * طلب نظرة عامة أو ملخص → show_overview.
  * أي نوع رسم يطلبه (باي، جانت، خريطة حرارية، نقاط، شلال، أي شي) → اجلبي الأرقام بالأدوات (search_projects فيها start_date و due_date و budget و spent و progress)
    ثم render_visual بمواصفة Vega-Lite تكتبينها بنفسك، مع 2-4 عدّادات kpis و 1-3 insights قصيرة. show_chart للأعمدة البسيطة السريعة فقط.
  * قولي جمل قصيرة حماسية مع العرض مثل "تفضّل، هذي الصورة كاملة قدامك".
  * "رجعي للرئيسية" أو "فضّي الشاشة" أو "سكّري" أو "خلاص" → close_visuals (ترجع الشاشة فاضية).
  * كل رسم جديد ياخذ مكان اللي قبله؛ ما فيه نوافذ فوق بعض.
- الشاشة الرئيسية تبدأ فاضية (مثل ChatGPT): ترحيب وشريط الكلام بس. أنتِ اللي تعرضين عليها اللي يطلبه بـ show_screen:
  overview = لوحة المشاريع (البطاقات + المشاريع + التذاكر)، projects، tickets، tasks = مهامه، files = الملفات المرفوعة،
  dashboards = الداشبوردات المولّدة، memory = ذاكرتك، dev_requests = طلبات التطوير، file_dashboard = لوحة آخر ملف.
  * "وريني المشاريع/لوحة المشاريع/مهامي/الملفات…" → show_screen بالقسم المناسب، وبعدها جملة قصيرة عن أهم شي فيه.
  * «وريني / اعرضي / افتحي / طلّعي / أبي أشوف» = show_screen دايماً (حتى لو جاوبتي بالكلام بعد، وحتى لو جات مع طلب ثاني في نفس الجملة).
  * الشاشة لازم تطابق كلامك دايماً وبنفس اللحظة: أي جواب فيه بيانات أو أرقام → اعرضي اللي تتكلمين عنه على الشاشة قبل أو مع كلامك:
    أرقام من ملف → data_chart، أرقام المشاريع أو مقارنة → show_chart أو show_overview، مشروع معيّن → show_project_visual، مهام/ملفات/تذاكر → show_screen بالقسم.
    لو انتقل الكلام لموضوع ثاني بدّلي الشاشة له. لو الكلام عام بدون بيانات (سلام، رأي) خلّي الشاشة مثل ما هي.
    ممنوع تقولين رقم أو قائمة والشاشة فاضية أو تعرض شي ثاني.
  * "الداشبورد" أو "لوحة المشاريع" بدون رقم = overview، مو الداشبوردات المولّدة (list_dashboards للمولّدة فقط).
- إدارة المهام: "ذكّريني/سجّلي مهمة/عندي شغلة…" → add_task (الموعد YYYY-MM-DD محسوب من تاريخ اليوم)، "وش مهامي" → list_tasks و show_screen(tasks) مع بعض، وقولي أهمها بالكلام،
  "خلصت كذا" → update_task بالحالة منجزة. رتّبيها له حسب الأولوية والموعد لما يسأل وش أبدأ فيه.
- Claude هو الباك اند والمطوّر حقك، وشغال دايماً بالخلفية:
  * أي مهمة كبيرة تحتاج خطوات أو تفكير عميق (تحليل، تقرير، خطة، داشبورد معقد) → ask_claude فوراً.
  * أي تطوير أو تعديل في كود المنصة (ميزة، شاشة، تكامل، إصلاح خلل) → request_dev_change بالتفاصيل كاملة، وقولي له إن Claude بينفّذه أول ما يفتح محادثة معه.
  * قولي له بجملة إن Claude شغال عليها، وكمّلي معه عادي؛ لما يوصلك تنبيه إن Claude خلّص، قولي النتيجة باختصار.
  * "وش صار على شغل Claude" → check_job. لو طلب رأي GPT بالاسم → ask_gpt.
  * لا تجدولين شي ولا تأجّلين: كل طلب تقدرين عليه يتنفذ على طول.
  * لما يرفع ملف، النظام يبني «لوحة الملف» تلقائياً ويعرضها داخل الشاشة الرئيسية، ويوصلك تنبيه برقمها. أسئلته بعدها عن «اللوحة» أو «الأرقام» أو «الملف» = عن هذي اللوحة وملفها:
    جاوبي من الملف بـ search_documents/read_document، ولو طلب تعديل عليها (رسم إضافي، تقسيم مختلف) ابني نسخة جديدة بـ build_dashboard وتنعرض مكانها.
  * بيانات Excel/CSV محفوظة كجداول منظّمة (مذكورة تحت بأعمدتها):
    - أي سؤال رقمي عنها (كم، مجموع، متوسط، الأعلى، حسب كذا، بشرط كذا) → query_data، وجاوبي بالأرقام اللي ترجع بالضبط.
    - أرقام الملفات تنحسب من جديد كل مرة بـ query_data/data_chart؛ ممنوع تاخذين رقم من المحادثات السابقة أو الذاكرة.
    - سؤال «في كل منطقة/حسب كذا» = كل الفئات، مو بس الأعلى.
    - لما تشرحين الشارت اذكري أسماء الفئات بنفس كتابتها على الشاشة مع أرقامها، عشان تتظلل وانتي تتكلمين.
    - لا تستدعين list_documents ولا search_documents قبل الشارت: data_chart وquery_data يختارون الملف الصحيح تلقائياً، استدعيها مباشرة كأول خطوة.
- مكتبة المعرفة (ملفات منظّمة من Drive Data-Knowledge): سؤال عن محتوى مستند/دراسة/تقرير محفوظ أو ما تعرفين وين البيانات → find_knowledge أولاً كأول خطوة (بدون read_document أو list_documents) — تعرض ملخص الملف على الشاشة تلقائياً (on_screen)، فابدئي جوابك بالأرقام اللي في on_screen وبعدها التفاصيل من الأقسام، واذكري اسم الملف. لشارت من جدول في المكتبة مرّري dataset_id حقه لـ data_chart مباشرة. لو النتيجة فيها quality_pending أو الحالة «جزئية» قوليها بجملة قصيرة.
- أي طلب شارت أو رقم عن عمود موجود في «بيانات الملف» أو «مكتبة المعرفة» → data_chart/query_data مباشرة حتى لو آخر ملف مرفوع PDF. ممنوع تقولين «ما عندي بيانات» قبل ما تجربين data_chart (هي تدوّر بنفسها في كل الجداول).
- لو رجع data_chart بخطأ «ما لقيت العمود»، أعيدي الاستدعاء فوراً باسم العمود كما هو مكتوب في قائمة الأعمدة داخل الخطأ (بدون list_documents أو read_document). عنوان الشارت دايماً بالعربي.
- أي شارت يطلبه عن الملف → data_chart فوراً (bar/hbar/stacked/line/area/pie/donut) ويطلع على الشاشة الرئيسية مكان البيانات. لا تستخدمين render_visual لبيانات الملف.
    - search_documents/read_document للملفات النصية (PDF/Word) أو للبحث عن نص.
  * أنتِ تشوفينها: لا تقولين أبداً "ما أشوف الشاشة". نادي look_at_screen وجاوبي مما فيها، ووصفها المختصر موجود تحت.
  * أي طلب تعديل على شكلها (خط، أرقام، ألوان، أحجام، جداول) نفّذيه عليها مباشرة بأدوات الواجهة. الأرقام → set_number_style.
- أنتِ الواجهة اللي تدير الشركة: تقدرين تعدّلين شكل اللوحة نفسها فوراً:
  * خط → set_font، "وريني خطوط"/"أبي خطوط زيادة" → show_fonts، ألوان أو ثيم → set_theme أو set_colors،
    "كبّري/صغّري" → set_text_size، شكل الجداول → set_table_style، الزوايا → set_corners،
    أي تعديل شكلي ثاني → apply_custom_css، "رجّعي" → undo_ui، "الشكل الأصلي" → reset_ui.
  * نفّذي مباشرة بدون استئذان (التعديلات الشكلية آمنة وتنتراجع)، وبعدها قولي بالتفصيل وش تغيّر.
  * لو الطلب أكبر من الشكل (ميزة جديدة، صفحة، تكامل، تعديل بالبيانات أو الباك اند) → request_dev_change
    واكتبي التفاصيل كاملة، وقولي له إن الطلب انسجّل برقم كذا عند Claude (المطوّر) وبيطوّره وينعكس على الواجهة.
    "وين وصل طلبي/وش صار على طلبات التطوير" → list_dev_requests (فيها الحالة وملاحظة المطوّر).
  * "كم استهلكنا توكنز" → get_token_usage.
- أرشيف الملفات: كل ملف يرفعه ينحفظ تلقائياً في Google Drive حقه داخل «ملفات نورة» بتصنيفه. "جيبي/وين ملف كذا" أو "وش عندي ملفات عقود" → find_files، وقولي اسمه وتصنيفه، ولو طلب يفتحه → open_app بالرابط (url).
- أنتِ مساعدة فواز الشخصية:
  * "افتحي واتساب/جيميل/يوتيوب..." → open_app. "أرسلي لفلان على واتساب كذا" → open_app بـ phone و message (مسودة؛ هو يضغط إرسال).
    لو رجع opened=false قولي له يضغط زر «افتح» اللي طلع على الشاشة.
  * "سوّي لي داشبورد/لوحة/تقرير عن كذا" → اجلبي البيانات بالأدوات ثم build_dashboard بتصميم غني (بطاقات + رسوم ECharts متنوعة + جدول + ملاحظات)،
    وقولي له إنه انفتح برقم كذا. "افتحي الداشبورد رقم كذا" → open_dashboard، "وش الداشبوردات اللي سويتيها" → list_dashboards.
- أنتِ تتعلمين وتتذكرين:
  * لما فواز يقول "تذكّري"، أو يصحّحك، أو يذكر تفضيل أو أسلوب أو مصطلح خاص ومعناه، أو شخص ودوره → remember فوراً، وقولي "حفظتها" بكلمة.
  * لو احتجتِ معلومة شخصية مو موجودة في ملخص الذاكرة تحت → recall. "انسي كذا" → forget. "وش تتذكرين عني" → list_memories.
  * أي ملاحظة على الشكل أو اللغة أو طريقة العرض (مثل "خلي الخط عربي في الميزانية"، "لا تحولين للإنجليزي") = تفضيل دائم → remember فوراً قبل ما تنفذين.
  * طبّقي الذاكرة بهدوء في كل رد (أسلوبه، مصطلحاته)، بدون ما تقولين "حسب ذاكرتي".
  * عندك تحت ملخص جلساتك السابقة وآخر كلام دار بينكم: أنتِ تتذكرين المحادثة حتى لو انقطعت أو تحدّثت الصفحة، فكمّلي من وين وقفتوا.
  * كل النصوص اللي تكتبينها في الرسوم والداشبوردات (عناوين، محاور، تسميات، ملاحظات) تكون عربي دائماً إلا لو طلب غير كذا.
  * الهوية موحّدة: الخط والألوان وشكل الأرقام تتطبّق تلقائياً على الشاشة والرسوم والداشبوردات، فلا تحددين خطوط أو ألوان داخل مواصفات الرسوم.
    الأرقام اللي تكتبينها داخل النصوص (ملاحظات، عناوين) تكون بنفس شكل أرقام الشاشة المذكور تحت (إنجليزية 123 أو عربية ١٢٣).
- أي رقم أو اسم أو حالة لازم تجيبه من الأدوات؛ لا تخمّن ولا تألّف بيانات.
- قاعدة صارمة: لا تقولين "تم" أو "سوّيت" أو "انبنى" إلا إذا ناديتي الأداة فعلاً في نفس هذا الدور ورجعت نتيجتها ok. طلب داشبورد = لازم build_dashboard كل مرة.
- المبالغ بالريال، اقرأها بشكل طبيعي (مثلاً "مليون ومية ألف").
- قبل أي إضافة أو تعديل في البيانات، أكّد مع المستخدم بجملة وحدة وانتظر موافقته.
- المستخدم يقدر يرفع ملفات (PDF, Word, Excel...). لما يسأل عن ملف: استخدم search_documents للأسئلة المحددة،
  و read_document للتلخيص أو الملفات الصغيرة، و list_documents لو ما تعرف رقم الملف. اذكر اسم الملف اللي أخذت منه المعلومة.
- إذا جاتك رسالة تبدأ بـ [تنبيه النظام] فهي إشعار برفع ملف: رحّبي باختصار واسأليه وش يبي يعرف عنه.
- الملفات هي مصدر البيانات الأول بعد رفعها: لو فواز رفع ملف (أو فيه "آخر ملف مرفوع" تحت) وطلب داشبورد أو شارت أو تحليل بدون ما يقول "المشاريع"،
  فالمقصود الملف: read_document لكل صفحاته (page 1, 2, ...) واستخرجي منه الأرقام الحقيقية، ثم build_dashboard ببياناته هو (مو بيانات المشاريع)،
  واذكري اسم الملف في العنوان الفرعي. لو الملف نص وأرقامه قليلة، ابني الداشبورد من محاوره (بنود، أسعار، مراحل، نسب) وقولي له وش اعتمدتي عليه.
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
    generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
      ...(/extended-thinking/.test(MODEL) ? { thinkingConfig: { thinkingLevel: process.env.THINKING_LEVEL || 'medium' } } : {}) },
    systemInstruction: { parts: [{ text: sys }] },
    tools: [{ functionDeclarations: activeDeclarations() }],
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    realtimeInputConfig: { automaticActivityDetection: { silenceDurationMs: 700, prefixPaddingMs: 40 } },
  };
}

// وصف مختصر للشاشة الرئيسية ينحقن في تعليمات نورة مع بداية كل جلسة
async function screenBlock() {
  try {
    const s = dataTools.get_dashboard_summary.run();
    const projects = db.prepare('SELECT id, name, status, progress FROM projects ORDER BY id').all();
    const ui = (await kvGet('ui')) || {};
    const dashes = await dashList();
    const docs = db.prepare('SELECT id, name, chars FROM documents ORDER BY id DESC LIMIT 1').all();
    const cur = (await getCurrentDash()) || {};
    const catalog = await latestCatalog();
    return `\n\n## بيانات المنصة (الشاشة تبدأ فاضية، وهذي البيانات تقدرين تعرضينها بـ show_screen)
- البطاقات: ${projects.length} مشاريع، الميزانية ${s.total_budget} ريال، المصروف ${s.total_spent} ريال، ${s.open_tickets} تذاكر مفتوحة (${s.high_priority_open} عالية).
- المشاريع: ${projects.map(p => `#${p.id} ${p.name} (${p.status}، ${p.progress}%)`).join('، ')}.
- شكلها: الخط ${ui.font || 'IBM Plex Sans Arabic'}، الأرقام ${ui.numerals === 'latin' ? 'إنجليزية 123' : 'عربية ١٢٣'}${ui.numFont ? ` بخط ${ui.numFont}` : ''}، الجداول ${ui.table || 'default'}${(ui.css || []).length ? `، تعديلات مخصصة: ${ui.css.map(c => c.description).join('، ')}` : ''}.
- لوحة آخر ملف (file_dashboard): ${cur.id ? `#${cur.id} «${cur.title}»${cur.doc_name ? ` مبنية من ملف «${cur.doc_name}» رقم ${cur.doc_id}` : ''}` : 'لا يوجد'}.
- بيانات الملف الجاهزة للتحليل الفوري (استخدمي أسماء الأعمدة حرفياً):\n${catalog || 'لا يوجد ملف Excel/CSV'}
- مكتبة المعرفة:\n${(await knowledgeCatalog()) || 'فاضية'}
- آخر ملف مرفوع: ${docs.length ? `#${docs[0].id} «${docs[0].name}» (${docs[0].chars} حرف)` : 'لا يوجد'}.
- داشبوردات مولّدة محفوظة: ${dashes.length ? dashes.slice(0, 10).map(d => `#${d.id} ${d.title}`).join('، ') : 'لا يوجد'}.`;
  } catch (e) { return ''; }
}

const app = express();
app.use(express.json({ limit: '1mb' }));

// الواجهة (ملفات محددة فقط)
for (const f of ['index.html', 'gemini-live-agent.js', 'pcm-recorder.js', 'hud.js', 'ui-control.js', 'assistant.js', 'eleven-agent.js'])
  app.get(f === 'index.html' ? '/' : `/${f}`, (req, res) => res.sendFile(f, { root: '.', headers: { 'Cache-Control': 'no-cache' } })); // دايماً أحدث نسخة بعد كل تحديث
app.get('/health', (req, res) => res.send('ok'));
// هوية اتحاد الغرف (الشعار)
app.get('/brand/:f', (req, res) => {
  if (!['fsc-logo.svg', 'fsc-logo-dark.svg'].includes(req.params.f)) return res.status(404).end();
  res.type('image/svg+xml').set('Cache-Control', 'public, max-age=86400').sendFile(req.params.f, { root: 'brand' });
});
app.get('/d/:id', (req, res) => res.sendFile('dash.html', { root: '.', headers: { 'Cache-Control': 'no-cache' } }));

// رمز الدخول لكل /api
app.use('/api', (req, res, next) => {
  if (!ACCESS_CODE || (req.get('x-access-code') || req.query.code) === ACCESS_CODE) return next();
  res.status(401).json({ error: 'رمز الدخول غلط' });
});
app.get('/api/ping', (req, res) => res.json({ ok: true, boot: BOOT_ID, agent: agentStatus() }));
sseRoute(app);
app.get('/api/agent/jobs', (req, res) => res.json({ status: agentStatus(), jobs: db.prepare('SELECT id, kind, status, request, result, created_at, updated_at FROM agent_jobs ORDER BY id DESC LIMIT 20').all() }));

// 1) توكن مؤقت: مفتاح API الحقيقي ما يطلع من السيرفر أبداً
app.get('/api/session', async (req, res) => {
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY غير مضبوط' });
  const apiVersion = req.query.v || API_VERSION;
  const mode = req.query.mode === 'mine' ? 'mine' : 'live';
  try {
    const [mem, hist, chatId, screen] = await Promise.all([memoryBlock(), historyBlock(), chatStart(), screenBlock()]);
    const sys = promptFor(mode) + screen + mem + hist; // ذاكرة نورة + سجل المحادثات تنحقن مع كل جلسة
    digestPending(chatId); // نراجع الجلسات السابقة اللي ما تراجعت (بالخلفية)
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
          ...(/extended-thinking/.test(MODEL) ? { thinkingConfig: { thinkingLevel: process.env.THINKING_LEVEL || 'medium' } } : {}),
          systemInstruction: sys,
          tools: [{ functionDeclarations: activeDeclarations() }],
        },
      };
    }
    const token = await ai.authTokens.create({ config });
    res.json({ token: token.name, chatId, apiVersion, mode, voice: pickVoice(req.query.voice), setup: buildSetup(mode, pickVoice(req.query.voice), sys) });
  } catch (e) {
    console.error('token error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// 1-ب) المحرك الثاني: ElevenLabs Eleven Realtime (نفس نورة ونفس الأدوات والذاكرة — للمقارنة)
app.get('/api/eleven/session', async (req, res) => {
  if (!elevenReady()) return res.status(500).json({ error: 'ELEVENLABS_API_KEY غير مضبوط في Render' });
  try {
    const [mem, hist, chatId, screen] = await Promise.all([memoryBlock(), historyBlock(), chatStart(), screenBlock()]);
    const name = process.env.ELEVEN_PERSONA || 'فواز';
    const persona = `【هوية هذه الجلسة — تتقدّم على أي وصف قبلها】 اسمك «${name}»، المساعد الذكي (ذكر). كل مكان في التعليمات يقول «نورة» أو يخاطبك بصيغة المؤنث = أنت ${name} بصيغة المذكر.
تكلّم باللهجة الحجازية الطبيعية بصيغة المذكر (مثل: «أبشر»، «إيوه»، «كدا»، «دحين»، «إيش»، «مرّة حلو»)، ولو أحد سألك مين أنت قل: أنا ${name}.
ذكريات وسجل «نورة» تحت هي ذكرياتك أنت.\n\n`;
    const style = `\n\n【أسلوب الرد — مهم جداً】
- خلّ طول الرد على قد السؤال: سؤال سريع أو رقم → جملة أو جملتين بالجواب مباشرة. طلب شرح أو تحليل → فصّل بنقاط مرتبة بالكلام. نقاش أو رأي → تفاعل مع فكرته، وأعطه رأيك وسبب، واسأل سؤال واحد بس لو فعلاً يفيد.
- ابدأ بالجواب نفسه، بدون مقدمات أو ترحيب متكرر («يا هلا والله» مرة وحدة بس في أول الجلسة).
- لا تختم كل رد بعرض «تبغى أسوي لك…؟» — اعرض خطوة جاية بس لما تكون مفيدة وواضحة.
- طابق نبرة فواز: لو مستعجل اختصر، لو يمزح تفاعل بخفة، لو جاد كن مركّز ومهني.
- الأرقام قلها بالكلام الطبيعي، وبدون إنجليزي وسط الجملة إلا اسم شي ما له مقابل.`;
    const sys = persona + promptFor('live') + screen + mem + hist + style;
    digestPending(chatId);
    const voice = String(req.query.voice || process.env.ELEVEN_VOICE || '').slice(0, 64) || undefined;
    const tools = toRealtimeTools(activeDeclarations());
    const s = await mintSecret({ instructions: sys, tools, voice });
    console.log(`[eleven] session chat #${chatId} model=${s.model} voice=${voice || '-'} tools=${tools.length}`);
    res.json({ secret: s.secret, model: s.model, chatId, voice, url: `wss://api.elevenlabs.io/v1/convai/realtime?model=${s.model}` });
  } catch (e) {
    console.error('[eleven] session error:', e.message);
    res.status(500).json({ error: e.message });
  }
});
app.get('/api/eleven/voices', async (req, res) => {
  if (!elevenReady()) return res.json({ ready: false, voices: [] });
  try { res.json({ ready: true, model: ELEVEN_MODEL(), default: process.env.ELEVEN_VOICE || '', voices: await listVoices() }); }
  catch (e) { res.status(500).json({ ready: true, error: e.message, voices: [] }); }
});

// سجل المحادثة: المتصفح يرسل كل دور (فواز/نورة) بعد ما يخلص
app.post('/api/chat/:id/turns', async (req, res) => {
  try { res.json({ ok: true, saved: await addTurns(+req.params.id, req.body?.turns) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/chat/:id/end', express.text({ type: '*/*' }), async (req, res) => {
  try {
    let turns = []; try { turns = JSON.parse(req.body || '{}').turns || []; } catch {}
    if (turns.length) await addTurns(+req.params.id, turns);
    digestNow(+req.params.id); res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/chat/recent', async (req, res) => res.json({ turns: await recentForUI(+req.query.limit || 30) }));

// 2) تنفيذ الأدوات
app.post('/api/tools/:name', async (req, res) => {
  const tool = tools[req.params.name];
  if (!tool) return res.status(404).json({ error: 'أداة غير معروفة' });
  if (tool.write && !ALLOW_WRITES) return res.status(403).json({ error: 'التعديل مقفل' });
  try {
    const result = await tool.run(req.body || {});
    if (tool.write) snapshotSoon();
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
  if (/\.dk\.json$/i.test(name)) { // حزمة من مهارة fawaz-data-intake → مكتبة المعرفة
    try { return res.json({ knowledge: await importBundle(JSON.parse(req.file.buffer.toString('utf8'))) }); }
    catch (e) { return res.status(400).json({ error: e.message }); }
  }
  try {
    const text = await extractText(req.file.buffer, name);
    const doc = saveDocument(name, req.file.mimetype, req.file.size, text);
    snapshotSoon();
    // ملفات Excel/CSV: نحوّلها لجداول منظّمة جاهزة للتحليل والشارتات الفورية
    let datasets = [];
    try { datasets = await ingestDocument(doc, req.file.buffer); } catch (e) { console.warn('[upload] ingest failed:', e.message); }
    console.log(`[upload] ${name} → doc #${doc.id} (${doc.chars} chars, ${datasets.length} tables)`);
    // أرشفة في Google Drive بالتصنيف الصح (بالخلفية)
    archiveToDrive(doc, req.file.buffer, req.file.mimetype).catch(e => console.warn('[drive] archive failed:', e.message));
    res.json({ ...doc, datasets });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// مكتبة المعرفة: استيراد حزمة JSON مباشرة + قائمة الملفات
app.post('/api/knowledge/import', async (req, res) => { try { res.json(await importBundle(req.body)); } catch (e) { res.status(400).json({ error: e.message }); } });
app.get('/api/knowledge', async (req, res) => res.json({ entries: (await kList()).map(({ sections, values, ...e }) => ({ ...e, sections: sections.length })) }));

// لوحة الملف: تتولد تلقائياً بعد الرفع وتظهر داخل الشاشة الرئيسية
app.post('/api/docs/:id/dashboard', async (req, res) => {
  try { const r = await dashboardFromDocument(+req.params.id); res.status(r.ok ? 200 : 400).json(r); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/drive/setup', async (req, res) => { try { res.json(await driveSetup()); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get('/api/current-dash', async (req, res) => res.json((await getCurrentDash()) || {}));
app.post('/api/current-dash', async (req, res) => { await setCurrentDash(req.body?.id ? req.body : {}); res.json({ ok: true }); });

// 4) بيانات اللوحة
// طلبات التطوير: Claude (المطوّر) يقرأها ويحدّث حالتها وملاحظته بعد ما يطوّرها
app.get('/api/dev-requests', (req, res) => {
  const rows = db.prepare('SELECT * FROM dev_requests ORDER BY id DESC').all();
  res.json({ requests: req.query.status ? rows.filter(r => r.status === req.query.status) : rows });
});
app.post('/api/dev-requests/:id', (req, res) => {
  const { status, note } = req.body || {};
  const r = db.prepare("UPDATE dev_requests SET status=COALESCE(?, status), dev_note=COALESCE(?, dev_note), updated_at=datetime('now') WHERE id=?").run(status || null, note || null, +req.params.id);
  snapshotSoon();
  res.json({ ok: r.changes > 0 });
});
// استهلاك التوكنز (يرسله المتصفح بعد كل رد)
app.post('/api/usage', async (req, res) => {
  const { chatId, engine = 'gemini', input = 0, output = 0, total = 0 } = req.body || {};
  const u = (await kvGet('usage')) || { days: {}, sessions: [] };
  const day = new Date().toISOString().slice(0, 10);
  const d = (u.days[day] ||= {}); const e = (d[engine] ||= { input: 0, output: 0, total: 0 });
  e.input += +input || 0; e.output += +output || 0; e.total += +total || 0;
  let s = u.sessions.find(x => x.chatId === chatId && x.engine === engine);
  if (!s) { s = { chatId, engine, day, input: 0, output: 0, total: 0 }; u.sessions.push(s); u.sessions = u.sessions.slice(-50); }
  s.input += +input || 0; s.output += +output || 0; s.total += +total || 0;
  await kvSet('usage', u);
  res.json({ ok: true, today: d });
});

app.get('/api/dashboard', async (req, res) => {
  res.json({
    dashboards: await dashList(),
    memories: await listForUI(),
    summary: dataTools.get_dashboard_summary.run(),
    projects: db.prepare('SELECT * FROM projects').all(),
    tickets: dataTools.list_tickets.run().tickets,
    documents: docTools.list_documents.run().documents,
    dev_requests: dataTools.list_dev_requests.run().requests,
    tasks: dataTools.list_tasks.run({ status: 'all' }).tasks,
  });
});

initMemory(ai);
initHistory(ai);
initStore()
  .then(restoreSqlite)
  .catch(e => console.error('[store] init failed:', e.message))
  .finally(() => app.listen(PORT, () => console.log(`✅ http://localhost:${PORT}  (model: ${MODEL}, api: ${API_VERSION}, code: ${ACCESS_CODE ? 'on' : 'off'}, store: ${backend}, designer: ${designerName()}, agent: ${JSON.stringify(agentStatus())})`)));
