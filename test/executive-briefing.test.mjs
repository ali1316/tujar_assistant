// test/executive-briefing.test.mjs - Test suite for Executive Morning Audio Briefing (الموجز التنفيذي الصباحي)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { generateExecutiveBriefing, synthesizeExecutiveText, generateCues, formatCurrencyArabic, get_executive_briefing } from '../src/executive/briefing.js';
import { tools } from '../src/tools/registry.js';
import { app } from '../server.js';

test('formatCurrencyArabic formats numbers correctly for executive speech', () => {
  assert.equal(formatCurrencyArabic(5300000), '5.3 مليون ريال');
  assert.equal(formatCurrencyArabic(12000000), '12 مليون ريال');
  assert.equal(formatCurrencyArabic(850000), '850 ألف ريال');
  assert.equal(formatCurrencyArabic(500), '500 ريال');
});

test('generateExecutiveBriefing aggregates projects, tickets, and document metrics', async () => {
  const briefing = await generateExecutiveBriefing();

  // Validate response shape
  assert.ok(briefing && typeof briefing === 'object', 'Briefing must be an object');
  assert.ok(typeof briefing.text === 'string' && briefing.text.length > 0, 'Briefing text must be a non-empty string');
  assert.ok(typeof briefing.audioUrl === 'string' && briefing.audioUrl.length > 0, 'AudioUrl must be present');
  assert.ok(Array.isArray(briefing.cues), 'Cues must be an array');
  assert.ok(briefing.metrics && typeof briefing.metrics === 'object', 'Metrics must be an object');

  // Validate aggregated metrics
  const { metrics } = briefing;
  assert.ok(metrics.total_projects > 0, 'Should have positive project count');
  assert.ok(metrics.total_budget > 0, 'Should have positive total budget');
  assert.ok(metrics.total_spent > 0, 'Should have positive total spent');
  assert.ok(metrics.budget_utilization_pct >= 0 && metrics.budget_utilization_pct <= 100, 'Utilization pct should be 0-100%');
  assert.ok(metrics.delayed_projects_count >= 0, 'Delayed projects count must be non-negative');
  assert.ok(Array.isArray(metrics.delayed_projects), 'Delayed projects must be an array');
  assert.ok(metrics.open_tickets_count >= 0, 'Open tickets count must be non-negative');
  assert.ok(metrics.high_priority_tickets_count >= 0, 'High priority tickets must be non-negative');
  assert.ok(Array.isArray(metrics.recent_docs), 'Recent docs must be an array');
});

test('synthesizeExecutiveText generates natural executive Arabic in Saudi business style', () => {
  const mockMetrics = {
    total_projects: 5,
    total_budget: 5300000,
    total_spent: 2130000,
    budget_utilization_pct: 40,
    avg_progress_pct: 50,
    delayed_projects_count: 1,
    delayed_projects: [{ id: 2, name: 'أتمتة رخص البناء', progress: 40, owner: 'خالد الحربي' }],
    open_tickets_count: 5,
    high_priority_tickets_count: 3,
    high_priority_tickets: [{ id: 1, title: 'خلل في تسجيل الدخول عبر النفاذ الوطني' }],
    recent_docs_count: 1,
  };
  const mockDocs = [{ title: 'ميزانية اتحاد الغرف 2026' }];

  const text = synthesizeExecutiveText({
    metrics: mockMetrics,
    projects: [],
    tickets: [],
    recentDocs: mockDocs,
  });

  // Verify executive greeting & identity
  assert.match(text, /صباح الخير أستاذ فواز/, 'Must include executive greeting for Fawaz');
  assert.match(text, /الموجز التنفيذي الصباحي/, 'Must mention morning executive briefing');
  assert.match(text, /اتحاد الغرف/, 'Must mention Federation of Chambers');
  assert.match(text, /تُجّار|تجار/, 'Must mention Tujar');

  // Verify financial figures
  assert.match(text, /5\.3 مليون ريال/, 'Must mention formatted budget');
  assert.match(text, /2\.1 مليون ريال/, 'Must mention formatted spent');
  assert.match(text, /40 بالمئة/, 'Must mention utilization percentage');

  // Verify delayed project mention
  assert.match(text, /أتمتة رخص البناء/, 'Must mention specific delayed project name');
  assert.match(text, /40 بالمئة/, 'Must mention delayed project progress');

  // Verify high priority ticket mention
  assert.match(text, /النفاذ الوطني/, 'Must mention top high priority ticket title');

  // Verify recent document mention
  assert.match(text, /ميزانية اتحاد الغرف 2026/, 'Must mention recent Auto-DK document');

  // Length check: should be ~70 to 120 words for 30-45s duration
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  assert.ok(wordCount >= 60 && wordCount <= 130, `Word count ${wordCount} should fit 30-45s spoken duration`);
});

test('generateCues generates valid structured cue points for Screen Choreography', () => {
  const delayedProjects = [{ id: 2, name: 'أتمتة رخص البناء', progress: 40 }];
  const highPriorityTickets = [{ id: 1, title: 'خلل في تسجيل الدخول' }];
  const recentDocs = [{ id: 'ds-12345678', title: 'تقرير الربع الأول' }];

  const cues = generateCues({ delayedProjects, highPriorityTickets, recentDocs });

  assert.ok(Array.isArray(cues), 'Cues must be an array');
  assert.ok(cues.length >= 4, `Expected at least 4 cues, got ${cues.length}`);

  // Check budget KPI cue
  const budgetCue = cues.find(c => c.target === '#kpi-budget');
  assert.ok(budgetCue, 'Must have #kpi-budget cue');
  assert.equal(budgetCue.timeOffset, 0);
  assert.ok(budgetCue.label.includes('الميزانية'), 'Budget cue label should mention budget');

  // Check delayed project cue
  const delayedCue = cues.find(c => c.target === 'project-2');
  assert.ok(delayedCue, 'Must have project-2 cue targeting delayed project');
  assert.ok(delayedCue.label.includes('أتمتة رخص البناء'), 'Delayed project cue should include project name');

  // Check tickets cue
  const ticketsCue = cues.find(c => c.target === '#tickets');
  assert.ok(ticketsCue, 'Must have #tickets cue');

  // Check docs cue
  const docsCue = cues.find(c => c.target === '#docs');
  assert.ok(docsCue, 'Must have #docs cue');

  // Every cue must have target and label
  for (const c of cues) {
    assert.ok(typeof c.target === 'string' && c.target.length > 0, `Cue target must be string: ${JSON.stringify(c)}`);
    assert.ok(typeof c.label === 'string' && c.label.length > 0, `Cue label must be string: ${JSON.stringify(c)}`);
    assert.ok(typeof c.timeOffset === 'number' && c.timeOffset >= 0, `Cue timeOffset must be number >= 0`);
  }
});

test('get_executive_briefing tool declaration and execution handler', async () => {
  // 1. Tool declaration
  assert.ok(get_executive_briefing.declaration, 'Tool must have declaration');
  assert.equal(get_executive_briefing.declaration.name, 'get_executive_briefing');
  assert.ok(get_executive_briefing.declaration.description.includes('الموجز التنفيذي'));

  // 2. Tool registered in registry
  assert.ok(tools.get_executive_briefing, 'Tool must be registered in src/tools/registry.js');

  // 3. Execution handler
  const res = await get_executive_briefing.run({});
  assert.ok(res && typeof res === 'object');
  assert.ok(res.text && res.text.includes('صباح الخير'));
  assert.ok(Array.isArray(res.cues));
  assert.ok(res.metrics && typeof res.metrics === 'object');
});

test('GET /api/executive/briefing endpoint returns complete briefing payload', async () => {
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    const res = await fetch(`${baseUrl}/api/executive/briefing`);
    assert.equal(res.status, 200, `API should return status 200, got ${res.status}`);

    const data = await res.json();
    assert.ok(typeof data.text === 'string' && data.text.length > 0, 'Response should contain text');
    assert.ok(typeof data.audioUrl === 'string', 'Response should contain audioUrl');
    assert.ok(Array.isArray(data.cues), 'Response should contain cues array');
    assert.ok(data.metrics && typeof data.metrics === 'object', 'Response should contain metrics object');
    assert.ok(data.metrics.total_projects > 0, 'Metrics should have total_projects');
    assert.ok(data.cues.length >= 3, 'Should have multiple cue points');
  } finally {
    server.close();
  }
});
