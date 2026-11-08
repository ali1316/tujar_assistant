// src/drive/sync.js - مزامنة ثنائية الاتجاه مع Google Drive مع فحص البصمة (Deduplication)
import crypto from 'node:crypto';
import { db } from '../../db.js';
import { callDriveApi, classify, driveReady } from '../../drive.js';
import { extractText, saveDocument } from '../../docs.js';
import { ingestDocument } from '../../datasets.js';
import { generateAutoDK } from '../ingest/auto-dk.js';
import { importBundle } from '../../knowledge.js';
import { ensureIndex, invalidateIndex } from '../../retrieval.js';
import { getStorage } from '../storage/storage-adapter.js';

let pollTimer = null;
let isSyncing = false;
let lastSyncStatus = null;

/**
 * مزامنة الملفات من Google Drive إلى النظام المحلي
 * تفحص بصمة SHA-256 لكل ملف لمنع تكرار المعالجة أو مضاعفة المتجهات في قاعدة البيانات
 */
export async function syncFromDrive({ limit = 100 } = {}) {
  if (!driveReady()) {
    return { ok: false, error: 'DRIVE_SCRIPT_URL غير مضبوط' };
  }
  if (isSyncing) {
    return { ok: false, busy: true, message: 'مزامنة Drive قيد التنفيذ حالياً' };
  }

  isSyncing = true;
  const startedAt = new Date().toISOString();
  const stats = {
    total_in_drive: 0,
    processed: 0,
    new_imported: 0,
    deduplicated: 0,
    already_synced: 0,
    errors: 0,
    details: [],
    started_at: startedAt,
  };

  try {
    // 1) جلب قائمة الملفات من Google Drive
    const listResult = await callDriveApi({ action: 'list' });
    if (!listResult || !listResult.ok || !Array.isArray(listResult.files)) {
      throw new Error(listResult?.error || 'فشل جلب قائمة الملفات من Drive');
    }

    const driveFiles = listResult.files.slice(0, limit);
    stats.total_in_drive = listResult.files.length;
    let hasNewDocs = false;

    for (const file of driveFiles) {
      stats.processed++;
      const fileId = String(file.id || '');
      const fileName = String(file.name || 'unnamed');

      try {
        // الخطوة 1: فحص سريع بالمعرّف المباشر drive_id
        const existingByDriveId = await db.prepare('SELECT id, name, sha256 FROM documents WHERE drive_id=?').get(fileId);
        if (existingByDriveId) {
          stats.already_synced++;
          stats.details.push({
            id: fileId,
            name: fileName,
            status: 'already_synced',
            doc_id: existingByDriveId.id,
          });
          continue;
        }

        // الخطوة 2: جلب محتوى الملف بالبايتات من Drive
        const fileData = await callDriveApi({ action: 'getById', id: fileId });
        if (!fileData || !fileData.ok || !fileData.data) {
          stats.errors++;
          stats.details.push({
            id: fileId,
            name: fileName,
            status: 'fetch_failed',
            error: fileData?.error || 'لم يتم استلام محتوى الملف',
          });
          continue;
        }

        const buffer = Buffer.from(fileData.data, 'base64');
        const mime = fileData.mime || file.mime || 'application/octet-stream';

        // الخطوة 3: حساب بصمة SHA-256 للمحتوى
        const digest = crypto.createHash('sha256').update(buffer).digest('hex');

        // الخطوة 4: فحص التطابق مع المستندات الموجودة (Deduplication)
        const existingBySha = await db.prepare('SELECT id, name, drive_id FROM documents WHERE sha256=?').get(digest);
        if (existingBySha) {
          // ملف متطابق المحتوى موجود مسبقاً (تم رفعه عبر الواجهة مثلاً): نربط drive_id بدون إعادة الاستخراج أو الفهرسة
          await db.prepare('UPDATE documents SET drive_id=?, drive_url=? WHERE id=?').run(
            fileId,
            file.url || fileData.url || null,
            existingBySha.id
          );
          try {
            const storage = getStorage();
            await storage.put(`documents/${existingBySha.id}/${fileName}`, buffer, mime);
          } catch {}

          stats.deduplicated++;
          stats.details.push({
            id: fileId,
            name: fileName,
            status: 'deduplicated',
            matched_doc_id: existingBySha.id,
            sha256: digest,
            note: 'تم اكتشاف تطابق المحتوى عبر SHA-256 وربط معرف Drive دون تكرار الفهرسة',
          });
          continue;
        }

        // الخطوة 5: مستند فريد جديد - استخراج النص والحفظ
        let text = '';
        try {
          text = await extractText(buffer, fileName);
        } catch (extErr) {
          text = `[مستند من Google Drive: ${fileName}]\nنوع الملف: ${mime}\nتاريخ الإضافة: ${file.created || startedAt}`;
        }

        const doc = await saveDocument(fileName, mime, buffer.length, text);

        // تصنيف الملف وتلخيصه إن لم يكن مصنفاً
        let category = file.category || 'أخرى';
        let summary = file.description || '';
        try {
          const cl = await classify(fileName, text);
          if (!file.category || file.category === 'أخرى') category = cl.category;
          if (!summary) summary = cl.summary;
        } catch {}

        await db.prepare('UPDATE documents SET sha256=?, drive_id=?, drive_url=?, category=?, summary=? WHERE id=?').run(
          digest,
          fileId,
          file.url || fileData.url || null,
          category,
          summary,
          doc.id
        );

        // حفظ نسخة محلياً لسرعة الوصول
        try {
          const storage = getStorage();
          await storage.put(`documents/${doc.id}/${fileName}`, buffer, mime);
        } catch {}

        // معالجة الجداول (Excel / CSV)
        try {
          await ingestDocument(doc, buffer);
        } catch (ingErr) {
          console.warn(`[drive-sync] ingestDocument error for ${fileName}:`, ingErr.message);
        }

        // معالجة المعرفة التلقائية Auto-DK
        try {
          const bundle = await generateAutoDK({
            buffer,
            fileName,
            mimeType: mime,
            text,
          });
          await importBundle(bundle);
        } catch (dkErr) {
          console.warn(`[drive-sync] Auto-DK error for ${fileName}:`, dkErr.message);
        }

        hasNewDocs = true;
        stats.new_imported++;
        stats.details.push({
          id: fileId,
          name: fileName,
          status: 'imported',
          doc_id: doc.id,
          sha256: digest,
          category,
        });
      } catch (err) {
        stats.errors++;
        stats.details.push({
          id: fileId,
          name: fileName,
          status: 'error',
          error: err.message,
        });
      }
    }

    // تحديث متجهات RAG إذا تم استيراد مستندات جديدة
    if (hasNewDocs) {
      invalidateIndex();
      ensureIndex().catch(e => console.warn('[drive-sync] ensureIndex failed:', e.message));
    }

    stats.finished_at = new Date().toISOString();
    lastSyncStatus = { ok: true, stats };
    console.log(`[drive-sync] Done: ${stats.new_imported} new, ${stats.deduplicated} deduped, ${stats.already_synced} already synced (${stats.errors} errors)`);
    return { ok: true, stats };
  } catch (outerErr) {
    lastSyncStatus = { ok: false, error: outerErr.message, finished_at: new Date().toISOString() };
    console.error('[drive-sync] Sync failed:', outerErr.message);
    return { ok: false, error: outerErr.message, stats };
  } finally {
    isSyncing = false;
  }
}

/**
 * بدء المزامنة الدورية بالخلفية
 */
export function startDriveSyncPolling(intervalSeconds = 60) {
  stopDriveSyncPolling();
  if (!driveReady()) {
    console.log('[drive-sync] Polling skipped: DRIVE_SCRIPT_URL not configured');
    return false;
  }

  const intervalMs = Math.max(10, intervalSeconds) * 1000;
  pollTimer = setInterval(async () => {
    if (!isSyncing && driveReady()) {
      await syncFromDrive().catch(err => console.warn('[drive-poll] tick warn:', err.message));
    }
  }, intervalMs);

  if (pollTimer && typeof pollTimer.unref === 'function') {
    pollTimer.unref();
  }

  console.log(`[drive-sync] Periodic polling started (every ${Math.round(intervalMs / 1000)}s)`);
  return true;
}

/**
 * إيقاف المزامنة الدورية
 */
export function stopDriveSyncPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    console.log('[drive-sync] Periodic polling stopped');
    return true;
  }
  return false;
}

/**
 * حالة المزامنة الحالية
 */
export function getDriveSyncStatus() {
  return {
    connected: driveReady(),
    polling: !!pollTimer,
    is_syncing: isSyncing,
    last_sync: lastSyncStatus,
  };
}
