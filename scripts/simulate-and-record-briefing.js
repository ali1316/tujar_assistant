// scripts/simulate-and-record-briefing.js - Simulates full executive user flow & records WebM video
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { startServer } from '../server.js';

const PORT = 3500;
const BASE_URL = `http://localhost:${PORT}`;

const DIRS = [
  path.resolve('public/media'),
  'C:\\Users\\Administrator\\.gemini\\antigravity\\brain\\15e192de-dc7c-431c-ad0e-1b35ea4f8d24',
  'C:\\Users\\Administrator\\.gemini\\antigravity\\brain\\5bc32ce4-3313-4fdd-8e31-f6775c20730e',
];

for (const d of DIRS) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

console.log('🚀 1. Starting local dashboard server...');
const server = await startServer(PORT);

try {
  // Reset briefing session baseline for deterministic flow
  await fetch(`${BASE_URL}/api/executive/briefing/session/reset`, { method: 'POST' }).catch(() => {});

  console.log('🌐 2. Launching Chrome with CDP screencast...');
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1280,720',
      '--font-render-hinting=none',
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  // Open recorder page on same origin so WebCodecs VideoEncoder is available
  const recPage = await browser.newPage();
  await recPage.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  const webmMuxerCode = fs.readFileSync('node_modules/webm-muxer/build/webm-muxer.js', 'utf8');
  await recPage.evaluate(webmMuxerCode);

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1500));

  // Ensure dashboard overview components are visible
  await page.evaluate(() => {
    if (window.loadDashboard) window.loadDashboard();
    const home = document.getElementById('home');
    if (home) home.hidden = false;
    document.querySelectorAll('[data-v="overview"]').forEach(el => (el.hidden = false));
    document.querySelectorAll('[data-v="overview projects"]').forEach(el => (el.hidden = false));
  });

  // Start CDP screencast
  const client = await page.target().createCDPSession();
  const frames = [];

  client.on('Page.screencastFrame', async ({ data, sessionId }) => {
    frames.push(data);
    await client.send('Page.screencastFrameAck', { sessionId });
  });

  await client.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 85,
    everyNthFrame: 1,
  });

  console.log('📸 3. Simulating User Flow: Step 1 - Landing on Dashboard');
  await new Promise(r => setTimeout(r, 1200));

  const kf1 = await page.screenshot({ fullPage: false });
  saveArtifact('01_dashboard_landing.png', kf1);

  console.log('🎙️ 4. Simulating User Flow: Step 2 - Clicking Executive Briefing Button');
  // Highlight and click button
  await page.evaluate(() => {
    const btn = document.querySelector('#executiveBriefingBtn') || document.querySelector('.briefing-btn');
    if (btn) {
      btn.style.outline = '3px solid #3b82f6';
      btn.click();
    }
  });
  await new Promise(r => setTimeout(r, 1000));

  const kf2 = await page.screenshot({ fullPage: false });
  saveArtifact('02_briefing_active.png', kf2);

  console.log('🎯 5. Simulating User Flow: Step 3 - Screen Choreography Spotlights');
  // Cue 1: Budget KPI Spotlight
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('executive:spotlight', {
      detail: { target: '#kpi-budget', label: 'الميزانية الإجمالية المعتمدة: 5.3 مليون ريال' }
    }));
  });
  await new Promise(r => setTimeout(r, 1400));
  const kf3 = await page.screenshot({ fullPage: false });
  saveArtifact('03_spotlight_budget.png', kf3);

  // Cue 2: Delayed Project Spotlight
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('executive:spotlight', {
      detail: { target: 'project-2', label: 'مشروع متأخر: أتمتة رخص البناء (40%)' }
    }));
  });
  await new Promise(r => setTimeout(r, 1400));
  const kf4 = await page.screenshot({ fullPage: false });
  saveArtifact('04_spotlight_delayed_project.png', kf4);

  // Cue 3: Critical Tickets Spotlight
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('executive:spotlight', {
      detail: { target: '#tickets', label: 'تذاكر عالية الأولوية: خلل في النفاذ الوطني' }
    }));
  });
  await new Promise(r => setTimeout(r, 1400));
  const kf5 = await page.screenshot({ fullPage: false });
  saveArtifact('05_spotlight_tickets.png', kf5);

  // Cue 4: Auto-DK Knowledge Documents Spotlight
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('executive:spotlight', {
      detail: { target: '#docs', label: 'وثائق Auto-DK: ميزانية اتحاد الغرف 2026' }
    }));
  });
  await new Promise(r => setTimeout(r, 1400));
  const kf6 = await page.screenshot({ fullPage: false });
  saveArtifact('06_spotlight_docs.png', kf6);

  // Cue 5: Overview Wrap-up
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('executive:spotlight', {
      detail: { target: '#home', label: 'الموجز التنفيذي الشامل' }
    }));
  });
  await new Promise(r => setTimeout(r, 1200));
  const kf7 = await page.screenshot({ fullPage: false });
  saveArtifact('07_spotlight_home.png', kf7);

  console.log('🔄 6. Simulating User Flow: Step 4 - Delta & Stability Awareness Demonstration');
  // Clear spotlight
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('executive:spotlight:clear'));
    if (window.stopExecutiveBriefing) window.stopExecutiveBriefing();
  });
  await new Promise(r => setTimeout(r, 800));

  // Second run: Trigger briefing again to demonstrate stable state
  await page.evaluate(async () => {
    const btn = document.querySelector('#executiveBriefingBtn') || document.querySelector('.briefing-btn');
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 1200));
  const kf8 = await page.screenshot({ fullPage: false });
  saveArtifact('08_delta_stability.png', kf8);

  // Stop screencast
  await client.send('Page.stopScreencast');
  console.log(`🎬 7. Encoding ${frames.length} frames into high-definition WebM video...`);

  // Use recPage with WebCodecs VideoEncoder to compile the WebM video
  const videoBase64 = await recPage.evaluate(async (frameDataList) => {
    const { Muxer, ArrayBufferTarget } = window.WebMMuxer;
    const target = new ArrayBufferTarget();
    const muxer = new Muxer({
      target,
      video: {
        codec: 'V_VP8',
        width: 1280,
        height: 720,
        frameRate: 15,
      },
    });

    const videoEncoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => console.error('VideoEncoder error:', e),
    });

    videoEncoder.configure({
      codec: 'vp8',
      width: 1280,
      height: 720,
      bitrate: 3_000_000,
    });

    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');

    // Encode each frame
    for (let i = 0; i < frameDataList.length; i++) {
      const b64 = frameDataList[i];
      await new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0, 1280, 720);
          resolve();
        };
        img.src = 'data:image/jpeg;base64,' + b64;
      });

      const videoFrame = new VideoFrame(canvas, { timestamp: i * 66_666 }); // ~15 fps (66.6ms per frame)
      videoEncoder.encode(videoFrame, { keyFrame: i % 15 === 0 });
      videoFrame.close();
    }

    await videoEncoder.flush();
    muxer.finalize();

    const bytes = new Uint8Array(target.buffer);
    let binary = '';
    const chunkSz = 8192;
    for (let i = 0; i < bytes.length; i += chunkSz) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSz));
    }
    return btoa(binary);
  }, frames);

  const videoBuffer = Buffer.from(videoBase64, 'base64');
  console.log(`✅ WebM Video successfully compiled! File size: ${(videoBuffer.length / 1024).toFixed(1)} KB`);

  saveArtifact('morning-executive-briefing-flow.webm', videoBuffer);

  await browser.close();
  console.log('🎉 Full user flow simulation & media recording complete!');
  process.exit(0);
} finally {
  server.close();
}

function saveArtifact(filename, buffer) {
  for (const d of DIRS) {
    const targetPath = path.join(d, filename);
    fs.writeFileSync(targetPath, buffer);
    console.log(`   Saved: ${targetPath}`);
  }
}
