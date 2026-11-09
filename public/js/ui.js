// ui.js — DOM rendering, screen tool handlers, HUD, persona switches (Nora / Fawaz / Jeddawi)
import { createHUD } from './hud.js';
import { createUIControl } from './ui-control.js';
import { createAssistant } from './assistant.js';
import { sayScript } from './speech.js';
import { stripToolTags, claimsScreen, SCREEN_TOOL, isDataTool, isVisualTool, isDashboardTool } from './text-guard.js';
import { buildUserCard, buildAssistantCard, formatMarkdown } from './markdown.js';

export const $ = s => document.querySelector(s);
export const $$ = s => [...document.querySelectorAll(s)];

export const sar = n => new Intl.NumberFormat(window.NORA_NUMERALS === 'latin' ? 'ar-SA-u-nu-latn' : 'ar-SA').format(n ?? 0);
export const num = n => window.NORA_NUMERALS === 'latin' ? String(n) : sar(n);
export const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export const who = () => $('#chip b')?.textContent || 'نورة';

export function announce(msg) {
  const r = $('#sr');
  if (!r || !msg) return;
  r.textContent = '';
  setTimeout(() => { r.textContent = msg; }, 60);
}

export function friendlyStatus(t) {
  t = String(t ?? '');
  const close = t.match(/^انقطع الاتصال \((\d+)\)/);
  if (close) {
    console.info('[nora] websocket closed', close[1]);
    return +close[1] === 1000 || +close[1] === 1005
      ? { text: `${who()} جاهزة، تتصل أول ما تطلب`, live: true }
      : { text: `انقطع الاتصال بـ${who()}`, retry: true, live: true };
  }
  if (t === 'متصل (نص فقط)') return { text: 'متصل كتابةً، اضغط المايك للصوت', live: true };
  if (t === 'متوقف') return { text: `${who()} جاهزة، تتصل أول ما تطلب` };
  if (t === 'جاري الاتصال…') return { text: t, live: true };
  if (/^⚠️ الجلسة بتنتهي/.test(t)) {
    console.info('[nora]', t);
    return { text: 'الجلسة بتتجدد بعد شوي' };
  }
  if (/^❌ /.test(t)) {
    console.error('[nora]', t.slice(2));
    return { text: `تعذّر الاتصال بـ${who()}. تأكد من الإنترنت وجرّب مرة ثانية`, retry: true, live: true };
  }
  if (/^🎙️/.test(t)) return { text: t.replace(/^🎙️\s*/, ''), live: true };
  return { text: t.replace(/^⚠️\s*/, '') };
}

let qaTimer = null, qaBtn = null;
export function setStatus(t) {
  const f = friendlyStatus(t);
  const stTxt = $('#stTxt');
  const retryBtn = $('#retry');
  if (stTxt) stTxt.textContent = f.text;
  if (retryBtn) retryBtn.hidden = !f.retry;
  if (f.live) announce(f.text);
  if (qaBtn && /^❌/.test(String(t))) {
    qaBusy(null, false, f.text);
    qaBtn = null;
  }
}

export function qaBusy(btn, on, msg) {
  clearTimeout(qaTimer);
  const sk = $('#qaSkel');
  $$('.qa-btn').forEach(x => {
    x.removeAttribute('aria-busy');
    x.disabled = false;
  });
  if (!on) {
    if (sk) {
      sk.hidden = !msg;
      if (msg) {
        sk.textContent = msg + ' ';
        const r = document.createElement('button');
        r.type = 'button';
        r.textContent = 'حاول مرة ثانية';
        r.onclick = () => qaBtn && qaBtn.click();
        sk.append(r);
      }
    }
    return;
  }
  qaBtn = btn;
  btn.setAttribute('aria-busy', 'true');
  btn.disabled = true;
  if (sk) {
    sk.textContent = `جاري تجهيز ${btn.textContent.trim().replace(/^(اعرض|افتح)\s*/, '')}…`;
    sk.hidden = false;
  }
  qaTimer = setTimeout(() => qaBusy(null, false, 'ما وصل رد — حاول مرة ثانية'), window.__qaTimeout || 30000);
}

export const qaDone = () => {
  const v = $('#view');
  if (qaBtn && v && !v.hidden) {
    qaBusy(null, false);
    qaBtn = null;
  }
};

// Tool icons & labels
export const ICON = {
  run: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8" stroke-dasharray="4 3"/></svg>',
  ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7"/></svg>',
  err: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.5"/></svg>',
};

export const short = (x, n = 60) => {
  x = String(x ?? '').trim();
  x = x.length > n ? x.slice(0, n - 1) + '…' : x;
  return x.replace(/([\d._-]*\.[A-Za-z0-9]{2,5})$/, '\u2066$1\u2069');
};

export const VIEW_LABEL = {
  overview: 'لوحة المشاريع',
  projects: 'المشاريع',
  tickets: 'التذاكر',
  tasks: 'مهامي',
  files: 'الملفات',
  dashboards: 'الداشبوردات',
  memory: 'الذاكرة',
  dev_requests: 'طلبات التطوير',
  file_dashboard: 'لوحة الملف',
};

export const TOOL_AR = {
  pdf_sources: ['أراجع ملفات PDF المعالجة', 'جبت قائمة ملفات PDF'],
  pdf_find_value: [a => `أدوّر في PDF: ${short(a.query || '', 40)}`, (a, r) => r.results?.length ? `لقيت ${r.results.length} قيمة في PDF` : 'ما لقيت القيمة في المصدر'],
  pdf_get_table: ['أفتح جدول PDF', (a, r) => r.title ? `فتحت جدول: ${short(r.title, 40)}` : 'جبت الجدول'],
  pdf_metric: [a => `أحسب من PDF: ${short(a.measure || a.dataset || '', 40)}`, (a, r) => r.available === false ? 'التفصيل غير متاح في المصدر' : `حسبت: ${short(r.measure || '', 30)}`],
  pdf_trace: ['أتتبع الرقم لمكانه في الملف', (a, r) => r.page ? `الرقم من صفحة ${r.page}` : 'تتبعت الرقم'],
  pdf_dashboard: ['أبني داشبورد من PDF', (a, r) => r.error ? null : 'بنيت داشبورد PDF'],
  pdf_job_status: ['أشيك على معالجة الملف', (a, r) => r.stage_ar ? `حالة الملف: ${r.stage_ar}` : 'شيكت على الملف'],
  show_screen: [a => `أعرض ${VIEW_LABEL[a.view] || 'القسم'}`, (a, r) => r.error ? null : `عرضت ${VIEW_LABEL[a.view] || r.shown_on_screen || 'القسم'}`],
  close_visuals: ['أرجع للشاشة الأساسية', 'رجعت للشاشة الأساسية'],
  find_knowledge: ['أدوّر في مكتبة المعرفة', (a, r) => r.confidence === 'low' ? 'ما لقيت الجواب في الملفات' : `جبت ملف: ${short(r.on_screen_source || r.results?.[0]?.title || a.question)}`],
  search_documents: ['أبحث في الملفات', (a, r) => `بحثت في الملفات${a.query || a.question ? `: ${short(a.query || a.question, 40)}` : ''}`],
  read_document: ['أقرأ الملف', (a, r) => `قرأت ملف: ${short(r.name || r.title || a.name || a.id, 50)}`],
  list_documents: ['أجيب قائمة الملفات', 'جبت قائمة الملفات'],
  find_files: ['أدوّر على الملف', 'جبت الملفات المطابقة'],
  data_chart: [a => a.title ? `أرسم: ${short(a.title, 50)}` : 'أرسم شارت', (a, r) => (r.title || a.title) ? `رسمت: ${short(r.title || a.title, 50)}` : 'رسمت شارت على الشاشة'],
  query_data: [a => `أحسب: ${short(a.about || a.measure || 'البيانات', 40)}`, (a, r) => `حسبت: ${short(a.about || a.measure || 'البيانات', 40)}`],
  show_chart: [a => a.title ? `أعرض: ${short(a.title, 50)}` : 'أعرض رسم', (a, r) => a.title ? `عرضت: ${short(a.title, 50)}` : 'عرضت رسم على الشاشة'],
  render_visual: [a => a.title ? `أعرض: ${short(a.title, 50)}` : 'أعرض رسم', (a, r) => a.title ? `عرضت: ${short(a.title, 50)}` : 'عرضت رسم على الشاشة'],
  show_overview: ['أعرض نظرة عامة', 'عرضت نظرة عامة على المشاريع'],
  show_project_visual: ['أعرض تفاصيل المشروع', 'عرضت تفاصيل المشروع'],
  remember: ['أحفظ المعلومة', 'حفظتها في الذاكرة'],
  forget: ['أنسى المعلومة', 'نسيت المعلومة'],
  recall: ['أرجع للذاكرة', 'رجعت للذاكرة'],
  list_memories: ['أرجع للذاكرة', 'جبت الذاكرة'],
  create_ticket: ['أسجّل تذكرة', 'سجّلت تذكرة جديدة'],
  update_ticket_status: ['أحدّث التذكرة', 'حدّثت حالة التذكرة'],
  list_tickets: ['أجيب التذاكر', 'جبت التذاكر'],
  add_task: ['أضيف مهمة', 'أضفت مهمة'],
  update_task: ['أحدّث المهمة', 'حدّثت المهمة'],
  list_tasks: ['أجيب المهام', 'جبت المهام'],
  search_projects: ['أدوّر في المشاريع', 'جبت المشاريع'],
  get_project_details: ['أجيب تفاصيل المشروع', 'جبت تفاصيل المشروع'],
  get_dashboard_summary: ['أجيب ملخص اللوحة', 'جبت ملخص اللوحة'],
  stats: ['أحسب الإحصائيات', 'جبت الإحصائيات'],
  build_dashboard: ['أبني داشبورد', 'بنيت الداشبورد'],
  open_dashboard: ['أفتح الداشبورد', 'فتحت الداشبورد'],
  list_dashboards: ['أجيب الداشبوردات', 'جبت الداشبوردات'],
  ask_claude: ['أرسل المهمة لـ Claude', 'أرسلت المهمة لـ Claude'],
  ask_gpt: ['أرسل المهمة لـ GPT', 'أرسلت المهمة لـ GPT'],
  check_job: ['أشيّك على المهمة', 'شيّكت على المهمة'],
  request_dev_change: ['أسجّل طلب تطوير', 'سجّلت طلب التطوير'],
  list_dev_requests: ['أجيب طلبات التطوير', 'جبت طلبات التطوير'],
  look_at_screen: ['أشوف الشاشة', 'شفت الشاشة'],
  get_ui_state: ['أشوف إعدادات الواجهة', 'شفت إعدادات الواجهة'],
  get_token_usage: ['أحسب الاستهلاك', 'جبت استهلاك التوكنز'],
  open_app: [a => `أفتح ${short(a.app || a.name || 'التطبيق', 30)}`, (a, r) => `فتحت ${short(a.app || a.name || 'التطبيق', 30)}`],
  get_executive_briefing: ['أجهّز الموجز الصباحي التنفيذي', 'عرضت الموجز الصباحي التنفيذي'],
  spotlight_element: [a => `أوجّه التركيز: ${short(a.label || a.selector || 'عنصر الشاشة', 30)}`, 'سلّطت الضوء على العنصر'],
  check_risk_radar: ['أفحص رادار المخاطر والميزانية', (a, r) => r?.alerts?.length ? `رصدت ${r.alerts.length} تنبيهات مخاطر` : 'فحصت رادار المخاطر: المؤشرات مستقرة'],
  generate_executive_report: ['أصدّر التقرير التنفيذي لمجلس الإدارة', 'جهّزت التقرير التنفيذي'],
  simulate_scenario: ['أشغّل محاكاة السيناريوهات التنفيذية', 'عرضت نتائج محاكاة السيناريو'],
};

for (const k of ['set_theme', 'set_colors', 'set_font', 'set_text_size', 'set_table_style', 'set_number_style', 'set_corners', 'apply_custom_css', 'reset_ui', 'undo_ui', 'show_fonts']) {
  TOOL_AR[k] = ['أعدّل شكل الواجهة', k === 'reset_ui' ? 'رجّعت شكل الواجهة الأصلي' : k === 'undo_ui' ? 'تراجعت عن آخر تعديل' : k === 'show_fonts' ? 'عرضت الخطوط' : 'عدّلت شكل الواجهة'];
}

export const lbl = (v, a, r) => (typeof v === 'function' ? v(a || {}, r || {}) : v);

export const toolRows = new Map();

export function trimLog() {
  const l = $('#log');
  if (!l) return;
  while (l.children.length > 60) l.firstChild.remove();
}

export function toolRow(fc) {
  const log = $('#log');
  const d = document.createElement('div');
  d.className = 'm tool run';
  d.innerHTML = `<div class="row">${ICON.run}<span class="lbl"></span></div><details><summary>تفاصيل تقنية</summary><pre dir="ltr"></pre></details>`;
  const m = TOOL_AR[fc.name];
  d.querySelector('.lbl').textContent = (m && lbl(m[0], fc.args)) || 'أنفّذ طلبك';
  d.querySelector('pre').textContent = `${fc.name}(${JSON.stringify(fc.args || {}, null, 1)})`;
  if (log) {
    log.append(d);
    log.scrollTop = 1e9;
  }
  trimLog();
  toolRows.set(fc.id || fc.name, d);
  return d;
}

export function toolDone(fc, r) {
  const key = fc.id || fc.name;
  const d = toolRows.get(key) || toolRow(fc);
  toolRows.delete(key);
  const err = r && (r.error || r.ok === false);
  const m = TOOL_AR[fc.name];
  d.className = 'm tool ' + (err ? 'err' : 'ok');
  d.querySelector('svg').outerHTML = err ? ICON.err : ICON.ok;
  d.querySelector('.lbl').textContent = err ? `ما قدرت أكمل: ${short(r.error || 'خطأ غير معروف', 70)}` : ((m && lbl(m[1], fc.args, r)) || 'نفّذت طلبك');
  d.querySelector('pre').textContent += `\n→ ${JSON.stringify(r, null, 1)?.slice(0, 3000) ?? ''}`;
}

export function errorRow(e) {
  console.error('[nora] error', e);
  const d = toolRow({ name: 'error', args: {} });
  toolRows.delete('error');
  d.className = 'm tool err';
  d.querySelector('svg').outerHTML = ICON.err;
  d.querySelector('.lbl').textContent = 'صار خطأ أثناء التنفيذ';
  d.querySelector('pre').textContent = JSON.stringify(e, null, 1) || String(e);
}

export function note(text) {
  const log = $('#log');
  if (!log) return;
  log.append(Object.assign(document.createElement('div'), { className: 'm t', textContent: text }));
  log.scrollTop = 1e9;
  trimLog();
}

let cur = { u: null, a: null };
export const TAGS = /\[[a-z_ ]{2,24}\]\s*/gi;
export const SHOW_CAPTION = false;
let capTimer = null;

export function bubble(kind, text, append = true) {
  const log = $('#log');
  if (!log) return;
  if (!append) {
    const card = (kind === 'u') ? buildUserCard(text) : buildAssistantCard(text);
    log.append(card);
    requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });
    caption(kind, text);
    trimLog();
    return;
  }
  if (!cur[kind]) {
    cur[kind] = Object.assign(document.createElement('div'), { className: 'm ' + kind });
    log.append(cur[kind]);
  }
  cur[kind].textContent = (cur[kind].textContent + text).replace(TAGS, '');
  requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });
  caption(kind, cur[kind].textContent);
  trimLog();
}

export function resetCur() {
  if (cur.a && cur.a.textContent && !cur.a.classList.contains('exec-assistant-card')) {
    const raw = cur.a.textContent.trim();
    if (raw) {
      const card = buildAssistantCard(raw);
      cur.a.replaceWith(card);
    }
  }
  if (cur.u && cur.u.textContent && !cur.u.classList.contains('exec-user-card')) {
    const raw = cur.u.textContent.trim();
    if (raw) {
      const card = buildUserCard(raw);
      cur.u.replaceWith(card);
    }
  }
  cur = { u: null, a: null };
}

export function caption(kind, text) {
  if (!SHOW_CAPTION || !$('#drawer')?.hidden) return;
  const c = $('#caption');
  if (!c) return;
  clearTimeout(capTimer);
  if (kind === 'u' && c.dataset.done) {
    c.querySelector('.ca').textContent = '';
    delete c.dataset.done;
  }
  c.querySelector(kind === 'u' ? '.cu' : '.ca').textContent = text;
  c.hidden = false;
  c.scrollTop = 1e9;
}

export function captionDone() {
  const c = $('#caption');
  if (!c) return;
  c.dataset.done = '1';
  clearTimeout(capTimer);
  capTimer = setTimeout(() => {
    c.hidden = true;
    c.querySelector('.cu').textContent = '';
    c.querySelector('.ca').textContent = '';
  }, 14000);
}

export const openLog = (open, refocus = false) => {
  const dr = $('#drawer');
  const btn = $('#logBtn');
  const cap = $('#caption');
  const log = $('#log');
  if (dr) dr.hidden = !open;
  if (btn) btn.setAttribute('aria-expanded', String(open));
  document.body.classList.toggle('log-open', open);
  if (open) {
    if (cap) cap.hidden = true;
    if (log) log.scrollTop = 1e9;
  } else if (refocus && btn) {
    btn.focus();
  }
};

// Views & Screen State
export let VIEW = 'overview';
export let CUR_DASH = null;
export let DASH_CTX = null;
export let INGEST_LAST = null;

export function setIngestLast(val) {
  INGEST_LAST = val;
}

export function renderView() {
  $$('#home [data-v]').forEach(el => el.hidden = !VIEW || !el.dataset.v.split(' ').includes(VIEW));
  const empty = $('#empty');
  if (empty) empty.hidden = (VIEW && VIEW !== 'overview');
  const viewEl = $('#view');
  document.body.classList.toggle('blank', false);
  const crumb = $('#crumb');
  if (crumb) crumb.textContent = (VIEW && VIEW !== 'overview') ? '› ' + (VIEW_LABEL[VIEW] || '') : '';
  if (VIEW !== renderView.last) {
    if (VIEW) announce(`تم عرض ${VIEW_LABEL[VIEW] || VIEW}`);
    else if (renderView.last) announce('رجعت للشاشة الأساسية');
    renderView.last = VIEW;
  }
}

export function showView(v) {
  if (v === 'home' || !v || v === 'overview') {
    if (window.closeSimulatorCockpit && window.__simulatorOpen) {
      window.closeSimulatorCockpit();
    }
    hud.closeAll();
    VIEW = 'overview';
    renderView();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return { shown_on_screen: VIEW_LABEL.overview };
  }
  if (!VIEW_LABEL[v]) return { error: 'قسم غير معروف' };
  if (v === 'file_dashboard' && !CUR_DASH) return { error: 'ما فيه لوحة ملف — يرفع ملف أول' };
  hud.closeAll();
  VIEW = v;
  renderView();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  return { shown_on_screen: VIEW_LABEL[v] };
}

export async function showDash(id, title = '', sub = '', save = true, show = true) {
  if (!id) return;
  CUR_DASH = { id, title };
  const wait = $('#fdWait');
  const frame = $('#fdFrame');
  if (wait) wait.hidden = true;
  if (frame) frame.hidden = false;
  const fdt = $('#fdTitle');
  const fds = $('#fdSub');
  const fdo = $('#fdOpen');
  if (fdt) fdt.textContent = 'لوحة الملف';
  if (fds) fds.textContent = sub || title || '';
  if (fdo) fdo.href = `/d/${id}`;
  if (frame) frame.src = `/d/${id}?embed=1`;
  if (show) showView('file_dashboard');
  if (save && window.apiJson) {
    window.apiJson('/api/current-dash', { id, title, doc_name: sub.replace(/^من ملف: /, '') || undefined }).catch(() => {});
  }
  return { shown_on_main_screen: true, id };
}

export function dashWaiting(name) {
  CUR_DASH ||= { id: 0 };
  const wait = $('#fdWait');
  const frame = $('#fdFrame');
  if (wait) wait.hidden = false;
  if (frame) frame.hidden = true;
  const fdt = $('#fdTitle');
  const fds = $('#fdSub');
  if (fdt) fdt.textContent = 'لوحة الملف';
  if (fds) fds.textContent = name;
  showView('file_dashboard');
}

export const chartScript = c => sayScript(c.title, [c.kpis?.[0] ? `${c.kpis[0].label}: ${c.kpis[0].value}` : '', ...(c.insights || [])], 4);

// Screen Tools & HUD
export const hud = createHUD({
  api: async (url, body) => {
    const apiCall = window.api || fetch;
    return (await apiCall(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})).json();
  },
  mount: {
    el: $('#view'),
    show: title => {
      const home = $('#home');
      const viewEl = $('#view');
      const crumb = $('#crumb');
      if (home) home.hidden = true;
      if (viewEl) viewEl.hidden = false;
      document.body.classList.remove('blank');
      if (crumb) crumb.textContent = '‹ ' + title;
      announce(`تم عرض ${title}`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    home: () => {
      const viewEl = $('#view');
      const home = $('#home');
      if (viewEl) viewEl.hidden = true;
      if (home) home.hidden = false;
      VIEW = 'overview';
      renderView();
    },
  },
});

export const ui = createUIControl({
  api: async (url, body) => {
    const apiCall = window.api || fetch;
    return (await apiCall(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})).json();
  },
  hud,
});

export const assistant = createAssistant({
  api: async (url, body) => {
    const apiCall = window.api || fetch;
    return (await apiCall(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})).json();
  },
  hud,
  note: t => note(t),
});

export const screenToolsExtra = {
  async data_chart(args) {
    const apiJson = window.apiJson;
    const r = await apiJson('/api/tools/data_chart', args);
    if (r.error) return r;
    const shown = await hud.showVisual({ title: r.title, subtitle: r.subtitle, vega_lite: r.vega_lite, kpis: r.kpis, insights: r.insights });
    return { ...shown, subtitle: r.subtitle, top: r.top, kpis: r.kpis, say_script: chartScript(r) };
  },
  async query_data(args) {
    const apiJson = window.apiJson;
    const AGG = { sum: 'مجموع', avg: 'متوسط', count: 'عدد', min: 'أقل', max: 'أعلى', distinct: 'عدد مميز' };
    const q = apiJson('/api/tools/query_data', args);
    if (!args.group_by) return q;
    const title = `${AGG[args.agg || (args.measure ? 'sum' : 'count')] || ''} ${args.measure || args.about || 'السجلات'} حسب ${args.group_by}`.trim();
    const [r, c] = await Promise.all([q, apiJson('/api/tools/data_chart', { ...args, title })]);
    if (!c.error) await hud.showVisual({ title: c.title, subtitle: c.subtitle, vega_lite: c.vega_lite, kpis: c.kpis, insights: c.insights });
    return { ...r, shown_on_screen: !c.error, ...(c.error ? {} : { say_script: chartScript(c) }) };
  },
  async find_knowledge(args) {
    const apiJson = window.apiJson;
    const r = await apiJson('/api/tools/find_knowledge', args);
    if (!r.results?.length) return r;
    if (r.confidence === 'low') {
      const near = r.results[0]?.title || '';
      const lines = ['ما لقيت جواب لهذا السؤال في ملفاتك.', ...(near ? [`أقرب ملف: ${near}`] : []), 'لو الجواب في ملف ما رفعته، ارفعه وأدوّر فيه.'];
      hud.showNote({ eyebrow: 'مكتبة المعرفة', title: 'الجواب مو موجود في الملفات', subtitle: args.question || '', text: lines.join('\n') });
      return { ...r, on_screen: lines, on_screen_source: 'لا يوجد', say_script: sayScript('', lines.slice(0, 2), 2) };
    }
    const nq = x => String(x).replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
    const qw = nq(args.question || '').split(/[^\p{L}\p{N}]+/u).map(w => (w.length > 4 && w.startsWith('ال') ? w.slice(2) : w)).filter(w => w.length > 2);
    const fit = x => {
      const hay = nq(`${x.title} ${x.summary || ''} ${x.purpose || ''}`);
      const cov = qw.length ? qw.filter(w => hay.includes(w)).length / qw.length : 0;
      const txt = (x.sections || []).map(y => y.text || '').join(' ').split(/\s+/).filter(t => /\p{Script=Arabic}/u.test(t));
      const frag = txt.length ? txt.filter(t => /^\p{Script=Arabic}{1,2}$/u.test(t.replace(/[«»"'()،,:؛.؟?!·–-]/g, '')) && !['في', 'من', 'عن', 'او', 'أو', 'لا', 'ما', 'هو', 'هي', 'إن', 'أن', 'ان', 'لم', 'لن', 'قد', 'كل', 'ثم', 'بل', 'يا', 'مع', 'كم', 'و'].includes(t.replace(/[«»"'()،,:؛.؟?!·–-]/g, ''))).length / txt.length : 0;
      return cov - frag;
    };
    const e = r.results.slice(0, 3).reduce((b, x) => (fit(x) > fit(b) + 0.15 ? x : b), r.results[0]);
    const lines = String(e.summary || e.purpose || '').split(/(؛|\.\s+|\n+)/).reduce((a, t) => {
      const open = a.length && (a.at(-1).match(/\(/g) || []).length > (a.at(-1).match(/\)/g) || []).length;
      if (open) a[a.length - 1] += t;
      else if (!/^(؛|\.\s+|\n+)$/.test(t)) a.push(t);
      return a;
    }, []).map(t => t.trim()).filter(t => t.length > 3);
    const secs = (e.sections || []).map(x => typeof x === 'string' ? x : x.section);
    const top = (e.sections || []).find(x => typeof x !== 'string' && x.text);
    const SHORT_OK = new Set(['في', 'من', 'عن', 'او', 'أو', 'لا', 'ما', 'هو', 'هي', 'إن', 'أن', 'ان', 'لم', 'لن', 'قد', 'كل', 'ثم', 'بل', 'يا', 'إذ', 'به', 'له', 'لك', 'كم', 'مع', 'ذا', 'كي', 'و']);
    const bad = t => {
      const w = t.replace(/[«»"'()،,:؛.؟?!·–-]/g, '');
      return (/^\p{Script=Arabic}{1,2}$/u.test(w) && !SHORT_OK.has(w)) || /\p{Script=Arabic}[0-9٠-٩]|[0-9٠-٩]\p{Script=Arabic}/u.test(w);
    };
    const broken = l => {
      const ts = l.split(/\s+/).filter(t => /\p{Script=Arabic}/u.test(t));
      return bad(ts[0] || '') || ts.filter(bad).length / (ts.length || 1) >= 0.25;
    };
    const all = top ? top.text.split(/\n+/).map(l => l.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, '').trim()).filter(l => l.length > 3 && !/^#/.test(l) && !broken(l)).map(l => l.length > 180 ? l.slice(0, 177) + '…' : l) : [];
    const nz = x => String(x).replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
    const qt = nz(args.question || '').split(/[^\p{L}\p{N}]+/u).map(w => (w.length > 4 && w.startsWith('ال') ? w.slice(2) : w)).filter(w => w.length > 2);
    const has = (l, w) => nz(l).includes(w) || (w.length > 4 && nz(l).includes(w.slice(0, -1)));
    const idf = Object.fromEntries(qt.map(w => [w, Math.log((all.length + 1) / (all.filter(l => has(l, w)).length + 0.5))]));
    const scored = all.map((l, i) => ({ l, i, s: qt.reduce((a, w) => a + (has(l, w) ? idf[w] : 0), 0) }));
    const mx = Math.max(0, ...scored.map(x => x.s));
    const best = scored.filter(x => x.s > 0 && x.s >= mx * 0.5).sort((a, b) => b.s - a.s).slice(0, 5).sort((a, b) => a.i - b.i).map(x => x.l);
    const items = best.length ? best : all.slice(0, 7);
    const heads = [e.title, top?.section || ''].map(x => x.replace(/^\d+\.\s*/, ''));
    const merged = items.filter(l => !heads.some(h => h && (h.includes(l) || l.includes(h)))).reduce((a, l) => {
      const p = a.at(-1);
      if (p && !/\d/.test(p) && /^[\d٠-٩]/.test(l) && p.length < 60) a[a.length - 1] = `${p}: ${l}`;
      else a.push(l);
      return a;
    }, []).slice(0, 6);
    if (merged.length >= 1) lines.splice(0, lines.length, ...merged);
    if (e.status && !/كاملة/.test(e.status)) lines.push('تنبيه: ' + e.status.replace(/\s+—\s+/g, '، '));
    hud.showNote({ eyebrow: 'مكتبة المعرفة', title: e.title, subtitle: top?.cite ? 'المصدر ' + top.cite.replace(`${e.title} · `, '') : secs.length ? 'من: ' + secs.slice(0, 2).join(' · ') : (e.source_file || ''), text: lines.join('\n') });
    return { ...r, on_screen: lines, on_screen_source: e.title, say_script: sayScript('', lines.filter(l => !/^تنبيه/.test(l)), 4) + (lines.some(l => /^تنبيه/.test(l)) ? ' والمصدر نسخة جزئية.' : '') };
  },
};

export const screenTools = {
  show_screen: ({ view }) => showView(view),
  look_at_screen() {
    const rows = sel => [...document.querySelectorAll(sel + ' tr')].slice(1).map(tr => [...tr.cells].map(c => c.innerText.trim()).filter(Boolean).join(' | '));
    const list = sel => [...document.querySelectorAll(sel + ' li')].map(li => li.innerText.replace(/\s+/g, ' ').trim()).slice(0, 12);
    return {
      page: document.querySelector('header h1')?.innerText,
      view: !$('#view').hidden ? 'رسم معروض: ' + hud.current().join('، ') : VIEW ? 'قسم معروض: ' + VIEW_LABEL[VIEW] : 'الشاشة فاضية (ترحيب وشريط الكلام بس)',
      kpis: [...document.querySelectorAll('.kpi')].map(k => `${k.querySelector('span')?.innerText}: ${k.querySelector('b')?.innerText}`),
      projects: rows('#projects'),
      tickets: rows('#tickets'),
      file_dashboard_on_screen: $('#filedash').hidden ? null : $('#fdTitle').innerText + ' ' + $('#fdSub').innerText,
      dashboard_source: $('#filedash').hidden || !DASH_CTX ? null : {
        title: DASH_CTX.title,
        provenance: DASH_CTX.provenance,
        measure: DASH_CTX.measure,
        group_by: DASH_CTX.group_by,
        filters: DASH_CTX.filters,
        bars_on_screen: DASH_CTX.groups,
        selected_bar: DASH_CTX.selected,
      },
      pdf_processing: INGEST_LAST ? {
        file: INGEST_LAST.file_name,
        version: INGEST_LAST.version_id,
        stage: INGEST_LAST.stage_ar,
        pages: `${INGEST_LAST.pages_done}/${INGEST_LAST.pages_total ?? '?'}`,
        issues: INGEST_LAST.issues,
      } : null,
      files: list('#docs'),
      generated_dashboards: list('#dashes'),
      memories_count: document.querySelectorAll('#mems .memdel').length,
      dev_requests: list('#devreq'),
      style: {
        font: ui.state.font,
        digits: ui.state.numerals || 'arabic',
        numbers_font: ui.state.numFont || ui.state.font,
        table: ui.state.table,
        theme_colors: ui.state.colors,
        custom_css: (ui.state.css || []).map(c => c.description),
      },
    };
  },
};

// Persona Switcher
export const PERSONA = {
  gemini: { name: 'نورة', fem: true },
  eleven: { name: 'فواز', fem: false },
  jeddawi: { name: 'جداوي', fem: false },
};

export const VOICE_DESC = {
  Sulafat: 'دافئ',
  Despina: 'ناعم',
  Aoede: 'منساب',
  Leda: 'شبابي',
  Kore: 'حازم',
  Zephyr: 'مشرق',
  Achernar: 'هادئ',
  Callirrhoe: 'مريح',
  Autonoe: 'مشرق',
  Erinome: 'واضح',
  Laomedeia: 'مرح',
  Gacrux: 'ناضج',
  Pulcherrima: 'جريء',
  Vindemiatrix: 'لطيف',
};

export function applyPersona(engine) {
  const eleven = engine === 'eleven';
  const P = PERSONA[engine] || PERSONA.gemini;
  const f = (m, w) => P.fem ? w : m;
  document.body.classList.toggle('eng-eleven', eleven);
  const chipB = $('#chip b');
  const chipSpan = $('#chip span');
  const txt = $('#txt');
  const mic = $('#mic');
  const engineSel = $('#engine');

  if (chipB) chipB.textContent = P.name;
  if (chipSpan) chipSpan.textContent = `· ${f('جاهز', 'جاهزة')} للمساعدة`;
  if (txt) {
    txt.placeholder = `اسأل ${P.name}…`;
    txt.setAttribute('aria-label', `اكتب سؤالك لـ${P.name}`);
  }
  if (mic) {
    mic.title = `تكلّم مع ${P.name}`;
    mic.setAttribute('aria-label', `تكلّم مع ${P.name} بالصوت`);
  }
  if (engineSel) {
    for (const o of engineSel.options) {
      o.textContent = `المساعد: ${PERSONA[o.value]?.name || o.value}`;
    }
  }
  $$('.qa-btn[data-say]').forEach(b => {
    b.dataset.say = b.dataset.say.replace(/^اعرض(ي)? لي/, f('اعرض لي', 'اعرضي لي'));
  });
}

export async function fillVoices(engine, apiJson) {
  const voiceSel = $('#voice');
  if (!voiceSel) return '';
  if (engine === 'jeddawi') {
    voiceSel.innerHTML = '<option value="jeddawi">جداوي · Jeddawi Echo (v4 Turbo)</option>';
    return '';
  }
  if (engine === 'eleven') {
    voiceSel.innerHTML = '<option value="fawaz">صوت فواز المستنسخ (v4 Turbo)</option>';
    return '';
  }
  const VOICES = Object.keys(VOICE_DESC);
  let gvoice = 'Sulafat';
  try { gvoice = localStorage.getItem('noraVoice') || 'Sulafat'; } catch {}
  if (!VOICES.includes(gvoice)) gvoice = 'Sulafat';
  voiceSel.innerHTML = VOICES.map(n => `<option value="${n}">${n} · ${VOICE_DESC[n]}</option>`).join('');
  voiceSel.value = gvoice;
  return gvoice;
}

// Global backward compatibility bindings
window.hud = hud;
window.ui = ui;
window.showView = showView;
window.showDash = showDash;

window.addEventListener('message', e => {
  if (e.origin !== location.origin) return;
  const frame = $('#fdFrame');
  if (e.data?.noraDashHeight && frame) {
    frame.style.height = Math.min(Math.max(e.data.noraDashHeight, 300), 3000) + 'px';
  }
  if (e.data?.noraDashCtx) {
    DASH_CTX = e.data.noraDashCtx;
  }
});
