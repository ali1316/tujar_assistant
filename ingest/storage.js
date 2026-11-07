// StorageAdapter: المعالجة والاستعلام لا يعرفون أين تُحفظ الملفات.
// يدعم Google Drive (Apps Script)، التخزين السحابي S3/R2/Supabase، والتخزين المحلي.
import fs from 'node:fs/promises';
import path from 'node:path';
import { getStorage } from '../src/storage/storage-adapter.js';

export const ROOT_NAME = () => process.env.INGEST_ROOT_NAME || 'نورة — مصادر PDF';

/** @typedef {{ id?: string, url?: string, name?: string, size?: number }} FileInfo */
export class StorageAdapter {
  /** @returns {Promise<FileInfo>} */ async putFile(rel, data, mime) { throw new Error('not implemented'); }
  /** @returns {Promise<Buffer|null>} */ async getFile(rel) { throw new Error('not implemented'); }
  async getText(rel) { const b = await this.getFile(rel); return b ? b.toString('utf8') : null; }
  async getJSON(rel) { const t = await this.getText(rel); return t ? JSON.parse(t) : null; }
  async putJSON(rel, obj) { return this.putFile(rel, JSON.stringify(obj, null, 1), 'application/json'); }
  /** @returns {Promise<FileInfo[]>} */ async list(rel) { throw new Error('not implemented'); }
  /** @returns {Promise<FileInfo>} */ async dir(rel, label) { throw new Error('not implemented'); }
}

export class LocalStorage extends StorageAdapter {
  constructor(base) { super(); this.kind = 'local'; this.base = base; }
  p(rel) { return path.join(this.base, rel); }
  async putFile(rel, data, mime) {
    await fs.mkdir(path.dirname(this.p(rel)), { recursive: true });
    const tmp = this.p(rel) + '.tmp'; await fs.writeFile(tmp, data); await fs.rename(tmp, this.p(rel)); // كتابة ذرية
    return { id: rel, url: 'file://' + this.p(rel), name: path.basename(rel), size: Buffer.byteLength(data) };
  }
  async getFile(rel) { try { return await fs.readFile(this.p(rel)); } catch { return null; } }
  async list(rel) { try { return (await fs.readdir(this.p(rel), { withFileTypes: true })).map(d => ({ name: d.name, dir: d.isDirectory() })); } catch { return []; } }
  async dir(rel) { await fs.mkdir(this.p(rel), { recursive: true }); return { id: rel, url: 'file://' + this.p(rel) }; }
}

export class DriveStorage extends StorageAdapter {
  constructor(scriptUrl, root = ROOT_NAME()) { super(); this.kind = 'drive'; this.url = scriptUrl; this.root = root; this.labels = new Map(); }
  label(seg, text) { this.labels.set(seg, text); }
  async call(body, tries = 3) {
    let err;
    for (let i = 0; i < tries; i++) {
      try {
        const r = await fetch(this.url, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ root: this.root, ...body }), redirect: 'follow' });
        const t = await r.text(); let j;
        try { j = JSON.parse(t); } catch { throw new Error('Drive: رد غير متوقع ' + t.slice(0, 120)); }
        if (!j.ok) { if (/not found|غير موجود/i.test(j.error || '')) return j; throw new Error('Drive: ' + j.error); }
        return j;
      } catch (e) { err = e; await new Promise(r => setTimeout(r, 1000 * (i + 1))); }
    }
    throw err;
  }
  split(rel) { const parts = rel.split('/').filter(Boolean); return { dirs: parts.slice(0, -1), name: parts.at(-1) }; }
  labelsFor(dirs) { const o = {}; dirs.forEach((d, i) => { if (this.labels.has(d)) o[i] = this.labels.get(d); }); return o; }
  async putFile(rel, data, mime) {
    const { dirs, name } = this.split(rel);
    const isText = typeof data === 'string';
    const j = await this.call({ action: 'put', path: dirs, labels: this.labelsFor(dirs), name, mime: mime || 'application/octet-stream', ...(isText ? { text: data } : { data: Buffer.from(data).toString('base64') }) });
    return j.file;
  }
  async getFile(rel) {
    const { dirs, name } = this.split(rel);
    const j = await this.call({ action: 'get', path: dirs, name });
    return j.ok ? Buffer.from(j.data, 'base64') : null;
  }
  async list(rel) { const j = await this.call({ action: 'ls', path: rel.split('/').filter(Boolean) }); return j.ok ? j.items : []; }
  async dir(rel, label) { const segs = rel.split('/').filter(Boolean); if (label) this.label(segs.at(-1), label); const j = await this.call({ action: 'dir', path: segs, labels: this.labelsFor(segs) }); return j.folder; }
  async getById(id) { const j = await this.call({ action: 'getById', id }); if (!j.ok) throw new Error(j.error || 'not found'); return { name: j.name, mime: j.mime, data: Buffer.from(j.data, 'base64'), url: j.url }; }
}

let explicitStorage = null;

export function storage() {
  if (explicitStorage) return explicitStorage;
  // If DRIVE_SCRIPT_URL is provided and STORAGE_TYPE is not 's3', use Google Drive webhook
  const useDrive = process.env.STORAGE_TYPE !== 's3' && process.env.DRIVE_SCRIPT_URL && process.env.INGEST_STORAGE !== 'local';
  if (useDrive) {
    return new DriveStorage(process.env.DRIVE_SCRIPT_URL);
  }
  // When STORAGE_TYPE=s3 or when DRIVE_SCRIPT_URL is not set, use getStorage()
  return getStorage({
    baseDir: process.env.INGEST_LOCAL_DIR || process.env.STORAGE_LOCAL_DIR,
  });
}

export function setStorage(s) { explicitStorage = s; }
