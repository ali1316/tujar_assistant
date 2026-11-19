import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const ARTIFACT_DIR = 'C:\\Users\\Administrator\\.gemini\\antigravity\\brain\\15e192de-dc7c-431c-ad0e-1b35ea4f8d24';

async function captureAllCues() {
  console.log('Capturing verified screenshots of all 5 choreography steps...');
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,720'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1200));

  // Click briefing button
  await page.evaluate(() => {
    const btn = document.querySelector('#executiveBriefingBtn') || document.querySelector('.briefing-btn');
    if (btn) btn.click();
  });

  // Step 1: Budget KPI (t = 2s)
  await new Promise(r => setTimeout(r, 2000));
  const ss1 = await page.screenshot({ fullPage: false });
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'choreography_01_budget.png'), ss1);
  console.log('📸 Saved choreography_01_budget.png');

  // Step 2: Delayed Project (t = 7s)
  await new Promise(r => setTimeout(r, 5000));
  const ss2 = await page.screenshot({ fullPage: false });
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'choreography_02_delayed_project.png'), ss2);
  console.log('📸 Saved choreography_02_delayed_project.png');

  // Step 3: Operational Tickets (t = 14s)
  await new Promise(r => setTimeout(r, 7000));
  const ss3 = await page.screenshot({ fullPage: false });
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'choreography_03_tickets.png'), ss3);
  console.log('📸 Saved choreography_03_tickets.png');

  // Step 4: Auto-DK Documents (t = 21s)
  await new Promise(r => setTimeout(r, 7000));
  const ss4 = await page.screenshot({ fullPage: false });
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'choreography_04_docs.png'), ss4);
  console.log('📸 Saved choreography_04_docs.png');

  // Step 5: Executive Wrap-up (t = 28s)
  await new Promise(r => setTimeout(r, 7000));
  const ss5 = await page.screenshot({ fullPage: false });
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'choreography_05_overview.png'), ss5);
  console.log('📸 Saved choreography_05_overview.png');

  await browser.close();
  console.log('All 5 choreography screenshots captured successfully!');
}

captureAllCues().catch(console.error);
