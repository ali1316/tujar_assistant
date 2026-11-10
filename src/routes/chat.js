import { Router, text } from 'express';
import { addTurns, digestNow, recentForUI, chatStart } from '../../history.js';
import { ai } from '../ai.js';
import { getCurrentDash } from '../../file-dash.js';
import { dashGet } from '../../dashboards.js';
import { db } from '../../db.js';
import { getOrSeedExecutiveDashboard } from '../dashboard/seed.js';

const router = Router();

// مساعدة ذكية لبناء ملخص تنفيذي احتياطي في حال غياب مفتاح API
function buildExecutiveSummaryFallback(dashSpec, userText) {
  if (!dashSpec) return 'أهلاً بك يا أستاذ فواز. أنا جاهزة لمساعدتك في استعراض بيانات ومشاريع منصة تُجّار.';
  const kpisText = (dashSpec.kpis || []).map(k => `• ${k.label}: ${typeof k.value === 'number' ? k.value.toLocaleString('ar-SA') : k.value} ${k.unit || ''} ${k.delta ? `(${k.delta})` : ''}`).join('\n');
  const insightsText = (dashSpec.insights || []).map(i => `• ${i}`).join('\n');
  const actionsText = (dashSpec.actions || []).map(a => `• ${a.action}${a.impact ? ` (الأثر: ${a.impact})` : ''}`).join('\n');

  return `### ملخص تنفيذي: ${dashSpec.title || 'لوحة البيانات'}

${dashSpec.headline ? `> **النتيجة الأهم:** ${dashSpec.headline}\n` : ''}
#### المؤشرات الرئيسية (KPIs):
${kpisText || 'لا توجد مؤشرات رقمية معروضة.'}

${insightsText ? `#### أبرز تحليلات الأداء:\n${insightsText}\n` : ''}
${actionsText ? `#### التوصيات والإجراءات المقترحة:\n${actionsText}` : ''}`;
}

// إرسال رسالة نصية مباشرة والحصول على رد AI وحفظها في قاعدة البيانات
router.post('/api/chat/message', async (req, res) => {
  try {
    const userText = String(req.body?.text || '').trim();
    if (!userText) return res.status(400).json({ error: 'نص الرسالة مطلوب' });

    let sessionId = req.body?.sessionId;
    if (!sessionId) {
      sessionId = await chatStart();
    }

    const screenContext = req.body?.screenContext || null;
    let dashSpec = screenContext?.dashboard;
    if (!dashSpec || !dashSpec.kpis || !dashSpec.kpis.length) {
      try {
        const cur = await getCurrentDash();
        if (cur?.id) {
          const d = await dashGet(+cur.id);
          if (d?.spec?.kpis?.length) dashSpec = d.spec;
        }
      } catch {}
    }

    if (!dashSpec || !dashSpec.kpis || !dashSpec.kpis.length) {
      try {
        const rows = await db.prepare("SELECT spec FROM dashboards WHERE spec LIKE '%kpis%' ORDER BY id DESC LIMIT 1").all();
        if (rows?.[0]?.spec) {
          dashSpec = typeof rows[0].spec === 'string' ? JSON.parse(rows[0].spec) : rows[0].spec;
        }
      } catch {}
    }

    if (!dashSpec || !dashSpec.kpis || !dashSpec.kpis.length) {
      try {
        const seeded = await getOrSeedExecutiveDashboard();
        if (seeded?.id) {
          const d = await dashGet(+seeded.id);
          if (d?.spec) dashSpec = d.spec;
        }
      } catch {}
    }

    let screenInfo = '';
    if (dashSpec) {
      screenInfo = `
المعروض حالياً على الشاشة أمام الأستاذ فواز:
لوحة: ${dashSpec.title || 'لوحة البيانات'}
${dashSpec.subtitle ? `المصدر / النطاق: ${dashSpec.subtitle}` : ''}
${dashSpec.headline ? `النتيجة الأهم: ${dashSpec.headline}` : ''}
${dashSpec.kpis?.length ? `المؤشرات الرئيسية (KPIs):
${dashSpec.kpis.map(k => `- ${k.label}: ${typeof k.value === 'number' ? k.value.toLocaleString('ar-SA') : k.value} ${k.unit || ''} ${k.delta ? `(${k.delta})` : ''}`).join('\n')}` : ''}
${dashSpec.insights?.length ? `تحليلات ورؤى الأداء:
${dashSpec.insights.map(i => `- ${i}`).join('\n')}` : ''}
${dashSpec.charts?.length ? `الرسوم البيانية المعروضة:
${dashSpec.charts.map(c => `- ${c.title}${c.insight ? `: ${c.insight}` : ''}`).join('\n')}` : ''}
${dashSpec.actions?.length ? `التوصيات والإجراءات:
${dashSpec.actions.map(a => `- ${a.action}${a.impact ? ` (الأثر: ${a.impact})` : ''}`).join('\n')}` : ''}
`;
    } else if (screenContext?.kpis?.length) {
      screenInfo = `
المؤشرات المعروضة على الشاشة حالياً:
${screenContext.kpis.join('\n')}
`;
    }

    // جلب محفظة المشاريع الخمسة وحالة التذاكر لتعزيز إجابات نورة الذكية
    let portfolioInfo = '';
    try {
      const projs = await db.prepare('SELECT id, name, status, progress, budget, spent FROM projects ORDER BY id ASC').all();
      if (projs?.length) {
        portfolioInfo = `
بيانات محفظة مشاريع التحول الرقمي لاتحاد الغرف (مشاريع 1 إلى 5):
${projs.map(p => `- مشروع #${p.id} (${p.name}): الحالة [${p.status}]، الإنجاز [${p.progress}%]، الميزانية [${Number(p.budget).toLocaleString('ar-SA')} ر.س]، المصروف [${Number(p.spent).toLocaleString('ar-SA')} ر.س]`).join('\n')}
`;
      }
    } catch {}

    const prompt = `أنت نورة، المستشارة والمساعدة التنفيذية الذكية للأستاذ فواز في اتحاد الغرف السعودية ومنصة تُجّار.
أنتِ تشاهدين شاشة فواز مباشرة وتعرفين ما هو معروض عليها بدقة كاملة ولحظية، ولديكِ كامل بيانات المشاريع والمحافظ.
قواعد الإجابة:
- عندما يسألك فواز عن "المعروض" أو يطلب تلخيص المعروض أو يسأل عن اللوحة الحالية أو الأرقام الظاهرة أمامه: لخصي له فوراً وبأسلوب تنفيذي موجز واحترافي الأرقام والمؤشرات الحقيقية المعروضة أمامه في البيانات أدناه.
- لا تطلبي منه تزويدك بالمحتوى أو المعروض إطلاقاً، لأنك ترينه بالفعل وتعرفينه تماماً.
- عندما يسألك عن أي مشروع (مثل: بوابة الخدمات، رخص البناء، مؤشرات الأداء، البلاغات الذكية، ترحيل السحابة): أجيبي بدقة بناءً على بيانات المشروع ونسبة إنجازه وميزانيته ومخاطره.
- أجيبي بلهجة تنفيذية سعودية رفيعة ومباشرة واضحة.

${screenInfo}
${portfolioInfo}

سؤال فواز:
${userText}`;

    let reply = '';
    try {
      const r = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
      reply = r.text || r.output_text || '';
    } catch (llmErr) {
      console.warn('[chat/message] AI generateContent fallback:', llmErr.message);
      if (/لخص|معروض|اللوحة|الارقام|الأرقام|شاشة|الشاشة/i.test(userText) && dashSpec) {
        reply = buildExecutiveSummaryFallback(dashSpec, userText);
      } else {
        reply = 'أهلاً بك يا أستاذ فواز. بصفتي نورة، يسعدني تقديم المساعدة في متابعة مؤشرات ومشاريع التحول الرقمي لاتحاد الغرف ومنصة تُجّار.';
      }
    }

    if (!reply || (/أحتاج.*(تزويدي|المعروض|بمحتوى)|يرجى.*تزويدي/i.test(reply) && dashSpec)) {
      reply = buildExecutiveSummaryFallback(dashSpec, userText);
    }

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
    res.status(500).json({ error: e.message });
  }
});

// قائمة المحادثات لـ UI
router.get('/api/chats', async (req, res) => {
  try {
    const list = await recentForUI(20);
    res.json({ ok: true, chats: list });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export { router as chatRouter };
