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
 * Format compact numbers (e.g. 1.2M, 350K, 50K)
 */
export function fmtCompact(n) {
  const num = Math.abs(Number(n || 0));
  if (num >= 1000000) {
    const val = (num / 1000000).toFixed(1).replace(/\.0$/, '');
    return `${val}M`;
  }
  if (num >= 1000) {
    const val = (num / 1000).toFixed(0);
    return `${val}K`;
  }
  return String(num);
}

/**
 * Derives content-driven control parameters, slider boundaries, clean steps,
 * and context-tailored accelerator packages from the project/file's actual state.
 */
export function deriveProjectControls(project, baselineRemainingDays = 30) {
  const budget = Number(project?.budget || 0);
  const spent = Number(project?.spent || 0);
  const progress = Math.min(100, Math.max(0, Number(project?.progress || 0)));
  const status = project?.status || 'قيد التنفيذ';

  // 1. Dynamic Budget Slider Bounds based on actual project budget
  let maxBudgetDelta = 500000;
  let minBudgetDelta = -300000;
  let budgetStep = 25000;

  if (budget > 0) {
    if (budget < 150000) {
      maxBudgetDelta = Math.max(25000, Math.round((budget * 0.75) / 5000) * 5000);
      minBudgetDelta = -Math.min(maxBudgetDelta, Math.max(5000, Math.round((budget * 0.5) / 5000) * 5000));
      budgetStep = 5000;
    } else if (budget < 800000) {
      maxBudgetDelta = Math.max(50000, Math.round((budget * 0.5) / 10000) * 10000);
      minBudgetDelta = -Math.min(maxBudgetDelta, Math.max(10000, Math.round((budget * 0.4) / 10000) * 10000));
      budgetStep = 10000;
    } else if (budget < 3000000) {
      maxBudgetDelta = Math.max(100000, Math.round((budget * 0.4) / 25000) * 25000);
      minBudgetDelta = -Math.min(maxBudgetDelta, Math.max(25000, Math.round((budget * 0.35) / 25000) * 25000));
      budgetStep = 25000;
    } else {
      maxBudgetDelta = Math.max(250000, Math.round((budget * 0.3) / 50000) * 50000);
      minBudgetDelta = -Math.min(maxBudgetDelta, Math.max(50000, Math.round((budget * 0.25) / 50000) * 50000));
      budgetStep = 50000;
    }
  }

  // Generate 5-6 clean budget preset chips derived from max/min
  const halfPositive = Math.round(maxBudgetDelta * 0.5 / budgetStep) * budgetStep;
  const halfNegative = Math.round(minBudgetDelta * 0.5 / budgetStep) * budgetStep;
  const rawBudgetPresets = [
    { label: `+${fmtCompact(maxBudgetDelta)}`, value: maxBudgetDelta },
    ...(halfPositive > 0 && halfPositive < maxBudgetDelta ? [{ label: `+${fmtCompact(halfPositive)}`, value: halfPositive }] : []),
    { label: 'تعادل (0)', value: 0 },
    ...(halfNegative < 0 && halfNegative > minBudgetDelta ? [{ label: `-${fmtCompact(Math.abs(halfNegative))}`, value: halfNegative }] : []),
    { label: `-${fmtCompact(Math.abs(minBudgetDelta))}`, value: minBudgetDelta },
  ];
  // Deduplicate
  const budgetPresets = rawBudgetPresets.filter((p, i, arr) => arr.findIndex(x => x.value === p.value) === i);

  // 2. Dynamic Timeline Slider Bounds based on remaining duration & planned duration
  const isCompleted = progress >= 100 || status === 'مكتمل';
  let minTimelineDelta = -30;
  let maxTimelineDelta = 45;
  let timelineStep = 1;

  if (isCompleted) {
    minTimelineDelta = 0;
    maxTimelineDelta = 0;
  } else if (baselineRemainingDays > 0) {
    maxTimelineDelta = Math.max(14, Math.min(180, Math.round(baselineRemainingDays * 0.65)));
    minTimelineDelta = -Math.max(7, Math.min(Math.max(5, baselineRemainingDays - 5), Math.round(baselineRemainingDays * 0.5)));
    timelineStep = baselineRemainingDays > 120 ? 5 : 1;
  }

  const halfTimeCompress = Math.round(minTimelineDelta * 0.5);
  const halfTimeExtend = Math.round(maxTimelineDelta * 0.5);
  const rawTimelinePresets = isCompleted ? [] : [
    { label: `${minTimelineDelta} يوم (تسريع)`, value: minTimelineDelta },
    ...(halfTimeCompress < 0 && halfTimeCompress > minTimelineDelta ? [{ label: `${halfTimeCompress} يوم`, value: halfTimeCompress }] : []),
    { label: '0 (الأصل)', value: 0 },
    ...(halfTimeExtend > 0 && halfTimeExtend < maxTimelineDelta ? [{ label: `+${halfTimeExtend} يوم`, value: halfTimeExtend }] : []),
    { label: `+${maxTimelineDelta} يوم (تمديد)`, value: maxTimelineDelta },
  ];
  const timelinePresets = rawTimelinePresets.filter((p, i, arr) => arr.findIndex(x => x.value === p.value) === i);

  // 3. Dynamic Strategy Packages (Accelerators) derived from actual status & deficits
  const strategyPackages = [];
  const bScale = budget > 0 ? budget : 1000000;
  const remDays = Math.max(15, baselineRemainingDays);

  if (status === 'متأخر' || (spent > budget && budget > 0)) {
    const deficit = spent > budget ? spent - budget : 0;
    const rawRescue = Math.max(deficit * 1.25, bScale * 0.22);
    const rescueBudget = Math.min(maxBudgetDelta, Math.max(budgetStep, Math.round(rawRescue / budgetStep) * budgetStep));
    const rescueDays = Math.max(minTimelineDelta, -Math.max(10, Math.round(remDays * 0.35)));

    strategyPackages.push({
      id: 'rescue',
      name: '🚀 خطة الإنقاذ وتدارك التأخير',
      badgeColor: '#59c48f',
      budgetDelta: rescueBudget,
      timelineDelta: rescueDays,
      description: `ضخ ${fmtCompact(rescueBudget)} ر.س لضغط الجدول بـ ${Math.abs(rescueDays)} يوماً واستعادة المسار الحرج.`,
    });

    const rawContain = Math.round((bScale * 0.12) / budgetStep) * budgetStep;
    const containBudget = Math.max(minBudgetDelta, -rawContain);
    const containDays = Math.min(maxTimelineDelta, Math.round(remDays * 0.3));

    strategyPackages.push({
      id: 'contain',
      name: '⚖️ احتواء العجز وإعادة الموازنة',
      badgeColor: '#e0705f',
      budgetDelta: containBudget,
      timelineDelta: containDays,
      description: `كبح الصرف بـ ${fmtCompact(Math.abs(containBudget))} ر.س مع تمديد ${containDays} يوماً لضبط السيولة.`,
    });
  } else if (status === 'متوقف' || status === 'متعثر') {
    const rawRestart = Math.round((bScale * 0.25) / budgetStep) * budgetStep;
    const restartBudget = Math.min(maxBudgetDelta, rawRestart);
    const restartDays = Math.min(maxTimelineDelta, Math.round(remDays * 0.3));

    strategyPackages.push({
      id: 'restart',
      name: '🔄 فك التعثر وتحديث التعاقد',
      badgeColor: '#d1a65c',
      budgetDelta: restartBudget,
      timelineDelta: restartDays,
      description: `تخصيص ${fmtCompact(restartBudget)} ر.س مع مهلة ${restartDays} يوماً لإعادة تشغيل فرق المقاولات.`,
    });

    const rawRescope = Math.round((bScale * 0.15) / budgetStep) * budgetStep;
    const rescopeBudget = Math.max(minBudgetDelta, -rawRescope);
    const rescopeDays = Math.min(maxTimelineDelta, Math.round(remDays * 0.4));

    strategyPackages.push({
      id: 'rescope',
      name: '✂️ تقليص النطاق (Scope Reduction)',
      badgeColor: '#e0705f',
      budgetDelta: rescopeBudget,
      timelineDelta: rescopeDays,
      description: `خفض النطاق يوفر ${fmtCompact(Math.abs(rescopeBudget))} ر.س مع ترحيل التسليم لتفادي الخسائر.`,
    });
  } else if (isCompleted) {
    strategyPackages.push({
      id: 'audit_close',
      name: '📑 الإغلاق المالي والتدقيق النهائي',
      badgeColor: '#59c48f',
      budgetDelta: 0,
      timelineDelta: 0,
      description: 'المشروع مكتمل بنسبة 100%. اعتماد المطابقات المالية ومراجعة فترات الضمان.',
    });

    const surplus = budget > spent ? budget - spent : 0;
    if (surplus > 0) {
      strategyPackages.push({
        id: 'reallocate',
        name: '💸 تحرير الوفر المالي للمحفظة',
        badgeColor: '#38bdf8',
        budgetDelta: -surplus,
        timelineDelta: 0,
        description: `تحرير الفائض البالغ ${fmtCompact(surplus)} ر.س لإعادة توجيهه لدعم مشاريع أخرى.`,
      });
    }
  } else {
    // Normal / In Progress
    const rawAccel = Math.round((bScale * 0.18) / budgetStep) * budgetStep;
    const accelBudget = Math.min(maxBudgetDelta, rawAccel);
    const accelDays = Math.max(minTimelineDelta, -Math.max(10, Math.round(remDays * 0.25)));

    strategyPackages.push({
      id: 'accelerate',
      name: '⚡ التدشين المبكر ومضاعفة الوتيرة',
      badgeColor: '#59c48f',
      budgetDelta: accelBudget,
      timelineDelta: accelDays,
      description: `ضخ ${fmtCompact(accelBudget)} ر.س لتقديم موعد الإطلاق بـ ${Math.abs(accelDays)} يوماً.`,
    });

    const rawQuality = Math.round((bScale * 0.08) / budgetStep) * budgetStep;
    const qualityBudget = Math.min(maxBudgetDelta, rawQuality);

    strategyPackages.push({
      id: 'quality',
      name: '🛡️ تعزيز الأمان والجودة والاعتمادية',
      badgeColor: '#38bdf8',
      budgetDelta: qualityBudget,
      timelineDelta: 0,
      description: `مخصص نوعي ${fmtCompact(qualityBudget)} ر.س للامتثال دون التأثير على الجدول الزمني.`,
    });

    const rawThrift = Math.round((bScale * 0.1) / budgetStep) * budgetStep;
    const thriftBudget = Math.max(minBudgetDelta, -rawThrift);
    const thriftDays = Math.min(maxTimelineDelta, Math.max(7, Math.round(remDays * 0.15)));

    strategyPackages.push({
      id: 'thrift',
      name: '💰 ترشيد الإنفاق وتحقيق وفورات',
      badgeColor: '#d1a65c',
      budgetDelta: thriftBudget,
      timelineDelta: thriftDays,
      description: `توفير ${fmtCompact(Math.abs(thriftBudget))} ر.س مع تمديد مرن ${thriftDays} يوماً.`,
    });
  }

  return {
    hasFinancialLevers: !isCompleted || budget > spent,
    hasTimelineLevers: !isCompleted,
    isCompleted,
    componentType: isCompleted ? 'completed_audit' : 'whatif_simulator',
    budgetRange: {
      min: minBudgetDelta,
      max: maxBudgetDelta,
      step: budgetStep,
      presets: budgetPresets,
    },
    timelineRange: {
      min: minTimelineDelta,
      max: maxTimelineDelta,
      step: timelineStep,
      presets: timelinePresets,
    },
    strategyPackages,
  };
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

  const controls = deriveProjectControls(project, baselineRemainingDays);

  return {
    ok: true,
    capabilities: controls,
    budgetRange: controls.budgetRange,
    timelineRange: controls.timelineRange,
    strategyPackages: controls.strategyPackages,
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
