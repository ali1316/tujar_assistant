// يولّد PDF عربي اصطناعي للاختبار المحلي: فقرة بأرقام + حاشية + جدول ممتد على صفحتين بصف إجمالي + رسم + صفحة ممسوحة
const { chromium } = require('playwright'); const { PDFDocument } = require('pdf-lib'); const fs = require('fs');
const rooms = ['غرفة الرياض','غرفة جدة','غرفة مكة المكرمة','غرفة المدينة المنورة','غرفة الشرقية','غرفة القصيم','غرفة حائل','غرفة تبوك','غرفة جازان','غرفة نجران','غرفة الباحة','غرفة الجوف','غرفة عسير','غرفة الأحساء','غرفة ينبع','غرفة الطائف','غرفة عنيزة','غرفة الخرج','غرفة حفر الباطن','غرفة الجبيل','غرفة المجمعة','غرفة الزلفي','غرفة شقراء','غرفة رابغ','غرفة بيشة','غرفة القريات','غرفة الرس','غرفة الدوادمي','غرفة وادي الدواسر','غرفة صبيا'];
const rows = rooms.map((r, i) => [r, 1000 + i * 137, 20 + (i * 7) % 60]);
const total = rows.reduce((a, r) => a + r[1], 0);
const fmt = n => n.toLocaleString('en-US');
const html = `<html dir="rtl" lang="ar"><head><meta charset="utf-8"><style>body{font-family:'DejaVu Sans',sans-serif;font-size:13px;margin:40px} table{border-collapse:collapse;width:100%} td,th{border:1px solid #999;padding:12px 6px} thead{display:table-header-group} .pb{page-break-before:always} sup{font-size:9px}</style></head><body>
<h1>تقرير الخدمات الاختباري – الربع الثالث 2026م</h1>
<p>بلغ إجمالي الخدمات المنفذة خلال الربع الثالث ${fmt(total)} خدمة، بنمو قدره 12.5% مقارنة بالربع السابق<sup>1</sup>، وبلغ عدد المستخدمين النشطين 48,210 مستخدماً.</p>
<h2>جدول 1: الخدمات المنفذة حسب الغرفة (عدد الخدمات)</h2>
<table><thead><tr><th>الغرفة</th><th>عدد الخدمات</th><th>نسبة الإنجاز (%)</th></tr></thead><tbody>
${rows.map(r => `<tr><td>${r[0]}</td><td>${fmt(r[1])}</td><td>${r[2]}%</td></tr>`).join('')}
<tr><td><b>الإجمالي</b></td><td><b>${fmt(total)}</b></td><td>—</td></tr></tbody></table>
<p style="font-size:10px">1) النمو محسوب على أساس عدد الخدمات المنفذة في الربع الثاني 2026م البالغ 41,280 خدمة.</p>
<div class="pb"></div><h2>شكل 1: توزيع الخدمات حسب النوع</h2>
<svg width="500" height="260"><g font-size="12"><rect x="60" y="40" width="80" height="180" fill="#5f86b3"/><text x="100" y="35" text-anchor="middle">18,000</text><text x="100" y="240" text-anchor="middle">التصديق</text>
<rect x="200" y="130" width="80" height="90" fill="#5f86b3"/><text x="240" y="125" text-anchor="middle">9,000</text><text x="240" y="240" text-anchor="middle">العضوية</text>
<rect x="340" y="175" width="80" height="45" fill="#5f86b3"/><text x="380" y="240" text-anchor="middle">التصاريح</text></g></svg>
<p>ملاحظة: قيمة «التصاريح» غير مكتوبة في الشكل.</p></body></html>`;
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.setContent(html); const main = await p.pdf({ format: 'A4' });
  await p.setViewportSize({ width: 794, height: 1123 });
  await p.setContent(`<html dir="rtl"><body style="font-family:'DejaVu Sans';margin:60px;font-size:20px"><h2>ملحق ممسوح ضوئياً</h2><p>عدد الشكاوى المستلمة 1,245 شكوى، تمت معالجة 1,190 منها.</p></body></html>`);
  const png = await p.screenshot({ fullPage: false }); await b.close();
  const doc = await PDFDocument.load(main); const img = await doc.embedPng(png);
  const pg = doc.addPage([595, 842]); pg.drawImage(img, { x: 0, y: 0, width: 595, height: 842 });
  fs.writeFileSync(__dirname + '/sample-ar-stats.pdf', await doc.save());
  fs.writeFileSync(__dirname + '/sample-ar-stats.truth.json', JSON.stringify({ total, rows: rows.length, active_users: 48210, growth_pct: 12.5, prev_quarter: 41280, scanned_complaints: 1245, chart: { 'التصديق': 18000, 'العضوية': 9000 } }, null, 1));
  console.log('ok total', total);
})();
