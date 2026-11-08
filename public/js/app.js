// app.js — Bootstrap application, SSE event listeners (/api/events), quick action handlers
import { GeminiLiveAgent } from './live-client.js';
import { playPcmBuffer } from './audio.js';
import {
  $, $$, sar, num, esc, who, announce, friendlyStatus, setStatus, qaBusy, qaDone,
  toolRow, toolDone, errorRow, note, bubble, resetCur, caption, captionDone, openLog,
  VIEW, CUR_DASH, DASH_CTX, INGEST_LAST, setIngestLast, renderView, showView, showDash,
  dashWaiting, hud, ui, assistant, screenTools, screenToolsExtra, PERSONA, VOICE_DESC,
  applyPersona, fillVoices,
} from './ui.js';
import { stripToolTags, claimsScreen, SCREEN_TOOL, isDataTool, isVisualTool, isDashboardTool } from './text-guard.js';

// Access Code & API Helpers
let CODE = '';
try {
  CODE = localStorage.getItem('accessCode') || '';
} catch {}

export const H = () => ({ 'x-access-code': CODE });
export const api = (u, o = {}) => fetch(u, { ...o, headers: { ...(o.headers || {}), ...H() } });
export const apiJson = async (u, b) => (await api(u, b ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) } : {})).json();

window.api = api;
window.apiJson = apiJson;
window.H = H;
window.loadDashboard = loadDashboard;

// Dashboard Loader
export async function loadDashboard(flash) {
  try {
    const d = await (await api('/api/dashboard')).json();
    const s = d.summary;
    const kpisEl = $('#kpis');
    if (kpisEl) {
      kpisEl.innerHTML = [
        ['المشاريع', num(d.projects.length)],
        ['الميزانية (ر.س)', sar(s.total_budget)],
        ['المصروف (ر.س)', sar(s.total_spent)],
        ['تذاكر مفتوحة', num(s.open_tickets)],
      ].map(([k, v]) => `<div class="kpi"><span>${k}</span><b>${v}</b></div>`).join('');
    }

    const TH = cols => `<thead><tr>${cols.map(([c, t]) => `<th scope="col" class="${c}">${t}</th>`).join('')}</tr></thead>`;
    const projEl = $('#projects');
    if (projEl) {
      projEl.innerHTML = '<caption class="sr-only">جدول المشاريع: الحالة ونسبة الإنجاز والمسؤول</caption>' +
        TH([['c-id', '#'], ['c-name', 'المشروع'], ['c-dept', 'الإدارة'], ['c-status', 'الحالة'], ['c-prog', 'الإنجاز'], ['c-owner', 'المسؤول']]) +
        '<tbody>' +
        d.projects.map(p => `<tr><td class="num c-id">${num(p.id)}</td><td class="c-name">${esc(p.name)}</td><td class="c-dept">${esc(p.department)}</td><td class="c-status"><span class="tag ${esc(p.status)}">${esc(p.status)}</span></td>
          <td class="c-prog"><div style="display:flex;align-items:center;gap:8px"><div class="bar" style="flex:1" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${+p.progress || 0}" aria-label="نسبة إنجاز ${esc(p.name)}"><i style="width:${+p.progress || 0}%"></i></div><span class="num pct" aria-hidden="true">${num(p.progress)}٪</span></div></td><td class="c-owner">${esc(p.owner)}</td></tr>`).join('') +
        '</tbody>';
    }

    const tixEl = $('#tickets');
    if (tixEl) {
      tixEl.innerHTML = '<caption class="sr-only">جدول التذاكر: المشروع والأولوية والحالة</caption>' +
        TH([['c-id', '#'], ['', 'العنوان'], ['', 'المشروع'], ['', 'الأولوية'], ['', 'الحالة']]) +
        '<tbody>' +
        d.tickets.map(t => `<tr class="${flash === t.id ? 'flash' : ''}"><td class="num c-id">${num(t.id)}</td><td>${esc(t.title)}</td><td>${esc(t.project_name)}</td>
          <td><span class="tag ${esc(t.priority)}">${esc(t.priority)}</span></td><td><span class="tag ${esc(t.status)}">${esc(t.status)}</span></td></tr>`).join('') +
        '</tbody>';
    }

    const dashEl = $('#dashes');
    if (dashEl && d.dashboards?.length) {
      dashEl.innerHTML = d.dashboards.map(x =>
        `<li><a href="/d/${x.id}" target="_blank" style="color:var(--acc)">#${x.id} ${esc(x.title)}</a><small>${String(x.created_at).slice(0, 16).replace('T', ' ')}</small></li>`
      ).join('');
    }

    const memsEl = $('#mems');
    if (memsEl) {
      if (d.memories?.length) {
        memsEl.innerHTML = d.memories.map(m =>
          `<li><span><small>[${m.category}]</small> ${esc(m.content)}</span><button class="memdel" data-id="${m.id}" title="انسيها" style="background:none;border:none;color:var(--mute);cursor:pointer">✕</button></li>`
        ).join('');
      } else {
        memsEl.innerHTML = '<li><small>فاضية. قل لها مثلاً: «تذكّري إني أحب التقارير مختصرة بالنقاط»</small></li>';
      }
    }

    const T = d.tasks || [];
    const tasksEl = $('#tasks');
    if (tasksEl) {
      tasksEl.innerHTML = T.length
        ? '<caption class="sr-only">جدول مهامي</caption>' +
          TH([['c-id', '#'], ['', 'المهمة'], ['', 'الأولوية'], ['', 'الموعد'], ['', 'الحالة']]) +
          T.map(t =>
            `<tr style="${t.status === 'منجزة' || t.status === 'ملغاة' ? 'opacity:.5' : ''}"><td class="num c-id">${num(t.id)}</td><td>${esc(t.title)}${t.notes ? `<br><small style="color:var(--mute)">${esc(t.notes)}</small>` : ''}</td><td><span class="tag ${t.priority}">${t.priority}</span></td><td class="num">${t.due_date || '—'}</td><td><span class="tag ${t.status === 'منجزة' ? 'مكتمل' : ''}">${t.status}</span></td></tr>`
          ).join('')
        : '<tr><td><small style="color:var(--mute)">ما فيه مهام. قل: «سجّل لي مهمة…»</small></td></tr>';
    }

    const devEl = $('#devreq');
    if (devEl && d.dev_requests?.length) {
      devEl.innerHTML = d.dev_requests.map(r =>
        `<li><span>#${r.id} ${esc(r.title)}${r.dev_note ? `<br><small style="color:var(--sand)">✦ Claude: ${esc(r.dev_note)}</small>` : ''}</span><small>${esc(r.status)} · ${(r.updated_at || r.created_at).slice(0, 16)}</small></li>`
      ).join('');
    }

    const docsEl = $('#docs');
    if (docsEl && d.documents?.length) {
      docsEl.innerHTML = d.documents.map(x =>
        `<li><span>📄 ${x.drive_url ? `<a href="${x.drive_url}" target="_blank" rel="noopener" style="color:var(--ink)">${esc(x.name)}</a>` : esc(x.name)}${x.category ? ` <span class="tag">${esc(x.category)}</span>` : ''}</span><small>#${x.id}${x.drive_url ? ' · في Drive ✓' : ''}</small></li>`
      ).join('');
    }
  } catch (err) {
    console.error('Error loading dashboard:', err);
  }
}

// Gate Authentication
export async function gate() {
  try {
    const res = await api('/api/ping');
    if (res.ok) {
      const gateEl = $('#gate');
      if (gateEl) gateEl.style.display = 'none';
      ui.init();
      setTimeout(loadHistory, 0);
      setTimeout(loadCurrentDash, 0);
      setTimeout(connectLive, 0);
      return loadDashboard();
    }
  } catch {}
  const gateEl = $('#gate');
  if (gateEl) gateEl.style.display = 'flex';
}

$('#gf')?.addEventListener('submit', async e => {
  e.preventDefault();
  CODE = $('#code')?.value?.trim() || '';
  try {
    if ((await api('/api/ping')).ok) {
      try { localStorage.setItem('accessCode', CODE); } catch {}
      gate();
    } else {
      const err = $('#gerr');
      if (err) err.textContent = 'الرمز غلط';
    }
  } catch {
    const err = $('#gerr');
    if (err) err.textContent = 'الرمز غلط';
  }
});

// Turns and History State
let pend = { u: '', a: '' };
let turnTools = [], lastUser = '', nudged = false;

const freshOnly = fn => args => turnTools.some(isDataTool)
  ? fn(args)
  : { error: 'مرفوض: الأرقام لازم تنجلب من الأدوات الحين (data_chart لبيانات الملف، أو أدوات المشاريع/التذاكر)، مو من ذاكرة المحادثة. اجلبيها أول، بعدين اعرضي — ولو السؤال عن ملف استخدمي data_chart مباشرة لأنه يرسم بنفسه.' };

function guardTurn(nora) {
  if (claimsScreen(stripToolTags(nora)) && !turnTools.some(t => SCREEN_TOOL.test(t)) && !nudged && agent.connected) {
    nudged = true;
    note('⚠️ قال إنها معروضة لكن ما انعرض شي — طلبت منه ينفّذ العرض فعلاً');
    agent.sendText('[تنبيه النظام] قلت إن الشي معروض لكن ما استدعيت أداة عرض. استدعِ الأداة الحين بدون كلام زيادة.', { silent: true });
    return;
  }
  const wantsDash = /داش\s?بورد|dashboard|لوحة بيانات/i.test(lastUser);
  const claimed = /تم|بنيت|سويت|سوّيت|انبنى|جاهز/.test(nora);
  if (wantsDash && claimed && !turnTools.some(isDashboardTool) && !nudged && agent.connected) {
    nudged = true;
    agent.sendText('[تنبيه النظام] ما ناديتي أداة داشبورد (build_dashboard، أو pdf_dashboard لملفات PDF) في هذا الطلب، فما انبنى أي داشبورد. نفّذي الطلب الحين فعلياً بالأدوات (ولو فيه ملف مرفوع حديثاً اقرئيه أول).', { silent: true });
    return;
  }
  const promised = /لحظة|أشيك|اشيك|أراجع|اراجع|أشوف لك|بشوف|أجيب لك|خليني/.test(nora);
  if (promised && !turnTools.length && !nudged && agent.connected) {
    nudged = true;
    agent.sendText('[تنبيه النظام] وعدتي فواز وما ناديتي أي أداة. نادي الأدوات الحين، واعرضي النتيجة على الشاشة، وبعدها قولي الجواب.', { silent: true });
    return;
  }
  const NUM = /[0-9٠-٩]|واحد|اثنين|ثلاث|أربع|خمس|ست|سبع|ثمان|تسع|عشر|عش\b|مية|مئة|ألف|بالمية/;
  if (NUM.test(nora) && !turnTools.some(isVisualTool) && !nudged && agent.connected) {
    nudged = true;
    agent.sendText('[تنبيه النظام] قلتي أرقام والشاشة ما تعرضها. اجلبي الأرقام من الأدوات (مو من الذاكرة) واعرضيها على الشاشة الحين بالأداة المناسبة (pdf_dashboard لملفات PDF، data_chart لبيانات Excel، show_chart/show_overview للمشاريع، show_screen للأقسام)، وبعدها أكّدي الرقم بجملة قصيرة.', { silent: true });
  }
}

function takeTurns() {
  const t = [];
  if (pend.u.trim()) t.push({ role: 'user', text: pend.u.trim() });
  if (pend.a.trim()) t.push({ role: 'nora', text: pend.a.replace(/\[[a-z_ ]{2,24}\]\s*/gi, '').trim() });
  pend = { u: '', a: '' };
  return t;
}

function saveTurns() {
  const turns = takeTurns();
  if (!turns.length || !agent.chatId) return;
  apiJson(`/api/chat/${agent.chatId}/turns`, { turns }).catch(() => {});
}

function endChat() {
  if (!agent.chatId) return;
  const turns = takeTurns();
  navigator.sendBeacon(`/api/chat/${agent.chatId}/end?code=${encodeURIComponent(CODE)}`, JSON.stringify({ turns }));
}

window.addEventListener('pagehide', endChat);

async function loadHistory() {
  try {
    const { turns } = await apiJson('/api/chat/recent?limit=16');
    const log = $('#log');
    if (!turns?.length || (log && log.children.length > 1)) return;
    note('— آخر محادثة —');
    const ANN = /⟨نفّذت ([\w]+): ([\s\S]*?) → ([\s\S]*?)⟩/g;
    turns.forEach(t => {
      const text = String(t.text || '');
      if (t.role !== 'user') {
        for (const m of text.matchAll(ANN)) {
          let args = {};
          try { args = JSON.parse(m[2]); } catch {}
          const hid = 'h' + Math.random();
          const d = toolRow({ id: hid, name: m[1], args });
          const tm = window.ui?.TOOL_AR?.[m[1]] || m[1];
          d.className = 'm tool ok old';
          d.querySelector('svg').outerHTML = window.ui?.ICON?.ok || '';
          d.querySelector('.lbl').textContent = (typeof tm === 'object' ? tm[1] : tm) || 'نفّذت طلب';
          d.querySelector('pre').textContent = `${m[1]}(${m[2]})\n→ ${m[3]}`;
        }
      }
      const clean = text.replace(ANN, '').replace(/\s{2,}/g, ' ').trim();
      if (clean && log) {
        log.append(Object.assign(document.createElement('div'), {
          className: 'm ' + (t.role === 'user' ? 'u' : 'a') + ' old',
          textContent: clean,
        }));
      }
    });
    note('— نورة تتذكر هذا الكلام —');
  } catch {}
}

async function loadCurrentDash() {
  try {
    const c = await apiJson('/api/current-dash');
    if (c?.id) showDash(c.id, c.title, c.doc_name ? 'من ملف: ' + c.doc_name : '', false, false);
  } catch {}
}

// Token usage tracker
let USAGE = { input: 0, output: 0, total: 0 }, usagePend = null, usageTimer;
function trackUsage(u) {
  for (const k of ['input', 'output', 'total']) USAGE[k] += u[k] || 0;
  usagePend ||= { input: 0, output: 0, total: 0 };
  for (const k of ['input', 'output', 'total']) usagePend[k] += u[k] || 0;
  const usageEl = $('#usage');
  if (usageEl) usageEl.textContent = `استهلاك هذي الجلسة: ${num(USAGE.total)} توكن`;
  clearTimeout(usageTimer);
  usageTimer = setTimeout(() => {
    const d = usagePend;
    usagePend = null;
    apiJson('/api/usage', { chatId: agent.chatId, engine: ENGINE, ...d }).catch(() => {});
  }, 1500);
}

// Engine & Persona management
let ENGINE = 'gemini';
try {
  ENGINE = localStorage.getItem('noraEngine') || 'gemini';
} catch {}

let running = false;
export const modeFor = () => (ENGINE === 'jeddawi' || ENGINE === 'eleven' ? 'mine' : 'live');

const agentOpts = {
  headers: H,
  clientTools: {
    ...hud.tools,
    ...ui.tools,
    ...assistant.tools,
    ...screenTools,
    ...screenToolsExtra,
    show_chart: freshOnly(hud.tools.show_chart),
  },
  on: {
    status: t => {
      setStatus(t);
      setTimeout(() => $('#chip')?.classList.toggle('on', !!agent.connected), 0);
    },
    closed: () => {
      endChat();
      running = false;
      const mic = $('#mic');
      if (mic) {
        mic.classList.remove('on');
        mic.setAttribute('aria-pressed', 'false');
      }
      $('#chip')?.classList.remove('on');
    },
    userText: (t, typed) => {
      if (pend.a.trim()) saveTurns();
      if (!pend.u) {
        turnTools = [];
        nudged = false;
        lastUser = '';
      }
      lastUser += t;
      pend.u += (typed && pend.u ? '\n' : '') + t;
      if (typed) resetCur();
      bubble('u', t);
    },
    modelText: raw => {
      const t = stripToolTags(raw, { trim: false });
      if (!t) return;
      pend.a += t;
      bubble('a', t);
      hud.highlight(pend.a.slice(-220));
    },
    turnComplete: () => {
      const qb = document.querySelector('.qa-btn[aria-busy="true"]');
      if (qb) qaBusy(null, false);
      guardTurn(pend.a);
      saveTurns();
      resetCur();
      captionDone();
    },
    toolCall: fc => toolRow(fc),
    toolResult: (fc, r) => {
      turnTools.push(fc.name);
      pend.a += ` ⟨نفّذت ${fc.name}: ${JSON.stringify(fc.args || {}).slice(0, 160)} → ${JSON.stringify(r).slice(0, 120)}⟩ `;
      toolDone(fc, r);
      if (fc.name === 'simulate_scenario' && window.renderSimulatorCockpit) {
        window.renderSimulatorCockpit({ projectId: fc.args?.projectId });
      } else if (fc.name === 'spotlight_element' && window.spotlightElement) {
        window.spotlightElement(fc.args);
      } else if (fc.name === 'generate_executive_report' && window.openReportModal) {
        window.openReportModal();
      } else if (/create|update|request_dev|remember|forget|build_dashboard|task/.test(fc.name)) {
        loadDashboard(r.ticket_id || fc.args?.ticket_id);
      }
    },
    error: e => errorRow(e),
    usage: u => trackUsage(u),
    level: v => {
      const mic = $('#mic');
      if (mic) mic.style.boxShadow = `0 0 0 ${Math.round(v * 30)}px #e0705f33`;
    },
  },
};

const makeAgent = e => e === 'eleven'
  ? new GeminiLiveAgent({ ...agentOpts, speakUrl: '/api/speak/eleven', persona: 'fawaz' })
  : e === 'jeddawi'
    ? new GeminiLiveAgent({ ...agentOpts, speakUrl: '/api/speak/eleven', persona: 'jeddawi' })
    : new GeminiLiveAgent(agentOpts);

export let agent = makeAgent(ENGINE);

// Global __nora interface
window.__nora = {
  screenTools,
  ui,
  hud,
  status: t => setStatus(t),
  modeFor: () => modeFor(),
  agent: () => agent,
  connected: () => !!agent?.connected,
  simulator: {
    open: (id) => window.openSimulatorCockpit?.(id),
    render: (opts) => window.renderSimulatorCockpit?.(opts),
  },
  spotlight: (opts) => window.spotlightElement?.(opts),
  briefing: {
    start: () => window.startExecutiveBriefing?.(),
    stop: () => window.stopExecutiveBriefing?.(),
  },
  radar: {
    refresh: () => window.__radar?.refresh?.(),
    open: () => window.__radar?.open?.(),
    close: () => window.__radar?.close?.(),
    getRisks: () => window.__radar?.getRisks?.(),
  },
  report: {
    open: () => window.openReportModal?.(),
  },
};

let GVOICE = 'Sulafat';
try { GVOICE = localStorage.getItem('noraVoice') || 'Sulafat'; } catch {}
let EVOICE = '';
try { EVOICE = localStorage.getItem('noraVoiceEleven') || ''; } catch {}
let VOICE = ENGINE === 'eleven' ? EVOICE : GVOICE;

applyPersona(ENGINE);
const engineSel = $('#engine');
if (engineSel) {
  engineSel.value = ENGINE;
  engineSel.onchange = async () => {
    if (running) {
      endChat();
      agent.stop();
      running = false;
      const mic = $('#mic');
      if (mic) {
        mic.classList.remove('on');
        mic.setAttribute('aria-pressed', 'false');
      }
    }
    ENGINE = engineSel.value;
    try { localStorage.setItem('noraEngine', ENGINE); } catch {}
    agent = makeAgent(ENGINE);
    applyPersona(ENGINE);
    const P = PERSONA[ENGINE] || PERSONA.gemini;
    note(`⚙️ المساعد صار: ${P.name}`);
    setStatus(`${P.name} ${P.fem ? 'جاهزة' : 'جاهز'}، اضغط زر الصوت أو اكتب`);
    VOICE = await fillVoices(ENGINE, apiJson);
  };
}

fillVoices(ENGINE, apiJson).then(v => { VOICE = v; });

const voiceSel = $('#voice');
if (voiceSel) {
  voiceSel.onchange = async () => {
    VOICE = voiceSel.value;
    try {
      if (ENGINE === 'eleven') {
        EVOICE = VOICE;
        localStorage.setItem('noraVoiceEleven', VOICE);
      } else {
        GVOICE = VOICE;
        localStorage.setItem('noraVoice', VOICE);
      }
    } catch {}
    note(`🎙️ صوت نورة صار: ${voiceSel.selectedOptions[0]?.textContent || VOICE}`);
    if (running) {
      endChat();
      agent.stop();
      try {
        await agent.start({ voice: VOICE });
      } catch (e) {
        setStatus('❌ ' + e.message);
        running = false;
        const mic = $('#mic');
        if (mic) {
          mic.classList.remove('on');
          mic.setAttribute('aria-pressed', 'false');
        }
      }
    }
  };
}

$('#preview')?.addEventListener('click', async () => {
  const btn = $('#preview');
  const jed = ENGINE === 'jeddawi' || ENGINE === 'eleven';
  btn.disabled = true;
  try {
    const r = await api(jed ? '/api/speak/eleven' : '/api/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(jed
        ? { persona: ENGINE === 'eleven' ? 'fawaz' : 'jeddawi', text: ENGINE === 'eleven' ? 'هلا والله! أنا فواز، مساعدك الذكي. وش تبغى نشوف اليوم؟' : 'هلا والله! أنا جداوي، مساعدك الذكي. إيش تبغى نشوف اليوم؟' }
        : { voice: VOICE, text: 'هلا والله! أنا نورة، مساعدتك الذكية. اسألني عن أي مشروع، وأطلّع لك كل شي على الشاشة.' }),
    });
    if (!r.ok) throw new Error(await r.text());
    const buf = await r.arrayBuffer();
    await playPcmBuffer(buf, 24000);
  } catch (e) {
    note('❌ المعاينة: ' + e.message);
  } finally {
    btn.disabled = false;
  }
});

const micBtn = $('#mic');
if (micBtn) {
  micBtn.onclick = async () => {
    if (running) {
      endChat();
      agent.stop();
      running = false;
      micBtn.classList.remove('on');
      micBtn.setAttribute('aria-pressed', 'false');
      if (pendingReload) location.reload();
      return;
    }
    try {
      await agent.start({ mode: modeFor(), voice: VOICE });
      running = true;
      micBtn.classList.add('on');
      micBtn.setAttribute('aria-pressed', 'true');
    } catch (e) {
      setStatus('❌ ' + e.message);
    }
  };
}

$('#retry')?.addEventListener('click', async () => {
  setStatus('جاري الاتصال…');
  try {
    await agent.start({ mic: false, mode: modeFor(), voice: VOICE });
    running = true;
  } catch (err) {
    setStatus('❌ ' + err.message);
  }
});

$('#f')?.addEventListener('submit', async e => {
  e.preventDefault();
  const txt = $('#txt');
  const t = txt?.value?.trim();
  if (!t) return;
  if (!running || !agent.connected) {
    try {
      await agent.start({ mic: false, mode: modeFor(), voice: VOICE });
      running = true;
      agent.sendText(t);
      if (txt) txt.value = '';
      $('#send')?.setAttribute('aria-disabled', 'true');
      return;
    } catch (err) {
      console.log('[app] Live WebSocket unavailable, using REST Chat:', err.message);
    }
  } else {
    agent.sendText(t);
    if (txt) txt.value = '';
    $('#send')?.setAttribute('aria-disabled', 'true');
    return;
  }

  // REST Chat fallback via FreeLLMAPI / Gemini
  const log = $('#log');
  if (log) {
    const uEl = Object.assign(document.createElement('div'), { className: 'm u', textContent: t });
    log.append(uEl);
    log.scrollTop = 1e9;
  }
  openLog(true);
  setStatus('⏳ نورة تفكر…');
  if (txt) txt.value = '';
  $('#send')?.setAttribute('aria-disabled', 'true');

  try {
    const res = await apiJson('/api/chat/message', { text: t, sessionId: agent?.chatId || null });
    if (res?.reply && log) {
      const aEl = Object.assign(document.createElement('div'), { className: 'm a', textContent: res.reply });
      log.append(aEl);
      log.scrollTop = 1e9;
      setStatus('اكتب طلبك أو اضغط للتحدث.');
    } else if (res?.error) {
      setStatus('❌ ' + res.error);
    }
  } catch (e2) {
    setStatus('❌ ' + e2.message);
  }
});

// Quick Action Buttons
$$('.qa-btn').forEach(b => {
  b.onclick = () => {
    if (b.dataset.act === 'file') return $('#file')?.click();
    if (b.dataset.act === 'simulator') {
      if (window.openSimulatorCockpit) window.openSimulatorCockpit();
      return;
    }
    qaBusy(b, true);
    const txt = $('#txt');
    if (txt) txt.value = b.dataset.say;
    $('#f')?.requestSubmit();
  };
});

new MutationObserver(qaDone).observe($('#view'), { attributes: true, attributeFilter: ['hidden'] });
new MutationObserver(qaDone).observe(document.body, { attributes: true, attributeFilter: ['class'] });

// File Uploads & Journeys
const JR_STEPS = {
  tabular: [['upload', 'رفع الملف', '⬆️', 15], ['checked', 'فحص البصمة', '🔎', 5], ['read', 'قراءة المحتوى', '📖', 15], ['tables', 'تحويل الأوراق لجداول', '🧮', 20], ['dash', 'بناء اللوحة', '📊', 30], ['nora', 'نورة تقرأ النتائج', '✨', 10], ['archived', 'حفظ في Drive', '☁️', 5]],
  text:    [['upload', 'رفع الملف', '⬆️', 15], ['checked', 'فحص البصمة', '🔎', 5], ['read', 'قراءة المحتوى', '📖', 30], ['dash', 'بناء اللوحة', '📊', 35], ['nora', 'نورة تقرأ النتائج', '✨', 10], ['archived', 'حفظ في Drive', '☁️', 5]],
  pdf:     [['upload', 'رفع الملف', '⬆️', 8], ['checked', 'فحص البصمة', '🔎', 4], ['original', 'حفظ الأصل', '🗄️', 4], ['extract', 'قراءة الصفحات', '📄', 54], ['organize', 'تنظيم الجداول', '🧩', 10], ['validate', 'التحقق والحزمة', '✅', 15], ['nora', 'نورة جاهزة', '✨', 5]],
};
const JR = new Map();

function journey(file) {
  const kind = /\.pdf$/i.test(file.name) ? 'pdf' : /\.(xlsx|xls|csv)$/i.test(file.name) ? 'tabular' : 'text';
  const trace = 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const steps = JR_STEPS[kind].map(([key, label, icon, w]) => ({ key, label, icon, w, state: 'wait', frac: 0, detail: '' }));
  const el = document.createElement('div');
  el.className = 'jr';
  el.innerHTML = `<div class="jr-top"><span class="jr-ic">${kind === 'pdf' ? '📕' : kind === 'tabular' ? '📗' : '📘'}</span><div class="jr-tt"><b></b><small></small></div><div class="jr-msg"></div><div class="jr-pct">0%</div><button class="jr-x" type="button" aria-label="إخفاء">✕</button></div>
    <div class="jr-steps">${steps.map(s => `<div class="jr-st" data-k="${s.key}" title="${s.label}"><div class="jr-dot">${s.icon}</div><span>${s.label}</span><em></em></div>`).join('')}</div>
    <div class="jr-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="jr-fill"></div></div>
    <div class="jr-win"></div>`;
  el.querySelector('.jr-tt b').textContent = file.name;
  el.querySelector('.jr-x').onclick = e => { e.stopPropagation(); el.remove(); JR.delete(trace); };
  el.onclick = () => el.classList.contains('mini') && el.classList.remove('mini');
  $('#journeys')?.prepend(el);

  const t0 = performance.now();
  const q = [];
  let busy = false;
  const pump = () => {
    if (busy || !q.length) return;
    const [op, args] = q.shift();
    const changed = j['_' + op](...args);
    const slow = op === 'finish' || (op === 'set' && changed === true);
    if (slow) {
      busy = true;
      setTimeout(() => { busy = false; pump(); }, 330);
    } else pump();
  };

  const j = {
    trace, kind, el, steps, done: false, ended: false,
    set(...a) { q.push(['set', a]); pump(); },
    finish(...a) { this.ended = true; q.push(['finish', a]); pump(); },
    fail(...a) { this.ended = true; q.push(['fail', a]); pump(); },
    msg(t) { q.push(['msg', [t]]); pump(); },
    _set(key, state, detail = '', frac) {
      const s = steps.find(x => x.key === key);
      if (!s || (['ok', 'skip', 'bad'].includes(s.state) && state === 'on')) return false;
      const was = s.state;
      if ((state === 'ok' || state === 'on') && key !== 'archived') {
        steps.slice(0, steps.indexOf(s)).forEach(x => { if (x.state === 'wait' || x.state === 'on') { x.state = 'ok'; x.frac = 1; } });
      }
      s.state = state;
      s.frac = state === 'ok' || state === 'skip' ? 1 : frac ?? s.frac;
      if (detail) s.detail = detail;
      this.render();
      return was !== state && (state === 'ok' || state === 'skip');
    },
    _msg(t) { if (!this.done) el.querySelector('.jr-msg').textContent = t; },
    render() {
      const total = steps.reduce((a, s) => a + s.w, 0), got = steps.reduce((a, s) => a + s.w * s.frac, 0);
      const pct = Math.min(100, Math.round(got / total * 100));
      el.querySelector('.jr-fill').style.width = pct + '%';
      el.querySelector('.jr-pct').textContent = pct + '%';
      el.querySelector('.jr-bar').setAttribute('aria-valuenow', pct);
      const idx = steps.findIndex(s => s.state !== 'ok' && s.state !== 'skip');
      el.querySelector('.jr-tt small').textContent = this.done ? `${((performance.now() - t0) / 1000).toFixed(1)} ثانية` : `المرحلة ${idx < 0 ? steps.length : idx + 1} من ${steps.length}${idx >= 0 ? ' · ' + steps[idx].label : ''}`;
      steps.forEach(s => {
        const n = el.querySelector(`[data-k="${s.key}"]`);
        n.className = 'jr-st ' + s.state;
        n.querySelector('em').textContent = s.detail;
      });
    },
    _finish(title, chips = [], links = [], { rest = 'ok' } = {}) {
      steps.forEach(s => { if (s.state === 'wait' || s.state === 'on') { s.state = rest; s.frac = 1; } });
      this.done = true;
      el.classList.add('done');
      el.querySelector('.jr-msg').textContent = '';
      this.render();
      const w = el.querySelector('.jr-win');
      w.innerHTML = `<b>🏆 ${title}</b><div class="jr-chips">${chips.map(() => `<span></span>`).join('')}${links.filter(l => l[1]).map(() => '<a target="_blank" rel="noopener"></a>').join(' ')}</div>`;
      [...w.querySelectorAll('.jr-chips span')].forEach((n, i) => n.textContent = chips[i]);
      [...w.querySelectorAll('.jr-chips a')].forEach((a, i) => { const l = links.filter(x => x[1])[i]; a.textContent = l[0]; a.href = l[1]; });
      announce(`اكتمل رفع ${file.name}: ${title}`);
      setTimeout(() => el.isConnected && el.classList.add('mini'), 6000);
    },
    _fail(key, why) {
      key ||= (steps.find(x => x.state === 'on' && x.key !== 'archived') || steps.find(x => x.state === 'wait'))?.key || 'upload';
      steps.forEach(x => { if (x.state === 'on' && x.key !== key) x.state = 'wait'; });
      this._set(key, 'bad');
      el.classList.add('fail');
      el.querySelector('.jr-msg').textContent = '❌ ' + why;
      this.done = true;
      this.render();
    },
  };

  JR.set(trace, j);
  j.set('upload', 'on', '', 0);
  return j;
}

const arN = (n, one, few) => `${(+n).toLocaleString('en-US')} ${n >= 3 && n <= 10 ? few : one}`;

function onUploadEvent(ev) {
  const j = JR.get(ev.trace);
  if (!j || j.ended) return;
  const n = x => (+x || 0).toLocaleString('en-US');
  if (ev.step === 'received') {
    j.set('upload', 'ok', ev.bytes >= 1048576 ? `${(ev.bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(ev.bytes / 1024))} KB`);
    j.set('checked', 'on');
    j.msg('وصل الملف للسيرفر… نتأكد إنه ما انرفع قبل');
  }
  if (ev.step === 'checked') {
    j.set('checked', 'ok', ev.duplicate ? 'مكرر' : 'جديد');
    if (!ev.duplicate && j.kind !== 'pdf') {
      j.set('read', 'on');
      j.msg('نقرأ محتوى الملف…');
    }
  }
  if (ev.step === 'read') {
    j.set('read', 'ok', `${n(ev.chars)} حرف`);
    if (j.kind === 'tabular') {
      j.set('tables', 'on');
      j.msg('نحوّل كل ورقة لجدول ونحلل أعمدتها…');
    }
  }
  if (ev.step === 'tables') {
    j.stats = ev;
    j.set('tables', ev.sheets ? 'ok' : 'skip', ev.sheets ? `${ev.sheets} أوراق · ${n(ev.rows)} صف` : 'لا جداول');
  }
  if (ev.step === 'archived') {
    j.set('archived', ev.error ? 'bad' : ev.drive === false ? 'skip' : 'ok', ev.error ? 'تعذّر' : ev.drive === false ? 'محلي فقط (Drive غير مربوط)' : (ev.category || 'Drive'));
  }
}

function xhrUpload(fd, trace, onProg) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', '/api/upload');
    const h = H();
    for (const k in h) x.setRequestHeader(k, h[k]);
    x.setRequestHeader('x-upload-trace', trace);
    x.upload.onprogress = e => e.lengthComputable && onProg(e.loaded / e.total);
    x.onload = () => {
      let d = {};
      try { d = JSON.parse(x.responseText); } catch {}
      resolve({ ok: x.status < 300, d });
    };
    x.onerror = () => reject(new Error('انقطع الاتصال أثناء الرفع'));
    x.send(fd);
  });
}

function trackIngest(ing, jr, doc = null) {
  if (ing.error) {
    jr?.fail('original', 'مسار PDF: ' + ing.error);
    return note('⚠️ مسار PDF: ' + ing.error);
  }
  const FINAL = ['ready', 'partial', 'failed'];
  if (ing.duplicate && ing.attempt_id && !FINAL.includes(ing.status)) {
    note(`🗂️ نفس الـ PDF قيد المعالجة الحين (${ing.version_id}) — نتابع نفس المهمة بدون تكرار`);
  } else if (ing.duplicate) {
    note(`🗂️ نفس الـ PDF معالج سابقاً (${ing.version_id} · ${ing.status}) — ما تكررت المعالجة`);
    jr?.finish('الملف معالج من قبل — جاهز للأسئلة', [`الإصدار ${ing.version_id.split('@')[1] || ing.version_id}`, { ready: 'جاهز ومتحقق', partial: 'جاهز جزئياً', failed: 'فشل', queued: 'في الانتظار', extracting: 'قيد الاستخراج', organizing: 'قيد التنظيم', validating: 'قيد التحقق' }[ing.status] || ing.status], [], { rest: 'skip' });
    return;
  }
  const id = ing.attempt_id;
  if (!id) return;
  jr?.set('original', 'ok', ing.version_id?.split('@')[1] || '');
  jr?.set('extract', 'on', '', 0);
  jr?.msg('نقرأ الصفحات وحدة وحدة…');
  const el = Object.assign(document.createElement('div'), { className: 'm t ingest-card' });
  $('#log')?.append(el);
  const log = $('#log');
  if (log) log.scrollTop = 1e9;
  let last = '', tries = 0, missing = 0;
  const tick = async () => {
    const j = await apiJson(`/api/ingest/jobs/${encodeURIComponent(id)}`).catch(() => null);
    if (j?.error && ++missing >= 3) {
      el.textContent = '⚠️ مهمة PDF غير موجودة على السيرفر: ' + j.error;
      jr?.fail(null, 'المهمة ما عادت موجودة على السيرفر');
      return;
    }
    if (j && !j.error) missing = 0;
    if (j && !j.error) {
      setIngestLast(j);
      const pages = j.pages_total ? ` · الصفحات ${j.pages_done}/${j.pages_total}` : '';
      const txt = `📑 ${j.file_name} (${j.version_id}) — ${j.stage_ar}${pages} · مشكلات ${j.issues}`;
      if (txt !== last) { el.textContent = txt; last = txt; }
      if (jr && !jr.ended) {
        const frac = j.pages_total ? j.pages_done / j.pages_total : 0;
        if (j.stage === 'extracting' || j.stage === 'queued' || j.stage === 'uploaded') {
          jr.set('extract', 'on', j.pages_total ? `${j.pages_done}/${j.pages_total} صفحة` : '', frac);
          jr.msg(j.pages_total ? `قرأنا ${j.pages_done} من ${j.pages_total} صفحة${j.issues ? ` · ${j.issues} ملاحظة` : ''}` : 'نجهّز الصفحات…');
        }
        if (j.stage === 'organizing') {
          jr.set('extract', 'ok', arN(j.pages_total, 'صفحة', 'صفحات'));
          jr.set('organize', 'on');
          jr.msg('نرتّب الجداول ونربط الممتد منها…');
        }
        if (j.stage === 'validating') {
          jr.set('organize', 'ok');
          jr.set('validate', 'on');
          jr.msg('نطابق المجاميع مع المطبوع ونبني الحزمة في Drive…');
        }
      }
      if (['ready', 'partial', 'failed'].includes(j.stage)) {
        if (j.links) {
          const a = (u, t) => u ? ` <a href="${u}" target="_blank" rel="noopener">${t}</a>` : '';
          el.insertAdjacentHTML('beforeend', `<div class="ingest-links">${a(j.links.folder, 'المجلد')}${a(j.links.review_xlsx, 'Excel')}${a(j.links.quality_report, 'تقرير الجودة')}${a(j.links.document_md, 'النص الكامل')}</div>`);
        }
        if (j.stage === 'failed') {
          if (doc?.id || doc?.chars) {
            note('✅ تم استلام وأرشفة الملف بنجاح، والنص متاح بالكامل لنورة والداشبورد.');
            jr?.finish('الملف جاهز ومحفوظ في Drive', [arN(j.pages_total || 1, 'صفحة', 'صفحات'), 'النص مفهرس'], [
              ['📁 المجلد', j.links?.folder],
              ['📄 النص الكامل', j.links?.document_md]
            ]);
          } else {
            note('❌ فشلت المعالجة، والإصدار السابق باقي كما هو: ' + (j.errors?.at(-1)?.message || ''));
            jr?.fail(null, 'فشلت المعالجة، والإصدار السابق باقي كما هو');
          }
        } else {
          if (!running || !agent.connected) {
            try {
              await agent.start({ mic: false, mode: modeFor(), voice: VOICE });
              running = true;
            } catch {}
          }
          if (agent?.connected) {
            agent.sendText(`[تنبيه النظام] انتهت معالجة PDF «${j.file_name}» بحالة ${j.stage_ar} (${j.pages_done}/${j.pages_total} صفحة، ${j.issues} مشكلة). الإصدار ${j.version_id}. استخدمي pdf_sources ثم pdf_* للأسئلة، واذكري رقم الصفحة، ولا تخترعي ما ليس في المصدر.`, { silent: true });
          }
          jr?.finish(j.stage === 'ready' ? 'الملف جاهز ومتحقق منه' : 'جاهز جزئياً — شوف تقرير الجودة', [arN(j.pages_total, 'صفحة', 'صفحات'), `الإصدار ${j.version_id.split('@')[1]}`, j.issues ? arN(j.issues, 'ملاحظة', 'ملاحظات') : 'بدون ملاحظات'],
            [['📁 المجلد', j.links?.folder], ['📊 Excel', j.links?.review_xlsx], ['🧾 تقرير الجودة', j.links?.quality_report]]);
        }
        return;
      }
    }
    if (++tries < 2000) setTimeout(tick, 3000);
  };
  tick();
}

export async function uploadFile(file) {
  note(`⏫ جاري رفع ${file.name}…`);
  const jr = journey(file);
  const fd = new FormData();
  fd.append('file', file);
  let r;
  try {
    r = await xhrUpload(fd, jr.trace, f => {
      jr.set('upload', 'on', `${Math.round(f * 100)}%`, f);
      jr.msg(f < 1 ? 'نرفع الملف للسيرفر…' : 'وصل الملف، السيرفر يستلمه…');
    });
  } catch (e) {
    jr.fail('upload', e.message);
    return note('❌ ' + e.message);
  }
  const d = r.d;
  if (!r.ok) {
    jr.set('upload', 'ok');
    jr.fail(null, d.error || 'تعذّر الرفع');
    return note('❌ ' + (d.error || 'تعذّر الرفع'));
  }
  jr.set('checked', 'ok', d.duplicate ? 'مكرر' : 'جديد');
  if (d.knowledge) {
    const k = d.knowledge;
    note(k.status === 'unchanged' ? `📚 «${k.id}» موجود في مكتبة المعرفة بنفس النسخة` : `📚 انضاف لمكتبة المعرفة: «${k.title}»`);
    jr.finish('انضاف لمكتبة المعرفة', [k.title || k.id], [], { rest: 'skip' });
    return;
  }
  if (d.duplicate) {
    note(`📄 «${d.name}» مرفوع من قبل (ملف #${d.id}) ومحفوظ في Drive`);
    const links = [];
    if (d.drive_url) links.push(['📁 عرض في Drive', d.drive_url]);
    jr.finish('الملف موجود مسبقاً — ما كررناه', [`ملف #${d.id}`, d.name], links, { rest: 'skip' });
    return;
  }
  if (jr.kind === 'pdf' && d.ingest) {
    trackIngest(d.ingest, jr, d);
    return;
  }
  if (d.ingest) trackIngest(d.ingest, null, d);
  jr.set('read', 'ok', `${(d.chars || 0).toLocaleString('en-US')} حرف`);
  if (jr.kind === 'tabular') {
    const st = d.stats || jr.stats;
    jr.set('tables', st?.sheets ? 'ok' : 'skip', st?.sheets ? `${st.sheets} أوراق · ${st.rows.toLocaleString('en-US')} صف` : 'لا جداول');
    jr.stats = st;
  }
  note(`📄 انحفظ "${d.name}" في الداتابيس (ملف #${d.id})`);
  loadDashboard();
  window.NORA_LAST_DOC = d;

  jr.set('dash', 'on');
  jr.msg('نبني لوحة الملف…');
  dashWaiting(d.name);
  const g = await apiJson(`/api/docs/${d.id}/dashboard`, {}).catch(e => ({ error: e.message }));
  if (g.ok) {
    showDash(g.id, g.title, 'من ملف: ' + d.name, false);
    note(`📊 لوحة الملف جاهزة #${g.id}: ${g.title}`);
    loadDashboard();
    jr.set('dash', 'ok', `لوحة #${g.id}`);
  } else {
    showView('home');
    note('⚠️ ما قدرت أبني اللوحة تلقائياً: ' + (g.error || ''));
    jr.set('dash', 'bad', 'تعذّر');
  }

  jr.set('nora', 'on');
  jr.msg('نبلّغ نورة بالملف…');
  const notice = g.ok
    ? `[تنبيه النظام] رفع فواز ملف «${d.name}» (رقم ${d.id}) وانبنت منه تلقائياً لوحة #${g.id} «${g.title}» وهي معروضة الحين في الشاشة الرئيسية. رحّبي بجملة قصيرة وقولي أبرز رقمين أو ثلاثة منها (من الملف)، وبعدها جاوبي أسئلته عنها من الملف بـ search_documents/read_document.`
    : `[تنبيه النظام] رفع فواز ملف «${d.name}» (رقم ${d.id}) وفشل البناء التلقائي. اقرئيه كامل بـ read_document وابني منه داشبورد بـ build_dashboard الحين.`;

  if (!running || !agent.connected) {
    try {
      await agent.start({ mic: false, mode: modeFor(), voice: VOICE });
      running = true;
    } catch {}
  }
  if (agent.connected) {
    agent.sendText(notice, { silent: true });
    jr.set('nora', 'ok', 'وصلها');
  } else {
    jr.set('nora', 'bad', 'غير متصلة');
  }

  const st = jr.stats;
  const archived = jr.steps.find(s => s.key === 'archived');
  if (archived && archived.state === 'wait') jr.set('archived', 'on', 'بالخلفية');

  const close = () => jr.finish(g.ok ? 'الملف جاهز ولوحته معروضة' : 'الملف محفوظ — اللوحة تحتاج طلب من نورة',
    [...(st?.sheets ? [arN(st.sheets, 'ورقة', 'أوراق'), arN(st.rows, 'صف', 'صفوف'), arN(st.measures, 'مقياس', 'مقاييس')] : [`${(d.chars || 0).toLocaleString('en-US')} حرف`]), ...(archived?.state === 'ok' ? [`Drive: ${archived.detail}`] : [])]);
  const wait0 = performance.now();
  const waitArchive = () => {
    if (archived && ['ok', 'bad', 'skip'].includes(archived.state)) return close();
    if (performance.now() - wait0 > 60000) {
      if (archived) jr.set('archived', 'skip', 'جارية');
      return close();
    }
    setTimeout(waitArchive, 500);
  };
  waitArchive();
}

$('#attach')?.addEventListener('click', () => $('#file')?.click());
$('#file')?.addEventListener('change', e => {
  [...e.target.files].forEach(uploadFile);
  e.target.value = '';
});
document.addEventListener('dragover', e => {
  e.preventDefault();
  document.body.classList.add('drop');
});
document.addEventListener('dragleave', e => {
  if (!e.relatedTarget) document.body.classList.remove('drop');
});
document.addEventListener('drop', e => {
  e.preventDefault();
  document.body.classList.remove('drop');
  [...e.dataTransfer.files].forEach(uploadFile);
});

// SSE Live Events
let BOOT = null, pendingReload = false, liveTimer;

async function checkPersist() {
  const p = (await apiJson('/api/ping').catch(() => null))?.persist;
  const bar = $('#persistBar');
  if (bar) {
    bar.hidden = !p?.protected;
    if (p?.protected) bar.textContent = `وضع محمي: الحفظ الدائم متوقف — ${p.reason}`;
  }
}

export function connectLive() {
  if (window.__live) return;
  const es = window.__live = new EventSource(`/api/events?code=${encodeURIComponent(CODE)}`);
  es.addEventListener('hello', e => {
    const { boot } = JSON.parse(e.data);
    if (BOOT && boot !== BOOT) {
      if (running) {
        pendingReload = true;
        setStatus('فيه تحديث جديد، ينطبق بعد ما تخلص المحادثة');
      } else {
        location.reload();
      }
    }
    BOOT ||= boot;
    checkPersist();
  });
  es.addEventListener('data', e => {
    try {
      if (JSON.parse(e.data).what === 'persist') checkPersist();
    } catch {}
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => loadDashboard().catch(() => {}), 200);
  });
  es.addEventListener('upload', e => {
    try { onUploadEvent(JSON.parse(e.data)); } catch {}
  });
  es.addEventListener('job', async e => {
    const j = JSON.parse(e.data);
    const w = j.kind === 'gpt' ? 'GPT' : 'Claude';
    if (j.status === 'قيد التنفيذ') {
      setStatus(`${w} شغال: ${j.step?.text || '…'}`);
      return;
    }
    note(`${w} خلّص المهمة #${j.id} (${j.status})`);
    if (j.result) hud.showNote({ eyebrow: `نتيجة ${w}`, title: `مهمة #${j.id}`, subtitle: j.status, text: j.result });
    setStatus(`${w} خلّص المهمة #${j.id}`);
    const msg = `[تنبيه النظام] ${w} خلّص المهمة رقم ${j.id} (${j.status}). النتيجة: ${String(j.result || '').slice(0, 1500)}\nقولي لفواز النتيجة باختصار بصوتك.`;
    if (!running || !agent.connected) {
      try {
        await agent.start({ mic: false, mode: modeFor(), voice: VOICE });
        running = true;
      } catch { return; }
    }
    agent.sendText(msg, { silent: true });
  });
}

// Global Click & Keyboard Bindings
$('#logBtn')?.addEventListener('click', () => openLog($('#drawer')?.hidden));
$('#drClose')?.addEventListener('click', () => openLog(false, true));
$('#caption')?.addEventListener('click', () => openLog(true));

// Esc: If drawer open -> close drawer only and refocus logBtn. If drawer closed -> close view.
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const drawer = $('#drawer');
    if (drawer && !drawer.hidden) {
      e.preventDefault();
      e.stopImmediatePropagation();
      openLog(false, true);
    }
  }
}, true);

document.addEventListener('pointerdown', e => {
  const drawer = $('#drawer');
  if (drawer && !drawer.hidden && !e.target.closest('#drawer, #logBtn, #f, #status')) {
    openLog(false);
  }
});

$('#txt')?.addEventListener('input', () => {
  $('#send')?.setAttribute('aria-disabled', String(!$('#txt')?.value.trim()));
});
$('#send')?.setAttribute('aria-disabled', 'true');

$('#fdHide')?.addEventListener('click', () => {
  showView('home');
});
$('header.top h1')?.addEventListener('click', () => {
  hud.closeAll();
  showView('home');
});
$('#crumb')?.addEventListener('click', () => {
  hud.closeAll();
  showView('home');
});

document.addEventListener('click', async e => {
  const b = e.target.closest('.memdel');
  if (!b) return;
  await api(`/api/memories/${b.dataset.id}`, { method: 'DELETE' });
  loadDashboard();
});

document.addEventListener('nora:numerals', () => {
  if ($('#gate')?.style.display === 'none') loadDashboard();
});

// Resize observers for dynamic layout adjustments
const hdr = $('header.top');
if (hdr) {
  const hdrObs = new ResizeObserver(() => document.documentElement.style.setProperty('--hdr-h', hdr.getBoundingClientRect().height + 'px'));
  hdrObs.observe(hdr);
}

const jEl = $('#journeys');
if (jEl) {
  const jrObs = new ResizeObserver(() => {
    const e = $('#empty');
    if (!jEl.children.length || !e) return document.documentElement.style.setProperty('--jr-push', '0px');
    const top = parseFloat(getComputedStyle(e).top) || e.getBoundingClientRect().top;
    document.documentElement.style.setProperty('--jr-push', Math.max(0, Math.round(jEl.getBoundingClientRect().bottom + 14 - top)) + 'px');
  });
  jrObs.observe(jEl);
  new MutationObserver(() => jrObs.disconnect() || jrObs.observe(jEl)).observe(jEl, { childList: true });
  window.addEventListener('resize', () => { jrObs.disconnect(); jrObs.observe(jEl); });
}

// Fixtures for visual regression testing
const FIXTURES = {
  bar: () => screenToolsExtra.data_chart({ title: 'متوسط مدة الإنجاز حسب المنطقة', chart_type: 'bar', group_by: 'المنطقة', measure: 'مدة الإنجاز', agg: 'avg' }),
  hbar: () => screenToolsExtra.data_chart({ title: 'إجمالي الرسوم حسب نوع الخدمة', chart_type: 'hbar', group_by: 'نوع الخدمة', measure: 'الرسوم', agg: 'sum' }),
  pie: () => screenToolsExtra.data_chart({ title: 'عدد الطلبات حسب الحالة', chart_type: 'pie', group_by: 'الحالة', about: 'الطلبات' }),
  stacked: () => screenToolsExtra.data_chart({ title: 'الطلبات حسب المنطقة والحالة', chart_type: 'stacked', group_by: 'المنطقة', series_by: 'الحالة', about: 'الطلبات' }),
  line: () => screenToolsExtra.data_chart({ title: 'الطلبات شهرياً', chart_type: 'line', group_by: 'تاريخ الطلب', date_unit: 'month', about: 'الطلبات' }),
  note: () => screenToolsExtra.find_knowledge({ question: 'وش النطاق السعري المقترح للمسار السريع' }),
  note2: () => screenToolsExtra.find_knowledge({ question: 'كيف ينبّه الموظف لما يجيه طلب مستعجل؟' }),
};

window.__noraLogDemo = () => {
  bubble('u', 'اعرضي لي المشاريع', false);
  const f1 = { id: 'd1', name: 'show_screen', args: { view: 'overview' } };
  toolRow(f1);
  toolDone(f1, { shown_on_screen: 'لوحة المشاريع' });
  bubble('a', 'تفضّل، هذي المشاريع قدامك.', false);
  const f2 = { id: 'd2', name: 'close_visuals', args: {} };
  toolRow(f2);
  toolDone(f2, { back_to_main_screen: true });
  const f3 = { id: 'd3', name: 'find_knowledge', args: { question: 'الخطة الاستراتيجية' } };
  toolRow(f3);
  toolDone(f3, { results: [{ id: 'doc:8', title: 'الخطة الاستراتيجية والمهام 26.pdf' }], on_screen_source: 'الخطة الاستراتيجية والمهام 26.pdf' });
  const f4 = { id: 'd4', name: 'data_chart', args: { title: 'توزيع الأعمال الجارية' } };
  toolRow(f4);
  toolDone(f4, { error: 'ما لقيت جدول بهذا الاسم' });
  resetCur();
};

const FIX = new URLSearchParams(location.search).get('fixture');
if (FIX && FIXTURES[FIX]) {
  Promise.resolve().then(FIXTURES[FIX]).then(r => {
    window.__fxResult = r;
  }).catch(e => console.error('fixture', e)).finally(() => {
    document.documentElement.dataset.fixture = 'ready';
  });
}

// Initialize Application
gate();
