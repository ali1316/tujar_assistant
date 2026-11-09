// src/executive/simulator.js - What-If Scenario Simulator for Executive Decisions
// محاكاة القرارات التنفيذية: دراسة أثر ضخ/خفض الميزانيات وتعديل الجداول الزمنية
import { db } from '../../db.js';
import { ai } from '../ai.js';

/**
 * Format numbers cleanly in Arabic context
 */
function fmtSar(num) {
  return Number(num || 0).toLocaleString('en-US') + ' ر.س';
}

/**
 * Simulates executive decision scenarios on a given project and calculates portfolio ripple effects.
 *
 * @param {Object} params
 * @param {number|string} [params.projectId] - ID of project to simulate
 * @param {string} [params.projectName] - Name of project (if ID not provided)
 * @param {number} [params.budgetDelta=0] - Financial change in SAR (+injection, -cut)
 * @param {number} [params.timelineDeltaDays=0] - Timeline shift in days (+delay, -compression)
 * @param {string} [params.targetStatus] - Optional target status override
 * @returns {Promise<Object>} Scenario projection result with baseline, simulated, impactSummary, tradeOffs, and portfolioImpact
 */
export async function simulateScenario({
  projectId,
  projectName,
  budgetDelta = 0,
  timelineDeltaDays = 0,
  targetStatus,
  scenarioQuery,
} = {}) {
  // 1. Fetch all portfolio projects
  const allProjects = await db.prepare('SELECT * FROM projects').all();
  if (!allProjects || allProjects.length === 0) {
    throw new Error('لا توجد مشاريع مسجلة في قاعدة البيانات للمحاكاة');
  }

  // 2. Resolve target project
  let project = null;
  if (projectId != null) {
    const idNum = Number(projectId);
    project = allProjects.find(p => Number(p.id) === idNum);
    if (!project) {
      throw new Error(`مشروع غير موجود برقم المعرّف: ${projectId}`);
    }
  } else if (projectName) {
    const term = String(projectName).trim().toLowerCase();
    project = allProjects.find(p => String(p.name).toLowerCase().includes(term));
    if (!project) {
      throw new Error(`لم يتم العثور على مشروع باسم: «${projectName}»`);
    }
  } else {
    // Default to the first in-progress or delayed project
    project = allProjects.find(p => p.status === 'متأخر' || p.status === 'قيد التنفيذ') || allProjects[0];
  }

  // 3. Extract baseline parameters
  const budget = Number(project.budget || 0);
  const spent = Number(project.spent || 0);
  const progress = Math.min(100, Math.max(0, Number(project.progress || 0)));
  const startDate = new Date(project.start_date || '2026-01-01');
  const dueDate = new Date(project.due_date || '2026-12-31');

  // Baseline time calculations
  const plannedDurationDays = Math.max(30, Math.round((dueDate.getTime() - startDate.getTime()) / 86400000));
  const referenceDate = new Date('2026-09-01'); // Standard reference anchor or current date
  const elapsedDays = Math.max(15, Math.round((referenceDate.getTime() - startDate.getTime()) / 86400000));

  // Baseline Velocity & Burn-rate
  // Planned duration across the lifecycle
  const baselineDailyBurnRate = Math.round(Math.max(1000, budget) / plannedDurationDays);
  const baselineVelocity = progress > 0 ? (progress / elapsedDays) : (100 / plannedDurationDays);
  const remainingProgress = Math.max(0, 100 - progress);
  const baselineRemainingDays = progress >= 100 ? 0 : Math.max(1, Math.round(remainingProgress / Math.max(0.05, baselineVelocity)));

  const baselineProjectedDateObj = new Date(referenceDate.getTime() + baselineRemainingDays * 86400000);
  const baselineProjectedDate = baselineProjectedDateObj.toISOString().split('T')[0];
  const baselineProjectedCost = spent + Math.round(baselineRemainingDays * (spent > 0 ? spent / elapsedDays : baselineDailyBurnRate));
  const baselineCostVariance = baselineProjectedCost - budget;

  // Baseline Project ROI / Performance index (0 - 100)
  const costRatio = Math.max(0.1, spent / Math.max(1, budget));
  const baselineRoiIndex = Number(Math.min(100, Math.max(10, (progress / (costRatio * 100)) * 75)).toFixed(1));

  // 4. Mathematical Model for Simulated Scenario
  const bDelta = Math.max(-10000000, Math.min(10000000, Number(budgetDelta || 0)));
  const tDelta = Math.max(-365, Math.min(365, Number(timelineDeltaDays || 0)));
  const simulatedBudget = Math.max(10000, budget + bDelta);

  // Velocity boost / slowdown from budget changes
  // In project management economics, injecting capital adds resources with diminishing elasticity (~0.55)
  let budgetDaysSaved = 0;
  if (bDelta > 0) {
    const relBudgetIncrease = bDelta / Math.max(100000, budget);
    const boostFactor = 1 + Math.min(0.85, relBudgetIncrease * 0.55);
    budgetDaysSaved = Math.round(baselineRemainingDays * (1 - 1 / boostFactor));
  } else if (bDelta < 0) {
    const relBudgetCut = Math.abs(bDelta) / Math.max(100000, budget);
    const penaltyFactor = Math.max(0.35, 1 - relBudgetCut * 0.65);
    budgetDaysSaved = -Math.round(baselineRemainingDays * ((1 / penaltyFactor) - 1));
  }

  // Net timeline change:
  // - budgetDaysSaved reduces remaining days
  // + tDelta adds days (if positive, e.g. delay/extension) or compresses (if negative)
  const netDaysShift = tDelta - budgetDaysSaved;
  const simulatedRemainingDays = Math.max(0, baselineRemainingDays + netDaysShift);
  const simCompDateObj = new Date(referenceDate.getTime() + simulatedRemainingDays * 86400000);
  const simulatedCompletionDate = simCompDateObj.toISOString().split('T')[0];
  const daysSavedOrDelayed = baselineRemainingDays - simulatedRemainingDays; // positive = earlier, negative = delayed

  // Simulated Burn-rate:
  // Reflects overall planned expenditure rate under the simulated scenario
  const simulatedLifecycleDays = Math.max(15, plannedDurationDays - daysSavedOrDelayed);
  const simulatedDailyBurnRate = Math.round(simulatedBudget / simulatedLifecycleDays);
  const burnRateDeltaPercent = baselineDailyBurnRate > 0
    ? Math.round(((simulatedDailyBurnRate - baselineDailyBurnRate) / baselineDailyBurnRate) * 100)
    : 0;

  const simulatedProjectedCost = spent + Math.round(simulatedRemainingDays * (spent > 0 ? spent / elapsedDays : simulatedDailyBurnRate));
  const simulatedCostVariance = simulatedProjectedCost - simulatedBudget;

  // Simulated Status Determination
  let simulatedStatus = targetStatus || project.status;
  if (!targetStatus) {
    if (simCompDateObj.getTime() <= dueDate.getTime()) {
      if (project.status === 'متأخر') simulatedStatus = 'قيد التنفيذ';
    } else if (simCompDateObj.getTime() > (dueDate.getTime() + 15 * 86400000)) {
      if (project.status === 'قيد التنفيذ') simulatedStatus = 'متأخر';
    }
  }

  // Simulated Project ROI index
  const simCostRatio = Math.max(0.1, simulatedProjectedCost / Math.max(1, simulatedBudget));
  const simulatedRoiIndex = Number(Math.min(100, Math.max(10, ((progress + (daysSavedOrDelayed > 0 ? 10 : 0)) / (simCostRatio * 100)) * 75)).toFixed(1));

  // 5. Portfolio Ripple Effects & ROI index
  const totalPortfolioBudget = allProjects.reduce((acc, p) => acc + Number(p.budget || 0), 0);
  const totalPortfolioSpent = allProjects.reduce((acc, p) => acc + Number(p.spent || 0), 0);
  const simulatedPortfolioBudget = totalPortfolioBudget + bDelta;

  const baselinePortfolioRoi = Number(
    (allProjects.reduce((acc, p) => acc + (Number(p.progress || 0) * (Number(p.budget || 0) / Math.max(1, totalPortfolioBudget))), 0)).toFixed(1)
  );

  const portfolioRoiDelta = Number((((simulatedRoiIndex - baselineRoiIndex) * (budget / Math.max(1, totalPortfolioBudget)))).toFixed(1));
  const simulatedPortfolioRoi = Number((baselinePortfolioRoi + portfolioRoiDelta).toFixed(1));

  const capitalPressurePercent = totalPortfolioBudget > 0
    ? Number(((bDelta / totalPortfolioBudget) * 100).toFixed(1))
    : 0;

  // Siblings & remaining projects impact
  const affectedProjects = allProjects
    .filter(p => Number(p.id) !== Number(project.id))
    .map(p => {
      const sameDept = p.department === project.department;
      let riskLevel = 'منخفض';
      let note = 'أثر تشغيلي محدود، استقرار في المخصصات المعتمدة.';

      if (bDelta > 0 && sameDept) {
        riskLevel = 'متوسط';
        note = `احتمال منافسة على الموارد البشرية والتقنية داخل إدارة ${p.department}.`;
      } else if (bDelta > 300000) {
        riskLevel = 'متوسط';
        note = `ضغط سيولة بقيمة ${fmtSar(bDelta)} على مستوى المحفظة العامة.`;
      } else if (bDelta < 0 && sameDept) {
        riskLevel = 'منخفض';
        note = `إمكانية إعادة توجيه الفائض التمويلي لدعم هذا المشروع (${p.name}).`;
      }

      return {
        id: p.id,
        name: p.name,
        department: p.department,
        status: p.status,
        budget: Number(p.budget),
        riskLevel,
        note,
      };
    });

  // 6. Executive Narrative Synthesis & AI-Powered Scenario Reasoning
  let impactSummary = '';
  const daysNum = Math.abs(daysSavedOrDelayed);
  const burnAbs = Math.abs(burnRateDeltaPercent);
  const deltaAbsStr = Math.abs(bDelta).toLocaleString('en-US');

  // Deterministic baseline heuristics
  if (bDelta > 0) {
    if (daysSavedOrDelayed > 0) {
      impactSummary = `ضخ ${deltaAbsStr} ريال يسرّع إطلاق ${project.name} بـ ${daysNum} يوماً، مع زيادة عبء الصرف بنسبة ${burnAbs}%.`;
    } else if (daysSavedOrDelayed < 0) {
      impactSummary = `ضخ ${deltaAbsStr} ريال مع تمديد الجدول بـ ${Math.abs(tDelta)} يوماً يخفف الاختناقات التشغيلية، مع ضبط عبء الصرف بنسبة ${burnRateDeltaPercent > 0 ? '+' : ''}${burnRateDeltaPercent}%.`;
    } else {
      impactSummary = `ضخ ${deltaAbsStr} ريال يدعم استقرار تسليم ${project.name} في الموعد المحدد دون تغيير في مدة الإنجاز.`;
    }
  } else if (bDelta < 0) {
    if (daysSavedOrDelayed < 0) {
      impactSummary = `خفض ${deltaAbsStr} ريال يقلّص أعباء الصرف بنسبة ${burnAbs}%، لكنه يؤخر تسليم ${project.name} بـ ${daysNum} يوماً.`;
    } else {
      impactSummary = `خفض ${deltaAbsStr} ريال يوفّر في النفقات المباشرة مع الحفاظ على وتيرة التنفيذ الأساسية.`;
    }
  } else {
    if (daysSavedOrDelayed > 0) {
      impactSummary = `تسريع الجدول الزمني لـ ${project.name} بـ ${daysNum} يوماً يتطلب تكثيف الجهد ورفع وتيرة الحرق اليومي بنسبة ${burnAbs}%.`;
    } else if (daysSavedOrDelayed < 0) {
      impactSummary = `تمديد الجدول الزمني لـ ${project.name} بـ ${daysNum} يوماً يخفض معدل الحرق اليومي بنسبة ${burnAbs}% لكنه يرحّل التسليم.`;
    } else {
      impactSummary = `الإبقاء على خطة ${project.name} الحالية دون أي تعديل في الميزانية أو الجدول الزمني.`;
    }
  }

  // 7. Structured Trade-offs (3 Pillars)
  let tradeOffs = [
    {
      pillar: 'الجدول الزمني والجاهزية',
      type: daysSavedOrDelayed >= 0 ? 'advantage' : 'drawback',
      title: daysSavedOrDelayed >= 0 ? 'تقليص المدة الزمنية' : 'تأخر في موعد الجاهزية',
      description: daysSavedOrDelayed >= 0
        ? `تقديم تاريخ التسليم المتوقع إلى ${simulatedCompletionDate} (كسب ${daysNum} يوماً إضافياً لتمكين الأعمال).`
        : `تأجيل تاريخ التسليم المتوقع إلى ${simulatedCompletionDate} (تراجع ${daysNum} يوماً عن الخطة الأساسية).`,
    },
    {
      pillar: 'السيولة ومعدل الحرق',
      type: burnRateDeltaPercent <= 0 ? 'advantage' : 'drawback',
      title: burnRateDeltaPercent <= 0 ? 'انخفاض وتيرة استهلاك السيولة' : 'ارتفاع عبء الصرف اليومي',
      description: burnRateDeltaPercent <= 0
        ? `انخفاض معدل الحرق اليومي بنسبة ${burnAbs}% ليصل إلى ${fmtSar(simulatedDailyBurnRate)}/يوم.`
        : `ارتفاع معدل الحرق اليومي بنسبة ${burnAbs}% ليصل إلى ${fmtSar(simulatedDailyBurnRate)}/يوم لتغطية متطلبات الإسراع.`,
    },
    {
      pillar: 'أثر المحفظة والعائد',
      type: portfolioRoiDelta >= 0 ? 'advantage' : 'neutral',
      title: portfolioRoiDelta >= 0 ? 'تعزيز مؤشر كفاءة المحفظة' : 'ضغط تمويلي على مخصصات المحفظة',
      description: portfolioRoiDelta >= 0
        ? `تحسن مؤشر عائد المحفظة إلى ${simulatedPortfolioRoi} نقطة (فارق ${portfolioRoiDelta > 0 ? '+' : ''}${portfolioRoiDelta})، مع ضغط سيولة يقدر بـ ${capitalPressurePercent}%.`
        : `استقرار مؤشر عائد المحفظة عند ${simulatedPortfolioRoi} نقطة، مع الحاجة لإعادة موازنة مخصصات المشاريع الشقيقة.`,
    },
  ];

  let boardRecommendation = (daysSavedOrDelayed > 0 && bDelta <= 300000)
    ? `يوصى باعتماد السيناريو لكونه يكسب ${daysNum} يوماً إضافياً في الجاهزية مع هامش مخاطرة مالي مقبول.`
    : (bDelta < 0 && daysSavedOrDelayed < -20)
    ? `لا يوصى بالخفض الشديد للميزانية لتجنب ترحيل التسليم وإرباك مواعيد الإطلاق الرسمية.`
    : `اعتماد المراجعة الدورية مع مدراء المشاريع لمتابعة وتيرة الصرف الفعلية وتجنب الانحرافات.`;

  // AI-Powered Strategic Scenario Reasoning (Gemini)
  if (ai && scenarioQuery) {
    try {
      let tickets = [];
      try {
        tickets = await db.prepare('SELECT title, priority, status FROM tickets WHERE project_id=?').all(project.id);
      } catch {}

      const prompt = `أنت كبير مستشاري إدارة المشاريع والمحافظ الاستثمارية لاتحاد الغرف السعودية (منصة تجار).
قم بتحليل سيناريو القرار التنفيذي (What-If Simulation) التالي وقدم تحليلاً عميقاً وتوصيات استراتيجية:

المشروع: ${project.name} (${project.department})
الحالة الحالية: ${project.status} · الإنجاز: ${progress}%
الميزانية الحالية: ${budget.toLocaleString('en-US')} ر.س · المنصرف: ${spent.toLocaleString('en-US')} ر.س
التذاكر والمخاطر المفتوحة: ${tickets?.map(t => t.title).join('، ') || 'لا توجد تذاكر مسجلة'}

السيناريو المحاكى:
- تعديل الميزانية: ${bDelta > 0 ? '+' : ''}${bDelta.toLocaleString('en-US')} ر.س (الميزانية الناتجة: ${simulatedBudget.toLocaleString('en-US')} ر.س)
- تعديل الجدول الزمني: ${tDelta > 0 ? '+' : ''}${tDelta} يوماً
- الموعد المتوقع الجديد: ${simulatedCompletionDate} (فارق ${daysSavedOrDelayed > 0 ? 'تسريع بـ' : 'تأخر بـ'} ${daysNum} يوماً)
- معدل الحرق اليومي: ${simulatedDailyBurnRate.toLocaleString('en-US')} ر.س/يوم (تغير ${burnRateDeltaPercent}%)
${scenarioQuery ? `- استفسار أو سيناريو مخصص من القيادة التنفيذية: "${scenarioQuery}"` : ''}

المطلوب: توليد رد JSON صالح فقط بالشكل التالي دون نصوص إضافية:
{
  "impactSummary": "تحليل تنفيذي مكثف من جملتين إلى ثلاث يبرز أثر القرار على المشروع والمحفظة",
  "boardRecommendation": "توصية حاسمة ومحددة للمجلس التنفيذي أو معالي الأمين العام",
  "tradeOffs": [
    { "pillar": "الجدول الزمني والجاهزية", "type": "advantage أو drawback", "title": "عنوان موجز ومباشر", "description": "شرح الأثر بدقة" },
    { "pillar": "السيولة ومعدل الحرق", "type": "advantage أو drawback", "title": "عنوان موجز ومباشر", "description": "شرح التدفق المالي" },
    { "pillar": "الحوكمة والمخاطر التشغيلية", "type": "advantage أو drawback أو neutral", "title": "عنوان موجز ومباشر", "description": "الأثر على الموردين والموارد والامتثال" }
  ]
}`;

      const aiCall = ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
      const timeout = new Promise(resolve => setTimeout(() => resolve(null), 3500));
      const res = await Promise.race([aiCall, timeout]);

      if (res?.text) {
        const clean = res.text.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(clean);
        if (parsed.impactSummary) impactSummary = parsed.impactSummary;
        if (parsed.boardRecommendation) boardRecommendation = parsed.boardRecommendation;
        if (Array.isArray(parsed.tradeOffs) && parsed.tradeOffs.length >= 2) {
          tradeOffs = parsed.tradeOffs;
        }
      }
    } catch (e) {
      console.warn('[simulator/ai] reasoning note:', e.message);
    }
  }

  return {
    ok: true,
    baseline: {
      projectId: project.id,
      projectName: project.name,
      department: project.department,
      budget,
      spent,
      progress,
      status: project.status,
      startDate: project.start_date,
      dueDate: project.due_date,
      projectedCompletionDate: baselineProjectedDate,
      remainingDays: baselineRemainingDays,
      dailyBurnRate: baselineDailyBurnRate,
      costVariance: baselineCostVariance,
      roiIndex: baselineRoiIndex,
    },
    simulated: {
      projectId: project.id,
      projectName: project.name,
      budgetDelta: bDelta,
      timelineDeltaDays: tDelta,
      budget: simulatedBudget,
      projectedBudget: simulatedBudget,
      spent,
      progress,
      status: simulatedStatus,
      projectedCompletionDate: simulatedCompletionDate,
      remainingDays: simulatedRemainingDays,
      completionDateDeltaDays: daysSavedOrDelayed,
      dailyBurnRate: simulatedDailyBurnRate,
      burnRateDeltaPercent,
      costVariance: simulatedCostVariance,
      roiIndex: simulatedRoiIndex,
    },
    impactSummary,
    narrative: impactSummary,
    boardRecommendation,
    tradeOffs,
    portfolioImpact: {
      baselineRoiIndex: baselinePortfolioRoi,
      simulatedRoiIndex: simulatedPortfolioRoi,
      roiDelta: portfolioRoiDelta,
      totalPortfolioBudget,
      simulatedPortfolioBudget,
      capitalPressurePercent,
      affectedProjects,
    },
  };
}

/**
 * Gemini tool definition for voice and chat agents
 */
export const simulate_scenario = {
  declaration: {
    name: 'simulate_scenario',
    description: 'محاكاة القرارات التنفيذية وسيناريوهات المشاريع (What-If): قياس أثر تعديل الميزانية والجدول الزمني على موعد الإنجاز ومعدل الحرق ومؤشر المحفظة مع توليد سرد تنفيذي للقرارات والمفاضلات.',
    parameters: {
      type: 'OBJECT',
      properties: {
        projectId: {
          type: 'INTEGER',
          description: 'معرّف المشروع الرقمي المراد محاكاته (اختياري إذا تم تحديد الاسم)',
        },
        projectName: {
          type: 'STRING',
          description: 'اسم أو جزء من اسم المشروع (مثل: «أتمتة رخص البناء»، «بوابة الخدمات»)',
        },
        budgetDelta: {
          type: 'NUMBER',
          description: 'قيمة التعديل المالي بالريال (+300000 لضخ ميزانية، -100000 لخفض الميزانية)',
        },
        timelineDeltaDays: {
          type: 'INTEGER',
          description: 'تعديل الجدول الزمني بالأيام (+14 للتأجيل أو التمديد، -14 للضغط أو التسريع)',
        },
        targetStatus: {
          type: 'STRING',
          enum: ['قيد التنفيذ', 'متأخر', 'مكتمل', 'متوقف'],
          description: 'الحالة المستهدفة للمشروع (اختياري)',
        },
      },
    },
  },
  run: async (args = {}) => {
    return await simulateScenario(args);
  },
};
