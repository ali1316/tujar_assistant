// أرشيف «ملفات نورة» في Google Drive حق فواز (عن طريق Apps Script يشتغل باسمه) أو التخزين السحابي/المحلي
// كل ملف يترفع: نصنّفه بالذكاء الاصطناعي، نحفظه في مجلد تصنيفه، ونخزّن رابطه عندنا عشان نورة ترجّعه وقت الطلب.
import dns from 'node:dns';
import { db } from './db.js';
import { generate } from './history.js';
import { getStorage } from './src/storage/storage-adapter.js';

try { dns.setDefaultResultOrder('ipv4first'); } catch {}

export const CATEGORIES = ['المالية والميزانيات', 'العقود والمشتريات', 'المشاريع والمتابعة', 'التقارير والعروض', 'الموارد البشرية', 'أخرى'];
const URL_ = () => process.env.DRIVE_SCRIPT_URL;
export const driveReady = () => !!URL_();

for (const [c, t] of [['category', 'TEXT'], ['drive_id', 'TEXT'], ['drive_url', 'TEXT'], ['summary', 'TEXT']]) {
  try {
    if (!db.prepare('PRAGMA table_info(documents)').all().some(x => x.name === c)) db.exec(`ALTER TABLE documents ADD COLUMN ${c} ${t}`);
  } catch {}
}

export async function callDriveApi(body, { timeout = 35000 } = {}) {
  if (!driveReady()) throw new Error('DRIVE_SCRIPT_URL غير مضبوط');
  const r = await fetch(URL_(), {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: JSON.stringify(body),
    redirect: 'follow',
    signal: AbortSignal.timeout(timeout),
  });
  const t = await r.text();
  try { return JSON.parse(t); } catch { throw new Error('Drive: رد غير متوقع ' + t.slice(0, 120)); }
}
const call = callDriveApi;

export async function classify(name, text) {
  const out = await generate(`صنّف هذا الملف في واحد من التصنيفات بالضبط: ${CATEGORIES.join(' | ')}.
واكتب وصف قصير (سطر واحد) يساعد البحث عنه لاحقاً. رجّع JSON: {"category": "...", "summary": "..."}
اسم الملف: ${name}
بداية المحتوى:
${String(text || '').slice(0, 3000)}`).catch(() => null);
  return { category: CATEGORIES.includes(out?.category) ? out.category : 'أخرى', summary: String(out?.summary || '').slice(0, 300) };
}

// يشتغل بالخلفية بعد الرفع (ما يأخّر بناء الداشبورد)
export async function archiveToDrive(doc, buffer, mime) {
  const docRow = await db.prepare('SELECT content, drive_id, drive_url, category FROM documents WHERE id=?').get(doc.id);
  if (docRow?.drive_id) {
    console.log(`[drive] doc #${doc.id} already archived in Drive (${docRow.drive_id})`);
    return { category: docRow.category || 'أخرى', drive: true, url: docRow.drive_url, drive_id: docRow.drive_id };
  }

  const { category, summary } = await classify(doc.name, docRow?.content);
  await db.prepare('UPDATE documents SET category=?, summary=? WHERE id=?').run(category, summary, doc.id);

  // If DRIVE_SCRIPT_URL is provided and STORAGE_TYPE is not 's3', use Google Drive webhook
  const useDriveWebhook = process.env.STORAGE_TYPE !== 's3' && driveReady();
  if (useDriveWebhook) {
    const r = await call({ action: 'upload', name: doc.name, mime, category, description: summary, data: buffer.toString('base64') });
    if (!r.ok) throw new Error(r.error || 'Drive upload failed');
    await db.prepare('UPDATE documents SET drive_id=?, drive_url=? WHERE id=?').run(r.file.id, r.file.url, doc.id);
    console.log(`[drive] doc #${doc.id} → ${category} (${r.file.id})`);
    return { category, drive: true, url: r.file.url };
  }

  // When STORAGE_TYPE=s3 or when DRIVE_SCRIPT_URL is not set, use getStorage()
  const storage = getStorage();
  const key = `documents/${doc.id}/${doc.name}`;
  const r = await storage.put(key, buffer, mime);
  await db.prepare('UPDATE documents SET drive_id=?, drive_url=? WHERE id=?').run(r.key, r.url, doc.id);
  console.log(`[storage] doc #${doc.id} → ${category} (${r.key})`);
  return { category, drive: true, url: r.url, key: r.key, storage: r };
}

export async function retrieveFile(docIdOrKey) {
  const storage = getStorage();
  const row = await db.prepare('SELECT id, name, drive_id, drive_url FROM documents WHERE id=? OR drive_id=?').get(docIdOrKey, docIdOrKey);
  if (row) {
    if (row.drive_id && await storage.exists(row.drive_id)) {
      return await storage.get(row.drive_id);
    }
    const defaultKey = `documents/${row.id}/${row.name}`;
    if (await storage.exists(defaultKey)) {
      return await storage.get(defaultKey);
    }
    if (process.env.STORAGE_TYPE !== 's3' && driveReady() && row.drive_id) {
      const r = await call({ action: 'getById', id: row.drive_id });
      if (r.ok && r.data) return Buffer.from(r.data, 'base64');
    }
  }

  if (await storage.exists(String(docIdOrKey))) {
    return await storage.get(String(docIdOrKey));
  }
  return null;
}

export async function retrieveFileStream(docIdOrKey) {
  const storage = getStorage();
  const row = await db.prepare('SELECT id, name, drive_id, drive_url FROM documents WHERE id=? OR drive_id=?').get(docIdOrKey, docIdOrKey);
  const key = row?.drive_id || (row ? `documents/${row.id}/${row.name}` : String(docIdOrKey));
  return await storage.getStream(key);
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
      let rows = await db.prepare('SELECT id, name, category, summary, drive_url, uploaded_at FROM documents ORDER BY id DESC').all();
      if (category) rows = rows.filter(r => r.category === category);
      if (query) { const q = query.trim(); rows = rows.filter(r => [r.name, r.summary, r.category].some(v => String(v || '').includes(q))); }
      return { drive_connected: driveReady() || process.env.STORAGE_TYPE === 's3' || !URL_(), count: rows.length, files: rows.slice(0, 25) };
    },
  },
};

export async function driveSetup() { return driveReady() ? call({ action: 'setup' }) : { ok: false, error: 'DRIVE_SCRIPT_URL غير مضبوط' }; }
