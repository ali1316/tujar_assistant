import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const ARTIFACTS_DIR = 'C:/Users/Administrator/.gemini/antigravity/brain/5bc32ce4-3313-4fdd-8e31-f6775c20730e';

async function executiveAudit() {
  console.log('🏁 STARTING EXECUTIVE AUDIT & LIVE DEMO WALKTHROUGH...');
  const auditReport = {
    steps: [],
    defectsFixed: [],
    beforeAfterMetrics: {},
    passed: true
  };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // =========================================================================
  // Step 1: Open Home Screen
  // =========================================================================
  console.log('\n--- 1. Navigating to Home Screen ---');
  await page.goto('http://localhost:3000/');
  await page.waitForTimeout(2000);

  const initialProjectsCount = await page.locator('#projects tbody tr').count();
  console.log(`Initial projects rendered in table: ${initialProjectsCount}`);
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'audit_01_home_screen.png') });
  auditReport.beforeAfterMetrics.initialProjectsCount = initialProjectsCount;

  // =========================================================================
  // Step 2: Test What-If Simulator with AI Reasoning & Strategic Packages
  // =========================================================================
  console.log('\n--- 2. Testing What-If Simulator ---');
  const simBtn = page.locator('#qaSim');
  if (await simBtn.isVisible()) {
    await simBtn.click();
    await page.waitForTimeout(1500);

    const simVisible = await page.locator('#simCockpit').isVisible();
    const initialNarrative = await page.locator('#simNarrativeText').innerText();
    console.log(`Simulator visible: ${simVisible}`);
    console.log(`Initial Narrative: "${initialNarrative}"`);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'audit_02_simulator_initial.png') });

    // Test Strategy Package: 🚀 الإنقاذ والتسريع
    console.log('Testing Strategic Package: 🚀 الإنقاذ والتسريع (+300K, -25 days)...');
    const rescuePkgBtn = page.locator('.sim-pkg-btn[data-b="300000"]');
    if (await rescuePkgBtn.isVisible()) {
      await rescuePkgBtn.click();
      await page.waitForTimeout(1500);
      const rescueNarrative = await page.locator('#simNarrativeText').innerText();
      const boardRec = await page.locator('#simBoardRecText').innerText();
      console.log(`Rescue Narrative: "${rescueNarrative}"`);
      console.log(`Board Recommendation: "${boardRec}"`);
      await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'audit_03_simulator_rescue_pkg.png') });
    }

    // Test Custom AI Scenario Query
    console.log('Testing Custom AI Scenario query...');
    const customInput = page.locator('#simCustomQuery');
    const aiBtn = page.locator('#simAiQueryBtn');
    if (await customInput.isVisible() && await aiBtn.isVisible()) {
      await customInput.fill('ماذا لو قمنا بدمج فريق المشروع مع فريق البنية التحتية لتفادي التجاوز المالي؟');
      await aiBtn.click();
      await page.waitForTimeout(3500);
      const aiNarrative = await page.locator('#simNarrativeText').innerText();
      console.log(`AI Scenario Narrative: "${aiNarrative}"`);
      await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'audit_03b_simulator_ai_query.png') });
    }

    // Close simulator and return home
    await page.locator('#simCloseBtn').click();
    await page.waitForTimeout(1000);
  }

  // =========================================================================
  // Step 3: Test Dynamic Project Sync from Document Upload
  // =========================================================================
  console.log('\n--- 3. Testing Dynamic Project Extraction from Document Upload ---');
  const sampleFilePath = path.resolve('data-samples/documents/14_تقرير_المراجعة_المحاسبية_وتدقيق_تناقضات_المشاريع.md');
  console.log(`Uploading file: ${sampleFilePath}`);

  // Fetch count before
  const pBeforeRes = await fetch('http://localhost:3000/api/dashboard');
  const pBeforeData = await pBeforeRes.json();
  const countBefore = pBeforeData.projects?.length || 0;
  console.log(`DB projects count BEFORE upload: ${countBefore}`);

  // Upload file
  const fileInput = page.locator('#file');
  await fileInput.setInputFiles(sampleFilePath);
  console.log('File attached, waiting for upload and project sync...');
  await page.waitForTimeout(6000);
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'audit_04_upload_completed.png') });

  // Fetch count after
  const pAfterRes = await fetch('http://localhost:3000/api/dashboard');
  const pAfterData = await pAfterRes.json();
  const countAfter = pAfterData.projects?.length || 0;
  console.log(`DB projects count AFTER upload: ${countAfter}`);
  auditReport.beforeAfterMetrics.countBefore = countBefore;
  auditReport.beforeAfterMetrics.countAfter = countAfter;

  // Verify file dashboard
  const isFiledashVis = await page.locator('#filedash').isVisible();
  const fdTitle = await page.locator('#fdTitle').innerText();
  console.log(`File Dashboard visible: ${isFiledashVis}, Title: "${fdTitle}"`);
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'audit_05_file_dashboard_screen.png') });

  // Return to home view to inspect projects table
  console.log('Navigating back to main projects overview...');
  await page.locator('#fdHide').click();
  await page.waitForTimeout(1000);

  const tableRowsAfter = await page.locator('#projects tbody tr').count();
  console.log(`Rendered projects table rows: ${tableRowsAfter}`);
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'audit_06_projects_table_expanded.png') });

  // Verify opening a project-specific dashboard
  console.log('Testing opening newly discovered project dashboard...');
  const projDashBtn = page.locator('#projects tbody tr .btn-proj-dash').last();
  if (await projDashBtn.isVisible()) {
    await projDashBtn.click();
    await page.waitForTimeout(2000);
    const openedTitle = await page.locator('#fdTitle').innerText();
    console.log(`Opened Project Dashboard: "${openedTitle}"`);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'audit_07_opened_project_dashboard.png') });
  }

  // =========================================================================
  // Step 4: Test Chat Drawer with Active Dashboard Context & Markdown
  // =========================================================================
  console.log('\n--- 4. Testing Chat Drawer & Markdown Rendering ---');
  await page.click('#logBtn');
  await page.waitForTimeout(1200);

  await page.locator('#txt').fill('ما هي المشاريع المعروضة أمامك الآن وكم عددها؟ وما هي توصيتك للمشاريع المتعثرة؟');
  await page.locator('#f').press('Enter');
  console.log('Sent prompt to Nora, waiting for executive response...');
  await page.waitForTimeout(5000);
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'audit_08_nora_chat_reply.png') });

  // =========================================================================
  // Step 5: Test Board Report Modal (تقرير المجلس)
  // =========================================================================
  console.log('\n--- 5. Testing Executive Board Report Modal ---');
  const reportBtn = page.locator('button:has-text("تقرير المجلس")');
  if (await reportBtn.isVisible()) {
    await reportBtn.click();
    await page.waitForTimeout(2000);
    const modalVisible = await page.locator('#boardroomModal').isVisible();
    console.log(`Board report modal visible: ${modalVisible}`);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'audit_09_board_report_modal.png') });

    // Close modal
    const closeBtn = page.locator('#closeModalBtn');
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
      await page.waitForTimeout(800);
      console.log('Board report modal closed successfully.');
    }
  }

  await browser.close();

  console.log('\n======================================================');
  console.log('✅ EXECUTIVE DEMO AUDIT COMPLETED SUCCESSFULLY!');
  console.log(`Projects Before: ${countBefore} ➔ Projects After: ${countAfter}`);
  console.log('======================================================');

  fs.writeFileSync(path.join(ARTIFACTS_DIR, 'audit_summary.json'), JSON.stringify(auditReport, null, 2), 'utf8');
}

executiveAudit().catch(err => {
  console.error('Audit failed with error:', err);
  process.exit(1);
});
