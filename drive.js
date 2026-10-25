// أرشيف «ملفات نورة» في Google Drive حق فواز (عن طريق Apps Script يشتغل باسمه)
// كل ملف يترفع: نصنّفه بالذكاء الاصطناعي، نحفظه في مجلد تصنيفه، ونخزّن رابطه عندنا عشان نورة ترجّعه وقت الطلب.
import { db } from './db.js';
import { generate } from './history.js';
import { snapshotSoon } from './persist.js';

export const CATEGORIES = ['المالية والميزانيات', 'العقود والمشتريات', 'المشاريع والمتابعة', 'التقارير والعروض', 'الموارد البشرية', 'أخرى'];
const URL_ = () => process.env.DRIVE_SCRIPT_URL;
export const driveReady = () => !!URL_();

for (const [c, t] of [['category', 'TEXT'], ['drive_id', 'TEXT'], ['drive_url', 'TEXT'], ['summary', 'TEXT']])
  if (!db.prepare('PRAGMA table_info(documents)').all().some(x => x.name === c)) db.exec(`ALTER TABLE documents ADD COLUMN ${c} ${t}`);

async function call(body) {
  const r = await fetch(URL_(), { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(body), redirect: 'follow' });
  const t = await r.text();
  try { return JSON.parse(t); } catch { throw new Error('Drive: رد غير متوقع ' + t.slice(0, 120)); }
}

async function classify(name, text) {
  const out = await generate(`صنّف هذا الملف في واحد من التصنيفات بالضبط: ${CATEGORIES.join(' | ')}.
واكتب وصف قصير (سطر واحد) يساعد البحث عنه لاحقاً. رجّع JSON: {"category": "...", "summary": "..."}
اسم الملف: ${name}
بداية المحتوى:
${String(text || '').slice(0, 3000)}`).catch(() => null);
  return { category: CATEGORIES.includes(out?.category) ? out.category : 'أخرى', summary: String(out?.summary || '').slice(0, 300) };
}

// يشتغل بالخلفية بعد الرفع (ما يأخّر بناء الداشبورد)
export async function archiveToDrive(doc, buffer, mime) {
  const { category, summary } = await classify(doc.name, db.prepare('SELECT content FROM documents WHERE id=?').get(doc.id)?.content);
  db.prepare('UPDATE documents SET category=?, summary=? WHERE id=?').run(category, summary, doc.id);
  if (!driveReady()) { snapshotSoon(); return { category, drive: false }; }
  const r = await call({ action: 'upload', name: doc.name, mime, category, description: summary, data: buffer.toString('base64') });
  if (!r.ok) throw new Error(r.error || 'Drive upload failed');
  db.prepare('UPDATE documents SET drive_id=?, drive_url=? WHERE id=?').run(r.file.id, r.file.url, doc.id);
  snapshotSoon();
  console.log(`[drive] doc #${doc.id} → ${category} (${r.file.id})`);
  return { category, drive: true, url: r.file.url };
}

export const driveTools = {
  find_files: {
    declaration: {
      name: 'find_files',
      description: `تدوّر على ملفات فواز المؤرشفة في Google Drive («ملفات نورة») بالاسم أو الموضوع أو التصنيف، وترجّع رقم الملف وتصنيفه ورابطه في Drive.
التصنيفات: ${CATEGORIES.join('، ')}. استخدميها لما يقول «جيبي/وين ملف كذا» أو «وش عندي ملفات مالية». بعدها تقدرين تفتحين الرابط بـ open_app (url) أو تجاوبين من محتواه بـ read_document برقمه.`,
      parameters: { type: 'OBJECT', properties: { query: { type: 'STRING', description: 'كلمة من الاسم أو الموضوع (اختياري)' }, category: { type: 'STRING', enum: CATEGORIES } } },
    },
    run: async ({ query = '', category } = {}) => {
      let rows = db.prepare('SELECT id, name, category, summary, drive_url, uploaded_at FROM documents ORDER BY id DESC').all();
      if (category) rows = rows.filter(r => r.category === category);
      if (query) { const q = query.trim(); rows = rows.filter(r => [r.name, r.summary, r.category].some(v => String(v || '').includes(q))); }
      return { drive_connected: driveReady(), count: rows.length, files: rows.slice(0, 25) };
    },
  },
};

export async function driveSetup() { return driveReady() ? call({ action: 'setup' }) : { ok: false, error: 'DRIVE_SCRIPT_URL غير مضبوط' }; }
