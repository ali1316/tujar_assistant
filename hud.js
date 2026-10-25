// HUD — نوافذ منبثقة سينمائية تفتحها نورة بأمر صوتي (مشاريع، رسوم، نظرة عامة)
// الاستخدام: const hud = createHUD({ api }); ثم hud.showProject({name}) / hud.showChart({...}) / hud.showOverview() / hud.closeAll()

const CSS = `
/* الرسوم تنعرض داخل الشاشة الرئيسية نفسها (مكان البيانات) بهوية اتحاد الغرف: كحلي + ذهبي */
.hud{--c:#d1a65c;--c2:#5f86b3;--sand:#e8d3a8;--warn:#e6b450;--bad:#e0705f;--ok:#59c48f;--pn:#0e2238;--ln:#1d3a5a;--mt:#8ea3bd;
  position:relative;width:100%;background:var(--pn);border:1px solid var(--ln);border-radius:12px;padding:20px 22px 22px;color:#eef2f7;
  font-family:var(--font),'IBM Plex Sans Arabic',system-ui,sans-serif;animation:hud-in .5s cubic-bezier(.2,.9,.2,1) both}
.hud.out{animation:hud-out .25s ease-in both}
@keyframes hud-in{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@keyframes hud-out{to{opacity:0;transform:translateY(-8px)}}
.hud header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid var(--ln)}
.hud .eyebrow{font-size:12px;font-weight:700;color:var(--c);letter-spacing:0}
.hud h3{margin:6px 0 0;font-size:24px;font-weight:700;color:#fff}
.hud .sub{color:var(--mt);font-size:13px;margin-top:4px}
.hud .x{background:transparent;border:1px solid #2b4a6c;color:var(--c);border-radius:8px;padding:6px 12px;cursor:pointer;font:inherit;font-size:13px;flex:none;white-space:nowrap}
.hud .x:hover{background:rgba(209,166,92,.12)}
.hud .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}
.hud .cell{border:1px solid var(--ln);background:#0b1d31;border-radius:10px;padding:14px;min-width:0;opacity:0;animation:hud-cell .45s ease-out both}
@keyframes hud-cell{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.hud .lbl{font-size:13px;color:var(--mt)}
.hud .big{font:700 32px/1.1 var(--num-font,var(--font)),'IBM Plex Sans Arabic',sans-serif;color:#fff;font-variant-numeric:tabular-nums;margin-top:6px}
.hud .kpis .cell:first-child .big{color:var(--c)}
.hud .big small{font-size:14px;color:var(--mt);font-weight:500;font-family:var(--font),'IBM Plex Sans Arabic',sans-serif}
.hud .gauge{display:grid;place-items:center;position:relative}
.hud .gauge svg{width:150px;height:150px;transform:rotate(-90deg)}
.hud .gauge .val{position:absolute;text-align:center}
.hud .bar{height:8px;background:#16304d;border-radius:4px;overflow:hidden;margin-top:10px}
.hud .bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--c),var(--sand));transition:width 1.2s cubic-bezier(.2,.9,.2,1)}
.hud .bar.hot i{background:linear-gradient(90deg,var(--warn),var(--bad))}
.hud .pill{display:inline-block;padding:3px 10px;border-radius:99px;font-size:12px;border:1px solid currentColor}
.hud .chart{position:relative;height:240px}
.hud ul.tk{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:6px;font-size:13px}
.hud ul.tk li{display:flex;justify-content:space-between;gap:8px;border-bottom:1px solid var(--ln);padding-bottom:6px}
.hud .vl{width:100%;min-height:340px;animation:hud-cell .6s .15s ease-out both}
.hud .vl,.hud .vl .vega-embed{width:100%;direction:ltr}.hud .vl details{display:none}
.hud .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-bottom:16px}
.hud ul.ins{list-style:none;margin:16px 0 0;padding:0;display:grid;gap:8px}
.hud ul.ins li{font-size:14px;line-height:1.7;background:#0b1d31;border:1px solid var(--ln);border-radius:8px;padding:9px 12px;opacity:0;animation:hud-cell .45s ease-out both}
.hud ul.ins li::before{content:"✓";color:var(--c);margin-inline-end:8px;font-weight:700}
.hud .err{color:var(--bad);font-family:ui-monospace,monospace;font-size:12px;direction:ltr;text-align:left;white-space:pre-wrap}
@media (prefers-reduced-motion:reduce){.hud,.hud .cell,.hud .vl{animation:none!important;opacity:1}}
`;

const STATUS_COLOR = { 'مكتمل': 'var(--ok)', 'متأخر': 'var(--bad)', 'متوقف': 'var(--warn)', 'قيد التنفيذ': 'var(--c2)' };
const PRI_COLOR = { 'عالية': '#e0705f', 'متوسطة': '#e6b450', 'منخفضة': '#59c48f' };
const PALETTE = ['#d1a65c', '#5f86b3', '#e8d3a8', '#4fb3a9', '#c97a5b', '#8fa7c4', '#9b86c9', '#7fae6e'];
const fmt = n => new Intl.NumberFormat(window.NORA_NUMERALS === 'latin' ? 'ar-SA-u-nu-latn' : 'ar-SA').format(Math.round(n));
// أسماء الشهور والأيام بالعربي في رسوم Vega (بدل January/Monday)
const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const AR_DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
// هوية موحّدة: نفس خط الواجهة وشكل أرقامها في كل الرسوم
const brandFont = () => { const f = getComputedStyle(document.documentElement).getPropertyValue('--font').trim().replace(/^['"]|['"]$/g, ''); return `'${f || 'IBM Plex Sans Arabic'}', 'IBM Plex Sans Arabic', sans-serif`; };
const numLocale = () => ({ decimal: '.', thousands: ',', grouping: [3], currency: ['', ' ر.س'], ...(window.NORA_NUMERALS === 'latin' ? {} : { numerals: ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'], decimal: '٫', thousands: '٬' }) });
const AR_TIME_LOCALE = { dateTime: '%A، %e %B %Y، %X', date: '%d/%m/%Y', time: '%H:%M:%S', periods: ['ص', 'م'],
  days: AR_DAYS, shortDays: AR_DAYS, months: AR_MONTHS, shortMonths: AR_MONTHS };

export function createHUD({ api, mount }) {
  const style = document.createElement('style'); style.textContent = CSS; document.head.append(style);
  // mount = { el: حاوية العرض داخل الشاشة الرئيسية, show(): تخفي البيانات الأساسية, home(): ترجّعها }
  const layer = mount?.el || document.body;
  const panels = [];

  if (window.Chart) {
    Chart.defaults.color = '#8ea3bd';
    Chart.defaults.font.family = "'IBM Plex Sans Arabic', system-ui, sans-serif";
    Chart.defaults.borderColor = '#16304d';
  }

  const EYEBROW = { 'PROJECT · SCAN': 'تفاصيل مشروع', 'DATA · VISUAL': 'رسم بياني', 'PORTFOLIO · OVERVIEW': 'نظرة شاملة', 'LIVE · RENDER': 'رسم من بياناتك', 'TYPE · LIBRARY': 'مكتبة الخطوط', 'LAUNCH · READY': 'جاهز للفتح' };
  // عرض واحد في كل مرة: الرسم الجديد ياخذ مكان اللي قبله، و«رجوع» يرجّع البيانات الأساسية
  function panel(eyebrow, title, sub) {
    [...panels].forEach(p => close(p, true));
    const el = document.createElement('section');
    el.className = 'hud';
    el.innerHTML = `<header><div><div class="eyebrow"></div><h3></h3><div class="sub"></div></div><button class="x" type="button">↩ رجوع للرئيسية</button></header><div class="body"></div>`;
    el.querySelector('.eyebrow').textContent = '✦ ' + (EYEBROW[eyebrow] || eyebrow);
    el.querySelector('h3').textContent = title;
    el.querySelector('.sub').textContent = sub || '';
    el.querySelector('.x').onclick = () => closeAll();
    layer.append(el); panels.push(el);
    mount?.show?.(title);
    return el;
  }
  function close(el, replacing) {
    const i = panels.indexOf(el); if (i < 0) return;
    panels.splice(i, 1);
    el._charts?.forEach(c => c.destroy());
    if (replacing) el.remove(); else { el.classList.add('out'); setTimeout(() => el.remove(), 250); }
    if (!panels.length && !replacing) mount?.home?.();
  }
  function closeAll() { const had = panels.length; [...panels].forEach(p => close(p)); if (!had) mount?.home?.(); return { back_to_main_screen: true }; }
  const current = () => panels.map(p => p.querySelector('h3').textContent);

  function countUp(el, to, suffix = '') {
    const t0 = performance.now(), d = 1300;
    const step = now => { const p = Math.min(1, (now - t0) / d), e = 1 - Math.pow(1 - p, 3); el.innerHTML = fmt(to * e) + suffix; if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  function cell(parent, html, delay, span) {
    const c = document.createElement('div'); c.className = 'cell'; c.style.animationDelay = `${delay}ms`;
    if (span) c.style.gridColumn = span === true ? '1 / -1' : span;
    c.innerHTML = html; parent.append(c); return c;
  }
  function gauge(pct) {
    const r = 62, C = 2 * Math.PI * r;
    return `<div class="gauge"><svg viewBox="0 0 150 150"><circle cx="75" cy="75" r="${r}" fill="none" stroke="#16304d" stroke-width="12"/>
      <circle class="arc" cx="75" cy="75" r="${r}" fill="none" stroke="url(#hg)" stroke-width="12" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}" style="transition:stroke-dashoffset 1.6s cubic-bezier(.2,.9,.2,1)" data-to="${C * (1 - pct / 100)}"/>
      <defs><linearGradient id="hg"><stop offset="0" stop-color="#d1a65c"/><stop offset="1" stop-color="#e8d3a8"/></linearGradient></defs></svg>
      <div class="val"><div class="big" data-count="${pct}" data-suffix="<small>٪</small>">0</div><div class="lbl">نسبة الإنجاز</div></div></div>`;
  }
  function animate(el) {
    requestAnimationFrame(() => setTimeout(() => {
      el.querySelectorAll('.arc').forEach(a => a.style.strokeDashoffset = a.dataset.to);
      el.querySelectorAll('.bar i').forEach(b => b.style.width = b.dataset.w + '%');
      el.querySelectorAll('[data-count]').forEach(n => countUp(n, +n.dataset.count, n.dataset.suffix || ''));
    }, 250));
  }
  function chart(el, canvas, cfg) {
    if (!window.Chart) { canvas.replaceWith(Object.assign(document.createElement('div'), { textContent: 'مكتبة الرسوم ما تحمّلت' })); return; }
    Chart.defaults.font.family = brandFont();
    const c = new Chart(canvas, cfg); (el._charts ||= []).push(c);
  }

  async function showProject(args) {
    const d = await api('/api/tools/get_project_details', args);
    if (d.error) return d;
    const { project: p, tickets, stats } = d;
    const el = panel('PROJECT · SCAN', p.name, `${p.department} · المسؤول: ${p.owner}`);
    const body = el.querySelector('.body');
    const g = document.createElement('div'); g.className = 'grid'; body.append(g);
    cell(g, gauge(p.progress), 150);
    const hot = stats.budget_used_pct > p.progress + 10;
    cell(g, `<div class="lbl">الميزانية المصروفة</div><div class="big" data-count="${p.spent}" data-suffix=" <small>ر.س</small>">0</div>
      <div class="lbl" style="margin-top:4px">من أصل ${fmt(p.budget)} ر.س · ${stats.budget_used_pct}٪</div>
      <div class="bar ${hot ? 'hot' : ''}"><i data-w="${stats.budget_used_pct}"></i></div>
      ${hot ? '<div class="lbl" style="color:var(--bad);margin-top:8px">⚠ الصرف أسرع من الإنجاز</div>' : ''}`, 300);
    cell(g, `<div class="lbl">الحالة</div><div style="margin:8px 0"><span class="pill" style="color:${STATUS_COLOR[p.status] || 'var(--c)'}">${p.status}</span></div>
      <div class="lbl">${stats.days_left >= 0 ? 'باقي على التسليم' : 'متأخر عن التسليم'}</div>
      <div class="big" data-count="${Math.abs(stats.days_left)}" data-suffix=" <small>يوم</small>">0</div><div class="lbl">${p.due_date}</div>`, 450);
    const tc = cell(g, `<div class="lbl">التذاكر حسب الأولوية · ${stats.open_tickets} مفتوحة</div><div class="chart" style="height:170px"><canvas></canvas></div>`, 600);
    const pri = ['عالية', 'متوسطة', 'منخفضة'];
    chart(el, tc.querySelector('canvas'), {
      type: 'doughnut',
      data: { labels: pri, datasets: [{ data: pri.map(x => tickets.filter(t => t.priority === x).length), backgroundColor: pri.map(x => PRI_COLOR[x]), borderColor: '#0e2238', borderWidth: 3 }] },
      options: { maintainAspectRatio: false, cutout: '68%', plugins: { legend: { position: 'right' } }, animation: { animateRotate: true, duration: 1400 } },
    });
    if (tickets.length) cell(g, `<div class="lbl">آخر التذاكر</div><ul class="tk">${tickets.slice(0, 5).map(t =>
      `<li><span>#${t.id} ${t.title}</span><span class="pill" style="color:${PRI_COLOR[t.priority]}">${t.status}</span></li>`).join('')}</ul>`, 750, 'span 2');
    animate(el);
    return { shown: true, project: p.name, progress: p.progress, ...stats };
  }

  function showChart({ title, chart_type = 'bar', labels = [], values = [], unit = '' }) {
    const el = panel('DATA · VISUAL', title, unit ? `الوحدة: ${unit}` : '');
    const body = el.querySelector('.body');
    const c = cell(body, `<div class="chart" style="height:300px"><canvas></canvas></div>`, 150);
    const round = chart_type === 'doughnut';
    chart(el, c.querySelector('canvas'), {
      type: chart_type,
      data: { labels, datasets: [{ label: title, data: values,
        backgroundColor: round ? labels.map((_, i) => PALETTE[i % PALETTE.length]) : chart_type === 'line' ? 'rgba(209,166,92,.18)' : '#d1a65c',
        borderColor: round ? '#0e2238' : '#d1a65c', borderWidth: round ? 3 : 2, borderRadius: 4, maxBarThickness: 46, fill: true, tension: .35,
        pointBackgroundColor: '#e8d3a8', maxBarThickness: 46, pointRadius: 4 }] },
      options: { maintainAspectRatio: false, animation: { duration: 1500, easing: 'easeOutQuart' },
        plugins: { legend: { display: round || chart_type === 'radar' }, tooltip: { callbacks: { label: x => `${fmt(x.raw)} ${unit}` } } },
        scales: round ? {} : chart_type === 'radar' ? { r: { grid: { color: '#16304d' }, angleLines: { color: '#16304d' }, pointLabels: { color: '#c9d6e6' }, ticks: { display: false } } }
          : { x: { ticks: { color: '#c9d6e6' } }, y: { ticks: { callback: v => fmt(v) } } } },
    });
    return { shown: true, title };
  }

  async function showOverview() {
    const d = await api('/api/dashboard');
    const s = d.summary;
    const el = panel('PORTFOLIO · OVERVIEW', 'نظرة شاملة على المشاريع', `${d.projects.length} مشاريع · ${s.open_tickets} تذاكر مفتوحة`);
    const g = document.createElement('div'); g.className = 'grid'; el.querySelector('.body').append(g);
    const used = Math.round((s.total_spent / s.total_budget) * 100);
    cell(g, `<div class="lbl">إجمالي الميزانية</div><div class="big" data-count="${s.total_budget}" data-suffix=" <small>ر.س</small>">0</div>
      <div class="lbl" style="margin-top:6px">المصروف ${used}٪</div><div class="bar"><i data-w="${used}"></i></div>`, 150);
    const risky = d.projects.filter(p => ['متأخر', 'متوقف'].includes(p.status));
    cell(g, `<div class="lbl">تذاكر عالية الأولوية مفتوحة</div><div class="big" data-count="${s.high_priority_open}" style="color:#e0705f">0</div>
      <div class="lbl" style="margin-top:12px">تحتاج انتباه</div><ul class="tk">${risky.map(p =>
      `<li><span>${p.name}</span><span class="pill" style="color:${STATUS_COLOR[p.status]}">${p.status}</span></li>`).join('')}</ul>`, 250);
    const c1 = cell(g, `<div class="lbl">المشاريع حسب الحالة</div><div class="chart" style="height:180px"><canvas></canvas></div>`, 350);
    chart(el, c1.querySelector('canvas'), {
      type: 'doughnut',
      data: { labels: s.projects_by_status.map(x => x.status), datasets: [{ data: s.projects_by_status.map(x => x.count),
        backgroundColor: s.projects_by_status.map(x => ({ 'مكتمل': '#59c48f', 'متأخر': '#e0705f', 'متوقف': '#e6b450' })[x.status] || '#5f86b3'), borderColor: '#0e2238', borderWidth: 3 }] },
      options: { maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'right' } } },
    });
    const c2 = cell(g, `<div class="lbl">الميزانية مقابل المصروف لكل مشروع (ر.س)</div><div class="chart" style="height:230px"><canvas></canvas></div>`, 500, true);
    chart(el, c2.querySelector('canvas'), {
      type: 'bar',
      data: { labels: d.projects.map(p => p.name), datasets: [
        { label: 'الميزانية', data: d.projects.map(p => p.budget), backgroundColor: '#5f86b3', borderRadius: 4, maxBarThickness: 40 },
        { label: 'المصروف', data: d.projects.map(p => p.spent), backgroundColor: '#d1a65c', borderRadius: 4, maxBarThickness: 40 }] },
      options: { maintainAspectRatio: false, animation: { duration: 1500 }, scales: { x: { ticks: { color: '#c9d6e6', font: { size: 11 } } }, y: { ticks: { callback: v => fmt(v / 1000) + 'K' } } } },
    });
    animate(el);
    return { shown: true, projects: d.projects.length, total_budget: s.total_budget, total_spent: s.total_spent, open_tickets: s.open_tickets };
  }

  // ===== رسم يُولّد في اللحظة: نورة تكتب مواصفة Vega-Lite =====
  let vegaReady;
  const loadScript = src => new Promise((ok, bad) => { const t = document.createElement('script'); t.src = src; t.onload = ok; t.onerror = () => bad(new Error('تعذّر تحميل ' + src)); document.head.append(t); });
  function loadVega() {
    return vegaReady ??= (async () => {
      await loadScript('https://cdn.jsdelivr.net/npm/vega@5.30.0/build/vega.min.js');
      await loadScript('https://cdn.jsdelivr.net/npm/vega-lite@5.21.0/build/vega-lite.min.js');
      await loadScript('https://cdn.jsdelivr.net/npm/vega-embed@6.26.0/build/vega-embed.min.js');
    })();
  }
  const VEGA_CONFIG = {
    background: null, padding: 6,
    font: "'IBM Plex Sans Arabic', system-ui, sans-serif",
    view: { stroke: null },
    axis: { labelColor: '#8ea3bd', titleColor: '#8ea3bd', gridColor: '#16304d', domainColor: '#2b4a6c', tickColor: '#2b4a6c', labelFontSize: 13, titleFontSize: 13, labelLimit: 220, titlePadding: 10 },
    legend: { labelColor: '#c9d6e6', titleColor: '#8ea3bd', labelFontSize: 13, symbolType: 'square', labelLimit: 220, orient: 'bottom', direction: 'horizontal', columnPadding: 18 },
    title: { color: '#eef2f7' },
    range: { category: PALETTE, ramp: ['#16304d', '#5f86b3', '#d1a65c', '#e8d3a8'], heatmap: ['#16304d', '#5f86b3', '#d1a65c', '#e8d3a8'] },
    mark: { color: '#d1a65c' },
    bar: { cornerRadiusEnd: 4, discreteBandSize: { band: 0.7 } },
    arc: { stroke: '#0e2238', strokeWidth: 3 },
    area: { opacity: 0.35, line: true },
    line: { strokeWidth: 3 }, point: { filled: true, size: 70 },
    text: { color: '#e8d3a8', fontSize: 12 },
  };

  async function showVisual({ title, subtitle = '', vega_lite, kpis = [], insights = [] }) {
    let spec;
    try { spec = typeof vega_lite === 'string' ? JSON.parse(vega_lite) : vega_lite; }
    catch (e) { return { error: 'vega_lite مو JSON صالح: ' + e.message }; }
    if (!spec || typeof spec !== 'object') return { error: 'vega_lite فاضي' };
    // الواجهة تتحكم بالحجم والشكل
    delete spec.width; delete spec.height; delete spec.background; delete spec.config; delete spec.autosize;
    if (!spec.hconcat && !spec.vconcat && !spec.concat && !spec.facet && !spec.repeat) { spec.width = 'container'; spec.height = Math.min(Math.max(innerHeight - 500, 280), 480); }
    const font = brandFont();
    spec.config = { ...VEGA_CONFIG, font, axis: { ...VEGA_CONFIG.axis, labelFont: font, titleFont: font }, legend: { ...VEGA_CONFIG.legend, labelFont: font, titleFont: font }, title: { ...VEGA_CONFIG.title, font, subtitleFont: font }, text: { ...VEGA_CONFIG.text, font } };
    spec.autosize = { type: 'fit', contains: 'padding' };
    try { await loadVega(); } catch (e) { return { error: e.message }; }

    const el = panel('LIVE · RENDER', title, subtitle);
    const body = el.querySelector('.body');
    if (kpis.length) {
      const k = document.createElement('div'); k.className = 'kpis'; body.append(k);
      kpis.slice(0, 4).forEach((x, i) => cell(k, `<div class="lbl">${esc(x.label)}</div><div class="big" data-count="${+x.value || 0}" data-suffix=" <small>${esc(x.unit || '')}</small>">0</div>`, 150 + i * 120));
    }
    const box = document.createElement('div'); box.className = 'vl'; body.append(box);
    try {
      await vegaEmbed(box, spec, { actions: false, renderer: 'svg', timeFormatLocale: AR_TIME_LOCALE, formatLocale: numLocale() });
      // السنوات والتواريخ في المحاور تتبع شكل الأرقام المختار
      if (window.NORA_NUMERALS !== 'latin') box.querySelectorAll('svg text').forEach(t => { t.textContent = t.textContent.replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]); });
    } catch (e) {
      box.innerHTML = `<div class="err">${esc(e.message)}</div>`;
      setTimeout(() => closeAll(), 2500);
      return { error: 'فشل الرسم: ' + e.message };
    }
    if (insights.length) {
      const ul = document.createElement('ul'); ul.className = 'ins'; body.append(ul);
      insights.slice(0, 3).forEach((t, i) => { const li = document.createElement('li'); li.textContent = t; li.style.animationDelay = `${1300 + i * 450}ms`; ul.append(li); });
    }
    animate(el);
    return { shown: true, title };
  }
  // معرض الخطوط: كل خط بعينة حيّة، والضغط عليه يطبّقه
  // نتيجة نصية (مثل نتيجة مهمة Claude) تنعرض على الشاشة بنفس الهوية
  function showNote({ title, subtitle = '', text = '', eyebrow = 'نتيجة' }) {
    const el = panel(eyebrow, title, subtitle);
    const ul = document.createElement('ul'); ul.className = 'ins';
    String(text).split(/\n+/).map(t => t.trim()).filter(Boolean).forEach((t, i) => { const li = document.createElement('li'); li.textContent = t; li.style.animationDelay = `${150 + i * 200}ms`; ul.append(li); });
    el.querySelector('.body').append(ul);
    return { shown: true };
  }
  function showFontGallery(fonts, current, onPick) {
    const el = panel('TYPE · LIBRARY', 'مكتبة الخطوط', `${Object.keys(fonts).length} خط عربي · الحالي: ${current}`);
    const g = document.createElement('div'); g.className = 'grid'; el.querySelector('.body').append(g);
    Object.entries(fonts).forEach(([name, desc], i) => {
      const c = cell(g, `<div class="lbl" style="font-family:system-ui">${esc(name)} · ${esc(desc)}</div>
        <div style="font-family:'${name}';font-size:24px;margin-top:6px;color:#eef2f7">نورة تدير لوحتك ١٢٣</div>`, 80 + i * 45);
      c.style.cursor = 'pointer';
      if (name === current) c.style.borderColor = 'var(--c)';
      c.onclick = () => { onPick?.(name); g.querySelectorAll('.cell').forEach(x => x.style.borderColor = ''); c.style.borderColor = 'var(--c)'; };
    });
    return { shown: true };
  }
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  // زر فتح كبير (لما المتصفح يمنع فتح النافذة تلقائياً)
  function showLink(url, label = '') {
    const el = panel('LAUNCH · READY', 'جاهز للفتح', label);
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener';
    a.textContent = '🚀 افتح الحين';
    a.style.cssText = 'display:block;text-align:center;padding:16px;margin-top:6px;border:1px solid var(--c);border-radius:10px;color:#081726;font-size:18px;font-weight:700;text-decoration:none;background:var(--c)';
    a.onclick = () => setTimeout(() => closeAll(), 300);
    el.querySelector('.body').append(a);
    return { shown: true };
  }

  document.addEventListener('keydown', e => { if (e.key === 'Escape' && panels.length) closeAll(); });

  return {
    showProject, showChart, showOverview, showVisual, showFontGallery, showLink, showNote, closeAll, current,
    // جاهزة كـ clientTools للوكيل
    tools: { show_project_visual: showProject, show_chart: showChart, show_overview: showOverview, render_visual: showVisual, close_visuals: closeAll, back_to_main: closeAll },
  };
}
