import { tools } from '../tools/registry.js';
import { ALLOW_WRITES, MODEL } from '../config.js';

// أدوات «العرض»: تنفّذ في المتصفح (نوافذ منبثقة ورسوم) — السيرفر بس يعرّفها للموديل
export const visualDeclarations = [
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
export const FONT_LIST = ['IBM Plex Sans Arabic', 'Cairo', 'Tajawal', 'Almarai', 'Noto Kufi Arabic', 'Noto Naskh Arabic', 'Readex Pro', 'Changa', 'El Messiri', 'Reem Kufi', 'Lalezar', 'Amiri', 'Markazi Text', 'Rubik', 'Baloo Bhaijaan 2', 'Lemonada', 'Kufam', 'Aref Ruqaa', 'Mada', 'Harmattan'];
export const THEME_LIST = ['ليلي أزرق', 'فاتح', 'أخضر سعودي', 'ذهبي صحراوي', 'بنفسجي ملكي', 'هولوجرام', 'وردي ليلي'];
export const uiDeclarations = [
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
export const APP_LIST = ['whatsapp', 'gmail', 'calendar', 'drive', 'youtube', 'google', 'maps', 'notion', 'linkedin', 'x', 'github', 'claude', 'chatgpt', 'metricool', 'aistudio', 'render', 'outlook', 'teams'];
export const assistantDeclarations = [
  {
    name: 'open_app', description: 'تفتح تطبيق ويب أو موقع في تبويب جديد. واتساب: phone + message تفتح محادثة مع مسودة جاهزة (المستخدم يضغط إرسال بنفسه). query للبحث داخل التطبيق (google, youtube, maps, gmail, drive, x, github, linkedin). url لأي رابط https.',
    parameters: { type: 'OBJECT', properties: { app: { type: 'STRING', enum: APP_LIST }, query: { type: 'STRING' }, url: { type: 'STRING' }, phone: { type: 'STRING', description: 'رقم الجوال مثل 0501234567' }, message: { type: 'STRING' } } },
  },
  { name: 'open_dashboard', description: 'تفتح داشبورد محفوظ سابقاً برقمه.', parameters: { type: 'OBJECT', properties: { id: { type: 'INTEGER' } }, required: ['id'] } },
];

export const activeDeclarations = () => [
  ...Object.entries(tools).filter(([, t]) => ALLOW_WRITES || !t.write).map(([, t]) => t.declaration),
  ...visualDeclarations,
  ...uiDeclarations,
  ...assistantDeclarations,
].map(d => (/extended-thinking/.test(MODEL) ? d : { ...d, behavior: 'BLOCKING' })); // نسخة التفكير الموسّع ما تقبل BLOCKING
