import { Router } from 'express';
import { db } from '../../db.js';
import { BOOT_ID } from '../../events.js';
import { agentStatus } from '../../agent.js';
import { persistState } from '../../persist.js';

const router = Router();

// فحص جاهزية السيرفر
router.get('/health', (req, res) => res.send('ok'));

// فحص تفصيلي مع الحالة ومعرّف الإقلاع
router.get('/api/ping', (req, res) => {
  res.json({
    ok: true,
    boot: BOOT_ID,
    agent: agentStatus(),
    persist: persistState,
  });
});

// مهام المطور (Claude)
router.get('/api/agent/jobs', async (req, res) => {
  res.json({
    status: agentStatus(),
    jobs: await db.prepare(
      'SELECT id, kind, status, request, result, created_at, updated_at FROM agent_jobs ORDER BY id DESC LIMIT 20'
    ).all(),
  });
});

export { router as healthRouter };
