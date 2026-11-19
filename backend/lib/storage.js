/* File storage for evidence files and backups.
   - 'local':    files on this server's disk (UPLOADS_DIR, BACKUPS_DIR). Default; fine for one server with a disk.
   - 'supabase': a private Supabase Storage bucket, through its REST API. For hosts without a
                 permanent disk (Render Free/Starter without a disk).
   Keys look like 'evidence/<submission>/<file>' and 'backups/<file>'. */
const fs = require('node:fs');
const path = require('node:path');
const config = require('../config');

/* ---------- local disk ---------- */
const localPath = key => {
  const [area, ...rest] = String(key).split('/');
  const base = area === 'backups' ? config.backupsDir : config.uploadsDir;
  const file = path.normalize(path.join(base, ...rest));
  if (!file.startsWith(path.normalize(base))) throw new Error('Invalid storage key.');
  return file;
};
const local = {
  name: 'local',
  async put(key, buf) { const f = localPath(key); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, buf); },
  async get(key) { const f = localPath(key); return fs.existsSync(f) ? fs.readFileSync(f) : null; },
  async remove(keys) { for (const k of keys) { const f = localPath(k); if (fs.existsSync(f)) fs.unlinkSync(f); } },
};
/* Evidence keys before v1.5 were stored without the 'evidence/' prefix. */
const evidenceKey = stored => (/^(evidence|backups)\//.test(stored) ? stored : `evidence/${stored}`);

/* ---------- Supabase Storage ---------- */
function supabase() {
  const base = `${config.supabaseUrl}/storage/v1`, bucket = config.supabaseBucket, key = config.supabaseKey;
  // New keys (sb_secret_...) go in the apikey header only; legacy JWT keys also as a Bearer token.
  const auth = () => ({ apikey: key, ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}) });
  const objUrl = k => `${base}/object/${encodeURIComponent(bucket)}/${String(k).split('/').map(encodeURIComponent).join('/')}`;
  async function call(url, init, what) {
    let r;
    try { r = await fetch(url, { ...init, headers: { ...auth(), ...(init.headers || {}) }, signal: AbortSignal.timeout(60000) }); }
    catch (e) { throw new Error(`File storage could not be reached while ${what} (${e.name === 'TimeoutError' ? 'timed out' : e.message}).`); }
    return r;
  }
  const why = async r => { try { const j = await r.json(); return j.message || j.error || ''; } catch { return ''; } };
  return {
    name: 'supabase',
    async put(k, buf, mime) {
      const send = () => call(objUrl(k), { method: 'POST', headers: { 'Content-Type': mime || 'application/octet-stream', 'x-upsert': 'true', 'cache-control': 'no-store' }, body: buf }, 'saving a file');
      let r = await send();
      if (!r.ok) {
        let msg = await why(r);
        // First use: create the bucket as a private bucket, then try once more.
        if (/bucket not found/i.test(msg)) {
          const c = await call(`${base}/bucket`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: bucket, name: bucket, public: false }) }, 'creating the storage bucket');
          if (!c.ok && !/already exists/i.test(await why(c))) throw new Error(`The storage bucket "${bucket}" does not exist and could not be created (${c.status}). Create it as a private bucket in Supabase.`);
          r = await send(); msg = r.ok ? '' : await why(r);
        }
        if (!r.ok) throw new Error(`File storage refused the file (${r.status}${msg ? ': ' + msg : ''}).`);
      }
    },
    async get(k) {
      const r = await call(objUrl(k), { method: 'GET' }, 'reading a file');
      if (r.status === 404 || r.status === 400) return null;
      if (!r.ok) throw new Error(`File storage refused to return the file (${r.status}).`);
      return Buffer.from(await r.arrayBuffer());
    },
    async remove(keys) {
      if (!keys.length) return;
      const r = await call(`${base}/object/${encodeURIComponent(bucket)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: keys }) }, 'deleting files');
      if (!r.ok && r.status !== 404) throw new Error(`File storage refused to delete (${r.status}).`);
    },
  };
}

let impl = null;
function store() {
  if (impl) return impl;
  if (config.storage === 'supabase') {
    if (!config.supabaseUrl || !config.supabaseKey) throw new Error('STORAGE=supabase needs SUPABASE_URL and SUPABASE_SECRET_KEY.');
    impl = supabase();
  } else impl = local;
  return impl;
}
module.exports = {
  put: (k, b, m) => store().put(k, b, m), get: k => store().get(k), remove: keys => store().remove(keys.filter(Boolean)),
  name: () => store().name, evidenceKey, reset: () => { impl = null; },
};
