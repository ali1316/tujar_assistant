// audio.js — WebAudio capture, 24kHz PCM streaming, audio playback queue, barge-in interrupt logic

/**
 * Checks whether user input should trigger barge-in interruption in 'mine' mode.
 */
export function shouldBargeIn({ mode, playing = 0, pending = 0, buffered = '' } = {}) {
  return mode === 'mine' && !!(playing || pending || (typeof buffered === 'string' && buffered.trim()));
}

/**
 * AudioPlayer handles continuous 24kHz 16-bit PCM streaming and playback queue.
 */
export class AudioPlayer {
  constructor({ sampleRate = 24000 } = {}) {
    this.sampleRate = sampleRate;
    this.playCtx = null;
    this.playQueueEnd = 0;
    this.sources = new Set();
  }

  async init() {
    if (!this.playCtx) {
      this.playCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: this.sampleRate });
    }
    if (this.playCtx.state === 'suspended') {
      await this.playCtx.resume();
    }
    return this.playCtx;
  }

  playBase64(b64) {
    if (!b64) return;
    const binary = atob(b64);
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    this.playBytes(bytes);
  }

  playBytes(bytes) {
    if (!bytes || !bytes.length) return;
    if (!this.playCtx) {
      this.playCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: this.sampleRate });
    }

    const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.length >> 1);
    const buf = this.playCtx.createBuffer(1, pcm.length, this.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) {
      ch[i] = pcm[i] / 32768;
    }

    const src = this.playCtx.createBufferSource();
    src.buffer = buf;
    src.connect(this.playCtx.destination);

    const t = Math.max(this.playCtx.currentTime, this.playQueueEnd);
    src.start(t);
    this.playQueueEnd = t + buf.duration;
    this.sources.add(src);

    src.onended = () => {
      this.sources.delete(src);
    };
  }

  stop() {
    this.sources.forEach(s => {
      try { s.stop(); } catch {}
    });
    this.sources.clear();
    this.playQueueEnd = 0;
  }

  get isPlaying() {
    return this.sources.size > 0;
  }

  get activeSourcesCount() {
    return this.sources.size;
  }
}

/**
 * AudioRecorder captures microphone input, resamples to 16kHz PCM, and reports live audio volume levels.
 */
export class AudioRecorder {
  constructor({ onAudioData, onLevel } = {}) {
    this.onAudioData = onAudioData;
    this.onLevel = onLevel;
    this.stream = null;
    this.micCtx = null;
    this.worklet = null;
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    this.micCtx = new (window.AudioContext || window.webkitAudioContext)();
    const workletUrl = new URL('./pcm-recorder.js', import.meta.url);
    await this.micCtx.audioWorklet.addModule(workletUrl);

    const srcNode = this.micCtx.createMediaStreamSource(this.stream);
    this.worklet = new AudioWorkletNode(this.micCtx, 'pcm-recorder');

    this.worklet.port.onmessage = e => {
      const bytes = new Uint8Array(e.data);
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) {
        bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      }
      const b64 = btoa(bin);
      this.onAudioData?.(b64, e.data);

      const pcm = new Int16Array(e.data);
      let peak = 0;
      for (let i = 0; i < pcm.length; i += 8) {
        peak = Math.max(peak, Math.abs(pcm[i]));
      }
      this.onLevel?.(peak / 32768);
    };

    srcNode.connect(this.worklet);
  }

  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    if (this.micCtx) {
      this.micCtx.close().catch(() => {});
      this.micCtx = null;
    }
    this.worklet = null;
    this.onLevel?.(0);
  }
}

/**
 * Plays a raw PCM buffer (e.g. for voice preview).
 */
export async function playPcmBuffer(arrayBuffer, sampleRate = 24000) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate });
  const pcm = new Int16Array(arrayBuffer, 0, arrayBuffer.byteLength >> 1);
  const ab = ctx.createBuffer(1, pcm.length, sampleRate);
  const ch = ab.getChannelData(0);
  for (let i = 0; i < pcm.length; i++) {
    ch[i] = pcm[i] / 32768;
  }
  const src = ctx.createBufferSource();
  src.buffer = ab;
  src.connect(ctx.destination);
  src.start();
  src.onended = () => ctx.close();
}
