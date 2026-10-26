// اختبار التصميم الآلي: يفتح شاشات نورة الحقيقية (?fixture=…) على 3 مقاسات ويتأكد إن التصميم ما «ينهار»
//   node test/design-check.mjs [baseUrl=http://localhost:3000] [--out DIR]
// يحتاج playwright (npm i -D playwright && npx playwright install chromium). يطلع بخطأ (exit 1) لو فيه FAIL.
// القواعد مأخوذة من مهارة taste-skill (references/app-screens.md) ومن متطلبات نورة: الأرقام دايماً ظاهرة ومطابقة.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const outI = args.indexOf('--out'); const OUT = outI >= 0 ? args.splice(outI, 2)[1] : 'test/design-out';
const BASE = (args[0] || 'http://localhost:3000').replace(/\/$/, '');
const FIXTURES = ['bar', 'hbar', 'pie', 'stacked', 'line', 'note'];
const WIDTHS = [{ w: 1440, h: 900 }, { w: 768, h: 1024 }, { w: 390, h: 844 }];
mkdirSync(OUT, { recursive: true });

const toNum = s => { const t = String(s).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/٫/g, '.').replace(/[٬,\s]/g, ''); const m = t.match(/-?\d+(\.\d+)?/); return m ? +m[0] : null; };
const findings = []; const add = (level, fx, w, id, msg) => findings.push({ level, fx, w, id, msg });

const browser = await chromium.launch(process.getuid?.() === 0 ? { args: ['--no-sandbox'] } : {});
for (const fx of FIXTURES) for (const { w, h } of WIDTHS) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${BASE}/?fixture=${fx}`);
  const ready = await page.waitForFunction(() => document.documentElement.dataset.fixture === 'ready', null, { timeout: 30000 }).then(() => true, () => false);
  await page.waitForTimeout(3000); // تنتهي حركات الدخول وعدّادات الأرقام
  if (!ready) { add('FAIL', fx, w, 'not-ready', 'الشاشة ما جهزت خلال 30 ثانية'); await page.close(); continue; }
  const m = await page.evaluate(() => {
    const hud = document.querySelector('.hud'); const r = el => el.getBoundingClientRect();
    if (!hud) return { noHud: true };
    const texts = [...hud.querySelectorAll('h3,.sub,.lbl,.big,li,svg text,.x,.eyebrow')].filter(e => e.offsetParent !== null || e.closest('svg'));
    const tiny = texts.filter(e => parseFloat(getComputedStyle(e).fontSize) < 11).map(e => e.textContent.trim().slice(0, 30));
    const clipped = [...hud.querySelectorAll('h3,.lbl,.big,li')].filter(e => e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflow !== 'visible').map(e => e.textContent.trim().slice(0, 30));
    const h3 = hud.querySelector('h3'); const lh = parseFloat(getComputedStyle(h3).lineHeight) || parseFloat(getComputedStyle(h3).fontSize) * 1.35;
    const kpis = [...hud.querySelectorAll('.kpis .cell')].map(c => ({ lbl: c.querySelector('.lbl')?.textContent || '', val: c.querySelector('.big')?.textContent || '' }));
    const svg = hud.querySelector('.vl svg'); const svgBox = svg ? r(svg) : null;
    const labels = svg ? [...svg.querySelectorAll('text')].map(t => ({ el: t, rot: /rotate\((?!0\))/.test(t.getAttribute('transform') || ''), t: t.textContent, b: t.getBoundingClientRect(), bold: /bold|700/.test(t.getAttribute('font-weight') || getComputedStyle(t).fontWeight) })).filter(x => x.t.trim()) : [];
    // تداخل نصوص الشارت (أسماء الفئات أو الأرقام فوق بعض)
    let overlaps = 0; for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) { if (labels[i].rot || labels[j].rot) continue; const a = labels[i].b, b = labels[j].b; if (a.width && b.width && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) overlaps++; }
    const dock = document.querySelector('#dock'); const dockTop = dock ? r(dock).top : innerHeight;
    window.scrollTo(0, document.scrollingElement.scrollHeight); const last = [...hud.querySelectorAll('.body > *')].at(-1);
    const lastBottom = last ? last.getBoundingClientRect().bottom : 0; const dockTop2 = dock ? dock.getBoundingClientRect().top : innerHeight;
    const digitSets = new Set([...hud.querySelectorAll('.big, li, svg text')].map(e => e.textContent).join(' ').match(/[0-9]|[٠-٩]/g)?.map(c => /[0-9]/.test(c) ? 'latin' : 'arabic') || []);
    const buttons = [...document.querySelectorAll('button, .ic')].filter(b => b.offsetParent).map(b => { const x = r(b); return { t: (b.title || b.textContent || '').trim().slice(0, 20), w: x.width, h: x.height }; });
    return { overflowX: document.scrollingElement.scrollWidth - innerWidth, tiny, clipped, h3Lines: Math.round(r(h3).height / lh), kpis, svg: svgBox && { w: svgBox.width, h: svgBox.height }, labelCount: labels.length, labelTexts: labels.map(l => l.t), rotated: labels.filter(l => l.rot).length, dataLabels: labels.filter(l => l.bold).map(l => l.t), overlaps, lastBottom, dockTop: dockTop2, digitSets: [...digitSets], buttons, emoji: (hud.innerText.match(/\p{Extended_Pictographic}/gu) || []).join('') };
  });
  await page.screenshot({ path: join(OUT, `${fx}-${w}.png`) });
  if (m.noHud) { add('FAIL', fx, w, 'no-panel', 'ما ظهرت لوحة على الشاشة'); await page.close(); continue; }
  if (m.overflowX > 1) add('FAIL', fx, w, 'overflow-x', `الصفحة أعرض من الشاشة بـ ${m.overflowX}px (تمرير أفقي)`);
  if (m.tiny.length) add('FAIL', fx, w, 'tiny-text', `نص أصغر من 11px: ${m.tiny.slice(0, 3).join(' | ')}`);
  if (m.clipped.length) add('FAIL', fx, w, 'clipped', `نص مقصوص: ${m.clipped.slice(0, 3).join(' | ')}`);
  if (m.h3Lines > 3) add('FAIL', fx, w, 'title-lines', `العنوان ${m.h3Lines} أسطر (الحد 3)`);
  if (m.emoji) add('WARN', fx, w, 'emoji', `رموز تعبيرية داخل اللوحة: ${m.emoji}`);
  if (m.digitSets.length > 1) add('FAIL', fx, w, 'mixed-digits', 'أرقام عربية وإنجليزية مخلوطة في نفس اللوحة');
  if (m.lastBottom > m.dockTop + 1) add('FAIL', fx, w, 'under-dock', `آخر عنصر مختفي تحت شريط نورة (${Math.round(m.lastBottom - m.dockTop)}px)`);
  if (fx !== 'note') {
    if (!m.svg || m.svg.w < 200 || m.svg.h < 150) add('FAIL', fx, w, 'chart-size', `الشارت صغير أو ما ظهر (${m.svg ? `${Math.round(m.svg.w)}×${Math.round(m.svg.h)}` : 'لا يوجد'})`);
    if (m.overlaps > 0) add(m.overlaps > 2 ? 'FAIL' : 'WARN', fx, w, 'label-overlap', `${m.overlaps} تداخل بين نصوص الشارت`);
    const nums = m.dataLabels.map(toNum).filter(v => v !== null);
    if (!nums.length) add('FAIL', fx, w, 'no-numbers', 'ما فيه أرقام مكتوبة على الشارت نفسه (فوق الأعمدة أو جنب الشرائح)');
    // «الأعلى» في البطاقات = أعلى رقم مكتوب على الشارت (الشاشة تطابق الكلام)
    const top = m.kpis.find(k => k.lbl.includes('الأعلى'));
    if (top && nums.length && fx !== 'stacked' && !nums.some(v => Math.abs(v - toNum(top.val)) < 0.051)) add('FAIL', fx, w, 'kpi-mismatch', `بطاقة «${top.lbl}» = ${top.val} وما تطابق أي رقم على الشارت`);
  }
  if (w <= 390) for (const b of m.buttons) if (b.h < 32 || b.w < 32) add('WARN', fx, w, 'tap-target', `زر صغير للمس «${b.t}» ${Math.round(b.w)}×${Math.round(b.h)}`);
  if (errors.length) add('WARN', fx, w, 'console', errors.slice(0, 2).join(' | ').slice(0, 200));
  await page.close();
}
await browser.close();
const fails = findings.filter(f => f.level === 'FAIL');
writeFileSync(join(OUT, 'report.json'), JSON.stringify({ base: BASE, fixtures: FIXTURES, widths: WIDTHS.map(x => x.w), findings }, null, 1));
for (const f of findings) console.log(`${f.level.padEnd(4)} ${f.fx}@${f.w} [${f.id}] ${f.msg}`);
console.log(`\n${FIXTURES.length * WIDTHS.length} screens · ${fails.length} FAIL · ${findings.length - fails.length} WARN · screenshots in ${OUT}`);
process.exit(fails.length ? 1 : 0);
