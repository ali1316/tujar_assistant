import { Router, text } from 'express';
import { addTurns, digestNow, recentForUI } from '../../history.js';

const router = Router();

// حفظ أدوار المحادثة
router.post('/api/chat/:id/turns', async (req, res) => {
  try {
    res.json({ ok: true, saved: await addTurns(+req.params.id, req.body?.turns) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// إنهاء المحادثة (يُستدعى أيضاً عبر navigator.sendBeacon)
router.post('/api/chat/:id/end', text({ type: '*/*' }), async (req, res) => {
  try {
    let turns = [];
    try {
      turns = JSON.parse(req.body || '{}').turns || [];
    } catch {}
    if (turns.length) await addTurns(+req.params.id, turns);
    digestNow(+req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// آخر أدوار المحادثة للواجهة
router.get('/api/chat/recent', async (req, res) => {
  res.json({ turns: await recentForUI(+req.query.limit || 30) });
});

export { router as chatRouter };
