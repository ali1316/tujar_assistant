// public/js/briefing.js - Executive Morning Briefing UI & Screen Choreography Coordinator
import { playPcmBuffer } from './audio.js';

let isPlaying = false;
let cueTimers = [];
let currentAudioCtx = null;
let currentSource = null;

/**
 * Dispatches an executive spotlight event to synchronize UI highlights.
 * @param {object|null} cue
 */
export function emitSpotlight(cue) {
  window.dispatchEvent(new CustomEvent('executive:spotlight', { detail: cue }));
}

/**
 * Stops any ongoing audio and spotlight timers.
 */
export function stopExecutiveBriefing() {
  isPlaying = false;
  
  // Clear scheduled cue timers
  cueTimers.forEach(t => clearTimeout(t));
  cueTimers = [];

  // Stop WebAudio if running
  if (currentSource) {
    try { currentSource.stop(); } catch {}
    currentSource = null;
  }
  if (currentAudioCtx) {
    try { currentAudioCtx.close(); } catch {}
    currentAudioCtx = null;
  }

  // Stop SpeechSynthesis if running
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }

  // Clear spotlight
  emitSpotlight(null);

  // Update button UI
  const btn = document.querySelector('.briefing-btn');
  if (btn) {
    btn.classList.remove('playing', 'loading');
    btn.setAttribute('aria-busy', 'false');
    btn.innerHTML = '<span class="b-icon">🎙️</span> <span class="b-label">استمع للموجز الصباحي</span>';
  }
}

/**
 * Plays PCM buffer audio with fallback.
 * @param {ArrayBuffer} buffer
 * @param {number} sampleRate
 * @returns {Promise<void>}
 */
function playAudioStream(buffer, sampleRate = 24000) {
  return new Promise((resolve) => {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContextClass({ sampleRate });
      currentAudioCtx = ctx;

      const pcm = new Int16Array(buffer, 0, buffer.byteLength >> 1);
      const audioBuffer = ctx.createBuffer(1, pcm.length, sampleRate);
      const channel = audioBuffer.getChannelData(0);
      for (let i = 0; i < pcm.length; i++) {
        channel[i] = pcm[i] / 32768;
      }

      const src = ctx.createBufferSource();
      src.buffer = audioBuffer;
      src.connect(ctx.destination);
      currentSource = src;

      src.onended = () => {
        currentSource = null;
        resolve();
      };

      src.start();
    } catch (err) {
      console.warn('[briefing] WebAudio playback failed:', err);
      resolve();
    }
  });
}

/**
 * Plays spoken text via browser SpeechSynthesis as fallback.
 * @param {string} text
 * @returns {Promise<void>}
 */
function playSpeechSynthesisFallback(text) {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      return resolve();
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ar-SA';
    utterance.rate = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const arVoice = voices.find(v => v.lang.startsWith('ar'));
    if (arVoice) utterance.voice = arVoice;

    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();

    window.speechSynthesis.speak(utterance);
  });
}

/**
 * Fetches and plays the morning executive briefing with synchronized spotlights.
 */
export async function startExecutiveBriefing() {
  if (isPlaying) {
    stopExecutiveBriefing();
    return;
  }

  const btn = document.querySelector('.briefing-btn');
  if (btn) {
    btn.classList.add('loading');
    btn.setAttribute('aria-busy', 'true');
    btn.innerHTML = '<span class="b-icon">⏳</span> <span class="b-label">جاري تجهيز الموجز…</span>';
  }

  try {
    // 1. Fetch briefing data from backend
    const apiCall = window.api || fetch;
    const res = await apiCall('/api/executive/briefing');
    if (!res.ok) {
      throw new Error(`خطأ في استرجاع الموجز (${res.status})`);
    }
    const data = await res.json();
    const { text, cues = [], audioUrl } = data;

    // 2. Reveal overview dashboard if currently on empty welcome screen
    const emptyEl = document.querySelector('#empty');
    if (emptyEl && !emptyEl.hidden) {
      document.querySelectorAll('[data-v*="overview"]').forEach(el => el.removeAttribute('hidden'));
      emptyEl.hidden = true;
    }
    if (typeof window.showScreen === 'function') {
      window.showScreen('overview');
    }

    // 3. Set playing state
    isPlaying = true;
    if (btn) {
      btn.classList.remove('loading');
      btn.classList.add('playing');
      btn.setAttribute('aria-busy', 'false');
      btn.innerHTML = '<span class="b-icon">⏹️</span> <span class="b-label">إيقاف الموجز الصباحي</span>';
    }

    // 4. Schedule cue spotlights
    const totalDuration = 35; // default ~35 seconds
    cues.forEach((cue, index) => {
      const delaySec = typeof cue.timeOffset === 'number'
        ? cue.timeOffset
        : index * (totalDuration / Math.max(cues.length, 1));

      const timer = setTimeout(() => {
        if (!isPlaying) return;
        emitSpotlight(cue);
      }, delaySec * 1000);
      cueTimers.push(timer);
    });

    // 5. Play voice audio (Gemini / Nora voice stream or fallback)
    let audioPlayed = false;
    try {
      const speakUrl = audioUrl || '/api/speak';
      const audioRes = await apiCall(speakUrl, {
        method: speakUrl.includes('/audio') ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        ...(speakUrl.includes('/audio') ? {} : { body: JSON.stringify({ text }) }),
      });

      if (audioRes.ok) {
        const buf = await audioRes.arrayBuffer();
        if (buf && buf.byteLength > 100) {
          audioPlayed = true;
          await playAudioStream(buf, 24000);
        }
      }
    } catch (e) {
      console.warn('[briefing] Server audio stream unavailable, using speech synthesis:', e.message);
    }

    if (!audioPlayed && isPlaying) {
      await playSpeechSynthesisFallback(text);
    }

  } catch (err) {
    console.error('[briefing] Failed to run executive briefing:', err);
    if (typeof window.announce === 'function') {
      window.announce('تعذر تشغيل الموجز التنفيذي الصباحي');
    }
  } finally {
    stopExecutiveBriefing();
  }
}

/**
 * Initializes and mounts the executive briefing button.
 */
export function initExecutiveBriefing() {
  let btn = document.querySelector('.briefing-btn');
  if (!btn) {
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'briefing-btn';
    btn.id = 'executiveBriefingBtn';
    btn.setAttribute('aria-label', 'استمع للموجز الصباحي بصوت نورة');
    btn.innerHTML = '<span class="b-icon">🎙️</span> <span class="b-label">استمع للموجز الصباحي</span>';

    const qaContainer = document.querySelector('.qa');
    if (qaContainer && qaContainer.parentNode) {
      const wrap = document.createElement('div');
      wrap.className = 'briefing-wrap';
      wrap.appendChild(btn);
      qaContainer.parentNode.insertBefore(wrap, qaContainer);
    } else {
      const home = document.querySelector('#home') || document.body;
      home.prepend(btn);
    }
  }

  btn.onclick = () => {
    if (isPlaying) {
      stopExecutiveBriefing();
    } else {
      startExecutiveBriefing();
    }
  };

  return btn;
}

// Auto-initialize when DOM is ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initExecutiveBriefing);
  } else {
    initExecutiveBriefing();
  }
}

if (typeof window !== 'undefined') {
  window.__briefing = {
    start: startExecutiveBriefing,
    stop: stopExecutiveBriefing,
    init: initExecutiveBriefing,
  };
  window.startExecutiveBriefing = startExecutiveBriefing;
  window.stopExecutiveBriefing = stopExecutiveBriefing;
}
