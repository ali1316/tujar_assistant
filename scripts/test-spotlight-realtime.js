import puppeteer from 'puppeteer-core';

async function testRealtimeBriefing() {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,720'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  page.on('console', msg => console.log(`[PAGE ${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => console.log(`[PAGE ERROR] ${err.message}`));

  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1500));

  // Click briefing button
  console.log('Clicking briefing button...');
  await page.evaluate(() => {
    const btn = document.querySelector('#executiveBriefingBtn') || document.querySelector('.briefing-btn');
    if (btn) btn.click();
  });

  // Track state every 2 seconds for 36 seconds
  for (let s = 0; s <= 36; s += 2) {
    const state = await page.evaluate(() => {
      const active = document.querySelector('.spotlight-active');
      const badge = document.querySelector('.spotlight-badge');
      const hudActive = document.querySelector('#hudActiveCue .hud-cue-text');
      return {
        scrollY: window.scrollY,
        activeTag: active ? active.tagName : null,
        activeId: active ? active.id : null,
        activeClass: active ? active.className : null,
        badgeText: badge ? badge.innerText.trim() : null,
        hudCue: hudActive ? hudActive.innerText.trim() : null,
      };
    });
    console.log(`[t = ${s}s] scrollY=${state.scrollY} | active=${state.activeId || state.activeTag} | badge="${state.badgeText}" | hud="${state.hudCue}"`);
    await new Promise(r => setTimeout(r, 2000));
  }

  await browser.close();
}

testRealtimeBriefing().catch(err => {
  console.error(err);
  process.exit(1);
});
