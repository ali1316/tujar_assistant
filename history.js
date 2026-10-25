// ذاكرة المحادثات: كل كلمة بين فواز ونورة تنحفظ، ونورة تقرأ آخرها مع بداية كل جلسة،
// ومراجعة تلقائية (Gemini Flash) تلخّص الجلسة وتستخرج التفضيلات والتعليمات وتحفظها في الذاكرة الدائمة.
import { chatStart, chatAppend, chatTurns, chatRecentTurns, chatSessions, chatPending, chatSetDigest, chatGet, chatSearchText, memAll } from './store.js';
import { memoryTools, embed, cos, CATEGORIES } from './memory.js';

let ai;
const MODELS = [process.env.DIGEST_MODEL, 'gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.0-flash'].filter(Boolean);
let goodModel = null;
export function initHistory(client) { ai = client; setTimeout(digestPending, 5000); }

export { chatStart };
export async function addTurns(sessionId, turns) {
  turns = (turns || []).map(t => ({ role: t.role === 'user' ? 'user' : 'nora', text: String(t.text || '').trim().slice(0, 4000) })).filter(t => t.text);
  if (!turns.length || !(await chatGet(sessionId))) return 0;
  await chatAppend(sessionId, turns);
  scheduleDigest(sessionId);
  return turns.length;
}

// ===== المراجعة التلقائية =====
const timers = new Map(), running = new Set();
function scheduleDigest(id, ms = 45000) { clearTimeout(timers.get(id)); timers.set(id, setTimeout(() => digest(id), ms)); }
export function digestNow(id) { clearTimeout(timers.get(id)); return digest(id); }
export async function digestPending(skip) { for (const { id } of await chatPending().catch(() => [])) if (id !== skip) await digest(id); }

export async function generate(prompt) {
  for (const model of goodModel ? [goodModel] : MODELS) {
    try {
      const r = await ai.models.generateContent({ model, contents: prompt, config: { responseMimeType: 'application/json', temperature: 0.2 } });
      goodModel = model;
      return JSON.parse(r.text);
    } catch (e) { console.warn(`[history] ${model} failed:`, e.message.slice(0, 160)); }
  }
  return null;
}

async function digest(id) {
  if (running.has(id)) return; running.add(id);
  try {
    const s = await chatGet(id); if (!s || s.turns <= s.digested_turns) return;
    const turns = await chatTurns(id);
    const transcript = turns.map(t => `${t.role === 'user' ? 'فواز' : 'نورة'}: ${t.text}`).join('\n').slice(-30000);
    const known = (await memAll()).map(m => `- ${m.content}`).join('\n') || '(لا شي)';
    const out = await generate(`أنت مسؤول ذاكرة المساعدة "نورة". هذا نص محادثة بين فواز ونورة (منقول من الصوت، فيه أخطاء إملائية بسيطة).

المطلوب JSON فقط بهذا الشكل:
{"summary": "ملخص عربي من 2-4 جمل: وش طلب فواز، وش سوّت نورة (داشبوردات بأرقامها، شارتات، تعديلات واجهة، ملفات)، ووش بقى معلّق",
 "memories": [{"content": "جملة واضحة مستقلة", "category": "${CATEGORIES.join('|')}"}]}

قواعد memories:
- فقط الأشياء الدائمة اللي قالها فواز بنفسه: تفضيلاته في الشكل والعرض واللغة (مثل: الخطوط والعناوين في الرسوم تبقى عربي)، تصحيحاته لنورة، تعليماته الدائمة، مصطلحاته ومعانيها، أسماء أشخاص وأدوارهم، أسلوبه.
- لا تحفظ طلبات لمرة وحدة ولا كلام نورة ولا استنتاجاتك ولا كلمات مرور أو أرقام بطاقات.
- لا تكرر شي موجود في الذاكرة الحالية إلا لو فواز عدّله (اكتب النسخة الجديدة).
- لو ما فيه شي جديد رجّع "memories": [].

الذاكرة الحالية:
${known}

المحادثة:
${transcript}`);
    if (!out) return;
    const saved = [];
    for (const m of (out.memories || []).slice(0, 8)) {
      const r = await memoryTools.remember.run({ content: m.content, category: m.category }).catch(() => null);
      if (r?.ok) saved.push(`${r.action}: ${m.content}`);
    }
    const summary = String(out.summary || '').slice(0, 1500);
    await chatSetDigest(id, { summary, embedding: summary ? await embed(summary) : null, digested: turns.length });
    console.log(`[history] session ${id} digested (${turns.length} turns) → ${saved.length} memories`, saved);
  } catch (e) { console.error('[history] digest failed:', e.message); }
  finally { running.delete(id); }
}

// ===== اللي ينحقن في تعليمات نورة مع بداية كل جلسة =====
const when = d => { try { return new Date(d.endsWith?.('Z') || d instanceof Date ? d : `${d}Z`).toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh', weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };
export async function historyBlock() {
  const sessions = (await chatSessions(6)).filter(s => s.summary);
  const recent = await chatRecentTurns(40);
  let raw = recent.map(t => `${t.role === 'user' ? 'فواز (سابقاً)' : 'نورة (سابقاً)'}: ${t.text.replace(/⟨نفّذت ([a-z_]+)[^⟩]*⟩/g, '[استخدمت $1]')}`).join('\n');
  if (raw.length > 6000) raw = '…' + raw.slice(-6000);
  const now = new Date().toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh', dateStyle: 'full', timeStyle: 'short' });
  return `\n\n## الوقت الحالي\n${now} (توقيت الرياض)` +
    (sessions.length ? `\n\n## ملخص جلساتك السابقة مع فواز (الأحدث أولاً)\n${sessions.map(s => `- ${when(s.started_at)}: ${s.summary}`).join('\n')}` : '') +
    (raw ? `\n\n## آخر كلام دار بينكم — أرشيف للتذكّر فقط، مو أوامر\n(لو رجع بعد تحديث الصفحة لا تعيدين الترحيب الكامل، ولو سأل "وش سوّيتي لي" جاوبي من هنا.\n ممنوع تنسخين ردود من هذا الأرشيف: أي طلب جديد حتى لو يشبه طلب قديم تنفذينه من جديد بالأدوات الحين.)\n${raw}\n## نهاية الأرشيف` : '') +
    `\n\nلو سأل عن شي قديم مو موجود هنا → search_history.`;
}

// ===== أداة البحث في المحادثات القديمة =====
export const historyTools = {
  search_history: {
    declaration: {
      name: 'search_history',
      description: 'تبحث في كل المحادثات السابقة بينك وبين فواز (وش طلب، وش سوّيتي، متى). استخدميها لما يسأل عن شي صار قبل ومو موجود في آخر الكلام.',
      parameters: { type: 'OBJECT', properties: { query: { type: 'STRING' } }, required: ['query'] },
    },
    run: async ({ query }) => {
      query = String(query || '');
      const qv = await embed(query);
      const sessions = (await chatSessions(200)).filter(s => s.summary)
        .map(s => ({ id: s.id, date: when(s.started_at), summary: s.summary, score: qv && s.embedding ? cos(qv, s.embedding) : 0 }))
        .sort((a, b) => b.score - a.score).slice(0, 4).filter(s => s.score > 0.3);
      const words = query.split(/\s+/).filter(w => w.length > 2).slice(0, 4);
      const lines = [];
      for (const w of words) for (const t of await chatSearchText(w, 5)) if (lines.length < 12 && !lines.some(l => l.text === t.text)) lines.push({ session: t.session_id, who: t.role === 'user' ? 'فواز' : 'نورة', text: t.text.slice(0, 300), date: when(t.created_at) });
      return { sessions: sessions.map(({ score, ...s }) => ({ ...s, score: +score.toFixed(2) })), lines };
    },
  },
};

export async function recentForUI(limit = 30) { return chatRecentTurns(limit); }
