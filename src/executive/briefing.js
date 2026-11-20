// src/executive/briefing.js - Morning Executive Audio Briefing for Fawaz (الموجز التنفيذي الصباحي)
import { db } from '../../db.js';
import { kList } from '../../knowledge.js';
import { kvGet, kvSet } from '../../store.js';
import { ai } from '../ai.js';

export const EXECUTIVE_BRIEFING_SESSION_KEY = 'executive_briefing_session';

/**
 * Formats a SAR amount into clean, spoken Arabic text (e.g. 5.3 مليون ريال or 850 ألف ريال).
 * @param {number|string} amount
 * @returns {string}
 */
export function formatCurrencyArabic(amount) {
  const n = Number(amount) || 0;
  if (n >= 1_000_000) {
    const val = n / 1_000_000;
    const formatted = val % 1 === 0 ? String(val) : val.toFixed(1);
    return `${formatted} مليون ريال`;
  }
  if (n >= 1_000) {
    const val = n / 1_000;
    const formatted = val % 1 === 0 ? String(val) : val.toFixed(1);
    return `${formatted} ألف ريال`;
  }
  return `${n} ريال`;
}

/**
 * Computes difference between current snapshot and previous baseline session snapshot.
 * Determines whether any real changes occurred (spend, progress, new delays, tickets, documents).
 * @param {object} currentSnapshot
 * @param {object|null} prevSnapshot
 * @param {object} [options]
 * @returns {object}
 */
export function calculateBriefingDelta(currentSnapshot, prevSnapshot, options = {}) {
  if (options.forceUnchanged) {
    return {
      has_prior_session: true,
      has_changes: false,
      is_unchanged: true,
      time_since_last_briefing: 'منذ الأمس',
      summary: {
        spent_diff: 0,
        progress_diff: 0,
        new_delayed_projects: [],
        resolved_delayed_projects: [],
        new_high_priority_tickets: [],
        new_docs: [],
      },
      summary_text: '',
    };
  }

  if (options.forceChanged) {
    return {
      has_prior_session: true,
      has_changes: true,
      is_unchanged: false,
      time_since_last_briefing: 'خلال الساعات الماضية',
      summary: {
        spent_diff: 150000,
        progress_diff: 5,
        new_delayed_projects: [],
        resolved_delayed_projects: [],
        new_high_priority_tickets: [],
        new_docs: [],
      },
      summary_text: 'تسجيل تقدم في نسب الإنجاز',
    };
  }

  if (!prevSnapshot) {
    return {
      has_prior_session: false,
      has_changes: true,
      is_unchanged: false,
      time_since_last_briefing: null,
      summary: {
        spent_diff: 0,
        progress_diff: 0,
        new_delayed_projects: [],
        resolved_delayed_projects: [],
        new_high_priority_tickets: [],
        new_docs: [],
      },
      summary_text: '',
    };
  }

  const prev = prevSnapshot;
  const spentDiff = (currentSnapshot.total_spent || 0) - (Number(prev.total_spent) || 0);
  const progressDiff = (currentSnapshot.avg_progress_pct || 0) - (Number(prev.avg_progress_pct) || 0);

  const prevDelayedIds = new Set(prev.delayed_project_ids || []);
  const currDelayedList = currentSnapshot.delayed_projects || [];
  const currDelayedIds = new Set(currDelayedList.map(p => p.id));

  const newDelayedProjects = currDelayedList.filter(p => !prevDelayedIds.has(p.id));
  const resolvedDelayedProjects = (prev.delayed_project_ids || []).filter(id => !currDelayedIds.has(id));

  const prevHighTicketIds = new Set(prev.high_priority_ticket_ids || []);
  const currHighTickets = currentSnapshot.high_priority_tickets || [];
  const newHighTickets = currHighTickets.filter(t => !prevHighTicketIds.has(t.id));

  const prevDocIds = new Set(prev.doc_ids || []);
  const currDocs = currentSnapshot.recent_docs || [];
  const newDocs = currDocs.filter(d => !prevDocIds.has(d.id));

  const ticketCountDiff = (currentSnapshot.open_tickets_count || 0) - (prev.open_tickets_count || 0);

  const hasChanges = (
    Math.abs(spentDiff) > 0 ||
    progressDiff !== 0 ||
    newDelayedProjects.length > 0 ||
    resolvedDelayedProjects.length > 0 ||
    newHighTickets.length > 0 ||
    newDocs.length > 0 ||
    ticketCountDiff !== 0
  );

  const changeNotes = [];
  if (spentDiff > 0) {
    changeNotes.push(`صرف إضافي بقيمة ${formatCurrencyArabic(spentDiff)}`);
  }
  if (newDelayedProjects.length > 0) {
    changeNotes.push(`تسجيل تأخر في مشروع «${newDelayedProjects[0].name}»`);
  }
  if (resolvedDelayedProjects.length > 0) {
    changeNotes.push(`معالجة تأخير أحد المشاريع`);
  }
  if (newHighTickets.length > 0) {
    changeNotes.push(`بلاغ عاجل جديد حول «${newHighTickets[0].title}»`);
  }
  if (newDocs.length > 0) {
    changeNotes.push(`استيراد وثيقة جديدة «${newDocs[0].title || newDocs[0].name}»`);
  }

  return {
    has_prior_session: true,
    has_changes: hasChanges,
    is_unchanged: !hasChanges,
    time_since_last_briefing: prev.timestamp || null,
    summary: {
      spent_diff: spentDiff,
      progress_diff: progressDiff,
      new_delayed_projects: newDelayedProjects,
      resolved_delayed_projects: resolvedDelayedProjects,
      new_high_priority_tickets: newHighTickets,
      new_docs: newDocs,
    },
    summary_text: changeNotes.join('، '),
  };
}

/**
 * Synthesizes a natural, high-level spoken executive summary in Saudi business dialect for Fawaz/Nora.
 * Target duration: 30-45 seconds when spoken (~80-95 words).
 * Adapts seamlessly when no updates occurred since the last session.
 * @param {object} param
 * @returns {string}
 */
/**
 * Synthesizes a natural, high-level spoken executive summary in Saudi business dialect for Fawaz/Nora.
 * Target duration: 30-45 seconds when spoken (~80-95 words).
 * Supports rich dynamic procedural variations and adapts seamlessly when no updates occurred.
 * @param {object} param
 * @returns {string}
 */
export function synthesizeExecutiveText({ metrics, projects, tickets, recentDocs, variant = 0 }) {
  const {
    total_budget = 0,
    total_spent = 0,
    budget_utilization_pct = 0,
    delayed_projects = [],
    open_tickets_count = 0,
    high_priority_tickets_count = 0,
    high_priority_tickets = [],
    avg_progress_pct = 0,
    delta = null,
  } = metrics;

  const isUnchanged = Boolean(delta && delta.has_prior_session && !delta.has_changes);
  const budgetStr = formatCurrencyArabic(total_budget);
  const spentStr = formatCurrencyArabic(total_spent);
  const mainDelayed = delayed_projects[0];
  const topTicket = high_priority_tickets[0];
  const topDoc = recentDocs && recentDocs[0];
  const docTitle = topDoc ? (topDoc.title || topDoc.name) : null;

  // Selected variant normalized to 0..3
  const v = Math.abs(Number(variant) || 0) % 4;

  // Variant 1: Strategic Momentum & Velocity Focus
  if (v === 1) {
    let t = `صباح الخير والهمة العالية أستاذ فواز. هذا الموجز التنفيذي الصباحي لمحفظة مشاريع التحول الرقمي في اتحاد الغرف ومنصة تُجّار. `;
    if (isUnchanged) {
      t += `نود طمأنتكم باستقرار الموقف العام للمحفظة دون أي طوارئ جديدة منذ الإيجاز السابق. `;
    } else if (delta && delta.has_prior_session && delta.has_changes && delta.summary_text) {
      t += `أبرز مستجدات الساعات الماضية: ${delta.summary_text}. `;
    }

    t += `الميزانية الإجمالية المعتمدة تبلغ ${budgetStr}، تم صرف ${spentStr} بنسبة استغلال بلغت ${budget_utilization_pct} بالمئة. `;

    if (mainDelayed) {
      t += isUnchanged
        ? `ويستمر تركيزنا الرقابي على مشروع «${mainDelayed.name}» المنجز منه ${mainDelayed.progress} بالمئة دون تغيير. `
        : `ونلفت انتباهكم للتركيز على تسريع مشروع «${mainDelayed.name}» بنسبة إنجاز ${mainDelayed.progress} بالمئة لمعالجة التأخير. `;
    } else {
      t += `وكافة المبادرات تسير وفق الخطة المعتمدة بمتوسط إنجاز ${avg_progress_pct} بالمئة دون أي تعثر. `;
    }

    if (topTicket) {
      t += `وعلى الصعيد التشغيلي، المنظومة تتابع ${open_tickets_count} تذاكر مفتوحة تتصدرها تذكرة «${topTicket.title}» ذات الأولوية العالية. `;
    } else {
      t += `وعلى الصعيد التشغيلي، العمليات مستقرة وتوجد ${open_tickets_count} تذاكر روتينية قيد المعالجة. `;
    }

    if (docTitle) {
      t += isUnchanged
        ? `وفي مكتبة Auto-DK، تبقى وثيقة «${docTitle}» أحدث المرجعيات التحليلية. `
        : `وفي مكتبة الوثائق الذكية Auto-DK، اعتمدنا مؤخراً وثيقة «${docTitle}». `;
    } else {
      t += `ومكتبة البيانات والمعرفة Auto-DK جاهزة ومحدثة بالكامل. `;
    }

    t += `نقف بكامل الجاهزية لدعم قراراتكم التنفيذية اليوم، ونتمنى لكم يوماً عملياً موفقاً ومثمراً.`;
    return t.trim();
  }

  // Variant 2: Operational Governance & Precision Focus
  if (v === 2) {
    let t = `صباح الخير والبركة أستاذ فواز. هذا الموجز التنفيذي الصباحي لمحفظة مشاريع التحول الرقمي في اتحاد الغرف ومنصة تُجّار. `;
    if (isUnchanged) {
      t += `نحيطكم علماً بأن مؤشرات الأداء تحافظ على ثباتها التام دون أي انحرافات طارئة عن إيجاز الأمس. `;
    } else if (delta && delta.has_prior_session && delta.has_changes && delta.summary_text) {
      t += `نسجل اليوم المستجدات التالية: ${delta.summary_text}. `;
    }

    t += `الميزانية الإجمالية المعتمدة تبلغ ${budgetStr}، تم صرف ${spentStr} بنسبة استغلال بلغت ${budget_utilization_pct} بالمئة. `;

    if (mainDelayed) {
      t += isUnchanged
        ? `تستمر المتابعة على المشروع المتأخر دون تغيير، وهو مشروع «${mainDelayed.name}» بنسبة إنجاز ${mainDelayed.progress} بالمئة. `
        : `وضمن متابعة المخاطر، لدينا مشروع متأخر يتطلب انتباهكم وهو «${mainDelayed.name}» بنسبة إنجاز ${mainDelayed.progress} بالمئة. `;
    } else {
      t += `وتسجل المؤشرات العامة انضباطاً كاملاً بمتوسط إنجاز ${avg_progress_pct} بالمئة دون تأخير. `;
    }

    if (topTicket) {
      t += `وتشغيلياً، هناك ${open_tickets_count} تذاكر قيد المعالجة من بينها تذكرة «${topTicket.title}» ذات الأولوية العالية لضمان استقرار الخدمات. `;
    } else {
      t += `وتشغيلياً، الغرفة الرقمية مستقرة مع ${open_tickets_count} بلاغات اعتيادية قيد المتابعة. `;
    }

    if (docTitle) {
      t += `وفي مكتبة الوثائق الذكية Auto-DK، تتوفر كامل بيانات «${docTitle}». `;
    } else {
      t += `ومكتبة البيانات والمعرفة Auto-DK جاهزة ومحدثة بالكامل. `;
    }

    t += `نحن على أتم الاستعداد لأي توجيهات أو تفاصيل إضافية تطلبها، ونتمنى لك يوماً مثمراً وموفقاً.`;
    return t.trim();
  }

  // Variant 3: Concise Executive Direct Pulse
  if (v === 3) {
    let t = `صباح الخير والتوفيق أستاذ فواز. هذا الموجز التنفيذي الصباحي لمحفظة مشاريع التحول الرقمي في اتحاد الغرف ومنصة تُجّار. `;
    if (isUnchanged) {
      t += `المحفظة تسير باستقرار كامل دون طوارئ جديدة منذ الإيجاز السابق. `;
    } else if (delta && delta.has_prior_session && delta.has_changes && delta.summary_text) {
      t += `رصدنا مستجدات جديدة: ${delta.summary_text}. `;
    }

    t += `الميزانية الإجمالية المعتمدة تبلغ ${budgetStr}، تم صرف ${spentStr} بنسبة استغلال بلغت ${budget_utilization_pct} بالمئة. `;

    if (mainDelayed) {
      t += `الأولوية الرقابية تذهب لمشروع «${mainDelayed.name}» بنسبة إنجاز ${mainDelayed.progress} بالمئة لتدارك التأخير. `;
    } else {
      t += `وكافة المشاريع تسير وفق الخطة الزمنية المعتمدة بمتوسط إنجاز ${avg_progress_pct} بالمئة. `;
    }

    if (topTicket) {
      t += `وعلى الصعيد التشغيلي، نتولى متابعة ${open_tickets_count} تذاكر مفتوحة تتصدرها تذكرة «${topTicket.title}». `;
    } else {
      t += `والعمليات مستقرة وتوجد ${open_tickets_count} تذاكر روتينية قيد المعالجة. `;
    }

    if (docTitle) {
      t += `وفي مكتبة الوثائق الذكية Auto-DK، اعتمدنا وثيقة «${docTitle}». `;
    } else {
      t += `ومستودع المعرفة Auto-DK محدث ومتاح بالكامل. `;
    }

    t += `نحن في خدمتكم لأي توجيه، ونتمنى لكم يوماً مكللاً بالنجاح والإنجاز.`;
    return t.trim();
  }

  // Variant 0: Standard Baseline (Strict test compatibility & reference)
  let text = `صباح الخير أستاذ فواز. هذا الموجز التنفيذي الصباحي لمحفظة مشاريع التحول الرقمي في اتحاد الغرف ومنصة تُجّار. `;

  if (isUnchanged) {
    text += `نلفت عنايتكم إلى استقرار الموقف العام دون أي تغييرات طارئة منذ الإيجاز السابق. `;
  } else if (delta && delta.has_prior_session && delta.has_changes && delta.summary_text) {
    text += `نسلط الضوء اليوم على أبرز المستجدات منذ الإيجاز السابق: ${delta.summary_text}. `;
  }

  text += `الميزانية الإجمالية المعتمدة تبلغ ${budgetStr}، تم صرف ${spentStr} بنسبة استغلال بلغت ${budget_utilization_pct} بالمئة. `;

  if (delayed_projects.length > 0) {
    const mainDelayedP = delayed_projects[0];
    if (isUnchanged) {
      const delayPhrase = delayed_projects.length > 1
        ? `تستمر المتابعة على ${delayed_projects.length} مشاريع متأخرة دون تغيير`
        : 'تستمر المتابعة على المشروع المتأخر دون تغيير';
      text += `${delayPhrase}، وهو مشروع «${mainDelayedP.name}» بنسبة إنجاز ${mainDelayedP.progress} بالمئة. `;
    } else {
      const delayPhrase = delayed_projects.length > 1
        ? `لدينا ${delayed_projects.length} مشاريع متأخرة تتطلب انتباهكم`
        : 'لدينا مشروع متأخر يتطلب انتباهكم';
      text += `${delayPhrase}، وهو مشروع «${mainDelayedP.name}» بنسبة إنجاز ${mainDelayedP.progress} بالمئة. `;
    }
  } else {
    text += `وكافة المشاريع تسير وفق الخطة الزمنية المعتمدة بمتوسط إنجاز ${avg_progress_pct} بالمئة دون أي تأخيرات حرجة. `;
  }

  if (high_priority_tickets_count > 0) {
    const topTicketT = high_priority_tickets[0];
    if (isUnchanged) {
      text += `وعلى الصعيد التشغيلي، لا تزال ${open_tickets_count} تذاكر قيد المعالجة المعتادة دون تصعيد جديد، وتتصدرها تذكرة «${topTicketT.title}». `;
    } else {
      text += `وعلى الصعيد التشغيلي، توجد ${open_tickets_count} تذاكر مفتوحة، من بينها ${high_priority_tickets_count} تذاكر ذات أولوية عالية تتصدرها تذكرة «${topTicketT.title}». `;
    }
  } else {
    text += `وعلى الصعيد التشغيلي، العمليات مستقرة وتوجد ${open_tickets_count} تذاكر روتينية قيد المعالجة. `;
  }

  if (recentDocs && recentDocs.length > 0) {
    const topDocD = recentDocs[0];
    if (isUnchanged) {
      text += `وفي مكتبة الوثائق الذكية Auto-DK، لا تزال وثيقة «${topDocD.title || topDocD.name}» آخر المرجعيات المعتمدة. `;
    } else {
      text += `وفي مكتبة الوثائق الذكية Auto-DK، تم مؤخراً استيراد وتحليل «${topDocD.title || topDocD.name}». `;
    }
  } else {
    text += `ومكتبة البيانات والمعرفة Auto-DK جاهزة ومحدثة بالكامل. `;
  }

  text += `نحن على أتم الاستعداد لأي توجيهات أو تفاصيل إضافية تطلبها، ونتمنى لك يوماً مثمراً وموفقاً.`;

  return text.trim();
}

/**
 * Optional AI synthesis using Gemini Live / Model.
 * Produces spontaneous, fresh executive Saudi business Arabic when configured.
 * @param {object} param
 * @returns {Promise<string|null>}
 */
export async function synthesizeWithGemini({ metrics, projects, tickets, recentDocs, delta }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key.startsWith('freellmapi-')) {
    return null;
  }
  try {
    const isUnchanged = Boolean(delta && delta.has_prior_session && !delta.has_changes);
    const delayedName = metrics.delayed_projects?.[0]?.name || 'لا يوجد';
    const delayedProg = metrics.delayed_projects?.[0]?.progress ?? 0;
    const topTicket = metrics.high_priority_tickets?.[0]?.title || 'معالجة روتينية';
    const topDoc = recentDocs?.[0]?.title || recentDocs?.[0]?.name || 'مكتبة المعرفة';

    const prompt = `أنت نورة، المساعد التنفيذي الذكي لفواز في اتحاد الغرف التجارية السعودية ومنصة تُجّار.
اكتب نص الموجز التنفيذي الصباحي الصوتي بأسلوب حديث سعودي مهني راقٍ وموجز (اللهجة البيضاء التنفيذية):
البيانات المعتمدة:
- الميزانية المعتمدة: ${formatCurrencyArabic(metrics.total_budget)}
- المصروف الفعلي: ${formatCurrencyArabic(metrics.total_spent)} (نسبة الاستغلال: ${metrics.budget_utilization_pct} بالمئة)
- المشاريع المتأخرة: ${metrics.delayed_projects_count > 0 ? `مشروع «${delayedName}» بنسبة إنجاز ${delayedProg} بالمئة` : 'كافة المشاريع في مسارها السليم'}
- التذاكر التشغيلية: ${metrics.open_tickets_count} تذاكر، تتصدرها تذكرة «${topTicket}»
- وثائق Auto-DK: آخر مستند معتمد «${topDoc}»
- حالة الاستقرار: ${isUnchanged ? 'الموقف مستقر تماماً دون أي تغييرات طارئة عن إيجاز الأمس' : 'تحديث دوري صباحي'}

القواعد الصارمة:
1. ابدأ بعبارة: "صباح الخير أستاذ فواز. هذا الموجز التنفيذي الصباحي لمحفظة مشاريع التحول الرقمي في اتحاد الغرف ومنصة تُجّار."
2. اذكر الأرقام والمشروع المتأخر والتذكرة والوثيقة المذكورة أعلاه بدقة.
3. عدد الكلمات بين 75 و95 كلمة (مدة إلقاء 35 ثانية).
4. اختم بعبارة تنفيذية رصينة وداعمة لقرارات اليوم.
أخرج نص الموجز الصوتي فقط دون أي مقدمات أو علامات إضافية.`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const res = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { temperature: 0.3 },
    });
    clearTimeout(timer);
    const aiText = (res.text || res.output_text || '').trim();
    if (aiText && aiText.length > 50 && aiText.includes('فواز') && aiText.includes('اتحاد الغرف')) {
      return aiText;
    }
  } catch (err) {
    console.warn('[briefing] Gemini synthesis unavailable or timed out, using procedural engine:', err.message);
  }
  return null;
}

/**
 * Generates structured cue points for screen choreography synchronization.
 * @param {object} param
 * @returns {Array<{ target: string, label: string, timeOffset: number, textFragment?: string }>}
 */
export function generateCues({ delayedProjects, highPriorityTickets, recentDocs, delta }) {
  const isUnchanged = Boolean(delta && delta.has_prior_session && !delta.has_changes);

  const cues = [
    {
      step: 1,
      target: '#kpi-budget',
      label: isUnchanged ? 'الميزانية الإجمالية (مستقرة)' : 'الميزانية الإجمالية',
      timeOffset: 0,
      textFragment: 'الميزانية الإجمالية',
      stepTitle: 'الميزانية والصرف',
      stepIcon: '💰',
    },
  ];

  if (delayedProjects && delayedProjects.length > 0) {
    cues.push({
      step: 2,
      target: `project-${delayedProjects[0].id}`,
      label: isUnchanged ? `متابعة مشروع متأخر: ${delayedProjects[0].name}` : `مشروع متأخر: ${delayedProjects[0].name}`,
      timeOffset: 6,
      textFragment: delayedProjects[0].name,
      stepTitle: 'المشاريع المتأخرة',
      stepIcon: '⚠️',
    });
  } else {
    cues.push({
      step: 2,
      target: '#projects',
      label: 'محفظة المشاريع',
      timeOffset: 6,
      textFragment: 'المشاريع',
      stepTitle: 'محفظة المشاريع',
      stepIcon: '📊',
    });
  }

  cues.push({
    step: 3,
    target: '#tickets',
    label: (highPriorityTickets && highPriorityTickets.length > 0)
      ? (isUnchanged ? 'تذاكر عالية الأولوية (قيد المتابعة)' : 'تذاكر عالية الأولوية')
      : 'التذاكر التشغيلية',
    timeOffset: 13,
    textFragment: 'تذاكر',
    stepTitle: 'التذاكر العاجلة',
    stepIcon: '🎫',
  });

  if (recentDocs && recentDocs.length > 0) {
    const docName = recentDocs[0].title || recentDocs[0].name || 'وثيقة حديثة';
    cues.push({
      step: 4,
      target: '#docs',
      label: isUnchanged ? `مرجعية Auto-DK: ${docName}` : `وثائق Auto-DK: ${docName}`,
      timeOffset: 20,
      textFragment: docName,
      stepTitle: 'وثائق Auto-DK',
      stepIcon: '📚',
    });
  } else {
    cues.push({
      step: 4,
      target: '#docs',
      label: 'مكتبة المعرفة والبيانات',
      timeOffset: 20,
      textFragment: 'مكتبة',
      stepTitle: 'مكتبة المعرفة',
      stepIcon: '📚',
    });
  }

  cues.push({
    step: 5,
    target: '#home',
    label: isUnchanged ? 'الموجز التنفيذي (استقرار الموقف)' : 'الموجز التنفيذي الشامل',
    timeOffset: 27,
    textFragment: 'يومك',
    stepTitle: 'الموجز الشامل',
    stepIcon: '🏛️',
  });

  return cues;
}

/**
 * Aggregates all project, ticket, and document data, then synthesizes the morning executive briefing.
 * Tracks session deltas to detect if data is unchanged from previous session or yesterday.
 * @param {object} [options]
 * @returns {Promise<{ text: string, audioUrl: string, cues: Array<object>, metrics: object, delta: object }>}
 */
export async function generateExecutiveBriefing(options = {}) {
  // 1. Query projects
  const projects = await db.prepare(
    'SELECT id, name, department, status, progress, budget, spent, owner, due_date, start_date FROM projects ORDER BY id'
  ).all();

  // 2. Query open tickets
  let tickets = [];
  try {
    tickets = await db.prepare(
      "SELECT id, project_id, title, priority, status FROM tickets WHERE status != 'مغلقة' ORDER BY id ASC"
    ).all();
  } catch (err) {
    console.warn('[briefing] tickets query fallback:', err.message);
  }

  // 3. Query knowledge / Auto-DK catalog for recent documents
  let recentDocs = [];
  try {
    const kEntries = await kList();
    if (Array.isArray(kEntries) && kEntries.length > 0) {
      recentDocs = [...kEntries].reverse().slice(0, 5);
    }
  } catch (err) {
    console.warn('[briefing] knowledge catalog fallback:', err.message);
  }

  if (recentDocs.length === 0) {
    try {
      const docs = await db.prepare(
        'SELECT id, name, summary, uploaded_at FROM documents ORDER BY id DESC LIMIT 5'
      ).all();
      recentDocs = docs.map(d => ({
        id: `doc-${d.id}`,
        title: d.name,
        name: d.name,
        summary: d.summary || '',
      }));
    } catch {
      // ignore
    }
  }

  // 4. Compute metrics
  const totalProjects = projects.length;
  const totalBudget = projects.reduce((acc, p) => acc + (Number(p.budget) || 0), 0);
  const totalSpent = projects.reduce((acc, p) => acc + (Number(p.spent) || 0), 0);
  const budgetUtilization = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;
  const delayedProjects = projects.filter(p => p.status === 'متأخر');
  const inProgressProjects = projects.filter(p => p.status === 'قيد التنفيذ');
  const completedProjects = projects.filter(p => p.status === 'مكتمل');
  const stoppedProjects = projects.filter(p => p.status === 'متوقف');
  const highPriorityTickets = tickets.filter(t => t.priority === 'عالية');
  const avgProgress = totalProjects > 0
    ? Math.round(projects.reduce((acc, p) => acc + (Number(p.progress) || 0), 0) / totalProjects)
    : 0;

  const metrics = {
    total_projects: totalProjects,
    total_budget: totalBudget,
    total_spent: totalSpent,
    budget_utilization_pct: budgetUtilization,
    avg_progress_pct: avgProgress,
    delayed_projects_count: delayedProjects.length,
    delayed_projects: delayedProjects.map(p => ({
      id: p.id,
      name: p.name,
      progress: p.progress,
      owner: p.owner,
      department: p.department,
      due_date: p.due_date,
    })),
    in_progress_count: inProgressProjects.length,
    completed_count: completedProjects.length,
    stopped_count: stoppedProjects.length,
    open_tickets_count: tickets.length,
    high_priority_tickets_count: highPriorityTickets.length,
    high_priority_tickets: highPriorityTickets.map(t => ({
      id: t.id,
      title: t.title,
      project_id: t.project_id,
      priority: t.priority,
    })),
    recent_docs_count: recentDocs.length,
    recent_docs: recentDocs.map(d => ({
      id: d.id,
      title: d.title || d.name,
      summary: d.summary || '',
    })),
  };

  // 5. Build snapshot of current state for delta comparison
  const currentSnapshot = {
    timestamp: new Date().toISOString(),
    total_projects: totalProjects,
    total_budget: totalBudget,
    total_spent: totalSpent,
    budget_utilization_pct: budgetUtilization,
    avg_progress_pct: avgProgress,
    delayed_project_ids: delayedProjects.map(p => p.id),
    delayed_projects: delayedProjects.map(p => ({ id: p.id, name: p.name })),
    open_tickets_count: tickets.length,
    high_priority_ticket_ids: highPriorityTickets.map(t => t.id),
    high_priority_tickets: highPriorityTickets.map(t => ({ id: t.id, title: t.title })),
    doc_ids: recentDocs.map(d => d.id),
    recent_docs: recentDocs.map(d => ({ id: d.id, title: d.title || d.name })),
  };

  // 6. Retrieve prior session to calculate delta
  const SESSION_WINDOW_MS = 60 * 60 * 1000; // 1 hour session window
  const now = Date.now();
  let savedSession = null;
  if (!options.resetSession) {
    try {
      savedSession = await kvGet(EXECUTIVE_BRIEFING_SESSION_KEY);
    } catch (err) {
      console.warn('[briefing] kvGet session fallback:', err.message);
    }
  }

  let baselineSnapshot = null;
  if (savedSession && savedSession.active_session_at) {
    const elapsed = now - new Date(savedSession.active_session_at).getTime();
    if (elapsed > SESSION_WINDOW_MS) {
      // New session window (e.g. next day or several hours later): baseline is previous session snapshot
      baselineSnapshot = savedSession.current_snapshot || savedSession.baseline_snapshot;
    } else {
      // Within same morning session window: keep comparing against baseline established at session start
      baselineSnapshot = savedSession.baseline_snapshot;
    }
  }

  const delta = calculateBriefingDelta(currentSnapshot, baselineSnapshot, options);
  metrics.delta = delta;

  // 7. Persist session state unless dryRun is set
  if (!options.dryRun) {
    try {
      const isWithinActiveSession = savedSession && (now - new Date(savedSession.active_session_at || 0).getTime() <= SESSION_WINDOW_MS);
      const sessionToSave = {
        active_session_at: isWithinActiveSession
          ? savedSession.active_session_at
          : new Date(now).toISOString(),
        last_session_at: isWithinActiveSession
          ? (savedSession.last_session_at || null)
          : (savedSession?.active_session_at || null),
        baseline_snapshot: baselineSnapshot || currentSnapshot,
        current_snapshot: currentSnapshot,
        delta: {
          has_changes: delta.has_changes,
          is_unchanged: delta.is_unchanged,
        },
      };
      await kvSet(EXECUTIVE_BRIEFING_SESSION_KEY, sessionToSave);
    } catch (err) {
      console.warn('[briefing] kvSet session persist error:', err.message);
    }
  }

  // 8. Synthesize executive Arabic text
  let text = '';
  if (options.useAi || options.ai === 'true' || options.ai === true) {
    try {
      text = await synthesizeWithGemini({ metrics, projects, tickets, recentDocs, delta });
    } catch {
      text = '';
    }
  }

  if (!text) {
    let variant = 0;
    if (options.variant !== undefined) {
      variant = Number(options.variant) || 0;
    } else if (options.dynamic || options.randomize) {
      variant = (Math.floor(Date.now() / 1000) % 3) + 1;
    }
    text = synthesizeExecutiveText({ metrics, projects, tickets, recentDocs, variant });
  }

  // 9. Generate structured cue points for screen choreography
  const cues = generateCues({ delayedProjects, highPriorityTickets, recentDocs, delta });

  return {
    text,
    audioUrl: '/api/executive/briefing/audio',
    cues,
    metrics,
    delta,
  };
}

/**
 * Gemini Live tool declaration & run handler for Nora/Gemini interactions.
 */
export const get_executive_briefing = {
  declaration: {
    name: 'get_executive_briefing',
    description: 'يولّد ويسترجع الموجز التنفيذي الصباحي الصوتي لفواز متضمناً مؤشرات الصحة المالية، المشاريع المتأخرة، التذاكر، وثائق Auto-DK، ونقاط التزامن مع الشاشة.',
    parameters: {
      type: 'OBJECT',
      properties: {
        focus: {
          type: 'STRING',
          enum: ['all', 'budget', 'projects', 'tickets', 'documents'],
          description: 'تركيز اختياري على جانب محدد من الموجز',
        },
      },
    },
  },
  run: async (args = {}) => {
    return generateExecutiveBriefing(args);
  },
};

export const executiveTools = {
  get_executive_briefing,
};
