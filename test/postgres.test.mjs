// test/postgres.test.mjs - Verification of PostgreSQL schema, client interface, and migration
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PG_SCHEMA, SQLITE_SCHEMA, SEED_PROJECTS, SEED_TICKETS } from '../schema.js';
import { db, toPgSql, getBackend } from '../db.js';
import { persistState, snapshot, snapshotSoon, restore, pendingSnapshot } from '../persist.js';
import {
  kvGet,
  kvSet,
  memAdd,
  memAll,
  memDelete,
  dashAdd,
  dashGet,
  chatStart,
  chatAppend,
  chatTurns,
  datasetAdd,
  datasetGet,
} from '../store.js';

test('PostgreSQL schema contains all 12 core domain entities', () => {
  const coreEntities = [
    'projects',
    'tickets',
    'dev_requests',
    'documents',
    'tasks',
    'agent_jobs',
    'datasets',
    'memories',
    'dashboards',
    'chat_sessions',
    'chat_turns',
    'doc_chunks',
  ];

  for (const entity of coreEntities) {
    const tableRegex = new RegExp(`CREATE TABLE IF NOT EXISTS ${entity}\\b`, 'i');
    assert.ok(tableRegex.test(PG_SCHEMA), `Missing table: ${entity} in PG_SCHEMA`);
  }
});

test('PostgreSQL schema contains MIGRATION.md ingest entities and supporting tables', () => {
  const extraEntities = [
    'kv',
    'settings',
    'rag_chunks',
    'ingest_document',
    'ingest_version',
    'ingest_job',
    'ingest_dataset',
    'ingest_value',
    'ingest_lineage',
  ];

  for (const entity of extraEntities) {
    const tableRegex = new RegExp(`CREATE TABLE IF NOT EXISTS ${entity}\\b`, 'i');
    assert.ok(tableRegex.test(PG_SCHEMA), `Missing table: ${entity} in PG_SCHEMA`);
  }
});

test('Seed data is populated for projects and tickets', () => {
  assert.ok(SEED_PROJECTS.length >= 5);
  assert.ok(SEED_TICKETS.length >= 6);
  assert.equal(SEED_PROJECTS[0][0], 'بوابة الخدمات الإلكترونية');
});

test('toPgSql query transformation', () => {
  assert.equal(toPgSql('SELECT * FROM kv WHERE key=?'), 'SELECT * FROM kv WHERE key=$1');
  assert.equal(
    toPgSql('SELECT * FROM projects WHERE status=? AND budget > ?'),
    'SELECT * FROM projects WHERE status=$1 AND budget > $2'
  );
  assert.equal(
    toPgSql("UPDATE tasks SET updated_at=datetime('now') WHERE id=?"),
    'UPDATE tasks SET updated_at=now() WHERE id=$1'
  );
  // Preserves existing $1, $2 placeholders
  assert.equal(
    toPgSql('SELECT value FROM kv WHERE key=$1'),
    'SELECT value FROM kv WHERE key=$1'
  );
});

test('Decommissioned persist.js stubs operate safely without throwing', async () => {
  assert.equal(persistState.protected, false);
  assert.equal(persistState.ready, true);
  assert.equal(pendingSnapshot(), false);
  await snapshot();
  snapshotSoon();
  await restore();
  assert.equal(persistState.protected, false);
});

test('Store operations function correctly through native storage', async () => {
  // KV test
  const testVal = { hello: 'world', time: Date.now() };
  await kvSet('test:pg_migration', testVal);
  const fetched = await kvGet('test:pg_migration');
  assert.deepEqual(fetched, testVal);

  // Memory test
  const memId = await memAdd({ content: 'test memory fact', category: 'fact' });
  assert.ok(memId);
  const mems = await memAll();
  assert.ok(mems.some(m => m.id === memId && m.content === 'test memory fact'));
  await memDelete(memId);

  // Dashboard test
  const dashId = await dashAdd('test dashboard', { charts: [] });
  assert.ok(dashId);
  const dash = await dashGet(dashId);
  assert.equal(dash.title, 'test dashboard');

  // Chat session and turns test
  const sessionId = await chatStart();
  assert.ok(sessionId);
  await chatAppend(sessionId, [{ role: 'user', text: 'مرحبا' }]);
  const turns = await chatTurns(sessionId);
  assert.ok(turns.some(t => t.text === 'مرحبا'));

  // Dataset test
  const dsId = await datasetAdd({
    doc_id: 99,
    doc_name: 'test.xlsx',
    sheet: 'Sheet1',
    columns: ['id', 'name'],
    rows: [[1, 'A'], [2, 'B']],
    profile: { rows: 2 },
  });
  assert.ok(dsId);
  const ds = await datasetGet(dsId);
  assert.equal(ds.doc_name, 'test.xlsx');
  assert.equal(ds.rows.length, 2);
});

test('Database interface provides unified methods across backends', async () => {
  const backendName = getBackend();
  assert.ok(['postgres', 'sqlite'].includes(backendName));

  const projects = await db.all('SELECT * FROM projects');
  assert.ok(Array.isArray(projects));

  const project = await db.get('SELECT * FROM projects WHERE id=?', [1]);
  assert.ok(project && project.id === 1);

  const res = await db.query('SELECT COUNT(*) c FROM projects');
  assert.ok(Number(res.rows[0].c) > 0);

  const stmt = db.prepare('SELECT id, name FROM projects ORDER BY id');
  const stmtRows = await stmt.all();
  assert.ok(stmtRows.length > 0);
  const first = await stmt.get();
  assert.ok(first && first.id);
});
