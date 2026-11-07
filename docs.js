// docs.js - Document text extraction, storage, and search
import path from 'node:path';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { db, backend } from './db.js';

if (backend === 'sqlite') {
  try {
    db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      size INTEGER NOT NULL,
      chars INTEGER NOT NULL,
      content TEXT NOT NULL,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS doc_chunks USING fts5(
      norm, doc_id UNINDEXED, idx UNINDEXED, content UNINDEXED,
      tokenize = 'unicode61 remove_diacritics 2'
    );
    `);
  } catch (e) {
    console.warn('[docs] initial sqlite setup warning:', e.message);
  }
}

// توحيد الكتابة العربية عشان "الميزانية" تطابق "ميزانيه"
export function normalize(s) {
  return s
    .replace(/[ً-ْـ]/g, '')       // تشكيل + تطويل
    .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .split(/\s+/)
    .map(w => (w.length > 4 && /^(وال|بال|فال|كال)/.test(w) ? w.slice(3) : w.length > 3 && w.startsWith('ال') ? w.slice(2) : w))
    .join(' ');
}

export async function extractText(buffer, filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.pdf') return (await pdfParse(buffer)).text;
  if (ext === '.docx') return (await mammoth.extractRawText({ buffer })).value;
  if (['.xlsx', '.xls', '.csv'].includes(ext)) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    return wb.SheetNames.map(n => `### ورقة: ${n}\n` + XLSX.utils.sheet_to_csv(wb.Sheets[n])).join('\n\n');
  }
  if (['.txt', '.md', '.json', '.html'].includes(ext)) return buffer.toString('utf8');
  throw new Error(`نوع الملف ${ext} غير مدعوم (المدعوم: PDF, Word, Excel, CSV, TXT, MD, JSON)`);
}

const CHUNK = 1500;
export async function saveDocument(name, type, size, text) {
  text = text.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) throw new Error('ما لقيت نص داخل الملف (لو PDF مصوّر يحتاج OCR)');
  const r = await db.prepare('INSERT INTO documents (name, type, size, chars, content) VALUES (?,?,?,?,?)')
    .run(name, type, size, text.length, text);
  const id = r.lastInsertRowid || r.id;
  await indexDocument(id, text);
  return { id, name, chars: text.length };
}

export async function indexDocument(id, text) {
  const ins = db.prepare('INSERT INTO doc_chunks (norm, doc_id, idx, content) VALUES (?,?,?,?)');
  await db.transaction(async () => {
    await db.prepare('DELETE FROM doc_chunks WHERE doc_id=?').run(id);
    for (let i = 0, k = 0; i < text.length; i += CHUNK - 200, k++) {
      const c = text.slice(i, i + CHUNK);
      await ins.run(normalize(c), id, k, c);
    }
  });
}

// ===== أدوات الملفات للموديل =====
const PAGE = 6000;
export const docTools = {
  list_documents: {
    declaration: {
      name: 'list_documents',
      description: 'قائمة الملفات اللي رفعها المستخدم (رقم، اسم، حجم، تاريخ).',
      parameters: { type: 'OBJECT', properties: {} },
    },
    run: async () => ({
      documents: (await db.prepare('SELECT * FROM documents ORDER BY id DESC').all()).map(({ content, ...d }) => d),
    }),
  },
  search_documents: {
    declaration: {
      name: 'search_documents',
      description: 'بحث نصي داخل الملفات المرفوعة. يرجع أكثر المقاطع صلة بالسؤال. استخدمه للأسئلة عن محتوى الملفات.',
      parameters: {
        type: 'OBJECT',
        properties: {
          query: { type: 'STRING', description: 'كلمات مفتاحية من سؤال المستخدم' },
          document_id: { type: 'INTEGER', description: 'اختياري: حصر البحث في ملف واحد' },
        },
        required: ['query'],
      },
    },
    run: async ({ query, document_id }) => {
      const words = normalize(query).split(/\s+/).filter(w => w.length > 1);
      if (!words.length) return { matches: [] };
      if (backend === 'postgres') {
        let sql = 'SELECT c.doc_id, d.name, c.idx, c.content FROM doc_chunks c JOIN documents d ON d.id = c.doc_id WHERE (c.norm ILIKE ANY($1))';
        const likeArr = words.map(w => `%${w}%`);
        const args = [likeArr];
        if (document_id) { sql += ' AND c.doc_id = $2'; args.push(document_id); }
        sql += ' LIMIT 5';
        return { matches: await db.all(sql, args) };
      }
      const matchWords = words.map(w => `"${w.replace(/"/g, '')}"*`);
      let sql = `SELECT c.doc_id, d.name, c.idx, c.content FROM doc_chunks c JOIN documents d ON d.id = c.doc_id
                 WHERE doc_chunks MATCH ?`;
      const args = [matchWords.join(' OR ')];
      if (document_id) { sql += ' AND c.doc_id = ?'; args.push(document_id); }
      return { matches: await db.prepare(sql + ' ORDER BY bm25(doc_chunks) LIMIT 5').all(...args) };
    },
  },
  read_document: {
    declaration: {
      name: 'read_document',
      description: 'قراءة نص ملف كامل (على صفحات، كل صفحة ~6000 حرف). استخدمها للتلخيص أو لما يكون الملف صغير.',
      parameters: {
        type: 'OBJECT',
        properties: { document_id: { type: 'INTEGER' }, page: { type: 'INTEGER', description: 'يبدأ من 1' } },
        required: ['document_id'],
      },
    },
    run: async ({ document_id, page = 1 }) => {
      const d = await db.prepare('SELECT id, name, content FROM documents WHERE id=?').get(document_id);
      if (!d) return { error: 'الملف غير موجود' };
      const pages = Math.ceil(d.content.length / PAGE);
      return { id: d.id, name: d.name, page, pages, text: d.content.slice((page - 1) * PAGE, page * PAGE) };
    },
  },
};
