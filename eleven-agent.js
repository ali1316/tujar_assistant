// ElevenRealtimeAgent — نفس واجهة GeminiLiveAgent بالضبط، بس على ElevenLabs Eleven Realtime
// (بروتوكول OpenAI Realtime: session / input_audio_buffer / response / function_call_output)
export class ElevenRealtimeAgent {
  constructor({ sessionUrl = '/api/eleven/session', toolUrl = n => `/api/tools/${n}`, headers = () => ({}), clientTools = {}, on = {} } = {}) {
    Object.assign(this, { sessionUrl, toolUrl, headers, clientTools, on });
    this.voice = ''; this.playQueueEnd = 0; this.sources = new Set();
    this.calls = new Map(); // استدعاءات الأدوات في الرد الحالي
    this.engine = 'eleven';
  }
  emit(ev, ...a) { try { this.on[ev]?.(...a); } catch (e) { console.error(e); } }
  get connected() { return this.ws?.readyState === 1; }
  #send(o) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(o)); }

  async start({ mic = true, voice = this.voice } = {}) {
    this.voice = voice;
    this.emit('status', 'جاري الاتصال بـ ElevenLabs…');
    const q = new URLSearchParams(voice ? { voice } : {});
    const r = await fetch(`${this.sessionUrl}?${q}`, { headers: this.headers() });
    const s = await r.json();
    if (!r.ok || !s.secret) throw new Error(s.error || 'ElevenLabs session error');
    this.chatId = s.chatId; this.model = s.model;
    this.playCtx ??= new AudioContext({ sampleRate: 24000 });
    await this.playCtx.resume();
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(s.url, ['realtime', 'openai-insecure-api-key.' + s.secret]);
      this.ws = ws; let ready = false;
      const done = () => { if (!ready) { ready = true; resolve(); } };
      const t = setTimeout(done, 6000); // لو ما وصل session.created نكمل
      ws.onmessage = ev => {
        let m; try { m = JSON.parse(ev.data); } catch { return; }
        if (m.type === 'session.created' || m.type === 'session.updated') { clearTimeout(t); done(); }
        if (m.type === 'error' && !ready) { clearTimeout(t); return reject(new Error(m.error?.message || JSON.stringify(m.error))); }
        this.#handle(m);
      };
      ws.onerror = () => { if (!ready) reject(new Error('websocket error (ElevenLabs)')); };
      ws.onclose = ev => {
        clearTimeout(t);
        if (!ready) return reject(new Error(`ElevenLabs closed: ${ev.code} ${ev.reason}`));
        if (this.ws !== ws) return;
        this.emit('status', `انقطع اتصال ElevenLabs (${ev.code}) — بيرجع تلقائياً مع أول طلب`);
        this.#stopMic(); this.emit('closed', ev.code);
      };
    });
    if (mic) await this.#startMic();
    this.emit('status', mic ? '🎙️ أسمعك… (ElevenLabs)' : 'متصل (نص فقط · ElevenLabs)');
  }

  sendText(text, { silent = false } = {}) {
    this.#send({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } });
    this.#send({ type: 'response.create' });
    if (!silent) this.emit('userText', text, true);
  }

  async #handle(m) {
    switch (m.type) {
      case 'response.output_audio.delta': case 'response.audio.delta':
        if (m.delta) this.#play(m.delta); break;
      case 'response.output_audio_transcript.delta': case 'response.audio_transcript.delta':
        if (m.delta) this.emit('modelText', m.delta); break;
      case 'conversation.item.input_audio_transcription.completed':
        if (m.transcript) this.emit('userText', m.transcript, false); break;
      case 'input_audio_buffer.speech_started':
        this.#stopPlayback(); break; // قاطعها
      case 'response.function_call_arguments.done':
        this.#queueCall({ call_id: m.call_id, name: m.name, arguments: m.arguments }); break;
      case 'response.output_item.done':
        if (m.item?.type === 'function_call') this.#queueCall(m.item); break;
      case 'response.done': {
        for (const it of m.response?.output || []) if (it.type === 'function_call') this.#queueCall(it);
        const pending = [...this.calls.values()];
        this.calls = new Map();
        if (pending.length) {
          const outs = await Promise.all(pending);
          for (const o of outs) this.#send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: o.call_id, output: JSON.stringify(o.result).slice(0, 60000) } });
          this.#send({ type: 'response.create' });
        } else this.emit('turnComplete');
        if (m.response?.status === 'failed') this.emit('error', m.response.status_details || 'response failed');
        break;
      }
      case 'error': this.emit('error', m.error?.message || m.error); break;
    }
  }

  #queueCall(c) {
    if (!c?.call_id || !c.name || this.calls.has(c.call_id)) return;
    let args = {}; try { args = JSON.parse(c.arguments || '{}'); } catch {}
    const fc = { id: c.call_id, name: c.name, args };
    this.emit('toolCall', fc);
    this.calls.set(c.call_id, (async () => {
      let result;
      try {
        if (this.clientTools[c.name]) result = await this.clientTools[c.name](args);
        else {
          const r = await fetch(this.toolUrl(c.name), { method: 'POST', headers: { 'Content-Type': 'application/json', ...this.headers() }, body: JSON.stringify(args) });
          result = await r.json();
        }
      } catch (e) { result = { error: e.message }; }
      this.emit('toolResult', fc, result ?? { ok: true });
      return { call_id: c.call_id, result: result ?? { ok: true } };
    })());
  }

  // ===== الصوت (PCM16 24kHz بالاتجاهين) =====
  #play(b64) {
    const bytes = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0));
    if (bytes.length < 2) return;
    const pcm = new Int16Array(bytes.buffer, 0, bytes.length >> 1);
    const buf = this.playCtx.createBuffer(1, pcm.length, 24000), d = buf.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) d[i] = pcm[i] / 32768;
    const src = this.playCtx.createBufferSource(); src.buffer = buf; src.connect(this.playCtx.destination);
    const t = Math.max(this.playCtx.currentTime, this.playQueueEnd); src.start(t); this.playQueueEnd = t + buf.duration;
    this.sources.add(src); src.onended = () => this.sources.delete(src);
  }
  #stopPlayback() { this.sources.forEach(s => { try { s.stop(); } catch {} }); this.sources.clear(); this.playQueueEnd = 0; }

  async #startMic() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    this.micCtx = new AudioContext();
    await this.micCtx.audioWorklet.addModule(new URL('./pcm-recorder.js', import.meta.url));
    const srcNode = this.micCtx.createMediaStreamSource(this.stream);
    this.worklet = new AudioWorkletNode(this.micCtx, 'pcm-recorder', { processorOptions: { rate: 24000 } });
    this.worklet.port.onmessage = e => {
      const bytes = new Uint8Array(e.data); let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      this.#send({ type: 'input_audio_buffer.append', audio: btoa(bin) });
      const pcm = new Int16Array(e.data); let peak = 0;
      for (let i = 0; i < pcm.length; i += 8) peak = Math.max(peak, Math.abs(pcm[i]));
      this.emit('level', peak / 32768);
    };
    srcNode.connect(this.worklet);
  }
  #stopMic() { this.stream?.getTracks().forEach(t => t.stop()); this.micCtx?.close().catch(() => {}); this.stream = this.micCtx = null; }

  stop() { this.#stopMic(); this.#stopPlayback(); this.ws?.close(); this.emit('status', 'متوقف'); }
}
