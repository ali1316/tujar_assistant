// التنظيم: من استخراج الصفحات إلى جداول منطقية (مع ضم الجداول الممتدة) وسجلات قيم ومجموعات بيانات وتتبع أصل.
// القاعدة: القيمة الأصلية تبقى بجانب المنظّمة دائماً؛ القيم المحسوبة والاستنتاجات منفصلة عن الأصل.
import { tableId, recordId, datasetId, VERIFY } from './contracts.js';
import { parseValue, numbersInText, digitsKey } from './normalize.js';

const isNumericCol = (rows, j) => {
  const vals = rows.map(r => r[j]).filter(v => String(v ?? '').trim() !== '');
  if (!vals.length) return false;
  const nums = vals.filter(v => { const p = parseValue(v); return ['number', 'percent', 'zero'].includes(p.kind) || ['dash', 'missing', 'not_applicable'].includes(p.kind); });
  return nums.length / vals.length >= 0.8 && vals.some(v => ['number', 'percent', 'zero'].includes(parseValue(v).kind));
};
const baseTitle = x => normCol(x).replace(/[(（\[]?\s*(تتمة|تابع|تكملة|continued|cont\.?)\s*[)）\]]?/gi, '').replace(/[:：\-–—]+$/, '').trim();
const sameCols = (a, b) => a.columns.length === b.columns.length && (a.columns.every((c, i) => c.name.trim() === b.columns[i].name.trim()) || b.continues_from_previous);

// جدول بلوحتين (أو أكثر) جنباً إلى جنب بنفس الأعمدة: نفكّه إلى صفوف بدل أن تطغى أعمدة على أخرى بنفس الاسم
const normCol = x => String(x || '').replace(/\s+/g, ' ').trim();
// رقم اللوحة الذي قد يضيفه المحرك للأسماء: «الغرفة (2)» / «الغرفة 2» / «الغرفة - 2»
const panelBase = x => normCol(x).replace(/\s*[-–—]?\s*[(（\[]?\s*[0-9٠-٩]+\s*[)）\]]?\s*$/, '').trim();
export function unstackRepeated(t) {
  const n = t.columns.length;
  // نجرب أسماء الأعمدة بعد حذف رقم اللوحة، ثم صف العناوين المطبوع (حصل فعلاً: v5 أعاد «(1)/(2)» في الأسماء لكن العناوين مكررة حرفياً)
  const candidates = [t.columns.map(c => panelBase(c.name)), ...(t.header_rows || []).filter(h => h.length === n).map(h => h.map(panelBase))];
  for (const names of candidates) {
    const r = tryUnstack(t, names);
    if (r) return r;
  }
  return dedupeCols(t);
}
function tryUnstack(t, names) {
  const n = names.length;
  if (names.some(x => !x)) return null; // اسم صار فاضياً بعد حذف الرقم (مثل أعمدة سنوات 2025/2026) — ليس لوحات
  for (let g = 2; g <= n / 2; g++) { // لوحة من عمودين على الأقل: عمود مكرر وحده ليس نمط لوحات
    if (n % g) continue;
    if (!names.every((x, i) => x === names[i % g])) continue;
    const k = n / g;
    if (new Set(names.slice(0, g)).size !== g) continue;
    const rows = [], kinds = [];
    for (let s = 0; s < k; s++) t.rows.forEach((r, i) => {
      const part = r.slice(s * g, s * g + g);
      if (part.every(c => String(c ?? '').trim() === '')) return; // لوحة أقصر من الأخرى
      // نوع الصف المطبوع يخص السطر كاملاً (قد يجمع غرفة من لوحة وإجمالي من أخرى) — بعد الفك يُحدد من نص الخلية نفسها
      rows.push(part); kinds.push(['total', 'subtotal'].includes(t.row_kinds[i]) ? 'detail' : (t.row_kinds[i] || 'detail'));
    });
    return { ...t, columns: t.columns.slice(0, g).map((c, j) => ({ ...c, name: names[j] || panelBase(c.name) })), rows, row_kinds: kinds, header_rows: (t.header_rows || []).map(h => h.slice(0, g)), unstacked: { panels: k, group: g } };
  }
  return null;
}
function dedupeCols(t) {
  // أسماء مكررة بلا نمط واضح: نميّزها بلاحقة حتى لا تضيع خلايا بصمت
  const seen = {};
  const columns = t.columns.map(c => { const b = normCol(c.name) || 'عمود'; seen[b] = (seen[b] || 0) + 1; return seen[b] > 1 ? { ...c, name: `${b} (${seen[b]})` } : c; });
  return { ...t, columns };
}

// صف إجمالي: الكلمة في أول خلية نصية متبوعة بفراغ أو نهاية (\b في JS لا يعرف الحروف العربية)
export const TOTAL_RE = /^(ال)?(إجمالي|اجمالي|المجموع|مجموع|الكلي|total)(?![\p{L}\p{N}])/iu;

// أرقام طبقة النص لكل صفحة (للتحقق: هل الرقم مطبوع حرفياً في الصفحة؟)
function textLayerKeys(analysis) {
  const m = new Map();
  for (const p of analysis.pages) {
    const keys = new Set();
    for (const tok of String(p.text_layer || '').match(/[\d٠-٩][\d٠-٩,٬.٫]*/g) || []) { const k = digitsKey(tok); if (k) keys.add(k); }
    m.set(p.page, keys);
  }
  return m;
}

export function organize({ vid, analysis, pages }) {
  const tl = textLayerKeys(analysis);
  const lineage = [], values = [], problems = [];
  const verifyNum = (page, raw, base = []) => {
    const k = digitsKey(raw);
    if (k && tl.get(page)?.has(k)) return [...base, VERIFY.TEXT_LAYER];
    return [...base, VERIFY.VISION_ONLY];
  };

  // 1) الجداول المنطقية: ضم الأجزاء المتتالية عبر الصفحات
  const logical = [];
  for (const pg of pages) {
    (pg.tables || []).forEach((t0, idx) => {
      const t = unstackRepeated(t0);
      if (t.unstacked) lineage.push({ id: `${vid}#p${pg.page}-t${idx + 1}:unstack`, kind: 'reshape', output: `p${pg.page}-t${idx + 1}`, inputs: [`p${pg.page}`], method: `جدول من ${t.unstacked.panels} لوحات متجاورة بنفس الأعمدة (${t.unstacked.group} أعمدة) — فُكّ إلى صفوف بترتيب اللوحات، بدون تعديل القيم` });
      const prev = logical.at(-1);
      const firstOnPage = idx === 0;
      const lastPart = prev?.parts.at(-1);
      // ضم عبر صفحتين متتاليتين، أو داخل نفس الصفحة لو المحرك قسم الجدول نفسه (لوحتين/«تتمة») — حصل فعلاً في تقرير تجار ص6
      const crossPage = firstOnPage && lastPart?.page === pg.page - 1 && (lastPart.continues_on_next || t.continues_from_previous);
      const samePage = lastPart?.page === pg.page && (t.continues_from_previous || lastPart.continues_on_next || (baseTitle(t.title) && baseTitle(t.title) === baseTitle(prev.title)));
      const join = prev && (crossPage || samePage) && sameCols(prev, t);
      const part = { page: pg.page, printed_page: pg.printed_page_number || null, row_from: join ? prev.rows.length : 0, row_count: t.rows.length, bbox: t.bbox, continues_on_next: t.continues_on_next, title_on_page: t.title };
      if (join) {
        // صف العناوين المكرر في الجزء الثاني لا يُضاف كبيانات
        const rows = t.rows.filter(r => !(r.length === prev.columns.length && r.every((c, i) => c.trim() === prev.columns[i].name.trim())));
        part.row_count = rows.length;
        prev.rows.push(...rows); prev.row_kinds.push(...(t.row_kinds.length === t.rows.length ? t.row_kinds.slice(t.rows.length - rows.length) : rows.map(() => 'detail')));
        prev.notes.push(...t.notes); prev.parts.push(part);
        lineage.push({ id: `${prev.id}:stitch:${pg.page}`, kind: 'stitch', output: prev.id, inputs: prev.parts.map(p => `p${p.page}`), method: samePage ? 'ضم جزأين من نفس الجدول في نفس الصفحة (نفس الأعمدة + «تتمة»/علامة استمرار/نفس العنوان)' : 'ضم جزء جدول ممتد عبر الصفحات (نفس الأعمدة + علامة الاستمرار)' });
      } else {
        const id = tableId(vid, logical.length + 1);
        logical.push({ id, title: t.title, caption: t.caption, units: t.units, notes: [...t.notes], header_rows: t.header_rows, columns: t.columns, rows: [...t.rows],
          row_kinds: t.row_kinds.length === t.rows.length ? [...t.row_kinds] : t.rows.map(() => 'detail'), parts: [part], engine: pg.engine });
      }
    });
  }
  for (const t of logical) {
    t.pages = [...new Set(t.parts.map(p => p.page))];
    t.ragged_rows = t.rows.filter(r => r.length !== t.columns.length).length;
    // صفوف الإجمالي: علامة المحرك + كلمة صريحة في أول خلية نصية
    t.row_kinds = t.rows.map((r, i) => (TOTAL_RE.test(String(r.find(c => /\p{L}/u.test(c)) || '').trim()) ? 'total' : t.row_kinds[i] || 'detail'));
    t.numeric = t.columns.map((_, j) => isNumericCol(t.rows.filter((_, i) => t.row_kinds[i] === 'detail'), j));
  }

  // 2) مجموعات البيانات + سجلات القيم (خلية رقمية = سجل) مع الأبعاد
  const datasets = [];
  logical.forEach((t, n) => {
    const ds = { id: datasetId(vid, n + 1), table_id: t.id, title: t.title || `جدول ${n + 1}`, pages: t.pages, units: t.units,
      dimensions: t.columns.map((c, j) => (!t.numeric[j] ? c.name : null)).filter(Boolean),
      measures: t.columns.map((c, j) => (t.numeric[j] ? { name: c.name, unit: c.unit || t.units || '' } : null)).filter(Boolean), rows: [] };
    t.rows.forEach((r, i) => {
      const part = t.parts.find(p => i >= p.row_from && i < p.row_from + p.row_count) || t.parts[0];
      const dims = {}; t.columns.forEach((c, j) => { if (!t.numeric[j]) dims[c.name] = String(r[j] ?? '').trim(); });
      const row = { row: i + 1, kind: t.row_kinds[i], page: part.page, dims, cells: {} };
      t.columns.forEach((c, j) => {
        if (!t.numeric[j]) return;
        const raw = String(r[j] ?? '').trim();
        const v = parseValue(raw, { unitHint: c.unit || t.units });
        const rid = recordId(t.id, 'cell', i, j, raw);
        const verification = v.value == null ? [] : verifyNum(part.page, raw);
        const rec = { id: rid, source: { type: 'table', table_id: t.id, page: part.page, printed_page: part.printed_page, row: i + 1, column: c.name, bbox: part.bbox },
          raw, value: v.value, kind: v.kind, unit: v.unit || c.unit || t.units || null, currency: v.currency || null, scale: v.scale || null,
          percent_as_written: v.percent_as_written ?? null, row_kind: t.row_kinds[i], dims, period: null, extraction: t.engine, verification };
        values.push(rec); row.cells[c.name] = { value: v.value, raw, kind: v.kind, record: rid };
        lineage.push({ id: `${rid}:extract`, kind: 'extract', output: rid, inputs: [`p${part.page}`, t.id], method: `${t.engine}: خلية صف ${i + 1} عمود «${c.name}»`, raw });
        if (v.value != null && String(v.value) !== raw) lineage.push({ id: `${rid}:normalize`, kind: 'normalize', output: rid, inputs: [rid], method: normRule(raw, v), from: raw, to: v.value });
      });
      ds.rows.push(row);
    });
    datasets.push(ds);
  });

  // 3) أرقام داخل الفقرات والحواشي (مع العبارة المحيطة)
  const blocksOut = [];
  for (const pg of pages) {
    (pg.blocks || []).forEach((b, bi) => {
      const bid = `${vid}#p${pg.page}-b${bi + 1}`;
      blocksOut.push({ id: bid, page: pg.page, ...b });
      if (!['paragraph', 'footnote', 'list_item', 'caption', 'definition', 'condition', 'exception', 'heading'].includes(b.type)) return;
      for (const nmb of numbersInText(b.text)) {
        if (/^\d{4}$/.test(nmb.raw.replace(/[^\d]/g, '')) && nmb.kind === 'number' && nmb.value >= 1300 && nmb.value <= 2100) continue; // سنوات
        const rid = recordId(bid, 'num', nmb.raw, nmb.context);
        values.push({ id: rid, source: { type: b.type, block_id: bid, page: pg.page, printed_page: pg.printed_page_number || null, bbox: b.bbox }, raw: nmb.raw, value: nmb.value,
          kind: nmb.kind, unit: nmb.unit || null, currency: nmb.currency || null, scale: nmb.scale || null, percent_as_written: nmb.percent_as_written ?? null,
          context: nmb.context, row_kind: null, dims: {}, period: null, extraction: pg.engine, verification: verifyNum(pg.page, nmb.raw) });
        lineage.push({ id: `${rid}:extract`, kind: 'extract', output: rid, inputs: [bid], method: `${pg.engine}: رقم داخل ${b.type}`, raw: nmb.raw });
      }
    });
  }

  // 4) الرسوم: المكتوب مقابل المقدّر بصرياً (التقدير لا يدخل المؤشرات الدقيقة)
  const charts = [];
  for (const pg of pages) (pg.charts || []).forEach((c, ci) => {
    const cid = `${vid}#p${pg.page}-c${ci + 1}`;
    charts.push({ id: cid, page: pg.page, ...c });
    c.points.forEach(p => {
      const v = parseValue(p.value_text, { unitHint: c.unit });
      const rid = recordId(cid, 'pt', p.series, p.category, p.value_text);
      const verification = p.value_source === 'estimated' ? [VERIFY.ESTIMATED] : verifyNum(pg.page, p.value_text);
      values.push({ id: rid, source: { type: 'chart', chart_id: cid, page: pg.page, printed_page: pg.printed_page_number || null, bbox: c.bbox }, raw: p.value_text, value: v.value, kind: v.kind,
        unit: v.unit || c.unit || null, row_kind: null, dims: { [c.x_label || 'الفئة']: p.category, ...(p.series ? { السلسلة: p.series } : {}) }, period: c.period || null,
        value_source: p.value_source, extraction: pg.engine, verification });
      lineage.push({ id: `${rid}:extract`, kind: 'extract', output: rid, inputs: [cid], method: `${pg.engine}: نقطة رسم (${p.value_source === 'written' ? 'مكتوبة' : 'تقدير بصري'})`, raw: p.value_text });
    });
  });

  for (const pg of pages) for (const p of pg.problems || []) problems.push({ page: pg.page, element: p.element, reason: p.reason, engine: pg.engine });
  return { tables: logical, datasets, values, blocks: blocksOut, charts, lineage, problems };
}

function normRule(raw, v) {
  const r = [];
  if (/[٠-٩]/.test(raw)) r.push('أرقام عربية→لاتينية');
  if (/[,٬]/.test(raw)) r.push('حذف فواصل الآلاف');
  if (/[٫]/.test(raw)) r.push('الفاصل العشري العربي');
  if (v.kind === 'percent') r.push(`نسبة كما وردت ${v.percent_as_written}% (الكسر ${v.fraction})`);
  if (v.scale) r.push(`مضاعف ×${v.scale}`);
  if (/^\(.*\)$/.test(raw)) r.push('قوسين = سالب');
  return r.join('، ') || 'تحويل نصي إلى رقم';
}
