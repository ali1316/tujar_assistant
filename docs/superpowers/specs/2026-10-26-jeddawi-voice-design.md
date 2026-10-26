# Third assistant «جداوي» — Gemini brain + ElevenLabs v4 Turbo voice

Date: 2026-10-26 · Approved by Fawaz in chat («ايوة»).

## Intent
A third assistant in the selector: نورة / فواز / جداوي. جداوي is male, Jeddawi dialect, voice `yXEnnEln9armDCyhkXcA` (Jeddawi Echo, ElevenLabs library) spoken with model `eleven_v4_turbo`. Listening, understanding and tools stay Gemini Live (same memory and tools as Nora).

## Why not the existing ElevenLabs engine
Eleven Realtime client secrets only accept `eleven_realtime_v1_mini|max`; no TTS model field. v4 Turbo is a TTS model, so it is used as the voice of a Gemini session.

## Design
- Server `eleven.js`: `ttsRequest({ text, voice, model }) -> { url, init }` for `POST /v1/text-to-speech/{voice}/stream?output_format=pcm_24000` with body `{ text, model_id }`. Defaults: `JEDDAWI_VOICE` = `yXEnnEln9armDCyhkXcA`, `JEDDAWI_TTS_MODEL` = `eleven_v4_turbo`.
- Server route `POST /api/speak/eleven` (behind access code): streams raw PCM 24 kHz back (`audio/l16; rate=24000`), same contract as `/api/speak`. Errors → JSON `{error}` with ElevenLabs status.
- Server `/api/session?persona=jeddawi`: prepends an identity block (name جداوي, male, Jeddawi dialect, Nora's memory is his).
- Client: `PERSONA.jeddawi = { name: 'جداوي', fem: false }`; selector option `jeddawi`; `makeAgent('jeddawi')` = `GeminiLiveAgent` with `speakUrl: '/api/speak/eleven'`, `persona: 'jeddawi'`, started in mode `mine` (existing path: transcription → sentences → TTS, Gemini audio ignored). Voice menu shows the single Jeddawi voice.
- Errors: TTS failure → `error` event → status line; text still logged.

## Out of scope
Choosing other ElevenLabs voices for جداوي; ElevenAgents engine.

## Testing
Unit: `ttsRequest` URL/body; `personaBlock('jeddawi')`. UI: selector has «المساعد: جداوي», masculine strings, agent is Gemini in `mine` mode with the eleven speak URL and persona. Live: one real sentence plays on production.
