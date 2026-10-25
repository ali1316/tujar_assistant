// GeminiLiveAgent — موديول قابل للتركيب على أي واجهة/داشبورد
// الاستخدام:
//   const agent = new GeminiLiveAgent({ sessionUrl: '/api/session', toolUrl: n => `/api/tools/${n}`, on: {...} });
//   await agent.start();  agent.sendText('...');  agent.stop();
const WS_BASE = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage';

export class GeminiLiveAgent {
  constructor({ sessionUrl = '/api/session', toolUrl = n => `/api/tools/${n}`, headers = () => ({}), on = {} } = {}) {
    this.headers = headers;
    this.sessionUrl = sessionUrl;
    this.toolUrl = toolUrl;
    this.on = on; // status, userText, modelText, toolCall, toolResult, turnComplete, error, level
    this.playQueueEnd = 0;
    this.sources = new Set();
  }

  emit(ev, ...a) { try { this.on[ev]?.(...a); } catch (e) { console.error(e); } }

  async start({ mic = true } = {}) {
    this.emit('status', 'جاري الاتصال…');
    // نجرب نسخة الـ API الافتراضية، ولو فشل الإعداد نجرب الثانية تلقائياً
    try { await this.#connect(); }
    catch (e) {
      console.warn('first connect failed, retrying with v1beta', e);
      await this.#connect('v1beta');
    }
    if (mic) await this.#startMic();
    this.emit('status', mic ? '🎙️ أسمعك… تكلّم' : 'متصل (نص فقط)');
  }

  async #connect(version) {
    const r = await fetch(this.sessionUrl + (version ? `?v=${version}` : ''), { headers: this.headers() });
    const s = await r.json();
    if (!r.ok) throw new Error(s.error || 'session error');
    const url = `${WS_BASE}.${s.apiVersion}.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(s.token)}`;

    this.playCtx ??= new AudioContext({ sampleRate: 24000 });
    await this.playCtx.resume();

    await new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      let ready = false;
      ws.onopen = () => ws.send(JSON.stringify({ setup: s.setup }));
      ws.onmessage = async ev => {
        const text = typeof ev.data === 'string' ? ev.data : await ev.data.text();
        const msg = JSON.parse(text);
        if (msg.setupComplete) { ready = true; resolve(); return; }
        this.#handle(msg);
      };
      ws.onerror = () => { if (!ready) reject(new Error('websocket error')); };
      ws.onclose = ev => {
        if (!ready) return reject(new Error(`closed before setup: ${ev.code} ${ev.reason}`));
        this.emit('status', `انقطع الاتصال (${ev.code}) ${ev.reason || ''}`);
        this.#stopMic();
      };
    });
  }

  #send(obj) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(obj)); }

  sendText(text, { silent = false } = {}) { this.#send({ realtimeInput: { text } }); if (!silent) this.emit('userText', text, true); }
  get connected() { return this.ws?.readyState === 1; }

  async #handle(msg) {
    const sc = msg.serverContent;
    if (sc) {
      if (sc.interrupted) this.#stopPlayback(); // المستخدم قاطع الموديل
      for (const part of sc.modelTurn?.parts || []) {
        if (part.inlineData?.data) this.#play(part.inlineData.data);
      }
      if (sc.inputTranscription?.text) this.emit('userText', sc.inputTranscription.text, false);
      if (sc.outputTranscription?.text) this.emit('modelText', sc.outputTranscription.text);
      if (sc.turnComplete) this.emit('turnComplete');
    }
    if (msg.toolCall) {
      const functionResponses = await Promise.all(msg.toolCall.functionCalls.map(async fc => {
        this.emit('toolCall', fc);
        let result;
        try {
          const r = await fetch(this.toolUrl(fc.name), {
            method: 'POST', headers: { 'Content-Type': 'application/json', ...this.headers() }, body: JSON.stringify(fc.args || {}),
          });
          result = await r.json();
        } catch (e) { result = { error: e.message }; }
        this.emit('toolResult', fc, result);
        return { id: fc.id, name: fc.name, response: { result } };
      }));
      this.#send({ toolResponse: { functionResponses } });
    }
    if (msg.goAway) this.emit('status', `⚠️ الجلسة بتنتهي بعد ${msg.goAway.timeLeft}`);
    if (msg.error) this.emit('error', msg.error);
  }

  // ===== تشغيل صوت الموديل (PCM 24kHz) =====
  #play(b64) {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const pcm = new Int16Array(bytes.buffer);
    const buf = this.playCtx.createBuffer(1, pcm.length, 24000);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768;
    const src = this.playCtx.createBufferSource();
    src.buffer = buf;
    src.connect(this.playCtx.destination);
    const t = Math.max(this.playCtx.currentTime, this.playQueueEnd);
    src.start(t);
    this.playQueueEnd = t + buf.duration;
    this.sources.add(src);
    src.onended = () => this.sources.delete(src);
  }
  #stopPlayback() {
    this.sources.forEach(s => { try { s.stop(); } catch {} });
    this.sources.clear();
    this.playQueueEnd = 0;
  }

  // ===== المايك (PCM 16kHz) =====
  async #startMic() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    this.micCtx = new AudioContext();
    await this.micCtx.audioWorklet.addModule(new URL('./pcm-recorder.js', import.meta.url));
    const srcNode = this.micCtx.createMediaStreamSource(this.stream);
    this.worklet = new AudioWorkletNode(this.micCtx, 'pcm-recorder');
    this.worklet.port.onmessage = e => {
      const bytes = new Uint8Array(e.data);
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      this.#send({ realtimeInput: { audio: { data: btoa(bin), mimeType: 'audio/pcm;rate=16000' } } });
      const pcm = new Int16Array(e.data); let peak = 0;
      for (let i = 0; i < pcm.length; i += 8) peak = Math.max(peak, Math.abs(pcm[i]));
      this.emit('level', peak / 32768);
    };
    srcNode.connect(this.worklet);
  }
  #stopMic() {
    this.stream?.getTracks().forEach(t => t.stop());
    this.micCtx?.close().catch(() => {});
    this.stream = this.micCtx = null;
  }

  stop() {
    this.#send({ realtimeInput: { audioStreamEnd: true } });
    this.#stopMic();
    this.#stopPlayback();
    this.ws?.close();
    this.emit('status', 'متوقف');
  }
}
