import { Router, text } from 'express';
import { addTurns, digestNow, recentForUI, chatStart } from '../../history.js';
import { ai } from '../ai.js';

const router = Router();

// إرسال رسالة نصية مباشرة والحصول على رد AI وحفظها في قاعدة البيانات
router.post('/api/chat/message', async (req, res) => {
  try {
    const userText = String(req.body?.text || '').trim();
    if (!userText) return res.status(400).json({ error: 'نص الرسالة مطلوب' });

    let sessionId = req.body?.sessionId;
    if (!sessionId) {
      sessionId = await chatStart();
    }

    const prompt = `أنت نورة، المستشارة والمساعدة التنفيذية الذكية للأستاذ فواز في اتحاد الغرف السعودية ومنصة تُجّار.
أجب باحترافية ودقة وبلهجة تنفيذية سعودية واضحة ومباشرة.

سؤال فواز:
${userText}`;

    const r = await ai.models.generateContent({ contents: prompt });
    const reply = r.text || r.output_text || 'عذراً، لم أستطع معالجة الطلب.';

    // حفظ في قاعدة البيانات (PostgreSQL / SQLite)
    await addTurns(+sessionId, [
      { role: 'user', text: userText },
      { role: 'nora', text: reply }
    ]);

    res.json({ ok: true, sessionId, reply });
  } catch (err) {
    console.error('[chat/message] error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

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
