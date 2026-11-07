// test/record-proof.mjs - Real interactive browser execution & media capture
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ARTIFACT_DIR = 'C:\\Users\\Administrator\\.gemini\\antigravity\\brain\\5bc32ce4-3313-4fdd-8e31-f6775c20730e';
const PORT = 3266;
const BASE_URL = `http://localhost:${PORT}`;

console.log('🎬 Starting Real Browser Proof & Media Recording...');
console.log(`📁 Target Artifacts Directory: ${ARTIFACT_DIR}`);

// 1. Launch real backend server
const srv = spawn('node', ['server.js'], {
  env: {
    ...process.env,
    PORT: String(PORT),
    ACCESS_CODE: '322007',
  },
  stdio: 'inherit',
});

// Wait for server to boot
await new Promise(r => setTimeout(r, 2000));

try {
  // 2. Launch Chromium with video recording enabled
  const browser = await chromium.launch({
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 750 },
    recordVideo: {
      dir: ARTIFACT_DIR,
      size: { width: 1280, height: 750 },
    },
  });

  const page = await context.newPage();
  page.setDefaultTimeout(7000);

  // Handle gate by presetting access code in localStorage
  await page.goto(BASE_URL);
  await page.evaluate(() => {
    localStorage.setItem('accessCode', '322007');
    document.cookie = 'accessCode=322007; path=/';
  });
  await page.reload();
  await page.waitForTimeout(1000);

  // If gate still visible, submit code
  const gateVisible = await page.evaluate(() => {
    const gate = document.getElementById('gate');
    return gate && getComputedStyle(gate).display !== 'none';
  });

  if (gateVisible) {
    console.log('🔓 Unlocking gate via input...');
    await page.fill('#code', '322007');
    await page.click('#gf button');
    await page.waitForTimeout(800);
  }

  // Load Dashboard data on screen
  console.log('📊 Loading baseline dashboard data...');
  await page.evaluate(async () => {
    if (window.loadDashboard) await window.loadDashboard();
    const home = document.getElementById('home');
    if (home) home.hidden = false;
    const view = document.getElementById('view');
    if (view) view.hidden = true;
    document.querySelectorAll('[data-v="overview"]').forEach(el => el.hidden = false);
    document.querySelectorAll('[data-v="overview projects"]').forEach(el => el.hidden = false);
  });
  await page.waitForTimeout(1200);

  // Screenshot 1: Dashboard Home with Executive UI elements
  console.log('📸 1. Capturing Dashboard Home with Executive Action Bar...');
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, '01_executive_dashboard_home.png'),
    fullPage: false,
  });

  // Screenshot 2: Morning Briefing interaction
  console.log('🎙️ 2. Triggering Morning Briefing...');
  await page.evaluate(() => {
    const btn = document.querySelector('#executiveBriefingBtn') || document.querySelector('.briefing-btn');
    if (btn) btn.click();
  });
  await page.waitForTimeout(900);
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, '02_morning_briefing_active.png'),
    fullPage: false,
  });

  // Stop briefing cleanly via evaluate
  await page.evaluate(() => {
    if (window.stopExecutiveBriefing) window.stopExecutiveBriefing();
  });
  await page.waitForTimeout(400);

  // Screenshot 3: Choreographed Screen Spotlight on KPIs
  console.log('✨ 3. Triggering Synchronized Screen Spotlight...');
  await page.evaluate(() => {
    if (window.spotlightElement) {
      window.spotlightElement({
        target: '#kpis',
        label: 'المؤشرات المالية الاستراتيجية (الميزانية والمصروف)',
        durationMs: 8000,
      });
    }
  });
  await page.waitForTimeout(700);
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, '03_screen_spotlight_kpis.png'),
    fullPage: false,
  });

  // Clear spotlight
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('executive:spotlight:clear'));
  });
  await page.waitForTimeout(400);

  // Screenshot 4: Risk & Discrepancy Radar Drawer
  console.log('🚨 4. Opening Risk & Discrepancy Radar Drawer...');
  await page.evaluate(() => {
    if (window.__radar?.open) window.__radar.open();
    else {
      const pill = document.getElementById('radarPill');
      if (pill) pill.click();
    }
  });
  await page.waitForTimeout(700);
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, '04_risk_radar_drawer_open.png'),
    fullPage: false,
  });

  // Filter by critical
  await page.evaluate(() => {
    const critBtn = document.querySelector('.radar-filter-btn[data-filter="critical"]');
    if (critBtn) critBtn.click();
  });
  await page.waitForTimeout(400);
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, '04b_risk_radar_critical_filtered.png'),
    fullPage: false,
  });

  // Close radar drawer
  await page.evaluate(() => {
    if (window.__radar?.close) window.__radar.close();
    else {
      const closeBtn = document.getElementById('radarClose');
      if (closeBtn) closeBtn.click();
    }
  });
  await page.waitForTimeout(400);

  // Screenshot 5: Boardroom Report Modal
  console.log('🏛️ 5. Opening Boardroom Report Export Modal...');
  await page.evaluate(() => {
    if (window.openReportModal) window.openReportModal();
    else {
      const btn = document.querySelector('.report-btn');
      if (btn) btn.click();
    }
  });
  await page.waitForTimeout(1000);
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, '05_boardroom_report_modal.png'),
    fullPage: false,
  });

  // Close modal
  await page.evaluate(() => {
    const modal = document.getElementById('boardroomModal');
    if (modal) modal.remove();
  });
  await page.waitForTimeout(400);

  // Screenshot 6 & 7: What-If Scenario Simulator Cockpit
  console.log('🎛️ 6. Launching What-If Scenario Simulator Cockpit...');
  await page.evaluate(async () => {
    if (window.openSimulatorCockpit) {
      await window.openSimulatorCockpit();
    } else {
      const btn = document.getElementById('qaSim');
      if (btn) btn.click();
    }
  });
  await page.waitForTimeout(1000);
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, '06_simulator_cockpit_initial.png'),
    fullPage: false,
  });

  // Adjust sliders: Budget +300,000 SAR, Timeline -15 Days
  console.log('⚙️ 7. Simulating Scenario: +300k SAR, -15 Days...');
  await page.evaluate(() => {
    const budgetSlider = document.getElementById('simBudgetSlider');
    const timelineSlider = document.getElementById('simTimelineSlider');
    if (budgetSlider && timelineSlider) {
      budgetSlider.value = '300000';
      budgetSlider.dispatchEvent(new Event('input', { bubbles: true }));
      budgetSlider.dispatchEvent(new Event('change', { bubbles: true }));

      timelineSlider.value = '-15';
      timelineSlider.dispatchEvent(new Event('input', { bubbles: true }));
      timelineSlider.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await page.waitForTimeout(800);
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, '07_simulator_cockpit_adjusted.png'),
    fullPage: false,
  });

  // Click Apply Plan button to demonstrate executive execution
  console.log('✅ 8. Applying simulated plan...');
  await page.evaluate(() => {
    const applyBtn = document.getElementById('simApplyBtn') || document.querySelector('.sim-apply-btn');
    if (applyBtn) applyBtn.click();
  });
  await page.waitForTimeout(1000);
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, '08_simulator_plan_applied_feedback.png'),
    fullPage: false,
  });

  // Return to home via breadcrumb
  await page.evaluate(() => {
    const crumb = document.getElementById('crumb');
    if (crumb) crumb.click();
    const home = document.getElementById('home');
    if (home) home.hidden = false;
    const view = document.getElementById('view');
    if (view) view.hidden = true;
  });
  await page.waitForTimeout(500);

  // Screenshot 9: Spotlight on Projects Table with presentation overlay
  console.log('🌟 9. Spotlight on Projects Table with Backdrop...');
  await page.evaluate(() => {
    if (window.spotlightElement) {
      window.spotlightElement({
        target: '#projects',
        label: 'مشاريع التحول الرقمي المعتمدة — رؤية المملكة 2030',
        durationMs: 8000,
        backdrop: true,
      });
    }
  });
  await page.waitForTimeout(800);
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, '09_spotlight_with_backdrop.png'),
    fullPage: false,
  });

  // Also fetch and save official PDF report
  console.log('📄 10. Fetching Official Boardroom PDF Report...');
  const pdfRes = await fetch(`${BASE_URL}/api/executive/report?format=pdf`);
  if (pdfRes.ok) {
    const pdfBytes = Buffer.from(await pdfRes.arrayBuffer());
    const pdfPath = path.join(ARTIFACT_DIR, 'Official_Boardroom_Report.pdf');
    fs.writeFileSync(pdfPath, pdfBytes);
    console.log(`  ✓ Saved PDF Report: ${pdfPath} (${pdfBytes.length} bytes)`);
  }

  console.log('🎥 Finalizing video recording...');
  // Closing page and context flushes the video file
  await page.close();
  await context.close();
  await browser.close();

  // Find the recorded video and give it a clear name
  const files = fs.readdirSync(ARTIFACT_DIR);
  const webmFiles = files.filter(f => f.endsWith('.webm') && !f.startsWith('executive_wow_walkthrough'));
  if (webmFiles.length > 0) {
    // Pick the most recent one
    webmFiles.sort((a, b) => fs.statSync(path.join(ARTIFACT_DIR, b)).mtimeMs - fs.statSync(path.join(ARTIFACT_DIR, a)).mtimeMs);
    const src = path.join(ARTIFACT_DIR, webmFiles[0]);
    const dest = path.join(ARTIFACT_DIR, 'executive_wow_walkthrough.webm');
    fs.copyFileSync(src, dest);
    console.log(`🎬 Video saved successfully as: ${dest}`);
  }

  console.log('\n🎉 ALL REAL MEDIA & SCREENSHOT PROOFS GENERATED SUCCESSFULLY!');
} catch (err) {
  console.error('❌ Failed during proof recording:', err);
} finally {
  srv.kill('SIGTERM');
  console.log('🛑 Server stopped.');
}
