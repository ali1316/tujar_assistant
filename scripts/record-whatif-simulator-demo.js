// scripts/record-whatif-simulator-demo.js
// Records a high-definition 720p/1080p WebM walkthrough video demonstrating the content-driven What-If Simulator
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { startServer } from '../server.js';

const PORT = 3502;
const BASE_URL = `http://localhost:${PORT}`;

const DIRS = [
  path.resolve('public/media'),
  'C:\\Users\\Administrator\\.gemini\\antigravity\\brain\\f9ce22ec-0b64-4b71-91dc-38704b438817',
  'C:\\Users\\Administrator\\.gemini\\antigravity\\brain\\5bc32ce4-3313-4fdd-8e31-f6775c20730e',
];

for (const d of DIRS) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

function saveArtifact(filename, buffer) {
  for (const d of DIRS) {
    try {
      const targetPath = path.join(d, filename);
      fs.writeFileSync(targetPath, buffer);
      console.log(`   Saved: ${targetPath}`);
    } catch (e) {
      console.warn(`   Failed writing to ${d}:`, e.message);
    }
  }
}

async function showPresenterHUD(page, badge, title, subtitle, durationMs = 2600) {
  await page.evaluate(({ badge, title, subtitle }) => {
    let el = document.getElementById('demoPresenterHUD');
    if (!el) {
      el = document.createElement('div');
      el.id = 'demoPresenterHUD';
      el.style.cssText = `
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 9999999;
        background: linear-gradient(135deg, rgba(8, 23, 38, 0.95), rgba(16, 37, 60, 0.95));
        border: 1px solid rgba(209, 166, 92, 0.8);
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.75), 0 0 25px rgba(209, 166, 92, 0.3);
        border-radius: 14px;
        padding: 12px 24px;
        color: #eef2f7;
        font-family: 'IBM Plex Sans Arabic', -apple-system, sans-serif;
        text-align: center;
        backdrop-filter: blur(16px);
        direction: rtl;
        pointer-events: none;
        transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
        max-width: 820px;
        width: 88vw;
      `;
      document.body.appendChild(el);
    }
    el.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 4px;">
        <span style="background: rgba(209, 166, 92, 0.2); color: #d1a65c; font-size: 11px; font-weight: 700; padding: 2px 10px; border-radius: 20px; border: 1px solid #d1a65c;">${badge}</span>
        <b style="font-size: 15px; color: #fff;">${title}</b>
      </div>
      <div style="font-size: 13px; color: #c9d6e6; opacity: 0.92; line-height: 1.4;">${subtitle}</div>
    `;
    el.style.opacity = '1';
  }, { badge, title, subtitle });

  await new Promise(r => setTimeout(r, durationMs));
}

console.log('🚀 1. Starting Dashboard Server on port ' + PORT + '...');
const server = await startServer(PORT);

try {
  console.log('🌐 2. Launching Headless Chrome Browser...');
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

  // Open recorder page on same origin for WebCodecs VideoEncoder
  const recPage = await browser.newPage();
  await recPage.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  const webmMuxerCode = fs.readFileSync('node_modules/webm-muxer/build/webm-muxer.js', 'utf8');
  await recPage.evaluate(webmMuxerCode);

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1200));

  // Initialize Dashboard
  await page.evaluate(async () => {
    localStorage.setItem('accessCode', '322007');
    document.cookie = 'accessCode=322007; path=/';
    if (window.loadDashboard) await window.loadDashboard();
    const home = document.getElementById('home');
    if (home) home.hidden = false;
    document.querySelectorAll('[data-v="overview"]').forEach(el => (el.hidden = false));
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

  console.log('🎬 3. Act 1: Main Executive Dashboard Landing');
  await showPresenterHUD(
    page,
    'المشهد الأول · 1/6',
    'المنظومة التنفيذية التفاعلية',
    'استعراض لوحة القيادة المركزية قبل إطلاق غرفة نمذجة ومحاكاة القرارات التنفيذية',
    2200
  );
  const kf1 = await page.screenshot({ fullPage: false });
  saveArtifact('01_dashboard_landing.png', kf1);

  console.log('🎛️ 4. Act 2: Opening What-If Simulator Cockpit');
  await page.evaluate(async () => {
    if (window.openSimulatorCockpit) {
      await window.openSimulatorCockpit();
    }
  });
  await new Promise(r => setTimeout(r, 1000));

  await showPresenterHUD(
    page,
    'المشهد الثاني · 2/6',
    'قمرة القيادة: محاكي القرارات التنفيذية',
    'فتح قمرة المحاكاة — السلايدرات وحزم القرارات تشتق لحظياً وفق ميزانية وجدول المشروع المستهدف',
    2600
  );
  const kf2 = await page.screenshot({ fullPage: false });
  saveArtifact('02_simulator_cockpit_opened.png', kf2);

  console.log('🔄 5. Act 3: Switching to Delayed Project (أتمتة رخص البناء)');
  // Switch to project #2 (Delayed project)
  await page.evaluate(() => {
    const sel = document.getElementById('simProjectSelect');
    if (sel) {
      sel.value = '2';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await new Promise(r => setTimeout(r, 1200));

  await showPresenterHUD(
    page,
    'المشهد الثالث · 3/6',
    'حزم وقرارات مخصصة للمشروع المتعثر',
    'توليد تلقائي لحزمة «🚀 خطة الإنقاذ وتدارك التأخير» واحتواء العجز وفق نسبة الإنجاز ومعدل الحرق',
    2800
  );
  const kf3 = await page.screenshot({ fullPage: false });
  saveArtifact('03_delayed_project_adaptive_packages.png', kf3);

  console.log('⚡ 6. Act 4: Triggering 1-Click Rescue Strategy Package');
  // Click first strategy package button (Rescue plan)
  await page.evaluate(() => {
    const firstPkgBtn = document.querySelector('#simStrategyPackages .sim-pkg-btn');
    if (firstPkgBtn) {
      firstPkgBtn.style.outline = '2px solid #59c48f';
      firstPkgBtn.click();
    }
  });
  await new Promise(r => setTimeout(r, 1400));

  await showPresenterHUD(
    page,
    'المشهد الرابع · 4/6',
    'تطبيق حزمة التسريع وإعادة الحساب الرياضي',
    'تحديث نسبي لسرعة الإنجاز، تقديم موعد الإطلاق، واحتساب تغير معدل الصرف اليومي (Burn Rate)',
    2800
  );
  const kf4 = await page.screenshot({ fullPage: false });
  saveArtifact('04_rescue_package_applied.png', kf4);

  console.log('🏁 7. Act 5: Switching to Completed Project (Adaptive UI & Disabled Timeline)');
  // Switch to project #3 (Completed project 100%)
  await page.evaluate(() => {
    const sel = document.getElementById('simProjectSelect');
    if (sel) {
      sel.value = '3';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await new Promise(r => setTimeout(r, 1400));

  await showPresenterHUD(
    page,
    'المشهد الخامس · 5/6',
    'التكيف الذكي للمشاريع المكتملة',
    'تجميد سلايدر الجدول الزمني تلقائياً وتحويل حزم القرارات إلى تدقيق مالي وتحرير الفائض التمويلي للمحفظة',
    2800
  );
  const kf5 = await page.screenshot({ fullPage: false });
  saveArtifact('05_completed_project_frozen_timeline.png', kf5);

  console.log('🏛️ 8. Act 6: Committing Plan to Live Portfolio Database');
  // Switch back to project #1 and commit
  await page.evaluate(() => {
    const sel = document.getElementById('simProjectSelect');
    if (sel) {
      sel.value = '1';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await new Promise(r => setTimeout(r, 1000));

  await page.evaluate(() => {
    const bSlider = document.getElementById('simBudgetSlider');
    const tSlider = document.getElementById('simTimelineSlider');
    if (bSlider) {
      bSlider.value = '150000';
      bSlider.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (tSlider) {
      tSlider.value = '-12';
      tSlider.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await new Promise(r => setTimeout(r, 1000));

  // Click apply button
  await page.evaluate(() => {
    const applyBtn = document.getElementById('simApplyBtn');
    if (applyBtn) {
      applyBtn.style.outline = '3px solid #d1a65c';
      applyBtn.click();
    }
  });
  await new Promise(r => setTimeout(r, 1500));

  await showPresenterHUD(
    page,
    'المشهد السادس · 6/6',
    'اعتماد الخطة في المحفظة ومزامنة السجلات',
    'ترحيل التعديلات المعتمدة فورياً لقاعدة البيانات وتحديث مؤشرات الأداء ولوحة القيادة',
    2600
  );
  const kf6 = await page.screenshot({ fullPage: false });
  saveArtifact('06_plan_applied_success.png', kf6);

  // Stop screencast
  await client.send('Page.stopScreencast');
  console.log(`🎬 9. Compiling ${frames.length} frames into HD WebM video via WebCodecs...`);

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
      bitrate: 3_200_000,
    });

    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');

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

      const videoFrame = new VideoFrame(canvas, { timestamp: i * 66_666 });
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

  saveArtifact('whatif_simulator_demo.webm', videoBuffer);

  // Also convert to MP4 using cypress ffmpeg if available
  const FFMPEG_PATH = 'C:/Users/Administrator/AppData/Local/Cypress/Cache/13.8.1/Cypress/resources/app/node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe';
  if (fs.existsSync(FFMPEG_PATH)) {
    try {
      const webmPath = path.resolve('public/media/whatif_simulator_demo.webm');
      const mp4Path = path.resolve('public/media/whatif_simulator_demo.mp4');
      const { execFileSync } = await import('node:child_process');
      execFileSync(FFMPEG_PATH, ['-y', '-i', webmPath, '-c:v', 'libx264', '-preset', 'fast', '-crf', '22', '-pix_fmt', 'yuv420p', mp4Path], { stdio: 'pipe' });
      if (fs.existsSync(mp4Path)) {
        const mp4Buf = fs.readFileSync(mp4Path);
        console.log(`✅ Converted to MP4! File size: ${(mp4Buf.length / 1024).toFixed(1)} KB`);
        saveArtifact('whatif_simulator_demo.mp4', mp4Buf);
      }
    } catch (err) {
      console.warn('MP4 conversion warning:', err.message);
    }
  }

  await browser.close();
  console.log('🎉 DEMO VIDEO GENERATION & RECORDING COMPLETE!');
  process.exit(0);
} catch (err) {
  console.error('❌ Error recording demo video:', err);
  process.exit(1);
} finally {
  server.close();
}
