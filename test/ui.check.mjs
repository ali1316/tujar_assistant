// فحوص الواجهة بالمتصفح ضد سيرفر محلي — node test/ui.check.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nora-ui-'));
const PORT = 3990 + Math.floor(Math.random() * 8);
const env = { ...process.env, DB_PATH: path.join(dir, 'ui.db'), ACCESS_CODE: '322007', PORT: String(PORT), INGEST_STORAGE: 'local', INGEST_LOCAL_DIR: dir, DRIVE_SCRIPT_URL: '' }; delete env.DATABASE_URL;
const srv = spawn(process.execPath, ['server.js'], { env, stdio: 'ignore' });
const results = []; const ok = (name, cond, detail = '') => { results.push(!!cond); console.log(`${cond ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); };
const only = process.argv[2];
try {
  await new Promise(r => setTimeout(r, 4500));
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  await p.addInitScript(() => { localStorage.setItem('accessCode', '322007'); });
  await p.goto(`http://localhost:${PORT}/`); await p.waitForTimeout(2000);
  const vis = () => p.evaluate(() => !document.querySelector('#view').hidden);

  if (!only || only === 'view') {
    // Task 5: إغلاق السجل بـ Esc ما يقفل المعروض على الشاشة
    await p.evaluate(() => window.__nora.hud.showOverview()); await p.waitForTimeout(1200);
    const before = await vis();
    await p.click('#logBtn'); await p.waitForTimeout(300);
    await p.keyboard.press('Escape'); await p.waitForTimeout(500);
    ok('view persists after drawer close', before && await vis() && await p.evaluate(() => document.querySelector('#drawer').hidden), `before=${before}`);
    await p.keyboard.press('Escape'); await p.waitForTimeout(500);
    ok('second Escape (no drawer) still closes the view', !(await vis()));
  }
  if (!only || only === 'busy') {
    // Task 6: حالة الانتظار للاختصارات
    await p.reload(); await p.waitForTimeout(1500);
    // اتصال بطيء: نعلّق طلب جلسة المحرك (بدون مفتاح محلياً كان يفشل فوراً)
    await p.route('**/api/session**', () => {}); await p.route('**/api/eleven/session**', () => {});
    await p.evaluate(() => { window.__qaTimeout = 2500; });
    const btn = p.locator('.qa-btn[data-say]').first();
    await btn.click(); await p.waitForTimeout(100);
    ok('button busy + disabled within 100ms', await btn.getAttribute('aria-busy') === 'true' && await btn.isDisabled());
    ok('skeleton shows what is being prepared', /جاري تجهيز/.test(await p.locator('#qaSkel').innerText().catch(() => '')) && await p.locator('#qaSkel').isVisible());
    await p.waitForTimeout(900);
    ok('busy survives connect', await btn.getAttribute('aria-busy') === 'true');
    await p.waitForTimeout(2000);
    ok('timeout says no reply + retry', /ما وصل رد/.test(await p.locator('#qaSkel').innerText()) && await p.locator('#qaSkel button').isVisible() && await btn.getAttribute('aria-busy') !== 'true');
    await p.evaluate(() => { window.__qaTimeout = 20000; }); await p.locator('#qaSkel button').click(); await p.waitForTimeout(100);
    ok('retry re-enters busy', await btn.getAttribute('aria-busy') === 'true');
    await p.evaluate(() => window.__nora.status('❌ تعذّر الاتصال بالمساعد')); await p.waitForTimeout(200);
    ok('error clears busy and shows the real error', await btn.getAttribute('aria-busy') !== 'true' && /تعذّر الاتصال/.test(await p.locator('#qaSkel').innerText()));
    await btn.click(); await p.waitForTimeout(100);
    await p.evaluate(() => window.__nora.hud.showOverview()); await p.waitForTimeout(800);
    ok('view clears busy and skeleton', await btn.getAttribute('aria-busy') !== 'true' && !(await p.locator('#qaSkel').isVisible()));
  }
  if (!only || only === 'persona') {
    // Task 7: اسم وجنس المساعد من مصدر واحد — نبدأ من الشاشة الرئيسية (رسم مفتوح من فحص سابق ما يتمدد مع تغيير العرض)
    await p.reload(); await p.waitForTimeout(1500);
    for (const [eng, name, ready, say] of [['eleven', 'فواز', /جاهز(?!ة)/, 'اعرض لي المشاريع'], ['gemini', 'نورة', /جاهزة/, 'اعرضي لي المشاريع']]) {
      await p.selectOption('#engine', eng); await p.waitForTimeout(400);
      const g = await p.evaluate(() => ({ chip: document.querySelector('#chip').innerText, ph: document.querySelector('#txt').placeholder, inLbl: document.querySelector('#txt').getAttribute('aria-label'), mic: document.querySelector('#mic').getAttribute('aria-label'), micT: document.querySelector('#mic').title, opt: document.querySelector('#engine').selectedOptions[0].textContent, say: document.querySelector('.qa-btn[data-say]').dataset.say }));
      for (const w of [1280, 390]) {
        await p.setViewportSize({ width: w, height: 800 }); await p.waitForFunction(x => innerWidth === x && new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))), w); await p.waitForTimeout(150);
        const fit = await p.evaluate(() => { const e = document.querySelector('#engine'); const c = document.createElement('canvas').getContext('2d'); const cs = getComputedStyle(e); c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`; return { need: Math.ceil(c.measureText(e.selectedOptions[0].textContent).width) + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + 18, have: e.clientWidth, cap: cs.maxWidth, sw: document.documentElement.scrollWidth, vw: innerWidth }; });
        ok(`engine label not clipped at ${w}px (${eng})`, fit.have >= fit.need && fit.cap === 'none' && fit.sw <= fit.vw, JSON.stringify(fit));
      }
      await p.setViewportSize({ width: 1280, height: 800 });
      ok(`persona ${eng}`, g.chip.includes(name) && ready.test(g.chip) && g.ph === `اسأل ${name}…` && g.inLbl.includes(name) && g.mic.includes(name) && g.micT.includes(name) && g.opt === `المساعد: ${name}` && g.say === say, JSON.stringify(g));
    }
  }
  if (!only || only === 'jeddawi') {
    // جداوي: مساعد ثالث — عقل Gemini + صوت ElevenLabs v4 Turbo
    const noKey = await p.evaluate(async () => { const r = await fetch('/api/speak/eleven', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-access-code': '322007' }, body: JSON.stringify({ text: 'هلا' }) }); return { s: r.status, j: await r.json() }; });
    ok('speak route without key → clear error', noKey.s === 500 && /ELEVENLABS_API_KEY/.test(noKey.j.error), JSON.stringify(noKey));
    await p.selectOption('#engine', 'jeddawi'); await p.waitForTimeout(400);
    const g = await p.evaluate(() => { const a = window.__nora.agent(); return { opt: document.querySelector('#engine').selectedOptions[0].textContent, chip: document.querySelector('#chip').innerText, ph: document.querySelector('#txt').placeholder, speak: a.speakUrl, persona: a.persona, gemini: a.constructor.name, mode: window.__nora.modeFor() }; });
    ok('جداوي in the selector with masculine strings', g.opt === 'المساعد: جداوي' && /جداوي/.test(g.chip) && /جاهز(?!ة)/.test(g.chip) && g.ph === 'اسأل جداوي…', JSON.stringify(g));
    ok('جداوي = Gemini brain, mine mode, eleven speak URL', g.gemini === 'GeminiLiveAgent' && g.mode === 'mine' && g.speak === '/api/speak/eleven' && g.persona === 'jeddawi', JSON.stringify(g));
    await p.selectOption('#engine', 'eleven'); await p.waitForTimeout(300);
    const fz = await p.evaluate(() => { const a = window.__nora.agent(); return { gemini: a.constructor.name, speak: a.speakUrl, persona: a.persona, mode: window.__nora.modeFor() }; });
    ok('فواز = Gemini brain + his voice (mine mode)', fz.gemini === 'GeminiLiveAgent' && fz.speak === '/api/speak/eleven' && fz.persona === 'fawaz' && fz.mode === 'mine', JSON.stringify(fz));
    await p.selectOption('#engine', 'gemini'); await p.waitForTimeout(300);
    const n = await p.evaluate(() => { const a = window.__nora.agent(); return { speak: a.speakUrl, persona: a.persona || '', mode: window.__nora.modeFor() }; });
    ok('switching back restores Nora live mode', n.speak === '/api/speak' && n.persona === '' && n.mode === 'live', JSON.stringify(n));
  }
  await b.close();
} finally { srv.kill(); }
const failed = results.filter(x => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`); process.exit(failed ? 1 : 0);
