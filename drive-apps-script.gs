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
function doGet() { return out_({ ok: true, service: 'nora-drive', root: root_().getUrl() }); }
