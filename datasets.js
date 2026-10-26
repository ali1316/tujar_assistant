// محرك البيانات: يحوّل ملفات Excel/CSV لجداول منظّمة، يحلل كل عمود، ويجاوب أي استعلام أو شارت فوراً بأرقام محسوبة (مو تقديرات)
import * as XLSX from 'xlsx';
import path from 'node:path';
import { datasetAdd, datasetGet, datasetsForDoc, datasetsLatest, datasetsRecent } from './store.js';
import { qualityNote } from './knowledge.js';

const MAX_ROWS = 20000;
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

// ===== 1) قراءة الملف وتنظيف القيم =====
const toNum = v => {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (v == null) return null;
  let s = String(v).trim().replace(/[٠-٩]/g, d => AR_DIGITS.indexOf(d)).replace(/[٬,\s]/g, '').replace('٫', '.');
  s = s.replace(/(ريال|ر\.س|sar|%|٪)$/i, '').replace(/^(ريال|ر\.س|sar)/i, '');
  if (!/^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(s)) return null;
  return +s;
};
const toDate = v => {
  if (v instanceof Date && !isNaN(v)) return new Date(v.getTime() + 12 * 3600e3).toISOString().slice(0, 10); // تقريب لأقرب يوم (فروقات المنطقة الزمنية في Excel)
  const s = String(v ?? '').trim();
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(s)) { const d = new Date(s); return isNaN(d) ? null : d.toISOString().slice(0, 10); }
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(s)) { const [a, b, c] = s.split(/[/-]/).map(Number); const d = new Date(Date.UTC(c, b - 1, a)); return isNaN(d) ? null : d.toISOString().slice(0, 10); }
  return null;
};

export const dateStr = v => v instanceof Date ? toDate(v) : v;
export function isTabular(name) { return ['.xlsx', '.xls', '.csv'].includes(path.extname(name).toLowerCase()); }

// صف إجمالي/متوسط: أول خلية نصية في الصف (بعد عمود التسلسل) — بتطبيع الهمزة
const norm = t => String(t ?? '').trim().replace(/[أإآ]/g, 'ا').replace(/ـ/g, '');
const SUMMARY_RE = /^(ال)?(اجمالي|مجموع|كلي|total|sum|grand total)(?![\p{L}\p{N}])|^(ال)?متوسط(\s+(العام|الكلي))?$|^average$/iu;
export const isSummaryRow = r => { const c = r.find(v => typeof v === 'string' && v.trim() && !/^\d+$/.test(v.trim())); return c != null && SUMMARY_RE.test(norm(c)); };
const NA_RE = /^(—|–|-|\.\.|\.\.\.|n\/?a|غير منطبق|لا ينطبق|غير متاح|لا يوجد)$/i;
export const isNA = v => NA_RE.test(String(v ?? '').trim());
const isNoteRow = r => { const f = r.filter(v => v != null && String(v).trim() !== ''); return f.length === 1 && typeof f[0] === 'string' && (/^[*•※]|^(المصدر|مصدر|ملاحظة|ملاحظات|source|note)/i.test(f[0].trim()) || f[0].trim().length > 40); };

export function parseWorkbook(buffer, name) {
  // CSV: نقرأه UTF-8 صريح (وإلا العربي يطلع رموز غريبة)
  const wb = path.extname(name || '').toLowerCase() === '.csv'
    ? XLSX.read(Buffer.from(buffer).toString('utf8').replace(/^\uFEFF/, ''), { type: 'string', cellDates: true, raw: false })
    : XLSX.read(buffer, { type: 'buffer', cellDates: true, cellNF: true, raw: false });
  const out = [];
  for (const sheet of wb.SheetNames) {
    if (/^(اقرأني|اقرءني|readme|read me|about|تعليمات)$/i.test(sheet.trim())) continue; // ورقة شرح، مو بيانات
    // خلايا Excel المنسقة كنسبة تنحفظ كسور (0.25): نرجعها كما تظهر (25) عشان تتطابق مع CSV «25%»
    const ws = wb.Sheets[sheet];
    for (const a in ws) { const c = ws[a]; if (a[0] !== '!' && c && c.t === 'n' && /%/.test(c.z || '')) c.v = +(c.v * 100).toFixed(10); }
    const grid = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, raw: true, defval: null, blankrows: false });
    if (!grid.length) continue;
    // صف العناوين = أول صف أغلبه نص
    let h = grid.findIndex(r => r.filter(c => c != null && String(c).trim() !== '').length >= Math.max(2, Math.ceil(r.length * 0.5)));
    if (h < 0) h = 0;
    const header = grid[h].map((c, i) => String(c ?? '').trim() || `عمود ${i + 1}`);
    const seen = {}; const columns = header.map(c => (seen[c] = (seen[c] || 0) + 1) > 1 ? `${c} ${seen[c]}` : c);
    let rows = grid.slice(h + 1).filter(r => r.some(c => c != null && String(c).trim() !== ''))
      .map(r => columns.map((_, i) => r[i] instanceof Date ? toDate(r[i]) : (r[i] ?? null)));
    // نتجاهل صفوف «الإجمالي» عشان ما تتكرر الأرقام
    rows = rows.filter(r => !isSummaryRow(r));
    // سطور الملاحظات/المصدر تحت الجدول (خلية نصية وحدة) مو بيانات
    while (columns.length >= 2 && rows.length && isNoteRow(rows.at(-1))) rows.pop();
    if (!rows.length) continue;
    out.push({ sheet, columns, rows: rows.slice(0, MAX_ROWS) });
  }
  return out;
}

// ===== 2) تحليل الأعمدة (Profiling) =====
export function profile(columns, rows) {
  const cols = columns.map((name, i) => {
    const vals = rows.map(r => r[i]).filter(v => v != null && String(v).trim() !== '' && !isNA(v)); // «—/غير منطبق» = مفقود، مو نص
    const nums = vals.map(toNum).filter(v => v != null);
    const dates = vals.map(toDate).filter(Boolean);
    const type = vals.length && nums.length / vals.length >= 0.85 ? 'number' : vals.length && dates.length / vals.length >= 0.85 ? 'date' : 'text';
    const p = { name, type, filled: vals.length, empty: rows.length - vals.length };
    if (type === 'number') {
      const s = nums.reduce((a, b) => a + b, 0);
      Object.assign(p, { sum: +s.toFixed(2), avg: +(s / nums.length).toFixed(2), min: Math.min(...nums), max: Math.max(...nums), distinct: new Set(nums).size });
      p.avgLike = /مدة|تقييم|نسبة|معدل|متوسط|عمر|درجة|%|٪|rate|score|avg/i.test(name) || p.max <= 10;
      p.role = /رقم|كود|code|id|^#|تسلسل|هاتف|جوال|سجل/i.test(name) || (p.distinct === nums.length && Number.isInteger(p.min) && p.max - p.min + 1 === nums.length) ? 'id' : 'measure';
    } else if (type === 'date') {
      const sorted = [...dates].sort(); Object.assign(p, { min: sorted[0], max: sorted.at(-1), role: 'time' });
    } else {
      const counts = {}; vals.forEach(v => { const k = String(v).trim(); counts[k] = (counts[k] || 0) + 1; });
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      Object.assign(p, { distinct: top.length, top: top.slice(0, 8).map(([value, count]) => ({ value, count })) });
      p.role = top.length <= Math.max(12, rows.length * 0.5) ? 'category' : 'label';
    }
    return p;
  });
  return { rows: rows.length, columns: cols };
}

export async function ingestDocument(doc, buffer) {
  if (!isTabular(doc.name)) return [];
  const sheets = parseWorkbook(buffer, doc.name);
  const ids = [];
  const stats = { sheets: 0, rows: 0, columns: 0, measures: 0 };
  for (const s of sheets) {
    const pr = profile(s.columns, s.rows);
    ids.push(await datasetAdd({ doc_id: doc.id, doc_name: doc.name, sheet: s.sheet, columns: s.columns, rows: s.rows, profile: pr }));
    stats.sheets++; stats.rows += s.rows.length; stats.columns += s.columns.length;
    stats.measures += (pr.columns || []).filter(c => c.role === 'measure').length;
  }
  ids.stats = stats; // أرقام حقيقية لرحلة الرفع في الواجهة
  return ids;
}

// ===== 3) محرك الاستعلام =====
const colIdx = (ds, name) => {
  if (name == null || name === '') return -1;
  let i = ds.columns.indexOf(name);
  if (i < 0) {
    // مطابقة متسامحة: _ بدل المسافة، وحدات بين قوسين، همزات/تاء مربوطة، «ال» التعريف
    const nz = x => String(x).toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[_\-]+/g, ' ').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[\u064B-\u0652\u0640]/g, '').replace(/\s+/g, ' ').trim();
    const strip = x => nz(x).split(' ').map(w => w.length > 4 && w.startsWith('ال') ? w.slice(2) : w).join(' ');
    const n = nz(name), ns = strip(name);
    i = ds.columns.findIndex(c => nz(c) === n);
    if (i < 0) i = ds.columns.findIndex(c => strip(c) === ns);
    if (i < 0) i = ds.columns.findIndex(c => nz(c).includes(n) || n.includes(nz(c)) || strip(c).includes(ns));
    if (i < 0) { const ws = ns.split(' ').filter(w => w.length > 1); i = ds.columns.findIndex(c => { const cw = strip(c) + ' ' + nz(c); return ws.length && ws.every(w => cw.includes(w)); }); }
  }
  return i;
};
const cellNum = (r, i) => toNum(r[i]);
function applyFilters(ds, rows, filters = []) {
  return rows.filter(r => filters.every(f => {
    const i = colIdx(ds, f.column); if (i < 0) return true;
    const v = r[i], n = toNum(v), fv = f.value, fn = toNum(fv), s = String(v ?? '').trim();
    switch (f.op || '=') {
      case '=': return fn != null && n != null ? n === fn : s === String(fv).trim();
      case '!=': return s !== String(fv).trim();
      case '>': return n != null && n > fn; case '<': return n != null && n < fn;
      case '>=': return n != null && n >= fn; case '<=': return n != null && n <= fn;
      case 'contains': return s.includes(String(fv));
      case 'in': return [].concat(fv).map(String).includes(s);
      default: return true;
    }
  }));
}
const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const dateLabel = (k, unit) => unit === 'month' ? `${AR_MONTHS[+k.slice(5, 7) - 1]} ${k.slice(0, 4)}` : unit === 'quarter' ? `${k.slice(-2).replace('Q', 'الربع ')} ${k.slice(0, 4)}` : k;
const bucket = (d, unit) => !d ? null : unit === 'year' ? d.slice(0, 4) : unit === 'quarter' ? `${d.slice(0, 4)} Q${Math.ceil(+d.slice(5, 7) / 3)}` : unit === 'day' ? d : d.slice(0, 7);
function agg(values, fn) {
  const v = values.filter(x => x != null);
  switch (fn) {
    case 'count': return values.length;
    case 'avg': return v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2) : 0;
    case 'min': return v.length ? Math.min(...v) : 0;
    case 'max': return v.length ? Math.max(...v) : 0;
    case 'distinct': return new Set(values).size;
    default: return +v.reduce((a, b) => a + b, 0).toFixed(2);
  }
}

// group_by + measure(+agg) + series_by اختياري → صفوف مجمّعة
export function runQuery(ds, { group_by, measure, agg: fn = measure ? 'sum' : 'count', series_by, filters, sort = 'desc', top, date_unit } = {}) {
  let rows = applyFilters(ds, ds.rows, filters);
  const gi = colIdx(ds, group_by); let mi = colIdx(ds, measure); const si = colIdx(ds, series_by); 
  if (measure && mi < 0) throw new Error(`ما لقيت العمود «${measure}». الأعمدة: ${ds.columns.join('، ')}`);
  // عمود نصي ما ينجمع (يطلع أصفار) → نعدّ الصفوف بدله
  if (mi >= 0 && ['sum', 'avg', 'min', 'max'].includes(fn) && ds.profile?.columns[mi]?.type !== 'number') { mi = -1; fn = 'count'; }
  if (group_by && gi < 0) throw new Error(`ما لقيت العمود «${group_by}». الأعمدة: ${ds.columns.join('، ')}`);
  const isDate = gi >= 0 && ds.profile?.columns[gi]?.type === 'date';
  const key = r => gi < 0 ? 'الإجمالي' : isDate ? bucket(toDate(r[gi]), date_unit || 'month') : String(r[gi] ?? 'غير محدد').trim() || 'غير محدد';
  const val = r => mi < 0 ? 1 : cellNum(r, mi);
  const groups = new Map();
  for (const r of rows) {
    const k = key(r); if (k == null) continue;
    const s = si >= 0 ? String(r[si] ?? 'غير محدد').trim() : '_';
    if (!groups.has(k)) groups.set(k, new Map());
    const g = groups.get(k); if (!g.has(s)) g.set(s, []); g.get(s).push(val(r));
  }
  const seriesNames = si >= 0 ? [...new Set(rows.map(r => String(r[si] ?? 'غير محدد').trim()))] : ['_'];
  let out = [...groups].map(([k, g]) => ({ key: k, values: Object.fromEntries(seriesNames.map(s => [s, agg(g.get(s) || [], fn)])) }));
  out.forEach(o => { o.total = Object.values(o.values).reduce((a, b) => a + b, 0); });
  if (isDate) out.sort((a, b) => String(a.key).localeCompare(String(b.key)));
  else if (sort === 'asc') out.sort((a, b) => a.total - b.total);
  else if (sort === 'name') out.sort((a, b) => String(a.key).localeCompare(String(b.key), 'ar'));
  else out.sort((a, b) => b.total - a.total);
  if (isDate) { const oneYear = new Set(out.map(o => String(o.key).slice(0, 4))).size === 1; out.forEach(o => { o.key = oneYear && (date_unit || 'month') === 'month' ? AR_MONTHS[+String(o.key).slice(5, 7) - 1] : dateLabel(o.key, date_unit || 'month'); }); } // سنة وحدة: الشهر بدون السنة (أقصر وأوضح)
  const limit = top || (isDate ? 60 : 15);
  if (!isDate && out.length > limit) {
    const rest = out.slice(limit - 1); out = out.slice(0, limit - 1);
    if (fn === 'sum' || fn === 'count') out.push({ key: 'أخرى', values: Object.fromEntries(seriesNames.map(s => [s, +rest.reduce((a, o) => a + (o.values[s] || 0), 0).toFixed(2)])), total: rest.reduce((a, o) => a + o.total, 0) });
  }
  return { rows: out, series: seriesNames, matched_rows: rows.length, measure: mi >= 0 ? ds.columns[mi] : 'العدد', agg: fn, group_by: gi >= 0 ? ds.columns[gi] : null };
}

// ===== 4) تحويل النتيجة لرسم =====
const AGG_AR = { sum: 'مجموع', avg: 'متوسط', count: 'عدد', min: 'أقل', max: 'أعلى', distinct: 'عدد مميز' };
// «مجموع عدد الأعمال» ركيكة: لو العمود نفسه عدد نكتب «إجمالي عدد…»
const aggLabel = (agg, measure) => (agg === 'sum' && /^(عدد|إجمالي|مجموع)\s/.test(measure || '') ? `إجمالي ${String(measure).replace(/^(إجمالي|مجموع)\s+/, '')}` : `${AGG_AR[agg] || ''} ${measure || ''}`).trim();
// أسماء المصادر للعرض: بدون شرطات طويلة، وبدون تكرار اسم الملف والورقة لو نفس الشي
const srcLabel = (doc, sheet) => { const c = x => String(x || '').replace(/\s+—\s+/g, '، ').trim(); const d = c(doc), sh = c(sheet); return d && sh && (d === sh || d.startsWith(sh) || sh.startsWith(d)) ? `«${d.length >= sh.length ? d : sh}»` : [d && `«${d}»`, sh].filter(Boolean).join(' · '); };
export function toECharts(res, type = 'bar') {
  const cats = res.rows.map(r => r.key);
  const multi = res.series.length > 1 || res.series[0] !== '_';
  const names = multi ? res.series : [res.measure];
  if (type === 'pie' || type === 'donut') {
    return { legend: { bottom: 0, type: 'scroll' }, series: [{ type: 'pie', radius: type === 'donut' ? ['40%', '62%'] : '60%', center: ['50%', '45%'], minAngle: 3, data: res.rows.map(r => ({ name: r.key, value: r.total })), label: { formatter: '{b}\n{d}%', overflow: 'none' }, labelLine: { length: 10, length2: 8 } }] };
  }
  const horizontal = type === 'hbar';
  const series = names.map((n, i) => ({ name: n, type: type === 'line' || type === 'area' ? 'line' : 'bar', smooth: type === 'area',
    areaStyle: type === 'area' ? { opacity: .25 } : undefined, stack: type === 'stacked' ? 'all' : undefined,
    data: res.rows.map(r => multi ? r.values[res.series[i]] : r.total) }));
  const cat = { type: 'category', data: cats }, val = { type: 'value' };
  return { legend: multi ? { data: names } : undefined, xAxis: horizontal ? val : cat, yAxis: horizontal ? { ...cat, inverse: true } : val, series };
}
export function toVegaLite(res, type = 'bar') {
  const multi = res.series.length > 1 || res.series[0] !== '_';
  const values = res.rows.flatMap(r => multi ? res.series.map(s => ({ k: r.key, s, v: r.values[s] })) : [{ k: r.key, v: r.total }]);
  const order = res.rows.map(r => r.key);
  // الدائري: الرقم مكتوب جنب كل شريحة (لغة الأرقام ظاهرة دايماً)
  if (type === 'pie' || type === 'donut') return { data: { values }, encoding: { theta: { field: 'v', type: 'quantitative', stack: true, title: res.measure }, color: { field: 'k', type: 'nominal', title: res.group_by, sort: order }, order: { field: 'v', sort: 'descending' } },
    layer: [{ mark: { type: 'arc', innerRadius: type === 'donut' ? 60 : 0, outerRadius: 120 } }, { mark: { type: 'text', radius: 145, fontWeight: 700, fontSize: 13 }, encoding: { text: { field: 'v', type: 'quantitative', format: res.agg === 'avg' ? ',.1f' : ',.2~f' }, color: { value: '#eef2f7' } } }] };
  const mark = type === 'line' || type === 'area' ? { type: type === 'area' ? 'area' : 'line', point: true, opacity: type === 'area' ? .5 : 1 } : { type: 'bar' };
  const hz = type === 'hbar';
  // أسماء الفئات أفقية لما تكفي المساحة (أسهل قراءة من المائلة/العمودية)
  const longest = Math.max(0, ...order.map(x => String(x).length));
  const k = { field: 'k', type: 'nominal', title: res.group_by, sort: order, axis: { labelAngle: hz ? 0 : (order.length <= 8 && longest <= 16 ? 0 : -35), labelLimit: 150, labelPadding: 6, labelFontSize: 12 } }, v = { field: 'v', type: 'quantitative', title: res.agg === 'count' ? 'العدد' : aggLabel(res.agg, res.measure) };
  // قيم صحيحة (أعداد) = تدريج صحيح بدون 0.5
  if (values.every(x => Number.isInteger(+x.v))) v.axis = { format: 'd', tickMinStep: 1 };
  if (hz) k.axis.labelLimit = 240;
  const enc = hz ? { y: k, x: v } : { x: k, y: v };
  if (multi) { enc.color = { field: 's', type: 'nominal', title: '' }; if (type !== 'stacked' && mark.type === 'bar') enc[hz ? 'yOffset' : 'xOffset'] = { field: 's' }; }
  enc.tooltip = [{ field: 'k', title: res.group_by || '' }, ...(multi ? [{ field: 's', title: '' }] : []), { field: 'v', title: res.measure, format: ',' }];
  // الأرقام مكتوبة على الشارت نفسه (لغة الأرقام دايماً ظاهرة)
  const fmt = res.agg === 'avg' ? ',.1f' : ',.2~f';
  if (!multi) {
    const lbl = hz ? { type: 'text', align: 'left', baseline: 'middle', dx: 6, fontWeight: 700 } : { type: 'text', align: 'center', baseline: 'bottom', dy: -6, fontWeight: 700 };
    return { data: { values }, layer: [{ mark, encoding: enc }, { mark: lbl, encoding: { ...(hz ? { y: k, x: v } : { x: k, y: v }), text: { field: 'v', type: 'quantitative', format: fmt } } }] };
  }
  if (type === 'stacked') {
    const totals = res.rows.map(r => ({ k: r.key, t: r.total }));
    return { layer: [{ data: { values }, mark, encoding: enc }, { data: { values: totals }, mark: hz ? { type: 'text', align: 'left', dx: 6, fontWeight: 700 } : { type: 'text', baseline: 'bottom', dy: -6, fontWeight: 700 }, encoding: { ...(hz ? { y: k, x: { field: 't', type: 'quantitative' } } : { x: k, y: { field: 't', type: 'quantitative' } }), text: { field: 't', type: 'quantitative', format: fmt } } }] };
  }
  return { data: { values }, mark, encoding: enc };
}

// ===== 5) كتالوج مختصر لنورة (عشان تعرف الأعمدة وتطلب أي شارت فوراً) =====
export function catalogText(list) {
  if (!list.length) return '';
  return list.map(ds => `• جدول #${ds.id} «${ds.sheet}» من «${ds.doc_name}» — ${ds.profile.rows} صف. الأعمدة: ` +
    ds.profile.columns.map(c => c.type === 'number' ? `${c.name} (رقم${c.role === 'id' ? '/معرّف' : `، مجموع ${c.sum}`})` : c.type === 'date' ? `${c.name} (تاريخ ${c.min}→${c.max})` : `${c.name} (نص، ${c.distinct} قيمة${c.top?.length ? ` مثل: ${c.top.slice(0, 3).map(t => t.value).join('/')}` : ''})`).join('، ')).join('\n');
}
export async function latestCatalog() { return catalogText(await datasetsLatest().catch(() => [])); }

const nzT = x => String(x ?? '').toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[\u064B-\u0652\u0640_\-]/g, ' ').split(/\s+/).filter(w => w.length > 2).map(w => (w.length > 4 && w.startsWith('ال') ? w.slice(2) : w));
async function resolveDs({ dataset_id, sheet, group_by, measure, series_by, filters, title, about } = {}) {
  // الأعمدة المطلوبة: لو الجدول المختار ما فيه أعمدة السؤال، ندوّر تلقائياً على الملف اللي فيه (أحدث أولاً)
  const need = [group_by, measure, series_by, ...(filters || []).map(f => f?.column)].filter(Boolean);
  const fits = d => d && need.every(c => colIdx(d, c) >= 0);
  if (dataset_id) { const d = await datasetGet(dataset_id); if (d && fits(d)) return d; }
  // أكثر من جدول فيه نفس الأعمدة (مثلاً «الحالة» في الطلبات والعقود): نختار اللي اسمه يطابق موضوع السؤال
  const hint = nzT(`${about || ''} ${title || ''}`);
  if (hint.length && need.length) {
    const cands = (await datasetsRecent(40)).filter(fits);
    if (cands.length > 1) {
      const sc = d => { const n = nzT(`${d.sheet} ${d.doc_name}`).join(' '); return hint.filter(w => n.includes(w)).length; };
      const best = cands.reduce((a, d) => (sc(d) > sc(a) ? d : a), cands[0]);
      if (sc(best) > 0) return best;
    }
  }
  const list = await datasetsLatest();
  const pick = (sheet && list.find(d => d.sheet === sheet || d.sheet.includes(sheet))) || list.find(fits);
  if (pick && fits(pick)) return pick;
  if (need.length) {
    const recent = await datasetsRecent(40);
    const any = recent.find(fits); if (any) return any;
    // لا يوجد تطابق كامل: الأقرب = أكثر جدول فيه أعمدة مطابقة (عشان رسالة الخطأ تعرض أعمدة الملف الصحيح)
    const score = d => need.filter(c => colIdx(d, c) >= 0).length;
    const best = recent.reduce((a, d) => (score(d) > score(a) ? d : a), recent[0]);
    if (best && score(best) > 0) return best;
  }
  if (dataset_id) { const d = await datasetGet(dataset_id); if (d) return d; }
  if (!list.length) throw new Error('ما فيه ملف بيانات (Excel/CSV) مرفوع للحين');
  return pick || list[0];
}

// ===== 6) أدوات نورة =====
const QP = {
  dataset_id: { type: 'INTEGER', description: 'رقم الجدول من «بيانات الملف» (اختياري: الافتراضي آخر ملف)' },
  group_by: { type: 'STRING', description: 'العمود اللي نقسم عليه (فئة أو تاريخ)' },
  measure: { type: 'STRING', description: 'العمود الرقمي (فاضي = عدّ الصفوف)' },
  agg: { type: 'STRING', enum: ['sum', 'avg', 'count', 'min', 'max', 'distinct'] },
  series_by: { type: 'STRING', description: 'عمود ثاني يقسم كل عمود لسلاسل (اختياري)' },
  filters: { type: 'ARRAY', items: { type: 'OBJECT', properties: { column: { type: 'STRING' }, op: { type: 'STRING', enum: ['=', '!=', '>', '<', '>=', '<=', 'contains'] }, value: { type: 'STRING' } } } },
  about: { type: 'STRING', description: 'موضوع الجدول بكلمة (مثل: الطلبات، العقود، المخاطر) عشان نختار الجدول الصح لو أكثر من ملف فيه نفس العمود' },
  top: { type: 'INTEGER' }, date_unit: { type: 'STRING', enum: ['day', 'month', 'quarter', 'year'] },
};
export const datasetTools = {
  query_data: {
    declaration: { name: 'query_data', description: 'تحسب من بيانات الملف المرفوع (Excel/CSV) أرقام دقيقة: مجموع/متوسط/عدد حسب أي عمود مع فلاتر. استخدميها لأي سؤال رقمي عن الملف بدل قراءة النص.', parameters: { type: 'OBJECT', properties: QP } },
    run: async args => { const ds = await resolveDs(args); const r = runQuery(ds, args); const qn = await qualityNote(ds.id); return { dataset: `#${ds.id} ${ds.sheet}`, ...(qn ? { knowledge: qn } : {}), ...r, rows: r.rows.slice(0, 40).map(x => ({ [r.group_by || 'المجموعة']: x.key, ...(r.series[0] === '_' ? { [r.measure]: x.total } : x.values) })) }; },
  },
  data_chart: {
    declaration: { name: 'data_chart', description: 'ترسم فوراً أي شارت من بيانات الملف المرفوع بأرقام محسوبة ويظهر على الشاشة الرئيسية مكان البيانات. استخدميها لما يطلب شارت عن بيانات الملف.', parameters: { type: 'OBJECT', properties: { title: { type: 'STRING' }, chart_type: { type: 'STRING', enum: ['bar', 'hbar', 'stacked', 'line', 'area', 'pie', 'donut'] }, ...QP }, required: ['title', 'chart_type'] } },
    run: async ({ title, chart_type = 'bar', ...args }) => {
      const ds = await resolveDs({ ...args, title }); const r = runQuery(ds, args);
      if (args.measure && r.measure === 'العدد') title = `العدد حسب ${r.group_by || ''}`.trim(); // العمود نصي فتحوّل لعدّ
      if (!/[\u0600-\u06FF]/.test(title || '')) title = `${r.measure === 'العدد' ? 'عدد السجلات' : aggLabel(r.agg, r.measure)} حسب ${r.group_by || ''}`.replace(/\s+/g, ' ').trim();
      const total = r.rows.reduce((a, x) => a + x.total, 0);
      const sorted = [...r.rows].sort((a, b) => b.total - a.total), top1 = sorted[0], low = sorted.at(-1);
      const n = x => new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(x);
      const share = top1 && total ? Math.round(top1.total / total * 100) : 0;
      // نقاط مكتوبة على الشاشة بالأرقام (تتطابق مع كلام نورة)
      const insights = top1 ? [
        `الأعلى: ${top1.key} بـ ${n(top1.total)}${r.agg === 'sum' || r.agg === 'count' ? ` (${share}٪ من الإجمالي)` : ''}`,
        ...(sorted.length > 1 ? [`الأقل: ${low.key} بـ ${n(low.total)}`] : []),
        ...(sorted.length > 2 && r.agg !== 'avg' ? [`أعلى ${Math.min(3, sorted.length)} فئات = ${Math.round(sorted.slice(0, 3).reduce((a, x) => a + x.total, 0) / total * 100)}٪ من الإجمالي`] : []),
      ] : [];
      const qn = await qualityNote(ds.id);
      return { ...(qn ? { knowledge: qn } : {}), title, subtitle: `من ${srcLabel(ds.doc_name, ds.sheet)} · ${r.matched_rows} صف`, vega_lite: toVegaLite(r, chart_type), insights,
        kpis: [{ label: r.measure === 'العدد' ? 'عدد السجلات' : aggLabel(r.agg, r.measure), value: r.agg === 'avg' ? +(total / Math.max(1, r.rows.length)).toFixed(1) : total }, ...(top1 ? [{ label: `الأعلى · ${top1.key}`, value: +(+top1.total).toFixed(1) }] : []), { label: 'عدد الفئات', value: r.rows.length }],
        top: r.rows.slice(0, 5).map(x => ({ [r.group_by || '']: x.key, [r.measure]: x.total })) };
    },
  },
};

export { datasetsForDoc, datasetsLatest, resolveDs };
