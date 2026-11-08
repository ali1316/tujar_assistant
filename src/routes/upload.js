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
import { generateAutoDK } from '../ingest/auto-dk.js';

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

  // فحص التكرار أولاً بالبصمة قبل أي معالجة تفصيلية أو إطلاق مهام خلفية
  const dup = await db.prepare('SELECT id, name, chars, drive_id, drive_url, category FROM documents WHERE sha256=?').get(digest);
  step('checked', { duplicate: !!dup });
  if (dup) {
    console.log(`[upload] Duplicate detected: ${name} matches doc #${dup.id} (${digest})`);
    return res.json({
      ...dup,
      duplicate: true,
      datasets: [],
      ingest: null,
      message: 'الملف موجود مسبقاً بنفس البصمة — تم منعه من التكرار'
    });
  }

  // ملفات PDF: مسار الاستقبال التفصيلي للملفات الجديدة فقط
  let ingest = null;
  if (/\.pdf$/i.test(name) || /pdf/i.test(req.file.mimetype)) {
    try {
      ingest = await ingestReceive({ buffer: req.file.buffer, fileName: name, mime: 'application/pdf' });
    } catch (e) {
      ingest = { error: e.message };
      console.warn('[ingest] receive failed:', e.message);
    }
  }

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

    // مسار Auto-DK المستقل: استخلاص الجداول وتوليد السياق الدلالي تلقائياً لمكتبة المعرفة
    const runAutoDK = async () => {
      try {
        step('autodk_start', { name });
        const bundle = await generateAutoDK({
          buffer: req.file.buffer,
          fileName: name,
          mimeType: req.file.mimetype,
          text,
        });
        const kResult = await importBundle(bundle);
        step('autodk_done', { id: bundle.id, status: kResult?.status });
        console.log(`[upload] Auto-DK bundle imported: ${bundle.id} (${kResult?.status})`);
        return { bundle, result: kResult };
      } catch (err) {
        console.warn(`[upload] Auto-DK failed for ${name}:`, err.message);
        step('autodk_error', { error: err.message });
        return null;
      }
    };

    const isLarge = req.file.size > 2 * 1024 * 1024;
    let autoDK = null;

    if (isLarge) {
      // ملفات كبيرة: تشغيل غير معطّل في الخلفية
      runAutoDK().catch(err => console.warn('[upload] Auto-DK background error:', err.message));
    } else {
      // ملفات عادية: انتظار مع مهلة لتضمين النتيجة في الاستجابة
      try {
        autoDK = await Promise.race([
          runAutoDK(),
          new Promise(resolve => setTimeout(() => resolve(null), 3000)),
        ]);
      } catch (err) {
        console.warn('[upload] Auto-DK wait error:', err.message);
      }
    }

    // أرشفة في Google Drive بالتصنيف الصح (بالخلفية)
    archiveToDrive(doc, req.file.buffer, req.file.mimetype)
      .then(r => step('archived', { category: r?.category || null, drive: r?.drive !== false }))
      .catch(e => {
        console.warn('[drive] archive failed:', e.message);
        step('archived', { error: e.message.slice(0, 120) });
      });

    res.json({
      ...doc,
      datasets,
      stats: datasets.stats || null,
      ingest,
      ...(autoDK?.result ? { knowledge: autoDK.result, auto_dk: autoDK.result } : {}),
    });
  } catch (e) {
    // PDF بدون طبقة نص (ممسوح): المسار القديم يفشل، لكن مسار الاستقبال التفصيلي شغّال بالرؤية — نرجّع حالته بدل فشل كاذب
    if (ingest && !ingest.error) {
      step('read', { chars: 0, note: e.message });
      generateAutoDK({ buffer: req.file.buffer, fileName: name, mimeType: req.file.mimetype, text: '' })
        .then(b => importBundle(b))
        .catch(err => console.warn('[upload] Auto-DK background error for scanned PDF:', err.message));
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
