// عقود البيانات لمسار استقبال ملفات PDF (nora-ingest/1)
// المعرفات ثابتة ومشتقة من المحتوى؛ أي تخزين (Drive اليوم، قاعدة بيانات لاحقاً) يحفظ نفس الأشكال.
import crypto from 'node:crypto';

export const SCHEMA_VERSION = 'nora-ingest/1';
export const PIPELINE_VERSION = 'nora-ingest-pipeline/1.0.0';

export const STAGES = ['uploaded', 'queued', 'extracting', 'organizing', 'validating', 'ready', 'partial', 'failed'];
export const STAGE_AR = { uploaded: 'تم الرفع', queued: 'في الانتظار', extracting: 'استخراج', organizing: 'تنظيم', validating: 'تحقق', ready: 'جاهز', partial: 'جاهز جزئياً', failed: 'فشل' };
export const TERMINAL = new Set(['ready', 'partial', 'failed']);

// حالة التحقق لكل قيمة — كلمات وصفية لا نسب ثقة رقمية
export const VERIFY = {
  TEXT_LAYER: 'matched_text_layer',     // الرقم موجود حرفياً في طبقة نص الصفحة
  TOTAL_OK: 'total_reconciled',         // يطابق مجموع التفاصيل ضمن فرق التقريب الموثّق
  VISION_ONLY: 'vision_only',           // مقروء من صورة الصفحة ولم يوجد في طبقة النص (صفحة ممسوحة أو رسم)
  ESTIMATED: 'visual_estimate',         // تقدير بصري من رسم — لا يُستخدم في مؤشرات دقيقة
  CONFLICT: 'conflict',                 // يتعارض مع موضع آخر أو مع المجموع
};
export const USABLE_FOR_METRICS = new Set([VERIFY.TEXT_LAYER, VERIFY.TOTAL_OK, VERIFY.VISION_ONLY]);

export const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');
const short = (s, n = 10) => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, n);

// اسم المستند الموحّد: نفس الاسم بعد إزالة الامتداد والفروقات الشكلية = نفس المستند (إصدارات)
export const normName = name => String(name || '').replace(/\.pdf$/i, '').replace(/\s*\(\d+\)\s*$/, '').replace(/[ـً-ْ]/g, '')
  .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/[_\-–—]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
export const documentId = name => `pdf-${short(normName(name))}`;
export const versionId = (docId, n) => `${docId}@v${n}`;
export const attemptId = () => `att-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${crypto.randomBytes(3).toString('hex')}`;
export const tableId = (vid, n) => `${vid}#t${String(n).padStart(2, '0')}`;
export const recordId = (vid, kind, ...parts) => `${vid}#${kind}-${short(parts.join('|'), 12)}`;
export const datasetId = (vid, n) => `${vid}#ds${String(n).padStart(2, '0')}`;

// المسارات داخل مجلد المستند (نفسها في Drive وفي التخزين المحلي)
export const paths = {
  docManifest: docId => `${docId}/manifest.json`,
  version: (docId, n) => `${docId}/v${n}`,
};
export const VERSION_FILES = ['original.pdf', 'metadata.json', 'document.md', 'metrics.jsonl', 'data_dictionary.json', 'lineage.jsonl', 'quality_report.json', 'quality_report.md', 'dashboard_catalog.json', 'review.xlsx'];
