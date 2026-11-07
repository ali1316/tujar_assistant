// src/executive/briefing.js - Morning Executive Audio Briefing for Fawaz (الموجز التنفيذي الصباحي)
import { db } from '../../db.js';
import { kList } from '../../knowledge.js';

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
 * Synthesizes a natural, high-level spoken executive summary in Saudi business dialect for Fawaz/Nora.
 * Target duration: 30-45 seconds when spoken (~80-95 words).
 * @param {object} param
 * @returns {string}
 */
export function synthesizeExecutiveText({ metrics, projects, tickets, recentDocs }) {
  const {
    total_budget = 0,
    total_spent = 0,
    budget_utilization_pct = 0,
    delayed_projects = [],
    open_tickets_count = 0,
    high_priority_tickets_count = 0,
    high_priority_tickets = [],
    avg_progress_pct = 0,
  } = metrics;

  const budgetStr = formatCurrencyArabic(total_budget);
  const spentStr = formatCurrencyArabic(total_spent);

  let text = `صباح الخير أستاذ فواز. هذا الموجز التنفيذي الصباحي لمحفظة مشاريع التحول الرقمي في اتحاد الغرف ومنصة تُجّار. `;
  text += `الميزانية الإجمالية المعتمدة تبلغ ${budgetStr}، تم صرف ${spentStr} بنسبة استغلال بلغت ${budget_utilization_pct} بالمئة. `;

  if (delayed_projects.length > 0) {
    const mainDelayed = delayed_projects[0];
    const delayPhrase = delayed_projects.length > 1
      ? `لدينا ${delayed_projects.length} مشاريع متأخرة تتطلب انتباهكم`
      : 'لدينا مشروع متأخر يتطلب انتباهكم';
    text += `${delayPhrase}، وهو مشروع «${mainDelayed.name}» بنسبة إنجاز ${mainDelayed.progress} بالمئة. `;
  } else {
    text += `وكافة المشاريع تسير وفق الخطة الزمنية المعتمدة بمتوسط إنجاز ${avg_progress_pct} بالمئة دون أي تأخيرات حرجة. `;
  }

  if (high_priority_tickets_count > 0) {
    const topTicket = high_priority_tickets[0];
    text += `وعلى الصعيد التشغيلي، توجد ${open_tickets_count} تذاكر مفتوحة، من بينها ${high_priority_tickets_count} تذاكر ذات أولوية عالية تتصدرها تذكرة «${topTicket.title}». `;
  } else {
    text += `وعلى الصعيد التشغيلي، العمليات مستقرة وتوجد ${open_tickets_count} تذاكر روتينية قيد المعالجة. `;
  }

  if (recentDocs && recentDocs.length > 0) {
    const topDoc = recentDocs[0];
    text += `وفي مكتبة الوثائق الذكية Auto-DK، تم مؤخراً استيراد وتحليل «${topDoc.title || topDoc.name}». `;
  } else {
    text += `ومكتبة البيانات والمعرفة Auto-DK جاهزة ومحدثة بالكامل. `;
  }

  text += `نحن على أتم الاستعداد لأي توجيهات أو تفاصيل إضافية تطلبها، ونتمنى لك يوماً مثمراً وموفقاً.`;

  return text.trim();
}

/**
 * Generates structured cue points for screen choreography synchronization.
 * @param {object} param
 * @returns {Array<{ target: string, label: string, timeOffset: number, textFragment?: string }>}
 */
export function generateCues({ delayedProjects, highPriorityTickets, recentDocs }) {
  const cues = [
    {
      target: '#kpi-budget',
      label: 'الميزانية الإجمالية',
      timeOffset: 0,
      textFragment: 'الميزانية الإجمالية',
    },
  ];

  if (delayedProjects && delayedProjects.length > 0) {
    cues.push({
      target: `project-${delayedProjects[0].id}`,
      label: `مشروع متأخر: ${delayedProjects[0].name}`,
      timeOffset: 8,
      textFragment: delayedProjects[0].name,
    });
  } else {
    cues.push({
      target: '#projects',
      label: 'محفظة المشاريع',
      timeOffset: 8,
      textFragment: 'المشاريع',
    });
  }

  cues.push({
    target: '#tickets',
    label: (highPriorityTickets && highPriorityTickets.length > 0) ? 'تذاكر عالية الأولوية' : 'التذاكر التشغيلية',
    timeOffset: 18,
    textFragment: 'تذاكر',
  });

  if (recentDocs && recentDocs.length > 0) {
    const docName = recentDocs[0].title || recentDocs[0].name || 'وثيقة حديثة';
    cues.push({
      target: '#docs',
      label: `وثائق Auto-DK: ${docName}`,
      timeOffset: 26,
      textFragment: docName,
    });
  } else {
    cues.push({
      target: '#docs',
      label: 'مكتبة المعرفة والبيانات',
      timeOffset: 26,
      textFragment: 'مكتبة',
    });
  }

  cues.push({
    target: '#home',
    label: 'الموجز التنفيذي الشامل',
    timeOffset: 34,
    textFragment: 'يومك',
  });

  return cues;
}

/**
 * Aggregates all project, ticket, and document data, then synthesizes the morning executive briefing.
 * @param {object} [options]
 * @returns {Promise<{ text: string, audioUrl: string, cues: Array<object>, metrics: object }>}
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

  // 5. Synthesize executive Arabic text
  const text = synthesizeExecutiveText({ metrics, projects, tickets, recentDocs });

  // 6. Generate structured cue points for screen choreography
  const cues = generateCues({ delayedProjects, highPriorityTickets, recentDocs });

  return {
    text,
    audioUrl: '/api/executive/briefing/audio',
    cues,
    metrics,
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
