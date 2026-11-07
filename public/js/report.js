// public/js/report.js - Boardroom One-Click Export (تقرير المعالي)
// إضافة زر "تقرير المجلس" في شريط الواجهة مع نافذة التصدير التنفيذي

// دالة مساعدة لجلب رمز الدخول إذا كان مفعلاً
function getAuthHeaders() {
  let code = '';
  try {
    code = localStorage.getItem('accessCode') || '';
  } catch {}
  return code ? { 'x-access-code': code } : {};
}

// عرض إشعار عائم (Toast Notification)
export function showToast(msg, duration = 3000) {
  let toast = document.getElementById('reportToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'reportToast';
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #0e2238;
      border: 1px solid #d1a65c;
      color: #eef2f7;
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
      z-index: 10000;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 10px;
      transition: opacity 0.3s ease, transform 0.3s ease;
      transform: translateY(20px);
      opacity: 0;
      pointer-events: none;
    `;
    document.body.appendChild(toast);
  }

  toast.innerHTML = `<span style="color:#d1a65c;font-size:16px;">✦</span> <span>${msg}</span>`;
  toast.style.opacity = '1';
  toast.style.transform = 'translateY(0)';

  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
  }, duration);
}

// بناء وتشغيل نافذة التقرير التنفيذي
export async function openReportModal() {
  let modal = document.getElementById('boardroomModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'boardroomModal';
    modal.className = 'boardroom-modal-backdrop';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'modalTitle');
    modal.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(4, 12, 20, 0.75);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      animation: fadeIn 0.25s ease-out;
    `;

    modal.innerHTML = `
      <div class="modal-card" style="
        background: #0a1b2d;
        border: 1px solid #d1a65c;
        border-radius: 14px;
        width: 100%;
        max-width: 580px;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.7);
        color: #eef2f7;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      ">
        <div style="
          padding: 18px 24px;
          border-bottom: 1px solid #1d3a5a;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: linear-gradient(90deg, #0e243c, #0a1b2d);
        ">
          <div>
            <h2 id="modalTitle" style="margin: 0; font-size: 17px; font-weight: 700; color: #d1a65c; display: flex; align-items: center; gap: 8px;">
              <span>🏛️</span> تقرير مجلس الإدارة التنفيذي (تقرير المعالي)
            </h2>
            <small style="color: #8ea3bd; font-size: 12px; margin-top: 4px; display: block;">
              اتحاد الغرف السعودية · منصة تُجّار · رؤية المملكة 2030
            </small>
          </div>
          <button type="button" id="closeModalBtn" aria-label="إغلاق النافذة" style="
            background: none;
            border: none;
            color: #8ea3bd;
            font-size: 20px;
            cursor: pointer;
            padding: 4px 8px;
            border-radius: 6px;
          ">✕</button>
        </div>

        <div id="modalBody" style="padding: 24px; max-height: 70vh; overflow-y: auto;">
          <div id="reportLoading" style="text-align: center; padding: 30px; color: #8ea3bd;">
            <div style="font-size: 24px; margin-bottom: 10px; animation: spin 1s linear infinite;">⏳</div>
            <div>جاري إعداد وتحليل مؤشرات المحفظة ورادار المخاطر…</div>
          </div>
          <div id="reportContent" style="display: none;">
            <div id="kpiPreview" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 20px;"></div>
            <div style="
              background: #081625;
              border: 1px solid #1d3a5a;
              border-radius: 8px;
              padding: 14px;
              margin-bottom: 20px;
              font-family: monospace;
              white-space: pre-wrap;
              font-size: 12px;
              line-height: 1.6;
              color: #cbd5e1;
              max-height: 190px;
              overflow-y: auto;
              direction: rtl;
            " id="reportBriefPreview"></div>

            <div style="display: flex; flex-direction: column; gap: 10px;">
              <button type="button" id="btnDownloadPdf" style="
                background: linear-gradient(135deg, #d1a65c, #b38538);
                color: #081726;
                border: none;
                border-radius: 8px;
                padding: 12px 18px;
                font-size: 14px;
                font-weight: 700;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                transition: transform 0.15s ease, filter 0.15s ease;
              ">
                <span>📄</span> تحميل تقرير PDF تنفيذي
              </button>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <button type="button" id="btnShareWhatsApp" style="
                  background: #16392e;
                  border: 1px solid #2d6a4f;
                  color: #59c48f;
                  border-radius: 8px;
                  padding: 11px 16px;
                  font-size: 13px;
                  font-weight: 600;
                  cursor: pointer;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  gap: 8px;
                ">
                  <span>💬</span> مشاركة عبر واتساب
                </button>

                <button type="button" id="btnCopyReport" style="
                  background: #14304f;
                  border: 1px solid #2b4a6c;
                  color: #eef2f7;
                  border-radius: 8px;
                  padding: 11px 16px;
                  font-size: 13px;
                  font-weight: 600;
                  cursor: pointer;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  gap: 8px;
                ">
                  <span>📋</span> نسخ التقرير المختصر
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // ربط إغلاق النافذة
    const closeModal = () => {
      modal.style.display = 'none';
      document.getElementById('btnBoardroomReport')?.focus();
    };
    modal.querySelector('#closeModalBtn').addEventListener('click', closeModal);
    modal.addEventListener('click', e => {
      if (e.target === modal) closeModal();
    });
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape' && modal.style.display !== 'none') {
        closeModal();
      }
    });
  }

  modal.style.display = 'flex';
  const loadingEl = modal.querySelector('#reportLoading');
  const contentEl = modal.querySelector('#reportContent');
  const previewEl = modal.querySelector('#reportBriefPreview');
  const kpiEl = modal.querySelector('#kpiPreview');

  loadingEl.style.display = 'block';
  contentEl.style.display = 'none';

  try {
    const res = await fetch('/api/executive/report', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify({}),
    });

    if (!res.ok) throw new Error('فشل جلب بيانات التقرير');
    const data = await res.json();

    const stats = data.metadata?.stats || {};
    kpiEl.innerHTML = `
      <div style="background:#0e243c;padding:10px;border-radius:6px;border:1px solid #1d3a5a;text-align:center;">
        <small style="color:#8ea3bd;display:block;font-size:11px;">المشاريع</small>
        <b style="color:#d1a65c;font-size:16px;">${stats.total_projects || 0}</b>
      </div>
      <div style="background:#0e243c;padding:10px;border-radius:6px;border:1px solid #1d3a5a;text-align:center;">
        <small style="color:#8ea3bd;display:block;font-size:11px;">متوسط الإنجاز</small>
        <b style="color:#59c48f;font-size:16px;">${stats.avg_progress || 0}٪</b>
      </div>
      <div style="background:#0e243c;padding:10px;border-radius:6px;border:1px solid #1d3a5a;text-align:center;">
        <small style="color:#8ea3bd;display:block;font-size:11px;">رادار المخاطر</small>
        <b style="color:#e0705f;font-size:16px;">${stats.risk_count || 0} حالات</b>
      </div>
    `;

    previewEl.textContent = data.whatsappText;

    // 1. تحميل PDF
    const btnDownload = modal.querySelector('#btnDownloadPdf');
    btnDownload.onclick = async () => {
      btnDownload.disabled = true;
      const originalText = btnDownload.innerHTML;
      btnDownload.innerHTML = '<span>⏳</span> جاري تجهيز الملف…';
      try {
        const pdfRes = await fetch('/api/executive/report/pdf', {
          headers: getAuthHeaders(),
        });
        if (!pdfRes.ok) throw new Error('فشل تنزيل ملف PDF');
        const blob = await pdfRes.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'تقرير_المجلس_التنفيذي_2026.pdf';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('✓ تم بدء تحميل تقرير PDF بنجاح');
      } catch (e) {
        showToast('❌ تعذر تحميل ملف PDF: ' + e.message);
      } finally {
        btnDownload.disabled = false;
        btnDownload.innerHTML = originalText;
      }
    };

    // 2. مشاركة واتساب
    const btnWa = modal.querySelector('#btnShareWhatsApp');
    btnWa.onclick = async () => {
      try {
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(data.whatsappText);
        }
      } catch {}
      const waUrl = `https://wa.me/?text=${encodeURIComponent(data.whatsappText)}`;
      window.open(waUrl, '_blank', 'noopener,noreferrer');
      showToast('✓ تم نسخ النص وفتح واتساب للمشاركة');
    };

    // 3. نسخ التقرير المختصر
    const btnCopy = modal.querySelector('#btnCopyReport');
    btnCopy.onclick = async () => {
      try {
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(data.whatsappText);
        } else {
          const ta = document.createElement('textarea');
          ta.value = data.whatsappText;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        showToast('✓ تم نسخ التقرير التنفيذي للحافظة بنجاح');
      } catch (e) {
        showToast('❌ تعذر النسخ: ' + e.message);
      }
    };

    loadingEl.style.display = 'none';
    contentEl.style.display = 'block';
  } catch (err) {
    loadingEl.innerHTML = `<span style="color:#e0705f;">❌ خطأ: ${err.message}</span>`;
  }
}

// إضافة زر التقرير في الشريط العلوي
export function initReportButton() {
  if (document.querySelector('.report-btn')) return;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'btnBoardroomReport';
  btn.className = 'report-btn';
  btn.setAttribute('aria-label', 'تصدير تقرير المجلس التنفيذي');
  btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg><span class="report-btn-label">تقرير المجلس</span>`;

  btn.style.cssText = `
    background: linear-gradient(135deg, rgba(209, 166, 92, 0.16), rgba(14, 34, 56, 0.7));
    border: 1px solid #d1a65c;
    color: #d1a65c;
    border-radius: 99px;
    padding: 6px 14px;
    min-height: 38px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    transition: all 0.2s ease;
    font-family: inherit;
    margin-inline-start: 12px;
  `;

  btn.addEventListener('mouseenter', () => {
    btn.style.background = 'linear-gradient(135deg, rgba(209, 166, 92, 0.28), rgba(14, 34, 56, 0.85))';
    btn.style.boxShadow = '0 0 12px rgba(209, 166, 92, 0.3)';
    btn.style.transform = 'translateY(-1px)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.background = 'linear-gradient(135deg, rgba(209, 166, 92, 0.16), rgba(14, 34, 56, 0.7))';
    btn.style.boxShadow = 'none';
    btn.style.transform = 'none';
  });

  btn.addEventListener('click', () => {
    openReportModal();
  });

  // إضافة الزر في شريط الترويسة بجانب الرقاقة أو العنوان
  const header = document.querySelector('header.top');
  if (header) {
    const chip = header.querySelector('#chip');
    if (chip) {
      header.insertBefore(btn, chip);
    } else {
      header.appendChild(btn);
    }
  } else {
    // في حال عدم وجود header، يوضع في أول الصفحة
    document.body.prepend(btn);
  }
}

// التهيئة التلقائية عند تحميل المستند
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initReportButton);
  } else {
    initReportButton();
  }
}

if (typeof window !== 'undefined') {
  window.__report = {
    open: openReportModal,
    showToast,
  };
  window.openReportModal = openReportModal;
}
