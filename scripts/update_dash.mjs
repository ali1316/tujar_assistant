import fs from 'node:fs';

let content = fs.readFileSync('dash.html', 'utf8');

const target = `function countUp(el, to, unit) {
  const t0 = performance.now(), d = 1400, dec = Number.isInteger(to) ? 0 : 1;
  const step = now => { const p = Math.min(1, (now - t0) / d), e = 1 - Math.pow(1 - p, 3), v = to * e;
    el.innerHTML = (dec ? new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 }).format(v) : fmt(Math.round(v))) + (unit ? \` <small>\${esc(unit)}</small>\` : '');
    if (p < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}`;

const replacement = `function countUp(el, to, unit) {
  const t0 = performance.now(), d = 1400, dec = Number.isInteger(to) ? 0 : 1;
  const cleanUnit = (unit === '%' || unit === 'percent' || unit === '٪') ? '%' : unit;
  const step = now => { const p = Math.min(1, (now - t0) / d), e = 1 - Math.pow(1 - p, 3), v = to * e;
    const formattedVal = dec ? new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 }).format(v) : fmt(Math.round(v));
    el.innerHTML = formattedVal + (cleanUnit ? \` <small class="unit">\${esc(cleanUnit)}</small>\` : '');
    if (p < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}`;

const normContent = content.replace(/\r\n/g, '\n');
const normTarget = target.replace(/\r\n/g, '\n');
const normReplacement = replacement.replace(/\r\n/g, '\n');

if (!normContent.includes(normTarget)) {
  console.error('Target not found in dash.html!');
  process.exit(1);
}

const updated = normContent.replace(normTarget, normReplacement);
fs.writeFileSync('dash.html', updated, 'utf8');
console.log('dash.html updated successfully!');
