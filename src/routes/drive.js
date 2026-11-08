// src/routes/drive.js - مسارات واجهة برمجة التطبيقات للمزامنة مع Google Drive
import { Router } from 'express';
import { syncFromDrive, getDriveSyncStatus, startDriveSyncPolling, stopDriveSyncPolling } from '../drive/sync.js';
import { driveReady, driveTools } from '../../drive.js';

const router = Router();

/**
 * GET /api/drive/status
 * فحص حالة الاتصال بـ Google Drive وآخر نتائج المزامنة
 */
router.get('/api/drive/status', async (req, res) => {
  try {
    const status = getDriveSyncStatus();
    res.json({
      ok: true,
      ...status,
      script_configured: driveReady(),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/drive/sync
 * تشغيل المزامنة الفورية من Google Drive
 */
router.post('/api/drive/sync', async (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, +(req.body?.limit || req.query?.limit || 100)));
    const result = await syncFromDrive({ limit });
    res.status(result.ok ? 200 : (result.busy ? 429 : 500)).json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/drive/webhook
 * نقطة استقبال إشعارات Webhook من Google Apps Script عند رفع ملف جديد في Drive
 */
router.post('/api/drive/webhook', async (req, res) => {
  try {
    console.log('[drive-webhook] Received notification:', req.body);
    const limit = Math.min(200, Math.max(1, +(req.body?.limit || 50)));
    const result = await syncFromDrive({ limit });
    res.status(result.ok ? 200 : 500).json({
      ok: result.ok,
      webhook_received: true,
      sync_result: result,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/drive/polling
 * التحكم في تفعيل أو إيقاف المزامنة الدورية
 */
router.post('/api/drive/polling', (req, res) => {
  try {
    const enabled = req.body?.enabled !== false;
    const intervalSeconds = +(req.body?.interval_seconds || 60);

    if (enabled) {
      const started = startDriveSyncPolling(intervalSeconds);
      res.json({ ok: started, polling: started, interval_seconds: intervalSeconds });
    } else {
      const stopped = stopDriveSyncPolling();
      res.json({ ok: true, polling: false, stopped });
    }
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export { router as driveRouter };
