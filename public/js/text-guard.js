// حراسة نص المساعد (مشترك بين السيرفر والمتصفح):
// 1) وسوم الأدوات الداخلية ما تطلع في الكلام ولا في الأرشيف — النموذج كان يقلّدها بدل ما ينفّذ الأداة فعلاً.
// 2) كشف ادعاء «معروض قدامك» عشان نتأكد إن أداة عرض اشتغلت فعلاً في نفس الدور.
// trim:false للمقاطع المتدفقة (المسافة في أول/آخر المقطع جزء من الكلام)
export const stripToolTags = (s, { trim = true } = {}) => {
  const out = String(s ?? '').replace(/\s*⟨نفّذت[^⟩]*⟩/g, '').replace(/\s*\[استخدمت [^\]]*\]/g, '');
  return trim ? out.replace(/\s{2,}/g, ' ').trim() : out;
};

// ادعاء عرض = «قدامك/على الشاشة» بصيغة الحاضر، مو سؤال ولا عرض/نفي («أقدر أعرضها»، «تبغى»، «ما عرضت»)
const CLAIM = /قدامك|على الشاشة/;
const NOT_CLAIM = /[؟?]|(^|\s)(ما|لا|مو|لو)\s|أقدر|اقدر|تبغى|تبي|ودك|أعرض|اعرض|بعرض|راح أعرض/;
export const claimsScreen = s => String(s ?? '').split(/(?<=[.!؟?\n،,])/).some(x => CLAIM.test(x) && !NOT_CLAIM.test(x));

// أدوات تغيّر الشاشة فعلاً
export const SCREEN_TOOL = /^(show_|render_|data_chart|build_dashboard|pdf_dashboard|open_dashboard)/;

// تصنيف الأدوات لحراس الشاشة في الواجهة (أدوات pdf_* لها نفس مكانة الأدوات القديمة — كانت تنرفض وتنحوّل لـ data_chart)
const DATA_TOOLS = /^(data_chart|query|list_|get_|search|find_|dashboard|portfolio|stats|project|ticket|task|usage|check_job|pdf_)/;
const VISUAL_TOOLS = new Set(['data_chart', 'query_data', 'find_knowledge', 'show_chart', 'show_overview', 'show_project_visual', 'render_visual', 'show_screen', 'build_dashboard', 'pdf_dashboard']);
export const isDataTool = n => DATA_TOOLS.test(n);
export const isVisualTool = n => VISUAL_TOOLS.has(n);
export const isDashboardTool = n => n === 'build_dashboard' || n === 'pdf_dashboard';
