import crypto from 'node:crypto';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { ai } from '../ai.js';
import { parseWorkbook, isTabular } from '../../datasets.js';
import { extractText } from '../../docs.js';
import { doclingReady, doclingTables } from '../../ingest/extract.js';

let _customSynthesisEngine = null;
export function _setSynthesisEngine(engine) {
  _customSynthesisEngine = engine;
}

const hasGeminiKey = () => Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);

export const AUTO_DK_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Clean Arabic document or dataset title' },
    purpose: { type: 'string', description: '1-2 sentence description of what the data/document is for' },
    summary: { type: 'string', description: 'Executive summary with key figures, findings, and metrics' },
    keywords: {
      type: 'array',
      items: { type: 'string' },
      description: 'Array of 5-10 business terms or entities',
    },
    quality_pending: {
      type: 'array',
      items: { type: 'string' },
      description: 'Array of caveats, unverified notes, or data discrepancies',
    },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          n: { type: 'integer' },
          heading: { type: 'string' },
          text: { type: 'string' },
        },
        required: ['n', 'heading', 'text'],
      },
      description: 'Array of logical sections based on document structure',
    },
    tables: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          sheet: { type: 'string' },
          columns: { type: 'array', items: { type: 'string' } },
          rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
        },
        required: ['sheet', 'columns', 'rows'],
      },
      description: 'Optional structured tables extracted from document content',
    },
  },
  required: ['title', 'purpose', 'summary', 'keywords', 'quality_pending', 'sections'],
};

/**
 * Heuristic/Mock synthesis engine for offline testing or when Gemini API is unavailable.
 */
export function synthesizeMock({ fileName = '', mimeType = '', text = '', tables = [] } = {}) {
  const cleanLines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  // 1. Clean Arabic document title
  let title = '';
  const baseName = path.basename(fileName || 'document', path.extname(fileName || ''));
  const fileTitle = baseName.replace(/[_\-]+/g, ' ').trim();

  const titleCandidate = cleanLines.find(
    l =>
      l.length >= 4 &&
      l.length <= 120 &&
      /[\u0600-\u06FF]/.test(l) &&
      !/^(م|#|id|no|صفحة|page|\d+)/i.test(l) &&
      !l.includes(',') &&
      !l.includes('\t') &&
      !l.includes('|')
  );

  if (titleCandidate) {
    title = titleCandidate.replace(/^[#*\-•\s]+/, '').trim();
  } else if (/[\u0600-\u06FF]/.test(fileTitle)) {
    title = fileTitle;
  } else {
    title = fileTitle ? `بيانات ${fileTitle}` : 'مستند بيانات غير معنون';
  }

  // 2. Purpose (1-2 sentences)
  const purpose = `توثيق وتحليل بيانات «${title}» ومتابعة المؤشرات التشغيلية والمالية المرتبطة بها.`;

  // 3. Executive summary with key figures and findings
  const numbersFound = Array.from(
    new Set(
      (text.match(/[\d,.]+(?:\s*(?:%|٪|ريال|ر\.س|خدمة|مشروع|مستخدم))?/g) || [])
        .map(n => n.trim())
        .filter(n => /\d/.test(n) && n.length > 1 && !/^\d{4}$/.test(n))
    )
  ).slice(0, 5);

  let summary = `يتضمن المستند «${title}» تحليلاً شاملاً للمؤشرات الرئيسية وبيانات الأداء المسجلة.`;
  if (numbersFound.length) {
    summary += ` ومن أبرز الأرقام والمؤشرات المرصودة: ${numbersFound.join('، ')}.`;
  }
  if (tables.length) {
    const totalRows = tables.reduce((acc, t) => acc + (t.rows?.length || 0), 0);
    summary += ` يحتوي الملف على ${tables.length} جدول بيانات بإجمالي ${totalRows} صفاً من البيانات التفصيلية.`;
  }

  // 4. Keywords: array of 5-10 business terms/entities
  const defaultKeywords = [
    'مؤشرات الأداء',
    'بيانات تشغيلية',
    'تقارير دورية',
    'إحصائيات',
    'إنجاز',
    'لوحة التحكم',
    'تحليل البيانات',
    'العمليات',
  ];

  const extractedWords = [];
  const combinedText = `${title} ${tables.map(t => (t.columns || []).join(' ')).join(' ')} ${cleanLines.slice(0, 10).join(' ')}`;
  const words = combinedText.split(/\s+/);
  for (const w of words) {
    const clean = w.replace(/[^\u0621-\u064A]/g, '').trim();
    if (clean.length >= 4 && !defaultKeywords.includes(clean) && !extractedWords.includes(clean)) {
      extractedWords.push(clean);
    }
    if (extractedWords.length >= 5) break;
  }
  const keywords = Array.from(new Set([...extractedWords, ...defaultKeywords])).slice(0, 8);

  // 5. Quality pending: caveats, unverified notes, or discrepancies
  const quality_pending = [];
  for (const line of cleanLines) {
    if (/(?:حاشية|ملاحظة|تنبيه|غير مدقق|معلق|استثناء|قيد المراجعة|مسودة)/i.test(line)) {
      quality_pending.push(line.replace(/^[#*\-•\s]+/, '').slice(0, 200));
      if (quality_pending.length >= 3) break;
    }
  }

  // 6. Sections: array of { n, heading, text } based on document structure
  const sections = [];
  let secIdx = 1;

  const introText = cleanLines.slice(0, 5).join('\n') || summary;
  sections.push({
    n: secIdx++,
    heading: 'المقدمة ونظرة عامة',
    text: introText.slice(0, 2000),
  });

  for (const t of tables) {
    const colStr = (t.columns || []).join('، ');
    const rowCount = t.rows?.length || 0;
    sections.push({
      n: secIdx++,
      heading: `بيانات: ${t.sheet}`,
      text: `جدول «${t.sheet}» يتضمن ${rowCount} صفاً ومقاييس الأعمدة: (${colStr}).`.slice(0, 2000),
    });
  }

  if (cleanLines.length > 5) {
    const remainingText = cleanLines.slice(5).join('\n');
    if (remainingText.length > 50) {
      sections.push({
        n: secIdx++,
        heading: 'التفاصيل والمؤشرات',
        text: remainingText.slice(0, 4000),
      });
    }
  }

  return {
    title,
    purpose,
    summary,
    keywords,
    quality_pending,
    sections,
  };
}

/**
 * Gemini Flash synthesis with structured schema.
 */
async function synthesizeWithGemini({ buffer, fileName, mimeType, text, tables }) {
  const model = process.env.AUTO_DK_MODEL || 'gemini-2.5-flash';
  const tableSummary = tables.length
    ? `الجداول المستخرجة (${tables.length} جدول):\n` +
      tables.map(t => `[${t.sheet}]: ${t.columns.join(' | ')} (${t.rows.length} صف)`).join('\n')
    : 'لم يتم استخراج جداول مسبقة.';

  const prompt = `أنت محلل بيانات ومستندات تنفيذي خبير. مهمتك قراءة المستند/البيانات المرفقة وتوليد ملخص تنفيذي وسياق دلالي كامل وفق المخطط المطلوب باللغة العربية:
- title: عنوان عربي دقيق ونظيف للمستند
- purpose: وصف في جملة أو جملتين يوضح الغرض من هذه البيانات/المستند واستخدامها الرئيسي
- summary: ملخص تنفيذي يبرز أهم الأرقام والنتائج والمؤشرات بدقة
- keywords: مصفوفة تحتوي من 5 إلى 10 مصطلحات وكيانات أعمال رئيسية
- quality_pending: مصفوفة بأي محاذير أو ملاحظات جودة أو أرقام معلقة أو فروقات (أو مصفوفة فارغة لو لم توجد)
- sections: مصفوفة الأقسام الهيكلية للمستند { n, heading, text }

اسم الملف: ${fileName}
نوع الملف: ${mimeType || 'unknown'}
${tableSummary}

محتوى المستند أو عينة البيانات:
"""
${(text || '').slice(0, 12000)}
"""`;

  const timeoutMs = Number(process.env.AUTO_DK_TIMEOUT_MS) || 20000;
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Gemini synthesis timed out after ${timeoutMs}ms`)), timeoutMs)
  );

  const response = await Promise.race([
    ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: AUTO_DK_SCHEMA,
        temperature: 0.1,
      },
    }),
    timeoutPromise,
  ]);

  if (!response?.text) throw new Error('استجابة فارغة من نموذج Gemini');
  return JSON.parse(response.text);
}

/**
 * Extract markdown-style tables from text.
 */
function extractMarkdownTables(text) {
  if (!text) return [];
  const lines = text.split(/\r?\n/).map(l => l.trim());
  const tableGroups = [];
  let currentGroup = [];

  for (const line of lines) {
    if (line.startsWith('|') && line.endsWith('|')) {
      currentGroup.push(line);
    } else {
      if (currentGroup.length >= 2) tableGroups.push([...currentGroup]);
      currentGroup = [];
    }
  }
  if (currentGroup.length >= 2) tableGroups.push([...currentGroup]);

  const result = [];
  for (let i = 0; i < tableGroups.length; i++) {
    const tLines = tableGroups[i];
    const parseCells = l => l.slice(1, -1).split('|').map(c => c.trim());
    const header = parseCells(tLines[0]);
    const rows = [];
    for (let j = 1; j < tLines.length; j++) {
      if (/^\|?\s*[-:]+[-| :]*\|?$/.test(tLines[j])) continue;
      rows.push(parseCells(tLines[j]));
    }
    if (header.length >= 2 && rows.length > 0) {
      const aoa = [header, ...rows];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      const csv = XLSX.utils.sheet_to_csv(ws);
      result.push({
        sheet: `جدول ${i + 1}`,
        csv,
        columns: header,
        rows,
      });
    }
  }
  return result;
}

/**
 * Generates an Auto-DK bundle ('fawaz-dk-bundle/1') autonomously from raw document content.
 *
 * @param {Object} params
 * @param {Buffer} [params.buffer] - Raw file buffer
 * @param {string} [params.fileName] - Original file name
 * @param {string} [params.mimeType] - MIME type
 * @param {string} [params.text] - Extracted document text (optional)
 * @param {Object} [params.options] - Optional overrides (e.g. synthesisEngine)
 * @returns {Promise<Object>} Assembled bundle matching fawaz-dk-bundle/1 format
 */
export async function generateAutoDK({
  buffer,
  fileName = 'document',
  mimeType = '',
  text = '',
  options = {},
} = {}) {
  let buf = buffer;
  if (!buf && text) {
    buf = Buffer.from(text, 'utf8');
  } else if (buf && !Buffer.isBuffer(buf)) {
    buf = Buffer.from(buf);
  }
  if (!buf) {
    buf = Buffer.from('', 'utf8');
  }

  // 1. Calculate SHA-256 and unique ID ds-xxxxxxxx (8 hex chars)
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const id = `ds-${sha256.slice(0, 8)}`;

  // If text not provided, try extraction from buffer
  let extractedText = text;
  if (!extractedText && buf.length > 0) {
    try {
      extractedText = await extractText(buf, fileName);
    } catch {
      extractedText = '';
    }
  }

  // 2. Extract tables from spreadsheets or PDFs
  const tables = [];
  const allColumns = [];
  const allValues = [];

  const addTable = (sheet, columns, rows) => {
    if (!columns?.length || !rows?.length) return;
    const aoa = [columns, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const csv = XLSX.utils.sheet_to_csv(ws);
    tables.push({ sheet, csv, columns, rows });

    for (const c of columns) {
      if (c && !allColumns.includes(c)) allColumns.push(c);
    }
    for (const r of rows) {
      for (const v of r) {
        if (v != null && String(v).trim()) {
          const str = String(v).trim();
          if (!allValues.includes(str) && allValues.length < 60) {
            allValues.push(str);
          }
        }
      }
    }
  };

  // Spreadsheets via parseWorkbook
  const isSpreadsheet =
    buf.length > 0 &&
    (isTabular(fileName) || /csv|spreadsheet|excel/i.test(mimeType || ''));

  if (isSpreadsheet) {
    try {
      const sheets = parseWorkbook(buf, fileName);
      for (const s of sheets) {
        addTable(s.sheet, s.columns, s.rows);
      }
    } catch (err) {
      console.warn('[auto-dk] parseWorkbook error:', err.message);
    }
  }

  // PDFs via docling if available
  if (buf.length > 0 && (/\.pdf$/i.test(fileName) || /pdf/i.test(mimeType || ''))) {
    if (doclingReady()) {
      try {
        const dt = await doclingTables(buf, fileName);
        for (const t of dt) {
          if (t.grid && t.grid.length > 1) {
            const columns = t.grid[0].map((c, idx) => String(c || `عمود ${idx + 1}`).trim());
            const rows = t.grid.slice(1);
            addTable(`جدول ${t.n || tables.length + 1}`, columns, rows);
          }
        }
      } catch (err) {
        console.warn('[auto-dk] doclingTable error:', err.message);
      }
    }
  }

  // Markdown tables in text if no tables extracted yet
  if (!tables.length && extractedText) {
    const mdTables = extractMarkdownTables(extractedText);
    for (const mt of mdTables) {
      addTable(mt.sheet, mt.columns, mt.rows);
    }
  }

  // 3. Synthesize semantic metadata via Gemini Flash or Mock Fallback
  let synthesized = null;
  const synthesisParams = {
    buffer: buf,
    fileName,
    mimeType,
    text: extractedText,
    tables,
  };

  if (options.synthesisEngine) {
    synthesized = await options.synthesisEngine(synthesisParams);
  } else if (_customSynthesisEngine) {
    synthesized = await _customSynthesisEngine(synthesisParams);
  } else if (hasGeminiKey()) {
    try {
      synthesized = await synthesizeWithGemini(synthesisParams);
    } catch (err) {
      console.warn('[auto-dk] Gemini synthesis failed, falling back to mock:', err.message);
      synthesized = synthesizeMock(synthesisParams);
    }
  } else {
    synthesized = synthesizeMock(synthesisParams);
  }

  // Integrate any LLM-extracted tables
  if (Array.isArray(synthesized?.tables) && synthesized.tables.length > 0) {
    for (const t of synthesized.tables) {
      if (t.columns?.length && t.rows?.length) {
        addTable(t.sheet || `جدول ${tables.length + 1}`, t.columns, t.rows);
      }
    }
  }

  // 4. Determine kind
  const kind = tables.length > 0 ? (isSpreadsheet ? 'spreadsheet' : 'dataset') : 'document';

  // 5. Assemble complete bundle object with format 'fawaz-dk-bundle/1'
  const bundle = {
    format: 'fawaz-dk-bundle/1',
    id,
    sha256,
    pipeline: 'auto-dk',
    version: 1,
    kind,
    source_file: fileName,
    title: synthesized.title || fileName.replace(/\.[^.]+$/, '').replace(/[_\-]+/g, ' '),
    status: 'جاهز',
    purpose: synthesized.purpose || `بيانات ومؤشرات مستخرجة من ${fileName}`,
    summary: synthesized.summary || `ملخص تحليلي لمستند ${fileName}`,
    keywords:
      Array.isArray(synthesized.keywords) && synthesized.keywords.length >= 5
        ? synthesized.keywords.slice(0, 10)
        : ['بيانات', 'مؤشرات الأداء', 'إحصائيات', 'تقارير', 'أعمال'],
    columns: allColumns,
    values: allValues.slice(0, 60),
    quality_pending: Array.isArray(synthesized.quality_pending) ? synthesized.quality_pending : [],
    quality_changes: [],
    drive_folder: null,
    sections:
      Array.isArray(synthesized.sections) && synthesized.sections.length > 0
        ? synthesized.sections.map((s, idx) => ({
            n: s.n ?? idx + 1,
            heading: s.heading || `قسم ${idx + 1}`,
            text: String(s.text || '').slice(0, 6000),
          }))
        : [
            {
              n: 1,
              heading: 'المقدمة ونظرة عامة',
              text: (extractedText || synthesized.summary || '').slice(0, 2000),
            },
          ],
    tables: tables.map(t => ({ sheet: t.sheet, csv: t.csv })),
  };

  return bundle;
}
