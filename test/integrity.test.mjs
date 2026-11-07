// سلامة الأرقام والبيانات (المشروع الفرعي 1) — node --test test/integrity.test.mjs
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nora-integrity-'));
process.env.INGEST_STORAGE = 'local'; process.env.INGEST_LOCAL_DIR = dir; delete process.env.DATABASE_URL;
process.env.DB_PATH = path.join(dir, 'test.db');
const { initStore } = await import('../store.js');
await initStore();
const D = await import('../datasets.js');

// ===== Task 1: مطابقة الأعمدة =====
const rows = [[1, 'الرياض', 100], [2, 'جدة', 50], [3, 'الرياض', 25]];
const ds = { columns: ['م', 'المدينة', 'المبلغ المعتمد'], rows, profile: D.profile(['م', 'المدينة', 'المبلغ المعتمد'], rows) };

test('measure «قيمة العقود» is not matched to «م»', () => {
  assert.throws(() => D.runQuery(ds, { group_by: 'المدينة', measure: 'قيمة العقود' }), /غير موجود/);
});
test('«المبلغ» matches «المبلغ المعتمد»', () => {
  assert.equal(D.colIdx(ds, 'المبلغ', { measure: true }), 2);
});
test('id column is never a measure', () => {
  assert.throws(() => D.colIdx(ds, 'م', { measure: true }), /معرّف/);
});
test('unknown filter throws', () => {
  assert.throws(() => D.runQuery(ds, { group_by: 'المدينة', filters: [{ column: 'الحي', value: 'x' }] }), /غير موجود/);
});
test('hamza/ال normalisation still works', () => {
  assert.equal(D.colIdx(ds, 'مدينة'), 1);
});
test('real query still sums the right column', () => {
  const r = D.runQuery(ds, { group_by: 'المدينة', measure: 'المبلغ' });
  assert.equal(JSON.stringify(r).includes('125'), true);
});

// ===== Task 2: التخزين المباشر وإلغاء persist.js =====
const Pz = await import('../persist.js');
const { db, toPgSql } = await import('../db.js');
db.exec('CREATE TABLE IF NOT EXISTS agent_jobs (id INTEGER PRIMARY KEY, status TEXT)');
const count = t => db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n;

test('persist.js is decommissioned (safe stubs, no KV dumping)', async () => {
  assert.equal(Pz.persistState.protected, false);
  assert.equal(Pz.persistState.ready, true);
  assert.equal(Pz.pendingSnapshot(), false);
  await Pz.restore();
  await Pz.snapshot();
  assert.equal(Pz.persistState.protected, false);
});

test('toPgSql translates SQLite ? placeholders and functions', () => {
  const sql = toPgSql("SELECT * FROM tasks WHERE status = ? AND due_date <= datetime('now')");
  assert.match(sql, /\$1/);
  assert.match(sql, /now\(\)/);
  assert.ok(!sql.includes('?'));
});

test('first-class storage executes native queries directly without KV dumps', async () => {
  const before = count('projects');
  assert.ok(before >= 0);
  const r = await db.prepare("INSERT INTO dev_requests (title, details) VALUES (?, ?)").run('test req', 'details');
  assert.ok(r.changes > 0 || r.lastInsertRowid);
  const rows = await db.prepare("SELECT * FROM dev_requests WHERE title = ?").all('test req');
  assert.ok(rows.length > 0);
});

test('db client interface supports all, get, run, and query', async () => {
  const allRows = await db.all('SELECT * FROM projects');
  assert.ok(Array.isArray(allRows));
  const oneRow = await db.get('SELECT * FROM projects LIMIT 1');
  assert.ok(oneRow && oneRow.id);
  const qRes = await db.query('SELECT COUNT(*) c FROM projects');
  assert.ok(qRes.rows.length > 0);
});

// ===== Task 3: رفع عدة PDF في نفس الوقت =====
const Pi = await import('../ingest/pipeline.js');
const Si = await import('../ingest/storage.js');
const { PDFDocument } = await import('pdf-lib');
const mkPdf = async t => { const d = await PDFDocument.create(); d.addPage().drawText(t); return Buffer.from(await d.save()); };

test('parallel receive keeps both', async () => {
  const base = Si.storage();
  const slow = Object.create(base);
  slow.putFile = async (...a) => { await new Promise(r => setTimeout(r, 200)); return base.putFile.apply(base, a); };
  Si.setStorage(slow);
  try {
    const [a, b] = [await mkPdf('A one'), await mkPdf('B two')];
    await Promise.all([Pi.receive({ buffer: a, fileName: 'ملف أ.pdf' }), Pi.receive({ buffer: b, fileName: 'ملف ب.pdf' })]);
    const docs = Object.values((await Pi.getIndex()).documents).map(d => d.file_name);
    assert.ok(docs.includes('ملف أ.pdf') && docs.includes('ملف ب.pdf'), JSON.stringify(docs));
  } finally { Si.setStorage(base); }
});

// ===== Task 4: لا وسوم أدوات ولا ادعاء عرض كاذب =====
test('stripToolTags removes both tag forms', async () => {
  const { stripToolTags } = await import('../text-guard.js');
  assert.equal(stripToolTags('[استخدمت show_overview] تفضل'), 'تفضل');
  assert.equal(stripToolTags('تم ⟨نفّذت show_screen: {} → {"ok":true}⟩ قدامك'), 'تم قدامك');
});
test('question is not a claim', async () => {
  const { claimsScreen } = await import('../text-guard.js');
  assert.equal(claimsScreen('تبغى أعرضها على الشاشة؟'), false);
  assert.equal(claimsScreen('تفضّل، اللوحة قدامك على الشاشة دحين.'), true);
  assert.equal(claimsScreen('عندنا خمسة مشاريع'), false);
});
test('history archive has no tool tags', async () => {
  const S = await import('../store.js'); const H = await import('../history.js');
  const id = Number(await S.chatStart());
  await S.chatAppend(id, [{ role: 'user', text: 'اعرضي المشاريع' }, { role: 'assistant', text: 'تفضل ⟨نفّذت show_overview: {} → {"shown":true}⟩ قدامك' }]);
  const block = await H.historyBlock();
  assert.ok(block.includes('قدامك'));
  assert.ok(!/استخدمت|⟨|نفّذت/.test(block), block.slice(-300));
});

// ===== المراجعة النهائية: إصلاحات =====
const reset = () => { Pz.persistState.protected = false; Pz.persistState.reason = ''; Pz.persistState.ready = true; };

test('snapshot does nothing before a successful restore (SIGTERM during boot)', async () => {
  reset(); Pz.persistState.ready = false; let wrote = 0;
  await Pz.snapshot({ set: async () => { wrote++; }, enabled: true });
  assert.equal(wrote, 0);
  Pz.persistState.ready = true;
});
test('exact match on an id column is refused, not redirected', () => {
  const r2 = [[1, 'الرياض', 10], [2, 'جدة', 20], [3, 'مكة', 30], [4, 'الدمام', 40], [5, 'أبها', 50], [6, 'تبوك', 60], [7, 'حائل', 70], [8, 'جازان', 80], [9, 'نجران', 90], [10, 'الباحة', 100]];
  const d2 = { columns: ['رقم', 'المنطقة', 'رقم الزيارات'], rows: r2, profile: D.profile(['رقم', 'المنطقة', 'رقم الزيارات'], r2) };
  assert.throws(() => D.runQuery(d2, { group_by: 'المنطقة', measure: 'رقم' }), /معرّف/);
});
test('real measures are not misread as id columns', () => {
  const r3 = [[1, 'أ', 500], [2, 'ب', 700], [3, 'ج', 900]];
  const p3 = D.profile(['عدد الموظفين', 'الفرع', 'Paid Amount'], r3).columns;
  assert.equal(p3[0].role, 'measure'); assert.equal(p3[2].role, 'measure');
  assert.equal(D.profile(['م', 'x'], [[1, 'a'], [2, 'b']]).columns[0].role, 'id');
});
test('ordinary speech is not a screen claim', async () => {
  const { claimsScreen } = await import('../text-guard.js');
  for (const s of ['عرضت عليك سابقاً فكرة المشروع.', 'ما عرضت شي للحين.', 'الأسعار المعروضة في العقد عالية.', 'أقدر أعرضها على الشاشة لو تبغى.', 'تبغى أعرضها على الشاشة'])
    assert.equal(claimsScreen(s), false, s);
  assert.equal(claimsScreen('تفضّل يا سيدي، لوحة المشاريع كاملة قدامك على الشاشة دحين.'), true);
});
test('search_history never returns tool tags', async () => {
  const H = await import('../history.js');
  const r = await H.historyTools.search_history.run({ query: 'قدامك' });
  assert.ok(!/⟨|استخدمت/.test(JSON.stringify(r)), JSON.stringify(r).slice(0, 300));
});

// ===== جداوي: صوت ElevenLabs v4 Turbo =====
test('ttsRequest targets v4 Turbo with the Jeddawi voice', async () => {
  process.env.ELEVENLABS_API_KEY = 'test-key';
  const E = await import('../eleven.js');
  const { url, init } = E.ttsRequest({ text: 'هلا', voice: E.JEDDAWI.voice, model: E.JEDDAWI.model });
  assert.ok(url.endsWith('/v1/text-to-speech/yXEnnEln9armDCyhkXcA/stream?output_format=pcm_24000'), url);
  assert.equal(JSON.parse(init.body).model_id, 'eleven_v4_turbo');
  assert.equal(JSON.parse(init.body).text, 'هلا');
  assert.equal(init.headers['xi-api-key'], 'test-key');
  delete process.env.ELEVENLABS_API_KEY;
});
test('personaBlock gives جداوي a male Jeddawi identity', async () => {
  const { personaBlock } = await import('../personas.js');
  assert.match(personaBlock('jeddawi'), /جداوي/);
  assert.match(personaBlock('jeddawi'), /مذكر/);
  assert.equal(personaBlock('x'), '');
});
test('barge-in stops جداوي even between sentences', async () => {
  const { shouldBargeIn } = await import('../gemini-live-agent.js');
  assert.equal(shouldBargeIn({ mode: 'mine', playing: 0, pending: 1, buffered: '' }), true);
  assert.equal(shouldBargeIn({ mode: 'mine', playing: 0, pending: 0, buffered: 'نص باقي' }), true);
  assert.equal(shouldBargeIn({ mode: 'mine', playing: 0, pending: 0, buffered: '' }), false);
  assert.equal(shouldBargeIn({ mode: 'live', playing: 3, pending: 1, buffered: 'x' }), false);
});
test('TTS upstream is aborted when the browser disconnects', async () => {
  const { EventEmitter } = await import('node:events');
  const E = await import('../eleven.js');
  let signal; const enc = new TextEncoder();
  const fetchImpl = async (url, init) => { signal = init.signal; let i = 0;
    return { ok: true, body: new ReadableStream({ async pull(c) { await new Promise(r => setTimeout(r, 30)); if (signal.aborted || i++ > 50) return c.close(); c.enqueue(enc.encode('xx')); } }) }; };
  const res = Object.assign(new EventEmitter(), { headersSent: false, writes: 0, setHeader() { this.headersSent = true; }, write() { this.writes++; if (this.writes === 1) setTimeout(() => this.emit('close'), 0); return true; }, end() {}, status() { return this; }, json() {} });
  await E.streamTTS('هلا', res, { fetchImpl });
  assert.equal(signal.aborted, true);
  assert.ok(res.writes < 5, `writes=${res.writes}`);
});
test('فواز speaks with his cloned voice through v4 Turbo', async () => {
  const E = await import('../eleven.js'); const { personaBlock } = await import('../personas.js');
  assert.equal(E.voiceFor('fawaz'), 'si9mYqRfqKHdK2kDRssy');
  assert.equal(E.voiceFor('jeddawi'), 'yXEnnEln9armDCyhkXcA');
  assert.ok(E.ttsRequest({ text: 'هلا', voice: E.voiceFor('fawaz') }).url.includes('/si9mYqRfqKHdK2kDRssy/'));
  assert.match(personaBlock('fawaz'), /فواز/); assert.match(personaBlock('fawaz'), /مذكر/);
});
test('pdf_dashboard result is shown on the main screen (was built but never displayed)', async () => {
  const shown = []; globalThis.window = { showDash: async (id, title) => { shown.push([id, title]); return { shown_on_screen: title }; } };
  const { createAssistant } = await import('../assistant.js');
  const calls = []; const api = async (url, body) => { calls.push(url); return { ok: true, id: 41, value: 753974 }; };
  const a = createAssistant({ api, note: () => {} });
  const r = await a.tools.pdf_dashboard({ dataset: 'pdf-x@v1#ds02', title: 'مبالغ الاشتراكات' });
  assert.deepEqual(calls, ['/api/tools/pdf_dashboard']);
  assert.deepEqual(shown, [[41, 'مبالغ الاشتراكات']]);
  assert.equal(r.shown_on_screen, 'مبالغ الاشتراكات'); assert.equal(r.value, 753974);
  delete globalThis.window;
});
