// فحص نصوص التعليمات: لا سكربت لهجة (Gemini Live وElevenLabs فيها اللهجة أصلاً)، ولا قواعد أدوات متناقضة
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const src = ['server.js', 'personas.js', 'agent.js'].map(f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8')).join('\n');
// كل النص ما عدا التعليقات (السطور اللي تبدأ بـ // والتعليق في آخر السطر بعد «; //»)
const prompts = src.split('\n').filter(l => !/^\s*\/\//.test(l)).map(l => l.replace(/;\s*\/\/.*$/, ';')).join('\n');

test('no dialect scripting in prompts', () => {
  for (const w of ['بالمية', 'الساعة تسع ونص', 'اللهجة', 'لهجة', 'حجازي', 'جداوية', 'نبرة سعودية', 'أبشر', 'إيوه', 'اثنعش', 'تسعمية', 'غُرْفة'])
    assert.ok(!prompts.includes(w), `prompt still scripts dialect: «${w}»`);
});
test('no contradictory legacy-tool rule for processed PDFs', () => {
  assert.ok(!prompts.includes('حتى لو آخر ملف مرفوع PDF'), 'line tells Nora to use data_chart for PDFs, contradicting the pdf_* rule');
});
test('say_script keeps numbers as written (no dialect number words or forced tashkeel)', async () => {
  const { sayScript } = await import('../speech.js');
  const s = sayScript('', ['غرفة مكة: 753,974 ريال · 12%']);
  assert.ok(s.includes('753,974'), s);
  assert.ok(!/ألف|مية|غُرْف/.test(s), s);
});

test('screen guards accept pdf_* tools (PDF answers were pushed to legacy tools)', async () => {
  const G = await import('../text-guard.js');
  for (const t of ['pdf_metric', 'pdf_get_table', 'pdf_find_value']) assert.ok(G.isDataTool(t), t);
  assert.ok(G.isVisualTool('pdf_dashboard') && G.isDashboardTool('pdf_dashboard') && G.isDashboardTool('build_dashboard'));
  assert.ok(!G.isVisualTool('pdf_metric'));
});
test('ambiguous short dataset id across documents is refused, not guessed', async () => {
  const { matchDatasets } = await import('../ingest/query.js');
  const list = [{ ds: { id: 'pdf-a@v1#ds01', title: 'أ' }, doc: 'A' }, { ds: { id: 'pdf-b@v2#ds01', title: 'ب' }, doc: 'B' }];
  const r = matchDatasets(list, 'ds01');
  assert.equal(r.hit, null); assert.deepEqual(r.ambiguous, ['pdf-a@v1#ds01', 'pdf-b@v2#ds01']);
  assert.equal(matchDatasets(list, 'pdf-b@v2#ds01').hit.ds.id, 'pdf-b@v2#ds01');
  assert.equal(matchDatasets([list[0]], 'ds01').hit.ds.id, 'pdf-a@v1#ds01');
});
