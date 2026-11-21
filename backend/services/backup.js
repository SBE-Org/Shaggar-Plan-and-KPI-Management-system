/* Backups: a complete copy of the data as compressed JSON (every table, every row),
   with a SHA-256 checksum. The same format works on SQLite and PostgreSQL (Neon), so
   a backup taken on one can be restored on the other. Files are kept through the
   storage layer (server disk or Supabase Storage). Restore takes a safety copy first.
   Downloads are encrypted with AES-256-GCM. Backups made by v1.4 and earlier (SQLite
   database files) can still be restored and imported. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const db = require('../db');
const audit = require('../lib/audit');
const storage = require('../lib/storage');
const { sha256, encrypt, decrypt } = require('../lib/security');

// Not part of a backup: the backup index itself and short-lived sign-in records.
const SKIP = new Set(['backups', 'sessions', 'otp_challenges', 'schema_version']);
const dataTables = () => db.tables().filter(t => !SKIP.has(t));

function dump() {
  const tables = {}; for (const t of dataTables()) tables[t] = db.all(`SELECT * FROM ${t}`);
  return { format: 'shaggar-pms-data', version: 1, engine: db.engine(), created_at: db.now(), tables };
}
const pack = data => zlib.gzipSync(Buffer.from(JSON.stringify(data)));
function unpack(buf) {
  if (buf[0] === 0x1f && buf[1] === 0x8b) { const d = JSON.parse(zlib.gunzipSync(buf)); if (d.format !== 'shaggar-pms-data') throw new Error('This is not a Shaggar PMS backup.'); return d; }
  if (buf.subarray(0, 15).toString() === 'SQLite format 3') return fromSqlite(buf);
  throw new Error('This is not a Shaggar PMS backup.');
}
/* A v1.4-style backup is a whole SQLite database file: read its tables. */
function fromSqlite(buf) {
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'spms-restore-')), 'backup.db');
  fs.writeFileSync(tmp, buf);
  try { return fromSqliteFile(tmp); } finally { fs.rmSync(path.dirname(tmp), { recursive: true, force: true }); }
}
/** Read every table of a SQLite database file (including changes still in its -wal file). */
function fromSqliteFile(file) {
  const { DatabaseSync } = require('node:sqlite');
  const src = new DatabaseSync(file);
  try {
    const have = new Set(src.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(r => r.name));
    if (!have.has('users')) throw new Error('This SQLite file does not contain a Shaggar PMS database.');
    const tables = {}; for (const t of dataTables()) if (have.has(t)) tables[t] = src.prepare(`SELECT * FROM ${t}`).all().map(r => ({ ...r }));
    return { format: 'shaggar-pms-data', version: 1, engine: 'sqlite', created_at: null, tables };
  } finally { src.close(); }
}

async function create(ctx, kind = 'manual') {
  const id = db.id('B'), file = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}-${kind}.json.gz`;
  const buf = pack(dump());
  await storage.put(`backups/${file}`, buf, 'application/gzip');
  const row = { id, created_at: db.now(), created_by: ctx?.user?.id || null, kind, size: buf.length, checksum: sha256(buf), file_name: file, format: 'json' };
  db.insert('backups', row);
  audit.log(ctx, kind === 'manual' ? 'Backup created' : `Automatic backup created (${kind})`, 'Backup', id, `${(buf.length / 1024).toFixed(0)} KB · SHA-256 ${row.checksum.slice(0, 12)}…`);
  await prune();
  return row;
}
async function prune() {
  const keep = db.getSetting('retention').backupKeep;
  const old = db.all('SELECT * FROM backups ORDER BY created_at DESC').slice(keep);
  for (const b of old) db.run('DELETE FROM backups WHERE id = ?', b.id);
  await storage.remove(old.map(b => `backups/${b.file_name}`)).catch(e => console.error('[backup]', e.message));
}
async function read(id) {
  const b = db.get('SELECT * FROM backups WHERE id = ?', id); if (!b) return null;
  const buf = await storage.get(`backups/${b.file_name}`);
  return { b, buf, ok: !!buf && sha256(buf) === b.checksum };
}
async function verify(id) { const x = await read(id); return !!x && x.ok; }

/** Insert rows in batches (one round trip per batch on PostgreSQL). */
function insertMany(table, rows) {
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200); const cols = [...new Set(chunk.flatMap(Object.keys))];
    const vals = []; for (const r of chunk) for (const c of cols) vals.push(r[c] === undefined ? null : r[c]);
    db.run(`INSERT INTO ${table} (${cols.join(',')}) VALUES ${chunk.map(() => `(${cols.map(() => '?').join(',')})`).join(',')}`, ...vals);
  }
}
/** Replace all data with a backup's (a safety copy is taken first). */
async function restoreData(ctx, data, label) {
  await create(ctx, 'pre-restore');
  const order = dataTables();
  // Sign-in sessions point at user accounts: keep only the restoring administrator's,
  // removed while the accounts are replaced and put back if the account still exists.
  const mine = ctx?.user ? db.all('SELECT * FROM sessions WHERE user_id = ?', ctx.user.id) : [];
  db.tx(() => {
    db.run('DELETE FROM sessions'); db.run('DELETE FROM otp_challenges');
    for (const t of [...order].reverse()) db.run(`DELETE FROM ${t}`);
    for (const t of order) if (data.tables[t] && data.tables[t].length) insertMany(t, data.tables[t]);
    if (mine.length && db.get('SELECT id FROM users WHERE id = ?', ctx.user.id)) insertMany('sessions', mine);
  });
  db.pruneRemoved(); // a backup from an older version may hold features this version no longer has
  require('../lib/access').resetPermCache();
  audit.log(ctx, 'Backup restored', 'Backup', label, `Data restored from ${label}`);
}
async function restore(ctx, id) {
  const x = await read(id); if (!x || !x.ok) throw new Error('The backup file is missing or fails its integrity check.');
  await restoreData(ctx, unpack(x.buf), `${x.b.kind} backup of ${x.b.created_at}`);
}
async function exportEncrypted(id, passphrase) {
  const x = await read(id); if (!x || !x.buf) throw new Error('The backup file is missing.');
  return { name: `shaggar-pms-backup-${x.b.created_at.slice(0, 10)}.json`, payload: encrypt(x.buf, passphrase) };
}
async function importEncrypted(ctx, obj, passphrase) {
  if (!obj || obj.format !== 'shaggar-pms-backup') throw new Error('This file is not a Shaggar PMS backup.');
  let buf; try { buf = decrypt(obj, passphrase); } catch { throw new Error('The passphrase is wrong or the file is damaged.'); }
  let data; try { data = unpack(buf); } catch { throw new Error('The decrypted file is not a database backup.'); }
  await restoreData(ctx, data, 'imported encrypted file');
}
async function remove(id) {
  const b = db.get('SELECT * FROM backups WHERE id = ?', id); if (!b) return;
  db.run('DELETE FROM backups WHERE id = ?', id);
  await storage.remove([`backups/${b.file_name}`]).catch(e => console.error('[backup]', e.message));
}

module.exports = { create, verify, restore, exportEncrypted, importEncrypted, remove, dump, restoreData, unpack, fromSqliteFile, insertMany };
