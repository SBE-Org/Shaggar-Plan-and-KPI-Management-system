/* Copies an existing system (SQLite database + evidence folder) to Neon and Supabase.
   Only needed if you already have real data in a SQLite version. A new installation
   on Neon starts with the sample data by itself.

   1. Fill in DATABASE_URL and the SUPABASE_* values in backend/.env.
   2. Run, from the project folder:
        node --disable-warning=ExperimentalWarning scripts/move-to-neon.js --sqlite storage/shaggar-pms.db --uploads storage/uploads
      Add --force to replace data that is already in the Neon database.
   The SQLite file is only read; nothing in it is changed. */
const fs = require('node:fs');
const path = require('node:path');

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : a), []));
const config = require('../backend/config');
if (!config.databaseUrl) { console.error('Set DATABASE_URL (the Neon connection string) in backend/.env first.'); process.exit(1); }
const sqliteFile = path.resolve(args.sqlite || config.dbFile), uploads = path.resolve(args.uploads || config.uploadsDir);
if (!fs.existsSync(sqliteFile)) { console.error(`SQLite database not found: ${sqliteFile}`); process.exit(1); }

const db = require('../backend/db');
const backup = require('../backend/services/backup');
const storage = require('../backend/lib/storage');

(async () => {
  db.open();
  console.log(`Target database: PostgreSQL · files: ${storage.name()}`);
  const users = db.get('SELECT COUNT(*) AS n FROM users').n;
  if (users && !args.force) { console.error(`The Neon database already has ${users} user accounts. Run again with --force to replace all of its data.`); process.exit(1); }

  const data = backup.fromSqliteFile(sqliteFile);
  const rows = Object.values(data.tables).reduce((n, t) => n + t.length, 0);
  console.log(`Copying ${rows} rows from ${Object.keys(data.tables).length} tables…`);
  const order = db.tables().filter(t => !['backups', 'sessions', 'otp_challenges', 'schema_version'].includes(t));
  db.tx(() => {
    db.run('DELETE FROM sessions'); db.run('DELETE FROM otp_challenges'); db.run('DELETE FROM backups');
    for (const t of [...order].reverse()) db.run(`DELETE FROM ${t}`);
    for (const t of order) if (data.tables[t] && data.tables[t].length) backup.insertMany(t, data.tables[t]);
  });
  console.log('Data copied.');

  const files = [...(data.tables.submission_evidence || []), ...(data.tables.employee_evidence || [])].filter(f => f.storage_path);
  let sent = 0, missing = 0;
  for (const f of files) {
    const local = path.join(uploads, f.storage_path.replace(/^evidence\//, ''));
    if (!fs.existsSync(local)) { missing++; continue; }
    await storage.put(storage.evidenceKey(f.storage_path), fs.readFileSync(local), f.mime || 'application/octet-stream');
    sent++; if (sent % 20 === 0) console.log(`  ${sent} of ${files.length} files…`);
  }
  console.log(`Evidence files copied: ${sent}${missing ? ` (${missing} not found in ${uploads})` : ''}.`);
  db.close();
  console.log('Done. Start the server with the same settings and sign in to check.');
})().catch(e => { console.error('Stopped:', e.message); process.exit(1); });
