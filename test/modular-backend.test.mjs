import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// 1. Line count verification for server.js
test('server.js is a lean orchestrator (< 100 lines)', () => {
  const content = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const lineCount = content.split('\n').length;
  assert.ok(lineCount < 100, `server.js must be < 100 lines, but is ${lineCount}`);
});

// 2. Prompt integrity in src/voice/prompt.js
test('src/voice/prompt.js contains no dialect scripting or contradictory legacy rules', () => {
  const content = fs.readFileSync(new URL('../src/voice/prompt.js', import.meta.url), 'utf8');
  for (const w of ['بالمية', 'الساعة تسع ونص', 'اللهجة', 'لهجة', 'حجازي', 'جداوية', 'نبرة سعودية', 'أبشر', 'إيوه', 'اثنعش', 'تسعمية', 'غُرْفة']) {
    assert.ok(!content.includes(w), `src/voice/prompt.js still scripts dialect: «${w}»`);
  }
  assert.ok(!content.includes('حتى لو آخر ملف مرفوع PDF'), 'prompt contradicts pdf_* rule');
});

// 3. Tool registry and execution
test('src/tools/registry registers all required domain tools', async () => {
  const { tools } = await import('../src/tools/registry.js');
  // db / data tools
  assert.ok(tools.get_dashboard_summary, 'missing get_dashboard_summary');
  assert.ok(tools.search_projects, 'missing search_projects');
  // docs tools
  assert.ok(tools.search_documents, 'missing search_documents');
  assert.ok(tools.read_document, 'missing read_document');
  // memory tools
  assert.ok(tools.remember, 'missing remember');
  assert.ok(tools.recall, 'missing recall');
  // datasets tools
  assert.ok(tools.query_data, 'missing query_data');
  assert.ok(tools.data_chart, 'missing data_chart');
  // ingest tools
  assert.ok(tools.pdf_metric, 'missing pdf_metric');
  assert.ok(tools.pdf_dashboard, 'missing pdf_dashboard');
  // usage tools
  assert.ok(tools.get_token_usage, 'missing get_token_usage');
});

test('src/tools/handler executes tool and handles errors', async () => {
  const { executeTool } = await import('../src/tools/handler.js');
  // Successful execution of a data tool
  const summary = await executeTool('get_dashboard_summary', {});
  assert.ok(typeof summary === 'object');
  assert.ok('total_budget' in summary);

  // Unknown tool returns 404 error
  await assert.rejects(async () => {
    await executeTool('non_existent_tool_xyz', {});
  }, (err) => {
    assert.equal(err.status, 404);
    assert.match(err.message, /أداة غير معروفة/);
    return true;
  });
});

// 4. Voice Declarations and Active declarations
test('src/voice/declarations generates valid blocking tool declarations', async () => {
  const { activeDeclarations, visualDeclarations, uiDeclarations, assistantDeclarations } = await import('../src/voice/declarations.js');
  assert.ok(visualDeclarations.length > 0);
  assert.ok(uiDeclarations.length > 0);
  assert.ok(assistantDeclarations.length > 0);

  const decls = activeDeclarations();
  assert.ok(Array.isArray(decls));
  assert.ok(decls.some(d => d.name === 'show_overview'));
  assert.ok(decls.some(d => d.name === 'show_screen'));
  assert.ok(decls.some(d => d.name === 'get_dashboard_summary'));
});

// 5. Express API integration tests
test('Express app routes respond correctly', async () => {
  const { app } = await import('../server.js');
  const http = await import('node:http');

  // Start app on ephemeral port for integration testing
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    // GET /health
    const healthRes = await fetch(`${baseUrl}/health`);
    assert.equal(healthRes.status, 200);
    assert.equal(await healthRes.text(), 'ok');

    // GET /api/ping
    const pingRes = await fetch(`${baseUrl}/api/ping`);
    assert.equal(pingRes.status, 200);
    const pingData = await pingRes.json();
    assert.equal(pingData.ok, true);
    assert.ok('boot' in pingData);

    // GET /api/voices
    const voicesRes = await fetch(`${baseUrl}/api/voices`);
    assert.equal(voicesRes.status, 200);
    const voicesData = await voicesRes.json();
    assert.ok(Array.isArray(voicesData.voices));
    assert.ok(voicesData.voices.includes('Sulafat'));

    // POST /api/tools/:name
    const toolRes = await fetch(`${baseUrl}/api/tools/get_dashboard_summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(toolRes.status, 200);
    const toolData = await toolRes.json();
    assert.ok('total_budget' in toolData);

    // POST /api/tools/:name (404 on unknown tool)
    const unknownToolRes = await fetch(`${baseUrl}/api/tools/unknown_xyz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(unknownToolRes.status, 404);

    // POST /api/speak with empty text returns 400
    const speakEmpty = await fetch(`${baseUrl}/api/speak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '' }),
    });
    assert.equal(speakEmpty.status, 400);

    // POST /api/speak/eleven with empty text returns 400
    const speakElevenEmpty = await fetch(`${baseUrl}/api/speak/eleven`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '' }),
    });
    assert.equal(speakElevenEmpty.status, 400);

    // GET & POST /api/dashboard
    const dashRes = await fetch(`${baseUrl}/api/dashboard`);
    assert.equal(dashRes.status, 200);
    const dashData = await dashRes.json();
    assert.ok('projects' in dashData);
    assert.ok('summary' in dashData);

    // GET /api/ui & POST /api/ui
    const uiPost = await fetch(`${baseUrl}/api/ui`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ font: 'Cairo' }),
    });
    assert.equal(uiPost.status, 200);
    const uiGet = await fetch(`${baseUrl}/api/ui`);
    assert.equal(uiGet.status, 200);
    const uiData = await uiGet.json();
    assert.equal(uiData.font, 'Cairo');

    // POST /api/upload and /api/docs/upload without file returns 400
    const upRes1 = await fetch(`${baseUrl}/api/upload`, { method: 'POST' });
    assert.equal(upRes1.status, 400);
    const upRes2 = await fetch(`${baseUrl}/api/docs/upload`, { method: 'POST' });
    assert.equal(upRes2.status, 400);

    // Static file serving
    const indexRes = await fetch(`${baseUrl}/`);
    assert.equal(indexRes.status, 200);
    assert.match(indexRes.headers.get('content-type'), /text\/html/);

    const agentJsRes = await fetch(`${baseUrl}/gemini-live-agent.js`);
    assert.equal(agentJsRes.status, 200);
    assert.match(agentJsRes.headers.get('content-type'), /javascript/);

  } finally {
    server.close();
  }
});
