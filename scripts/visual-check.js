import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const ARTIFACT_DIR = 'C:\\Users\\Administrator\\.gemini\\antigravity\\brain\\15e192de-dc7c-431c-ad0e-1b35ea4f8d24';

async function diagnose() {
  console.log('🔍 Launching Chrome for Visual Check on http://localhost:3000/...');

  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,720'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  const logs = [];
  page.on('console', msg => logs.push(`[CONSOLE ${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => logs.push(`[PAGE ERROR] ${err.message}`));
  page.on('requestfailed', req => logs.push(`[FAILED REQ] ${req.method()} ${req.url()}`));

  console.log('Navigating to http://localhost:3000/...');
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));

  // Screenshot 1: What does the user see immediately on page load?
  const ss1 = await page.screenshot({ fullPage: false });
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'diag_01_page_load.png'), ss1);
  console.log('📸 Saved diag_01_page_load.png');

  // Check Gate status and DOM visibility
  const domState1 = await page.evaluate(() => {
    const gate = document.getElementById('gate');
    const home = document.getElementById('home');
    const btn = document.querySelector('#executiveBriefingBtn');
    const kpis = document.getElementById('kpis');
    const kpiBudget = document.getElementById('kpi-budget');
    return {
      gateVisible: gate ? getComputedStyle(gate).display !== 'none' : false,
      homeVisible: home ? !home.hidden && getComputedStyle(home).display !== 'none' : false,
      btnExists: Boolean(btn),
      btnText: btn ? btn.innerText.trim() : null,
      kpisHtml: kpis ? kpis.innerHTML.slice(0, 150) : null,
      kpiBudgetExists: Boolean(kpiBudget),
    };
  });
  console.log('DOM State on load:', domState1);

  // If gate is visible, let's see why
  if (domState1.gateVisible) {
    console.log('⚠️ Gate is blocking the dashboard! Unlocking gate...');
    await page.evaluate(() => {
      const g = document.getElementById('gate');
      if (g) g.style.display = 'none';
      if (window.loadDashboard) window.loadDashboard();
    });
    await new Promise(r => setTimeout(r, 1000));
    const ssGate = await page.screenshot({ fullPage: false });
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'diag_02_after_gate_unlock.png'), ssGate);
    console.log('📸 Saved diag_02_after_gate_unlock.png');
  }

  // Now, click the briefing button!
  console.log('🖱️ Clicking Executive Briefing Button...');
  const clickResult = await page.evaluate(async () => {
    const btn = document.querySelector('#executiveBriefingBtn') || document.querySelector('.briefing-btn');
    if (!btn) return { ok: false, error: 'Button not found' };
    btn.click();
    return { ok: true, classList: btn.className, html: btn.innerHTML };
  });
  console.log('Click result:', clickResult);

  // Wait 1.5s and capture what the screen looks like
  await new Promise(r => setTimeout(r, 1500));
  const ssClick = await page.screenshot({ fullPage: false });
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'diag_03_after_click.png'), ssClick);
  console.log('📸 Saved diag_03_after_click.png');

  // Inspect spotlight and HUD state in DOM
  const domState2 = await page.evaluate(() => {
    const hud = document.getElementById('executiveBriefingHud');
    const spotlightActive = document.querySelector('.spotlight-active');
    const badge = document.querySelector('.spotlight-badge');
    const btn = document.querySelector('#executiveBriefingBtn');
    return {
      hudExists: Boolean(hud),
      hudVisible: hud ? hud.classList.contains('visible') : false,
      hudText: hud ? hud.innerText.slice(0, 150) : null,
      spotlightTargetId: spotlightActive ? spotlightActive.id || spotlightActive.tagName : null,
      spotlightOutline: spotlightActive ? getComputedStyle(spotlightActive).outline : null,
      badgeText: badge ? badge.innerText.trim() : null,
      btnClass: btn ? btn.className : null,
    };
  });
  console.log('DOM State 1.5s after click:', domState2);

  // Wait another 8s to see the transition to delayed project
  console.log('Waiting 8s for next spotlight...');
  await new Promise(r => setTimeout(r, 8000));
  const ssTransition = await page.screenshot({ fullPage: false });
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'diag_04_transition.png'), ssTransition);
  console.log('📸 Saved diag_04_transition.png');

  const domState3 = await page.evaluate(() => {
    const spotlightActive = document.querySelector('.spotlight-active');
    const badge = document.querySelector('.spotlight-badge');
    return {
      spotlightTargetId: spotlightActive ? spotlightActive.id || spotlightActive.tagName : null,
      badgeText: badge ? badge.innerText.trim() : null,
    };
  });
  console.log('DOM State at 9s:', domState3);

  console.log('\n--- Captured Console Logs ---');
  logs.forEach(l => console.log(l));

  await browser.close();
}

diagnose().catch(e => console.error('Diagnosis failed:', e));
