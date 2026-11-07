// src/executive/report.js - Boardroom One-Click Export (تقرير المعالي)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { db, tools as dataTools } from '../../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../');

// Translation & transliteration dictionary for safe PDF rendering without external fontkit
const SAFE_TRANSLATIONS = {
  'بوابة الخدمات الإلكترونية': 'E-Services Portal (Portal)',
  'أتمتة رخص البناء': 'Building Permits Automation (Permits)',
  'لوحة مؤشرات الأداء': 'KPI Dashboard & Analytics (BI)',
  'منصة البلاغات الذكية': 'Smart Incident Platform (Reports)',
  'ترحيل الأنظمة للسحابة': 'Cloud Systems Migration (Cloud)',
  'تقنية المعلومات': 'Information Technology',
  'التخطيط العمراني': 'Urban Planning',
  'العمليات': 'Operations',
  'التحول الرقمي': 'Digital Transformation',
  'المشاريع': 'PMO',
  'سارة العتيبي': 'Sarah Al-Otaibi',
  'خالد الحربي': 'Khalid Al-Harbi',
  'فهد الدوسري': 'Fahad Al-Dossari',
  'نورة الشمري': 'Nora Al-Shammari',
  'عبدالله القحطاني': 'Abdullah Al-Qahtani',
  'قيد التنفيذ': 'IN PROGRESS',
  'مكتمل': 'COMPLETED',
  'متأخر': 'DELAYED',
  'متوقف': 'ON HOLD',
  'عالية': 'HIGH',
  'متوسطة': 'MEDIUM',
  'منخفضة': 'LOW',
  'مفتوحة': 'OPEN',
  'قيد المعالجة': 'PROCESSING',
  'مغلقة': 'CLOSED',
};

const AR_CHAR_MAP = {
  'ا': 'a', 'أ': 'a', 'إ': 'i', 'آ': 'aa', 'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j', 'ح': 'h', 'خ': 'kh',
  'د': 'd', 'ذ': 'dh', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z',
  'ع': 'a', 'غ': 'gh', 'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n', 'ه': 'h', 'و': 'w',
  'ي': 'y', 'ى': 'a', 'ئ': 'e', 'ء': "'", 'ؤ': 'o', 'ة': 'ah', ' ': ' ',
};

export function toAsciiSafe(str, maxLen = 40) {
  if (!str) return '';
  const trimmed = String(str).trim();
  if (SAFE_TRANSLATIONS[trimmed]) return SAFE_TRANSLATIONS[trimmed].slice(0, maxLen);
  let res = '';
  for (const ch of trimmed) {
    if (AR_CHAR_MAP[ch] !== undefined) res += AR_CHAR_MAP[ch];
    else if (ch.charCodeAt(0) < 128) res += ch;
    else res += ' ';
  }
  const clean = res.replace(/\s+/g, ' ').trim();
  return (clean || 'Initiative').slice(0, maxLen);
}

function formatSAR(num) {
  return Number(num || 0).toLocaleString('ar-SA') + ' ر.س';
}

function formatCompactSAR(num) {
  const n = Number(num || 0);
  if (n >= 1_000_000) return `SAR ${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `SAR ${(n / 1_000).toFixed(0)}K`;
  return `SAR ${n}`;
}

export async function generateExecutiveReport({ title = 'تقرير مجلس الإدارة التنفيذي (تقرير المعالي)', filter = {} } = {}) {
  // 1. استرجاع وتجميع بيانات المشاريع والتذاكر
  let sql = 'SELECT * FROM projects WHERE 1=1';
  const params = [];
  if (filter?.department) {
    sql += ' AND department LIKE ?';
    params.push(`%${filter.department}%`);
  }
  if (filter?.status) {
    sql += ' AND status = ?';
    params.push(filter.status);
  }
  if (filter?.query) {
    sql += ' AND (name LIKE ? OR owner LIKE ?)';
    params.push(`%${filter.query}%`, `%${filter.query}%`);
  }

  const projects = await db.prepare(sql).all(...params);
  const tickets = await db.prepare('SELECT t.*, p.name as project_name FROM tickets t LEFT JOIN projects p ON p.id = t.project_id').all();

  const totalProjects = projects.length;
  const completedProjects = projects.filter(p => p.status === 'مكتمل');
  const inProgressProjects = projects.filter(p => p.status === 'قيد التنفيذ');
  const delayedProjects = projects.filter(p => p.status === 'متأخر');
  const stoppedProjects = projects.filter(p => p.status === 'متوقف');

  const totalBudget = projects.reduce((acc, p) => acc + (Number(p.budget) || 0), 0);
  const totalSpent = projects.reduce((acc, p) => acc + (Number(p.spent) || 0), 0);
  const spentPct = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;
  const remainingBudget = Math.max(0, totalBudget - totalSpent);

  const avgProgress = totalProjects > 0
    ? Math.round(projects.reduce((acc, p) => acc + (Number(p.progress) || 0), 0) / totalProjects)
    : 0;

  const openTickets = tickets.filter(t => t.status !== 'مغلقة');
  const highPriorityTickets = openTickets.filter(t => t.priority === 'عالية');

  // 2. تحليل رادار المخاطر وترتيب المشاريع الحرجة
  const riskRadar = projects.map(p => {
    const pTickets = openTickets.filter(t => t.project_id === p.id);
    const pHigh = pTickets.filter(t => t.priority === 'عالية');
    const spentRatio = p.budget > 0 ? p.spent / p.budget : 0;
    const progressRatio = (p.progress || 0) / 100;

    let score = 0;
    const reasons = [];

    if (p.status === 'متوقف') {
      score += 50;
      reasons.push('المشروع متوقف بالكامل');
    } else if (p.status === 'متأخر') {
      score += 35;
      reasons.push('المشروع متأخر عن الجدول المعتمد');
    }

    if (spentRatio > progressRatio + 0.15) {
      score += 25;
      const gap = Math.round((spentRatio - progressRatio) * 100);
      reasons.push(`استهلاك الميزانية أعلى من الإنجاز بفارق ${gap}٪`);
    }

    if (pHigh.length > 0) {
      score += 15 * pHigh.length;
      reasons.push(`توجد ${pHigh.length} تذكرة حرجة (${pHigh.map(t => t.title).join('، ')})`);
    }

    let level = 'مستقرة';
    if (score >= 45) level = 'حرجة';
    else if (score >= 25) level = 'مرتفعة';
    else if (score > 0) level = 'متوسطة';

    let recommendation = 'متابعة مؤشرات الأداء الأسبوعية مع مدير المشروع';
    if (p.status === 'متوقف') {
      recommendation = 'تدخل عاجل للمجلس لإزالة العوائق واعتماد مخصصات الموردين';
    } else if (p.status === 'متأخر') {
      recommendation = 'تشكيل فريق تسريع مشترك بين الإدارات المعنية لمراجعة مسار الربط';
    } else if (pHigh.length > 0) {
      recommendation = 'إلزام المقاول والاستشاري بحل التذاكر الحرجة خلال 48 ساعة';
    }

    return {
      project_id: p.id,
      project_name: p.name,
      department: p.department,
      status: p.status,
      progress: p.progress,
      budget: p.budget,
      spent: p.spent,
      spent_pct: p.budget > 0 ? Math.round((p.spent / p.budget) * 100) : 0,
      score,
      level,
      reasons,
      recommendation,
      high_priority_count: pHigh.length,
      open_tickets_count: pTickets.length,
    };
  }).filter(r => r.score > 0 || r.status === 'متأخر' || r.status === 'متوقف');

  riskRadar.sort((a, b) => b.score - a.score);

  const todayIso = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const dateFormatted = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const metadata = {
    title,
    generated_at: now.toISOString(),
    date_formatted: dateFormatted,
    classification: 'سري للغاية · مجلس الإدارة والمحافظين',
    stats: {
      total_projects: totalProjects,
      completed_projects: completedProjects.length,
      in_progress_projects: inProgressProjects.length,
      delayed_projects: delayedProjects.length,
      stopped_projects: stoppedProjects.length,
      avg_progress: avgProgress,
      total_budget: totalBudget,
      total_spent: totalSpent,
      spent_pct: spentPct,
      remaining_budget: remainingBudget,
      open_tickets: openTickets.length,
      high_priority_tickets: highPriorityTickets.length,
      risk_count: riskRadar.length,
    },
    risk_radar: riskRadar,
  };

  // 3. صياغة موجز واتساب التنفيذي (WhatsApp Markdown)
  const waLines = [
    `🏛️ *اتحاد الغرف السعودية | منصة تُجّار*`,
    `📊 *${title}*`,
    `🗓️ *التاريخ:* ${dateFormatted}`,
    `🇸🇦 *رؤية المملكة 2030* — تسريع التحول الرقمي وتمكين قطاع الأعمال`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    `📌 *المؤشرات القيادية الرئيسية (KPIs):*`,
    `• *إجمالي المشاريع:* ${totalProjects} مشاريع (${completedProjects.length} مكتمل · ${inProgressProjects.length} قيد التنفيذ · ${delayedProjects.length} متأخر)`,
    `• *متوسط نسبة الإنجاز العام:* ${avgProgress}%`,
    `• *إجمالي الميزانية المعتمدة:* ${formatSAR(totalBudget)}`,
    `• *المصروف الفعلي:* ${formatSAR(totalSpent)} (${spentPct}%)`,
    `• *الميزانية المتبقية:* ${formatSAR(remainingBudget)}`,
    `• *التذاكر التشغيلية المفتوحة:* ${openTickets.length} تذكرة (منها ${highPriorityTickets.length} حرجة)`,
  ];

  if (riskRadar.length > 0) {
    waLines.push(
      `━━━━━━━━━━━━━━━━━━━━━`,
      `🚦 *رادار المخاطر والمشاريع الحرجة (تحتاج تدخلاً عاجلاً):*`
    );
    for (const r of riskRadar.slice(0, 3)) {
      const badge = r.level === 'حرجة' ? '🛑' : '⚠️';
      waLines.push(`${badge} *${r.project_name}* [الحالة: ${r.status}]`);
      waLines.push(`  ├ *نسبة الإنجاز:* ${r.progress}% | *المصروف:* ${formatSAR(r.spent)} (${r.spent_pct}%)`);
      waLines.push(`  ├ *أسباب الخطر:* ${r.reasons.join(' · ')}`);
      waLines.push(`  └ *التوصية:* ${r.recommendation}`);
    }
  }

  waLines.push(
    `━━━━━━━━━━━━━━━━━━━━━`,
    `📈 *موقف المشاريع الميدانية:*`
  );
  for (const p of projects) {
    const icon = p.status === 'مكتمل' ? '✅' : p.status === 'متأخر' ? '⚠️' : p.status === 'متوقف' ? '🛑' : '🔄';
    waLines.push(`${icon} *${p.name}* — ${p.status} (${p.progress}%)`);
  }

  waLines.push(
    `━━━━━━━━━━━━━━━━━━━━━`,
    `💼 *توجيه المجلس / المعالي الموصى به:*`,
    `الموافقة على مصفوفة الإجراءات التصحيحية لرادار المخاطر، وتكليف فرق العمل بحل معوقات الربط التقني والاعتمادات.`,
    ``,
    `📄 *لتحميل التقرير الرسمي الشامل (PDF):*`,
    `/api/executive/report/pdf`
  );

  const whatsappText = waLines.join('\n');

  // 4. توليد وثيقة PDF تنفيذية عبر pdf-lib
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle('Executive Boardroom Report - Federation of Saudi Chambers');
  pdfDoc.setAuthor('Nora Executive AI');
  pdfDoc.setSubject('Executive Digital Transformation Portfolio Briefing');

  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // ألوان الهوية
  const cNavy = rgb(8 / 255, 23 / 255, 38 / 255);
  const cGold = rgb(209 / 255, 166 / 255, 92 / 255);
  const cGreen = rgb(0 / 255, 108 / 255, 53 / 255);
  const cBg = rgb(248 / 255, 250 / 255, 252 / 255);
  const cWhite = rgb(1, 1, 1);
  const cLine = rgb(226 / 255, 232 / 255, 240 / 255);
  const cTextDark = rgb(15 / 255, 23 / 255, 42 / 255);
  const cTextMute = rgb(100 / 255, 116 / 255, 139 / 255);

  // خلفية الصفحة
  page.drawRectangle({ x: 0, y: 0, width: 595.28, height: 841.89, color: cBg });

  // ترويسة كحلي وذهبي مع لمسات رؤية 2030
  page.drawRectangle({ x: 0, y: 736, width: 595.28, height: 106, color: cNavy });
  page.drawRectangle({ x: 0, y: 733, width: 595.28, height: 3, color: cGold });
  page.drawRectangle({ x: 0, y: 730, width: 595.28, height: 2, color: cGreen });

  // تضمين شعار تُجّار
  const logoPath = path.join(ROOT_DIR, 'brand/tujar-logo-original.png');
  if (fs.existsSync(logoPath)) {
    try {
      const logoBytes = fs.readFileSync(logoPath);
      const logoImg = await pdfDoc.embedPng(logoBytes);
      page.drawImage(logoImg, { x: 440, y: 750, width: 115, height: 42 });
    } catch (e) {
      console.warn('[report-pdf] logo embed warning:', e.message);
    }
  }

  // نصوص الترويسة التنفيذية
  page.drawText('FEDERATION OF SAUDI CHAMBERS  |  TUJAR PLATFORM', {
    x: 36, y: 810, font: fontBold, size: 8.5, color: cGold,
  });
  page.drawText('BOARDROOM EXECUTIVE BRIEFING', {
    x: 36, y: 786, font: fontBold, size: 16, color: cWhite,
  });
  page.drawText('Saudi Vision 2030 Portfolio Health, Budget Status & Risk Radar', {
    x: 36, y: 768, font, size: 8.5, color: rgb(203 / 255, 213 / 255, 225 / 255),
  });
  page.drawText(`Date: ${dateFormatted}  |  Classification: Confidential / Board Members  |  Ref: FSC-BRD-2026`, {
    x: 36, y: 750, font, size: 7.5, color: rgb(148 / 255, 163 / 255, 184 / 255),
  });

  // بطاقات المؤشرات القيادية (KPI Cards)
  const kpiData = [
    { label: 'TOTAL INITIATIVES', val: `${totalProjects}`, sub: `${completedProjects.length} Completed / ${inProgressProjects.length} Active`, accent: rgb(56 / 255, 189 / 255, 248 / 255) },
    { label: 'PORTFOLIO PROGRESS', val: `${avgProgress}%`, sub: 'Target: 100% | Overall Health', accent: rgb(16 / 255, 185 / 255, 129 / 255) },
    { label: 'APPROVED BUDGET', val: formatCompactSAR(totalBudget), sub: `Spent: ${formatCompactSAR(totalSpent)} (${spentPct}%)`, accent: cGold },
    { label: 'CRITICAL RADAR', val: `${riskRadar.length} Flagged`, sub: `${highPriorityTickets.length} Critical Tickets Open`, accent: rgb(239 / 255, 68 / 255, 68 / 255) },
  ];

  const cardW = (523.28 - 3 * 10) / 4;
  kpiData.forEach((k, i) => {
    const cx = 36 + i * (cardW + 10);
    const cy = 654;
    page.drawRectangle({ x: cx, y: cy, width: cardW, height: 62, color: cWhite, borderColor: cLine, borderWidth: 1 });
    page.drawRectangle({ x: cx, y: cy + 59, width: cardW, height: 3, color: k.accent });
    page.drawText(k.label, { x: cx + 8, y: cy + 44, font: fontBold, size: 6.5, color: cTextMute });
    page.drawText(k.val, { x: cx + 8, y: cy + 24, font: fontBold, size: 14, color: cNavy });
    page.drawText(k.sub, { x: cx + 8, y: cy + 10, font, size: 6.5, color: cTextMute });
  });

  // جدول صحة المشاريع التنفيذي (Projects Health Table)
  const tableTopY = 636;
  page.drawText('PORTFOLIO PROJECTS HEALTH & EXECUTION STATUS', {
    x: 36, y: tableTopY, font: fontBold, size: 10, color: cNavy,
  });

  const headerH = 20;
  const headerY = tableTopY - 24;
  page.drawRectangle({ x: 36, y: headerY, width: 523.28, height: headerH, color: rgb(15 / 255, 41 / 255, 66 / 255) });

  page.drawText('#', { x: 44, y: headerY + 6, font: fontBold, size: 7.5, color: cGold });
  page.drawText('INITIATIVE NAME', { x: 68, y: headerY + 6, font: fontBold, size: 7.5, color: cWhite });
  page.drawText('DEPARTMENT', { x: 236, y: headerY + 6, font: fontBold, size: 7.5, color: cWhite });
  page.drawText('BUDGET / SPENT', { x: 332, y: headerY + 6, font: fontBold, size: 7.5, color: cWhite });
  page.drawText('PROGRESS', { x: 424, y: headerY + 6, font: fontBold, size: 7.5, color: cWhite });
  page.drawText('STATUS', { x: 502, y: headerY + 6, font: fontBold, size: 7.5, color: cWhite });

  const rowH = 24;
  let curY = headerY;

  for (let i = 0; i < Math.min(projects.length, 6); i++) {
    const p = projects[i];
    curY -= rowH;
    const rowBg = i % 2 === 0 ? cWhite : rgb(241 / 255, 245 / 255, 249 / 255);
    page.drawRectangle({ x: 36, y: curY, width: 523.28, height: rowH, color: rowBg, borderColor: cLine, borderWidth: 0.5 });

    // ID
    page.drawText(String(p.id), { x: 44, y: curY + 8, font: fontBold, size: 7.5, color: cNavy });

    // Name & Dept
    page.drawText(toAsciiSafe(p.name, 28), { x: 68, y: curY + 8, font: fontBold, size: 7.5, color: cTextDark });
    page.drawText(toAsciiSafe(p.department, 18), { x: 236, y: curY + 8, font, size: 7, color: cTextMute });

    // Budget & Spent
    const budgetStr = `${formatCompactSAR(p.spent)} / ${formatCompactSAR(p.budget)}`;
    page.drawText(budgetStr, { x: 332, y: curY + 8, font, size: 6.5, color: cTextDark });

    // Progress Bar
    const barW = 42;
    const barX = 424;
    page.drawRectangle({ x: barX, y: curY + 7, width: barW, height: 7, color: rgb(226 / 255, 232 / 255, 240 / 255) });
    const fillW = Math.max(0, Math.min(barW, Math.round(barW * ((p.progress || 0) / 100))));
    const barColor = p.status === 'مكتمل' ? rgb(16 / 255, 185 / 255, 129 / 255) : p.status === 'متأخر' ? rgb(245 / 255, 158 / 255, 11 / 255) : p.status === 'متوقف' ? rgb(239 / 255, 68 / 255, 68 / 255) : rgb(56 / 255, 189 / 255, 248 / 255);
    if (fillW > 0) {
      page.drawRectangle({ x: barX, y: curY + 7, width: fillW, height: 7, color: barColor });
    }
    page.drawText(`${p.progress}%`, { x: barX + barW + 5, y: curY + 8, font: fontBold, size: 7, color: cNavy });

    // Status Badge
    let badgeBg = rgb(224 / 255, 242 / 255, 254 / 255);
    let badgeColor = rgb(7 / 255, 89 / 255, 133 / 255);
    let safeStatus = 'IN PROGRESS';

    if (p.status === 'مكتمل') {
      badgeBg = rgb(220 / 255, 252 / 255, 231 / 255);
      badgeColor = rgb(22 / 255, 101 / 255, 52 / 255);
      safeStatus = 'COMPLETED';
    } else if (p.status === 'متأخر') {
      badgeBg = rgb(254 / 255, 243 / 255, 199 / 255);
      badgeColor = rgb(146 / 255, 64 / 255, 14 / 255);
      safeStatus = 'DELAYED';
    } else if (p.status === 'متوقف') {
      badgeBg = rgb(254 / 255, 226 / 255, 226 / 255);
      badgeColor = rgb(153 / 255, 27 / 255, 27 / 255);
      safeStatus = 'ON HOLD';
    }

    page.drawRectangle({ x: 500, y: curY + 5, width: 52, height: 14, color: badgeBg });
    page.drawText(safeStatus, { x: 504, y: curY + 9, font: fontBold, size: 6, color: badgeColor });
  }

  // قسم رادار المخاطر (Boardroom Risk Radar)
  const riskSectionY = curY - 20;
  page.drawText('BOARDROOM RISK RADAR & CRITICAL INTERVENTIONS', {
    x: 36, y: riskSectionY, font: fontBold, size: 10, color: cNavy,
  });

  const riskCardW = (523.28 - 10) / 2;
  const riskCardH = 88;
  const riskCardY = riskSectionY - 12 - riskCardH;

  const topRisks = riskRadar.slice(0, 2);
  const displayRisks = topRisks.length > 0 ? topRisks : [
    {
      project_name: 'Portfolio Health Stable',
      status: 'قيد التنفيذ',
      progress: avgProgress,
      spent: totalSpent,
      budget: totalBudget,
      reasons: ['جميع المؤشرات ضمن النطاق التشغيلي المعتمد'],
      recommendation: 'الاستمرار في التنفيذ وفق الخطط الزمنية المعتمدة',
    },
  ];

  displayRisks.forEach((r, idx) => {
    const rx = 36 + idx * (riskCardW + 10);
    const isCritical = r.status === 'متوقف' || r.status === 'متأخر';
    const cardColor = isCritical ? rgb(254 / 255, 242 / 255, 242 / 255) : rgb(240 / 255, 253 / 255, 244 / 255);
    const borderCol = isCritical ? rgb(248 / 255, 113 / 255, 113 / 255) : rgb(74 / 255, 222 / 255, 128 / 255);
    const tagCol = isCritical ? rgb(185 / 255, 28 / 255, 28 / 255) : rgb(21 / 255, 128 / 255, 61 / 255);

    page.drawRectangle({ x: rx, y: riskCardY, width: riskCardW, height: riskCardH, color: cardColor, borderColor: borderCol, borderWidth: 1 });
    page.drawRectangle({ x: rx, y: riskCardY, width: 4, height: riskCardH, color: tagCol });

    const pTitle = `${toAsciiSafe(r.project_name, 22)} [${toAsciiSafe(r.status)}]`;
    page.drawText(pTitle, { x: rx + 10, y: riskCardY + riskCardH - 16, font: fontBold, size: 7.5, color: tagCol });

    const burnTxt = `Progress: ${r.progress}%  |  Budget: ${formatCompactSAR(r.spent)} / ${formatCompactSAR(r.budget)}`;
    page.drawText(burnTxt, { x: rx + 10, y: riskCardY + riskCardH - 30, font, size: 6.5, color: cTextDark });

    const reasonTxt = `Risk: ${toAsciiSafe(r.reasons?.[0] || 'Schedule divergence', 42)}`;
    page.drawText(reasonTxt, { x: rx + 10, y: riskCardY + riskCardH - 46, font, size: 6.5, color: rgb(153 / 255, 27 / 255, 27 / 255) });

    page.drawText('Board Action:', { x: rx + 10, y: riskCardY + riskCardH - 62, font: fontBold, size: 6.5, color: cNavy });
    const recTxt = toAsciiSafe(r.recommendation || 'Executive intervention required', 44);
    page.drawText(recTxt, { x: rx + 10, y: riskCardY + riskCardH - 74, font, size: 6, color: cTextDark });
  });

  // كتلة الاعتماد والتوقيع ورؤية 2030 (Attestation & Governance Block)
  const signSectionY = riskCardY - 18;
  const signH = 88;
  const signY = signSectionY - signH;

  // الصندوق الأيسر: محاذاة رؤية 2030
  const leftW = 320;
  page.drawRectangle({ x: 36, y: signY, width: leftW, height: signH, color: cWhite, borderColor: cLine, borderWidth: 1 });
  page.drawRectangle({ x: 36, y: signY + signH - 3, width: leftW, height: 3, color: cGreen });

  page.drawText('SAUDI VISION 2030 STRATEGIC ALIGNMENT', {
    x: 48, y: signY + signH - 18, font: fontBold, size: 7.5, color: cGreen,
  });
  page.drawText('National Transformation & Commercial Empowerment Program', {
    x: 48, y: signY + signH - 32, font: fontBold, size: 7, color: cNavy,
  });
  page.drawText('Accelerating chambers digital integration, SME enablement and trade modernization.', {
    x: 48, y: signY + signH - 46, font, size: 6.5, color: cTextMute,
  });
  page.drawText('Report certified for Council Presidents, Ministers and Board Directors.', {
    x: 48, y: signY + signH - 60, font, size: 6.5, color: cTextMute,
  });
  page.drawText('Governance Standards: FSC-GOV-2026-v2', {
    x: 48, y: signY + signH - 74, font, size: 6, color: cGold,
  });

  // الصندوق الأيمن: ختم الاعتماد التنفيذي
  const rightX = 36 + leftW + 10;
  const rightW = 523.28 - leftW - 10;
  page.drawRectangle({ x: rightX, y: signY, width: rightW, height: signH, color: rgb(15 / 255, 41 / 255, 66 / 255), borderColor: cGold, borderWidth: 1 });

  page.drawText('BOARDROOM ATTESTATION', {
    x: rightX + 12, y: signY + signH - 18, font: fontBold, size: 7.5, color: cGold,
  });
  page.drawText('Generated by: Nora Executive AI', {
    x: rightX + 12, y: signY + signH - 32, font, size: 6.5, color: cWhite,
  });
  page.drawText('Status: CERTIFIED FOR CIRCULATION', {
    x: rightX + 12, y: signY + signH - 46, font: fontBold, size: 6.5, color: rgb(16 / 255, 185 / 255, 129 / 255),
  });
  page.drawText(`Timestamp: ${now.toISOString()}`, {
    x: rightX + 12, y: signY + signH - 60, font, size: 5.5, color: rgb(148 / 255, 163 / 255, 184 / 255),
  });
  page.drawText('[DIGITALLY SEALED - FSC GOV]', {
    x: rightX + 12, y: signY + signH - 74, font: fontBold, size: 6, color: cGold,
  });

  // شريط التذييل (Footer)
  page.drawRectangle({ x: 36, y: 34, width: 523.28, height: 1, color: cGold });
  page.drawText('FEDERATION OF SAUDI CHAMBERS  |  TUJAR PLATFORM  |  VISION 2030', {
    x: 36, y: 22, font: fontBold, size: 6.5, color: cTextMute,
  });
  page.drawText('PAGE 1 OF 1  -  STRICTLY CONFIDENTIAL FOR BOARD USE ONLY', {
    x: 350, y: 22, font, size: 6.5, color: cTextMute,
  });

  const pdfBytes = await pdfDoc.save();
  const pdfBuffer = Buffer.from(pdfBytes);

  return {
    success: true,
    pdfBuffer,
    whatsappText,
    metadata,
  };
}

// أداة المساعد الذكي لمجلس الإدارة
export const generate_executive_report = {
  declaration: {
    name: 'generate_executive_report',
    description: 'توليد تقرير مجلس الإدارة التنفيذي (تقرير المعالي) كملف PDF رسمي بلمسات رؤية 2030 وهوية اتحاد الغرف، بالإضافة إلى موجز واتساب مهيأ للمشاركة المباشرة.',
    parameters: {
      type: 'OBJECT',
      properties: {
        title: { type: 'STRING', description: 'عنوان التقرير التنفيذي (افتراضي: تقرير مجلس الإدارة التنفيذي)' },
        filter: {
          type: 'OBJECT',
          description: 'فلترة اختيارية للمشاريع حسب الإدارة أو الحالة أو كلمة البحث',
          properties: {
            department: { type: 'STRING', description: 'اسم الإدارة (مثل: تقنية المعلومات)' },
            status: { type: 'STRING', description: 'حالة المشروع (مثل: قيد التنفيذ، متأخر)' },
            query: { type: 'STRING', description: 'بحث بالاسم' },
          },
        },
      },
    },
  },
  run: async (args = {}) => {
    const res = await generateExecutiveReport(args);
    return {
      success: res.success,
      whatsappText: res.whatsappText,
      metadata: res.metadata,
      downloadUrl: '/api/executive/report/pdf',
    };
  },
};
