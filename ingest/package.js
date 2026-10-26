// بناء حزمة الإصدار: البيانات المنظمة (CSV/JSONL) هي مصدر الحسابات؛ Excel نسخة مراجعة مولّدة منها؛ MD للسياق والبحث.
import XLSX from 'xlsx';
import { SCHEMA_VERSION, PIPELINE_VERSION, VERIFY, USABLE_FOR_METRICS, STAGE_AR } from './contracts.js';

const csvCell = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const csv = rows => '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\n') + '\n';
const jsonl = arr => arr.map(x => JSON.stringify(x)).join('\n') + (arr.length ? '\n' : '');
const PAGE_CHUNK = 20;

export function buildPackage({ meta, analysis, pages, org, val }) {
  const files = {}; // relPath (داخل مجلد الإصدار) → { data, mime }
  const put = (rel, data, mime) => { files[rel] = { data, mime }; };
  const vid = meta.version_id;

  // pages/: نص كل صفحة ومراجع عناصرها، مجمّعة كل 20 صفحة في ملف (بدل مئات الملفات)
  for (let i = 0; i < pages.length; i += PAGE_CHUNK) {
    const chunk = pages.slice(i, i + PAGE_CHUNK).map(pg => {
      const a = analysis.pages[pg.page - 1];
      return { page: pg.page, printed_page: pg.printed_page_number || null, kind: a.kind, observed_kind: pg.observed_kind, engine: pg.engine, engine_detail: pg.engine_detail,
        size: { width: a.width, height: a.height, rotation: a.rotation }, text_layer_chars: a.chars, images: a.images,
        blocks: org.blocks.filter(b => b.page === pg.page).map(b => ({ id: b.id, type: b.type, level: b.level, text: b.text, bbox: b.bbox })),
        tables: org.tables.filter(t => t.pages.includes(pg.page)).map(t => t.id), charts: org.charts.filter(c => c.page === pg.page).map(c => c.id),
        image_descriptions: (pg.images || []).map(im => ({ description: im.description, bbox: im.bbox, note: 'وصف مولّد — ليس من نص المستند' })),
        problems: pg.problems || [], text_layer: a.text_layer };
    });
    const a = i + 1, b = Math.min(pages.length, i + PAGE_CHUNK);
    put(`pages/pages-${String(a).padStart(3, '0')}-${String(b).padStart(3, '0')}.json`, JSON.stringify({ schema: SCHEMA_VERSION, version_id: vid, pages: chunk }, null, 1), 'application/json');
  }

  // tables/: تمثيل أمين (العناوين، الحواشي، الوحدات، الأجزاء عبر الصفحات) + CSV حرفي لكل جدول
  put('tables/tables.json', JSON.stringify({ schema: SCHEMA_VERSION, version_id: vid, tables: org.tables.map(t => ({
    id: t.id, title: t.title, caption: t.caption, units: t.units, notes: t.notes, header_rows: t.header_rows, columns: t.columns, row_kinds: t.row_kinds, rows: t.rows, parts: t.parts, pages: t.pages, ragged_rows: t.ragged_rows })) }, null, 1), 'application/json');
  org.tables.forEach(t => put(`tables/${t.id.split('#')[1]}.csv`, csv([t.columns.map(c => c.name + (c.unit ? ` (${c.unit})` : '')), ...t.rows]), 'text/csv'));

  // datasets/: بيانات منظمة قابلة للحساب (قيمة منظّمة + الأصل + نوع الصف + الصفحة + معرف السجل)
  const ready = new Map(val.readiness.map(r => [r.dataset, r]));
  for (const ds of org.datasets) {
    const head = ['row', 'row_kind', 'page', ...ds.dimensions, ...ds.measures.flatMap(m => [m.name, `${m.name} [raw]`, `${m.name} [record_id]`])];
    const body = ds.rows.map(r => [r.row, r.kind, r.page, ...ds.dimensions.map(d => r.dims[d]), ...ds.measures.flatMap(m => { const c = r.cells[m.name] || {}; return [c.value ?? '', c.raw ?? '', c.record ?? '']; })]);
    put(`datasets/${ds.id.split('#')[1]}.csv`, csv([head, ...body]), 'text/csv');
  }
  put('datasets/datasets.jsonl', jsonl(org.datasets.map(ds => ({ ...ds, readiness: ready.get(ds.id) }))), 'application/x-ndjson');

  // metrics.jsonl: كل قيمة قابلة للاستخدام مع أصلها وحالة تحققها
  put('metrics.jsonl', jsonl(org.values.map(v => ({ ...v, document_id: meta.document_id, version: meta.version, version_id: vid,
    usable_for_metrics: v.value != null && v.verification.some(x => USABLE_FOR_METRICS.has(x)) && !v.verification.includes(VERIFY.ESTIMATED) && !v.verification.includes(VERIFY.CONFLICT) }))), 'application/x-ndjson');

  // data_dictionary.json
  put('data_dictionary.json', JSON.stringify({ schema: SCHEMA_VERSION, version_id: vid, datasets: org.datasets.map(ds => ({
    id: ds.id, title: ds.title, source_table: ds.table_id, pages: ds.pages,
    grain: `صف لكل ${ds.dimensions[0] ? `«${ds.dimensions[0]}»` : 'سطر في الجدول'} كما ورد في الجدول؛ صفوف الإجمالي معلّمة row_kind=total ولا تُجمع مع التفاصيل`,
    columns: [
      { name: 'row_kind', type: 'enum(detail,total,subtotal,section)', meaning: 'نوع الصف' }, { name: 'page', type: 'integer', meaning: 'رقم صفحة PDF' },
      ...ds.dimensions.map(d => ({ name: d, type: 'text (dimension)', meaning: 'بُعد كما ورد في المصدر — لا دمج تلقائي للمسميات المتشابهة' })),
      ...ds.measures.map(m => ({ name: m.name, type: 'number (measure)', unit: m.unit || null, meaning: 'القيمة المنظّمة؛ النسب محفوظة كما كُتبت (12.5 = 12.5%)، والأصل في عمود [raw]' })),
    ] })) }, null, 1), 'application/json');

  put('lineage.jsonl', jsonl(org.lineage.concat(val.checks.filter(c => c.formula).map(c => ({ id: `${c.id}:check`, kind: 'compute', output: c.id, inputs: c.records || [], method: c.formula, result: c.result, detail: c.detail })))), 'application/x-ndjson');

  // quality_report
  const q = qualityReport({ meta, analysis, pages, org, val });
  put('quality_report.json', JSON.stringify(q, null, 1), 'application/json');
  put('quality_report.md', qualityMd(q), 'text/markdown');

  // dashboard_catalog: فقط ما هو متاح فعلاً
  put('dashboard_catalog.json', JSON.stringify(catalog({ meta, org, val }), null, 1), 'application/json');

  // document.md
  put('document.md', documentMd({ meta, pages, org }), 'text/markdown');

  // review.xlsx (مولّد من البيانات المنظمة — للمراجعة البشرية فقط)
  put('review.xlsx', reviewWorkbook({ meta, org, val, q }), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  return { files, quality: q };
}

export function qualityReport({ meta, analysis, pages, org, val }) {
  const kinds = {}; analysis.pages.forEach(p => { kinds[p.kind] = (kinds[p.kind] || 0) + 1; });
  const engines = {}; pages.forEach(p => { engines[p.engine] = (engines[p.engine] || 0) + 1; });
  const vcount = k => org.values.filter(v => v.verification.includes(k)).length;
  const failedPages = pages.filter(p => p.engine === 'text_layer' || p.failed).map(p => p.page);
  const st = val.readiness;
  const overall = !org.datasets.length && !org.blocks.length ? 'failed' : (failedPages.length || st.some(r => r.state === 'blocked') || org.problems.length) ? 'partial' : 'ready';
  return {
    schema: SCHEMA_VERSION, document_id: meta.document_id, version_id: meta.version_id, attempt_id: meta.attempt_id, generated_at: new Date().toISOString(), pipeline: PIPELINE_VERSION,
    status: overall, status_ar: STAGE_AR[overall],
    pages: { total: analysis.page_count, by_kind: kinds, by_engine: engines, failed_or_degraded: failedPages },
    counts: { blocks: org.blocks.length, tables: org.tables.length, multi_page_tables: org.tables.filter(t => t.pages.length > 1).length, charts: org.charts.length, values: org.values.length, datasets: org.datasets.length },
    verification: { matched_text_layer: vcount(VERIFY.TEXT_LAYER), total_reconciled: vcount(VERIFY.TOTAL_OK), vision_only: org.values.filter(v => v.value != null && !v.verification.includes(VERIFY.TEXT_LAYER) && !v.verification.includes(VERIFY.TOTAL_OK) && !v.verification.includes(VERIFY.ESTIMATED)).length,
      visual_estimates: vcount(VERIFY.ESTIMATED), conflicts: vcount(VERIFY.CONFLICT), note: 'حالات تحقق وصفية، لا نسبة ثقة رقمية. matched_text_layer = الرقم مطبوع حرفياً في طبقة نص الصفحة؛ vision_only = مقروء من صورة الصفحة فقط.' },
    datasets: st, checks: val.checks, extraction_problems: org.problems,
    rounding_policy: 'الأعداد الصحيحة غير المقرّبة يجب أن تتطابق تماماً؛ القيم العشرية أو المقرّبة (ألف/مليون) يُسمح فيها بنصف وحدة آخر خانة × عدد الحدود في المجموع. لا تعديل للمصدر لإجباره على التطابق.',
    not_extracted: [
      ...org.problems.map(p => `ص${p.page}: ${p.element} — ${p.reason}`),
      ...failedPages.map(p => `ص${p}: استُخرجت من طبقة النص فقط (بدون جداول/رسوم بنيوية)`),
    ],
  };
}

function qualityMd(q) {
  const L = [`# تقرير الجودة — ${q.document_id} (${q.version_id})`, '', `- الحالة: **${q.status_ar}**`, `- الصفحات: ${q.pages.total} (${Object.entries(q.pages.by_kind).map(([k, v]) => `${k}: ${v}`).join('، ')})`,
    `- المحركات: ${Object.entries(q.pages.by_engine).map(([k, v]) => `${k}: ${v}`).join('، ')}`,
    `- العناصر: ${q.counts.blocks} كتلة نصية، ${q.counts.tables} جدول (منها ${q.counts.multi_page_tables} ممتد عبر صفحات)، ${q.counts.charts} رسم، ${q.counts.values} قيمة`, '',
    '## التحقق', '', `| الحالة | العدد |`, `| --- | --- |`, `| مطابق لطبقة النص | ${q.verification.matched_text_layer} |`, `| مطابق للمجموع | ${q.verification.total_reconciled} |`,
    `| مقروء بصرياً فقط | ${q.verification.vision_only} |`, `| تقدير بصري من رسم (محجوب عن المؤشرات) | ${q.verification.visual_estimates} |`, `| تعارض | ${q.verification.conflicts} |`, '', q.verification.note, '',
    '## جاهزية مجموعات البيانات', '', '| المجموعة | الحالة | ملاحظة |', '| --- | --- | --- |', ...q.datasets.map(d => `| ${d.title} (${d.dataset.split('#')[1]}) | ${d.state} | ${d.reason} |`), '',
    '## الفحوص', '', '| الفحص | النتيجة | التفاصيل |', '| --- | --- | --- |', ...q.checks.map(c => `| ${c.type} | ${c.result} | ${String(c.detail).replace(/\|/g, '/')} |`), '',
    '## ما تعذّر استخراجه', '', ...(q.not_extracted.length ? q.not_extracted.map(x => `- ${x}`) : ['- لا شيء مسجّل']), '', `سياسة التقريب: ${q.rounding_policy}`];
  return L.join('\n') + '\n';
}

export function catalog({ meta, org, val }) {
  const rd = new Map(val.readiness.map(r => [r.dataset, r]));
  return {
    schema: SCHEMA_VERSION, document_id: meta.document_id, version_id: meta.version_id, source: { name: meta.file_name, report_date: meta.report_date || null, data_period: meta.data_period || null },
    datasets: org.datasets.filter(ds => ['ready', 'ready_with_notes'].includes(rd.get(ds.id)?.state) && ds.measures.length).map(ds => ({
      id: ds.id, title: ds.title, pages: ds.pages, state: rd.get(ds.id).state, measures: ds.measures, dimensions: ds.dimensions,
      filters: ds.dimensions.map(d => ({ dimension: d, values: [...new Set(ds.rows.filter(r => r.kind === 'detail').map(r => r.dims[d]).filter(Boolean))].slice(0, 200) })).filter(f => f.values.length > 1 && f.values.length <= 200),
      detail_rows: ds.rows.filter(r => r.kind === 'detail').length, has_total_row: ds.rows.some(r => r.kind === 'total'),
      metrics: ds.measures.map(m => ({ id: `${ds.id}:sum:${m.name}`, label: `مجموع ${m.name}`, formula: `SUM(${m.name}) WHERE row_kind=detail`, unit: m.unit, additive: !/نسب|%|معدل|متوسط/.test(m.name) })),
    })),
    blocked_datasets: org.datasets.filter(ds => rd.get(ds.id)?.state === 'blocked').map(ds => ({ id: ds.id, title: ds.title, reason: rd.get(ds.id).reason, checks: rd.get(ds.id).blocking_checks })),
    headline_values: org.values.filter(v => v.source.type !== 'table' && v.source.type !== 'chart' && v.value != null && v.verification.includes(VERIFY.TEXT_LAYER)).slice(0, 40)
      .map(v => ({ record: v.id, raw: v.raw, value: v.value, kind: v.kind, page: v.source.page, context: v.context })),
  };
}

function mdTable(t) {
  const head = t.columns.map(c => c.name + (c.unit ? ` (${c.unit})` : ''));
  const esc = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  return [`| ${head.map(esc).join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...t.rows.map((r, i) => `| ${r.map((c, j) => (t.row_kinds[i] === 'total' && j === 0 ? `**${esc(c)}**` : esc(c))).join(' | ')} |`)].join('\n');
}

export function documentMd({ meta, pages, org }) {
  const L = [`# ${meta.file_name.replace(/\.pdf$/i, '')}`, '', `> المصدر: ${meta.file_name} · ${meta.version_id} · ${meta.page_count} صفحة · SHA-256 ${meta.sha256.slice(0, 16)}… — هذا الملف نص المستند المنظّم كاملاً، والملخص ليس بديلاً عنه.`, ''];
  const tablesDone = new Set();
  for (const pg of pages) {
    L.push(`<!-- page ${pg.page}${pg.printed_page_number ? ` / printed ${pg.printed_page_number}` : ''} · ${pg.engine} -->`, `## صفحة ${pg.page}${pg.printed_page_number && String(pg.printed_page_number) !== String(pg.page) ? ` (المطبوعة ${pg.printed_page_number})` : ''}`, '');
    for (const b of org.blocks.filter(x => x.page === pg.page)) {
      if (b.type === 'heading') L.push(`${'#'.repeat(Math.min(6, 2 + (b.level || 1)))} ${b.text}`, '');
      else if (b.type === 'list_item') L.push(`- ${b.text}`);
      else if (b.type === 'footnote') L.push(`> حاشية: ${b.text}`, '');
      else if (b.type === 'header_footer') L.push(`<!-- ترويسة/تذييل: ${b.text.replace(/--/g, '—')} -->`);
      else if (b.type === 'formula') L.push('```', b.text, '```', '');
      else L.push(b.text, '');
    }
    for (const t of org.tables.filter(x => x.pages[0] === pg.page && !tablesDone.has(x.id))) {
      tablesDone.add(t.id);
      L.push(`### جدول ${t.id.split('#')[1]}: ${t.title || 'بدون عنوان'}`, '', `الصفحات: ${t.pages.join('، ')}${t.units ? ` · الوحدة: ${t.units}` : ''} · [CSV](tables/${t.id.split('#')[1]}.csv)`, '', mdTable(t), '', ...t.notes.map(n => `> ${n}`), '');
    }
    for (const c of org.charts.filter(x => x.page === pg.page)) {
      L.push(`### رسم: ${c.title || 'بدون عنوان'}`, '', `${c.chart_type || ''}${c.unit ? ` · الوحدة ${c.unit}` : ''}${c.period ? ` · الفترة ${c.period}` : ''}`, '', '| الفئة | السلسلة | القيمة | المصدر |', '| --- | --- | --- | --- |',
        ...c.points.map(p => `| ${p.category} | ${p.series || ''} | ${p.value_text} | ${p.value_source === 'written' ? 'مكتوبة على الرسم' : 'تقدير بصري (غير مؤكد)'} |`), '');
    }
    for (const im of pg.images || []) L.push(`> [وصف صورة — مولّد وليس من نص المستند] ${im.description}`, '');
    for (const p of pg.problems || []) L.push(`> ⚠ تعذّر: ${p.element} — ${p.reason}`, '');
  }
  return L.join('\n') + '\n';
}

function reviewWorkbook({ meta, org, val, q }) {
  const wb = XLSX.utils.book_new();
  const info = [['المستند', meta.file_name], ['المعرف', meta.document_id], ['الإصدار', meta.version_id], ['SHA-256', meta.sha256], ['الحالة', q.status_ar], ['تنبيه', 'نسخة مراجعة مولّدة من datasets/*.csv و metrics.jsonl — التعديل هنا لا يغيّر البيانات المصدرية'],
    [], ['المجموعة', 'العنوان', 'الصفحات', 'الحالة', 'ملاحظة'], ...q.datasets.map(d => [d.dataset, d.title, (org.datasets.find(x => x.id === d.dataset)?.pages || []).join('، '), d.state, d.reason])];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(info), 'README');
  const used = new Set();
  org.datasets.forEach((ds, i) => {
    let name = `${String(i + 1).padStart(2, '0')} ${ds.title || 'جدول'}`.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);
    while (used.has(name)) name = name.slice(0, 28) + '_' + i; used.add(name);
    const head = ['الصف', 'نوع الصف', 'الصفحة', ...ds.dimensions, ...ds.measures.flatMap(m => [m.name, `${m.name} (الأصل)`])];
    const rows = ds.rows.map(r => [r.row, r.kind, r.page, ...ds.dimensions.map(d => r.dims[d]), ...ds.measures.flatMap(m => [r.cells[m.name]?.value ?? null, r.cells[m.name]?.raw ?? ''])]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([head, ...rows]), name);
  });
  const vals = org.values.map(v => [v.id, v.source.type, v.source.page, v.raw, v.value, v.kind, v.unit || '', v.verification.join(' + '), v.context || '']);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['المعرف', 'المصدر', 'الصفحة', 'الأصل', 'القيمة', 'النوع', 'الوحدة', 'التحقق', 'السياق'], ...vals.slice(0, 50000)]), 'القيم');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['الفحص', 'النوع', 'النتيجة', 'الشدة', 'التفاصيل'], ...val.checks.map(c => [c.id, c.type, c.result, c.severity, c.detail])]), 'الفحوص');
  wb.Workbook = { Views: [{ RTL: true }] };
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
