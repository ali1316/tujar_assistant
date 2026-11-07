// public/js/radar.js — رادار المخاطر والتناقضات التنفيذية
// Executive Risk & Discrepancy Radar for Nora Dashboard

let radarRisks = [];
let activeFilter = 'all';
let isDrawerOpen = false;

// Helpers
const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);
const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = n => Number(n || 0).toLocaleString('ar-SA');

/**
 * حقن أنماط CSS الخاصة برادار المخاطر
 */
function injectRadarStyles() {
  if (document.getElementById('radar-styles')) return;
  const style = document.createElement('style');
  style.id = 'radar-styles';
  style.textContent = `
    /* زر ومؤشر رادار المخاطر في الشريط العلوي */
    .radar-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(14, 34, 56, 0.85);
      border: 1px solid var(--line, #1d3a5a);
      color: var(--ink, #eef2f7);
      padding: 6px 14px;
      border-radius: 99px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.25s ease;
      position: relative;
      user-select: none;
      backdrop-filter: blur(8px);
    }
    .radar-pill:hover {
      border-color: var(--acc, #d1a65c);
      background: rgba(20, 48, 79, 0.95);
      transform: translateY(-1px);
    }
    .radar-pill:focus-visible {
      outline: 2px solid var(--acc, #d1a65c);
      outline-offset: 2px;
    }
    .radar-pill .radar-icon {
      width: 16px;
      height: 16px;
      color: var(--acc, #d1a65c);
      flex-shrink: 0;
      transition: transform 0.3s ease;
    }
    .radar-pill:hover .radar-icon {
      transform: rotate(45deg);
    }
    .radar-pill .radar-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 20px;
      height: 20px;
      padding: 0 6px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 700;
      background: #1d3a5a;
      color: var(--ink, #eef2f7);
      line-height: 1;
    }
    .radar-pill.has-critical {
      border-color: rgba(224, 112, 95, 0.6);
      background: rgba(45, 18, 22, 0.7);
      box-shadow: 0 0 14px rgba(224, 112, 95, 0.3);
      animation: radar-pulse 2.2s infinite;
    }
    .radar-pill.has-critical .radar-icon {
      color: var(--bad, #e0705f);
    }
    .radar-pill.has-critical .radar-badge {
      background: var(--bad, #e0705f);
      color: #ffffff;
    }
    .radar-pill.has-warning:not(.has-critical) {
      border-color: rgba(230, 180, 80, 0.6);
      background: rgba(45, 36, 16, 0.7);
    }
    .radar-pill.has-warning:not(.has-critical) .radar-icon {
      color: var(--warn, #e6b450);
    }
    .radar-pill.has-warning:not(.has-critical) .radar-badge {
      background: var(--warn, #e6b450);
      color: #081726;
    }

    @keyframes radar-pulse {
      0% { box-shadow: 0 0 0 0 rgba(224, 112, 95, 0.5); }
      70% { box-shadow: 0 0 0 10px rgba(224, 112, 95, 0); }
      100% { box-shadow: 0 0 0 0 rgba(224, 112, 95, 0); }
    }

    /* خلفية التعتيم */
    .radar-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(4, 11, 18, 0.7);
      backdrop-filter: blur(4px);
      z-index: 1000;
      opacity: 0;
      transition: opacity 0.3s ease;
      pointer-events: none;
    }
    .radar-backdrop.open {
      opacity: 1;
      pointer-events: auto;
    }

    /* الدرج الجانبي للرادار التنفيذي */
    .radar-drawer {
      position: fixed;
      top: 0;
      bottom: 0;
      left: 0;
      width: min(520px, 94vw);
      background: var(--bg, #081726);
      border-inline-end: 1px solid var(--line, #1d3a5a);
      box-shadow: 10px 0 40px rgba(0, 0, 0, 0.5);
      z-index: 1001;
      display: flex;
      flex-direction: column;
      transform: translateX(-100%);
      transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), visibility 0.35s;
      visibility: hidden;
      direction: rtl;
      font-family: inherit;
    }
    .radar-drawer.open {
      transform: translateX(0);
      visibility: visible;
    }

    /* رأس الدرج */
    .radar-header {
      padding: 18px 22px;
      border-bottom: 1px solid var(--line, #1d3a5a);
      background: linear-gradient(180deg, rgba(14, 34, 56, 0.95), rgba(8, 23, 38, 0.98));
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .radar-header-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .radar-title-group {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .radar-title-group h3 {
      margin: 0;
      font-size: 17px;
      font-weight: 700;
      color: var(--ink, #eef2f7);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .radar-close-btn {
      background: none;
      border: 1px solid var(--line, #1d3a5a);
      color: var(--mute, #8ea3bd);
      border-radius: 8px;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s;
    }
    .radar-close-btn:hover {
      background: rgba(255, 255, 255, 0.08);
      color: var(--ink, #eef2f7);
    }

    /* شرائح المقاييس */
    .radar-kpis {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .radar-kpi-chip {
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: 1px solid var(--line, #1d3a5a);
      background: rgba(18, 41, 67, 0.5);
      color: var(--sand, #e8d3a8);
    }
    .radar-kpi-chip.critical {
      background: rgba(61, 34, 38, 0.8);
      border-color: rgba(224, 112, 95, 0.5);
      color: var(--bad, #e0705f);
    }
    .radar-kpi-chip.warning {
      background: rgba(58, 50, 24, 0.8);
      border-color: rgba(230, 180, 80, 0.5);
      color: var(--warn, #e6b450);
    }

    /* أزرار التصفية */
    .radar-filters {
      display: flex;
      gap: 6px;
      overflow-x: auto;
      padding-bottom: 2px;
    }
    .radar-filter-btn {
      background: rgba(14, 34, 56, 0.6);
      border: 1px solid var(--line, #1d3a5a);
      color: var(--mute, #8ea3bd);
      border-radius: 99px;
      padding: 4px 12px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.2s;
    }
    .radar-filter-btn:hover {
      color: var(--ink, #eef2f7);
      border-color: var(--acc, #d1a65c);
    }
    .radar-filter-btn.active {
      background: var(--acc, #d1a65c);
      color: #081726;
      border-color: var(--acc, #d1a65c);
    }

    /* قائمة المخاطر */
    .radar-body {
      flex: 1;
      overflow-y: auto;
      padding: 18px 20px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    /* بطاقة الخطر */
    .risk-card {
      background: var(--panel, #0e2238);
      border: 1px solid var(--line, #1d3a5a);
      border-radius: 12px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      transition: transform 0.2s, border-color 0.2s;
      position: relative;
    }
    .risk-card:hover {
      border-color: rgba(209, 166, 92, 0.4);
      transform: translateY(-1px);
    }
    .risk-card.critical {
      border-inline-start: 4px solid var(--bad, #e0705f);
      background: linear-gradient(90deg, rgba(45, 18, 22, 0.35), var(--panel, #0e2238) 35%);
    }
    .risk-card.warning {
      border-inline-start: 4px solid var(--warn, #e6b450);
      background: linear-gradient(90deg, rgba(45, 36, 16, 0.35), var(--panel, #0e2238) 35%);
    }
    .risk-card.info {
      border-inline-start: 4px solid var(--steel, #5f86b3);
    }

    .risk-top-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .risk-badge {
      padding: 2px 8px;
      border-radius: 99px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.02em;
    }
    .risk-badge.critical {
      background: var(--bad, #e0705f);
      color: #ffffff;
    }
    .risk-badge.warning {
      background: var(--warn, #e6b450);
      color: #081726;
    }
    .risk-badge.info {
      background: var(--steel, #5f86b3);
      color: #ffffff;
    }

    .risk-category-tag {
      font-size: 11px;
      color: var(--mute, #8ea3bd);
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--line, #1d3a5a);
      padding: 2px 8px;
      border-radius: 6px;
    }
    .risk-project-tag {
      font-size: 11px;
      color: var(--sand, #e8d3a8);
      font-weight: 600;
      margin-inline-start: auto;
    }

    .risk-title {
      margin: 0;
      font-size: 14.5px;
      font-weight: 700;
      color: var(--ink, #eef2f7);
      line-height: 1.4;
    }
    .risk-desc {
      margin: 0;
      font-size: 13px;
      color: var(--mute, #8ea3bd);
      line-height: 1.5;
    }

    .risk-box {
      border-radius: 8px;
      padding: 9px 12px;
      font-size: 12.5px;
      line-height: 1.45;
    }
    .risk-box.impact {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.06);
      color: #d8e2ec;
    }
    .risk-box.impact b {
      color: var(--bad, #e0705f);
    }
    .risk-box.rec {
      background: rgba(209, 166, 92, 0.08);
      border: 1px solid rgba(209, 166, 92, 0.2);
      color: var(--sand, #e8d3a8);
    }
    .risk-box.rec b {
      color: var(--acc, #d1a65c);
    }

    /* أزرار الإجراءات الفورية */
    .risk-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 4px;
      padding-top: 10px;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
    }
    .risk-btn {
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s;
      border: 1px solid transparent;
    }
    .risk-btn-ask {
      background: rgba(209, 166, 92, 0.15);
      border-color: var(--acc, #d1a65c);
      color: var(--sand, #e8d3a8);
    }
    .risk-btn-ask:hover {
      background: var(--acc, #d1a65c);
      color: #081726;
    }
    .risk-btn-report {
      background: rgba(95, 134, 179, 0.15);
      border-color: var(--steel, #5f86b3);
      color: #c5dcf7;
    }
    .risk-btn-report:hover {
      background: var(--steel, #5f86b3);
      color: #ffffff;
    }

    /* حالة فارغة */
    .radar-empty {
      text-align: center;
      padding: 40px 20px;
      color: var(--mute, #8ea3bd);
    }
    .radar-empty svg {
      width: 48px;
      height: 48px;
      color: var(--ok, #59c48f);
      margin-bottom: 12px;
    }
  `;
  document.head.appendChild(style);
}

/**
 * جلب المخاطر من السيرفر
 */
export async function fetchRadarRisks() {
  try {
    const code = localStorage.getItem('accessCode') || '';
    const res = await fetch('/api/executive/radar', {
      headers: { 'x-access-code': code },
    });
    if (!res.ok) throw new Error('فشل استعلام الرادار');
    const data = await res.json();
    radarRisks = data.risks || [];
    updateRadarBadge(data.summary || {});
    if (isDrawerOpen) {
      renderRadarList();
    }
    return radarRisks;
  } catch (err) {
    console.warn('[radar] fetch warning:', err.message);
    return [];
  }
}

/**
 * تحديث شارة الرادار في الشريط العلوي
 */
function updateRadarBadge(summary) {
  const pill = document.querySelector('.radar-pill');
  const badge = document.getElementById('radarBadge');
  if (!pill || !badge) return;

  const critical = summary.critical || radarRisks.filter(r => r.severity === 'critical').length;
  const warning = summary.warning || radarRisks.filter(r => r.severity === 'warning').length;
  const total = radarRisks.length;

  pill.classList.remove('has-critical', 'has-warning');
  if (critical > 0) {
    pill.classList.add('has-critical');
    badge.textContent = `${critical} حرج`;
    pill.setAttribute('aria-label', `رادار المخاطر: ${critical} حالات حرجة و ${warning} تحذيرات`);
  } else if (warning > 0) {
    pill.classList.add('has-warning');
    badge.textContent = `${warning} تنبيه`;
    pill.setAttribute('aria-label', `رادار المخاطر: ${warning} تنبيهات`);
  } else {
    badge.textContent = `${total}`;
    pill.setAttribute('aria-label', 'رادار المخاطر والتناقضات التنفيذية: لا توجد مخاطر');
  }
}

/**
 * فتح الدرج الجانبي
 */
export function openRadarDrawer() {
  isDrawerOpen = true;
  injectRadarDOM();
  const drawer = document.getElementById('radarDrawer');
  const backdrop = document.getElementById('radarBackdrop');
  const pill = document.querySelector('.radar-pill');

  if (drawer && backdrop) {
    drawer.hidden = false;
    backdrop.hidden = false;
    requestAnimationFrame(() => {
      drawer.classList.add('open');
      backdrop.classList.add('open');
    });
  }
  if (pill) {
    pill.setAttribute('aria-expanded', 'true');
  }
  renderRadarList();
}

/**
 * إغلاق الدرج الجانبي
 */
export function closeRadarDrawer() {
  isDrawerOpen = false;
  const drawer = document.getElementById('radarDrawer');
  const backdrop = document.getElementById('radarBackdrop');
  const pill = document.querySelector('.radar-pill');

  if (drawer && backdrop) {
    drawer.classList.remove('open');
    backdrop.classList.remove('open');
    setTimeout(() => {
      if (!isDrawerOpen) {
        drawer.hidden = true;
        backdrop.hidden = true;
      }
    }, 350);
  }
  if (pill) {
    pill.setAttribute('aria-expanded', 'false');
  }
}

/**
 * رسم عناصر قائمة المخاطر في الدرج
 */
function renderRadarList() {
  const container = document.getElementById('radarList');
  if (!container) return;

  // تطبيق التصفية
  let filtered = radarRisks;
  if (activeFilter === 'critical') {
    filtered = radarRisks.filter(r => r.severity === 'critical');
  } else if (activeFilter === 'warning') {
    filtered = radarRisks.filter(r => r.severity === 'warning');
  } else if (activeFilter !== 'all') {
    filtered = radarRisks.filter(r => r.category === activeFilter);
  }

  // تحديث عدادات الشاشات
  const critCount = radarRisks.filter(r => r.severity === 'critical').length;
  const warnCount = radarRisks.filter(r => r.severity === 'warning').length;

  const kpisEl = document.getElementById('radarKpis');
  if (kpisEl) {
    kpisEl.innerHTML = `
      <span class="radar-kpi-chip">إجمالي المرصود: ${radarRisks.length}</span>
      <span class="radar-kpi-chip critical">● ${critCount} حرجة</span>
      <span class="radar-kpi-chip warning">▲ ${warnCount} تحذيرات</span>
    `;
  }

  if (!filtered.length) {
    container.innerHTML = `
      <div class="radar-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
        <p>لا توجد مخاطر أو تناقضات مسجلة ضمن هذه التصفية.</p>
      </div>
    `;
    return;
  }

  const categoryNames = {
    budget: 'الميزانية',
    timeline: 'الجدول الزمني',
    data: 'سلامة البيانات',
    quality: 'جودة المستندات',
  };

  const severityNames = {
    critical: 'حرج',
    warning: 'تحذير',
    info: 'معلومة',
  };

  container.innerHTML = filtered.map(r => `
    <article class="risk-card ${esc(r.severity)}" id="${esc(r.id)}">
      <div class="risk-top-meta">
        <span class="risk-badge ${esc(r.severity)}">${severityNames[r.severity] || r.severity}</span>
        <span class="risk-category-tag">${categoryNames[r.category] || r.category}</span>
        ${r.relatedProject ? `<span class="risk-project-tag">✦ ${esc(r.relatedProject)}</span>` : ''}
      </div>
      <h4 class="risk-title">${esc(r.title)}</h4>
      <p class="risk-desc">${esc(r.description)}</p>
      <div class="risk-box impact">
        <b>الأثر التنفيذي:</b> ${esc(r.impact)}
      </div>
      <div class="risk-box rec">
        <b>التوصية:</b> ${esc(r.recommendation)}
      </div>
      <div class="risk-actions">
        <button type="button" class="risk-btn risk-btn-ask" data-action="ask-nora" data-query="${esc(r.action || `نورة، وضحي لي تفاصيل: ${r.title}`)}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
          سؤال نورة
        </button>
        <button type="button" class="risk-btn risk-btn-report" data-action="fetch-report" data-project="${esc(r.relatedProject || '')}" data-title="${esc(r.title)}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
          </svg>
          استدعاء تقرير
        </button>
      </div>
    </article>
  `).join('');

  // ربط أزرار الإجراءات الفورية
  container.querySelectorAll('[data-action="ask-nora"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const query = btn.getAttribute('data-query');
      handleAskNora(query);
    });
  });

  container.querySelectorAll('[data-action="fetch-report"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const proj = btn.getAttribute('data-project');
      const title = btn.getAttribute('data-title');
      handleFetchReport(proj, title);
    });
  });
}

/**
 * إجراء: سؤال نورة
 */
function handleAskNora(query) {
  closeRadarDrawer();
  const txtInput = document.getElementById('txt');
  if (txtInput) {
    txtInput.value = query;
    txtInput.focus();
    const form = document.getElementById('f');
    if (form) {
      setTimeout(() => form.requestSubmit(), 100);
    } else {
      const sendBtn = document.getElementById('send');
      if (sendBtn) setTimeout(() => sendBtn.click(), 100);
    }
  }
}

/**
 * إجراء: استدعاء تقرير تنفيذي
 */
function handleFetchReport(projectName, riskTitle) {
  closeRadarDrawer();
  const txtInput = document.getElementById('txt');
  const query = projectName
    ? `نورة، اعرضي لي تقريراً تحليلياً شاملاً لمشروع «${projectName}»`
    : `نورة، اطلبي تقريراً مفصلاً حول: ${riskTitle}`;
  if (txtInput) {
    txtInput.value = query;
    txtInput.focus();
    const form = document.getElementById('f');
    if (form) {
      setTimeout(() => form.requestSubmit(), 100);
    } else {
      const sendBtn = document.getElementById('send');
      if (sendBtn) setTimeout(() => sendBtn.click(), 100);
    }
  }
}

/**
 * حقن واجهة الرادار في الصفحة إذا لم تكن موجودة
 */
function injectRadarDOM() {
  injectRadarStyles();

  // 1. زر الرادار في الهيدر
  if (!document.getElementById('radarPill')) {
    const topHeader = document.querySelector('header.top');
    if (topHeader) {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.id = 'radarPill';
      pill.className = 'radar-pill';
      pill.setAttribute('aria-label', 'رادار المخاطر والتناقضات التنفيذية');
      pill.setAttribute('aria-expanded', 'false');
      pill.setAttribute('aria-controls', 'radarDrawer');
      pill.innerHTML = `
        <svg class="radar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" stroke-opacity="0.35"/>
          <circle cx="12" cy="12" r="6" stroke-opacity="0.6"/>
          <circle cx="12" cy="12" r="2" fill="currentColor"/>
          <path d="M12 12 L19 5"/>
        </svg>
        <span class="radar-label">رادار المخاطر</span>
        <span class="radar-badge" id="radarBadge">…</span>
      `;
      pill.addEventListener('click', () => {
        if (isDrawerOpen) closeRadarDrawer();
        else openRadarDrawer();
      });

      // إضافة الزر بجوار الشريحة أو العنوان
      const chip = document.getElementById('chip');
      if (chip && chip.parentNode === topHeader) {
        topHeader.insertBefore(pill, chip);
      } else {
        topHeader.appendChild(pill);
      }
    }
  }

  // 2. هيكل الدرج والخلفية
  if (!document.getElementById('radarDrawer')) {
    const backdrop = document.createElement('div');
    backdrop.id = 'radarBackdrop';
    backdrop.className = 'radar-backdrop';
    backdrop.hidden = true;
    backdrop.addEventListener('click', closeRadarDrawer);
    document.body.appendChild(backdrop);

    const drawer = document.createElement('div');
    drawer.id = 'radarDrawer';
    drawer.className = 'radar-drawer';
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-modal', 'true');
    drawer.setAttribute('aria-labelledby', 'radarTitle');
    drawer.hidden = true;

    drawer.innerHTML = `
      <div class="radar-header">
        <div class="radar-header-top">
          <div class="radar-title-group">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--acc,#d1a65c)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <h3 id="radarTitle">رادار المخاطر والتناقضات التنفيذية</h3>
          </div>
          <button type="button" class="radar-close-btn" id="radarClose" aria-label="إغلاق رادار المخاطر">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18"/>
            </svg>
          </button>
        </div>

        <div class="radar-kpis" id="radarKpis"></div>

        <div class="radar-filters" role="group" aria-label="تصفية المخاطر">
          <button type="button" class="radar-filter-btn active" data-filter="all">الكل</button>
          <button type="button" class="radar-filter-btn" data-filter="critical">الحرجة فقط</button>
          <button type="button" class="radar-filter-btn" data-filter="budget">الميزانية</button>
          <button type="button" class="radar-filter-btn" data-filter="timeline">الجدول الزمني</button>
          <button type="button" class="radar-filter-btn" data-filter="data">البيانات</button>
          <button type="button" class="radar-filter-btn" data-filter="quality">الجودة</button>
        </div>
      </div>

      <div class="radar-body" id="radarList"></div>
    `;

    document.body.appendChild(drawer);

    // زر الإغلاق
    drawer.querySelector('#radarClose').addEventListener('click', closeRadarDrawer);

    // أزرار التصفية
    drawer.querySelectorAll('.radar-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        drawer.querySelectorAll('.radar-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeFilter = btn.getAttribute('data-filter') || 'all';
        renderRadarList();
      });
    });

    // إغلاق بـ Escape دون إغلاق أي شاشة أخرى
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape' && isDrawerOpen) {
        e.stopPropagation();
        closeRadarDrawer();
      }
    });
  }
}

/**
 * التهيئة التلقائية للرادار
 */
export function initRadar() {
  injectRadarDOM();
  fetchRadarRisks();
}

// تهيئة عند تحميل المستند
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRadar);
  } else {
    initRadar();
  }
}

// إتاحة الكائن برمجياً
if (typeof window !== 'undefined') {
  window.__radar = {
    init: initRadar,
    open: openRadarDrawer,
    close: closeRadarDrawer,
    refresh: fetchRadarRisks,
    getRisks: () => radarRisks,
  };
}
