// AudioWorklet: ياخذ صوت المايك، ينزّله لـ 16kHz، ويحوّله PCM 16-bit (الصيغة اللي يبيها جيميناي لايف)
class PcmRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.buf = [];
    this.pos = 0;
  }
  process(inputs) {
    const ch = inputs[0][0];
    if (!ch) return true;
    // downsample بسيط (متوسط العينات)
    for (; this.pos < ch.length; this.pos += this.ratio) {
      const i = Math.floor(this.pos);
      const end = Math.min(ch.length, Math.floor(this.pos + this.ratio));
      let s = 0, n = 0;
      for (let j = i; j < Math.max(end, i + 1); j++) { s += ch[j]; n++; }
      this.buf.push(s / n);
    }
    this.pos -= ch.length;
    if (this.buf.length >= 1600) { // كل 100ms
      const out = new Int16Array(this.buf.length);
      for (let k = 0; k < this.buf.length; k++) {
        const v = Math.max(-1, Math.min(1, this.buf[k]));
        out[k] = v < 0 ? v * 0x8000 : v * 0x7fff;
      }
      this.port.postMessage(out.buffer, [out.buffer]);
      this.buf = [];
    }
    return true;
  }
}
registerProcessor('pcm-recorder', PcmRecorder);
