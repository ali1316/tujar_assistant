// نص الكلام يتولّد من الشاشة نفسها: نفس السطور ونفس الأرقام، مكتوبة زي ما تنقال باللهجة السعودية البيضاء.
// نورة تقرأ say_script بدل ما تصيغ أرقامها بنفسها، فما يصير «ستة مليون تقريباً» والشاشة تقول 6,343,425.
const ONES = ['صفر', 'واحد', 'اثنين', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة'];
const TEENS = ['عشرة', 'احدعش', 'اثنعش', 'ثلطعش', 'أربعطعش', 'خمسطعش', 'ستطعش', 'سبعطعش', 'ثمنطعش', 'تسعطعش'];
const TENS = ['', '', 'عشرين', 'ثلاثين', 'أربعين', 'خمسين', 'ستين', 'سبعين', 'ثمانين', 'تسعين'];
const HUNDREDS = ['', 'مية', 'ميتين', 'ثلاثمية', 'أربعمية', 'خمسمية', 'ستمية', 'سبعمية', 'ثمانمية', 'تسعمية'];

function under1000(n) {
  const h = Math.floor(n / 100), r = n % 100, parts = [];
  if (h) parts.push(HUNDREDS[h]);
  if (r) {
    if (r < 10) parts.push(ONES[r]);
    else if (r < 20) parts.push(TEENS[r - 10]);
    else parts.push(r % 10 ? `${ONES[r % 10]} و${TENS[Math.floor(r / 10)]}` : TENS[Math.floor(r / 10)]);
  }
  return parts.join(' و');
}
// كم ألف/مليون: 1 ألف، 2 ألفين، 3–10 آلاف، 11+ ألف
function scale(n, one, two, plural) {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n <= 10) return `${under1000(n)} ${plural}`;
  return `${under1000(n)} ${one}`;
}
export function intWords(n) {
  n = Math.floor(Math.abs(n));
  if (n === 0) return 'صفر';
  const parts = [];
  const b = Math.floor(n / 1e9), m = Math.floor(n / 1e6) % 1000, t = Math.floor(n / 1e3) % 1000, u = n % 1000;
  if (b) parts.push(scale(b, 'مليار', 'مليارين', 'مليارات'));
  if (m) parts.push(scale(m, 'مليون', 'مليونين', 'ملايين'));
  if (t) parts.push(scale(t, 'ألف', 'ألفين', 'آلاف'));
  if (u) parts.push(under1000(u));
  return parts.join(' و');
}
// رقم من الشاشة (بفواصل أو أرقام عربية) → كلام. المبالغ الكبيرة بدون هللات، والكسور الصغيرة «فاصلة».
export function numWords(raw) {
  const s = String(raw).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/٫/g, '.').replace(/[٬,]/g, '');
  const x = Number(s);
  if (!Number.isFinite(x)) return raw;
  const neg = x < 0 ? 'سالب ' : '';
  const [i, d] = s.replace('-', '').split('.');
  if (!d || Math.abs(x) >= 1000 || /^0+$/.test(d)) return neg + intWords(+i);
  return `${neg}${intWords(+i)} فاصلة ${d.length === 1 ? ONES[+d] : intWords(+d.slice(0, 2))}`;
}

// كلمات تنقال غلط بدون تشكيل (النموذج الصوتي يختار الحركة بنفسه)
const LEXICON = [
  [/(^|[\s«(،])(و?(?:ال|بال|لل|ب|ل)?)غرف(ة|ه|تين|ت)(?=[\s»)،.؛:!؟]|$)/g, (m, a, p, e) => `${a}${p}غُرْف${e === 'ه' ? 'ة' : e}`],
  [/(^|[\s«(،])(و?(?:ال|بال|لل|ب|ل)?)غرف(?=[\s»)،.؛:!؟]|$)/g, (m, a, p) => `${a}${p}غُرَف`],
];
export const tashkeel = t => LEXICON.reduce((s, [re, fn]) => s.replace(re, fn), String(t));

const YEAR = /\b(19|20)\d{2}\b/;
// سطر شاشة → جملة تنقال
export function speakLine(line) {
  let t = String(line);
  t = t.replace(/([\d٠-٩][\d٠-٩٬,.٫]*)\s*[–-]\s*([\d٠-٩][\d٠-٩٬,.٫]*)(?:\s*([٪%]))?/g, (m, a, b, pc) => `من ${numWords(a)} إلى ${numWords(b)}${pc ? ' بالمية' : ''}`); // 18–24 و50–100%
  t = t.replace(/([\d٠-٩][\d٠-٩٬,.٫]*)\s*[٪%]/g, (m, a) => `${numWords(a)} بالمية`);
  t = t.replace(/بـ\s+/g, 'بـ').replace(/\s*=\s*/g, '، تمثّل ').replace(/\s*\(\s*/g, '، ').replace(/\s*\)\s*/g, ' ');
  t = t.replace(/[\d٠-٩][\d٠-٩٬,.٫]*/g, m => (YEAR.test(m) && m.length === 4 ? intWords(+m) : numWords(m)));
  t = t.replace(/بـ(?=\S)/g, 'ب');
  t = t.replace(/\s*[·—|•]\s*/g, '، ').replace(/\s*[؛;]\s*/g, '، ').replace(/\s*:\s*/g, '، ').replace(/[()«»"]/g, '').replace(/[#*/⟨⟩]/g, ' ');
  t = t.replace(/[٪%]/g, ' بالمية').replace(/\s*،\s*(،\s*)+/g, '، ').replace(/\s{2,}/g, ' ').replace(/\s+([،.؟!])/g, '$1').replace(/^[،\s]+|[،\s]+$/g, '').trim();
  return tashkeel(t);
}
// نص الكلام كامل: عنوان قصير + سطور الشاشة بالترتيب (بحد أقصى max سطر)
export function sayScript(title, lines, max = 5) {
  const body = lines.filter(Boolean).slice(0, max).map(speakLine).filter(Boolean);
  const head = title ? speakLine(title) : '';
  return [head, ...body].filter(Boolean).map(s => s.replace(/[\s،]+$/, '')).map(s => (/[.!؟]$/.test(s) ? s : s + '.')).join(' ');
}
