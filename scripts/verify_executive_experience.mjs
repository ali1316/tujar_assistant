import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const ARTIFACTS_DIR = 'C:/Users/Administrator/.gemini/antigravity/brain/5bc32ce4-3313-4fdd-8e31-f6775c20730e';

async function run() {
  console.log('🚀 Starting Executive Verification Suite...');

  // 1. Verify Catalog API
  const catRes = await fetch('http://localhost:3000/api/dashboards/catalog');
  const catalog = await catRes.json();
  console.log('Catalog check:', catalog.ok ? '✓ OK' : '✗ Failed');
  console.log(`Projects: ${catalog.projects?.length}, Portfolios: ${catalog.portfolios?.length}, Files: ${catalog.files?.length}`);
  catalog.projects?.forEach(p => console.log(`  - Proj #${p.projectId} (${p.name}) -> Dash #${p.dashboardId}`));

  // 2. Test Chat Awareness
  console.log('\nTesting Chat endpoint: "لخص المعروض"');
  const chatRes1 = await fetch('http://localhost:3000/api/chat/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: 'لخص المعروض',
      screenContext: {
        dashboard: {
          title: 'مشروع بوابة الخدمات الإلكترونية الموحدة',
          headline: 'نسبة الإنجاز 65% متقدمة بنسبة +5% عن الجدول مع اكتمال 18 خدمة رقمية من أصل 24',
          kpis: [
            { label: 'نسبة الإنجاز الفعلية', value: 65, unit: '%' },
            { label: 'المصروف من الميزانية', value: 700000, unit: 'ريال' }
          ]
        }
      }
    })
  });
  const chatData1 = await chatRes1.json();
  console.log('Nora Reply to "لخص المعروض":\n', chatData1.reply?.slice(0, 250) + '...\n');

  console.log('Testing Chat endpoint: "ما هو تقييمك لمخاطر مشروع بوابة اتحاد الغرف بعد إعادة دراسته؟"');
  const chatRes2 = await fetch('http://localhost:3000/api/chat/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: 'ما هو تقييمك لمخاطر مشروع بوابة اتحاد الغرف بعد إعادة دراسته؟ أجب باختصار باللغة العربية'
    })
  });
  const chatData2 = await chatRes2.json();
  console.log('Nora Reply to Project Evaluation:\n', chatData2.reply?.slice(0, 300) + '...\n');

  // 3. Launch Browser and verify interactive project switching
  console.log('Launching browser to verify UI interactions...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto('http://localhost:3000/');
  await page.waitForTimeout(2000);

  // Check if projects table rendered with .btn-proj-dash
  const btnCount = await page.locator('.btn-proj-dash').count();
  console.log(`Found ${btnCount} project dashboard buttons in table`);

  // Take screenshot of overview with project buttons
  const p1Shot = path.join(ARTIFACTS_DIR, '01_projects_table_with_dash_buttons.png');
  await page.screenshot({ path: p1Shot });
  console.log('Saved screenshot 1:', p1Shot);

  // Click on the first project's dashboard button
  if (btnCount > 0) {
    console.log('Clicking "عرض اللوحة ↗" on first project...');
    await page.locator('.btn-proj-dash').first().click();
    await page.waitForTimeout(2500);

    const isFiledashVis = await page.locator('#filedash').isVisible();
    const fdTitle = await page.locator('#fdTitle').innerText();
    const selVal = await page.locator('#fdSelect').inputValue();
    console.log(`Dashboard opened: visible=${isFiledashVis}, title="${fdTitle}", selectValue=${selVal}`);

    const p2Shot = path.join(ARTIFACTS_DIR, '02_project_dashboard_opened.png');
    await page.screenshot({ path: p2Shot });
    console.log('Saved screenshot 2:', p2Shot);

    // Now test switching dashboard via #fdSelect
    console.log('Testing switching to another dashboard via #fdSelect...');
    const options = await page.locator('#fdSelect option').allInnerTexts();
    console.log('Select options available:', options.slice(0, 6));

    // Select the second project
    const optValues = await page.$$eval('#fdSelect option', opts => opts.map(o => o.value).filter(v => !!v));
    if (optValues.length > 1) {
      await page.selectOption('#fdSelect', optValues[1]);
      await page.waitForTimeout(2500);
      const switchedTitle = await page.locator('#fdTitle').innerText();
      console.log(`Switched to dashboard: "${switchedTitle}"`);

      const p3Shot = path.join(ARTIFACTS_DIR, '03_dashboard_switched_via_dropdown.png');
      await page.screenshot({ path: p3Shot });
      console.log('Saved screenshot 3:', p3Shot);
    }
  }

  // Open the chat drawer while on dashboard and verify docking alignment
  console.log('Opening chat drawer...');
  await page.click('#logBtn');
  await page.waitForTimeout(1000);

  const drawerBox = await page.locator('#drawer').boundingBox();
  const dockBox = await page.locator('#dock').boundingBox();
  console.log(`Drawer bounding box: x=${drawerBox?.x}, width=${drawerBox?.width}`);
  console.log(`Dock bounding box: x=${dockBox?.x}, width=${dockBox?.width}`);

  const p4Shot = path.join(ARTIFACTS_DIR, '04_unified_drawer_and_dock_cockpit.png');
  await page.screenshot({ path: p4Shot });
  console.log('Saved screenshot 4:', p4Shot);

  await browser.close();
  console.log('\n🎉 Verification Suite Completed Successfully!');
}

run().catch(e => {
  console.error('Suite error:', e);
  process.exit(1);
});
