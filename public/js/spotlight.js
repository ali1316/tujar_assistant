// spotlight.js — إخراج الشاشة المتزامن (Choreographed Screen Spotlight)
// يربط صوت نورة بالعناصر المعروضة: هالة ذهبية، تمرير سلس، شارة نبض تنفيذية، وتعتيم اختياري لخلفية الشاشة.

export class ScreenSpotlight {
  constructor(options = {}) {
    this.options = {
      defaultDurationMs: 5000,
      autoListen: true,
      backdrop: false,
      ...options,
    };

    this.win = options.window || (typeof window !== 'undefined' ? window : null);
    this.doc = options.document || (typeof document !== 'undefined' ? document : null);

    this.activeElement = null;
    this.activeBadge = null;
    this.backdropElement = null;
    this.timer = null;
    this._customStyles = null;

    this.onSpotlight = this.onSpotlight.bind(this);
    this.onClearEvent = this.onClearEvent.bind(this);

    if (this.win && this.options.autoListen !== false) {
      this.win.addEventListener('executive:spotlight', this.onSpotlight);
      this.win.addEventListener('executive:spotlight:clear', this.onClearEvent);
    }
  }

  onSpotlight(event) {
    const detail = event?.detail || event || {};
    if (!detail) return null;
    return this.highlight(detail);
  }

  onClearEvent() {
    this.clear();
  }

  resolveTarget(target) {
    if (!target) return null;

    // 1. Direct DOM Element
    if (typeof target === 'object' && (target.nodeType === 1 || (typeof Element !== 'undefined' && target instanceof Element))) {
      return target;
    }

    if (typeof target !== 'string') return null;

    const doc = this.doc || (typeof document !== 'undefined' ? document : null);
    if (!doc) return null;

    const query = target.trim();
    if (!query) return null;

    // 2. Try direct CSS selector
    try {
      const el = doc.querySelector(query);
      if (el) return el;
    } catch {
      // Query has special characters or unescaped text
    }

    // 3. Try data-attribute without brackets (e.g. data-project-id="1")
    if ((/^data-[a-z0-9_-]+=/i.test(query) || (!query.startsWith('[') && query.includes('='))) && !query.startsWith('#') && !query.startsWith('.')) {
      try {
        const el = doc.querySelector(`[${query}]`);
        if (el) return el;
      } catch {}
    }

    const qLower = query.toLowerCase();

    // 4. Search text content in table rows (tr, .tabulator-row)
    try {
      const rows = doc.querySelectorAll('tr, .tabulator-row');
      for (const row of rows) {
        const text = (row.textContent || '').trim().toLowerCase();
        if (text.includes(qLower)) {
          return row;
        }
      }
    } catch {}

    // 5. Search text content in dashboard cards, KPIs, headings, or list items
    try {
      const candidates = doc.querySelectorAll('.kpi, .card, .panel, li, td, th, h1, h2, h3, h4, [data-project-id], [data-v]');
      for (const item of candidates) {
        const text = (item.textContent || '').trim().toLowerCase();
        if (text.includes(qLower)) {
          return item;
        }
      }
    } catch {}

    // 6. Direct ID fallback if passed without #
    try {
      const byId = doc.getElementById ? doc.getElementById(query) : doc.querySelector(`#${query}`);
      if (byId) return byId;
    } catch {}

    return null;
  }

  highlight({ target, label, durationMs, style = {}, backdrop = false } = {}) {
    // Clear previous spotlight before applying new one
    this.clear();

    const el = this.resolveTarget(target);
    if (!el) {
      console.warn?.('[spotlight] target not found:', target);
      return null;
    }

    // Apply spotlight aura
    el.classList.add('spotlight-active');
    this.activeElement = el;

    // Handle custom styles if provided
    if (style && typeof style === 'object') {
      this._customStyles = {};
      if (style.boxShadow) {
        this._customStyles.boxShadow = el.style.boxShadow || '';
        el.style.boxShadow = style.boxShadow;
      }
    }

    // Smooth auto-scroll to the element
    if (typeof el.scrollIntoView === 'function') {
      try {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      } catch {
        try { el.scrollIntoView(false); } catch {}
      }
    }

    const doc = this.doc || (typeof document !== 'undefined' ? document : null);

    // Floating executive pulse badge
    if (label && doc) {
      const badge = doc.createElement('div');
      badge.className = 'spotlight-badge';
      badge.classList.add('spotlight-badge');
      badge.setAttribute('role', 'status');
      badge.setAttribute('aria-live', 'polite');

      const pulse = doc.createElement('span');
      pulse.className = 'spotlight-pulse';
      pulse.classList.add('spotlight-pulse');
      pulse.setAttribute('aria-hidden', 'true');

      const text = doc.createElement('span');
      text.className = 'spotlight-badge-text';
      text.classList.add('spotlight-badge-text');
      text.textContent = label;

      badge.appendChild(pulse);
      badge.appendChild(text);

      const voidTags = ['INPUT', 'IMG', 'HR', 'BR'];
      if (voidTags.includes(el.tagName)) {
        (el.parentElement || doc.body).appendChild(badge);
      } else {
        el.appendChild(badge);
      }
      this.activeBadge = badge;
    }

    // Backdrop overlay
    const wantsBackdrop = Boolean(backdrop || style?.backdrop || this.options.backdrop);
    if (wantsBackdrop && doc) {
      let bEl = doc.querySelector('.spotlight-backdrop');
      if (!bEl) {
        bEl = doc.createElement('div');
        bEl.className = 'spotlight-backdrop';
        bEl.classList.add('spotlight-backdrop');
        if (doc.body) doc.body.appendChild(bEl);
      }
      bEl.classList.add('visible');
      bEl.onclick = () => this.clear();
      this.backdropElement = bEl;
    }

    // Auto cleanup after durationMs
    const duration = typeof durationMs === 'number' ? durationMs : this.options.defaultDurationMs;
    if (duration > 0 && duration !== Infinity) {
      this.timer = setTimeout(() => {
        this.clear();
      }, duration);
    }

    return el;
  }

  clear() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.activeElement) {
      this.activeElement.classList.remove('spotlight-active');
      if (this._customStyles) {
        for (const [key, val] of Object.entries(this._customStyles)) {
          this.activeElement.style[key] = val;
        }
        this._customStyles = null;
      }
      this.activeElement = null;
    }

    if (this.activeBadge) {
      if (typeof this.activeBadge.remove === 'function') {
        this.activeBadge.remove();
      } else if (this.activeBadge.parentElement) {
        this.activeBadge.parentElement.removeChild(this.activeBadge);
      }
      this.activeBadge = null;
    }

    if (this.backdropElement) {
      this.backdropElement.classList.remove('visible');
      if (typeof this.backdropElement.remove === 'function') {
        this.backdropElement.remove();
      } else if (this.backdropElement.parentElement) {
        this.backdropElement.parentElement.removeChild(this.backdropElement);
      }
      this.backdropElement = null;
    }
  }

  destroy() {
    this.clear();
    if (this.win && typeof this.win.removeEventListener === 'function') {
      this.win.removeEventListener('executive:spotlight', this.onSpotlight);
      this.win.removeEventListener('executive:spotlight:clear', this.onClearEvent);
    }
  }
}

let defaultSpotlight = null;

export function getSpotlight(options) {
  if (!defaultSpotlight && typeof window !== 'undefined') {
    defaultSpotlight = new ScreenSpotlight(options);
  }
  return defaultSpotlight;
}

export function spotlight_element({ target, label, durationMs, style, backdrop } = {}) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('executive:spotlight', {
      detail: { target, label, durationMs, style, backdrop },
    }));
  }
  return { ok: true, target, label, durationMs };
}

if (typeof window !== 'undefined') {
  if (!window.__screenSpotlight) {
    window.__screenSpotlight = new ScreenSpotlight();
  }
  window.spotlightElement = spotlight_element;
}
