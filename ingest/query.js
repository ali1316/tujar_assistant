// أدوات نورة وقت التشغيل على مصادر PDF المحفوظة (منفصلة عن مهارات التطوير):
// البحث في الفهرس أولاً، الحسابات بالكود على البيانات المنظمة، وكل رقم مربوط بمصدره وإصداره وصفحته.
import { currentVersions, getData, getIndex } from './pipeline.js';
import { VERIFY, USABLE_FOR_METRICS, STAGE_AR } from './contracts.js';
import { digitsKey } from './normalize.js';

const nz = x => String(x ?? '').toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[ً-ْـ]/g, '').replace(/[^\p{L}\p{N}%.\s]/gu, ' ').replace(/\s+/g, ' ').trim();
const STOP = new Set('نوره يا في من على الى عن مع او و ثم لا ما هذا هذه كل كم وش ايش عطيني وريني ابي ابغى اعرضي اعرض قولي حسب الملف كان كانت بلغ بلغت عدد قيمه رقم'.split(' '));
// تجذيع خفيف للعربية: «المشتركين/المشتركون» و«الفعّالين/الفعّالون» و«للربع/الربع» تتطابق (حالة حقيقية: سؤال صوتي عن «المشتركين الفعالين» فشل لأن العمود «المشتركون الفعّالون»)
const stem = t => { let x = t; if (x.length > 4 && /^(ال|لل|بال|وال|فال|كال)/.test(x)) x = x.replace(/^(بال|وال|فال|كال|ال|لل)/, ''); if (x.length >= 4) x = x.replace(/(ين|ون|ات|ان|يه|ه|ي)$/, ''); return x; };
// كلمات عامة في صياغة السؤال لا تدل على المطلوب (تُستبعد بعد التجذيع أيضاً)
const GENERIC = new Set(('رقم ارقام قيمه قيم عدد اعداد مذكور ذكور موجود مكتوب تقرير ملف مستند صفح صفحه جدول فقر حاشي هامش رسم اجمال مجموع كم وش ايش لي لنا'
  // صياغة وحشو وأزمنة عامة: «الكلي/بالكامل/ابي اعرف/لعام/خلال» ما تدل على شيء غير موجود (اختبار: رفض كاذب)
  + ' الكلي كلي بالكامل كامل جميع كافه اعرف ابغا ابغي اريد احتاج اعطني عطني خلال لعام عام العام سنه لسنه السنه فتره الفتره مده تقريبا حوالي فقط بس هل وين متي كيف ليش لماذا اي ايه شو اكثر اقل اعلي ادني اكبر اصغر بين ضمن داخل الحالي حالي').split(' ').map(w => stem(nz(w))));
const toks = q => nz(q).split(' ').filter(t => t.length > 1 && !STOP.has(t)).map(stem).filter(t => !STOP.has(t));
// بدائل الحرف الجار الملتصق («لغرفة/بغرفة» ← «غرفة») تُجرّب مع الكلمة نفسها، حتى لا نقص كلمات أصلها يبدأ بلام أو باء
const variants = k => (k.length > 3 && /^[لب]/.test(k) ? [k, stem(k.slice(1))] : [k]);
const stems = h => new Set(nz(h).split(' ').filter(Boolean).map(stem));
const usable = v => v.value != null && v.verification.some(x => USABLE_FOR_METRICS.has(x)) && !v.verification.includes(VERIFY.ESTIMATED) && !v.verification.includes(VERIFY.CONFLICT);
const VER_AR = { matched_text_layer: 'مطابق لنص الصفحة', total_reconciled: 'مطابق للمجموع', vision_only: 'مقروء من الصورة فقط', visual_estimate: 'تقدير بصري (غير مؤكد)', conflict: 'متعارض', cross_referenced: 'متطابق مع موضع آخر' };

async function sources(document_id) {
  const docs = await currentVersions();
  const out = [];
  for (const d of docs) {
    if (document_id && d.document_id !== document_id && !d.file_name.includes(document_id)) continue;
    const data = await getData(d.current.version_id);
    if (data) out.push(data);
  }
  return out;
}
const where = (v, data) => {
  const s = v.source;
  const pg = `ص${s.page}${s.printed_page && String(s.printed_page) !== String(s.page) ? ` (المطبوعة ${s.printed_page})` : ''}`;
  if (s.type === 'table') { const t = data.tables.find(x => x.id === s.table_id); return `${pg} · ${t?.title || 'جدول'} · صف ${s.row} · عمود «${s.column}»`; }
  if (s.type === 'chart') return `${pg} · رسم بياني`;
  return `${pg} · ${({ paragraph: 'فقرة', footnote: 'حاشية', list_item: 'بند قائمة', caption: 'شرح', heading: 'عنوان', definition: 'تعريف', condition: 'شرط', exception: 'استثناء' })[s.type] || s.type}`;
};
const pub = (v, data) => ({
  record_id: v.id, raw: v.raw, value: v.value, kind: v.kind, unit: v.unit, source_type: v.source.type, page: v.source.page, location: where(v, data),
  context: v.context || (v.dims && Object.keys(v.dims).length ? Object.entries(v.dims).map(([k, x]) => `${k}: ${x}`).join('، ') : ''),
  row_kind: v.row_kind, verification: v.verification.map(x => VER_AR[x] || x), usable_for_metrics: usable(v),
  document: data.meta.file_name, version_id: data.meta.version_id,
});

function score(v, data, ts) {
  const t = data.tables.find(x => x.id === v.source.table_id);
  const text = [v.context, v.source.column, Object.keys(v.dims || {}).join(' '), Object.values(v.dims || {}).join(' '), t?.title, v.raw, data.meta?.file_name, data.meta?.data_period].join(' ');
  const hay = nz(text), hs = stems(text);
  let s = 0;
  for (const k0 of ts) {
    const vs = variants(k0);
    if (vs.some(k => hs.has(k) || hay.includes(k))) s += 1;
    else if (vs.some(k => k.length > 3 && [...hs].some(h => h.startsWith(k) || (k.startsWith(h) && h.length > 3)))) s += 0.6;
  }
  if (ts.some(k => /^\d/.test(k) && digitsKey(v.raw) === digitsKey(k))) s += 2;
  return s / Math.max(1, ts.length);
}

export const tools = {
  pdf_sources: {
    declaration: { name: 'pdf_sources', description: 'تعرض مصادر PDF المعالجة والمحفوظة (المستند، الإصدار الحالي، الحالة، الجداول الجاهزة والمحجوبة، روابط Drive). استخدميها لما يسأل «وش الملفات اللي عندك» أو قبل أي سؤال عن ملف PDF مرفوع.', parameters: { type: 'OBJECT', properties: {} } },
    run: async () => {
      const ix = await getIndex();
      return { documents: Object.values(ix.documents).map(d => {
        const cur = d.versions.find(v => v.n === d.current_version);
        const last = d.versions.at(-1);
        return { document_id: d.document_id, file_name: d.file_name, current_version: cur?.version_id || null, status: cur ? STAGE_AR[cur.status] : null,
          processing: last && last !== cur ? { version: last.version_id, status: STAGE_AR[last.status] } : null, versions: d.versions.length,
          datasets: (cur?.datasets || []).map(x => `${x.id.split('#')[1]} «${x.title}» (${x.state})`), links: cur?.links || null };
      }) };
    },
  },
  pdf_find_value: {
    declaration: { name: 'pdf_find_value', description: 'تبحث عن رقم أو معلومة داخل ملفات PDF المحفوظة (فقرات، حواشي، جداول، رسوم) وترجع القيمة حرفياً مع الصفحة والموضع وحالة التحقق ومعرّف السجل. لا تعيد تحليل الملف. لو ما لقت، قولي بوضوح إنها غير موجودة في المصدر.', parameters: { type: 'OBJECT', properties: { query: { type: 'STRING', description: 'وصف القيمة المطلوبة بكلمات السؤال' }, document_id: { type: 'STRING' },
      source_type: { type: 'STRING', description: 'اختياري: paragraph | footnote | table | chart — لما يحدد السؤال مكان الرقم (فقرة، حاشية، جدول، رسم)' } }, required: ['query'] } },
    run: async ({ query, document_id, source_type } = {}) => {
      // مكان الرقم: صريح من المعامل، أو من كلمات السؤال (حاشية/هامش، فقرة/النص، جدول، رسم)
      const where = source_type || (/حاشي|هامش|footnote/i.test(query) ? 'footnote' : /فقر|في النص|paragraph/i.test(query) ? 'paragraph' : /رسم|شارت|chart/i.test(query) ? 'chart' : null);
      const q = where && !source_type ? query.replace(/(في\s+)?(الحاشية|حاشية|الحواشي|الهامش|هامش|الفقرة|فقرة|في النص|الرسم|رسم|الشارت)/g, ' ') : query;
      const ts = toks(q);
      const all = [];
      // كلمة جوهرية في السؤال غير موجودة في المستند كله ⇒ المطلوب غير موجود في المصدر (لا نرجع أرقام كيان آخر). حالة حقيقية: «عدد الموظفين في غرفة الرس» رجّع أرقام المشتركين
      const srcs = await sources(document_id);
      const docStems = new Set();
      for (const data of srcs) { for (const v of data.values) for (const x of stems([v.context, v.source.column, Object.keys(v.dims || {}).join(' '), Object.values(v.dims || {}).join(' ')].join(' '))) docStems.add(x);
        for (const x of stems([data.meta?.file_name, data.meta?.data_period, data.meta?.report_date, ...(data.tables || []).map(t => `${t.title} ${(t.notes || []).join(' ')} ${(t.columns || []).map(c => c.name).join(' ')}`)].join(' '))) docStems.add(x); }
      const has = k => variants(k).some(x => docStems.has(x) || [...docStems].some(h => h.length > 3 && x.length > 3 && (h.startsWith(x) || x.startsWith(h))));
      const missing = ts.filter(k => k.length > 2 && !GENERIC.has(k) && !/^\d/.test(k) && !has(k));
      if (missing.length) return { found: false, missing_terms: missing, message: `«${missing.join('، ')}» غير موجود في المصدر — لن أرجع أرقاماً لشيء آخر.` };
      for (const data of srcs) for (const v of data.values) {
        if (where && v.source.type !== where) continue;
        const s = ts.length ? score(v, data, ts) : 1; if (s >= 0.5) all.push({ s, v, data });
      }
      if (!ts.length && !where) return { found: false, message: 'اكتب وصفاً للقيمة' };
      // السؤال حدد المكان فقط (مثل «وش الرقم في الحاشية؟»): نرجع قيم ذلك المكان ونوضح أن المطابقة بالمكان لا بالمعنى
      let byLocation = false;
      if (where && !all.length) { byLocation = true; for (const data of await sources(document_id)) for (const v of data.values) if (v.source.type === where) all.push({ s: 0, v, data }); }
      // سؤال عن «الإجمالي» بدون ذكر كيان (غرفة…) ⇒ صف الإجمالي والفقرات أولاً؛ غير كذا التفاصيل أولاً
      const qn = nz(query);
      const namesEntity = all.some(x => Object.values(x.v.dims || {}).some(d => d && d.length > 2 && qn.includes(nz(d))));
      const wantsTotal = /اجمالي|مجموع|الكلي|كامل/.test(qn) && !namesEntity;
      const rank = x => (wantsTotal ? (x.v.row_kind === 'total' || x.v.source.type === 'paragraph' ? 0 : 1) : (x.v.row_kind === 'total' ? 1 : 0));
      all.sort((a, b) => rank(a) - rank(b) || b.s - a.s);
      if (!all.length) return { found: false, ...(where ? { searched_in: where } : {}), message: 'لم أجد هذه القيمة في مصادر PDF المحفوظة — غير متاحة في المصدر.' };
      return { found: true, ...(byLocation ? { matched_by: 'location_only', searched_in: where } : {}), matches: all.slice(0, 8).map(x => pub(x.v, x.data)), note: 'القيم بحالة «تقدير بصري» أو «متعارض» لا تُستخدم كأرقام مؤكدة.' };
    },
  },
  pdf_get_table: {
    declaration: { name: 'pdf_get_table', description: 'ترجع جدولاً من ملف PDF محفوظ كما ورد (العناوين، الصفوف، الحواشي، الصفحات) مع حالة جاهزيته.', parameters: { type: 'OBJECT', properties: { query: { type: 'STRING', description: 'عنوان الجدول أو كلمات منه، أو معرّفه' } }, required: ['query'] } },
    run: async ({ query }) => {
      const ts = toks(query); let best = null;
      for (const data of await sources()) for (const ds of data.datasets) {
        const t = data.tables.find(x => x.id === ds.table_id);
        const hay = nz([ds.title, ds.dimensions.join(' '), ds.measures.map(m => m.name).join(' '), ds.id].join(' '));
        const s = ts.filter(k => hay.includes(k)).length + (query.includes(ds.id) ? 5 : 0);
        if (!best || s > best.s) best = { s, ds, t, data };
      }
      if (!best || !best.s) return { found: false, message: 'لا يوجد جدول بهذا الوصف في المصادر المحفوظة.' };
      const { ds, t, data } = best; const rd = data.readiness.find(r => r.dataset === ds.id);
      return { found: true, dataset: ds.id, title: ds.title, pages: ds.pages, document: data.meta.file_name, version_id: data.meta.version_id, readiness: rd?.state, readiness_note: rd?.reason,
        columns: t?.columns?.map(c => c.name), notes: t?.notes || [], rows: ds.rows.slice(0, 60).map(r => ({ row: r.row, kind: r.kind, page: r.page, ...r.dims, ...Object.fromEntries(Object.entries(r.cells).map(([k, c]) => [k, c.raw])) })), total_rows: ds.rows.length };
    },
  },
  pdf_metric: {
    declaration: { name: 'pdf_metric', description: 'تحسب مؤشراً بالكود من جدول PDF محفوظ ومتحقق منه (مجموع/متوسط/عدد/أعلى/أقل)، مع تجميع اختياري وفلاتر على الأبعاد الموجودة فعلاً. ترجع القيمة والمعادلة والصفحات والسجلات المستخدمة. لو البُعد أو التفصيل غير موجود في الجدول ترجع available=false — قولي إنه غير متاح في المصدر ولا تستنتجيه من الإجماليات.', parameters: { type: 'OBJECT', properties: {
      dataset: { type: 'STRING', description: 'معرّف المجموعة (مثل pdf-xxxx@v1#ds01) أو عنوان الجدول' }, measure: { type: 'STRING', description: 'اسم العمود الرقمي' },
      agg: { type: 'STRING', enum: ['sum', 'avg', 'count', 'max', 'min'] }, group_by: { type: 'STRING', description: 'بُعد للتجميع (اختياري)' },
      filters: { type: 'ARRAY', items: { type: 'OBJECT', properties: { column: { type: 'STRING' }, value: { type: 'STRING' } } } } }, required: ['dataset'] } },
    run: async ({ dataset, measure, agg = 'sum', group_by, filters = [] } = {}) => {
      let hit = null;
      for (const data of await sources()) for (const ds of data.datasets) {
        if (ds.id === dataset || nz(ds.title).includes(nz(dataset)) || nz(dataset).includes(nz(ds.title))) { hit = { ds, data }; break; }
      }
      if (!hit) return { available: false, message: `لا يوجد جدول «${dataset}» في المصادر المحفوظة.` };
      const { ds, data } = hit;
      const rd = data.readiness.find(r => r.dataset === ds.id);
      if (rd?.state === 'blocked') return { available: false, message: `الجدول «${ds.title}» محجوب: ${rd.reason}. ما أقدر أحسب منه رقماً مؤكداً.`, checks: rd.blocking_checks };
      const m = measure ? ds.measures.find(x => nz(x.name) === nz(measure) || nz(x.name).includes(nz(measure)) || nz(measure).includes(nz(x.name))) : null;
      if (measure && !m) return { available: false, message: `العمود «${measure}» غير موجود. الأعمدة الرقمية المتاحة: ${ds.measures.map(x => x.name).join('، ')}` };
      const dimOf = name => ds.dimensions.find(d => nz(d) === nz(name) || nz(d).includes(nz(name)) || nz(name).includes(nz(d)));
      for (const f of filters) if (!dimOf(f.column)) return { available: false, message: `التفصيل حسب «${f.column}» غير متاح في المصدر. الأبعاد الموجودة في الجدول: ${ds.dimensions.join('، ') || 'لا يوجد'}. لن أستنتجه من الإجماليات.` };
      if (group_by && !dimOf(group_by)) return { available: false, message: `التجميع حسب «${group_by}» غير متاح في المصدر. الأبعاد الموجودة: ${ds.dimensions.join('، ') || 'لا يوجد'}.` };
      const byId = new Map(data.values.map(v => [v.id, v]));
      let rows = ds.rows.filter(r => r.kind === 'detail');
      for (const f of filters) { const d = dimOf(f.column); rows = rows.filter(r => nz(r.dims[d]) === nz(f.value) || nz(r.dims[d]).includes(nz(f.value))); }
      if (filters.length && !rows.length) return { available: false, message: `لا توجد صفوف تطابق ${filters.map(f => `${f.column} = ${f.value}`).join('، ')} في الجدول.` };
      const cellsOf = rs => rs.map(r => (m ? r.cells[m.name] : null)).filter(c => c && c.value != null && usable(byId.get(c.record)));
      const excluded = m ? rows.filter(r => r.cells[m.name] && r.cells[m.name].value != null && !usable(byId.get(r.cells[m.name].record))).map(r => r.cells[m.name].record) : [];
      const compute = cs => agg === 'count' ? (m ? cs.length : rows.length) : !cs.length ? null : agg === 'avg' ? cs.reduce((a, c) => a + c.value, 0) / cs.length : agg === 'max' ? Math.max(...cs.map(c => c.value)) : agg === 'min' ? Math.min(...cs.map(c => c.value)) : cs.reduce((a, c) => a + c.value, 0);
      const r6 = x => (x == null ? null : +x.toFixed(6));
      const formula = `${agg.toUpperCase()}(${m?.name || '*'}) WHERE row_kind=detail${filters.length ? ' AND ' + filters.map(f => `${dimOf(f.column)}=${f.value}`).join(' AND ') : ''}${group_by ? ` GROUP BY ${dimOf(group_by)}` : ''}`;
      const base = { available: true, document: data.meta.file_name, version_id: data.meta.version_id, dataset: ds.id, table: ds.title, pages: ds.pages, measure: m?.name || null, unit: m?.unit || null,
        formula, verification_state: rd?.state, excluded_records: excluded, excluded_note: excluded.length ? `${excluded.length} قيمة مستبعدة (تقدير أو تعارض)` : '' };
      if (group_by) {
        const g = dimOf(group_by), groups = new Map();
        for (const r of rows) { const k = r.dims[g] || 'غير محدد'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
        return { ...base, groups: [...groups].map(([k, rs]) => ({ key: k, value: r6(compute(cellsOf(rs))), records: cellsOf(rs).map(c => c.record) })).sort((a, b) => (b.value ?? 0) - (a.value ?? 0)) };
      }
      const cs = cellsOf(rows), value = r6(compute(cs));
      const total = m && !filters.length && agg === 'sum' ? ds.rows.find(r => r.kind === 'total')?.cells[m.name] : null;
      return { ...base, value, records: cs.map(c => c.record), rows_used: cs.length,
        printed_total: total ? total.raw : null, matches_printed_total: total ? Math.abs(total.value - value) < 1e-6 || data.checks.some(c => c.type === 'total' && c.result === 'pass' && c.id.includes(m.name)) : null };
    },
  },
  pdf_trace: {
    declaration: { name: 'pdf_trace', description: 'تتبع رقم (بمعرّف السجل) إلى موضعه في ملف PDF: الصفحة، الجدول/الفقرة، النص الأصلي، طريقة الاستخراج والتحويل وحالة التحقق، وروابط الأصل والحزمة في Drive.', parameters: { type: 'OBJECT', properties: { record_id: { type: 'STRING' } }, required: ['record_id'] } },
    run: async ({ record_id }) => {
      const vid = String(record_id).split('#')[0];
      const data = await getData(vid);
      const v = data?.values.find(x => x.id === record_id);
      if (!v) return { found: false, message: 'معرّف السجل غير موجود.' };
      const ix = await getIndex(); const [docId, vn] = vid.split('@v');
      const ver = ix.documents[docId]?.versions.find(x => x.n === +vn);
      return { found: true, record_id, page: v.source.page, printed_page: v.source.printed_page, bbox: v.source.bbox?.length ? v.source.bbox : null,
        ...(!v.source.bbox?.length && v.source.table_id ? (() => { const t = data.tables.find(x => x.id === v.source.table_id); const part = t?.parts?.find(p => p.page === v.source.page); return part?.bbox?.length ? { table_bbox: part.bbox, bbox_note: 'موضع الخلية غير متاح من المحرك؛ هذا موضع الجدول في الصفحة (0–1000)' } : {}; })() : {}),
        location: where(v, data), raw: v.raw, value: v.value, kind: v.kind, unit: v.unit,
        context: v.context || null, dims: v.dims, extraction: v.extraction, verification: v.verification.map(x => VER_AR[x] || x), usable_for_metrics: usable(v),
        document: data.meta.file_name, version_id: vid, sha256: ver?.sha256 || null,
        links: { original_pdf: ver?.original?.url || null, folder: data.meta.drive?.folder || null, lineage: data.meta.drive?.files?.['lineage.jsonl']?.url || null } };
    },
  },
};

// مصدر للفهرس الهجين الحالي (retrieval.js): نصوص الصفحات من الحزمة، بدون إعادة تحليل
export async function searchSources() {
  const out = [];
  for (const d of await currentVersions()) {
    const data = await getData(d.current.version_id); if (!data?.blocks?.length) continue;
    const byPage = new Map();
    for (const b of data.blocks) { if (!byPage.has(b.page)) byPage.set(b.page, []); byPage.get(b.page).push(b.text); }
    const chunks = [...byPage].map(([p, ts]) => ({ text: ts.join('\n').slice(0, 4000), section: `ص${p}`, page: String(p), line_from: null, line_to: null }));
    out.push({ src: `pdf:${d.current.version_id}`, title: d.file_name, hash: d.current.version_id + ':' + data.meta.processed_at, chunks });
  }
  return out;
}
