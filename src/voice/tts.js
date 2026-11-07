import { ai } from '../ai.js';
import { elevenReady, streamTTS } from '../../eleven.js';
import { TTS_MODEL, NORA_VOICES, MY_VOICE_ID } from '../config.js';

// صوت فواز / نورة: نص → Gemini TTS (صوت مستنسخ) → PCM 24kHz يتبث للمتصفح أول بأول
export async function handleSpeak(req, res) {
  const text = String(req.body?.text || '').trim().slice(0, 1500);
  const voice = NORA_VOICES.includes(req.body?.voice) ? req.body.voice : MY_VOICE_ID;
  if (!text) return res.status(400).json({ error: 'نص فاضي' });

  try {
    const stream = await ai.interactions.create({
      model: TTS_MODEL,
      input: text,
      response_format: { type: 'audio' },
      generation_config: { speech_config: [{ voice }] },
      stream: true,
    });

    res.setHeader('Content-Type', 'audio/l16; rate=24000; channels=1');
    let sent = 0;
    for await (const ev of stream) {
      if (ev.event_type === 'step.delta' && ev.delta?.type === 'audio' && ev.delta.data) {
        const buf = Buffer.from(ev.delta.data, 'base64');
        res.write(buf);
        sent += buf.length;
      } else if (ev.event_type === 'error') {
        console.error('[speak] stream error', JSON.stringify(ev).slice(0, 300));
      }
    }
    console.log(`[speak] ${text.length} chars → ${(sent / 48000).toFixed(1)}s audio`);
    res.end();
  } catch (e) {
    console.error('[speak] error:', e.message);
    if (!res.headersSent) res.status(500).json({ error: e.message });
    else res.end();
  }
}

// صوت جداوي / فواز عبر ElevenLabs: نص جملة → ElevenLabs v4 Turbo → PCM 24kHz بنفس عقد /api/speak
export async function handleSpeakEleven(req, res) {
  const text = String(req.body?.text || '').trim().slice(0, 1500);
  if (!text) return res.status(400).json({ error: 'نص فاضي' });
  if (!elevenReady()) {
    return res.status(500).json({ error: 'ELEVENLABS_API_KEY غير مضبوط في Render — صوت جداوي يحتاجه' });
  }

  await streamTTS(text, res, { persona: req.body?.persona === 'fawaz' ? 'fawaz' : 'jeddawi' });
}
