// public/js/briefing.js - Executive Morning Briefing UI & Screen Choreography Coordinator
import { playPcmBuffer } from './audio.js';

let isPlaying = false;
let cueTimers = [];
let currentAudioCtx = null;
let currentSource = null;
let masterSessionTimer = null;

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Creates and displays the floating Executive Narration HUD.
 */
/**
 * Creates and displays the floating Executive Narration HUD with Interactive Choreography Stepper.
 */
function showBriefingHud({ title, text, delta, cues = [], totalSeconds = 35 }) {
  removeBriefingHud();

  const hud = document.createElement('div');
  hud.id = 'executiveBriefingHud';
  hud.className = 'briefing-hud';
  hud.setAttribute('role', 'region');
  hud.setAttribute('aria-label', 'الموجز التنفيذي الصباحي');

  const statusBadge = delta?.is_unchanged
    ? '<span class="hud-status-badge stable">🟢 الموقف مستقر</span>'
    : '<span class="hud-status-badge live">🔴 إيجاز مباشر</span>';

  const stepperHtml = cues && cues.length > 0
    ? `<div class="hud-stepper" id="hudStepper">` +
      cues.map((c, i) => `
        <button type="button" class="hud-step ${i === 0 ? 'active' : ''}" data-step-idx="${i}" title="${escapeHtml(c.label || c.stepTitle || '')}">
          <span class="hud-step-icon">${escapeHtml(c.stepIcon || String(i + 1))}</span>
          <span class="hud-step-text">${escapeHtml(c.stepTitle || c.label || '')}</span>
        </button>
      `).join('') +
      `</div>`
    : '';

  hud.innerHTML = `
    <div class="hud-progress-bar">
      <div class="hud-progress-fill" style="animation-duration: ${totalSeconds}s"></div>
    </div>
    <div class="hud-header">
      <div class="hud-title-wrap">
        <span class="hud-icon">🎙️</span>
        <b class="hud-title">${escapeHtml(title || 'الموجز التنفيذي الصباحي')}</b>
        ${statusBadge}
      </div>
      <button type="button" class="hud-close-btn" title="إغلاق الموجز" aria-label="إغلاق الموجز">✕</button>
    </div>
    ${stepperHtml}
    <div class="hud-active-cue" id="hudActiveCue">
      <span class="hud-cue-bullet">🎯</span>
      <span class="hud-cue-text">جاري بدء العرض التفاعلي لمحفظة المشاريع...</span>
    </div>
    <div class="hud-text">${escapeHtml(text)}</div>
  `;

  // Close button handler
  const closeBtn = hud.querySelector('.hud-close-btn');
  if (closeBtn) {
    closeBtn.onclick = () => stopExecutiveBriefing();
  }

  // Stepper click handler: allows clicking any step pill to spotlight it immediately
  hud.querySelectorAll('.hud-step').forEach(btn => {
    btn.onclick = () => {
      const idx = Number(btn.dataset.stepIdx);
      if (cues[idx]) {
        emitSpotlight(cues[idx], cues);
      }
    };
  });

  document.body.appendChild(hud);
  requestAnimationFrame(() => hud.classList.add('visible'));
}

/**
 * Updates the HUD active cue title and stepper progress.
 */
function updateBriefingHudCue(cue, allCues = []) {
  const cueText = document.querySelector('#hudActiveCue .hud-cue-text');
  if (cueText && cue?.label) {
    cueText.textContent = cue.label;
    const parent = cueText.parentElement;
    if (parent) {
      parent.classList.remove('pulse');
      void parent.offsetWidth;
      parent.classList.add('pulse');
    }
  }

  // Update Stepper active state
  if (cue) {
    const stepperBtns = document.querySelectorAll('#hudStepper .hud-step');
    let activeIdx = -1;
    if (typeof cue.step === 'number') {
      activeIdx = cue.step - 1;
    } else if (Array.isArray(allCues) && allCues.length > 0) {
      activeIdx = allCues.findIndex(c => c.target === cue.target);
    }
    if (activeIdx >= 0 && stepperBtns.length > 0) {
      stepperBtns.forEach((b, idx) => {
        b.classList.toggle('active', idx === activeIdx);
        b.classList.toggle('done', idx < activeIdx);
      });
    }
  }
}

/**
 * Removes the floating HUD.
 */
function removeBriefingHud() {
  const hud = document.getElementById('executiveBriefingHud');
  if (hud) {
    hud.classList.remove('visible');
    setTimeout(() => {
      if (hud.parentElement) hud.remove();
    }, 350);
  }
}

/**
 * Dispatches an executive spotlight event to synchronize UI highlights.
 * @param {object|null} cue
 * @param {Array<object>} [allCues]
 */
export function emitSpotlight(cue, allCues = []) {
  window.dispatchEvent(new CustomEvent('executive:spotlight', { detail: cue }));
  if (cue) {
    updateBriefingHudCue(cue, allCues);
  }
}

/**
 * Stops any ongoing audio, spotlight timers, and narration HUD.
 */
export function stopExecutiveBriefing() {
  isPlaying = false;

  // Clear scheduled cue timers
  cueTimers.forEach(t => clearTimeout(t));
  cueTimers = [];

  if (masterSessionTimer) {
    clearTimeout(masterSessionTimer);
    masterSessionTimer = null;
  }

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

  // Clear spotlight & HUD
  emitSpotlight(null);
  removeBriefingHud();

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
    // 1. Fetch briefing data from backend (with dynamic variant for live sessions)
    const apiCall = window.api || fetch;
    const res = await apiCall('/api/executive/briefing?dynamic=true');
    if (!res.ok) {
      throw new Error(`خطأ في استرجاع الموجز (${res.status})`);
    }
    const data = await res.json();
    const { text, cues = [], audioUrl, delta } = data;

    // 2. Ensure all relevant dashboard sections are visible
    document.querySelectorAll('[data-v*="overview"], [data-v*="projects"], [data-v*="tickets"], [data-v="files"]').forEach(el => {
      el.removeAttribute('hidden');
      if (el.style) el.style.display = '';
    });
    if (typeof window.showScreen === 'function') {
      window.showScreen('overview');
    }

    // 3. Set playing state
    isPlaying = true;
    if (btn) {
      btn.classList.remove('loading');
      btn.classList.add('playing');
      btn.setAttribute('aria-busy', 'false');
      const statusSuffix = delta?.is_unchanged ? ' (مستقر)' : '';
      btn.innerHTML = `<span class="b-icon">⏹️</span> <span class="b-label">إيقاف الموجز${statusSuffix}</span>`;
      if (delta?.is_unchanged) {
        btn.setAttribute('title', 'الموقف مستقر: لا توجد تغييرات طارئة منذ الإيجاز السابق');
      }
    }

    // 4. Calculate total choreography duration
    const lastCueTime = cues.length > 0 ? Math.max(...cues.map(c => c.timeOffset || 0)) : 27;
    const totalDurationSec = Math.max(lastCueTime + 6, 32);

    // 5. Present floating Narration HUD immediately with interactive stepper
    showBriefingHud({
      title: 'الموجز التنفيذي الصباحي · فواز',
      text,
      delta,
      cues,
      totalSeconds: totalDurationSec,
    });

    // 6. Schedule cue spotlights
    cues.forEach((cue) => {
      const delaySec = Math.max(0, typeof cue.timeOffset === 'number' ? cue.timeOffset : 0);

      if (delaySec > 0) {
        const timer = setTimeout(() => {
          if (!isPlaying) return;
          emitSpotlight(cue, cues);
        }, delaySec * 1000);
        cueTimers.push(timer);
      }
    });

    // Fire first cue immediately at t=0
    if (cues.length > 0) {
      emitSpotlight(cues[0], cues);
    }

    // Master timer: automatically finish when the full choreography completes
    masterSessionTimer = setTimeout(() => {
      if (isPlaying) {
        stopExecutiveBriefing();
      }
    }, totalDurationSec * 1000);

    // 7. Play voice audio concurrently in background (non-blocking)
    (async () => {
      let audioPlayed = false;
      try {
        const speakUrl = audioUrl || '/api/executive/briefing/audio';
        const controller = new AbortController();
        const fetchTimeout = setTimeout(() => controller.abort(), 4500);

        const audioRes = await apiCall(speakUrl, {
          method: 'GET',
          signal: controller.signal,
        });
        clearTimeout(fetchTimeout);

        if (audioRes.ok) {
          const buf = await audioRes.arrayBuffer();
          if (buf && buf.byteLength > 100 && isPlaying) {
            audioPlayed = true;
            await playAudioStream(buf, 24000);
          }
        }
      } catch (e) {
        console.warn('[briefing] Server audio unavailable, using speech synthesis fallback:', e.message);
      }

      if (!audioPlayed && isPlaying) {
        try {
          await playSpeechSynthesisFallback(text);
        } catch {}
      }
    })();

  } catch (err) {
    console.error('[briefing] Failed to run executive briefing:', err);
    if (typeof window.announce === 'function') {
      window.announce('تعذر تشغيل الموجز التنفيذي الصباحي');
    }
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
