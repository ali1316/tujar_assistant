// ذاكرة نورة (RAG خفيف): تحفظ أسلوب فواز ومصطلحاته وتفضيلاته، وتسترجعها بالمعنى (embeddings) أو بالكلمات
import { memAll, memAdd, memUpdate, memDelete, memHit } from './store.js';

const EMBED_MODEL = process.env.EMBED_MODEL || 'gemini-embedding-2';
const DIMS = 768;
export const CATEGORIES = ['style', 'preference', 'term', 'person', 'fact', 'instruction'];
const CAT_AR = { style: 'أسلوب', preference: 'تفضيل', term: 'مصطلح', person: 'شخص', fact: 'معلومة', instruction: 'تعليمات دائمة' };

let ai;
export function initMemory(client) { ai = client; }

export async function embed(text) {
  try {
    const r = await ai.models.embedContent({ model: EMBED_MODEL, contents: text, config: { outputDimensionality: DIMS } });
    return r.embeddings?.[0]?.values || null;
  } catch (e) { console.warn('[memory] embed failed:', e.message); return null; }
}
// دفعة نصوص للفهرس: طلب لكل نص بالتوازي (8 في نفس الوقت) — مصفوفة بنفس الترتيب، والفاشل null
export async function embedMany(texts) {
  if (!ai || !texts.length) return null;
  const out = new Array(texts.length).fill(null); let next = 0;
  const worker = async () => { while (next < texts.length) { const i = next++; out[i] = await embed(texts[i]); } };
  await Promise.all(Array.from({ length: Math.min(8, texts.length) }, worker));
  return out;
}
export const cos = (a, b) => { let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return d / (Math.sqrt(x * y) || 1); };
const norm = s => s.replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').toLowerCase();
const words = s => new Set(norm(s).split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 2).map(w => (w.startsWith('ال') && w.length > 4 ? w.slice(2) : w)));
const overlap = (a, b) => { const A = words(a), B = words(b); let n = 0; A.forEach(w => B.has(w) && n++); return n / (A.size || 1); }; // نسبة كلمات السؤال الموجودة

async function rank(query, k = 5) {
  const all = await memAll();
  const q = await embed(query);
  return all
    .map(m => ({ ...m, score: q && m.embedding ? cos(q, m.embedding) : overlap(query, m.content) * 0.8 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

// ===== أدوات نورة =====
export const memoryTools = {
  remember: {
    declaration: {
      name: 'remember',
      description: 'تحفظ معلومة دائمة عن فواز: أسلوبه، مصطلحاته ومعانيها، تفضيلاته، أشخاص يذكرهم، تعليمات دائمة. استخدميها فوراً لما يقول "تذكري" أو يصحّحك أو يذكر تفضيل أو مصطلح خاص. اكتبي المعلومة كجملة واضحة مستقلة. لا تحفظين كلمات مرور أو أرقام بطاقات أو هويات.',
      parameters: {
        type: 'OBJECT',
        properties: { content: { type: 'STRING' }, category: { type: 'STRING', enum: CATEGORIES } },
        required: ['content', 'category'],
      },
    },
    run: async ({ content, category = 'fact' }) => {
      content = String(content || '').trim().slice(0, 600);
      if (!content) return { error: 'فاضي' };
      if (/\b\d{12,19}\b|password|كلمة (ال)?(مرور|سر)/i.test(content)) return { error: 'ما أحفظ أسرار أو أرقام حساسة' };
      if (!CATEGORIES.includes(category)) category = 'fact';
      const embedding = await embed(content);
      // دمج: لو فيه ذاكرة شبه مطابقة نحدّثها بدل التكرار
      const [best] = await rank(content, 1);
      if (best && best.score > (embedding ? 0.9 : 0.75)) {
        await memUpdate(best.id, { content, category, embedding });
        return { ok: true, action: 'updated', id: best.id, previous: best.content };
      }
      const id = await memAdd({ content, category, embedding });
      return { ok: true, action: 'added', id, category: CAT_AR[category] };
    },
  },
  recall: {
    declaration: {
      name: 'recall',
      description: 'تبحث في ذاكرتك عن فواز بالمعنى (مثلاً: وش يقصد بكلمة كذا، كيف يحب التقارير، مين فلان). استخدميها لما تحتاجين معلومة شخصية مو موجودة في ملخص الذاكرة.',
      parameters: { type: 'OBJECT', properties: { query: { type: 'STRING' } }, required: ['query'] },
    },
    run: async ({ query }) => {
      const hits = (await rank(String(query || ''), 5)).filter(m => m.score > 0.35);
      await memHit(hits.map(h => h.id));
      return { memories: hits.map(h => ({ id: h.id, content: h.content, category: CAT_AR[h.category], score: +h.score.toFixed(2) })) };
    },
  },
  forget: {
    declaration: {
      name: 'forget',
      description: 'تحذف معلومة من الذاكرة لما يطلب فواز ينساها. بالرقم أو بوصفها.',
      parameters: { type: 'OBJECT', properties: { id: { type: 'INTEGER' }, query: { type: 'STRING' } } },
    },
    write: true,
    run: async ({ id, query }) => {
      if (!id && query) { const [best] = await rank(query, 1); if (best && best.score > 0.5) id = best.id; }
      if (!id) return { error: 'ما لقيت المعلومة' };
      return (await memDelete(id)) ? { ok: true, deleted: id } : { error: 'غير موجودة' };
    },
  },
  list_memories: {
    declaration: { name: 'list_memories', description: 'تعرض كل اللي تتذكرينه عن فواز.', parameters: { type: 'OBJECT', properties: {} } },
    run: async () => ({ memories: (await memAll()).map(m => ({ id: m.id, content: m.content, category: CAT_AR[m.category] })) }),
  },
};

// ملخص الذاكرة اللي ينحقن في تعليمات نورة مع بداية كل جلسة
export async function memoryBlock(limit = 40) {
  const all = await memAll();
  if (!all.length) return '\n\n## ذاكرتك عن فواز\n(فاضية للحين — ابدئي تتعلمين من كلامه)';
  const order = ['instruction', 'style', 'preference', 'term', 'person', 'fact'];
  const picked = all.sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category) || b.hits - a.hits).slice(0, limit);
  return '\n\n## ذاكرتك عن فواز (طبّقيها دائماً بدون ما تذكرينها)\n' + picked.map(m => `- [${CAT_AR[m.category]}] ${m.content}`).join('\n');
}

export async function listForUI() { return (await memAll()).map(m => ({ id: m.id, content: m.content, category: CAT_AR[m.category], created_at: m.created_at })); }
