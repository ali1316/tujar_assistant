import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  StorageAdapter,
  LocalStorageAdapter,
  S3StorageAdapter,
  getStorage,
  setStorage,
  resetStorage,
} from '../src/storage/storage-adapter.js';

test('StorageAdapter base interface throws for unimplemented methods', async () => {
  const adapter = new StorageAdapter();
  await assert.rejects(() => adapter.put('test.txt', 'hello'), /Not implemented: put/);
  await assert.rejects(() => adapter.get('test.txt'), /Not implemented: get/);
  await assert.rejects(() => adapter.getStream('test.txt'), /Not implemented: getStream/);
  await assert.rejects(() => adapter.exists('test.txt'), /Not implemented: exists/);
  await assert.rejects(() => adapter.delete('test.txt'), /Not implemented: delete/);
  await assert.rejects(() => adapter.list(), /Not implemented: list/);
});

test('LocalStorageAdapter operations: put, get, getStream, exists, delete, list', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nora-storage-test-'));
  try {
    const storage = new LocalStorageAdapter({ baseDir: tmpDir });
    assert.equal(storage.kind, 'local');

    // 1. exists on non-existent file
    assert.equal(await storage.exists('docs/sample.txt'), false);
    assert.equal(await storage.get('docs/sample.txt'), null);
    assert.equal(await storage.getStream('docs/sample.txt'), null);

    // 2. put
    const content = Buffer.from('محتوى اختباري لنورة', 'utf8');
    const putRes = await storage.put('docs/sample.txt', content, 'text/plain');
    assert.equal(putRes.key, 'docs/sample.txt');
    assert.equal(putRes.size, content.length);
    assert.ok(putRes.url.startsWith('file://'));

    // 3. exists & get
    assert.equal(await storage.exists('docs/sample.txt'), true);
    const retrieved = await storage.get('docs/sample.txt');
    assert.ok(Buffer.isBuffer(retrieved));
    assert.deepEqual(retrieved, content);

    // 4. getStream
    const stream = await storage.getStream('docs/sample.txt');
    assert.ok(stream instanceof ReadableStream);
    const streamText = await new Response(stream).text();
    assert.equal(streamText, 'محتوى اختباري لنورة');

    // 5. list & prefixes
    await storage.put('docs/sub/report.pdf', Buffer.from('pdf data'), 'application/pdf');
    await storage.put('images/logo.png', Buffer.from('png data'), 'image/png');

    const allFiles = await storage.list();
    assert.equal(allFiles.length, 3);
    assert.ok(allFiles.includes('docs/sample.txt'));
    assert.ok(allFiles.includes('docs/sub/report.pdf'));
    assert.ok(allFiles.includes('images/logo.png'));

    const docFiles = await storage.list('docs');
    assert.equal(docFiles.length, 2);
    assert.ok(docFiles.includes('docs/sample.txt'));
    assert.ok(docFiles.includes('docs/sub/report.pdf'));

    const imgFiles = await storage.list('images');
    assert.deepEqual(imgFiles, ['images/logo.png']);

    const emptyList = await storage.list('nonexistent');
    assert.deepEqual(emptyList, []);

    // 6. delete
    const delRes1 = await storage.delete('docs/sample.txt');
    assert.equal(delRes1, true);
    assert.equal(await storage.exists('docs/sample.txt'), false);

    // Deleting again returns false
    const delRes2 = await storage.delete('docs/sample.txt');
    assert.equal(delRes2, false);

    // 7. Path traversal blocked
    await assert.rejects(() => storage.put('../secrets.txt', 'evil'), /Path traversal attempt blocked/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('LocalStorageAdapter backward-compatibility methods: putFile, getFile, getJSON, putJSON, dir', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nora-storage-compat-'));
  try {
    const storage = new LocalStorageAdapter({ baseDir: tmpDir });

    // putFile & getFile
    const fileRes = await storage.putFile('manifest.json', JSON.stringify({ version: 1 }), 'application/json');
    assert.equal(fileRes.id, 'manifest.json');
    assert.equal(fileRes.name, 'manifest.json');
    assert.ok(fileRes.size > 0);

    const buf = await storage.getFile('manifest.json');
    assert.ok(Buffer.isBuffer(buf));

    // putJSON & getJSON & getText
    await storage.putJSON('meta/pkg.json', { author: 'fawaz', verified: true });
    const json = await storage.getJSON('meta/pkg.json');
    assert.deepEqual(json, { author: 'fawaz', verified: true });

    const text = await storage.getText('meta/pkg.json');
    assert.ok(text.includes('"author": "fawaz"'));

    // dir
    const d = await storage.dir('nested/folder');
    assert.equal(d.id, 'nested/folder');
    assert.ok(fs.existsSync(path.join(tmpDir, 'nested/folder')));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('S3StorageAdapter URL generation for Cloudflare R2, AWS S3, Supabase, and MinIO', () => {
  // 1. Cloudflare R2
  const r2 = new S3StorageAdapter({
    endpoint: 'https://cf12345.r2.cloudflarestorage.com',
    bucket: 'nora-bucket',
    region: 'auto',
    accessKeyId: 'R2KEY',
    secretAccessKey: 'R2SECRET',
  });
  assert.equal(
    r2.getUrl('documents/financial.pdf'),
    'https://cf12345.r2.cloudflarestorage.com/nora-bucket/documents/financial.pdf'
  );
  assert.equal(
    r2.buildUrl('', { prefix: 'documents/', 'list-type': '2' }),
    'https://cf12345.r2.cloudflarestorage.com/nora-bucket?prefix=documents%2F&list-type=2'
  );

  // 2. Supabase Storage S3 layer
  const supabase = new S3StorageAdapter({
    endpoint: 'https://xyzproject.supabase.co/storage/v1/s3',
    bucket: 'reports',
    region: 'us-east-1',
  });
  assert.equal(
    supabase.getUrl('2026/q3.xlsx'),
    'https://xyzproject.supabase.co/storage/v1/s3/reports/2026/q3.xlsx'
  );

  // 3. MinIO local instance
  const minio = new S3StorageAdapter({
    endpoint: 'http://localhost:9000',
    bucket: 'local-bucket',
  });
  assert.equal(
    minio.getUrl('test.txt'),
    'http://localhost:9000/local-bucket/test.txt'
  );

  // 4. AWS S3 with public custom domain
  const awsCdn = new S3StorageAdapter({
    bucket: 'my-media',
    region: 'us-east-1',
    publicUrl: 'https://cdn.fawaz.io',
  });
  assert.equal(
    awsCdn.getUrl('avatars/nora.png'),
    'https://cdn.fawaz.io/avatars/nora.png'
  );
  // buildUrl still targets the S3 endpoint for direct API calls
  assert.ok(awsCdn.buildUrl('avatars/nora.png').includes('/my-media/avatars/nora.png'));

  // 5. AWS S3 virtual-hosted style
  const awsVhost = new S3StorageAdapter({
    endpoint: 'https://s3.us-west-2.amazonaws.com',
    bucket: 'archive',
    region: 'us-west-2',
    forcePathStyle: false,
  });
  assert.equal(
    awsVhost.buildUrl('file.pdf'),
    'https://archive.s3.us-west-2.amazonaws.com/file.pdf'
  );
});

test('S3StorageAdapter SigV4 header creation and signing', () => {
  const fixedDate = new Date('2026-11-07T12:00:00Z');
  const s3 = new S3StorageAdapter({
    endpoint: 'https://s3.us-east-1.amazonaws.com',
    bucket: 'nora-data',
    region: 'us-east-1',
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  });

  // GET request header creation with explicit Date argument
  const getHeaders = s3.createHeaders('GET', 'contracts/contract1.pdf', '', {}, fixedDate);
  assert.equal(getHeaders.host, 's3.us-east-1.amazonaws.com');
  assert.equal(getHeaders['x-amz-date'], '20261107T120000Z');
  // SHA-256 of empty body
  assert.equal(getHeaders['x-amz-content-sha256'], 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.ok(getHeaders.authorization);
  assert.ok(getHeaders.authorization.startsWith('AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20261107/us-east-1/s3/aws4_request'));
  assert.ok(getHeaders.authorization.includes('SignedHeaders=host;x-amz-content-sha256;x-amz-date'));
  assert.ok(/Signature=[0-9a-f]{64}/.test(getHeaders.authorization));

  // PUT request header creation with payload and extra headers
  const payload = Buffer.from('Sample S3 Content');
  const putHeaders = s3.createHeaders('PUT', 'contracts/contract1.pdf', payload, {
    'content-type': 'text/plain',
    'x-amz-storage-class': 'STANDARD',
  }, fixedDate);

  const expectedSha = crypto.createHash('sha256').update(payload).digest('hex');
  assert.equal(putHeaders['x-amz-content-sha256'], expectedSha);
  assert.equal(putHeaders['content-type'], 'text/plain');
  assert.equal(putHeaders['x-amz-storage-class'], 'STANDARD');
  assert.ok(putHeaders.authorization.includes('content-type'));
  assert.ok(putHeaders.authorization.includes('x-amz-storage-class'));

  // Object-based options signature check
  const objHeaders = s3.createHeaders({
    method: 'DELETE',
    key: 'contracts/old.pdf',
    date: fixedDate,
  });
  assert.ok(objHeaders.authorization.startsWith('AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20261107/us-east-1/s3/aws4_request'));
  assert.equal(s3.getHeaders('GET', 'test.txt')['host'], 's3.us-east-1.amazonaws.com');
});

test('S3StorageAdapter CRUD operations using mock fetch', async () => {
  const calls = [];
  const mockFetch = async (url, opts) => {
    calls.push({ url: String(url), method: opts.method, headers: opts.headers, body: opts.body });
    if (opts.method === 'PUT') {
      return new Response('', { status: 200 });
    }
    if (opts.method === 'GET' && url.includes('list-type=2')) {
      const xml = `
        <ListBucketResult>
          <Contents><Key>reports/q1.pdf</Key></Contents>
          <Contents><Key>reports/q2.pdf</Key></Contents>
        </ListBucketResult>
      `;
      return new Response(xml, { status: 200, headers: { 'content-type': 'application/xml' } });
    }
    if (opts.method === 'GET') {
      if (url.includes('missing.pdf')) return new Response('Not Found', { status: 404 });
      return new Response(Buffer.from('s3 file content'), { status: 200 });
    }
    if (opts.method === 'HEAD') {
      if (url.includes('missing.pdf')) return new Response(null, { status: 404 });
      return new Response(null, { status: 200 });
    }
    if (opts.method === 'DELETE') {
      return new Response(null, { status: 204 });
    }
    return new Response('', { status: 500 });
  };

  const s3 = new S3StorageAdapter({
    endpoint: 'https://r2.example.com',
    bucket: 'test-bucket',
    accessKeyId: 'KEY',
    secretAccessKey: 'SECRET',
    fetch: mockFetch,
  });

  // put
  const putRes = await s3.put('docs/invoice.pdf', Buffer.from('invoice'), 'application/pdf');
  assert.equal(putRes.key, 'docs/invoice.pdf');
  assert.equal(putRes.size, 7);
  assert.equal(calls[0].method, 'PUT');
  assert.equal(calls[0].headers['content-type'], 'application/pdf');

  // get
  const getBuf = await s3.get('docs/invoice.pdf');
  assert.equal(getBuf.toString(), 's3 file content');
  assert.equal(await s3.get('missing.pdf'), null);

  // getStream
  const stream = await s3.getStream('docs/invoice.pdf');
  assert.ok(stream instanceof ReadableStream);
  const streamText = await new Response(stream).text();
  assert.equal(streamText, 's3 file content');

  // exists
  assert.equal(await s3.exists('docs/invoice.pdf'), true);
  assert.equal(await s3.exists('missing.pdf'), false);

  // list
  const listKeys = await s3.list('reports');
  assert.deepEqual(listKeys, ['reports/q1.pdf', 'reports/q2.pdf']);

  // delete
  assert.equal(await s3.delete('docs/invoice.pdf'), true);
});

test('getStorage() factory behavior with environment variables and options', () => {
  const origType = process.env.STORAGE_TYPE;
  try {
    resetStorage();

    // 1. Default to local when STORAGE_TYPE unset
    delete process.env.STORAGE_TYPE;
    const defaultAdapter = getStorage();
    assert.equal(defaultAdapter.kind, 'local');
    assert.ok(defaultAdapter instanceof LocalStorageAdapter);

    // 2. Cached instance returned when env remains the same
    const cached = getStorage();
    assert.strictEqual(cached, defaultAdapter);

    // 3. STORAGE_TYPE=s3 returns S3StorageAdapter
    process.env.STORAGE_TYPE = 's3';
    const s3Adapter = getStorage();
    assert.equal(s3Adapter.kind, 's3');
    assert.ok(s3Adapter instanceof S3StorageAdapter);

    // 4. STORAGE_TYPE=local returns LocalStorageAdapter
    process.env.STORAGE_TYPE = 'local';
    const localAdapter = getStorage();
    assert.equal(localAdapter.kind, 'local');
    assert.ok(localAdapter instanceof LocalStorageAdapter);

    // 5. Explicit options take precedence
    const explicitS3 = getStorage({ type: 's3', bucket: 'custom-b', forceNew: true });
    assert.equal(explicitS3.kind, 's3');
    assert.equal(explicitS3.bucket, 'custom-b');

    // 6. setStorage override
    const mockStorage = { kind: 'mock', put: async () => {} };
    setStorage(mockStorage);
    assert.strictEqual(getStorage(), mockStorage);
  } finally {
    if (origType !== undefined) {
      process.env.STORAGE_TYPE = origType;
    } else {
      delete process.env.STORAGE_TYPE;
    }
    resetStorage();
  }
});

test('Integration with drive.js and ingest/storage.js', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nora-integration-'));
  const origDriveUrl = process.env.DRIVE_SCRIPT_URL;
  const origStorageType = process.env.STORAGE_TYPE;
  const origLocalDir = process.env.STORAGE_LOCAL_DIR;

  try {
    process.env.STORAGE_LOCAL_DIR = tmpDir;
    process.env.STORAGE_TYPE = 'local';
    delete process.env.DRIVE_SCRIPT_URL;
    resetStorage();

    const { archiveToDrive, retrieveFile } = await import('../drive.js');
    const { storage, setStorage: setIngestStorage } = await import('../ingest/storage.js');
    const { db } = await import('../db.js');

    // Insert dummy document
    const insertRes = db.prepare('INSERT INTO documents (name, type, size, chars, content) VALUES (?, ?, ?, ?, ?)').run(
      'تقرير_الاستثمار.pdf',
      'application/pdf',
      1024,
      50,
      'محتوى تقرير الاستثمار للربع الأول'
    );
    const docId = Number(insertRes.lastInsertRowid);
    const doc = { id: docId, name: 'تقرير_الاستثمار.pdf' };
    const buffer = Buffer.from('PDF_DUMMY_BINARY_DATA');

    // 1. archiveToDrive uses getStorage() when DRIVE_SCRIPT_URL is not set
    const archiveRes = await archiveToDrive(doc, buffer, 'application/pdf');
    assert.equal(archiveRes.drive, true);
    assert.ok(archiveRes.url);
    assert.equal(archiveRes.key, `documents/${docId}/تقرير_الاستثمار.pdf`);

    // Check DB row updated
    const row = db.prepare('SELECT category, drive_id, drive_url FROM documents WHERE id=?').get(docId);
    assert.ok(row.category);
    assert.equal(row.drive_id, `documents/${docId}/تقرير_الاستثمار.pdf`);
    assert.equal(row.drive_url, archiveRes.url);

    // 2. retrieveFile retrieves the stored buffer
    const retrievedBuf = await retrieveFile(docId);
    assert.ok(Buffer.isBuffer(retrievedBuf));
    assert.deepEqual(retrievedBuf, buffer);

    // 3. ingest/storage.js uses getStorage() when DRIVE_SCRIPT_URL is not set
    setIngestStorage(null);
    const activeIngestStorage = storage();
    assert.equal(activeIngestStorage.kind, 'local');

    const pkgRes = await activeIngestStorage.putJSON('packages/pkg1.json', { ok: true });
    assert.equal(pkgRes.id, 'packages/pkg1.json');
    const pkgData = await activeIngestStorage.getJSON('packages/pkg1.json');
    assert.deepEqual(pkgData, { ok: true });

    // 4. Backward-compatibility: When DRIVE_SCRIPT_URL is provided and STORAGE_TYPE != s3, DriveStorage is returned
    process.env.DRIVE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby.../exec';
    setIngestStorage(null);
    const driveStorageInstance = storage();
    assert.equal(driveStorageInstance.kind, 'drive');

    // 5. When STORAGE_TYPE=s3, getStorage() is used even if DRIVE_SCRIPT_URL is present
    process.env.STORAGE_TYPE = 's3';
    setIngestStorage(null);
    const s3StorageInstance = storage();
    assert.equal(s3StorageInstance.kind, 's3');
  } finally {
    if (origDriveUrl !== undefined) process.env.DRIVE_SCRIPT_URL = origDriveUrl;
    else delete process.env.DRIVE_SCRIPT_URL;

    if (origStorageType !== undefined) process.env.STORAGE_TYPE = origStorageType;
    else delete process.env.STORAGE_TYPE;

    if (origLocalDir !== undefined) process.env.STORAGE_LOCAL_DIR = origLocalDir;
    else delete process.env.STORAGE_LOCAL_DIR;

    resetStorage();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
