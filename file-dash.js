// لوحة الملف: أول ما يرفع فواز ملف نحلله كامل ونبني داشبورد تلقائياً ويظهر في الشاشة الرئيسية
// - ملفات Excel/CSV: Gemini يصمم «خطة» من تحليل الأعمدة، والأرقام كلها تنحسب بالكود من البيانات (دقة 100٪)
// - ملفات PDF/Word: Gemini يستخرج الأرقام من النص ويبني الداشبورد
import { db } from './db.js';
import { designJSON } from './designer.js';
import { dashboardTools } from './dashboards.js';
import { kvGet, kvSet } from './store.js';
import { datasetsForDoc, runQuery, toECharts, dateStr } from './datasets.js';

const TEXT_PROMPT = (name, text) => `أنت مصمم داشبوردات تنفيذية. هذا محتوى ملف رفعه فواز اسمه «${name}».
صمّم داشبورد احترافي بالعربي من بيانات الملف الحقيقية فقط (ممنوع اختراع أرقام). رجّع JSON فقط:
{"title": "...", "subtitle": "...", "kicker": "تصنيف قصير للوحة",
 "kpis": [{"label": "...", "value": رقم, "unit": "...", "delta": "اختياري"}],
 "charts": [{"title": "...", "span": 1 أو 2, "echarts_option": {كائن ECharts: series + xAxis/yAxis أو pie}}],
 "tables": [{"title": "...", "columns": ["..."], "rows_json": "[[...]]"}],
 "insights": ["..."],
 "headline": "سطر واحد: أهم نتيجة أو أكبر مشكلة برقمها", "headline_flag": true أو false,
 "actions": [{"action": "إجراء يبدأ بفعل", "impact": "الأثر المتوقع", "why": "الدليل من الملف"}]}
3-6 مؤشرات، 2-4 رسوم، 1-2 جدول، 3-4 ملاحظات، 2-4 إجراءات مرتبة من الأكبر أثراً. عنوان كل رسم سؤال إدارة يجاوبه الرسم، وأضف للرسم "insight" (جوابه بجملة ورقم) و"flag" (أسماء الفئات اللي فيها مشكلة فقط، أو بدونه).
كل النصوص عربي. لا دوال JavaScript ولا ألوان.

محتوى الملف:
${text}`;

const PLAN_PROMPT = (name, catalog) => `أنت محلل بيانات خبير. فواز رفع ملف «${name}». هذا تحليل كامل لجداوله (نوع كل عمود، المجاميع، القيم المتكررة) مع عينة صفوف.
صمّم داشبورد تنفيذي احترافي يجاوب أهم الأسئلة اللي يهتم فيها مدير يقرأ هذا الملف (الحجم، التوزيع، الأعلى والأقل، الاتجاه الزمني، المقارنات، المخاطر/المتأخر).
الأرقام راح تنحسب بالكود من البيانات، أنت تحدد «وش ينحسب» فقط. رجّع JSON فقط بهذا الشكل:
{"title": "عنوان واضح", "subtitle": "سطر يذكر الملف ونطاقه", "kicker": "تصنيف قصير مثل: لوحة العقود",
 "kpis": [{"label": "...", "dataset_id": رقم, "measure": "اسم عمود رقمي أو فاضي للعدّ", "agg": "sum|avg|count|min|max|distinct", "unit": "ريال/عقد/٪/...", "filters": [{"column": "...", "op": "=|!=|>|<|contains", "value": "..."}]}],
 "charts": [{"title": "...", "chart_type": "bar|hbar|stacked|line|area|pie|donut", "dataset_id": رقم, "group_by": "عمود", "measure": "عمود رقمي أو فاضي", "agg": "sum|avg|count", "series_by": "اختياري", "top": 10, "date_unit": "month|quarter|year", "span": 1 أو 2}],
 "tables": [{"title": "...", "dataset_id": رقم, "columns": ["أعمدة مهمة"], "sort_by": "عمود", "desc": true, "limit": 50}]}
قواعد خبير التصميم:
- المؤشرات (4-6): ابدأ بالحجم (العدد أو الإجمالي)، ثم القيمة المالية، ثم نسبة/عدد الحالات الحرجة (متأخر، ملغي، منخفض التقييم) بفلتر، ثم متوسطات الأداء. لا تكرر نفس الرقم بصيغتين.
- الرسوم (3-5) كل واحد يجاوب سؤال مختلف: الاتجاه الزمني (line/area لو فيه تاريخ، span 2، date_unit مناسب لمدى البيانات)،
  المقارنة بين الفئات (hbar لو أسماء طويلة أو أكثر من 7 فئات مع top 10، bar لو قليلة)، التركيب/الحصص (donut فقط لو 2-6 فئات)،
  والتقاطع بين بعدين (stacked مع series_by لو فيه بعد ثاني مهم بفئات قليلة).
- لا ترسم بُعد فيه فئة وحدة أو فئتين بس كرسم مستقل؛ خلّه مؤشر. لا تستخدم أعمدة المعرّفات أو الأسماء الفريدة كتقسيم.
- المجاميع للمبالغ والكميات، والمتوسط لأعمدة المدة/التقييم/النسب (المذكورة «يُحسب لها متوسط»).
- جدول واحد يعرض أهم الأعمدة (6-8) مرتب بالأهم (مثل الأعلى قيمة أو الأحدث).
- استخدم أسماء الأعمدة حرفياً كما هي، والعناوين تكون سؤال الإدارة بصيغة قصيرة (مثل: «الرسوم حسب المنطقة»).

${catalog}`;

const INSIGHT_PROMPT = (title, facts) => `أنت محلل بيانات تنفيذي. هذي نتائج محسوبة بدقة من ملف بعنوان «${title}».
رجّع JSON فقط بهذا الشكل:
{"headline": "سطر واحد: أهم نتيجة أو أكبر مشكلة برقمها", "headline_flag": true لو مشكلة,
 "insights": ["3-4 ملاحظات قصيرة: أبرز الأرقام، التركّز، الشواذ، المخاطر"],
 "chart_insights": {"عنوان الرسم كما هو": "جواب سؤال الرسم بجملة ورقم"},
 "flags": {"عنوان الرسم كما هو": ["أسماء الفئات اللي فيها مشكلة واضحة فقط"]},
 "kpi_flags": {"اسم المؤشر كما هو": "bad أو good"},
 "actions": [{"action": "إجراء واضح يبدأ بفعل", "impact": "الأثر المتوقع", "why": "الدليل من الأرقام"}]}
القواعد: استخدم الأرقام كما هي بالضبط ولا تخترع رقم. الأحمر (flags/bad) فقط لما الأرقام تثبت مشكلة (أقل بوضوح من البقية، متأخر، متجاوز).
الإجراءات 2-4 مرتبة من الأكبر أثراً للأقل. لو ما فيه مشكلة واضحة خل flags فاضي.

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
  if (cats[0]) charts.push({ title: `${measures[0] ? (measures[0].avgLike ? 'متوسط ' : '') + measures[0].name : 'العدد'} حسب ${cats.at(-1).name}`, chart_type: 'bar', dataset_id: ds.id, group_by: cats.at(-1).name, measure: measures[0]?.name, agg: measures[0]?.avgLike ? 'avg' : undefined, span: 2 });
  if (cats[0] && cats[0].distinct <= 6) charts.push({ title: `التوزيع حسب ${cats[0].name}`, chart_type: 'donut', dataset_id: ds.id, group_by: cats[0].name, agg: 'count' });
  if (dates[0]) charts.push({ title: `الاتجاه الشهري حسب ${dates[0].name}`, chart_type: 'area', dataset_id: ds.id, group_by: dates[0].name, date_unit: 'month', agg: 'count', span: 2 });
  if (cats[1] && measures[1]) charts.push({ title: `${measures[1].avgLike ? 'متوسط ' : ''}${measures[1].name} حسب ${cats[1].name}`, chart_type: 'hbar', dataset_id: ds.id, group_by: cats[1].name, measure: measures[1].name, agg: measures[1].avgLike ? 'avg' : undefined });
  return { title: `تحليل ${name.replace(/\.[^.]+$/, '')}`, subtitle: `من ملف: ${name}`, kicker: 'لوحة بيانات', kpis, charts, tables: [{ title: `بيانات ${ds.sheet}`, dataset_id: ds.id, limit: 200 }] };
}

// ===== قواعد التصميم (خبرة ثابتة بالكود — تنطبق مهما كان النموذج اللي صمم) =====
// تختار نوع الرسم وحجمه حسب شكل البيانات الفعلي بعد الحساب
function designRule(c, r, ds) {
  const n = r.rows.length, multi = r.series.length > 1 || r.series[0] !== '_';
  if (n < 2) return null;                                     // فئة وحدة ما تستاهل رسم
  let type = c.chart_type || 'bar';
  const col = ds.profile.columns.find(x => x.name === c.group_by);
  const isTime = col?.type === 'date';
  const longLabels = r.rows.reduce((a, x) => a + String(x.key).length, 0) / n > 12;
  if (isTime && n >= 3 && !['line', 'area', 'stacked'].includes(type)) type = multi ? 'line' : 'area';
  if ((type === 'pie' || type === 'donut') && (n > 6 || multi)) type = 'hbar';
  if (type === 'bar' && !multi && (n > 8 || longLabels)) type = 'hbar';
  let span = c.span === 2 ? 2 : 1, size;
  if (isTime) span = 2;
  if (n <= 3 && !multi) { span = 1; size = 's'; }            // رسم صغير بدل أعمدة عملاقة
  if (type === 'hbar' && n > 8) size = 'l';
  return { type, span, size, time: isTime };
}
// للرسوم الجاهزة (ملفات PDF/Word): نفس الفلسفة على مواصفة ECharts
function lintOption(c) {
  let o; try { o = typeof c.echarts_option === 'string' ? JSON.parse(c.echarts_option) : c.echarts_option; } catch { return null; }
  if (!o || !o.series) return null;
  const series = [].concat(o.series), first = series[0] || {};
  const cats = [].concat(o.xAxis || [], o.yAxis || []).find(a => a && Array.isArray(a.data))?.data || first.data || [];
  const n = cats.length;
  if (n < 2 && first.type !== 'gauge') return null;
  let span = c.span === 2 ? 2 : 1, size;
  if (n <= 3 && series.length === 1 && first.type === 'bar') { span = 1; size = 's'; }
  return { title: c.title, span, size, echarts_option: JSON.stringify(o) };
}
// نربط ملاحظات المحلل بالرسوم والمؤشرات — والأحمر بس لفئات موجودة فعلاً في الرسم (ما نقبل أسماء مخترعة)
export function enrich(ins, kpis, charts) {
  const norm = t => String(t ?? '').replace(/\s+/g, ' ').trim();
  const lookup = (map, key) => { if (!map || typeof map !== 'object') return undefined; const k = Object.keys(map).find(m => norm(m) === norm(key)); return k ? map[k] : undefined; };
  return {
    kpis: kpis.map(k => { const f = lookup(ins?.kpi_flags, k.label); return ['bad', 'good'].includes(f) ? { ...k, flag: f } : k; }),
    charts: charts.map(c => {
      const want = lookup(ins?.flags, c.title), cats = new Set((c.cats || []).map(norm));
      const flag = Array.isArray(want) ? want.map(norm).filter(v => cats.has(v)) : [];
      const insight = lookup(ins?.chart_insights, c.title);
      const { cats: _, ...rest } = c;
      return { ...rest, ...(flag.length ? { flag } : {}), ...(typeof insight === 'string' && insight.trim() ? { insight } : {}) };
    }),
  };
}
// ترتيب اللوحة: الاتجاه الزمني والرسم العريض أول، والصغيرة جنب بعض
function arrange(charts) {
  return [...charts].sort((a, b) => (b.t ? 1 : 0) - (a.t ? 1 : 0) || (b.span || 1) - (a.span || 1) || (a.size === 's') - (b.size === 's'));
}

async function dashboardFromData(d, sets) {
  const byId = Object.fromEntries(sets.map(s => [s.id, s]));
  const pick = id => byId[id] || sets[0];
  let { out: plan, by } = await designJSON(PLAN_PROMPT(d.name, catalogFor(sets)));
  if (!plan?.charts?.length) { plan = autoPlan(sets, d.name); by = 'قواعد'; }
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

  const charts = [], seen = new Set();
  for (const c of (plan.charts || []).slice(0, 6)) {
    try {
      const ds = pick(c.dataset_id);
      const key = [ds.id, c.group_by, c.measure, c.agg, c.series_by].join('|');
      if (seen.has(key)) continue; seen.add(key);
      const r = runQuery(ds, { group_by: c.group_by, measure: c.measure || undefined, agg: c.agg || (c.measure ? 'sum' : 'count'), series_by: c.series_by || undefined, top: c.top || 12, date_unit: c.date_unit, filters: c.filters });
      const d2 = designRule(c, r, ds);
      if (!d2) continue;
      charts.push({ title: c.title, span: d2.span, size: d2.size, t: d2.time, cats: r.rows.map(x => String(x.key)), echarts_option: JSON.stringify(toECharts(r, d2.type)) });
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

  const { out: ins } = await designJSON(INSIGHT_PROMPT(plan.title, facts.join('\n')));
  const x = enrich(ins, kpis, charts);
  return dashboardTools.build_dashboard.run({ title: plan.title, subtitle: plan.subtitle || `من ملف: ${d.name}`, kicker: plan.kicker, designed_by: by, kpis: x.kpis, charts: arrange(x.charts), tables, insights: ins?.insights || [], headline: ins?.headline, headline_flag: ins?.headline_flag, actions: ins?.actions || [] })
    .then(r => ({ ...r, title: plan.title, mode: 'data' }));
}

async function dashboardFromText(d) {
  const { out, by } = await designJSON(TEXT_PROMPT(d.name, d.content.slice(0, 60000)));
  if (!out || !out.title) return { error: 'ما قدرت أولّد الداشبورد من الملف' };
  const args = {
    ...out, designed_by: by,
    charts: arrange((out.charts || []).map(c => { const l = lintOption(c); return l && { ...l, ...(c.insight ? { insight: c.insight } : {}), ...(Array.isArray(c.flag) && c.flag.length ? { flag: c.flag } : {}) }; }).filter(Boolean)),
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
