import puppeteer from 'puppeteer-core';

async function testBrowserChoreography() {
  console.log('Launching browser to test full briefing flow...');
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,720'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('spotlight') || text.includes('briefing') || text.includes('TRACE')) {
      console.log('BROWSER LOG:', text);
    }
  });

  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1500));

  console.log('Clicking briefing button...');
  await page.evaluate(() => {
    const btn = document.querySelector('#executiveBriefingBtn') || document.querySelector('.briefing-btn');
    if (btn) btn.click();
  });

  // Track each second for 30 seconds
  for (let s = 0; s <= 30; s += 2) {
    await new Promise(r => setTimeout(r, 2000));
    const state = await page.evaluate(() => {
      const active = document.querySelector('.spotlight-active');
      const badge = document.querySelector('.spotlight-badge');
      const hudActive = document.querySelector('#hudActiveCue .hud-cue-text');
      const stepper = [...document.querySelectorAll('#hudStepper .hud-step')].map(s => ({
        text: s.innerText.trim(),
        active: s.classList.contains('active'),
        done: s.classList.contains('done'),
      }));
      return {
        scrollY: Math.round(window.scrollY),
        activeTag: active ? active.tagName : null,
        activeId: active ? active.id : null,
        badgeText: badge ? badge.innerText.trim() : null,
        hudCue: hudActive ? hudActive.innerText.trim() : null,
        stepper,
      };
    });
    console.log(`[t = ${s + 2}s] scrollY=${state.scrollY} | active=${state.activeId || state.activeTag} | badge="${state.badgeText}"`);
    console.log(`   HUD: "${state.hudCue}"`);
    console.log(`   Stepper: ${state.stepper.map(st => `${st.text}(${st.active ? 'ACTIVE' : (st.done ? 'DONE' : 'PENDING')})`).join(' -> ')}`);
  }

  await browser.close();
}

testBrowserChoreography().catch(console.error);
