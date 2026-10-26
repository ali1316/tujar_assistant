// مكتبة المعرفة: تستقبل حزم «fawaz-data-intake» (ملف .dk.json لكل ملف بيانات) وتخلّي نورة تبحث بالفهرس أولاً
// الحزمة فيها: العنوان/الغرض/الملخص/الأعمدة/ملاحظات الجودة + الجداول المنظّفة (CSV) + أقسام المستندات.
// الجداول تتحوّل لنفس جداول الشارتات (data_chart/query_data) عشان الرسم يبقى فوري.
import { kvGet, kvSet, datasetAdd, datasetsRecent } from './store.js';
import { parseWorkbook, profile } from './datasets.js';
import { snapshotSoon } from './persist.js';
import { db } from './db.js';
import { ensureIndex, hybridSearch, cite, invalidateIndex, confidence } from './retrieval.js';

const KEY = 'knowledge';
let cache = null;
export async function kList() { if (!cache) cache = (await kvGet(KEY)) || { entries: [] }; return cache.entries; }
async function save(entries) { cache = { entries }; await kvSet(KEY, cache); snapshotSoon(); }

const nz = x => String(x ?? '').toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[ً-ْـ]/g, '').replace(/[_\-()]+/g, ' ').replace(/\s+/g, ' ').trim();
const STOP = new Set('في من على الى عن مع او و ثم لا ما هذا هذه كل كم وش ايش عطيني وريني ابي ابغى اعرضي اعرض قولي حسب عن الملف'.split(' '));
const tokens = q => nz(q).split(' ').filter(t => t.length > 1 && !STOP.has(t)).map(t => (t.length > 4 && t.startsWith('ال') ? t.slice(2) : t));

// استيراد حزمة (idempotent بالـ SHA-256: نفس الحزمة مرتين = لا شيء جديد)
export async function importBundle(b) {
  if (b?.format !== 'fawaz-dk-bundle/1' || !/^ds-[0-9a-f]{8}$/.test(b.id || '')) throw new Error('حزمة غير صالحة (المتوقع fawaz-dk-bundle/1)');
  const entries = await kList();
  const old = entries.find(e => e.id === b.id);
  if (old && old.sha256 === b.sha256 && old.pipeline === b.pipeline) return { status: 'unchanged', id: b.id, dataset_ids: old.dataset_ids };
  const recent = await datasetsRecent(200);
  const dataset_ids = [];
  for (const t of b.tables || []) {
    const [s] = parseWorkbook(Buffer.from(t.csv || '', 'utf8'), `${t.sheet}.csv`);
    if (!s) continue;
    // لو نفس الجدول موجود (ملف مرفوع سابقاً بنفس الأعمدة وعدد الصفوف) نربطه بدل ما نكرره
    const same = recent.find(d => d.sheet === t.sheet && d.rows.length === s.rows.length && d.columns.join('|') === s.columns.join('|'));
    dataset_ids.push(same ? same.id : await datasetAdd({ doc_id: null, doc_name: b.title, sheet: t.sheet, columns: s.columns, rows: s.rows, profile: profile(s.columns, s.rows) }));
  }
  const entry = {
    id: b.id, title: b.title, kind: b.kind, status: b.status, sha256: b.sha256, version: b.version, pipeline: b.pipeline, source_file: b.source_file,
    purpose: b.purpose, summary: b.summary, keywords: b.keywords || [], columns: b.columns || [], values: (b.values || []).slice(0, 60),
    quality_pending: b.quality_pending || [], quality_changes: b.quality_changes || [], drive_folder: b.drive_folder || null,
    sections: (b.sections || []).map(s => ({ n: s.n, heading: s.heading, text: String(s.text || '').slice(0, 6000) })),
    dataset_ids, imported_at: new Date().toISOString(),
  };
  await save([...entries.filter(e => e.id !== b.id), entry]);
  invalidateIndex(); ensureIndex().catch(e => console.warn('[rag]', e.message));
  console.log(`[knowledge] ${old ? 'updated' : 'imported'} ${b.id} «${b.title}» tables=${dataset_ids.join(',') || '-'} sections=${entry.sections.length}`);
  return { status: old ? 'updated' : 'imported', id: b.id, title: b.title, dataset_ids, sections: entry.sections.length };
}

function score(e, toks) {
  const title = nz(e.title), kw = nz(e.keywords.join(' ') + ' ' + e.purpose + ' ' + e.summary), cols = e.columns.map(nz), vals = e.values.map(nz);
  let s = 0;
  for (const t of toks) {
    if (title.includes(t)) s += 3;
    if (kw.includes(t)) s += 2;
    if (cols.some(c => c.includes(t))) s += 2;
    if (vals.some(v => v.includes(t))) s += 1;
  }
  return s;
}

// ملاحظة جودة مختصرة لجدول معيّن (تنضاف لنتيجة الشارت عشان نورة تذكرها)
export async function qualityNote(datasetId) {
  const e = (await kList()).find(x => x.dataset_ids.includes(datasetId));
  if (!e) return null;
  return { source: `${e.id} «${e.title}»`, status: e.status, pending: e.quality_pending.slice(0, 3) };
}

export async function knowledgeCatalog() {
  const list = await kList();
  if (!list.length) return '';
  return list.map(e => `• ${e.id} «${e.title}» (${e.kind === 'document' ? `مستند، ${e.sections.length} قسم` : `جداول ${e.dataset_ids.map(i => '#' + i).join('، ')} — الأعمدة: ${e.columns.join('، ')}`})${e.quality_pending.length ? ' ⚠️ فيه حالات معلّقة' : ''}${e.status && !/كاملة/.test(e.status) ? ` — ${e.status}` : ''}`).join('\n');
}

export const knowledgeTools = {
  find_knowledge: {
    declaration: {
      name: 'find_knowledge',
      description: 'تبحث في مكتبة المعرفة (الملفات المنظّمة والمحفوظة في Drive Data-Knowledge) بالفهرس أولاً: ترجع الملف المناسب وغرضه وملخصه وملاحظات الجودة وأرقام جداوله للشارت، وللمستندات ترجع الأقسام المطابقة للسؤال فقط. استخدميها لأي سؤال عن محتوى مستند أو دراسة أو تقرير محفوظ، أو لما ما تعرفين أي ملف فيه البيانات.',
      parameters: { type: 'OBJECT', properties: { question: { type: 'STRING', description: 'سؤال المستخدم أو كلماته المفتاحية' }, id: { type: 'STRING', description: 'رقم الملف ds-xxxxxxxx لو معروف (اختياري)' } }, required: ['question'] },
    },
    run: async ({ question = '', id } = {}) => {
      // البحث الهجين على كل المصادر (مكتبة المعرفة + الملفات المرفوعة) مع استشهاد بالمصدر
      try {
        await ensureIndex();
        const { hits } = await hybridSearch(question || id || '', { k: 6, prefix: id ? `kn:${id}` : null });
        if (hits.length) {
          const list = await kList(), groups = new Map();
          for (const h of hits) { if (!groups.has(h.src)) groups.set(h.src, []); groups.get(h.src).push(h); }
          const results = [...groups].slice(0, 2).map(([src, hs]) => {
            const e = list.find(x => `kn:${x.id}` === src);
            const doc = e ? null : db.prepare('SELECT id, name, summary FROM documents WHERE id=?').get(+src.split(':')[1]);
            return {
              id: e?.id || src, title: e?.title || doc?.name || hs[0].title, status: e?.status || 'ملف مرفوع', purpose: e?.purpose || '', summary: e?.summary || doc?.summary || '',
              ...(e?.dataset_ids?.length ? { dataset_ids: e.dataset_ids, columns: e.columns } : {}),
              sections: hs.filter(h => h.section !== 'دليل الملف').slice(0, 2).map(h => ({ section: h.section, text: h.text.slice(0, 1800), cite: `[${h.n}] ${cite(h)}` })),
              quality_pending: e?.quality_pending || [], source_file: e?.source_file || doc?.name || '',
            };
          });
          const cf = confidence(hits);
          const low = cf.level !== 'high' ? { confidence: 'low', answer_found: false, note: 'أقرب المقاطع ما تطابق السؤال بثقة كافية. قولي لفواز بوضوح إن الجواب مو موجود في ملفاته (واذكري أقرب ملف لو يفيد)، ولا تخمّنين ولا تجيبين رقم من برّا الملفات.' } : { confidence: 'high' };
          return { ...low, results, citations: hits.map(h => ({ n: h.n, source: cite(h) })) };
        }
      } catch (err) { console.warn('[rag] hybrid failed, legacy fallback:', err.message); }
      return legacyFind({ question, id });
    },
  },
};

// البحث القديم (كلمات فقط على مكتبة المعرفة) — يبقى احتياطاً ولقياس الفرق
export async function legacyFind({ question = '', id } = {}) {
  {
    {
      const list = await kList();
      if (!list.length) return { results: [], note: 'مكتبة المعرفة فاضية' };
      const toks = tokens(question);
      const ranked = (id ? list.filter(e => e.id === id) : list).map(e => ({ e, s: score(e, toks) })).filter(x => id || x.s > 0).sort((a, b) => b.s - a.s).slice(0, 2);
      return {
        results: ranked.map(({ e }) => {
          const secs = e.sections.map(s => ({ s, sc: toks.reduce((a, t) => a + (nz(s.heading).includes(t) ? 3 : 0) + (nz(s.text).includes(t) ? 1 : 0), 0) }))
            .filter(x => x.sc > 0).sort((a, b) => b.sc - a.sc).slice(0, 2).map(x => ({ section: `${x.s.n}. ${x.s.heading}`, text: x.s.text.slice(0, 1800) }));
          return {
            id: e.id, title: e.title, status: e.status, purpose: e.purpose, summary: e.summary,
            ...(e.dataset_ids.length ? { dataset_ids: e.dataset_ids, columns: e.columns } : {}),
            ...(e.sections.length ? { sections: secs.length ? secs : e.sections.map(s => `${s.n}. ${s.heading}`) } : {}),
            quality_pending: e.quality_pending, source_file: e.source_file,
          };
        }),
      };
    }
  }
}
