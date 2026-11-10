// scripts/record_original_branch_demo.mjs
// Automated 1080p Walkthrough Video Generator for the ORIGINAL Branch (main) on port 3005

import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const ARTIFACTS_DIR = 'C:/Users/Administrator/.gemini/antigravity/brain/5bc32ce4-3313-4fdd-8e31-f6775c20730e';
const PROJECT_ROOT = 'E:/gemini-live-dashboard';
const FFMPEG_PATH = 'C:/Users/Administrator/AppData/Local/Cypress/Cache/13.8.1/Cypress/resources/app/node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe';
const TEMP_VIDEO_DIR = path.resolve('temp_videos_original');

if (!fs.existsSync(TEMP_VIDEO_DIR)) {
  fs.mkdirSync(TEMP_VIDEO_DIR, { recursive: true });
}

// Presenter HUD Helper for Original Branch Walkthrough
async function showPresenterBanner(page, actNumber, title, subtitle, durationMs = 3200) {
  console.log(`🎬 [ACT ${actNumber}] ${title}: ${subtitle}`);
  await page.evaluate(({ actNumber, title, subtitle }) => {
    let el = document.getElementById('originalDemoPresenter');
    if (!el) {
      el = document.createElement('div');
      el.id = 'originalDemoPresenter';
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
        max-width: 880px;
        width: 90vw;
      `;
      document.body.appendChild(el);
    }
    el.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 4px;">
        <span style="background: rgba(209, 166, 92, 0.2); color: #d1a65c; font-size: 11.5px; font-weight: 700; padding: 2px 10px; border-radius: 20px; border: 1px solid #d1a65c;">الفرع الأصلي (main) · المشهد ${actNumber}</span>
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
        z-index: 99999999;
        animation: clickPulse 0.6s ease-out forwards;
      `;
      const style = document.createElement('style');
      style.textContent = `
        @keyframes clickPulse {
          0% { transform: scale(0.3); opacity: 1; }
          100% { transform: scale(1.6); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
      document.body.appendChild(ring);
      setTimeout(() => ring.remove(), 700);
    }, box);
  }
  await page.waitForTimeout(300);
  await locator.click().catch(() => {});
  await page.waitForTimeout(400);
}

async function recordOriginalDemo() {
  console.log('🚀 Starting Original Branch 1080p Demo Recording on port 3005...');

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-web-security',
      '--no-sandbox',
      '--disable-features=IsolateOrigins,site-per-process',
      '--window-size=1920,1080',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    locale: 'ar-SA',
    recordVideo: {
      dir: TEMP_VIDEO_DIR,
      size: { width: 1920, height: 1080 },
    },
  });

  const page = await context.newPage();

  try {
    // ==========================================
    // ACT 1: الهوية الأساسية والشاشة الترحيبية
    // ==========================================
    await page.goto('http://localhost:3005', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);

    await showPresenterBanner(
      page,
      1,
      'الهوية البصرية الأساسية والشاشة الترحيبية',
      'منصة تجار · لوحة المشاريع الأصلية مع تحية «هلا فواز، وش ننجز اليوم؟» وشريط المحادثة المدمج',
      4000
    );

    // استعراض رأس الصفحة والشعار
    await page.evaluate(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    await page.waitForTimeout(1500);

    // ==========================================
    // ACT 2: محفظة المشاريع ومؤشرات الأداء الأساسية
    // ==========================================
    await showPresenterBanner(
      page,
      2,
      'استعراض محفظة المشاريع ومؤشرات الأداء (KPIs)',
      'الضغط على اختصار «اعرض المشاريع» لعرض مؤشرات الميزانية الـ 4، والمشاريع الخمسة، وجدول التذاكر',
      4200
    );

    // الضغط على زر اعرض المشاريع
    await clickWithHighlight(page, '.qa-btn[data-say="اعرضي لي المشاريع"]');
    await page.waitForTimeout(1500);

    // التمرير لاستعراض المؤشرات الـ 4
    await page.evaluate(() => {
      const kpis = document.getElementById('kpis');
      if (kpis) kpis.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    await page.waitForTimeout(2000);

    // التمرير لجدول المشاريع الـ 5
    await page.evaluate(() => {
      const pr = document.getElementById('projects');
      if (pr) pr.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    await page.waitForTimeout(3000);

    // التمرير لجدول التذاكر
    await page.evaluate(() => {
      const tk = document.getElementById('tickets');
      if (tk) tk.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    await page.waitForTimeout(2500);

    // ==========================================
    // ACT 3: تعدد المساعدين والأصوات (نورة، فواز، جداوي)
    // ==========================================
    await showPresenterBanner(
      page,
      3,
      'تعدد المساعدين: نورة، فواز، وجداوي',
      'دعم 3 شخصيات صوتية مع خيارات تبديل المحرك من شريط التحكم السفلي وخاصية تجربة الصوت',
      4200
    );

    // التركيز على شريط اختيار المساعد
    await page.evaluate(() => {
      const dock = document.getElementById('dock');
      if (dock) dock.scrollIntoView({ behavior: 'smooth' });
    });
    await page.waitForTimeout(1000);

    // التبديل إلى مساعد فواز
    await page.selectOption('#engine', 'eleven');
    await page.waitForTimeout(1800);

    // التبديل إلى مساعد جداوي
    await page.selectOption('#engine', 'jeddawi');
    await page.waitForTimeout(1800);

    // العودة إلى نورة
    await page.selectOption('#engine', 'gemini');
    await page.waitForTimeout(1500);

    // ==========================================
    // ACT 4: سجل المحادثة الأصلي وقائمة الأصوات
    // ==========================================
    await showPresenterBanner(
      page,
      4,
      'سجل المحادثة الأصلي واختيار النماذج الصوتية',
      'فتح سجل المحادثة (السجل) واستعراض قائمة الأصوات النسائية المتاحة وتجربة نطق العينة',
      4200
    );

    // فتح السجل
    await clickWithHighlight(page, '#logBtn');
    await page.waitForTimeout(1500);

    // استعراض محتويات السجل
    await page.evaluate(() => {
      const log = document.getElementById('log');
      if (log) log.scrollTop = log.scrollHeight;
    });
    await page.waitForTimeout(2000);

    // الضغط على زر تجربة الصوت "اسمعها"
    await clickWithHighlight(page, '#preview');
    await page.waitForTimeout(2000);

    // إغلاق السجل
    await clickWithHighlight(page, '#drClose');
    await page.waitForTimeout(1500);

    // ==========================================
    // ACT 5: لوحة الملف والداشبورد المستقل
    // ==========================================
    await showPresenterBanner(
      page,
      5,
      'لوحة الملف التحليلية (File Dashboard)',
      'عرض لوحة الملف المستقلة للتقارير المرفوعة مع مؤشرات الأداء والرسوم البيانية التفاعلية',
      4200
    );

    // فتح لوحة ملف في الإطار
    await page.evaluate(() => {
      const fd = document.getElementById('filedash');
      const frame = document.getElementById('fdFrame');
      const fdt = document.getElementById('fdTitle');
      const fds = document.getElementById('fdSub');
      if (fd && frame) {
        fd.hidden = false;
        frame.hidden = false;
        frame.src = '/d/2?embed=1';
        if (fdt) fdt.textContent = 'لوحة الملف · تقرير الأداء السنوي 2026';
        if (fds) fds.textContent = 'نظرة شاملة على العمليات والمبادرات لاتحاد الغرف';
        fd.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
    await page.waitForTimeout(3500);

    // ==========================================
    // ACT 6: ذاكرة نورة وتفضيلات المستخدم
    // ==========================================
    await showPresenterBanner(
      page,
      6,
      'ذاكرة نورة وتخزين التفضيلات الدائمة',
      'حفظ التعليمات والتفضيلات المستمرة لفواز لضمان استمرارية السياق التنفيذي عبر الجلسات',
      3800
    );

    // إظهار قسم ذاكرة نورة
    await page.evaluate(() => {
      const memSec = document.querySelector('[data-v="memory"]');
      if (memSec) {
        memSec.hidden = false;
        memSec.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
    await page.waitForTimeout(3000);

    // ==========================================
    // ACT 7: كتابة استفسار في شريط المحادثة
    // ==========================================
    await showPresenterBanner(
      page,
      7,
      'شريط التفاعل الصوتي والكتابي الذكي',
      'كتابة استفسار تنفيذي لنورة عن المشاريع ومتابعة مؤشرات الإنجاز',
      3800
    );

    const txtInput = page.locator('#txt');
    await txtInput.click();
    await txtInput.fill('ما هو تقييمك لمشروع أتمتة رخص البناء والجدول الزمني؟');
    await page.waitForTimeout(2000);

    // ==========================================
    // ACT 8: الخاتمة وخلاصة الفرع الأصلي
    // ==========================================
    await showPresenterBanner(
      page,
      8,
      'خلاصة إمكانيات الفرع الأصلي (Baseline Overview)',
      'المنصة الأساسية: محادثة صوتية تفاعلية، 5 مشاريع استراتيجية، وداشبوردات تحليلية',
      4500
    );

    // العودة بلطف إلى أعلى الصفحة
    await page.evaluate(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    await page.waitForTimeout(2500);

    console.log('✅ All walkthrough acts recorded successfully.');
  } catch (err) {
    console.error('❌ Error during demo recording:', err);
  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }

  // Find generated video file in temp_videos_original
  const files = fs.readdirSync(TEMP_VIDEO_DIR).filter(f => f.endsWith('.webm'));
  if (!files.length) {
    throw new Error('No webm video recorded in ' + TEMP_VIDEO_DIR);
  }

  // Get newest video file
  files.sort((a, b) => {
    return fs.statSync(path.join(TEMP_VIDEO_DIR, b)).mtimeMs - fs.statSync(path.join(TEMP_VIDEO_DIR, a)).mtimeMs;
  });
  const sourceWebm = path.join(TEMP_VIDEO_DIR, files[0]);
  console.log(`📹 Recorded source WebM: ${sourceWebm} (${(fs.statSync(sourceWebm).size / 1024 / 1024).toFixed(2)} MB)`);

  const outputWebmBrain = path.join(ARTIFACTS_DIR, 'demo_original_branch_showcase.webm');
  fs.copyFileSync(sourceWebm, outputWebmBrain);

  const outputMp4Root = path.join(PROJECT_ROOT, 'demo_original_branch_showcase.mp4');
  const outputMp4Brain = path.join(ARTIFACTS_DIR, 'demo_original_branch_showcase.mp4');

  console.log('🔄 Converting to optimized H.264 MP4 via FFmpeg...');
  const ffmpegArgs = [
    '-y',
    '-i', sourceWebm,
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '22',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    outputMp4Root,
  ];

  await execFileAsync(FFMPEG_PATH, ffmpegArgs);
  console.log(`✅ Converted MP4 saved to root: ${outputMp4Root} (${(fs.statSync(outputMp4Root).size / 1024 / 1024).toFixed(2)} MB)`);

  fs.copyFileSync(outputMp4Root, outputMp4Brain);
  console.log(`✅ Converted MP4 copied to brain artifacts: ${outputMp4Brain}`);

  console.log('🎉 Original branch walkthrough video generation COMPLETE!');
}

recordOriginalDemo().catch(err => {
  console.error('Fatal recording error:', err);
  process.exit(1);
});
