import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { db } from '../db.js';
import { app } from '../server.js';
import {
  syncFromDrive,
  getDriveSyncStatus,
  startDriveSyncPolling,
  stopDriveSyncPolling,
} from '../src/drive/sync.js';
import { driveReady, callDriveApi } from '../drive.js';
import { _setSynthesisEngine, synthesizeMock } from '../src/ingest/auto-dk.js';

_setSynthesisEngine(synthesizeMock);

test('Drive Sync: getDriveSyncStatus returns structured state', async () => {
  const status = getDriveSyncStatus();
  assert.equal(typeof status.connected, 'boolean');
  assert.equal(typeof status.polling, 'boolean');
  assert.equal(typeof status.is_syncing, 'boolean');
});

test('Drive Sync: startDriveSyncPolling and stopDriveSyncPolling manage polling state', async () => {
  stopDriveSyncPolling();
  assert.equal(getDriveSyncStatus().polling, false);

  const started = startDriveSyncPolling(30);
  assert.equal(started, driveReady());
  if (driveReady()) {
    assert.equal(getDriveSyncStatus().polling, true);
  }

  stopDriveSyncPolling();
  assert.equal(getDriveSyncStatus().polling, false);
});

test('Drive Sync: Deduplication by drive_id skips download and re-processing', async () => {
  const testDriveId = 'drive_mock_existing_' + Date.now();
  const testContent = 'محتوى تجريبي لاختبار المزامنة بالمعرف ' + Date.now();
  const sha = crypto.createHash('sha256').update(testContent).digest('hex');

  // Insert mock document with drive_id
  const insert = await db.prepare(
    'INSERT INTO documents (name, type, size, chars, content, sha256, drive_id, drive_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    'existing_drive_doc.txt',
    'text/plain',
    testContent.length,
    testContent.length,
    testContent,
    sha,
    testDriveId,
    'https://drive.google.com/file/' + testDriveId
  );
  const docId = insert.lastInsertRowid || insert.id;

  // Mock fetch to simulate Apps Script listing this file
  const originalFetch = globalThis.fetch;
  let getByIdCalled = false;

  globalThis.fetch = async (url, opts) => {
    const body = JSON.parse(opts?.body || '{}');
    if (body.action === 'list') {
      return {
        text: async () =>
          JSON.stringify({
            ok: true,
            root: 'https://drive.google.com/mock',
            files: [
              {
                id: testDriveId,
                name: 'existing_drive_doc.txt',
                category: 'التقارير والعروض',
                size: testContent.length,
                url: 'https://drive.google.com/file/' + testDriveId,
              },
            ],
          }),
      };
    }
    if (body.action === 'getById') {
      getByIdCalled = true;
      return {
        text: async () => JSON.stringify({ ok: true, data: Buffer.from(testContent).toString('base64') }),
      };
    }
    return originalFetch(url, opts);
  };

  try {
    const res = await syncFromDrive();
    assert.equal(res.ok, true);
    assert.equal(res.stats.already_synced, 1);
    assert.equal(res.stats.new_imported, 0);
    assert.equal(getByIdCalled, false, 'getById should NOT be called for already synced drive_id');
  } finally {
    globalThis.fetch = originalFetch;
    await db.prepare('DELETE FROM documents WHERE id=?').run(docId);
  }
});

test('Drive Sync: Deduplication by SHA-256 links Drive ID to existing document without creating duplicates', async () => {
  const content = 'بيانات مالية ربع سنوية لمشروع التحول الرقمي ' + Date.now();
  const sha = crypto.createHash('sha256').update(content).digest('hex');
  const newDriveId = 'drive_new_file_sha_match_' + Date.now();

  // Insert existing document without drive_id (e.g. uploaded previously via dashboard)
  const insert = await db.prepare(
    'INSERT INTO documents (name, type, size, chars, content, sha256) VALUES (?, ?, ?, ?, ?, ?)'
  ).run('web_upload.txt', 'text/plain', content.length, content.length, content, sha);
  const docId = insert.lastInsertRowid || insert.id;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const body = JSON.parse(opts?.body || '{}');
    if (body.action === 'list') {
      return {
        text: async () =>
          JSON.stringify({
            ok: true,
            files: [
              {
                id: newDriveId,
                name: 'drive_copy.txt',
                url: 'https://drive.google.com/file/' + newDriveId,
              },
            ],
          }),
      };
    }
    if (body.action === 'getById') {
      return {
        text: async () =>
          JSON.stringify({
            ok: true,
            name: 'drive_copy.txt',
            mime: 'text/plain',
            data: Buffer.from(content).toString('base64'),
          }),
      };
    }
    return originalFetch(url, opts);
  };

  try {
    const res = await syncFromDrive();
    assert.equal(res.ok, true);
    assert.equal(res.stats.deduplicated, 1);
    assert.equal(res.stats.new_imported, 0);

    // Verify the existing row now has drive_id linked
    const updated = await db.prepare('SELECT id, drive_id, drive_url FROM documents WHERE id=?').get(docId);
    assert.equal(updated.drive_id, newDriveId);
  } finally {
    globalThis.fetch = originalFetch;
    await db.prepare('DELETE FROM documents WHERE id=?').run(docId);
  }
});

test('Drive Sync: Imports new unique file from Drive and indexes it', async () => {
  const uniqueContent = 'تقرير إنجاز جديد كلياً من Drive بتاريخ ' + Date.now();
  const uniqueDriveId = 'unique_drive_' + Date.now();
  const sha = crypto.createHash('sha256').update(uniqueContent).digest('hex');

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const body = JSON.parse(opts?.body || '{}');
    if (body.action === 'list') {
      return {
        text: async () =>
          JSON.stringify({
            ok: true,
            files: [
              {
                id: uniqueDriveId,
                name: 'تقرير_المشاريع_الجديد.txt',
                category: 'المشاريع والمتابعة',
                url: 'https://drive.google.com/file/' + uniqueDriveId,
              },
            ],
          }),
      };
    }
    if (body.action === 'getById') {
      return {
        text: async () =>
          JSON.stringify({
            ok: true,
            name: 'تقرير_المشاريع_الجديد.txt',
            mime: 'text/plain',
            data: Buffer.from(uniqueContent).toString('base64'),
          }),
      };
    }
    return originalFetch(url, opts);
  };

  try {
    const res = await syncFromDrive();
    assert.equal(res.ok, true);
    assert.equal(res.stats.new_imported, 1);

    const doc = await db.prepare('SELECT id, name, sha256, drive_id, category FROM documents WHERE drive_id=?').get(uniqueDriveId);
    assert.ok(doc, 'Document should be created in database');
    assert.equal(doc.sha256, sha);
    assert.equal(doc.name, 'تقرير_المشاريع_الجديد.txt');
    await db.prepare('DELETE FROM documents WHERE id=?').run(doc.id);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Drive API Endpoints: /api/drive/status, /api/drive/sync, /api/drive/webhook, /api/drive/polling', async () => {
  const http = await import('node:http');
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    // 1. GET /api/drive/status
    const statusRes = await fetch(`${baseUrl}/api/drive/status`);
    assert.equal(statusRes.status, 200);
    const statusData = await statusRes.json();
    assert.equal(statusData.ok, true);
    assert.equal(typeof statusData.connected, 'boolean');

    // 2. POST /api/drive/polling
    const pollRes = await fetch(`${baseUrl}/api/drive/polling`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    });
    assert.equal(pollRes.status, 200);
    const pollData = await pollRes.json();
    assert.equal(pollData.ok, true);
    assert.equal(pollData.polling, false);
  } finally {
    server.close();
  }
});
