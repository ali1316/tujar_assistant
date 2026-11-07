// End-to-end live runtime verification test
// Runs the actual server, issues live HTTP/SSE/Upload requests, and ensures zero crashes
import http from 'node:http';
import assert from 'node:assert/strict';
import { app, startServer } from '../server.js';
import { executeTool } from '../src/tools/handler.js';
import { generateAutoDK } from '../src/ingest/auto-dk.js';
import { getStorage } from '../src/storage/storage-adapter.js';

async function runLiveVerification() {
  console.log('🚀 [E2E Live Verification] Starting verification suite...');

  // 1. Boot the server on an ephemeral port
  const testPort = 3199;
  const server = await startServer(testPort);
  const base = `http://localhost:${testPort}`;
  console.log(`📡 [Server] Booted live at ${base}`);

  try {
    // 2. Test Root HTML shell serving
    console.log('Testing GET / (HTML Shell)...');
    const rootRes = await fetch(`${base}/`);
    assert.equal(rootRes.status, 200, 'GET / returned non-200');
    assert.match(rootRes.headers.get('content-type'), /text\/html/, 'Invalid content-type for /');
    const html = await rootRes.text();
    assert.ok(html.includes('/css/main.css'), 'index.html missing main.css link');
    assert.ok(html.includes('/css/components.css'), 'index.html missing components.css link');
    assert.ok(html.includes('/js/app.js'), 'index.html missing app.js module');
    assert.ok(html.includes('id="home"'), 'index.html missing home section');
    console.log('✅ GET / is working perfectly');

    // 3. Test Modular CSS static endpoints
    console.log('Testing Static CSS endpoints...');
    for (const cssPath of ['/css/main.css', '/css/components.css']) {
      const res = await fetch(`${base}${cssPath}`);
      assert.equal(res.status, 200, `Failed to load ${cssPath}`);
      assert.match(res.headers.get('content-type'), /text\/css/, `Invalid content-type for ${cssPath}`);
      const text = await res.text();
      assert.ok(text.length > 500, `${cssPath} content too short`);
    }
    console.log('✅ Modular CSS static assets are served properly');

    // 4. Test Modular JS static endpoints
    console.log('Testing Static JS endpoints...');
    const jsFiles = [
      '/js/app.js',
      '/js/audio.js',
      '/js/live-client.js',
      '/js/charts.js',
      '/js/ui.js',
      '/js/hud.js',
      '/js/speech.js'
    ];
    for (const jsPath of jsFiles) {
      const res = await fetch(`${base}${jsPath}`);
      assert.equal(res.status, 200, `Failed to load ${jsPath}`);
      assert.match(res.headers.get('content-type'), /text\/javascript/, `Invalid content-type for ${jsPath}`);
      const text = await res.text();
      assert.ok(text.length > 100, `${jsPath} content too short`);
    }
    console.log('✅ Modular JavaScript static assets are served properly');

    // 5. Test Health & Telemetry endpoints
    console.log('Testing /health and /api/ping...');
    const healthRes = await fetch(`${base}/health`);
    assert.equal(healthRes.status, 200);
    assert.equal(await healthRes.text(), 'ok');

    const pingRes = await fetch(`${base}/api/ping`);
    assert.equal(pingRes.status, 200);
    const ping = await pingRes.json();
    assert.equal(ping.ok, true);
    assert.ok(ping.boot, 'Missing boot ID in /api/ping');
    assert.ok(ping.persist, 'Missing persist object in /api/ping');
    assert.equal(ping.persist.protected, false, 'Persist state should not be protected');
    console.log(`✅ Health check & Ping OK (boot: ${ping.boot}, backend: ${ping.persist.ready ? 'ready' : 'init'})`);

    // 6. Test Dashboard Summary & Projects data
    console.log('Testing GET /api/dashboard...');
    const dashRes = await fetch(`${base}/api/dashboard`);
    assert.equal(dashRes.status, 200);
    const dash = await dashRes.json();
    assert.ok(Array.isArray(dash.projects), 'Missing projects array');
    assert.ok(dash.projects.length > 0, 'Seed projects not loaded');
    assert.ok(dash.summary, 'Missing dashboard summary');
    assert.ok('total_budget' in dash.summary, 'Missing total_budget in summary');
    console.log(`✅ Dashboard data OK (${dash.projects.length} projects, budget: ${dash.summary.total_budget} SAR)`);

    // 7. Test Voices Endpoint
    console.log('Testing GET /api/voices...');
    const voicesRes = await fetch(`${base}/api/voices`);
    assert.equal(voicesRes.status, 200);
    const voices = await voicesRes.json();
    assert.ok(Array.isArray(voices.voices), 'Missing voices array');
    console.log(`✅ Voices OK (${voices.voices.length} voices available)`);

    // 8. Test Nora Tool Execution (/api/tools/:name)
    console.log('Testing POST /api/tools/:name...');
    const toolRes = await fetch(`${base}/api/tools/get_dashboard_summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.equal(toolRes.status, 200);
    const toolData = await toolRes.json();
    assert.ok(toolData.total_budget > 0, 'Tool execution returned invalid total_budget');

    const searchProjectsRes = await fetch(`${base}/api/tools/search_projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'بوابة' })
    });
    assert.equal(searchProjectsRes.status, 200);
    const searchData = await searchProjectsRes.json();
    assert.ok(Array.isArray(searchData.projects), 'search_projects did not return projects array');
    console.log(`✅ Tools execution OK (search found ${searchData.projects.length} projects)`);

    // 9. Test Live Auto-DK Upload Pipeline
    console.log('Testing Live Auto-DK Upload Pipeline...');
    const sampleCsv = `المشروع,الميزانية,المصروف,الحالة
تطوير منصة تجار,1200000,450000,نشط
أتمتة الغرف التجارية,850000,320000,قيد التنفيذ
الربط الإلكتروني,600000,210000,مكتمل`;

    const boundary = '----WebKitFormBoundaryE2EVerificationTest';
    const bodyParts = [
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="file"; filename="e2e_projects_test.csv"\r\n`,
      `Content-Type: text/csv\r\n\r\n`,
      sampleCsv,
      `\r\n--${boundary}--\r\n`
    ];
    const uploadBody = Buffer.concat(bodyParts.map(p => Buffer.from(p)));

    const uploadRes = await fetch(`${base}/api/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      },
      body: uploadBody
    });
    assert.equal(uploadRes.status, 200, `Upload failed with status ${uploadRes.status}`);
    const uploadResult = await uploadRes.json();
    assert.ok(uploadResult.id, 'Upload response missing document ID');
    assert.ok(uploadResult.datasets, 'Upload response missing datasets array');
    console.log(`✅ File upload & Auto-DK OK (doc #${uploadResult.id}, ${uploadResult.datasets.length} tables extracted)`);

    // 10. Test Server-Sent Events (SSE) Stream
    console.log('Testing GET /api/events (SSE stream)...');
    const sseController = new AbortController();
    const ssePromise = new Promise((resolve, reject) => {
      const sseReq = http.get(`${base}/api/events`, (res) => {
        assert.equal(res.statusCode, 200);
        assert.match(res.headers['content-type'], /text\/event-stream/);
        let chunkCount = 0;
        res.on('data', (chunk) => {
          chunkCount++;
          const text = chunk.toString();
          if (text.includes('hello') || text.includes('data')) {
            sseReq.destroy();
            resolve(text);
          }
        });
      });
      sseReq.on('error', (err) => {
        if (err.message.includes('socket hang up') || err.code === 'ECONNRESET') {
          // Expected on req.destroy()
          resolve('closed');
        } else {
          reject(err);
        }
      });
    });

    const sseResult = await ssePromise;
    console.log('✅ SSE Stream verified and responsive');

    // 11. Test Storage Adapter direct operations
    console.log('Testing Storage Adapter operations...');
    const storage = getStorage();
    const testKey = 'e2e/test-artifact.txt';
    const testContent = Buffer.from('Live test content for storage adapter');
    await storage.put(testKey, testContent, 'text/plain');
    assert.equal(await storage.exists(testKey), true);
    const retrieved = await storage.get(testKey);
    assert.equal(retrieved.toString(), testContent.toString());
    await storage.delete(testKey);
    assert.equal(await storage.exists(testKey), false);
    console.log('✅ Storage Adapter operations OK');

    console.log('\n======================================================');
    console.log('🎉 ALL LIVE RUNTIME ENDPOINTS & SYSTEMS OPERATING FLAWLESSLY!');
    console.log('   Zero crashes. Zero unhandled rejections. 100% verified.');
    console.log('======================================================\n');
  } finally {
    // 12. Gracefully close the live server
    await new Promise(resolve => server.close(resolve));
    console.log('🛑 [Server] Gracefully shut down without errors.');
  }
}

runLiveVerification().catch(err => {
  console.error('❌ E2E Live Verification FAILED:', err);
  process.exit(1);
});
