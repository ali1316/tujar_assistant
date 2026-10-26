// التحقق: مجاميع الجداول، البنية، الأنواع، الوحدات، والتعارض بين المواضع. لا نعدّل المصدر لإجباره على التطابق.
// الجاهزية على مستوى مجموعة البيانات: جدول متحقق يُتاح، وجدول فيه مشكلة مؤثرة يُحجب.
import { VERIFY } from './contracts.js';
import { digitsKey } from './normalize.js';

const decimals = raw => { const m = String(raw).replace(/[^\d.٫]/g, '').match(/[.٫](\d+)$/); return m ? m[1].length : 0; };
// فرق التقريب المقبول: نصف وحدة آخر خانة لكل حد في المجموع (موثّق في التقرير)
export const tolerance = (terms, d) => +(terms * 0.5 * Math.pow(10, -d)).toFixed(10);

export function validate(org) {
  const checks = [], byId = new Map(org.values.map(v => [v.id, v]));
  const status = new Map(org.datasets.map(d => [d.id, { blocking: [], notes: [] }]));
  const add = (c) => { checks.push(c); if (c.dataset && c.result === 'fail' && c.severity === 'blocking') status.get(c.dataset).blocking.push(c.id); else if (c.dataset && c.result !== 'pass') status.get(c.dataset).notes.push(c.id); };

  for (const ds of org.datasets) {
    const t = org.tables.find(x => x.id === ds.table_id);
    // البنية
    add({ id: `${ds.id}:shape`, dataset: ds.id, type: 'structure', result: t.ragged_rows ? (t.ragged_rows / t.rows.length > 0.1 ? 'fail' : 'warn') : 'pass', severity: t.ragged_rows / Math.max(1, t.rows.length) > 0.1 ? 'blocking' : 'minor',
      detail: `${t.rows.length} صف × ${t.columns.length} عمود${t.ragged_rows ? `، ${t.ragged_rows} صف عدد خلاياه مختلف` : ''}`, pages: t.pages });
    if (!ds.measures.length) add({ id: `${ds.id}:no-measures`, dataset: ds.id, type: 'types', result: 'warn', severity: 'minor', detail: 'لا توجد أعمدة رقمية — الجدول نصي (يُعرض ولا يُحسب)', pages: t.pages });
    // أنواع: خلايا غير رقمية داخل عمود رقمي
    for (const m of ds.measures) {
      const bad = ds.rows.filter(r => r.kind === 'detail' && r.cells[m.name] && r.cells[m.name].kind === 'text');
      if (bad.length) add({ id: `${ds.id}:type:${m.name}`, dataset: ds.id, type: 'types', result: 'warn', severity: 'minor', detail: `«${m.name}»: ${bad.length} خلية نصية في عمود رقمي (صفوف ${bad.map(r => r.row).slice(0, 8).join('، ')})`, pages: t.pages });
      const units = new Set(ds.rows.map(r => r.cells[m.name]?.kind).filter(k => k === 'percent' || k === 'number'));
      if (units.size > 1) add({ id: `${ds.id}:unit:${m.name}`, dataset: ds.id, type: 'units', result: 'warn', severity: 'minor', detail: `«${m.name}» يخلط نسباً وأرقاماً`, pages: t.pages });
    }
    // المجاميع: صف الإجمالي مقابل مجموع التفاصيل
    const totals = ds.rows.filter(r => r.kind === 'total'), details = ds.rows.filter(r => r.kind === 'detail');
    for (const tr of totals) for (const m of ds.measures) {
      const tc = tr.cells[m.name]; if (!tc || tc.value == null || tc.kind === 'percent') continue;
      if (/نسب|%|٪|معدل|متوسط/.test(m.name)) continue; // لا نجمع النسب والمتوسطات
      const parts = details.map(r => r.cells[m.name]).filter(c => c && c.value != null);
      if (parts.length < 2) continue;
      const sum = parts.reduce((a, c) => a + c.value, 0);
      const d = Math.max(decimals(tc.raw), ...parts.map(c => decimals(c.raw)));
      // أعداد صحيحة بدون وحدة مقرّبة (ألف/مليون) = يجب التطابق التام؛ غير كذا نصف وحدة آخر خانة لكل حد
      const rounded = d > 0 || /ألف|آلاف|مليون|مليار/.test(`${m.unit} ${ds.units} ${m.name}`);
      const tol = rounded ? tolerance(parts.length, d) : 0, diff = +(sum - tc.value).toFixed(6);
      const ok = Math.abs(diff) <= tol;
      const cid = `${ds.id}:total:${m.name}:r${tr.row}`;
      add({ id: cid, dataset: ds.id, type: 'total', result: ok ? 'pass' : 'fail', severity: ok ? 'none' : 'blocking',
        detail: `مجموع التفاصيل ${round(sum)} مقابل الإجمالي المطبوع ${tc.raw} (الفرق ${round(diff)}، المسموح ±${tol})`, formula: `SUM(${m.name} | صفوف التفاصيل ${parts.length})`, tolerance: tol, pages: ds.pages,
        records: [tc.record, ...parts.map(c => c.record)] });
      if (ok) for (const rid of [tc.record, ...parts.map(c => c.record)]) { const v = byId.get(rid); if (v && !v.verification.includes(VERIFY.TOTAL_OK)) v.verification.push(VERIFY.TOTAL_OK); }
      else { const v = byId.get(tc.record); if (v) v.verification.push(VERIFY.CONFLICT); }
    }
    if (!totals.length && ds.measures.length) add({ id: `${ds.id}:no-total`, dataset: ds.id, type: 'total', result: 'info', severity: 'none', detail: 'لا يوجد صف إجمالي مطبوع للمقارنة', pages: ds.pages });
  }

  // التعارض بين المواضع: رقم في فقرة يصف «إجمالي» يطابق أو يقارب إجمالي جدول
  const paraNums = org.values.filter(v => v.source.type !== 'table' && v.source.type !== 'chart' && v.value != null);
  const tableTotals = org.values.filter(v => v.source.type === 'table' && v.row_kind === 'total' && v.value != null);
  for (const p of paraNums) for (const t of tableTotals) {
    if (digitsKey(p.raw) === digitsKey(t.raw)) {
      if (!p.verification.includes('cross_referenced')) p.verification.push('cross_referenced');
      checks.push({ id: `xref:${p.id}`, type: 'cross_reference', result: 'pass', severity: 'none', detail: `الرقم ${p.raw} (ص${p.source.page}) يطابق إجمالي الجدول (ص${t.source.page})`, records: [p.id, t.id], pages: [p.source.page, t.source.page] });
    } else if (/إجمالي|اجمالي|مجموع/.test(p.context || '') && t.value && Math.abs(p.value - t.value) / Math.abs(t.value) < 0.02 && p.value !== t.value) {
      checks.push({ id: `xref:${p.id}:${t.id}`, type: 'cross_reference', result: 'warn', severity: 'minor', detail: `فقرة ص${p.source.page} تذكر ${p.raw} وإجمالي جدول ص${t.source.page} = ${t.raw} (فرق صغير — تحقق يدوي)`, records: [p.id, t.id], pages: [p.source.page, t.source.page] });
    }
  }
  // تقديرات الرسوم
  const est = org.values.filter(v => v.verification.includes(VERIFY.ESTIMATED));
  if (est.length) checks.push({ id: 'charts:estimated', type: 'charts', result: 'info', severity: 'none', detail: `${est.length} قيمة رسم مقدّرة بصرياً — محجوبة عن المؤشرات الدقيقة`, records: est.map(v => v.id) });

  const readiness = org.datasets.map(ds => {
    const s = status.get(ds.id);
    const vals = ds.rows.flatMap(r => Object.values(r.cells)).map(c => byId.get(c.record)).filter(Boolean);
    const visionOnly = vals.filter(v => v.value != null && !v.verification.includes(VERIFY.TEXT_LAYER) && !v.verification.includes(VERIFY.TOTAL_OK)).length;
    const state = s.blocking.length ? 'blocked' : !ds.measures.length ? 'text_only' : visionOnly ? 'ready_with_notes' : 'ready';
    return { dataset: ds.id, title: ds.title, state, blocking_checks: s.blocking, notes: s.notes,
      values: vals.length, vision_only_values: visionOnly, reason: s.blocking.length ? 'فشل تحقق مؤثر (انظر الفحوص)' : visionOnly ? `${visionOnly} قيمة مقروءة بصرياً فقط بدون مطابقة طبقة نص أو مجموع` : '' };
  });
  return { checks, readiness };
}
const round = x => +(+x).toFixed(4);
