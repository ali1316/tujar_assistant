// تنظيم القيم: نحتفظ بالأصل دائماً، ونرجّع شكلاً منظّماً واضح النوع. لا تحويلات ضمنية للعملات أو التواريخ.
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩', FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
export const latinDigits = s => String(s ?? '').replace(/[٠-٩]/g, d => AR_DIGITS.indexOf(d)).replace(/[۰-۹]/g, d => FA_DIGITS.indexOf(d));

const MISSING = /^(?:|n\/?a|غير متوفر|غير متاح|لا يوجد|غ\.?م|غير مطبق|لا ينطبق|\.\.\.?|…)$/i;
const DASH = /^[-–—ـ]+$/;
const CURRENCY = [[/ريال|ر\.?\s?س|SAR|﷼/i, 'SAR'], [/دولار|USD|\$/i, 'USD'], [/يورو|EUR|€/i, 'EUR'], [/درهم|AED/i, 'AED'], [/جنيه|GBP|£/i, 'GBP']];
const SCALE = [[/مليار|billion|bn\b/i, 1e9], [/مليون|million|\bm\b/i, 1e6], [/(?:^|\s)ألف(?:\s|$)|آلاف|thousand|\bk\b/i, 1e3]];

// يرجّع: { raw, kind, value, unit, scale, currency, percent, note }
// kind: number | percent | zero | missing | not_applicable | dash | text | date
export function parseValue(raw, { unitHint = '' } = {}) {
  const r = String(raw ?? '').trim();
  const out = { raw: r };
  if (MISSING.test(r)) return { ...out, kind: /مطبق|ينطبق/.test(r) ? 'not_applicable' : 'missing', value: null };
  if (DASH.test(r)) return { ...out, kind: 'dash', value: null, note: 'شرطة في المصدر — ليست صفراً ولا قيمة مؤكدة' };
  const d = parseDate(r); if (d) return { ...out, kind: 'date', value: null, date: d };
  let s = latinDigits(r).replace(/[‎‏‪-‮⁦-⁩]/g, '');
  const percent = /[%٪]|بالمئة|بالمائة|في المئة/.test(s);
  const currency = (CURRENCY.find(([re]) => re.test(s + ' ' + unitHint)) || [])[1] || null;
  const scale = (SCALE.find(([re]) => re.test(s)) || [null, 1])[1];
  const neg = /^\(.*\)$/.test(s) || /^[-−–]\s*\d/.test(s);
  // الفاصل العشري العربي «٫» وفاصل الآلاف «٬»
  s = s.replace(/٫/g, '.').replace(/٬/g, ',');
  const m = s.match(/\d[\d,\s]*(?:\.\d+)?|\.\d+/);
  if (!m) return { ...out, kind: 'text', value: null };
  let numStr = m[0].replace(/\s+/g, '');
  // «1,234» آلاف؛ «1,5» بنظام أوروبي نادر في مصادرنا — نتعامل معه كعشري فقط لو بعد الفاصلة رقمين أو أقل وما فيه نقطة
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(numStr)) numStr = numStr.replace(/,/g, '');
  else if (/^\d+,\d{1,2}$/.test(numStr)) { numStr = numStr.replace(',', '.'); out.note = 'فاصلة عشرية'; }
  else numStr = numStr.replace(/,/g, '');
  let value = Number(numStr);
  if (!Number.isFinite(value)) return { ...out, kind: 'text', value: null };
  if (neg) value = -value;
  const res = { ...out, kind: percent ? 'percent' : value === 0 ? 'zero' : 'number', value: value * (scale || 1), unit: null };
  if (scale && scale !== 1) res.scale = scale;
  if (currency) res.currency = currency;
  if (percent) { res.percent_as_written = value; res.fraction = value / 100; res.unit = '%'; }
  // معرّفات بأصفار بادئة: نحفظ النص كما هو
  if (/^0\d+$/.test(numStr) && !percent) { res.kind = 'identifier'; res.value = null; res.text = numStr; }
  return res;
}

// التواريخ: نتعرف على النمط فقط ونحفظ النص، ولا نحوّل بين الهجري والميلادي
export function parseDate(r) {
  const s = latinDigits(r).trim();
  let m = s.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})\s*(هـ|ه|م)?$/) || s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})\s*(هـ|ه|م)?$/);
  if (!m) return null;
  const y = +(m[1].length === 4 ? m[1] : m[3]);
  const calendar = /هـ|ه/.test(m[4] || '') || (y >= 1300 && y <= 1600) ? 'hijri' : 'gregorian';
  return { text: s, calendar };
}

// أرقام داخل الفقرات مع العبارة المحيطة
export function numbersInText(text) {
  const t = String(text || '');
  const out = [];
  const re = /[-−(]?[\d٠-٩][\d٠-٩٬,\s]*(?:[.٫][\d٠-٩]+)?\s*(?:[%٪]|مليار|مليون|ألف|ريال)?\)?/g;
  let m;
  while ((m = re.exec(t))) {
    const raw = m[0].trim(); if (!/[\d٠-٩]/.test(raw)) continue;
    const v = parseValue(raw);
    if (v.value == null && v.kind !== 'zero') continue;
    const a = Math.max(0, m.index - 60), b = Math.min(t.length, m.index + m[0].length + 60);
    out.push({ raw, ...v, context: t.slice(a, b).replace(/\s+/g, ' ').trim() });
  }
  return out;
}

// للمطابقة مع طبقة النص: نفس الرقم بأي كتابة (عربي/لاتيني، بفواصل أو بدون)
export const digitsKey = s => latinDigits(s).replace(/[^\d.]/g, '').replace(/^0+(?=\d)/, '');
