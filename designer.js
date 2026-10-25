// «المصمم»: النموذج اللي يصمم الداشبورد من تحليل الملف.
// لو فيه مفتاح Claude (ANTHROPIC_API_KEY) في إعدادات السيرفر → Claude يصمم، وإلا Gemini.
// في الحالتين: الأرقام تنحسب بالكود، وقواعد التصميم (design rules) تنطبق بالكود بعد التصميم.
import { generate } from './history.js';

const KEY = () => process.env.ANTHROPIC_API_KEY;
let model = null;

async function pickModel() {
  if (process.env.CLAUDE_MODEL) return process.env.CLAUDE_MODEL;
  if (model) return model;
  const r = await fetch('https://api.anthropic.com/v1/models?limit=50', { headers: { 'x-api-key': KEY(), 'anthropic-version': '2023-06-01' } });
  if (!r.ok) throw new Error(`models ${r.status}`);
  const ids = (await r.json()).data.map(m => m.id);
  model = ids.find(i => /sonnet/.test(i)) || ids.find(i => /opus/.test(i)) || ids[0];
  return model;
}

async function claudeJSON(prompt) {
  const m = await pickModel();
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': KEY(), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: m, max_tokens: 8000, temperature: 0.2,
      system: 'You are a senior data analyst and executive-dashboard designer. Reply with a single valid JSON object only — no prose, no code fences.',
      messages: [{ role: 'user', content: prompt }] }),
  });
  if (!r.ok) throw new Error(`messages ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const text = (await r.json()).content.map(c => c.text || '').join('');
  return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
}

export function designerName() { return KEY() ? `Claude${model ? ` (${model})` : ''}` : 'Gemini'; }

export async function designJSON(prompt) {
  if (KEY()) {
    try { const out = await claudeJSON(prompt); return { out, by: 'Claude' }; }
    catch (e) { console.warn('[designer] Claude failed, falling back to Gemini:', e.message); }
  }
  return { out: await generate(prompt), by: 'Gemini' };
}
