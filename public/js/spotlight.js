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
    this.activeDetail = null;
    this.activeTarget = null;
    this.backdropElement = null;
    this.timer = null;
    this._customStyles = null;
    this._recoveryTimer = null;

    this.onSpotlight = this.onSpotlight.bind(this);
    this.onClearEvent = this.onClearEvent.bind(this);
    this.refreshActive = this.refreshActive.bind(this);

    if (this.win && this.options.autoListen !== false) {
      this.win.addEventListener('executive:spotlight', this.onSpotlight);
      this.win.addEventListener('executive:spotlight:clear', this.onClearEvent);
    }

    this.initDomRecovery();
  }

  initDomRecovery() {
    const doc = this.doc || (typeof document !== 'undefined' ? document : null);
    if (!doc || typeof MutationObserver === 'undefined') return;

    try {
      this._domObserver = new MutationObserver(() => {
        if (this.activeTarget && (!this.activeElement || !this.activeElement.isConnected)) {
          if (this._recoveryTimer) clearTimeout(this._recoveryTimer);
          this._recoveryTimer = setTimeout(() => {
            this.refreshActive();
          }, 40);
        }
      });

      const rootNode = doc.getElementById('home') || doc.body;
      if (rootNode) {
        this._domObserver.observe(rootNode, { childList: true, subtree: true });
      }
    } catch (e) {
      // MutationObserver fallback
    }
  }

  refreshActive() {
    if (!this.activeTarget || !this.activeDetail) return null;
    const doc = this.doc || (typeof document !== 'undefined' ? document : null);
    if (!doc) return null;

    // If currently tracked element is still healthy and in DOM, do nothing
    if (this.activeElement && this.activeElement.isConnected && this.activeElement.classList.contains('spotlight-active')) {
      return this.activeElement;
    }

    // Target was replaced or re-rendered by loadDashboard!
    const el = this.resolveTarget(this.activeTarget);
    if (el) {
      return this.highlight({ ...this.activeDetail, durationMs: Infinity }, { isRefresh: true });
    }
    return null;
  }

  onSpotlight(event) {
    const detail = event?.detail || event || {};
    if (!detail) return null;
    const hudCueText = this.doc?.querySelector ? this.doc.querySelector('#hudActiveCue .hud-cue-text') : null;
    if (hudCueText && detail.label) {
      hudCueText.textContent = detail.label;
      const parent = hudCueText.parentElement;
      if (parent) {
        parent.classList.remove('pulse');
        void parent.offsetWidth;
        parent.classList.add('pulse');
      }
    }
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

    // 2. Direct ID or CSS selector
    try {
      const el = doc.querySelector(query);
      if (el) return el;
    } catch {}

    // 3. Try with or without leading #
    try {
      const bareId = query.replace(/^#/, '');
      const byId = doc.getElementById ? doc.getElementById(bareId) : doc.querySelector(`#${bareId}`);
      if (byId) return byId;
    } catch {}

    // 4. Special resolver: Project ID (e.g. project-2, #project-2, 2)
    const projMatch = query.match(/project[-_]?(\d+)/i) || (query.match(/^\d+$/) ? [null, query] : null);
    if (projMatch) {
      const pId = projMatch[1];
      const pEl = doc.querySelector(`#project-${pId}, [data-project-id="${pId}"], [data-proj-id="${pId}"]`);
      if (pEl) return pEl.closest('tr') || pEl;
    }

    // 5. Special resolver: Budget & Spending KPI
    if (/budget|ميزانية|الميزانية|spent|المصروف/i.test(query)) {
      const bEl = doc.querySelector('#kpi-budget, [data-kpi="kpi-budget"]');
      if (bEl) return bEl;
      const kpis = doc.querySelectorAll('.kpi');
      for (const k of kpis) {
        if (/ميزانية|الميزانية|ر\.س/i.test(k.textContent || '')) return k;
      }
      const kpisWrap = doc.querySelector('#kpis');
      if (kpisWrap) return kpisWrap;
    }

    // 6. Special resolver: Tickets (e.g. ticket-1, #ticket-1, #tickets)
    const tMatch = query.match(/ticket[-_]?(\d+)/i);
    if (tMatch) {
      const tId = tMatch[1];
      const tRow = doc.querySelector(`#ticket-${tId}, [data-ticket-id="${tId}"]`);
      if (tRow) return tRow.closest('tr') || tRow;
    }
    if (/ticket|تذاكر|تذكرة/i.test(query)) {
      const tEl = doc.querySelector('#tickets, [data-v*="tickets"]');
      if (tEl) return tEl.closest('.card') || tEl;
    }

    // 7. Special resolver: Documents / Auto-DK
    if (/doc|وثائق|ملفات|مستند/i.test(query)) {
      const dEl = doc.querySelector('#docs, [data-v="files"], .card.docs');
      if (dEl) {
        const card = dEl.closest('.card') || dEl;
        card.removeAttribute('hidden');
        if (card.style) card.style.display = '';
        return card;
      }
    }

    // 8. Try data-attribute without brackets (e.g. data-project-id="1")
    if ((/^data-[a-z0-9_-]+=/i.test(query) || (!query.startsWith('[') && query.includes('='))) && !query.startsWith('#') && !query.startsWith('.')) {
      try {
        const el = doc.querySelector(`[${query}]`);
        if (el) return el;
      } catch {}
    }

    const qLower = query.toLowerCase();

    // 9. Search text content in table rows (tr, .tabulator-row)
    try {
      const rows = doc.querySelectorAll('tr, .tabulator-row');
      for (const row of rows) {
        const text = (row.textContent || '').trim().toLowerCase();
        if (text.includes(qLower)) {
          return row;
        }
      }
    } catch {}

    // 10. Search text content in dashboard cards, KPIs, headings, or list items
    try {
      const candidates = doc.querySelectorAll('.kpi, .card, .panel, li, td, th, h1, h2, h3, h4, [data-project-id], [data-v]');
      for (const item of candidates) {
        const text = (item.textContent || '').trim().toLowerCase();
        if (text.includes(qLower)) {
          return item;
        }
      }
    } catch {}

    return null;
  }

  highlight(detail = {}, { isRefresh = false } = {}) {
    const { target, label, durationMs, style = {}, backdrop = false } = detail;
    if (!target) return null;

    this.activeDetail = detail;
    this.activeTarget = target;

    // Clear previous spotlight visuals while preserving tracking target
    this.clear({ preserveTarget: true });

    const el = this.resolveTarget(target);
    if (!el) {
      console.warn?.('[spotlight] target not found:', target);
      return null;
    }

    // Un-hide element and any hidden ancestors
    let ancestor = el;
    while (ancestor && ancestor !== (this.doc?.body || document.body)) {
      if (ancestor.hasAttribute && ancestor.hasAttribute('hidden')) {
        ancestor.removeAttribute('hidden');
      }
      if (ancestor.style && ancestor.style.display === 'none') {
        ancestor.style.display = '';
      }
      ancestor = ancestor.parentElement;
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
    if (!isRefresh && typeof el.scrollIntoView === 'function') {
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

      if (el.tagName === 'TR') {
        const cell = el.querySelector('td:nth-child(2)') || el.querySelector('td') || el;
        cell.style.position = 'relative';
        cell.appendChild(badge);
        badge.style.top = '-16px';
        badge.style.insetInlineStart = '8px';
      } else {
        const voidTags = ['INPUT', 'IMG', 'HR', 'BR'];
        if (voidTags.includes(el.tagName)) {
          (el.parentElement || doc.body).appendChild(badge);
        } else {
          el.appendChild(badge);
        }
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

    // Auto cleanup after durationMs (if specified; otherwise remains active until next cue or clear)
    if (typeof durationMs === 'number' && durationMs > 0 && durationMs !== Infinity) {
      this.timer = setTimeout(() => {
        this.clear();
      }, durationMs);
    }

    return el;
  }

  clear({ preserveTarget = false } = {}) {
    if (!preserveTarget) {
      this.activeDetail = null;
      this.activeTarget = null;
    }

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
