// GeminiLiveAgent — موديول قابل للتركيب على أي واجهة/داشبورد
// الاستخدام:
//   const agent = new GeminiLiveAgent({ sessionUrl: '/api/session', toolUrl: n => `/api/tools/${n}`, on: {...} });
//   await agent.start();  agent.sendText('...');  agent.stop();
import { stripToolTags } from './text-guard.js';
// مقاطعة في وضع «صوت خارجي» (جداوي/صوتي): توقف حتى لو ما فيه صوت يشتغل لحظتها — جملة جاية بالطريق أو نص منتظر
export const shouldBargeIn = ({ mode, playing, pending, buffered }) => mode === 'mine' && !!(playing || pending || buffered);
const WS_BASE = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage';

export class GeminiLiveAgent {
  constructor({ sessionUrl = '/api/session', toolUrl = n => `/api/tools/${n}`, speakUrl = '/api/speak', persona = '', headers = () => ({}), clientTools = {}, on = {} } = {}) {
    this.persona = persona; // هوية على نفس عقل Gemini (مثل «جداوي»)
    this.clientTools = clientTools; // أدوات تنفّذ في المتصفح (مثل النوافذ المنبثقة)
    this.voice = '';
    this.headers = headers;
    this.speakUrl = speakUrl;
    this.mode = 'live';      // 'live' = صوت Live | 'mine' = صوتك المستنسخ (TTS)
    this.textBuf = '';
    this.speakChain = Promise.resolve();
    this.aborts = new Set();
    this.sessionUrl = sessionUrl;
    this.toolUrl = toolUrl;
    this.on = on; // status, userText, modelText, toolCall, toolResult, turnComplete, error, level
    this.playQueueEnd = 0;
    this.sources = new Set();
  }

  emit(ev, ...a) { try { this.on[ev]?.(...a); } catch (e) { console.error(e); } }

  async start({ mic = true, mode = this.mode, voice = this.voice } = {}) {
    this.mode = mode;
    this.voice = voice;
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
    const q = new URLSearchParams({ mode: this.mode, ...(this.persona ? { persona: this.persona } : {}), ...(this.voice ? { voice: this.voice } : {}), ...(version ? { v: version } : {}) });
    const r = await fetch(`${this.sessionUrl}?${q}`, { headers: this.headers() });
    const s = await r.json();
    if (!r.ok) throw new Error(s.error || 'session error');
    this.chatId = s.chatId; // رقم المحادثة في السجل
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
        if (this.ws !== ws) return; // اتصال قديم انقفل بعد ما بدينا جديد
        this.emit('status', `انقطع الاتصال (${ev.code}) — بيرجع تلقائياً مع أول طلب`);
        this.#stopMic();
        this.emit('closed', ev.code);
      };
    });
  }

  #send(obj) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(obj)); }

  // صوت PCM 16kHz جاهز (base64) عبر نفس قناة المايك — للاختبار الآلي للمسار الصوتي بدون مايك فعلي
  sendAudio(b64) { this.#send({ realtimeInput: { audio: { data: b64, mimeType: 'audio/pcm;rate=16000' } } }); }
  endAudio() { this.#send({ realtimeInput: { audioStreamEnd: true } }); }
  sendText(text, { silent = false } = {}) { this.#send({ realtimeInput: { text } }); if (!silent) this.emit('userText', text, true); }
  get connected() { return this.ws?.readyState === 1; }

  async #handle(msg) {
    const sc = msg.serverContent;
    if (sc) {
      if (sc.interrupted) this.#stopPlayback(); // المستخدم قاطع الموديل
      for (const part of sc.modelTurn?.parts || []) {
        if (part.inlineData?.data && this.mode !== 'mine') this.#play(part.inlineData.data); // في وضع «صوتي» نتجاهل صوت Live
      }
      if (sc.inputTranscription?.text) {
        if (shouldBargeIn({ mode: this.mode, playing: this.sources.size, pending: this.aborts.size, buffered: this.textBuf.trim() })) this.#stopPlayback(); // قاطعته وهو يتكلم (حتى بين جملتين)
        this.emit('userText', sc.inputTranscription.text, false);
      }
      if (sc.outputTranscription?.text) {
        this.emit('modelText', sc.outputTranscription.text);
        if (this.mode === 'mine') this.#queueText(stripToolTags(sc.outputTranscription.text, { trim: false })); // وسوم الأدوات ما تنقرأ بالصوت
      }
      if (sc.turnComplete && this.mode === 'mine') this.#queueText('', true);
      if (sc.turnComplete) this.emit('turnComplete');
    }
    if (msg.toolCall) {
      const functionResponses = await Promise.all(msg.toolCall.functionCalls.map(async fc => {
        this.emit('toolCall', fc);
        let result;
        try {
          if (this.clientTools[fc.name]) { result = await this.clientTools[fc.name](fc.args || {}); this.emit('toolResult', fc, result); return { id: fc.id, name: fc.name, response: { result } }; }
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
    if (msg.usageMetadata) this.emit('usage', { input: msg.usageMetadata.promptTokenCount || 0, output: msg.usageMetadata.responseTokenCount || msg.usageMetadata.candidatesTokenCount || 0, total: msg.usageMetadata.totalTokenCount || 0 });
    if (msg.goAway) this.emit('status', `⚠️ الجلسة بتنتهي بعد ${msg.goAway.timeLeft}`);
    if (msg.error) this.emit('error', msg.error);
  }

  // ===== تشغيل صوت الموديل (PCM 24kHz) =====
  #play(b64) { this.#playBytes(Uint8Array.from(atob(b64), c => c.charCodeAt(0))); }
  #playBytes(bytes) {
    if (!bytes.length) return;
    const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.length >> 1);
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
  // ===== وضع «صوتي»: نجمع النص لجمل ونحوّل كل جملة لصوتك بالترتيب =====
  #queueText(t, flush = false) {
    this.textBuf += t;
    const parts = [];
    let m;
    const re = /^([\s\S]{25,}?[.!؟?،:\n])\s*/;      // جملة لا تقل عن 25 حرف
    while ((m = this.textBuf.match(re))) { parts.push(m[1]); this.textBuf = this.textBuf.slice(m[0].length); }
    if (flush && this.textBuf.trim()) { parts.push(this.textBuf); this.textBuf = ''; }
    const gen = this.gen || 0;
    for (const p of parts) this.speakChain = this.speakChain.then(() => gen === (this.gen || 0) && this.#speak(p.trim()));
  }
  async #speak(text) {
    if (!text) return;
    const ac = new AbortController(); this.aborts.add(ac);
    try {
      const r = await fetch(this.speakUrl, {
        method: 'POST', signal: ac.signal,
        headers: { 'Content-Type': 'application/json', ...this.headers() }, body: JSON.stringify({ text, ...(this.persona ? { persona: this.persona } : {}) }),
      });
      if (!r.ok) { this.emit('error', await r.text()); return; }
      const reader = r.body.getReader();
      let carry = new Uint8Array(0);
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const all = new Uint8Array(carry.length + value.length); all.set(carry); all.set(value, carry.length);
        const even = all.length & ~1;
        this.#playBytes(all.slice(0, even));
        carry = all.slice(even);
      }
    } catch (e) { if (e.name !== 'AbortError') this.emit('error', e.message); }
    finally { this.aborts.delete(ac); }
  }

  #stopPlayback() {
    this.gen = (this.gen || 0) + 1;
    this.aborts.forEach(a => a.abort()); this.aborts.clear();
    this.textBuf = ''; this.speakChain = Promise.resolve();
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
