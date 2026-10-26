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
    // Task 7: اسم وجنس المساعد من مصدر واحد
    for (const [eng, name, ready, say] of [['eleven', 'فواز', /جاهز(?!ة)/, 'اعرض لي المشاريع'], ['gemini', 'نورة', /جاهزة/, 'اعرضي لي المشاريع']]) {
      await p.selectOption('#engine', eng); await p.waitForTimeout(400);
      const g = await p.evaluate(() => ({ chip: document.querySelector('#chip').innerText, ph: document.querySelector('#txt').placeholder, inLbl: document.querySelector('#txt').getAttribute('aria-label'), mic: document.querySelector('#mic').getAttribute('aria-label'), micT: document.querySelector('#mic').title, opt: document.querySelector('#engine').selectedOptions[0].textContent, say: document.querySelector('.qa-btn[data-say]').dataset.say }));
      ok(`persona ${eng}`, g.chip.includes(name) && ready.test(g.chip) && g.ph === `اسأل ${name}…` && g.inLbl.includes(name) && g.mic.includes(name) && g.micT.includes(name) && g.opt === `المساعد: ${name}` && g.say === say, JSON.stringify(g));
    }
  }
  await b.close();
} finally { srv.kill(); }
const failed = results.filter(x => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`); process.exit(failed ? 1 : 0);
