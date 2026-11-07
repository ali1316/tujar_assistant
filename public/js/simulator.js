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
  if (crumbEl) crumbEl.textContent = '‹ محاكاة القرارات التنفيذية';
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

        <!-- Sliders & Interactive Controls -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; margin-bottom: 20px;">
          <!-- Slider 1: Budget Delta (± 500k SAR) -->
          <div class="sim-card" style="background: rgba(14, 34, 56, 0.85); border: 1px solid var(--line); border-radius: var(--radius); padding: 18px 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
              <span style="font-weight: 600; color: var(--ink); font-size: 15px;">ضخ / خفض الميزانية (SAR)</span>
              <b id="simBudgetValue" style="font-size: 18px; color: var(--acc); direction: ltr;">+0 ر.س</b>
            </div>
            <input type="range" id="simBudgetSlider" min="-500000" max="500000" step="25000" value="${budgetDelta}"
                   style="width: 100%; accent-color: var(--acc); height: 8px; cursor: pointer; margin-bottom: 12px;">
            <div style="display: flex; justify-content: space-between; font-size: 12px; color: var(--mute); margin-bottom: 12px;">
              <span>-500 ألف ر.س (تقليص)</span>
              <span>0 (تعادل)</span>
              <span>+500 ألف ر.س (ضخ)</span>
            </div>
            <!-- Quick preset chips -->
            <div style="display: flex; flex-wrap: wrap; gap: 6px;" id="simBudgetPresets">
              <button type="button" class="chipbtn" data-b="500000" style="padding: 4px 10px; font-size: 12px;">+500 ألف</button>
              <button type="button" class="chipbtn" data-b="300000" style="padding: 4px 10px; font-size: 12px;">+300 ألف</button>
              <button type="button" class="chipbtn" data-b="100000" style="padding: 4px 10px; font-size: 12px;">+100 ألف</button>
              <button type="button" class="chipbtn" data-b="0" style="padding: 4px 10px; font-size: 12px;">تعادل (0)</button>
              <button type="button" class="chipbtn" data-b="-100000" style="padding: 4px 10px; font-size: 12px;">-100 ألف</button>
              <button type="button" class="chipbtn" data-b="-250000" style="padding: 4px 10px; font-size: 12px;">-250 ألف</button>
            </div>
          </div>

          <!-- Slider 2: Timeline Delta (± 60 days) -->
          <div class="sim-card" style="background: rgba(14, 34, 56, 0.85); border: 1px solid var(--line); border-radius: var(--radius); padding: 18px 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
              <span style="font-weight: 600; color: var(--ink); font-size: 15px;">تعديل الجدول الزمني (أيام)</span>
              <b id="simTimelineValue" style="font-size: 18px; color: var(--sand); direction: ltr;">0 يوم</b>
            </div>
            <input type="range" id="simTimelineSlider" min="-60" max="60" step="1" value="${timelineDeltaDays}"
                   style="width: 100%; accent-color: var(--sand); height: 8px; cursor: pointer; margin-bottom: 12px;">
            <div style="display: flex; justify-content: space-between; font-size: 12px; color: var(--mute); margin-bottom: 12px;">
              <span>-60 يوم (ضغط الجدول)</span>
              <span>0 (الخطة الأصلية)</span>
              <span>+60 يوم (تمديد/ترحيل)</span>
            </div>
            <!-- Quick preset chips -->
            <div style="display: flex; flex-wrap: wrap; gap: 6px;" id="simTimelinePresets">
              <button type="button" class="chipbtn" data-t="-30" style="padding: 4px 10px; font-size: 12px;">-30 يوم (تسريع)</button>
              <button type="button" class="chipbtn" data-t="-14" style="padding: 4px 10px; font-size: 12px;">-14 يوم</button>
              <button type="button" class="chipbtn" data-t="0" style="padding: 4px 10px; font-size: 12px;">0 (الأصل)</button>
              <button type="button" class="chipbtn" data-t="14" style="padding: 4px 10px; font-size: 12px;">+14 يوم</button>
              <button type="button" class="chipbtn" data-t="30" style="padding: 4px 10px; font-size: 12px;">+30 يوم</button>
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
    if (activeChart) {
      activeChart.destroy();
      activeChart = null;
    }
    mountEl.hidden = true;
    if (homeEl) homeEl.hidden = false;
    if (crumbEl) crumbEl.textContent = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  if (closeBtn) closeBtn.onclick = closeSimulator;

  // Debounced Simulation Trigger
  let simTimer = null;
  async function triggerSimulation() {
    const pId = Number(projectSelect?.value || selectedId);
    const bDelta = Number(budgetSlider?.value || 0);
    const tDelta = Number(timelineSlider?.value || 0);

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

    clearTimeout(simTimer);
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
          }),
        });

        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        currentSimulationData = data;
        updateCockpitDisplay(data);
      } catch (err) {
        console.warn('[simulator] simulate failed:', err);
      }
    }, 150);
  }

  // Update DOM with Simulation Results
  function updateCockpitDisplay(data) {
    if (!data || !data.baseline || !data.simulated) return;
    const { baseline, simulated, impactSummary, tradeOffs, portfolioImpact } = data;

    // Narrative text
    const narrEl = mountEl.querySelector('#simNarrativeText');
    if (narrEl) narrEl.textContent = impactSummary;

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

  // Event Listeners for Sliders & Project Select
  if (projectSelect) {
    projectSelect.onchange = () => {
      selectedId = Number(projectSelect.value);
      triggerSimulation();
    };
  }

  if (budgetSlider) budgetSlider.oninput = triggerSimulation;
  if (timelineSlider) timelineSlider.oninput = triggerSimulation;

  // Preset buttons
  mountEl.querySelectorAll('#simBudgetPresets button').forEach(btn => {
    btn.onclick = () => {
      if (budgetSlider) {
        budgetSlider.value = btn.dataset.b;
        triggerSimulation();
      }
    };
  });

  mountEl.querySelectorAll('#simTimelinePresets button').forEach(btn => {
    btn.onclick = () => {
      if (timelineSlider) {
        timelineSlider.value = btn.dataset.t;
        triggerSimulation();
      }
    };
  });

  if (resetBtn) {
    resetBtn.onclick = () => {
      if (budgetSlider) budgetSlider.value = 0;
      if (timelineSlider) timelineSlider.value = 0;
      triggerSimulation();
    };
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
 */
export async function openSimulatorCockpit(projectId = null) {
  const mountEl = document.querySelector('#view');
  if (!mountEl) return;
  await renderSimulatorCockpit({ mountEl, projectId });
}

// Global exposure for chat/voice and external modules
if (typeof window !== 'undefined') {
  window.renderSimulatorCockpit = renderSimulatorCockpit;
  window.openSimulatorCockpit = openSimulatorCockpit;
}
