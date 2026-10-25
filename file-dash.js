// لوحة الملف: أول ما يرفع فواز ملف (Excel/PDF/Word) نولّد له داشبورد تلقائياً من أرقامه الحقيقية ويظهر في الشاشة الرئيسية
import { db } from './db.js';
import { generate } from './history.js';
import { dashboardTools } from './dashboards.js';
import { kvGet, kvSet } from './store.js';

const PROMPT = (name, text) => `أنت مصمم داشبوردات تنفيذية. هذا محتوى ملف رفعه فواز اسمه «${name}» (Excel يجي كـ CSV لكل ورقة، أو نص PDF/Word).
صمّم داشبورد احترافي بالعربي من بيانات الملف الحقيقية فقط (ممنوع اختراع أرقام). رجّع JSON فقط بهذا الشكل:
{"title": "عنوان قصير يوضح موضوع الملف",
 "subtitle": "سطر يذكر اسم الملف ونطاقه",
 "kpis": [{"label": "...", "value": رقم, "unit": "ريال/٪/عقد/يوم...", "delta": "اختياري"}],        // 3 إلى 6 أهم الأرقام (مجاميع، متوسطات، نسب، أعداد)
 "charts": [{"title": "...", "span": 1 أو 2, "echarts_option": {كائن Apache ECharts كامل: series + xAxis/yAxis أو pie...}}], // 2 إلى 4 رسوم متنوعة ومناسبة للبيانات
 "tables": [{"title": "...", "columns": ["..."], "rows_json": "[[...],[...]]"}],                  // 1 إلى 2 جدول من صفوف الملف الفعلية (حتى 200 صف)
 "insights": ["...", "..."]}                                                                      // 3 إلى 4 ملاحظات تحليلية قصيرة ومفيدة
قواعد: كل النصوص عربي. الأرقام في value و data أرقام فعلية مو نصوص. لا تكتب دوال JavaScript ولا ألوان ولا خطوط داخل echarts_option.
لو الملف نص بدون جداول، استخرج منه الأرقام والبنود (أسعار، مدد، نسب، مراحل) وابني منها.

محتوى الملف:
${text}`;

export async function dashboardFromDocument(docId) {
  const d = db.prepare('SELECT id, name, content FROM documents WHERE id=?').get(docId);
  if (!d) return { error: 'الملف غير موجود' };
  const out = await generate(PROMPT(d.name, d.content.slice(0, 60000)));
  if (!out || !out.title) return { error: 'ما قدرت أولّد الداشبورد من الملف' };
  const args = {
    ...out,
    charts: (out.charts || []).map(c => ({ ...c, echarts_option: typeof c.echarts_option === 'string' ? c.echarts_option : JSON.stringify(c.echarts_option || {}) })),
    tables: (out.tables || []).map(t => ({ ...t, rows_json: typeof t.rows_json === 'string' ? t.rows_json : JSON.stringify(t.rows_json || t.rows || []) })),
  };
  const r = await dashboardTools.build_dashboard.run(args);
  if (r.ok) await setCurrentDash({ id: r.id, title: out.title, doc_id: d.id, doc_name: d.name });
  console.log(`[file-dash] doc #${d.id} → ${r.ok ? `dashboard #${r.id}` : r.error}`);
  return { ...r, title: out.title, doc_id: d.id, doc_name: d.name };
}

// الداشبورد المعروض حالياً داخل الشاشة الرئيسية
export const getCurrentDash = () => kvGet('current_dash');
export const setCurrentDash = v => kvSet('current_dash', v || {});
