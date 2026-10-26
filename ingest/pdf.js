// تحليل PDF بدون رؤية: عدد الصفحات، طبقة النص لكل صفحة مع المواضع، عدد الصور، وتصنيف الصفحة (نصية/ممسوحة/مختلطة)
// + قص صفحة واحدة كملف PDF مستقل لإرسالها لمحرك الرؤية.
import { PDFDocument } from 'pdf-lib';

let pdfjs;
async function lib() {
  if (!pdfjs) pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjs;
}

export async function analyze(buffer) {
  const { getDocument, OPS } = await lib();
  const task = getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, useSystemFonts: false, disableFontFace: true, verbosity: 0 });
  const doc = await task.promise;
  const meta = await doc.getMetadata().catch(() => ({}));
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const items = tc.items.filter(it => it.str && it.str.trim()).map(it => ({
      str: it.str, x: +it.transform[4].toFixed(1), y: +(vp.height - it.transform[5]).toFixed(1), w: +it.width.toFixed(1), h: +(it.height || 0).toFixed(1), dir: it.dir,
    }));
    const ops = await page.getOperatorList();
    let images = 0;
    for (const fn of ops.fnArray) if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageMaskXObject) images++;
    const chars = items.reduce((a, it) => a + it.str.replace(/\s/g, '').length, 0);
    // التصنيف: نصية = طبقة نص كافية؛ ممسوحة = صورة بدون نص تقريباً؛ مختلطة = نص + صور
    const kind = chars < 20 ? (images ? 'scanned' : 'empty') : images ? 'mixed' : 'text';
    // نص الطبقة مرتب سطرياً (أعلى→أسفل، ثم يمين→يسار للعربي). ترتيب القراءة النهائي يأتي من محرك الرؤية.
    const lines = toLines(items);
    pages.push({ page: i, width: +vp.width.toFixed(1), height: +vp.height.toFixed(1), rotation: page.rotate || 0, kind, chars, images, text_layer: lines.join('\n'), items: items.length ? items : [] });
    page.cleanup();
  }
  const info = meta?.info || {};
  await task.destroy();
  return { page_count: pages.length, pdf_info: { title: info.Title || null, author: info.Author || null, creator: info.Creator || null, producer: info.Producer || null, created: info.CreationDate || null }, pages };
}

function toLines(items) {
  const rows = [];
  for (const it of [...items].sort((a, b) => a.y - b.y)) {
    const r = rows.find(r => Math.abs(r.y - it.y) <= Math.max(2, it.h * 0.4));
    if (r) r.items.push(it); else rows.push({ y: it.y, items: [it] });
  }
  return rows.map(r => {
    const rtl = r.items.some(it => /[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(it.str));
    const its = r.items.sort((a, b) => rtl ? b.x - a.x : a.x - b.x);
    let line = '';
    its.forEach((it, i) => {
      if (i) {
        const p = its[i - 1], gap = rtl ? p.x - (it.x + it.w) : it.x - (p.x + p.w);
        if (gap > Math.max(1.2, (it.h || 8) * 0.18)) line += ' ';
      }
      line += it.str;
    });
    return clean(rtl ? line.replace(/[()]/g, c => (c === '(' ? ')' : '(')) : line);
  }).filter(Boolean);
}

export async function pageAsPdf(buffer, pageNo) {
  const src = await PDFDocument.load(buffer, { ignoreEncryption: true, updateMetadata: false });
  const out = await PDFDocument.create();
  const [p] = await out.copyPages(src, [pageNo - 1]);
  out.addPage(p);
  return Buffer.from(await out.save());
}

export async function pdfPageCount(buffer) {
  const d = await PDFDocument.load(buffer, { ignoreEncryption: true, updateMetadata: false });
  return d.getPageCount();
}

// أشكال العرض العربية (ﺗ ﻘ ﺮ) → حروف أساسية، وإزالة المسافات بين الحروف المفككة
export function clean(t) {
  let s = String(t || '').normalize('NFKC');
  return s.replace(/\s+/g, ' ').trim();
}
