// ElevenLabs Eleven Realtime — المحرك الثاني لنورة (للمقارنة مع Gemini Live)
// السيرفر يصدر «مفتاح مؤقت» (client secret) والمتصفح يتصل مباشرة بـ wss://api.elevenlabs.io/v1/convai/realtime
// نفس البروتوكول حق OpenAI Realtime: نفس الأحداث ونفس الأدوات.
const BASE = 'https://api.elevenlabs.io';
const KEY = () => process.env.ELEVENLABS_API_KEY;
export const ELEVEN_MODEL = () => process.env.ELEVEN_MODEL || 'eleven_realtime_v1_max';
export const elevenReady = () => !!KEY();

// تحويل تعريفات أدوات Gemini (OBJECT/STRING…) لصيغة JSON Schema اللي يبيها Realtime
function schema(s) {
  if (!s || typeof s !== 'object') return s;
  const o = {};
  for (const [k, v] of Object.entries(s)) {
    if (k === 'type') o.type = String(v).toLowerCase();
    else if (k === 'properties') o.properties = Object.fromEntries(Object.entries(v).map(([n, p]) => [n, schema(p)]));
    else if (k === 'items') o.items = schema(v);
    else if (['description', 'enum', 'required'].includes(k)) o[k] = v;
  }
  if (o.type === 'object' && !o.properties) o.properties = {};
  return o;
}
export const toRealtimeTools = decls => decls.map(d => ({
  type: 'function', name: d.name, description: d.description || '',
  parameters: schema(d.parameters || { type: 'OBJECT', properties: {} }),
}));

async function post(path, body) {
  const r = await fetch(BASE + path, { method: 'POST', headers: { 'xi-api-key': KEY(), 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!r.ok) { const e = new Error(`ElevenLabs ${r.status}: ${text.slice(0, 400)}`); e.status = r.status; throw e; }
  return json;
}

// مفتاح مؤقت لجلسة واحدة (١٠ دقائق للاتصال)
export async function mintSecret({ instructions, tools, voice, language = 'ar' }) {
  const model = ELEVEN_MODEL();
  const base = {
    type: 'realtime', model, instructions, output_modalities: ['audio'], tools,
    max_duration_seconds: 1800,
    audio: {
      input: { format: { type: 'audio/pcm', rate: 24000 }, turn_detection: { type: 'semantic_vad', eagerness: 'medium' } },
      output: { format: { type: 'audio/pcm', rate: 24000 }, ...(voice ? { voice } : {}) },
    },
  };
  // نحاول نحدد العربية للتعرّف على الكلام، ولو الحقل مرفوض نكمل بدونه
  const attempts = [
    { ...base, audio: { ...base.audio, input: { ...base.audio.input, transcription: { language } } } },
    base,
  ];
  let last;
  for (const session of attempts) {
    try {
      const out = await post('/v1/convai/realtime/client_secrets', { expires_after: { seconds: 600 }, session });
      return { secret: out.value || out.client_secret?.value, expires_at: out.expires_at, model, session_echo: out.session };
    } catch (e) { last = e; console.warn('[eleven] mint attempt failed:', e.message.slice(0, 300)); if (e.status && e.status !== 400 && e.status !== 422) break; }
  }
  throw last;
}

// أصوات حسابك في ElevenLabs (العربية أول، وبعدها الباقي)
let cache = { at: 0, list: [] };
export async function listVoices() {
  if (Date.now() - cache.at < 10 * 60 * 1000 && cache.list.length) return cache.list;
  const r = await fetch(`${BASE}/v2/voices?page_size=100`, { headers: { 'xi-api-key': KEY() } });
  if (!r.ok) throw new Error(`voices ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const list = ((await r.json()).voices || []).map(v => ({
    id: v.voice_id, name: v.name, category: v.category, lang: v.labels?.language || v.verified_languages?.[0]?.language || '',
    gender: v.labels?.gender || '', accent: v.labels?.accent || '', preview: v.preview_url || '',
  }));
  const score = v => (v.lang === 'ar' ? 0 : 2) + (v.gender === 'female' ? 0 : 1);
  list.sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name));
  cache = { at: Date.now(), list };
  return list;
}

// ===== جداوي: صوت ElevenLabs v4 Turbo لجلسة Gemini (العقل Gemini، والنطق هنا) =====
// Eleven Realtime ما يقبل غير eleven_realtime_v1_*، فـ v4 Turbo يُستخدم كـ TTS لنص Gemini جملة جملة
export const JEDDAWI = {
  get voice() { return process.env.JEDDAWI_VOICE || 'yXEnnEln9armDCyhkXcA'; },
  get model() { return process.env.JEDDAWI_TTS_MODEL || 'eleven_v4_turbo'; },
};
// صوت كل هوية: جداوي (مكتبة ElevenLabs) وفواز (صوته المستنسخ)
export const voiceFor = persona => persona === 'fawaz' ? (process.env.FAWAZ_VOICE || process.env.ELEVEN_VOICE || 'si9mYqRfqKHdK2kDRssy') : JEDDAWI.voice;
export function ttsRequest({ text, voice = JEDDAWI.voice, model = JEDDAWI.model }) {
  return {
    url: `${BASE}/v1/text-to-speech/${encodeURIComponent(voice)}/stream?output_format=pcm_24000`,
    init: { method: 'POST', headers: { 'xi-api-key': KEY(), 'content-type': 'application/json', accept: 'audio/pcm' }, body: JSON.stringify({ text, model_id: model }) },
  };
}

// يمرّر صوت ElevenLabs للمتصفح، ولو المتصفح قطع (مقاطعة) نوقف الطلب عند ElevenLabs فوراً
export async function streamTTS(text, res, { fetchImpl = fetch, persona = 'jeddawi' } = {}) {
  const ac = new AbortController();
  res.on('close', () => ac.abort());
  const { url, init } = ttsRequest({ text, voice: voiceFor(persona) });
  let sent = 0;
  try {
    const r = await fetchImpl(url, { ...init, signal: ac.signal });
    if (!r.ok) { const t = (await r.text()).slice(0, 300); console.error('[speak/eleven]', r.status, t); return res.status(502).json({ error: `ElevenLabs ${r.status}: ${t}` }); }
    res.setHeader('Content-Type', 'audio/l16; rate=24000; channels=1');
    for await (const chunk of r.body) { if (ac.signal.aborted) break; res.write(chunk); sent += chunk.length; }
    console.log(`[speak/eleven] ${JEDDAWI.model} ${text.length} chars → ${(sent / 48000).toFixed(1)}s${ac.signal.aborted ? ' (قوطع)' : ''}`);
  } catch (e) {
    if (e.name === 'AbortError' || ac.signal.aborted) return;
    console.error('[speak/eleven] error:', e.message);
    if (!res.headersSent) return res.status(500).json({ error: e.message });
  } finally { if (!ac.signal.aborted) res.end(); }
}
