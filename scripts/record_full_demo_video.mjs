import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const ARTIFACTS_DIR = 'C:/Users/Administrator/.gemini/antigravity/brain/5bc32ce4-3313-4fdd-8e31-f6775c20730e';
const PROJECT_ROOT = 'E:/gemini-live-dashboard';
const FFMPEG_PATH = 'C:/Users/Administrator/AppData/Local/Cypress/Cache/13.8.1/Cypress/resources/app/node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe';
const TEMP_VIDEO_DIR = path.resolve('temp_videos');

if (!fs.existsSync(TEMP_VIDEO_DIR)) {
  fs.mkdirSync(TEMP_VIDEO_DIR, { recursive: true });
}

// Presenter Banner Helper
async function showPresenterBanner(page, actNumber, title, subtitle, durationMs = 3000) {
  console.log(`🎬 [ACT ${actNumber}] ${title}: ${subtitle}`);
  await page.evaluate(({ actNumber, title, subtitle }) => {
    let el = document.getElementById('execDemoPresenter');
    if (!el) {
      el = document.createElement('div');
      el.id = 'execDemoPresenter';
      el.style.cssText = `
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%) translateY(0);
        z-index: 9999999;
        background: linear-gradient(135deg, rgba(8, 23, 38, 0.95), rgba(16, 37, 60, 0.95));
        border: 1px solid rgba(209, 166, 92, 0.7);
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.7), 0 0 25px rgba(209, 166, 92, 0.25);
        border-radius: 16px;
        padding: 12px 28px;
        color: #eef2f7;
        font-family: 'IBM Plex Sans Arabic', -apple-system, BlinkMacSystemFont, sans-serif;
        text-align: center;
        backdrop-filter: blur(16px);
        direction: rtl;
        pointer-events: none;
        transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        max-width: 860px;
        width: 90vw;
      `;
      document.body.appendChild(el);
    }
    el.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 4px;">
        <span style="background: rgba(209, 166, 92, 0.2); color: #d1a65c; font-size: 11.5px; font-weight: 700; padding: 2px 10px; border-radius: 20px; border: 1px solid #d1a65c;">المشهد ${actNumber}</span>
        <b style="font-size: 16px; color: #fff; letter-spacing: 0.3px;">${title}</b>
      </div>
      <div style="font-size: 13.5px; color: #c9d6e6; opacity: 0.92; line-height: 1.4;">${subtitle}</div>
    `;
    el.style.opacity = '1';
    el.style.transform = 'translateX(-50%) translateY(0)';
  }, { actNumber, title, subtitle });

  await page.waitForTimeout(durationMs);
}

// Visual click pulse simulation
async function clickWithHighlight(page, selector, textNote = '') {
  const locator = page.locator(selector).first();
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  const box = await locator.boundingBox().catch(() => null);
  if (box) {
    await page.evaluate(({ x, y, width, height }) => {
      const ring = document.createElement('div');
      ring.style.cssText = `
        position: fixed;
        left: ${x + width / 2 - 20}px;
        top: ${y + height / 2 - 20}px;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        border: 2px solid #d1a65c;
        box-shadow: 0 0 20px #d1a65c;
        pointer-events: none;
        z-index: 10000000;
        animation: execRingPulse 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      `;
      const style = document.createElement('style');
      style.textContent = `
        @keyframes execRingPulse {
          0% { transform: scale(0.5); opacity: 1; }
          100% { transform: scale(2.2); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
      document.body.appendChild(ring);
      setTimeout(() => ring.remove(), 700);
    }, box);
  }
  await locator.click();
}

async function runDemoRecording() {
  console.log('🎥 STARTING EXECUTIVE FULL CAPABILITIES DEMO VIDEO RECORDING...');

  const browser = await chromium.launch({
    headless: true,
    args: ['--enable-font-antialiasing', '--no-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: {
      dir: TEMP_VIDEO_DIR,
      size: { width: 1920, height: 1080 }
    }
  });

  const page = await context.newPage();

  // =========================================================================
  // ACT 1: Executive Cockpit Overview & Strategic Portfolio Metrics
  // =========================================================================
  await page.goto('http://localhost:3000/');
  await page.waitForTimeout(2500);

  await showPresenterBanner(
    page,
    1,
    'المنصة التنفيذية الموحدة · اتحاد الغرف السعودية',
    'لوحة القيادة الذكية لمنصة تجار بمؤشرات التحول الرقمي، تتبع المشاريع، والمساعد التنفيذي نورة',
    3500
  );

  // Smooth scroll across projects
  await page.evaluate(() => window.scrollBy({ top: 380, behavior: 'smooth' }));
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await page.waitForTimeout(1500);

  // =========================================================================
  // ACT 2: What-If Strategic Decision Simulator
  // =========================================================================
  await showPresenterBanner(
    page,
    2,
    'غرفة نمذجة ومحاكاة القرارات التنفيذية (What-If Simulator)',
    'دراسة الأثر الفوري لضخ الميزانيات وتعديل الجداول الزمنية على الإنجاز وعائد المحفظة وتوليد توصيات المجلس',
    3500
  );

  await clickWithHighlight(page, '#qaSim');
  await page.waitForTimeout(2200);

  // 2.1 Test Rescue & Acceleration Strategic Package
  await showPresenterBanner(
    page,
    '2.1',
    'تطبيق حزمة استراتيجية: 🚀 الإنقاذ والتسريع (+300K ر.س · ضغط 25 يوماً)',
    'حساب فوري للأيام المكتسبة، تغير معدل الحرق اليومي، وتوليد توصية نورة الاستراتيجية للمجلس التنفيذي',
    3500
  );

  await clickWithHighlight(page, '.sim-pkg-btn[data-b="300000"]');
  await page.waitForTimeout(2500);

  // 2.2 Test Custom Executive AI Scenario Query
  await showPresenterBanner(
    page,
    '2.2',
    'المحاكاة الذكية بالذكاء الاصطناعي (AI Scenario Reasoning)',
    'طرح سيناريو حر لقياس أثر دمج فرق المشاريع والمفاضلة بين الجداول الزمنية والمخاطر التشغيلية',
    3000
  );

  const customInput = page.locator('#simCustomQuery');
  await customInput.fill('ماذا لو قمنا بدمج فريق المشروع مع فريق البنية التحتية لتفادي التجاوز المالي؟');
  await page.waitForTimeout(800);
  await clickWithHighlight(page, '#simAiQueryBtn');
  await page.waitForTimeout(3500);

  // 2.3 Visual Comparison Chart & Plan Adoption
  await page.evaluate(() => window.scrollBy({ top: 320, behavior: 'smooth' }));
  await page.waitForTimeout(2500);

  await showPresenterBanner(
    page,
    '2.3',
    'المقارنة البصرية واعتماد التعديل في الخطة الرسمية',
    'مقارنة الخطة الحالية بالسيناريو المقترح واعتماد التعديل في السجلات التنفيذية فورياً',
    3000
  );

  await clickWithHighlight(page, '#simApplyBtn');
  await page.waitForTimeout(2000);

  // Close simulator
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await page.waitForTimeout(800);
  await clickWithHighlight(page, '#simCloseBtn');
  await page.waitForTimeout(1500);

  // =========================================================================
  // ACT 3: Dynamic Document Ingestion & Automatic Project Discovery
  // =========================================================================
  await showPresenterBanner(
    page,
    3,
    'رفع المستندات واستخلاص المشاريع ديناميكياً',
    'رفع تقرير المراجعة المحاسبية من مجلد العينات واستخلاص المشاريع الجديدة آلياً وتحديث المحفظة من 5 إلى 7 مشاريع',
    3500
  );

  const sampleDocPath = path.resolve('data-samples/documents/14_تقرير_المراجعة_المحاسبية_وتدقيق_تناقضات_المشاريع.md');
  const fileInput = page.locator('#file');
  await fileInput.setInputFiles(sampleDocPath);
  await page.waitForTimeout(6500);

  await showPresenterBanner(
    page,
    '3.1',
    'لوحة تقرير المراجعة المالية والمطابقة الميدانية',
    'توليد داشبورد تفاعلي فوري من الوثيقة مع مؤشرات المبالغ المحصلة والعمليات الأسبوعية لمنصة تجار',
    3500
  );

  await page.evaluate(() => window.scrollBy({ top: 300, behavior: 'smooth' }));
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await page.waitForTimeout(1000);

  // =========================================================================
  // ACT 4: Dynamic Project Dashboard Exploration
  // =========================================================================
  await clickWithHighlight(page, '#fdHide');
  await page.waitForTimeout(1200);

  await showPresenterBanner(
    page,
    4,
    'تحديث محفظة المشاريع واللوحات المستقلة',
    'إدراج مشروعي "تحديث البنية التحتية" و"منظومة الذكاء الاصطناعي" مع أزرار استعراض لوحة كل مشروع',
    3500
  );

  await page.evaluate(() => window.scrollBy({ top: 350, behavior: 'smooth' }));
  await page.waitForTimeout(2500);

  // Open the newly discovered project dashboard
  await showPresenterBanner(
    page,
    '4.1',
    'لوحة مشروع: منظومة الذكاء الاصطناعي للغرف',
    'رسوم بيانية لمقارنة الميزانية المعتمدة (2.5M) مقابل المصروف الفعلي (2.4M) وتنبيه استنزاف السيولة',
    3500
  );

  const lastProjDashBtn = page.locator('#projects tbody tr .btn-proj-dash').last();
  await lastProjDashBtn.click();
  await page.waitForTimeout(2500);

  await page.evaluate(() => window.scrollBy({ top: 280, behavior: 'smooth' }));
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await page.waitForTimeout(1000);

  // =========================================================================
  // ACT 5: Spatial Visual Spotlight & Element Guidance
  // =========================================================================
  await showPresenterBanner(
    page,
    5,
    'توجيه الانتباه البصري التنفيذي (Spatial Spotlight)',
    'تسليط الهالة الذهبية النبضية على المؤشرات الحرجة والتذاكر المفتوحة أثناء العرض القيادي',
    3000
  );

  await page.evaluate(() => {
    if (window.spotlightElement) {
      window.spotlightElement({
        target: '#filedash .fd-kpi, .kpi:first-child',
        label: 'مؤشر الصرف الحرج: 96% من الميزانية مع إنجاز 25%',
        durationMs: 4000
      });
    }
  });
  await page.waitForTimeout(4000);

  // =========================================================================
  // ACT 6: Conversational AI Co-pilot (Nora) & Spatial Left Dock
  // =========================================================================
  await showPresenterBanner(
    page,
    6,
    'المستشار التنفيذي الذكي (نورة) وتنسيق Apple HIG',
    'المحاورة المباشرة من واقع الشاشة النشطة وتنسيق الردود ببطاقات تنفيذية راقية مع أزرار الاستماع والنسخ',
    3500
  );

  await clickWithHighlight(page, '#logBtn');
  await page.waitForTimeout(1800);

  const chatInput = page.locator('#txt');
  await chatInput.fill('ما هو تقييمك لمخاطر مشروع منظومة الذكاء الاصطناعي المعروض أمامنا الآن؟');
  await page.waitForTimeout(600);
  await page.locator('#f').press('Enter');
  await page.waitForTimeout(5000);

  // Scroll inside log to demonstrate rendered cards
  await page.evaluate(() => {
    const log = document.getElementById('log');
    if (log) log.scrollTop = log.scrollHeight;
  });
  await page.waitForTimeout(2500);

  // =========================================================================
  // ACT 7: Executive Boardroom Report (تقرير المجلس)
  // =========================================================================
  await showPresenterBanner(
    page,
    7,
    'تقرير المجلس التنفيذي والتصدير الفوري (PDF & WhatsApp)',
    'توليد تقرير شامل للمجلس بضغطة زر وتصدير مذكرة PDF رسمية وملخص WhatsApp للتداول القيادي الفوري',
    3500
  );

  await clickWithHighlight(page, 'button:has-text("تقرير المجلس")');
  await page.waitForTimeout(2500);

  // Show WhatsApp Memo copy action
  const copyWaBtn = page.locator('button:has-text("نسخ لـ WhatsApp"), button:has-text("نسخ ملخص WhatsApp")').first();
  if (await copyWaBtn.isVisible()) {
    await copyWaBtn.click();
    await page.waitForTimeout(1500);
  }

  // Close report modal
  const closeModalBtn = page.locator('#closeModalBtn');
  if (await closeModalBtn.isVisible()) {
    await closeModalBtn.click();
    await page.waitForTimeout(1200);
  }

  // =========================================================================
  // ACT 8: Grand Finale & Unified Capabilities Recap
  // =========================================================================
  await clickWithHighlight(page, '#fdHide').catch(() => {});
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await page.waitForTimeout(1000);

  await showPresenterBanner(
    page,
    8,
    'جاهزية استراتيجية وتقنية متكاملة للقيادة العليا',
    'بيئة تشغيل تنفيذية تجمع بين دقة البيانات، رصد المخاطر، المحاكاة الاستباقية، وذكاء المحاورة',
    4000
  );

  await page.waitForTimeout(2500);

  // Finalize video recording
  await context.close();
  await browser.close();

  // Find generated video in temp folder
  const videoFiles = fs.readdirSync(TEMP_VIDEO_DIR).filter(f => f.endsWith('.webm'));
  if (!videoFiles.length) {
    throw new Error('No recorded video found in ' + TEMP_VIDEO_DIR);
  }

  const latestWebm = path.join(TEMP_VIDEO_DIR, videoFiles[videoFiles.length - 1]);
  const outWebmProject = path.join(PROJECT_ROOT, 'demo_executive_showcase.webm');
  const outWebmArtifact = path.join(ARTIFACTS_DIR, 'demo_executive_showcase.webm');
  const outMp4Project = path.join(PROJECT_ROOT, 'demo_executive_showcase.mp4');
  const outMp4Artifact = path.join(ARTIFACTS_DIR, 'demo_executive_showcase.mp4');

  // Copy raw WebM to output paths
  fs.copyFileSync(latestWebm, outWebmProject);
  fs.copyFileSync(latestWebm, outWebmArtifact);
  console.log(`✅ WebM recorded successfully: ${fs.statSync(outWebmProject).size} bytes`);

  // Convert WebM to MP4 using ffmpeg
  console.log('🔄 Converting WebM to high-compatibility MP4 using FFmpeg...');
  try {
    await execFileAsync(FFMPEG_PATH, [
      '-y',
      '-i', latestWebm,
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-preset', 'fast',
      '-crf', '22',
      outMp4Project
    ]);
    fs.copyFileSync(outMp4Project, outMp4Artifact);
    console.log(`✅ MP4 converted successfully: ${fs.statSync(outMp4Project).size} bytes`);
  } catch (ffmpegErr) {
    console.warn('⚠️ FFmpeg conversion notice:', ffmpegErr.message);
  }

  console.log('\n🎉 ALL DEMO VIDEO ARTIFACTS CREATED SUCCESSFULLY!');
  console.log(`Project Video: ${outMp4Project}`);
  console.log(`Artifact Video: ${outMp4Artifact}`);
}

runDemoRecording().catch(err => {
  console.error('❌ Demo recording failed:', err);
  process.exit(1);
});
