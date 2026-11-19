/* Backups: consistent copies of the whole database (VACUUM INTO) with a
   SHA-256 checksum, restore with an automatic safety copy, and encrypted
   export/import using AES-256-GCM. */
const fs = require('node:fs');
const path = require('node:path');
const db = require('../db');
const config = require('../config');
const audit = require('../lib/audit');
const { sha256, encrypt, decrypt } = require('../lib/security');

function create(ctx, kind = 'manual') {
  const id = db.id('B'); const file = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}-${kind}.db`;
  const full = path.join(config.backupsDir, file);
  db.backupTo(full);
  const buf = fs.readFileSync(full);
  const row = { id, created_at: db.now(), created_by: ctx?.user?.id || null, kind, size: buf.length, checksum: sha256(buf), file_name: file };
  db.insert('backups', row);
  audit.log(ctx, kind === 'manual' ? 'Backup created' : `Automatic backup created (${kind})`, 'Backup', id, `${(buf.length / 1024).toFixed(0)} KB · SHA-256 ${row.checksum.slice(0, 12)}…`);
  prune();
  return row;
}
function prune() {
  const keep = db.getSetting('retention').backupKeep;
  const rows = db.all('SELECT * FROM backups ORDER BY created_at DESC');
  for (const b of rows.slice(keep)) { const f = path.join(config.backupsDir, b.file_name); if (fs.existsSync(f)) fs.unlinkSync(f); db.run('DELETE FROM backups WHERE id = ?', b.id); }
}
function fileOf(id) { const b = db.get('SELECT * FROM backups WHERE id = ?', id); if (!b) return null; return { b, file: path.join(config.backupsDir, b.file_name) }; }
function verify(id) { const x = fileOf(id); if (!x || !fs.existsSync(x.file)) return false; return sha256(fs.readFileSync(x.file)) === x.b.checksum; }

/** Replace the live database with a backup file (a safety copy is taken first). */
function restoreFromBuffer(ctx, buf, label) {
  create(ctx, 'pre-restore');
  const keepBackups = db.all('SELECT * FROM backups'); // backup index survives the restore
  db.close();
  for (const f of [config.dbFile + '-wal', config.dbFile + '-shm']) if (fs.existsSync(f)) fs.unlinkSync(f);
  fs.writeFileSync(config.dbFile, buf);
  db.open();
  db.run('DELETE FROM backups'); for (const b of keepBackups) db.insert('backups', b);
  db.run('DELETE FROM sessions WHERE user_id <> ?', ctx.user.id);
  require('../lib/access').resetPermCache();
  audit.log(ctx, 'Backup restored', 'Backup', label, `Database restored from ${label}`);
}
function restore(ctx, id) { const x = fileOf(id); if (!x || !verify(id)) throw new Error('The backup file is missing or fails its integrity check.'); restoreFromBuffer(ctx, fs.readFileSync(x.file), `${x.b.kind} backup of ${x.b.created_at}`); }
function exportEncrypted(id, passphrase) { const x = fileOf(id); return { name: `shaggar-pms-backup-${x.b.created_at.slice(0, 10)}.json`, payload: encrypt(fs.readFileSync(x.file), passphrase) }; }
function importEncrypted(ctx, obj, passphrase) {
  if (!obj || obj.format !== 'shaggar-pms-backup') throw new Error('This file is not a Shaggar PMS backup.');
  let buf; try { buf = decrypt(obj, passphrase); } catch { throw new Error('The passphrase is wrong or the file is damaged.'); }
  if (buf.subarray(0, 15).toString() !== 'SQLite format 3') throw new Error('The decrypted file is not a database backup.');
  restoreFromBuffer(ctx, buf, 'imported encrypted file');
}
function remove(id) { const x = fileOf(id); if (!x) return; if (fs.existsSync(x.file)) fs.unlinkSync(x.file); db.run('DELETE FROM backups WHERE id = ?', id); }

module.exports = { create, verify, restore, exportEncrypted, importEncrypted, remove };
