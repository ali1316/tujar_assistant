// لوحة الملف: أول ما يرفع فواز ملف نحلله كامل ونبني داشبورد تلقائياً ويظهر في الشاشة الرئيسية
// - ملفات Excel/CSV: Gemini يصمم «خطة» من تحليل الأعمدة، والأرقام كلها تنحسب بالكود من البيانات (دقة 100٪)
// - ملفات PDF/Word: Gemini يستخرج الأرقام من النص ويبني الداشبورد
import { db } from './db.js';
import { generate } from './history.js';
import { dashboardTools } from './dashboards.js';
import { kvGet, kvSet } from './store.js';
import { datasetsForDoc, runQuery, toECharts, dateStr } from './datasets.js';

const TEXT_PROMPT = (name, text) => `أنت مصمم داشبوردات تنفيذية. هذا محتوى ملف رفعه فواز اسمه «${name}».
صمّم داشبورد احترافي بالعربي من بيانات الملف الحقيقية فقط (ممنوع اختراع أرقام). رجّع JSON فقط:
{"title": "...", "subtitle": "...", "kicker": "تصنيف قصير للوحة",
 "kpis": [{"label": "...", "value": رقم, "unit": "...", "delta": "اختياري"}],
 "charts": [{"title": "...", "span": 1 أو 2, "echarts_option": {كائن ECharts: series + xAxis/yAxis أو pie}}],
 "tables": [{"title": "...", "columns": ["..."], "rows_json": "[[...]]"}],
 "insights": ["..."]}
3-6 مؤشرات، 2-4 رسوم، 1-2 جدول، 3-4 ملاحظات. كل النصوص عربي. لا دوال JavaScript ولا ألوان.

محتوى الملف:
${text}`;

const PLAN_PROMPT = (name, catalog) => `أنت محلل بيانات خبير. فواز رفع ملف «${name}». هذا تحليل كامل لجداوله (نوع كل عمود، المجاميع، القيم المتكررة) مع عينة صفوف.
صمّم داشبورد تنفيذي احترافي يجاوب أهم الأسئلة اللي يهتم فيها مدير يقرأ هذا الملف (الحجم، التوزيع، الأعلى والأقل، الاتجاه الزمني، المقارنات، المخاطر/المتأخر).
الأرقام راح تنحسب بالكود من البيانات، أنت تحدد «وش ينحسب» فقط. رجّع JSON فقط بهذا الشكل:
{"title": "عنوان واضح", "subtitle": "سطر يذكر الملف ونطاقه", "kicker": "تصنيف قصير مثل: لوحة العقود",
 "kpis": [{"label": "...", "dataset_id": رقم, "measure": "اسم عمود رقمي أو فاضي للعدّ", "agg": "sum|avg|count|min|max|distinct", "unit": "ريال/عقد/٪/...", "filters": [{"column": "...", "op": "=|!=|>|<|contains", "value": "..."}]}],
 "charts": [{"title": "...", "chart_type": "bar|hbar|stacked|line|area|pie|donut", "dataset_id": رقم, "group_by": "عمود", "measure": "عمود رقمي أو فاضي", "agg": "sum|avg|count", "series_by": "اختياري", "top": 10, "date_unit": "month|quarter|year", "span": 1 أو 2}],
 "tables": [{"title": "...", "dataset_id": رقم, "columns": ["أعمدة مهمة"], "sort_by": "عمود", "desc": true, "limit": 50}]}
قواعد: 4-6 مؤشرات، 3-5 رسوم متنوعة (لا تكرر نفس التقسيم)، 1-2 جدول. استخدم أسماء الأعمدة حرفياً كما هي. لا تستخدم أعمدة المعرّفات كمقاييس.
pie/donut فقط لما الفئات 6 أو أقل. التاريخ → line/area. أعطِ الرسم الأهم span 2.

${catalog}`;

const INSIGHT_PROMPT = (title, facts) => `أنت محلل بيانات. هذي نتائج محسوبة بدقة من ملف بعنوان «${title}».
اكتب 3-4 ملاحظات تنفيذية قصيرة بالعربي (كل وحدة جملة أو جملتين): أبرز الأرقام، التركّز، الشواذ، المخاطر، وتوصية عملية.
استخدم الأرقام كما هي بالضبط. رجّع JSON: {"insights": ["..."]}

${facts}`;

const fmt = n => typeof n === 'number' ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n) : n;

function catalogFor(sets) {
  return sets.map(ds => {
    const p = ds.profile;
    const cols = p.columns.map(c => c.type === 'number'
      ? `  - «${c.name}»: رقم${c.role === 'id' ? ' (معرّف، لا تجمعه)' : c.avgLike ? ' (يُحسب له متوسط مو مجموع)' : ''}، مجموع ${fmt(c.sum)}، متوسط ${fmt(c.avg)}، من ${fmt(c.min)} إلى ${fmt(c.max)}`
      : c.type === 'date' ? `  - «${c.name}»: تاريخ من ${c.min} إلى ${c.max}`
      : `  - «${c.name}»: نص، ${c.distinct} قيمة مختلفة${c.top?.length ? ` (الأكثر: ${c.top.slice(0, 5).map(t => `${t.value}×${t.count}`).join('، ')})` : ''}`).join('\n');
    const sample = ds.rows.slice(0, 12).map(r => r.map(v => String(dateStr(v) ?? '')).join(' | ')).join('\n');
    return `### جدول dataset_id=${ds.id} — ورقة «${ds.sheet}» (${p.rows} صف)\nالأعمدة:\n${cols}\nعينة (${ds.columns.join(' | ')}):\n${sample}`;
  }).join('\n\n');
}

// خطة احتياطية بدون ذكاء اصطناعي (لو تعذّر)
function autoPlan(sets, name) {
  const ds = sets[0], cols = ds.profile.columns;
  const measures = cols.filter(c => c.type === 'number' && c.role === 'measure');
  const cats = cols.filter(c => c.role === 'category').sort((a, b) => a.distinct - b.distinct);
  const dates = cols.filter(c => c.type === 'date');
  const kpis = [{ label: 'عدد السجلات', dataset_id: ds.id, agg: 'count', unit: 'سجل' }, ...measures.slice(0, 5).map(m => ({ label: `${m.avgLike ? 'متوسط' : 'إجمالي'} ${m.name}`, dataset_id: ds.id, measure: m.name, agg: m.avgLike ? 'avg' : 'sum' }))];
  const charts = [];
  if (cats[0]) charts.push({ title: `${measures[0] ? measures[0].name : 'العدد'} حسب ${cats.at(-1).name}`, chart_type: 'bar', dataset_id: ds.id, group_by: cats.at(-1).name, measure: measures[0]?.name, span: 2 });
  if (cats[0] && cats[0].distinct <= 6) charts.push({ title: `التوزيع حسب ${cats[0].name}`, chart_type: 'donut', dataset_id: ds.id, group_by: cats[0].name, agg: 'count' });
  if (dates[0]) charts.push({ title: `الاتجاه عبر ${dates[0].name}`, chart_type: 'line', dataset_id: ds.id, group_by: dates[0].name, measure: measures[0]?.name, span: 2 });
  if (cats[1] && measures[1]) charts.push({ title: `${measures[1].name} حسب ${cats[1].name}`, chart_type: 'hbar', dataset_id: ds.id, group_by: cats[1].name, measure: measures[1].name });
  return { title: `تحليل ${name.replace(/\.[^.]+$/, '')}`, subtitle: `من ملف: ${name}`, kicker: 'لوحة بيانات', kpis, charts, tables: [{ title: `بيانات ${ds.sheet}`, dataset_id: ds.id, limit: 200 }] };
}

async function dashboardFromData(d, sets) {
  const byId = Object.fromEntries(sets.map(s => [s.id, s]));
  const pick = id => byId[id] || sets[0];
  let plan = await generate(PLAN_PROMPT(d.name, catalogFor(sets)));
  if (!plan?.charts?.length) plan = autoPlan(sets, d.name);
  const facts = [];

  const kpis = [];
  for (const k of (plan.kpis || []).slice(0, 6)) {
    try {
      const r = runQuery(pick(k.dataset_id), { measure: k.measure || undefined, agg: k.agg || (k.measure ? 'sum' : 'count'), filters: k.filters });
      const v = r.rows[0]?.total ?? 0;
      kpis.push({ label: k.label, value: +(+v).toFixed(k.agg === 'avg' ? 1 : 2), unit: k.unit || '' });
      facts.push(`- ${k.label}: ${fmt(v)} ${k.unit || ''}`);
    } catch (e) { console.warn('[file-dash] kpi skipped:', e.message); }
  }

  const charts = [];
  for (const c of (plan.charts || []).slice(0, 6)) {
    try {
      const r = runQuery(pick(c.dataset_id), { group_by: c.group_by, measure: c.measure || undefined, agg: c.agg || (c.measure ? 'sum' : 'count'), series_by: c.series_by || undefined, top: c.top, date_unit: c.date_unit, filters: c.filters });
      if (!r.rows.length) continue;
      charts.push({ title: c.title, span: c.span === 2 ? 2 : 1, echarts_option: JSON.stringify(toECharts(r, c.chart_type)) });
      facts.push(`- ${c.title}: ${r.rows.slice(0, 8).map(x => `${x.key}=${fmt(x.total)}`).join('، ')}${r.rows.length > 8 ? '…' : ''}`);
    } catch (e) { console.warn('[file-dash] chart skipped:', e.message); }
  }

  const tables = [];
  for (const t of (plan.tables || []).slice(0, 2)) {
    const ds = pick(t.dataset_id);
    let idx = (t.columns || []).map(n => ds.columns.indexOf(n)).filter(i => i >= 0);
    if (!idx.length) idx = ds.columns.map((_, i) => i).slice(0, 8);
    let rows = ds.rows.map(r => idx.map(i => dateStr(r[i])));
    const si = idx.indexOf(ds.columns.indexOf(t.sort_by));
    if (si >= 0) rows.sort((a, b) => { const x = a[si], y = b[si]; const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), 'ar'); return t.desc === false ? c : -c; });
    tables.push({ title: t.title || ds.sheet, columns: idx.map(i => ds.columns[i]), rows_json: JSON.stringify(rows.slice(0, Math.min(t.limit || 200, 500))) });
  }

  const ins = await generate(INSIGHT_PROMPT(plan.title, facts.join('\n')));
  return dashboardTools.build_dashboard.run({ title: plan.title, subtitle: plan.subtitle || `من ملف: ${d.name}`, kicker: plan.kicker, kpis, charts, tables, insights: ins?.insights || [] })
    .then(r => ({ ...r, title: plan.title, mode: 'data' }));
}

async function dashboardFromText(d) {
  const out = await generate(TEXT_PROMPT(d.name, d.content.slice(0, 60000)));
  if (!out || !out.title) return { error: 'ما قدرت أولّد الداشبورد من الملف' };
  const args = {
    ...out,
    charts: (out.charts || []).map(c => ({ ...c, echarts_option: typeof c.echarts_option === 'string' ? c.echarts_option : JSON.stringify(c.echarts_option || {}) })),
    tables: (out.tables || []).map(t => ({ ...t, rows_json: typeof t.rows_json === 'string' ? t.rows_json : JSON.stringify(t.rows_json || t.rows || []) })),
  };
  return dashboardTools.build_dashboard.run(args).then(r => ({ ...r, title: out.title, mode: 'text' }));
}

export async function dashboardFromDocument(docId) {
  const d = db.prepare('SELECT id, name, content FROM documents WHERE id=?').get(docId);
  if (!d) return { error: 'الملف غير موجود' };
  const sets = await datasetsForDoc(d.id).catch(() => []);
  const r = sets.length ? await dashboardFromData(d, sets) : await dashboardFromText(d);
  if (r.ok) await setCurrentDash({ id: r.id, title: r.title, doc_id: d.id, doc_name: d.name });
  console.log(`[file-dash] doc #${d.id} (${r.mode || '-'}) → ${r.ok ? `dashboard #${r.id}` : r.error}`);
  return { ...r, doc_id: d.id, doc_name: d.name, datasets: sets.map(s => ({ id: s.id, sheet: s.sheet, rows: s.profile.rows })) };
}

// الداشبورد المعروض حالياً داخل الشاشة الرئيسية
export const getCurrentDash = () => kvGet('current_dash');
export const setCurrentDash = v => kvSet('current_dash', v || {});
