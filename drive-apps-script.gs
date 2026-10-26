// «ملفات نورة» — جسر بين نورة و Google Drive حق فواز
// يشتغل باسم فواز (Execute as: Me) ويحفظ الملفات داخل مجلد «ملفات نورة» فقط، كل ملف في تصنيفه.
const ROOT_NAME = 'ملفات نورة';
const CATEGORIES = ['المالية والميزانيات', 'العقود والمشتريات', 'المشاريع والمتابعة', 'التقارير والعروض', 'الموارد البشرية', 'أخرى'];

function root_() {
  const it = DriveApp.getFoldersByName(ROOT_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(ROOT_NAME);
}
function folder_(cat) {
  const r = root_();
  const name = CATEGORIES.indexOf(cat) >= 0 ? cat : 'أخرى';
  const it = r.getFoldersByName(name);
  return it.hasNext() ? it.next() : r.createFolder(name);
}
function info_(f, cat) {
  return { id: f.getId(), name: f.getName(), url: f.getUrl(), category: cat, size: f.getSize(), mime: f.getMimeType(), created: f.getDateCreated() };
}
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function doPost(e) {
  try {
    const q = JSON.parse(e.postData.contents);
    const ing = ingest_(q); if (ing) return out_(ing);
    if (q.action === 'setup') { CATEGORIES.forEach(folder_); return out_({ ok: true, root: root_().getUrl() }); }
    if (q.action === 'upload') {
      const blob = Utilities.newBlob(Utilities.base64Decode(q.data), q.mime || 'application/octet-stream', q.name);
      const f = folder_(q.category).createFile(blob);
      if (q.description) f.setDescription(q.description);
      return out_({ ok: true, file: info_(f, q.category) });
    }
    if (q.action === 'list') {
      const res = [];
      const cats = q.category ? [q.category] : CATEGORIES;
      cats.forEach(c => {
        const files = folder_(c).getFiles();
        while (files.hasNext() && res.length < 200) {
          const f = files.next();
          if (!q.query || f.getName().indexOf(q.query) >= 0 || (f.getDescription() || '').indexOf(q.query) >= 0) res.push(info_(f, c));
        }
      });
      res.sort((a, b) => new Date(b.created) - new Date(a.created));
      return out_({ ok: true, root: root_().getUrl(), files: res });
    }
    return out_({ ok: false, error: 'unknown action' });
  } catch (err) { return out_({ ok: false, error: String(err) }); }
}

// ===== مسار مصادر PDF (nora-ingest/1): مجلد لكل مستند، ومجلد لكل إصدار. الملفات خاصة (بدون مشاركة عامة). =====
function iroot_(name) { const it = DriveApp.getFoldersByName(name); return it.hasNext() ? it.next() : DriveApp.createFolder(name); }
function child_(parent, seg, label, create) {
  const it = parent.getFolders();
  while (it.hasNext()) { const f = it.next(), n = f.getName(); if (n === seg || n.indexOf(seg + ' — ') === 0) return f; }
  return create ? parent.createFolder(label ? seg + ' — ' + label : seg) : null;
}
function walk_(q, create) {
  let f = iroot_(q.root || 'نورة — مصادر PDF');
  const labels = q.labels || {};
  for (let i = 0; i < (q.path || []).length; i++) { f = child_(f, q.path[i], labels[i], create); if (!f) return null; }
  return f;
}
function fileIn_(folder, name) { const it = folder.getFilesByName(name); return it.hasNext() ? it.next() : null; }
function finfo_(f) { return { id: f.getId(), name: f.getName(), url: f.getUrl(), size: f.getSize(), mime: f.getMimeType(), updated: f.getLastUpdated() }; }
function ingest_(q) {
  if (q.action === 'dir') { const f = walk_(q, true); return { ok: true, folder: { id: f.getId(), url: f.getUrl(), name: f.getName() } }; }
  if (q.action === 'put') {
    const folder = walk_(q, true);
    const old = fileIn_(folder, q.name);
    if (q.text != null && old && old.getMimeType().indexOf('google-apps') < 0) { old.setContent(q.text); return { ok: true, file: finfo_(old), replaced: true }; }
    const blob = q.text != null ? Utilities.newBlob(q.text, q.mime || 'text/plain', q.name) : Utilities.newBlob(Utilities.base64Decode(q.data), q.mime || 'application/octet-stream', q.name);
    const f = folder.createFile(blob);
    if (old) old.setTrashed(true);
    return { ok: true, file: finfo_(f) };
  }
  if (q.action === 'get') {
    const folder = walk_(q, false); const f = folder && fileIn_(folder, q.name);
    if (!f) return { ok: false, error: 'not found' };
    return { ok: true, file: finfo_(f), data: Utilities.base64Encode(f.getBlob().getBytes()) };
  }
  if (q.action === 'ls') {
    const folder = walk_(q, false); if (!folder) return { ok: true, items: [] };
    const items = []; const fs = folder.getFiles(); while (fs.hasNext()) items.push(finfo_(fs.next()));
    const ds = folder.getFolders(); while (ds.hasNext()) { const d = ds.next(); items.push({ id: d.getId(), name: d.getName(), url: d.getUrl(), dir: true }); }
    return { ok: true, items: items };
  }
  if (q.action === 'getById') {
    const f = DriveApp.getFileById(q.id);
    return { ok: true, name: f.getName(), mime: f.getMimeType(), url: f.getUrl(), size: f.getSize(), data: Utilities.base64Encode(f.getBlob().getBytes()) };
  }
  return null;
}

function doGet() { return out_({ ok: true, service: 'nora-drive', root: root_().getUrl() }); }
