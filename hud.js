// HUD — نوافذ منبثقة سينمائية تفتحها نورة بأمر صوتي (مشاريع، رسوم، نظرة عامة)
// الاستخدام: const hud = createHUD({ api }); ثم hud.showProject({name}) / hud.showChart({...}) / hud.showOverview() / hud.closeAll()

const CSS = `
.hud-layer{position:fixed;inset:0;pointer-events:none;z-index:50;display:grid;place-items:center;perspective:1400px}
.hud-dim{position:fixed;inset:0;background:radial-gradient(ellipse at center,rgba(4,18,40,.55),rgba(2,6,14,.82));opacity:0;transition:opacity .4s;pointer-events:none;z-index:49}
.hud-dim.on{opacity:1}
.hud{--c:#3ee6ff;--c2:#7a8cff;--warn:#ffb547;--bad:#ff5d73;--ok:#3dffa8;--glass:rgba(8,24,48,.78);
  position:absolute;pointer-events:auto;width:min(760px,calc(100vw - 32px));max-height:calc(100vh - 60px);overflow-y:auto;overflow-x:hidden;
  background:linear-gradient(160deg,rgba(20,60,110,.35),transparent 40%),var(--glass);
  border:1px solid rgba(62,230,255,.45);border-radius:6px;padding:20px 22px 18px;color:#dff8ff;
  box-shadow:0 0 0 1px rgba(62,230,255,.08),0 0 40px rgba(62,230,255,.25),inset 0 0 60px rgba(62,230,255,.08);
  backdrop-filter:blur(10px);font-family:'IBM Plex Sans Arabic',system-ui,sans-serif;
  animation:hud-in .75s cubic-bezier(.2,.9,.2,1) both;transform-origin:50% 60%}
.hud.out{animation:hud-out .35s ease-in both}
@keyframes hud-in{0%{opacity:0;transform:rotateX(55deg) scale(.6) translateY(80px);filter:blur(8px) brightness(3)}
  55%{opacity:1;filter:blur(0) brightness(1.6)}70%{transform:rotateX(-4deg) scale(1.02)}100%{transform:none;filter:none}}
@keyframes hud-out{to{opacity:0;transform:scale(.85) translateY(-30px);filter:blur(6px)}}
.hud::before{content:"";position:absolute;inset:0;pointer-events:none;border-radius:6px;
  background:repeating-linear-gradient(0deg,rgba(62,230,255,.05) 0 1px,transparent 1px 3px);mix-blend-mode:screen}
.hud::after{content:"";position:absolute;left:0;right:0;height:80px;top:-80px;pointer-events:none;
  background:linear-gradient(180deg,transparent,rgba(62,230,255,.25),transparent);animation:hud-scan 1.4s .2s ease-out 1 both}
@keyframes hud-scan{to{top:110%}}
.hud .crn{position:absolute;width:18px;height:18px;border:2px solid var(--c)}
.hud .crn.a{top:-1px;right:-1px;border-left:0;border-bottom:0}.hud .crn.b{top:-1px;left:-1px;border-right:0;border-bottom:0}
.hud .crn.c{bottom:-1px;right:-1px;border-left:0;border-top:0}.hud .crn.d{bottom:-1px;left:-1px;border-right:0;border-top:0}
.hud header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}
.hud .eyebrow{font:600 11px/1 ui-monospace,monospace;letter-spacing:.2em;color:var(--c);direction:ltr;text-align:right}
.hud h3{margin:6px 0 0;font-size:22px;font-weight:700;text-shadow:0 0 18px rgba(62,230,255,.6)}
.hud .sub{color:#8fc9dc;font-size:13px;margin-top:2px}
.hud .x{background:none;border:1px solid rgba(62,230,255,.4);color:var(--c);width:30px;height:30px;border-radius:4px;cursor:pointer;font-size:16px;flex:none}
.hud .x:hover{background:rgba(62,230,255,.15)}
.hud .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.hud .cell{border:1px solid rgba(62,230,255,.2);background:rgba(62,230,255,.04);border-radius:4px;padding:12px;min-width:0;
  opacity:0;animation:hud-cell .5s ease-out both}
@keyframes hud-cell{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
.hud .lbl{font-size:12px;color:#8fc9dc;letter-spacing:.04em}
.hud .big{font:700 30px/1.1 ui-monospace,monospace;color:#fff;text-shadow:0 0 14px rgba(62,230,255,.7);font-variant-numeric:tabular-nums;margin-top:6px}
.hud .big small{font-size:13px;color:#8fc9dc;font-weight:400}
.hud .gauge{display:grid;place-items:center;position:relative}
.hud .gauge svg{width:150px;height:150px;transform:rotate(-90deg);filter:drop-shadow(0 0 8px rgba(62,230,255,.6))}
.hud .gauge .val{position:absolute;text-align:center}
.hud .bar{height:10px;background:rgba(62,230,255,.12);border-radius:2px;overflow:hidden;margin-top:10px}
.hud .bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--c2),var(--c));box-shadow:0 0 12px var(--c);transition:width 1.4s cubic-bezier(.2,.9,.2,1)}
.hud .bar.hot i{background:linear-gradient(90deg,var(--warn),var(--bad));box-shadow:0 0 12px var(--bad)}
.hud .pill{display:inline-block;padding:3px 10px;border-radius:2px;font-size:12px;border:1px solid currentColor}
.hud .chart{position:relative;height:220px}
.hud ul.tk{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:6px;font-size:13px}
.hud ul.tk li{display:flex;justify-content:space-between;gap:8px;border-bottom:1px dashed rgba(62,230,255,.15);padding-bottom:5px}
.hud .typing{font-size:13px;color:var(--c);min-height:1.2em;margin-top:12px;font-family:ui-monospace,monospace;direction:ltr;text-align:right}
@media (prefers-reduced-motion:reduce){.hud,.hud .cell,.hud::after{animation:none!important;opacity:1}}
`;

const STATUS_COLOR = { 'مكتمل': 'var(--ok)', 'متأخر': 'var(--bad)', 'متوقف': 'var(--warn)', 'قيد التنفيذ': 'var(--c)' };
const PRI_COLOR = { 'عالية': '#ff5d73', 'متوسطة': '#ffb547', 'منخفضة': '#3dffa8' };
const PALETTE = ['#3ee6ff', '#7a8cff', '#3dffa8', '#ffb547', '#ff5d73', '#c38bff', '#5ab0ff'];
const fmt = n => new Intl.NumberFormat('ar-SA').format(Math.round(n));

export function createHUD({ api }) {
  const style = document.createElement('style'); style.textContent = CSS; document.head.append(style);
  const dim = Object.assign(document.createElement('div'), { className: 'hud-dim' });
  const layer = Object.assign(document.createElement('div'), { className: 'hud-layer' });
  document.body.append(dim, layer);
  dim.addEventListener('click', () => closeAll());
  const panels = [];
  let actx;

  if (window.Chart) {
    Chart.defaults.color = '#8fc9dc';
    Chart.defaults.font.family = "'IBM Plex Sans Arabic', system-ui, sans-serif";
    Chart.defaults.borderColor = 'rgba(62,230,255,.12)';
  }

  // صوت «فتح شاشة» مُركّب (بدون ملفات)
  function whoosh() {
    try {
      actx ??= new AudioContext();
      const t = actx.currentTime;
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(1400, t + 0.25);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      const f = actx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900;
      o.connect(f).connect(g).connect(actx.destination); o.start(t); o.stop(t + 0.4);
      const p = actx.createOscillator(), pg = actx.createGain();
      p.type = 'sine'; p.frequency.value = 1760;
      pg.gain.setValueAtTime(0.0001, t + 0.28); pg.gain.exponentialRampToValueAtTime(0.06, t + 0.3); pg.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      p.connect(pg).connect(actx.destination); p.start(t + 0.28); p.stop(t + 0.75);
    } catch {}
  }

  function panel(eyebrow, title, sub) {
    if (panels.length >= 3) close(panels[0]);
    const el = document.createElement('section');
    el.className = 'hud';
    el.innerHTML = `<i class="crn a"></i><i class="crn b"></i><i class="crn c"></i><i class="crn d"></i>
      <header><div><div class="eyebrow">${eyebrow}</div><h3></h3><div class="sub"></div></div><button class="x" aria-label="إغلاق">✕</button></header>
      <div class="body"></div><div class="typing"></div>`;
    el.querySelector('h3').textContent = title;
    el.querySelector('.sub').textContent = sub || '';
    el.querySelector('.x').onclick = () => close(el);
    // تكديس بسيط: كل نافذة جديدة تنزاح شوي
    const k = panels.length;
    el.style.transform = '';
    el.style.marginTop = `${k * 34}px`; el.style.marginInlineStart = `${k * 34}px`;
    layer.append(el); panels.push(el); dim.classList.add('on');
    whoosh();
    typeLine(el.querySelector('.typing'), `> NORA://render ${eyebrow.toLowerCase()} … OK`);
    return el;
  }
  function close(el) {
    const i = panels.indexOf(el); if (i < 0) return;
    panels.splice(i, 1);
    el._charts?.forEach(c => c.destroy());
    el.classList.add('out'); setTimeout(() => el.remove(), 350);
    if (!panels.length) dim.classList.remove('on');
  }
  function closeAll() { [...panels].forEach(close); return { closed: true }; }

  function typeLine(el, text) { let i = 0; const t = setInterval(() => { el.textContent = text.slice(0, ++i); if (i >= text.length) clearInterval(t); }, 22); }
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
    return `<div class="gauge"><svg viewBox="0 0 150 150"><circle cx="75" cy="75" r="${r}" fill="none" stroke="rgba(62,230,255,.12)" stroke-width="12"/>
      <circle class="arc" cx="75" cy="75" r="${r}" fill="none" stroke="url(#hg)" stroke-width="12" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}" style="transition:stroke-dashoffset 1.6s cubic-bezier(.2,.9,.2,1)" data-to="${C * (1 - pct / 100)}"/>
      <defs><linearGradient id="hg"><stop offset="0" stop-color="#7a8cff"/><stop offset="1" stop-color="#3ee6ff"/></linearGradient></defs></svg>
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
      data: { labels: pri, datasets: [{ data: pri.map(x => tickets.filter(t => t.priority === x).length), backgroundColor: pri.map(x => PRI_COLOR[x]), borderColor: 'rgba(8,24,48,1)', borderWidth: 3 }] },
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
        backgroundColor: round ? labels.map((_, i) => PALETTE[i % PALETTE.length]) : 'rgba(62,230,255,.35)',
        borderColor: round ? 'rgba(8,24,48,1)' : '#3ee6ff', borderWidth: round ? 3 : 2, borderRadius: 3, fill: true, tension: .35,
        pointBackgroundColor: '#fff', pointRadius: 4 }] },
      options: { maintainAspectRatio: false, animation: { duration: 1500, easing: 'easeOutQuart' },
        plugins: { legend: { display: round || chart_type === 'radar' }, tooltip: { callbacks: { label: x => `${fmt(x.raw)} ${unit}` } } },
        scales: round ? {} : chart_type === 'radar' ? { r: { grid: { color: 'rgba(62,230,255,.15)' }, angleLines: { color: 'rgba(62,230,255,.15)' }, pointLabels: { color: '#dff8ff' }, ticks: { display: false } } }
          : { x: { ticks: { color: '#dff8ff' } }, y: { ticks: { callback: v => fmt(v) } } } },
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
    cell(g, `<div class="lbl">تذاكر عالية الأولوية مفتوحة</div><div class="big" data-count="${s.high_priority_open}" style="color:#ff5d73">0</div>
      <div class="lbl" style="margin-top:12px">تحتاج انتباه</div><ul class="tk">${risky.map(p =>
      `<li><span>${p.name}</span><span class="pill" style="color:${STATUS_COLOR[p.status]}">${p.status}</span></li>`).join('')}</ul>`, 250);
    const c1 = cell(g, `<div class="lbl">المشاريع حسب الحالة</div><div class="chart" style="height:180px"><canvas></canvas></div>`, 350);
    chart(el, c1.querySelector('canvas'), {
      type: 'doughnut',
      data: { labels: s.projects_by_status.map(x => x.status), datasets: [{ data: s.projects_by_status.map(x => x.count),
        backgroundColor: s.projects_by_status.map(x => ({ 'مكتمل': '#3dffa8', 'متأخر': '#ff5d73', 'متوقف': '#ffb547' })[x.status] || '#3ee6ff'), borderColor: 'rgba(8,24,48,1)', borderWidth: 3 }] },
      options: { maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'right' } } },
    });
    const c2 = cell(g, `<div class="lbl">الميزانية مقابل المصروف لكل مشروع (ر.س)</div><div class="chart" style="height:230px"><canvas></canvas></div>`, 500, true);
    chart(el, c2.querySelector('canvas'), {
      type: 'bar',
      data: { labels: d.projects.map(p => p.name), datasets: [
        { label: 'الميزانية', data: d.projects.map(p => p.budget), backgroundColor: 'rgba(122,140,255,.45)', borderColor: '#7a8cff', borderWidth: 1, borderRadius: 3 },
        { label: 'المصروف', data: d.projects.map(p => p.spent), backgroundColor: 'rgba(62,230,255,.6)', borderColor: '#3ee6ff', borderWidth: 1, borderRadius: 3 }] },
      options: { maintainAspectRatio: false, animation: { duration: 1500 }, scales: { x: { ticks: { color: '#dff8ff', font: { size: 11 } } }, y: { ticks: { callback: v => fmt(v / 1000) + 'K' } } } },
    });
    animate(el);
    return { shown: true, projects: d.projects.length, total_budget: s.total_budget, total_spent: s.total_spent, open_tickets: s.open_tickets };
  }

  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAll(); });

  return {
    showProject, showChart, showOverview, closeAll,
    // جاهزة كـ clientTools للوكيل
    tools: { show_project_visual: showProject, show_chart: showChart, show_overview: showOverview, close_visuals: closeAll },
  };
}
