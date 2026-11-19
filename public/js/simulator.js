// public/js/simulator.js - Interactive Executive Scenario Cockpit
// غرفة محاكاة القرارات التنفيذية (What-If Scenario Cockpit)

/**
 * Format SAR currency cleanly
 */
function fmtSar(num) {
  const n = Number(num || 0);
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toLocaleString('en-US')} ر.س`;
}

function fmtNum(num) {
  return Number(num || 0).toLocaleString('en-US');
}

/**
 * Format compact numbers (e.g. 1.2M, 350K, 50K)
 */
function fmtCompact(n) {
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
function getProjectControls(project) {
  if (project?.controls?.budgetRange && project?.controls?.strategyPackages) {
    return project.controls;
  }
  const budget = Number(project?.budget || 0);
  const spent = Number(project?.spent || 0);
  const progress = Number(project?.progress || 0);
  const status = project?.status || 'قيد التنفيذ';

  let maxB = 500000;
  let minB = -300000;
  let stepB = 25000;

  if (budget > 0) {
    if (budget < 150000) {
      maxB = Math.max(25000, Math.round((budget * 0.75) / 5000) * 5000);
      minB = -Math.min(maxB, Math.max(5000, Math.round((budget * 0.5) / 5000) * 5000));
      stepB = 5000;
    } else if (budget < 800000) {
      maxB = Math.max(50000, Math.round((budget * 0.5) / 10000) * 10000);
      minB = -Math.min(maxB, Math.max(10000, Math.round((budget * 0.4) / 10000) * 10000));
      stepB = 10000;
    } else if (budget < 3000000) {
      maxB = Math.max(100000, Math.round((budget * 0.4) / 25000) * 25000);
      minB = -Math.min(maxB, Math.max(25000, Math.round((budget * 0.35) / 25000) * 25000));
      stepB = 25000;
    } else {
      maxB = Math.max(250000, Math.round((budget * 0.3) / 50000) * 50000);
      minB = -Math.min(maxB, Math.max(50000, Math.round((budget * 0.25) / 50000) * 50000));
      stepB = 50000;
    }
  }

  const isCompleted = progress >= 100 || status === 'مكتمل';
  const minT = isCompleted ? 0 : -30;
  const maxT = isCompleted ? 0 : 45;

  const halfPositive = Math.round(maxB * 0.5 / stepB) * stepB;
  const halfNegative = Math.round(minB * 0.5 / stepB) * stepB;
  const rawBudgetPresets = [
    { label: `+${fmtCompact(maxB)}`, value: maxB },
    ...(halfPositive > 0 && halfPositive < maxB ? [{ label: `+${fmtCompact(halfPositive)}`, value: halfPositive }] : []),
    { label: 'تعادل (0)', value: 0 },
    ...(halfNegative < 0 && halfNegative > minB ? [{ label: `-${fmtCompact(Math.abs(halfNegative))}`, value: halfNegative }] : []),
    { label: `-${fmtCompact(Math.abs(minB))}`, value: minB },
  ];
  const budgetPresets = rawBudgetPresets.filter((p, i, arr) => arr.findIndex(x => x.value === p.value) === i);

  const halfTimeCompress = Math.round(minT * 0.5);
  const halfTimeExtend = Math.round(maxT * 0.5);
  const rawTimelinePresets = isCompleted ? [] : [
    { label: `${minT} يوم (تسريع)`, value: minT },
    ...(halfTimeCompress < 0 && halfTimeCompress > minT ? [{ label: `${halfTimeCompress} يوم`, value: halfTimeCompress }] : []),
    { label: '0 (الأصل)', value: 0 },
    ...(halfTimeExtend > 0 && halfTimeExtend < maxT ? [{ label: `+${halfTimeExtend} يوم`, value: halfTimeExtend }] : []),
    { label: `+${maxT} يوم (تمديد)`, value: maxT },
  ];
  const timelinePresets = rawTimelinePresets.filter((p, i, arr) => arr.findIndex(x => x.value === p.value) === i);

  const strategyPackages = [];
  const bScale = budget > 0 ? budget : 1000000;

  if (status === 'متأخر' || (spent > budget && budget > 0)) {
    const rawRescue = Math.round((bScale * 0.22) / stepB) * stepB;
    const rescueB = Math.min(maxB, Math.max(stepB, rawRescue));
    strategyPackages.push({
      id: 'rescue',
      name: '🚀 خطة الإنقاذ وتدارك التأخير',
      badgeColor: '#59c48f',
      budgetDelta: rescueB,
      timelineDelta: -20,
      description: `ضخ ${fmtCompact(rescueB)} ر.س لضغط الجدول بـ 20 يوماً واستعادة مسار الإنجاز.`,
    });
    const containB = Math.max(minB, -Math.round((bScale * 0.12) / stepB) * stepB);
    strategyPackages.push({
      id: 'contain',
      name: '⚖️ احتواء العجز وإعادة الموازنة',
      badgeColor: '#e0705f',
      budgetDelta: containB,
      timelineDelta: 20,
      description: `كبح الصرف بـ ${fmtCompact(Math.abs(containB))} ر.س مع تمديد 20 يوماً لضبط السيولة.`,
    });
  } else if (status === 'متوقف' || status === 'متعثر') {
    const restartB = Math.min(maxB, Math.round((bScale * 0.25) / stepB) * stepB);
    strategyPackages.push({
      id: 'restart',
      name: '🔄 فك التعثر وتحديث التعاقد',
      badgeColor: '#d1a65c',
      budgetDelta: restartB,
      timelineDelta: 25,
      description: `تخصيص ${fmtCompact(restartB)} ر.س مع مهلة 25 يوماً لإعادة تشغيل فرق المقاولات.`,
    });
    const rescopeB = Math.max(minB, -Math.round((bScale * 0.15) / stepB) * stepB);
    strategyPackages.push({
      id: 'rescope',
      name: '✂️ تقليص النطاق (Scope Reduction)',
      badgeColor: '#e0705f',
      budgetDelta: rescopeB,
      timelineDelta: 35,
      description: `خفض النطاق يوفر ${fmtCompact(Math.abs(rescopeB))} ر.س مع ترحيل التسليم لتفادي الخسائر.`,
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
    const accelB = Math.min(maxB, Math.round((bScale * 0.18) / stepB) * stepB);
    strategyPackages.push({
      id: 'accelerate',
      name: '⚡ التدشين المبكر ومضاعفة الوتيرة',
      badgeColor: '#59c48f',
      budgetDelta: accelB,
      timelineDelta: -18,
      description: `ضخ ${fmtCompact(accelB)} ر.س لتقديم موعد الإطلاق بـ 18 يوماً.`,
    });
    const qualityB = Math.min(maxB, Math.round((bScale * 0.08) / stepB) * stepB);
    strategyPackages.push({
      id: 'quality',
      name: '🛡️ تعزيز الأمان والجودة والاعتمادية',
      badgeColor: '#38bdf8',
      budgetDelta: qualityB,
      timelineDelta: 0,
      description: `مخصص نوعي ${fmtCompact(qualityB)} ر.س للامتثال دون التأثير على الجدول الزمني.`,
    });
    const thriftB = Math.max(minB, -Math.round((bScale * 0.1) / stepB) * stepB);
    strategyPackages.push({
      id: 'thrift',
      name: '💰 ترشيد الإنفاق وتحقيق وفورات',
      badgeColor: '#d1a65c',
      budgetDelta: thriftB,
      timelineDelta: 14,
      description: `توفير ${fmtCompact(Math.abs(thriftB))} ر.س مع تمديد مرن 14 يوماً.`,
    });
  }

  return {
    hasFinancialLevers: !isCompleted || budget > spent,
    hasTimelineLevers: !isCompleted,
    isCompleted,
    componentType: isCompleted ? 'completed_audit' : 'whatif_simulator',
    budgetRange: { min: minB, max: maxB, step: stepB, presets: budgetPresets },
    timelineRange: { min: minT, max: maxT, step: 1, presets: timelinePresets },
    strategyPackages,
  };
}

let activeChart = null;
let currentSimulationData = null;
let availableProjects = [];

/**
 * Renders the Executive Scenario Cockpit inside target container (#view)
 */
export async function renderSimulatorCockpit({
  mountEl = document.querySelector('#view'),
  projectId = null,
  budgetDelta = 0,
  timelineDeltaDays = 0,
  onApply = null,
} = {}) {
  if (!mountEl) return;

  // 1. Reveal #view and hide #home
  const homeEl = document.querySelector('#home');
  const crumbEl = document.querySelector('#crumb');
  if (homeEl) homeEl.hidden = true;
  mountEl.hidden = false;
  document.body.classList.remove('blank');
  if (crumbEl) crumbEl.textContent = '› محاكاة القرارات التنفيذية';
  window.__simulatorOpen = true;
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // 2. Load projects for selection
  try {
    const apiCall = window.api || fetch;
    const res = await apiCall('/api/executive/projects');
    if (res.ok) {
      const data = await res.json();
      availableProjects = data.projects || [];
    } else {
      const dRes = await apiCall('/api/dashboard');
      const dData = await dRes.json();
      availableProjects = dData.projects || [];
    }
  } catch (e) {
    console.warn('[simulator] failed to load projects:', e);
  }

  // Fallback seed projects if empty
  if (!availableProjects || availableProjects.length === 0) {
    availableProjects = [
      { id: 1, name: 'بوابة الخدمات الإلكترونية', department: 'تقنية المعلومات', budget: 1200000, progress: 65, status: 'قيد التنفيذ' },
      { id: 2, name: 'أتمتة رخص البناء', department: 'التخطيط العمراني', budget: 850000, progress: 40, status: 'متأخر' },
      { id: 3, name: 'لوحة مؤشرات الأداء', department: 'الاستراتيجية', budget: 300000, progress: 100, status: 'مكتمل' },
      { id: 4, name: 'منصة البلاغات الذكية', department: 'خدمة المستفيدين', budget: 950000, progress: 30, status: 'قيد التنفيذ' },
      { id: 5, name: 'ترحيل الأنظمة للسحابة', department: 'تقنية المعلومات', budget: 2000000, progress: 15, status: 'متوقف' },
    ];
  }

  let selectedId = projectId ? Number(projectId) : availableProjects[0]?.id;

  // 3. Render Cockpit Template
  mountEl.innerHTML = `
    <section class="hud sim-cockpit" id="simCockpit">
      <header>
        <div>
          <div class="eyebrow">محاكاة القرارات التنفيذية · WHAT-IF SIMULATOR</div>
          <h3>غرفة نمذجة القرارات التنفيذية</h3>
          <div class="sub">دراسة فورية لأثر ضخ الميزانيات وتعديل الجداول الزمنية على الإنجاز وعائد المحفظة</div>
        </div>
        <button class="x" id="simCloseBtn" type="button" aria-label="رجوع للشاشة الأساسية">رجوع للرئيسية</button>
      </header>

      <div class="body" style="padding: 16px 20px;">
        <!-- Project Selector Bar -->
        <div class="sim-card" style="margin-bottom: 20px; background: rgba(14, 34, 56, 0.85); border: 1px solid var(--line); border-radius: var(--radius); padding: 16px 20px;">
          <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 14px;">
            <div style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 260px;">
              <label for="simProjectSelect" style="color: var(--mute); font-size: 14px; font-weight: 600; white-space: nowrap;">المشروع المستهدف:</label>
              <select id="simProjectSelect" class="chipsel" style="flex: 1; max-width: 400px; padding: 8px 12px; font-size: 15px; border-radius: 8px; background: #081726; color: var(--ink); border: 1px solid var(--line);">
                ${availableProjects.map(p => `
                  <option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>
                    #${p.id} ${p.name} (${p.department}) · ${p.status}
                  </option>
                `).join('')}
              </select>
            </div>
            <div style="display: flex; gap: 8px;">
              <span id="simCurrentStatusBadge" class="tag" style="padding: 6px 14px; font-size: 13px; font-weight: 600; border-radius: 20px; background: #16304d; color: var(--sand);">
                الحالة: قيد التنفيذ
              </span>
            </div>
          </div>
        </div>

        <!-- Strategic Decision Packages (Derived Dynamically from Project & File Context) -->
        <div class="sim-card" style="margin-bottom: 20px; background: rgba(14, 34, 56, 0.85); border: 1px solid var(--line); border-radius: var(--radius); padding: 16px 20px;">
          <div style="font-weight: 700; color: var(--sand); font-size: 14px; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span>🎯 حزم السيناريوهات الاستراتيجية المعتمدة:</span>
              <span style="font-size: 12px; color: var(--mute); font-weight: normal;">(مستخلصة ومصممة وفق واقع المشروع ومخاطره)</span>
            </div>
            <span id="simContextualBadge" style="font-size: 11px; background: #1a3a5f; color: var(--sand); padding: 2px 8px; border-radius: 4px; font-weight: 600;">مخصص للمشروع</span>
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 10px;" id="simStrategyPackages">
            <!-- Rendered dynamically by applyProjectControls -->
          </div>
        </div>

        <!-- Custom Executive AI Scenario Box -->
        <div class="sim-card" style="margin-bottom: 20px; background: rgba(14, 34, 56, 0.85); border: 1px solid var(--line); border-radius: var(--radius); padding: 16px 20px;">
          <label for="simCustomQuery" style="font-weight: 700; color: var(--sand); font-size: 14px; margin-bottom: 8px; display: block;">
            🧠 اسأل نورة عن أي سيناريو تنفيذي مخصص (AI What-If Reasoning):
          </label>
          <div style="display: flex; gap: 10px; flex-wrap: wrap;">
            <input type="text" id="simCustomQuery" placeholder="مثال: ماذا لو قمنا بدمج فريق المشروع مع فريق البنية التحتية؟"
                   style="flex: 1; min-width: 260px; padding: 10px 14px; font-size: 14px; border-radius: 8px; background: #081726; color: var(--ink); border: 1px solid var(--line);">
            <button type="button" id="simAiQueryBtn" class="chipbtn" style="padding: 10px 20px; font-size: 14px; background: linear-gradient(135deg, #2b5687, #19385c); color: #eef2f7; border: 1px solid var(--acc); font-weight: 600; white-space: nowrap; cursor: pointer;">
              محاكاة بالذكاء الاصطناعي ⚡
            </button>
          </div>
        </div>

        <!-- Sliders & Interactive Controls (Boundaries Dynamically Derived) -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; margin-bottom: 20px;">
          <!-- Slider 1: Budget Delta -->
          <div class="sim-card" style="background: rgba(14, 34, 56, 0.85); border: 1px solid var(--line); border-radius: var(--radius); padding: 18px 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
              <span style="font-weight: 600; color: var(--ink); font-size: 15px;">ضخ / خفض الميزانية (SAR)</span>
              <b id="simBudgetValue" style="font-size: 18px; color: var(--acc); direction: ltr;">+0 ر.س</b>
            </div>
            <input type="range" id="simBudgetSlider" min="-500000" max="500000" step="25000" value="${budgetDelta}"
                   style="width: 100%; accent-color: var(--acc); height: 8px; cursor: pointer; margin-bottom: 12px;">
            <div style="display: flex; justify-content: space-between; font-size: 12px; color: var(--mute); margin-bottom: 12px;">
              <span id="simMinBudgetLabel">-500 ألف ر.س (تقليص)</span>
              <span>0 (تعادل)</span>
              <span id="simMaxBudgetLabel">+500 ألف ر.س (ضخ)</span>
            </div>
            <!-- Quick preset chips -->
            <div style="display: flex; flex-wrap: wrap; gap: 6px;" id="simBudgetPresets">
              <!-- Rendered dynamically -->
            </div>
          </div>

          <!-- Slider 2: Timeline Delta -->
          <div class="sim-card" style="background: rgba(14, 34, 56, 0.85); border: 1px solid var(--line); border-radius: var(--radius); padding: 18px 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
              <span style="font-weight: 600; color: var(--ink); font-size: 15px;">تعديل الجدول الزمني (أيام)</span>
              <b id="simTimelineValue" style="font-size: 18px; color: var(--sand); direction: ltr;">0 يوم</b>
            </div>
            <input type="range" id="simTimelineSlider" min="-60" max="60" step="1" value="${timelineDeltaDays}"
                   style="width: 100%; accent-color: var(--sand); height: 8px; cursor: pointer; margin-bottom: 12px;">
            <div style="display: flex; justify-content: space-between; font-size: 12px; color: var(--mute); margin-bottom: 12px;">
              <span id="simMinTimelineLabel">-60 يوم (ضغط الجدول)</span>
              <span>0 (الخطة الأصلية)</span>
              <span id="simMaxTimelineLabel">+60 يوم (تمديد/ترحيل)</span>
            </div>
            <!-- Quick preset chips -->
            <div style="display: flex; flex-wrap: wrap; gap: 6px;" id="simTimelinePresets">
              <!-- Rendered dynamically -->
            </div>
          </div>
        </div>

        <!-- Narrative Synthesis Banner (Arabic Executive Insight) -->
        <div id="simNarrativeBanner" style="margin-bottom: 20px; background: linear-gradient(135deg, rgba(209, 166, 92, 0.15), rgba(14, 34, 56, 0.95)); border: 1px solid var(--acc); border-radius: var(--radius); padding: 18px 24px; position: relative;">
          <div style="display: flex; align-items: flex-start; gap: 14px;">
            <div style="background: var(--acc); color: #081726; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; font-weight: bold;">
              💡
            </div>
            <div style="flex: 1;">
              <div style="color: var(--sand); font-size: 13px; font-weight: 700; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">
                الاستنتاج التنفيذي والمفاضلة الاستراتيجية
              </div>
              <p id="simNarrativeText" style="margin: 0; font-size: 16px; line-height: 1.6; color: var(--ink); font-weight: 500;">
                جاري حساب أثر السيناريو…
              </p>
              <div id="simBoardRecContainer" style="margin-top: 12px; padding: 10px 14px; background: rgba(89, 196, 143, 0.12); border: 1px solid var(--ok); border-radius: 8px;">
                <span style="font-size: 12px; font-weight: 700; color: var(--ok); display: block; margin-bottom: 2px;">🏛️ توصية نورة للمجلس التنفيذي:</span>
                <span id="simBoardRecText" style="font-size: 14px; color: var(--ink);">—</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Comparative KPI Matrix: Current vs Simulated -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; margin-bottom: 22px;">
          <!-- Card 1: Budget -->
          <div class="sim-card" style="background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); padding: 16px;">
            <span style="color: var(--mute); font-size: 13px; display: block; margin-bottom: 6px;">الميزانية الإجمالية</span>
            <div style="display: flex; justify-content: space-between; align-items: baseline;">
              <div>
                <small style="color: var(--mute); font-size: 12px;">الحالية: </small>
                <span id="simBaseBudget" style="color: var(--mute); font-size: 14px;">0 ر.س</span>
              </div>
              <div style="text-align: left;">
                <b id="simSimBudget" style="font-size: 19px; color: var(--acc); display: block;">0 ر.س</b>
                <span id="simBudgetDeltaTag" style="font-size: 11px; color: var(--ok); font-weight: 600;">+0 ر.س</span>
              </div>
            </div>
          </div>

          <!-- Card 2: Projected Completion -->
          <div class="sim-card" style="background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); padding: 16px;">
            <span style="color: var(--mute); font-size: 13px; display: block; margin-bottom: 6px;">موعد الإنجاز المتوقع</span>
            <div style="display: flex; justify-content: space-between; align-items: baseline;">
              <div>
                <small style="color: var(--mute); font-size: 12px;">الحالي: </small>
                <span id="simBaseDate" style="color: var(--mute); font-size: 13px;">—</span>
              </div>
              <div style="text-align: left;">
                <b id="simSimDate" style="font-size: 18px; color: var(--sand); display: block;">—</b>
                <span id="simDateDeltaTag" style="font-size: 11px; color: var(--ok); font-weight: 600;">0 يوم</span>
              </div>
            </div>
          </div>

          <!-- Card 3: Daily Burn Rate -->
          <div class="sim-card" style="background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); padding: 16px;">
            <span style="color: var(--mute); font-size: 13px; display: block; margin-bottom: 6px;">معدل الصرف اليومي (Burn Rate)</span>
            <div style="display: flex; justify-content: space-between; align-items: baseline;">
              <div>
                <small style="color: var(--mute); font-size: 12px;">الحالي: </small>
                <span id="simBaseBurn" style="color: var(--mute); font-size: 13px;">0 ر.س/يوم</span>
              </div>
              <div style="text-align: left;">
                <b id="simSimBurn" style="font-size: 18px; color: var(--ink); display: block;">0 ر.س/يوم</b>
                <span id="simBurnDeltaTag" style="font-size: 11px; color: var(--warn); font-weight: 600;">+0%</span>
              </div>
            </div>
          </div>

          <!-- Card 4: Portfolio ROI Index -->
          <div class="sim-card" style="background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); padding: 16px;">
            <span style="color: var(--mute); font-size: 13px; display: block; margin-bottom: 6px;">مؤشر عائد المحفظة (Portfolio ROI)</span>
            <div style="display: flex; justify-content: space-between; align-items: baseline;">
              <div>
                <small style="color: var(--mute); font-size: 12px;">الحالي: </small>
                <span id="simBaseRoi" style="color: var(--mute); font-size: 13px;">0</span>
              </div>
              <div style="text-align: left;">
                <b id="simSimRoi" style="font-size: 19px; color: var(--ok); display: block;">0</b>
                <span id="simRoiDeltaTag" style="font-size: 11px; color: var(--ok); font-weight: 600;">+0</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Comparative Visual Chart Section -->
        <div class="sim-card" style="background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); padding: 20px; margin-bottom: 22px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <h4 style="margin: 0; font-size: 16px; color: var(--ink); font-weight: 700;">
              المقارنة البصرية: الخطة الحالية مقابل السيناريو المحاكى
            </h4>
            <div style="display: flex; gap: 16px; font-size: 13px;">
              <span style="display: flex; align-items: center; gap: 6px; color: var(--acc);">
                <i style="width: 12px; height: 12px; border-radius: 3px; background: var(--acc); display: inline-block;"></i>
                الوضع الحالي
              </span>
              <span style="display: flex; align-items: center; gap: 6px; color: #38bdf8;">
                <i style="width: 12px; height: 12px; border-radius: 3px; background: #38bdf8; display: inline-block;"></i>
                السيناريو المقترح
              </span>
            </div>
          </div>

          <div style="position: relative; height: 260px; width: 100%;">
            <canvas id="simChartCanvas"></canvas>
            <div id="simChartFallback" style="display: none; height: 100%; align-items: center; justify-content: center; color: var(--mute);">
              جاري تجهيز الرسم البياني…
            </div>
          </div>
        </div>

        <!-- Strategic Trade-Offs (3 Pillars) -->
        <div style="margin-bottom: 24px;">
          <h4 style="margin: 0 0 12px; font-size: 15px; color: var(--sand); font-weight: 700;">
            أبعاد المفاضلة والآثار المترتبة على القرار
          </h4>
          <div id="simTradeOffsContainer" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px;">
            <!-- Rendered dynamically -->
          </div>
        </div>

        <!-- Executive Action & Confirmation Bar -->
        <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 14px; background: rgba(14, 34, 56, 0.95); border: 1px solid var(--line); border-radius: var(--radius); padding: 18px 22px;">
          <div>
            <div style="font-weight: 700; color: var(--ink); font-size: 15px; margin-bottom: 4px;">
              هل ترغب في اعتماد هذا السيناريو رسمياً؟
            </div>
            <div style="font-size: 13px; color: var(--mute);">
              سيتم تحديث مخصصات الميزانية والجدول الزمني للمشروع في السجلات التنفيذية ومزامنتها فورياً.
            </div>
          </div>

          <div style="display: flex; gap: 10px;">
            <button type="button" id="simResetBtn" class="chipbtn" style="padding: 10px 18px; font-size: 14px; border-radius: 8px;">
              إعادة ضبط (تعادل)
            </button>
            <button type="button" id="simApplyBtn" style="background: linear-gradient(135deg, #d1a65c, #e8d3a8); color: #081726; border: none; font-weight: 700; padding: 10px 24px; font-size: 15px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 14px rgba(209, 166, 92, 0.35);">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 13l4 4L19 7"/>
              </svg>
              اعتماد التعديل في الخطة
            </button>
          </div>
        </div>

        <!-- Commit Feedback Banner -->
        <div id="simFeedbackBanner" style="display: none; margin-top: 14px; padding: 14px 18px; border-radius: 8px; background: rgba(89, 196, 143, 0.15); border: 1px solid var(--ok); color: var(--ok); font-weight: 600; font-size: 14px;">
        </div>
      </div>
    </section>
  `;

  // 4. Wire up Events & Real-time Simulation
  const projectSelect = mountEl.querySelector('#simProjectSelect');
  const budgetSlider = mountEl.querySelector('#simBudgetSlider');
  const timelineSlider = mountEl.querySelector('#simTimelineSlider');
  const budgetValue = mountEl.querySelector('#simBudgetValue');
  const timelineValue = mountEl.querySelector('#simTimelineValue');
  const closeBtn = mountEl.querySelector('#simCloseBtn');
  const resetBtn = mountEl.querySelector('#simResetBtn');
  const applyBtn = mountEl.querySelector('#simApplyBtn');
  const feedbackBanner = mountEl.querySelector('#simFeedbackBanner');

  // Close / Return to Home
  function closeSimulator() {
    window.__simulatorOpen = false;
    if (activeChart) {
      activeChart.destroy();
      activeChart = null;
    }
    mountEl.hidden = true;
    if (homeEl) homeEl.hidden = false;
    if (crumbEl) crumbEl.textContent = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    document.querySelector('#qaSim')?.focus();
  }
  window.closeSimulatorCockpit = closeSimulator;
  if (closeBtn) closeBtn.onclick = closeSimulator;

  // Debounced Simulation Trigger
  let simTimer = null;
  async function triggerSimulation(customQuery = null) {
    const pId = Number(projectSelect?.value || selectedId);
    const bDelta = Number(budgetSlider?.value || 0);
    const tDelta = Number(timelineSlider?.value || 0);
    const query = typeof customQuery === 'string' ? customQuery : (mountEl.querySelector('#simCustomQuery')?.value || '');

    // Update Slider Value Readouts
    if (budgetValue) {
      budgetValue.textContent = fmtSar(bDelta);
      budgetValue.style.color = bDelta > 0 ? 'var(--ok)' : (bDelta < 0 ? 'var(--bad)' : 'var(--acc)');
    }
    if (timelineValue) {
      const sign = tDelta > 0 ? '+' : '';
      const hint = tDelta < 0 ? ' (تسريع)' : (tDelta > 0 ? ' (تمديد)' : '');
      timelineValue.textContent = `${sign}${tDelta} يوم${hint}`;
      timelineValue.style.color = tDelta < 0 ? 'var(--ok)' : (tDelta > 0 ? 'var(--warn)' : 'var(--sand)');
    }

    const narrEl = mountEl.querySelector('#simNarrativeText');
    if (narrEl && query) {
      narrEl.textContent = `جاري استدعاء نموذج نورة بالذكاء الاصطناعي لتحليل: "${query}"…`;
    }

    clearTimeout(simTimer);
    const delay = query ? 0 : 150;
    simTimer = setTimeout(async () => {
      try {
        const apiCall = window.api || fetch;
        const res = await apiCall('/api/executive/simulate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: pId,
            budgetDelta: bDelta,
            timelineDeltaDays: tDelta,
            scenarioQuery: query || undefined,
          }),
        });

        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        currentSimulationData = data;
        updateCockpitDisplay(data);
      } catch (err) {
        console.warn('[simulator] simulate failed:', err);
      }
    }, delay);
  }

  // Update DOM with Simulation Results
  function updateCockpitDisplay(data) {
    if (!data || !data.baseline || !data.simulated) return;
    const { baseline, simulated, impactSummary, tradeOffs, portfolioImpact } = data;

    // Narrative text
    const narrEl = mountEl.querySelector('#simNarrativeText');
    if (narrEl) narrEl.textContent = impactSummary;

    // Board recommendation
    const boardRecEl = mountEl.querySelector('#simBoardRecText');
    if (boardRecEl) {
      boardRecEl.textContent = data.boardRecommendation || 'يوصى بالمتابعة الدورية ومواءمة خطط التنفيذ مع الإدارات الشقيقة.';
    }

    // Status badge
    const statusBadge = mountEl.querySelector('#simCurrentStatusBadge');
    if (statusBadge) {
      statusBadge.textContent = `الحالة الحالية: ${baseline.status} ➔ المتوقعة: ${simulated.status}`;
      statusBadge.className = `tag ${simulated.status}`;
    }

    // Budget card
    const baseBudget = mountEl.querySelector('#simBaseBudget');
    const simBudget = mountEl.querySelector('#simSimBudget');
    const bDeltaTag = mountEl.querySelector('#simBudgetDeltaTag');
    if (baseBudget) baseBudget.textContent = fmtSar(baseline.budget);
    if (simBudget) simBudget.textContent = fmtSar(simulated.budget);
    if (bDeltaTag) {
      bDeltaTag.textContent = fmtSar(simulated.budgetDelta);
      bDeltaTag.style.color = simulated.budgetDelta >= 0 ? 'var(--ok)' : 'var(--bad)';
    }

    // Date card
    const baseDate = mountEl.querySelector('#simBaseDate');
    const simDate = mountEl.querySelector('#simSimDate');
    const dDeltaTag = mountEl.querySelector('#simDateDeltaTag');
    if (baseDate) baseDate.textContent = baseline.projectedCompletionDate;
    if (simDate) simDate.textContent = simulated.projectedCompletionDate;
    if (dDeltaTag) {
      const shift = simulated.completionDateDeltaDays;
      dDeltaTag.textContent = shift > 0 ? `تقديم ${shift} يوم` : (shift < 0 ? `تأخير ${Math.abs(shift)} يوم` : 'نفس الموعد');
      dDeltaTag.style.color = shift >= 0 ? 'var(--ok)' : 'var(--bad)';
    }

    // Burn rate card
    const baseBurn = mountEl.querySelector('#simBaseBurn');
    const simBurn = mountEl.querySelector('#simSimBurn');
    const burnDeltaTag = mountEl.querySelector('#simBurnDeltaTag');
    if (baseBurn) baseBurn.textContent = `${fmtNum(baseline.dailyBurnRate)} ر.س/يوم`;
    if (simBurn) simBurn.textContent = `${fmtNum(simulated.dailyBurnRate)} ر.س/يوم`;
    if (burnDeltaTag) {
      burnDeltaTag.textContent = `${simulated.burnRateDeltaPercent > 0 ? '+' : ''}${simulated.burnRateDeltaPercent}%`;
      burnDeltaTag.style.color = simulated.burnRateDeltaPercent <= 0 ? 'var(--ok)' : 'var(--warn)';
    }

    // Portfolio ROI card
    const baseRoi = mountEl.querySelector('#simBaseRoi');
    const simRoi = mountEl.querySelector('#simSimRoi');
    const roiDeltaTag = mountEl.querySelector('#simRoiDeltaTag');
    if (baseRoi) baseRoi.textContent = `${portfolioImpact.baselineRoiIndex} نقطة`;
    if (simRoi) simRoi.textContent = `${portfolioImpact.simulatedRoiIndex} نقطة`;
    if (roiDeltaTag) {
      const rDelta = portfolioImpact.roiDelta;
      roiDeltaTag.textContent = `${rDelta > 0 ? '+' : ''}${rDelta} نقطة`;
      roiDeltaTag.style.color = rDelta >= 0 ? 'var(--ok)' : 'var(--bad)';
    }

    // Trade-offs list
    const tradeOffsContainer = mountEl.querySelector('#simTradeOffsContainer');
    if (tradeOffsContainer && Array.isArray(tradeOffs)) {
      tradeOffsContainer.innerHTML = tradeOffs.map(t => {
        const isGood = t.type === 'advantage';
        const color = isGood ? 'var(--ok)' : (t.type === 'drawback' ? 'var(--warn)' : 'var(--steel)');
        return `
          <div style="background: rgba(14, 34, 56, 0.7); border: 1px solid var(--line); border-right: 4px solid ${color}; border-radius: var(--radius); padding: 14px 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <span style="font-size: 12px; color: var(--mute);">${t.pillar}</span>
              <span style="font-size: 12px; color: ${color}; font-weight: 700;">${t.title}</span>
            </div>
            <p style="margin: 0; font-size: 13.5px; line-height: 1.5; color: var(--ink);">
              ${t.description}
            </p>
          </div>
        `;
      }).join('');
    }

    // Comparative Visual Chart
    renderChart(baseline, simulated);
  }

  // Render Chart.js
  function renderChart(baseline, simulated) {
    const canvas = mountEl.querySelector('#simChartCanvas');
    if (!canvas) return;

    if (!window.Chart) {
      const fb = mountEl.querySelector('#simChartFallback');
      if (fb) {
        fb.style.display = 'flex';
        fb.innerHTML = `
          <div style="width: 100%; text-align: center;">
            <p>الميزانية: ${fmtSar(baseline.budget)} ➔ ${fmtSar(simulated.budget)}</p>
            <p>أيام الإنجاز المتبقية: ${baseline.remainingDays} يوم ➔ ${simulated.remainingDays} يوم</p>
          </div>
        `;
      }
      return;
    }

    if (activeChart) {
      activeChart.destroy();
    }

    const ctx = canvas.getContext('2d');
    activeChart = new window.Chart(ctx, {
      type: 'bar',
      data: {
        labels: [
          'الميزانية (بآلاف ر.س)',
          'الأيام المتبقية للإنجاز',
          'معدل الحرق اليومي (عشرات ر.س)',
        ],
        datasets: [
          {
            label: 'الوضع الحالي',
            data: [
              Math.round(baseline.budget / 1000),
              baseline.remainingDays,
              Math.round(baseline.dailyBurnRate / 10),
            ],
            backgroundColor: '#d1a65c',
            borderRadius: 6,
          },
          {
            label: 'السيناريو المقترح',
            data: [
              Math.round(simulated.budget / 1000),
              simulated.remainingDays,
              Math.round(simulated.dailyBurnRate / 10),
            ],
            backgroundColor: '#38bdf8',
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            rtl: true,
            titleFont: { family: "'IBM Plex Sans Arabic', sans-serif" },
            bodyFont: { family: "'IBM Plex Sans Arabic', sans-serif" },
          },
        },
        scales: {
          x: {
            grid: { color: 'rgba(29, 58, 90, 0.4)' },
            ticks: {
              color: '#8ea3bd',
              font: { family: "'IBM Plex Sans Arabic', sans-serif", size: 12 },
            },
          },
          y: {
            grid: { color: 'rgba(29, 58, 90, 0.4)' },
            ticks: {
              color: '#8ea3bd',
              font: { family: "'IBM Plex Sans Arabic', sans-serif", size: 12 },
            },
          },
        },
      },
    });
  }

  // Dynamic Project Controls & UI Component Synchronization
  function applyProjectControls(proj) {
    if (!proj) return;
    const controls = getProjectControls(proj);
    const { budgetRange, timelineRange, strategyPackages, isCompleted } = controls;

    // 1. Synchronize Budget Slider
    if (budgetSlider && budgetRange) {
      budgetSlider.min = budgetRange.min;
      budgetSlider.max = budgetRange.max;
      budgetSlider.step = budgetRange.step;
      const curB = Number(budgetSlider.value || 0);
      if (curB > budgetRange.max) budgetSlider.value = budgetRange.max;
      if (curB < budgetRange.min) budgetSlider.value = budgetRange.min;
    }
    const minBudgetLabel = mountEl.querySelector('#simMinBudgetLabel');
    const maxBudgetLabel = mountEl.querySelector('#simMaxBudgetLabel');
    if (minBudgetLabel && budgetRange) {
      minBudgetLabel.textContent = `-${fmtCompact(Math.abs(budgetRange.min))} ر.س (تقليص)`;
    }
    if (maxBudgetLabel && budgetRange) {
      maxBudgetLabel.textContent = `+${fmtCompact(budgetRange.max)} ر.س (ضخ)`;
    }

    // 2. Synchronize Timeline Slider
    if (timelineSlider && timelineRange) {
      if (isCompleted) {
        timelineSlider.disabled = true;
        timelineSlider.value = 0;
        timelineSlider.min = 0;
        timelineSlider.max = 0;
        timelineSlider.style.opacity = '0.35';
      } else {
        timelineSlider.disabled = false;
        timelineSlider.style.opacity = '1';
        timelineSlider.min = timelineRange.min;
        timelineSlider.max = timelineRange.max;
        timelineSlider.step = timelineRange.step || 1;
        const curT = Number(timelineSlider.value || 0);
        if (curT > timelineRange.max) timelineSlider.value = timelineRange.max;
        if (curT < timelineRange.min) timelineSlider.value = timelineRange.min;
      }
    }
    const minTimeLabel = mountEl.querySelector('#simMinTimelineLabel');
    const maxTimeLabel = mountEl.querySelector('#simMaxTimelineLabel');
    if (minTimeLabel && timelineRange) {
      minTimeLabel.textContent = isCompleted ? 'مكتمل' : `${timelineRange.min} يوم (تسريع)`;
    }
    if (maxTimeLabel && timelineRange) {
      maxTimeLabel.textContent = isCompleted ? 'مكتمل' : `+${timelineRange.max} يوم (تمديد)`;
    }

    // 3. Render Strategy Packages Dynamically based on file/project state
    const pkgContainer = mountEl.querySelector('#simStrategyPackages');
    if (pkgContainer && Array.isArray(strategyPackages)) {
      pkgContainer.innerHTML = strategyPackages.map((pkg, idx) => `
        <button type="button" class="sim-pkg-btn" data-b="${pkg.budgetDelta}" data-t="${pkg.timelineDelta}" data-pkg-id="${pkg.id || idx}" style="padding: 12px 16px; text-align: right; background: #0c2238; border: 1px solid #1f4268; border-radius: 10px; cursor: pointer; transition: all 0.22s ease; width: 100%; display: flex; flex-direction: column; gap: 4px; position: relative; box-shadow: 0 2px 6px rgba(0,0,0,0.25);">
          <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
            <b style="color: ${pkg.badgeColor || 'var(--sand)'}; font-size: 13.5px; font-weight: 700;">${pkg.name}</b>
            <span class="pkg-status-tag" style="font-size: 11px; color: var(--mute); background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.14); padding: 2px 8px; border-radius: 20px; font-weight: 600;">تطبيق ⚡</span>
          </div>
          <small style="color: var(--mute); font-size: 11.5px; line-height: 1.4; display: block;">${pkg.description || `${fmtSar(pkg.budgetDelta)} · ${pkg.timelineDelta} يوم`}</small>
        </button>
      `).join('');

      const buttons = pkgContainer.querySelectorAll('.sim-pkg-btn');
      buttons.forEach(btn => {
        // Hover micro-interactions
        btn.onmouseenter = () => {
          if (!btn.classList.contains('active-pkg')) {
            btn.style.borderColor = 'var(--acc)';
            btn.style.background = '#102742';
            btn.style.transform = 'translateY(-2px)';
            btn.style.boxShadow = '0 6px 16px rgba(0,0,0,0.45)';
          }
        };
        btn.onmouseleave = () => {
          if (!btn.classList.contains('active-pkg')) {
            btn.style.borderColor = '#1f4268';
            btn.style.background = '#0c2238';
            btn.style.transform = 'none';
            btn.style.boxShadow = '0 2px 6px rgba(0,0,0,0.25)';
          }
        };

        // Click handler: applies values, visual highlight, and dispatches events
        btn.onclick = (e) => {
          e.preventDefault();

          // Reset all siblings
          buttons.forEach(b => {
            b.classList.remove('active-pkg');
            b.style.borderColor = '#1f4268';
            b.style.background = '#0c2238';
            b.style.transform = 'none';
            b.style.boxShadow = '0 2px 6px rgba(0,0,0,0.25)';
            const tag = b.querySelector('.pkg-status-tag');
            if (tag) {
              tag.textContent = 'تطبيق ⚡';
              tag.style.background = 'rgba(255,255,255,0.06)';
              tag.style.color = 'var(--mute)';
              tag.style.borderColor = 'rgba(255,255,255,0.14)';
            }
          });

          // Set active state on clicked button
          btn.classList.add('active-pkg');
          btn.style.borderColor = 'var(--acc)';
          btn.style.background = 'linear-gradient(135deg, rgba(209, 166, 92, 0.24), #0c2238)';
          btn.style.boxShadow = '0 0 18px rgba(209, 166, 92, 0.38)';
          btn.style.transform = 'translateY(-1px)';
          const activeTag = btn.querySelector('.pkg-status-tag');
          if (activeTag) {
            activeTag.textContent = '✓ مفعّل الآن';
            activeTag.style.background = 'var(--acc)';
            activeTag.style.color = '#081726';
            activeTag.style.fontWeight = '700';
            activeTag.style.borderColor = 'var(--acc)';
          }

          // Apply values to sliders and dispatch events so all listeners react
          const bVal = Number(btn.dataset.b || 0);
          const tVal = Number(btn.dataset.t || 0);

          isApplyingPackage = true;
          try {
            if (budgetSlider) {
              budgetSlider.value = bVal;
              budgetSlider.dispatchEvent(new Event('input', { bubbles: true }));
              budgetSlider.dispatchEvent(new Event('change', { bubbles: true }));
            }
            if (timelineSlider && !isCompleted) {
              timelineSlider.value = tVal;
              timelineSlider.dispatchEvent(new Event('input', { bubbles: true }));
              timelineSlider.dispatchEvent(new Event('change', { bubbles: true }));
            }
          } finally {
            isApplyingPackage = false;
          }

          triggerSimulation();
        };
      });
    }

    // 4. Render Budget Presets Dynamically
    const bPresetsContainer = mountEl.querySelector('#simBudgetPresets');
    if (bPresetsContainer && budgetRange && Array.isArray(budgetRange.presets)) {
      bPresetsContainer.innerHTML = budgetRange.presets.map(p => `
        <button type="button" class="chipbtn" data-b="${p.value}" style="padding: 4px 10px; font-size: 12px; cursor: pointer; border-radius: 6px; border: 1px solid #1f4268;">${p.label}</button>
      `).join('');

      bPresetsContainer.querySelectorAll('button').forEach(btn => {
        btn.onclick = (e) => {
          e.preventDefault();
          if (budgetSlider) {
            budgetSlider.value = btn.dataset.b;
            budgetSlider.dispatchEvent(new Event('input', { bubbles: true }));
            budgetSlider.dispatchEvent(new Event('change', { bubbles: true }));
            triggerSimulation();
          }
        };
      });
    }

    // 5. Render Timeline Presets Dynamically
    const tPresetsContainer = mountEl.querySelector('#simTimelinePresets');
    if (tPresetsContainer && timelineRange && Array.isArray(timelineRange.presets)) {
      if (isCompleted) {
        tPresetsContainer.innerHTML = `<span style="font-size: 12px; color: var(--ok); font-weight: 600;">المشروع مكتمل 100% · لا توجد تعديلات زمنية مطلوبة</span>`;
      } else {
        tPresetsContainer.innerHTML = timelineRange.presets.map(p => `
          <button type="button" class="chipbtn" data-t="${p.value}" style="padding: 4px 10px; font-size: 12px; cursor: pointer; border-radius: 6px; border: 1px solid #1f4268;">${p.label}</button>
        `).join('');

        tPresetsContainer.querySelectorAll('button').forEach(btn => {
          btn.onclick = (e) => {
            e.preventDefault();
            if (timelineSlider && !isCompleted) {
              timelineSlider.value = btn.dataset.t;
              timelineSlider.dispatchEvent(new Event('input', { bubbles: true }));
              timelineSlider.dispatchEvent(new Event('change', { bubbles: true }));
              triggerSimulation();
            }
          };
        });
      }
    }

    // 6. Update Status Badge & Context Tag
    const statusBadge = mountEl.querySelector('#simCurrentStatusBadge');
    if (statusBadge) {
      statusBadge.textContent = `الحالة: ${proj.status || 'قيد التنفيذ'} (${proj.progress || 0}%)`;
      statusBadge.className = `tag ${proj.status || ''}`;
    }
  }

  let isApplyingPackage = false;

  // Helper to clear package selection if user moves sliders manually
  function clearPackageActiveSelection() {
    mountEl.querySelectorAll('.sim-pkg-btn.active-pkg').forEach(b => {
      b.classList.remove('active-pkg');
      b.style.borderColor = '#1f4268';
      b.style.background = '#0c2238';
      b.style.boxShadow = '0 2px 6px rgba(0,0,0,0.25)';
      b.style.transform = 'none';
      const tag = b.querySelector('.pkg-status-tag');
      if (tag) {
        tag.textContent = 'تطبيق ⚡';
        tag.style.background = 'rgba(255,255,255,0.06)';
        tag.style.color = 'var(--mute)';
        tag.style.borderColor = 'rgba(255,255,255,0.14)';
      }
    });
  }

  // Event Listeners for Sliders & Project Select
  if (projectSelect) {
    projectSelect.onchange = () => {
      selectedId = Number(projectSelect.value);
      const currProj = availableProjects.find(p => Number(p.id) === selectedId);
      if (currProj) applyProjectControls(currProj);
      triggerSimulation();
    };
  }

  if (budgetSlider) {
    budgetSlider.oninput = (e) => {
      if (!isApplyingPackage && e?.isTrusted !== false) {
        clearPackageActiveSelection();
      }
      triggerSimulation();
    };
  }
  if (timelineSlider) {
    timelineSlider.oninput = (e) => {
      if (!isApplyingPackage && e?.isTrusted !== false) {
        clearPackageActiveSelection();
      }
      triggerSimulation();
    };
  }

  // Custom AI Scenario query
  const customQueryInput = mountEl.querySelector('#simCustomQuery');
  const aiQueryBtn = mountEl.querySelector('#simAiQueryBtn');
  if (aiQueryBtn) {
    aiQueryBtn.onclick = () => {
      const q = customQueryInput?.value?.trim();
      triggerSimulation(q || 'تحليل ومحاكاة استراتيجية للسيناريو التنفيذي');
    };
  }
  if (customQueryInput) {
    customQueryInput.onkeydown = e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        aiQueryBtn?.click();
      }
    };
  }

  if (resetBtn) {
    resetBtn.onclick = () => {
      clearPackageActiveSelection();
      if (budgetSlider) budgetSlider.value = 0;
      if (timelineSlider) timelineSlider.value = 0;
      triggerSimulation();
    };
  }

  // Initial synchronization for active project
  const initialProj = availableProjects.find(p => Number(p.id) === selectedId) || availableProjects[0];
  if (initialProj) {
    applyProjectControls(initialProj);
  }

  // Action Button: "اعتماد التعديل في الخطة"
  if (applyBtn) {
    applyBtn.onclick = async () => {
      if (!currentSimulationData || !currentSimulationData.simulated) return;
      const { simulated } = currentSimulationData;

      applyBtn.disabled = true;
      applyBtn.style.opacity = '0.6';

      try {
        const apiCall = window.api || fetch;
        const res = await apiCall('/api/executive/apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: simulated.projectId,
            budgetDelta: simulated.budgetDelta,
            timelineDeltaDays: simulated.timelineDeltaDays,
            newBudget: simulated.budget,
            newDueDate: simulated.projectedCompletionDate,
            newStatus: simulated.status,
          }),
        });

        const reply = await res.json();
        if (feedbackBanner) {
          feedbackBanner.style.display = 'block';
          feedbackBanner.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
              <span>✅</span>
              <span>${reply.message || 'تم اعتماد التعديل في الخطة وتحديث سجلات المشروع بنجاح.'}</span>
            </div>
          `;
        }

        // Refresh dashboard and risk radar dynamically in the UI
        if (typeof window.loadDashboard === 'function') {
          window.loadDashboard();
        }
        if (window.__radar?.refresh) {
          window.__radar.refresh();
        }

        // Voice announcement via speech if Nora or audio is active
        if (window.__nora?.status) {
          window.__nora.status('✅ تم اعتماد الخطة التنفيذية وتحديث الموازنة والمواعيد');
        }

        if (typeof onApply === 'function') {
          onApply(reply);
        }
      } catch (err) {
        if (feedbackBanner) {
          feedbackBanner.style.display = 'block';
          feedbackBanner.style.color = 'var(--bad)';
          feedbackBanner.style.borderColor = 'var(--bad)';
          feedbackBanner.textContent = `❌ فشل اعتماد الخطة: ${err.message}`;
        }
      } finally {
        setTimeout(() => {
          applyBtn.disabled = false;
          applyBtn.style.opacity = '1';
        }, 1200);
      }
    };
  }

  // Initial simulation run
  triggerSimulation();
}

/**
 * Open the simulator cockpit from anywhere in the application
 * Supports passing a project ID, document ID, or options object
 */
export async function openSimulatorCockpit(arg = null) {
  const mountEl = document.querySelector('#view');
  if (!mountEl) return;
  const opts = typeof arg === 'object' && arg !== null && !Array.isArray(arg) ? arg : { projectId: arg };
  await renderSimulatorCockpit({ mountEl, ...opts });
}

// Global exposure for chat/voice and external modules
if (typeof window !== 'undefined') {
  window.renderSimulatorCockpit = renderSimulatorCockpit;
  window.openSimulatorCockpit = openSimulatorCockpit;
}
