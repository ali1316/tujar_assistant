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

// ===== Task 2: الاسترجاع الآمن والوضع المحمي =====
const Pz = await import('../persist.js');
const { db } = await import('../db.js');
db.exec('CREATE TABLE IF NOT EXISTS agent_jobs (id INTEGER PRIMARY KEY, status TEXT)'); // يُنشأ عادةً في agent.js
const count = t => db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n;
const snap = () => Object.fromEntries(Pz.TABLES.map(t => [t, db.prepare(`SELECT * FROM ${t}`).all()]));
const reset = () => { Pz.persistState.protected = false; Pz.persistState.reason = ''; };

test('malformed snapshot → protected, nothing applied', async () => {
  reset(); const before = count('projects');
  const good = snap(); good.projects = [];
  const get = async k => k === 'sqlite:tickets' ? {} : good[k.slice(7)];
  await Pz.restore({ get, wait: () => 0, enabled: true });
  assert.equal(Pz.persistState.protected, true);
  assert.equal(count('projects'), before);
});
test('get throws 3 times → protected after 3 attempts', async () => {
  reset(); let calls = 0;
  await Pz.restore({ get: async () => { calls++; throw new Error('pg down'); }, wait: () => 0, enabled: true });
  assert.equal(Pz.persistState.protected, true);
  assert.match(Pz.persistState.reason, /pg down/);
  assert.equal(calls, 3);
});
test('valid snapshots apply atomically', async () => {
  reset(); const data = snap(); const n = data.projects.length; data.projects = data.projects.slice(0, 1);
  await Pz.restore({ get: async k => data[k.slice(7)], wait: () => 0, enabled: true, set: async () => {} });
  assert.equal(Pz.persistState.protected, false);
  assert.equal(count('projects'), Math.min(1, n));
});
test('snapshot is a no-op while protected', async () => {
  reset(); Pz.persistState.protected = true; let wrote = 0;
  await Pz.snapshot({ set: async () => { wrote++; }, enabled: true });
  assert.equal(wrote, 0);
  reset(); await Pz.snapshot({ set: async () => { wrote++; }, enabled: true });
  assert.equal(wrote, Pz.TABLES.length);
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
