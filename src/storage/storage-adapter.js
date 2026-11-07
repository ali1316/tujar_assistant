import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Vendor-agnostic base StorageAdapter interface.
 */
export class StorageAdapter {
  constructor() {
    this.kind = 'base';
  }

  /**
   * @param {string} key
   * @param {Buffer|Uint8Array|string} buffer
   * @param {string} [mimeType]
   * @returns {Promise<{ key: string, url: string, size: number }>}
   */
  async put(key, buffer, mimeType) {
    throw new Error('Not implemented: put');
  }

  /**
   * @param {string} key
   * @returns {Promise<Buffer|null>}
   */
  async get(key) {
    throw new Error('Not implemented: get');
  }

  /**
   * @param {string} key
   * @returns {Promise<ReadableStream|null>}
   */
  async getStream(key) {
    throw new Error('Not implemented: getStream');
  }

  /**
   * @param {string} key
   * @returns {Promise<boolean>}
   */
  async exists(key) {
    throw new Error('Not implemented: exists');
  }

  /**
   * @param {string} key
   * @returns {Promise<boolean>}
   */
  async delete(key) {
    throw new Error('Not implemented: delete');
  }

  /**
   * @param {string} [prefix='']
   * @returns {Promise<string[]>}
   */
  async list(prefix = '') {
    throw new Error('Not implemented: list');
  }

  // --- Convenience & backward-compatible methods for ingest pipeline ---
  async putFile(rel, data, mime) {
    const res = await this.put(rel, data, mime);
    return {
      id: res.key,
      key: res.key,
      url: res.url,
      name: path.basename(res.key),
      size: res.size,
    };
  }

  async getFile(rel) {
    return await this.get(rel);
  }

  async getText(rel) {
    const b = await this.get(rel);
    return b ? b.toString('utf8') : null;
  }

  async getJSON(rel) {
    const t = await this.getText(rel);
    return t ? JSON.parse(t) : null;
  }

  async putJSON(rel, obj) {
    return await this.putFile(rel, JSON.stringify(obj, null, 1), 'application/json');
  }

  async dir(rel, label) {
    return { id: rel, key: rel, url: this.getUrl ? this.getUrl(rel) : rel };
  }

  label(seg, text) {
    if (!this.labels) this.labels = new Map();
    this.labels.set(seg, text);
  }
}

/**
 * Local filesystem storage adapter.
 */
export class LocalStorageAdapter extends StorageAdapter {
  constructor(options = {}) {
    super();
    this.kind = 'local';
    const rawDir = options.baseDir || options.dir || process.env.STORAGE_LOCAL_DIR || process.env.INGEST_LOCAL_DIR || './ingest-data/storage';
    this.baseDir = path.resolve(rawDir);
    this.publicUrl = (options.publicUrl || process.env.STORAGE_PUBLIC_URL || '').replace(/\/+$/, '');
  }

  _normalizeKey(key) {
    return String(key || '').replace(/^[/\\]+/, '').replace(/\\/g, '/');
  }

  _resolve(normKey) {
    const resolved = path.resolve(this.baseDir, normKey);
    const safeBase = path.resolve(this.baseDir);
    if (resolved !== safeBase && !resolved.startsWith(safeBase + path.sep)) {
      throw new Error(`Path traversal attempt blocked: ${normKey}`);
    }
    return resolved;
  }

  getUrl(key) {
    const normKey = this._normalizeKey(key);
    if (this.publicUrl) {
      return `${this.publicUrl}/${normKey}`;
    }
    const filePath = this._resolve(normKey);
    return 'file://' + filePath.replace(/\\/g, '/');
  }

  async put(key, buffer, mimeType) {
    const normKey = this._normalizeKey(key);
    const filePath = this._resolve(normKey);
    const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    await fs.writeFile(tmp, data);
    await fs.rename(tmp, filePath);

    return {
      key: normKey,
      url: this.getUrl(normKey),
      size: data.length,
    };
  }

  async get(key) {
    const normKey = this._normalizeKey(key);
    const filePath = this._resolve(normKey);
    try {
      return await fs.readFile(filePath);
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }

  async getStream(key) {
    const normKey = this._normalizeKey(key);
    const filePath = this._resolve(normKey);
    try {
      await fs.access(filePath);
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
    return Readable.toWeb(createReadStream(filePath));
  }

  async exists(key) {
    const normKey = this._normalizeKey(key);
    const filePath = this._resolve(normKey);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async delete(key) {
    const normKey = this._normalizeKey(key);
    const filePath = this._resolve(normKey);
    try {
      await fs.unlink(filePath);
      return true;
    } catch (err) {
      if (err.code === 'ENOENT') return false;
      throw err;
    }
  }

  async list(prefix = '') {
    const normPrefix = this._normalizeKey(prefix);
    const results = [];

    const scan = async (dir, base) => {
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await scan(full, base);
        } else if (entry.isFile()) {
          const rel = path.relative(base, full).replace(/\\/g, '/');
          results.push(rel);
        }
      }
    };

    await scan(this.baseDir, this.baseDir);
    return normPrefix ? results.filter(k => k.startsWith(normPrefix)) : results;
  }

  async dir(key, label) {
    const normKey = this._normalizeKey(key);
    const filePath = this._resolve(normKey);
    await fs.mkdir(filePath, { recursive: true });
    return {
      id: normKey,
      key: normKey,
      url: this.getUrl(normKey),
    };
  }
}

/**
 * S3-compatible object storage adapter (Cloudflare R2, AWS S3, Supabase Storage, MinIO).
 */
export class S3StorageAdapter extends StorageAdapter {
  constructor(options = {}) {
    super();
    this.kind = 's3';
    this.bucket = options.bucket || process.env.S3_BUCKET || process.env.STORAGE_BUCKET || 'default';
    this.region = options.region || process.env.S3_REGION || process.env.AWS_REGION || 'auto';
    this.accessKeyId = options.accessKeyId || process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || '';
    this.secretAccessKey = options.secretAccessKey || process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || '';
    this.publicUrl = (options.publicUrl || process.env.S3_PUBLIC_URL || process.env.STORAGE_PUBLIC_URL || '').replace(/\/+$/, '');
    this.forcePathStyle = options.forcePathStyle ?? (process.env.S3_FORCE_PATH_STYLE !== 'false');
    this._fetch = options.fetch || globalThis.fetch;

    let endpoint = options.endpoint || process.env.S3_ENDPOINT || process.env.AWS_ENDPOINT_URL || '';
    if (!endpoint) {
      if (this.region === 'auto' || !this.region) {
        endpoint = 'https://s3.amazonaws.com';
      } else {
        endpoint = `https://s3.${this.region}.amazonaws.com`;
      }
    }
    if (!/^https?:\/\//i.test(endpoint)) {
      endpoint = 'https://' + endpoint;
    }
    this.endpoint = endpoint.replace(/\/+$/, '');
  }

  _normalizeKey(key) {
    return String(key || '').replace(/^[/\\]+/, '').replace(/\\/g, '/');
  }

  buildUrl(key = '', queryParams = {}) {
    const normKey = this._normalizeKey(key);
    let base;
    if (this.forcePathStyle) {
      base = `${this.endpoint}/${this.bucket}${normKey ? '/' + normKey.split('/').map(encodeURIComponent).join('/') : ''}`;
    } else {
      const u = new URL(this.endpoint);
      base = `${u.protocol}//${this.bucket}.${u.host}${normKey ? '/' + normKey.split('/').map(encodeURIComponent).join('/') : ''}`;
    }
    const url = new URL(base);
    for (const [k, v] of Object.entries(queryParams)) {
      if (v !== undefined && v !== null) {
        url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }

  getUrl(key) {
    const normKey = this._normalizeKey(key);
    if (this.publicUrl) {
      return `${this.publicUrl}/${normKey.split('/').map(encodeURIComponent).join('/')}`;
    }
    return this.buildUrl(normKey);
  }

  createHeaders(methodOrOptions = 'GET', keyArg = '', payloadArg = '', extraHeadersArg = {}, dateArg = null) {
    let method = 'GET';
    let key = '';
    let payload = '';
    let extraHeaders = {};
    let date = null;
    let queryParams = {};

    if (typeof methodOrOptions === 'object' && methodOrOptions !== null) {
      method = methodOrOptions.method || 'GET';
      key = methodOrOptions.key ?? '';
      payload = methodOrOptions.body ?? methodOrOptions.payload ?? '';
      extraHeaders = methodOrOptions.headers || {};
      date = methodOrOptions.date;
      queryParams = methodOrOptions.query || methodOrOptions.queryParams || {};
    } else {
      method = methodOrOptions || 'GET';
      key = keyArg ?? '';
      payload = payloadArg ?? '';
      extraHeaders = extraHeadersArg || {};
      date = dateArg;
    }

    method = method.toUpperCase();
    const normKey = this._normalizeKey(key);
    const fullUrl = this.buildUrl(normKey, queryParams);
    const parsedUrl = new URL(fullUrl);

    const now = date instanceof Date ? date : (date ? new Date(date) : new Date());
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);

    const payloadBuffer = Buffer.isBuffer(payload)
      ? payload
      : Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload));
    const payloadHash = crypto.createHash('sha256').update(payloadBuffer).digest('hex');

    const headers = {
      'host': parsedUrl.host,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
    };

    for (const [k, v] of Object.entries(extraHeaders)) {
      if (v !== undefined && v !== null) {
        headers[k.toLowerCase()] = String(v);
      }
    }

    // AWS SigV4 authentication
    if (this.accessKeyId && this.secretAccessKey) {
      const canonicalUri = parsedUrl.pathname.split('/').map(encodeURIComponent).join('/');
      const canonicalQuery = [...parsedUrl.searchParams.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');

      const sortedHeaderKeys = Object.keys(headers).sort();
      const canonicalHeaders = sortedHeaderKeys
        .map(k => `${k}:${headers[k].trim()}\n`)
        .join('');
      const signedHeaders = sortedHeaderKeys.join(';');

      const canonicalRequest = [
        method,
        canonicalUri,
        canonicalQuery,
        canonicalHeaders,
        signedHeaders,
        payloadHash,
      ].join('\n');

      const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
      const stringToSign = [
        'AWS4-HMAC-SHA256',
        amzDate,
        credentialScope,
        crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
      ].join('\n');

      const kDate = crypto.createHmac('sha256', 'AWS4' + this.secretAccessKey).update(dateStamp).digest();
      const kRegion = crypto.createHmac('sha256', kDate).update(this.region).digest();
      const kService = crypto.createHmac('sha256', kRegion).update('s3').digest();
      const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
      const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

      headers['authorization'] = `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    }

    return headers;
  }

  getHeaders(...args) {
    return this.createHeaders(...args);
  }

  async put(key, buffer, mimeType) {
    const normKey = this._normalizeKey(key);
    const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    const headers = this.createHeaders('PUT', normKey, data, {
      'content-type': mimeType || 'application/octet-stream',
      'content-length': String(data.length),
    });
    const url = this.buildUrl(normKey);
    const res = await this._fetch(url, { method: 'PUT', headers, body: data });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`S3 put failed (${res.status}): ${text}`);
    }
    return {
      key: normKey,
      url: this.getUrl(normKey),
      size: data.length,
    };
  }

  async get(key) {
    const normKey = this._normalizeKey(key);
    const url = this.buildUrl(normKey);
    const headers = this.createHeaders('GET', normKey);
    const res = await this._fetch(url, { method: 'GET', headers });
    if (res.status === 404) return null;
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`S3 get failed (${res.status}): ${text}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async getStream(key) {
    const normKey = this._normalizeKey(key);
    const url = this.buildUrl(normKey);
    const headers = this.createHeaders('GET', normKey);
    const res = await this._fetch(url, { method: 'GET', headers });
    if (res.status === 404) return null;
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`S3 getStream failed (${res.status}): ${text}`);
    }
    return res.body;
  }

  async exists(key) {
    const normKey = this._normalizeKey(key);
    const url = this.buildUrl(normKey);
    const headers = this.createHeaders('HEAD', normKey);
    try {
      const res = await this._fetch(url, { method: 'HEAD', headers });
      if (res.status === 200) return true;
      if (res.status === 404) return false;
      return false;
    } catch {
      return false;
    }
  }

  async delete(key) {
    const normKey = this._normalizeKey(key);
    const url = this.buildUrl(normKey);
    const headers = this.createHeaders('DELETE', normKey);
    const res = await this._fetch(url, { method: 'DELETE', headers });
    return res.ok || res.status === 204 || res.status === 404;
  }

  async list(prefix = '') {
    const normPrefix = this._normalizeKey(prefix);
    const query = { 'list-type': '2' };
    if (normPrefix) query.prefix = normPrefix;
    const url = this.buildUrl('', query);
    const headers = this.createHeaders({ method: 'GET', key: '', query, headers: {} });
    const res = await this._fetch(url, { method: 'GET', headers });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`S3 list failed (${res.status}): ${text}`);
    }
    const xml = await res.text();
    const keys = [];
    const re = /<Key>([^<]+)<\/Key>/g;
    let match;
    while ((match = re.exec(xml)) !== null) {
      keys.push(match[1]);
    }
    return keys;
  }
}

let activeAdapter = null;
let activeType = null;
let isExplicit = false;

/**
 * Factory returning the active adapter based on STORAGE_TYPE ('s3' | 'local', default 'local').
 * @param {object} [options={}]
 * @returns {StorageAdapter}
 */
export function getStorage(options = {}) {
  const currentEnvType = (process.env.STORAGE_TYPE || 'local').toLowerCase();
  const requestedType = (options.type || currentEnvType).toLowerCase();

  if (activeAdapter && !options.forceNew) {
    if (isExplicit && !options.type) {
      return activeAdapter;
    }
    if (activeType === requestedType) {
      if (requestedType === 'local') {
        const desiredBaseDir = options.baseDir || options.dir || process.env.STORAGE_LOCAL_DIR || process.env.INGEST_LOCAL_DIR || './ingest-data/storage';
        const resolvedDesired = path.resolve(desiredBaseDir);
        if (activeAdapter.baseDir && activeAdapter.baseDir === resolvedDesired) {
          return activeAdapter;
        }
      } else {
        return activeAdapter;
      }
    }
  }

  let adapter;
  if (requestedType === 's3') {
    adapter = new S3StorageAdapter(options);
  } else {
    adapter = new LocalStorageAdapter(options);
  }

  if (Object.keys(options).length === 0 || (!options.forceNew && !options.type)) {
    activeAdapter = adapter;
    activeType = requestedType;
    isExplicit = false;
  }

  return adapter;
}

export function setStorage(adapter) {
  activeAdapter = adapter;
  activeType = adapter?.kind || (adapter instanceof S3StorageAdapter ? 's3' : 'local');
  isExplicit = true;
}

export function resetStorage() {
  activeAdapter = null;
  activeType = null;
  isExplicit = false;
}
