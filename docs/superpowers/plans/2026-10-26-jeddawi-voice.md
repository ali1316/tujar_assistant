# Jeddawi Voice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** Third assistant جداوي (Gemini Live + ElevenLabs `eleven_v4_turbo`, voice `yXEnnEln9armDCyhkXcA`).
**Spec:** `docs/superpowers/specs/2026-10-26-jeddawi-voice-design.md`

## Global Constraints
- Keys stay on the server; voice id and model overridable by env `JEDDAWI_VOICE`, `JEDDAWI_TTS_MODEL`.
- Nora and فواز behaviour unchanged.

## Review Focus
1. Engine switch جداوي → نورة must not leave `mine` mode active (Nora would go silent) — UI check `switching back restores live mode`.
2. Interrupting جداوي mid-sentence stops the TTS stream (existing `#stopPlayback` aborts fetches) — reviewer check.
3. Missing ELEVENLABS key → clear error, not a hang — unit test `speak route without key`.

### Task 1: Server TTS + persona
**Files:** `eleven.js`, `server.js`, `test/integrity.test.mjs` (jeddawi section)
**Produces:** `ttsRequest({text, voice, model}) -> {url, init}`, `JEDDAWI = {voice, model}` (eleven.js); `personaBlock(persona) -> string` (server-side helper in `personas.js`); route `POST /api/speak/eleven`.
- [ ] Failing tests: url ends `/v1/text-to-speech/yXEnnEln9armDCyhkXcA/stream?output_format=pcm_24000`, body `model_id === 'eleven_v4_turbo'`, header `xi-api-key`; `personaBlock('jeddawi')` includes «جداوي» and «مذكر»; `personaBlock('x') === ''`.
- [ ] Implement; tests pass; commit `feat(voice): ElevenLabs v4 Turbo TTS route and جداوي persona`.

### Task 2: Client engine
**Files:** `index.html`, `gemini-live-agent.js` (accept `persona` option, add to session query), `test/ui.check.mjs`
- [ ] Failing UI checks: option «المساعد: جداوي»; persona strings masculine «جداوي»; `__nora.agent()` is Gemini with `mode==='mine'` after start args, `speakUrl==='/api/speak/eleven'`, `persona==='jeddawi'`; switching back to gemini → `speakUrl==='/api/speak'` and mode live.
- [ ] Implement; checks pass; commit `feat(ui): جداوي assistant`.

### Task 3: Review, merge, deploy, live verify
- [ ] Whole-branch review; fix Critical/Important with tests; merge; upload; verify a real sentence on production.
