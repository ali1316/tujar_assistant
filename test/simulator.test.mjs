// test/simulator.test.mjs - Unit & integration tests for What-If Scenario Simulator
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { simulateScenario, simulate_scenario } from '../src/executive/simulator.js';
import { app } from '../server.js';
import { db } from '../db.js';

// ============================================================================
// 1. Projection Calculations & Mathematical Model
// ============================================================================
test.beforeEach(async () => {
  await db.run('UPDATE projects SET budget = ?, due_date = ?, status = ? WHERE id = ?', [1200000, '2026-12-31', 'قيد التنفيذ', 1]);
});

test('simulateScenario correctly models capital injection (budgetDelta > 0)', async () => {
  const result = await simulateScenario({ projectId: 1, budgetDelta: 300000 });

  assert.equal(result.ok, true);
  assert.equal(result.baseline.projectId, 1);
  assert.equal(result.baseline.budget, 1200000);
  assert.equal(result.simulated.budget, 1500000);
  assert.equal(result.simulated.budgetDelta, 300000);

  // Capital injection accelerates timeline (positive daysSavedOrDelayed)
  assert.ok(result.simulated.completionDateDeltaDays > 0, 'Injection must accelerate project completion');
  assert.ok(result.simulated.remainingDays < result.baseline.remainingDays, 'Remaining days must decrease');

  // Daily burn rate must increase with accelerated delivery & higher budget
  assert.ok(result.simulated.dailyBurnRate > result.baseline.dailyBurnRate, 'Daily burn rate must increase');
  assert.ok(result.simulated.burnRateDeltaPercent > 0, 'Burn rate delta percentage must be positive');

  // Projected completion date formatted as ISO YYYY-MM-DD
  assert.match(result.simulated.projectedCompletionDate, /^\d{4}-\d{2}-\d{2}$/);
});

test('simulateScenario correctly models budget cut (budgetDelta < 0)', async () => {
  const result = await simulateScenario({ projectId: 1, budgetDelta: -200000 });

  assert.equal(result.ok, true);
  assert.equal(result.simulated.budget, 1000000);
  assert.equal(result.simulated.budgetDelta, -200000);

  // Budget cut delays project (negative daysSavedOrDelayed)
  assert.ok(result.simulated.completionDateDeltaDays < 0, 'Budget cut must delay project completion');
  assert.ok(result.simulated.remainingDays > result.baseline.remainingDays, 'Remaining days must increase');

  // Daily burn rate decreases with smaller budget spread over longer time
  assert.ok(result.simulated.dailyBurnRate < result.baseline.dailyBurnRate);
  assert.ok(result.simulated.burnRateDeltaPercent < 0);
});

test('simulateScenario models timeline shifts independently and combined', async () => {
  // Pure timeline extension (delay +14 days)
  const delayRes = await simulateScenario({ projectId: 2, timelineDeltaDays: 14 });
  assert.equal(delayRes.ok, true);
  assert.ok(delayRes.simulated.remainingDays > delayRes.baseline.remainingDays);

  // Combined: inject 300k but explicitly delay by 14 days
  const combRes = await simulateScenario({ projectId: 2, budgetDelta: 300000, timelineDeltaDays: 14 });
  assert.equal(combRes.ok, true);
  assert.equal(combRes.simulated.budget, 1150000);
});

test('simulateScenario resolves project by name substring', async () => {
  const res = await simulateScenario({ projectName: 'رخص البناء', budgetDelta: 100000 });
  assert.equal(res.ok, true);
  assert.equal(res.baseline.projectName, 'أتمتة رخص البناء');
  assert.equal(res.baseline.projectId, 2);
});

test('simulateScenario supports targetStatus override', async () => {
  const res = await simulateScenario({ projectId: 2, budgetDelta: 300000, targetStatus: 'مكتمل' });
  assert.equal(res.ok, true);
  assert.equal(res.simulated.status, 'مكتمل');
});

// ============================================================================
// 2. Arabic Narrative Synthesis & Strategic Trade-Offs
// ============================================================================
test('simulateScenario generates executive Arabic narrative for capital injection', async () => {
  const res = await simulateScenario({ projectId: 1, budgetDelta: 300000 });

  // Example match: "ضخ 300,000 ريال يسرّع إطلاق بوابة الخدمات الإلكترونية بـ 12 يوماً، مع زيادة عبء الصرف بنسبة 30%."
  assert.ok(res.impactSummary.includes('ضخ 300,000 ريال'), 'Summary must mention injected amount');
  assert.ok(res.impactSummary.includes('يسرّع إطلاق'), 'Summary must highlight acceleration');
  assert.ok(res.impactSummary.includes('بوابة الخدمات الإلكترونية'), 'Summary must mention project name');
  assert.ok(res.impactSummary.includes('عبء الصرف بنسبة'), 'Summary must quantify burn-rate impact');

  // Trade-offs array structure
  assert.ok(Array.isArray(res.tradeOffs));
  assert.equal(res.tradeOffs.length, 3);
  const pillars = res.tradeOffs.map(t => t.pillar);
  assert.ok(pillars.includes('الجدول الزمني والجاهزية'));
  assert.ok(pillars.includes('السيولة ومعدل الحرق'));
  assert.ok(pillars.includes('أثر المحفظة والعائد'));
});

test('simulateScenario generates appropriate narrative for budget cut and neutral plans', async () => {
  // Budget cut narrative
  const cutRes = await simulateScenario({ projectId: 1, budgetDelta: -150000 });
  assert.ok(cutRes.impactSummary.includes('خفض 150,000 ريال'));
  assert.ok(cutRes.impactSummary.includes('يؤخر تسليم') || cutRes.impactSummary.includes('يقلّص أعباء الصرف'));

  // Neutral plan (0 delta)
  const zeroRes = await simulateScenario({ projectId: 1, budgetDelta: 0, timelineDeltaDays: 0 });
  assert.ok(zeroRes.impactSummary.includes('الإبقاء على خطة'));
});

// ============================================================================
// 3. Portfolio Ripple Effects & Cross-Project Impact
// ============================================================================
test('simulateScenario calculates portfolio ROI and cross-project impacts', async () => {
  const res = await simulateScenario({ projectId: 2, budgetDelta: 300000 });

  assert.ok('portfolioImpact' in res);
  const p = res.portfolioImpact;
  assert.ok(typeof p.baselineRoiIndex === 'number');
  assert.ok(typeof p.simulatedRoiIndex === 'number');
  assert.ok(typeof p.capitalPressurePercent === 'number');
  assert.ok(Array.isArray(p.affectedProjects));

  // Sibling projects must be listed with risk levels
  assert.ok(p.affectedProjects.length > 0);
  p.affectedProjects.forEach(proj => {
    assert.notEqual(proj.id, 2, 'Simulated project itself should not be in affected siblings');
    assert.ok(['منخفض', 'متوسط', 'مرتفع'].includes(proj.riskLevel));
    assert.ok(typeof proj.note === 'string' && proj.note.length > 0);
  });
});

// ============================================================================
// 4. Bound Validations & Error Handling
// ============================================================================
test('simulateScenario enforces input bounds and throws on unknown project', async () => {
  // Unknown ID throws 404-like descriptive error
  await assert.rejects(async () => {
    await simulateScenario({ projectId: 999999 });
  }, /مشروع غير موجود/);

  // Unknown project name throws descriptive error
  await assert.rejects(async () => {
    await simulateScenario({ projectName: 'مشروع_غير_موجود_في_المحفظة_xyz' });
  }, /لم يتم العثور على مشروع/);

  // Missing arguments defaults to an active project cleanly without crashing
  const defRes = await simulateScenario();
  assert.equal(defRes.ok, true);
  assert.ok(defRes.baseline.projectId > 0);

  // Extreme deltas are safely clamped without throwing NaN or crashing
  const extremeRes = await simulateScenario({ projectId: 1, budgetDelta: 9999999999 });
  assert.equal(extremeRes.ok, true);
  assert.ok(Number.isFinite(extremeRes.simulated.budget));
});

// ============================================================================
// 5. Tool Declaration & Execution
// ============================================================================
test('simulate_scenario tool has valid Gemini declaration and run handler', async () => {
  assert.ok(simulate_scenario.declaration);
  assert.equal(simulate_scenario.declaration.name, 'simulate_scenario');
  assert.ok(simulate_scenario.declaration.description.includes('محاكاة'));

  const params = simulate_scenario.declaration.parameters;
  assert.equal(params.type, 'OBJECT');
  assert.ok(params.properties.projectId);
  assert.ok(params.properties.projectName);
  assert.ok(params.properties.budgetDelta);
  assert.ok(params.properties.timelineDeltaDays);
  assert.ok(params.properties.targetStatus);

  // Handler execution
  const out = await simulate_scenario.run({ projectId: 1, budgetDelta: 200000 });
  assert.equal(out.ok, true);
  assert.equal(out.simulated.budgetDelta, 200000);
});

// ============================================================================
// 6. Express HTTP API Routes Integration
// ============================================================================
test('POST /api/executive/simulate and related routes respond correctly', async () => {
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    // 1. POST /api/executive/simulate (Success)
    const simRes = await fetch(`${baseUrl}/api/executive/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 1, budgetDelta: 300000 }),
    });
    assert.equal(simRes.status, 200);
    const simData = await simRes.json();
    assert.equal(simData.ok, true);
    assert.equal(simData.baseline.projectId, 1);
    assert.equal(simData.simulated.budget, 1500000);
    assert.ok(simData.impactSummary.includes('ضخ 300,000 ريال'));

    // 2. POST /api/executive/simulate (404 on unknown project)
    const notFoundRes = await fetch(`${baseUrl}/api/executive/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 88888 }),
    });
    assert.equal(notFoundRes.status, 404);
    const errData = await notFoundRes.json();
    assert.equal(errData.ok, false);
    assert.ok(errData.error.includes('مشروع غير موجود'));

    // 3. GET /api/executive/projects
    const projRes = await fetch(`${baseUrl}/api/executive/projects`);
    assert.equal(projRes.status, 200);
    const projData = await projRes.json();
    assert.equal(projData.ok, true);
    assert.ok(Array.isArray(projData.projects));
    assert.ok(projData.projects.length >= 5);

    // 4. POST /api/executive/apply (Commit plan change)
    const applyRes = await fetch(`${baseUrl}/api/executive/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: 4,
        budgetDelta: 50000,
        timelineDeltaDays: -7,
      }),
    });
    assert.equal(applyRes.status, 200);
    const applyData = await applyRes.json();
    assert.equal(applyData.ok, true);
    assert.ok(applyData.message.includes('تم اعتماد تعديل'));
    assert.equal(applyData.project.budget, 1000000); // 950000 + 50000

    // Reset project 4 back to seed budget
    await db.prepare('UPDATE projects SET budget = 950000 WHERE id = 4').run();

  } finally {
    server.close();
  }
});
