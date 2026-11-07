import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import { db } from '../../db.js';
import { extractText, saveDocument } from '../../docs.js';
import { importBundle } from '../../knowledge.js';
import { ingestDocument } from '../../datasets.js';
import { ingestRoutes } from '../../ingest/index.js';
import { receive as ingestReceive } from '../../ingest/pipeline.js';
import { ensureIndex, invalidateIndex } from '../../retrieval.js';
import { archiveToDrive } from '../../drive.js';
import { uploadStep } from '../../events.js';
import { dashboardFromDocument } from '../../file-dash.js';

const router = Router();
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

// مسارات مسار الاستقبال التفصيلي لملفات PDF
ingestRoutes(router, upload);

export async function handleFileUpload(req, res) {
  if (!req.file) return res.status(400).json({ error: 'ما وصل ملف' });

  const name = Buffer.from(req.file.originalname, 'latin1').toString('utf8'); // أسماء عربية
  const trace = String(req.get('x-upload-trace') || '').replace(/[^\w-]/g, '').slice(0, 40); // رحلة الرفع في الواجهة
  const step = (s, info) => uploadStep(trace, s, info);
  step('received', { bytes: req.file.size, name });

  const digest = crypto.createHash('sha256').update(req.file.buffer).digest('hex');

  if (/\.dk\.json$/i.test(name)) {
    // حزمة من مهارة fawaz-data-intake → مكتبة المعرفة
    try {
      return res.json({ knowledge: await importBundle(JSON.parse(req.file.buffer.toString('utf8'))) });
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  }

  // ملفات PDF: مسار الاستقبال التفصيلي (مهمة خلفية قابلة للاستكمال، حزمة في Drive، تتبع لكل رقم)
  let ingest = null;
  if (/\.pdf$/i.test(name) || /pdf/i.test(req.file.mimetype)) {
    try {
      ingest = await ingestReceive({ buffer: req.file.buffer, fileName: name, mime: 'application/pdf' });
    } catch (e) {
      ingest = { error: e.message };
      console.warn('[ingest] receive failed:', e.message);
    }
  }

  const dup = await db.prepare('SELECT id, name, chars FROM documents WHERE sha256=?').get(digest);
  step('checked', { duplicate: !!dup });
  if (dup) return res.json({ ...dup, duplicate: true, datasets: [], ingest }); // نفس الملف بالبصمة: ما نكرره

  try {
    const text = await extractText(req.file.buffer, name);
    const doc = await saveDocument(name, req.file.mimetype, req.file.size, text);
    step('read', { chars: text.length });

    await db.prepare('UPDATE documents SET sha256=? WHERE id=?').run(digest, doc.id);
    invalidateIndex();
    setTimeout(() => ensureIndex().catch(e => console.warn('[rag]', e.message)), 4000); // بعد التصنيف (الملخص) بشوي

    // ملفات Excel/CSV: نحوّلها لجداول منظّمة جاهزة للتحليل والشارتات الفورية
    let datasets = [];
    try {
      datasets = await ingestDocument(doc, req.file.buffer);
    } catch (e) {
      console.warn('[upload] ingest failed:', e.message);
    }
    step('tables', datasets.stats || { sheets: 0, rows: 0, columns: 0, measures: 0 });
    console.log(`[upload] ${name} → doc #${doc.id} (${doc.chars} chars, ${datasets.length} tables)`);

    // أرشفة في Google Drive بالتصنيف الصح (بالخلفية)
    archiveToDrive(doc, req.file.buffer, req.file.mimetype)
      .then(r => step('archived', { category: r?.category || null, drive: r?.drive !== false }))
      .catch(e => {
        console.warn('[drive] archive failed:', e.message);
        step('archived', { error: e.message.slice(0, 120) });
      });

    res.json({ ...doc, datasets, stats: datasets.stats || null, ingest });
  } catch (e) {
    // PDF بدون طبقة نص (ممسوح): المسار القديم يفشل، لكن مسار الاستقبال التفصيلي شغّال بالرؤية — نرجّع حالته بدل فشل كاذب
    if (ingest && !ingest.error) {
      step('read', { chars: 0, note: e.message });
      return res.json({ id: null, name, chars: 0, datasets: [], stats: null, ingest, legacy_error: e.message });
    }
    res.status(400).json({ error: e.message, ingest });
  }
}

// مسارات رفع المستندات: دعم كلا المسارين /api/upload و /api/docs/upload
router.post('/api/upload', upload.single('file'), handleFileUpload);
router.post('/api/docs/upload', upload.single('file'), handleFileUpload);

// لوحة الملف: تتولد تلقائياً بعد الرفع وتظهر داخل الشاشة الرئيسية
router.post('/api/docs/:id/dashboard', async (req, res) => {
  try {
    const r = await dashboardFromDocument(+req.params.id);
    res.status(r.ok ? 200 : 400).json(r);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export { router as uploadRouter };
