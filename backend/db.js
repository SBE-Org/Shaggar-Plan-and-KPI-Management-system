/* Database access layer. Two engines behind the same synchronous helpers:
   - SQLite through Node's built-in node:sqlite (default; zero set-up), and
   - PostgreSQL (Neon) when DATABASE_URL is set, through a built-in client
     (lib/pg.js) run on a worker thread (lib/pgsync.js).
   All SQL in the system goes through these helpers, written with ? placeholders;
   for PostgreSQL they are rewritten to $1, $2... here. */
const fs = require('node:fs');
const path = require('node:path');
const config = require('./config');

let eng = null; // { kind, all(sql, p), run(sql, p) -> changes, exec(sql), close() }
const SCHEMA = path.join(config.root, 'database', 'schema.sql');
const isPg = () => !!eng && eng.kind === 'postgres';

/* ---------- engines ---------- */
function sqliteEngine(file) {
  const { DatabaseSync } = require('node:sqlite');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const d = new DatabaseSync(file);
  d.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  return { kind: 'sqlite', raw: d, all: (sql, p) => d.prepare(sql).all(...p), run: (sql, p) => d.prepare(sql).run(...p).changes, exec: sql => d.exec(sql), close: () => d.close() };
}
function postgresEngine(url) {
  const { PgSync } = require('./lib/pgsync');
  const c = new PgSync(url, { timeoutMs: config.dbTimeoutMs });
  const sqlFor = toPg;
  return { kind: 'postgres', all: (sql, p) => c.query(sqlFor(sql), p).rows, run: (sql, p) => c.query(sqlFor(sql), p).rowCount, exec: sql => c.exec(sql), close: () => c.close() };
}

/* ? -> $n outside quotes and comments; INSERT OR IGNORE -> ON CONFLICT DO NOTHING. Cached. */
const pgCache = new Map();
function toPg(sql) {
  let out = pgCache.get(sql); if (out) return out;
  let n = 0, q = null; out = '';
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (q) { out += ch; if (ch === q) q = null; continue; }
    if (ch === "'" || ch === '"') { q = ch; out += ch; continue; }
    if (ch === '-' && sql[i + 1] === '-') { const e = sql.indexOf('\n', i); const end = e === -1 ? sql.length : e; out += sql.slice(i, end); i = end - 1; continue; }
    out += ch === '?' ? '$' + ++n : ch;
  }
  if (/^\s*INSERT\s+OR\s+IGNORE\s+INTO/i.test(out)) out = out.replace(/^\s*INSERT\s+OR\s+IGNORE\s+INTO/i, 'INSERT INTO') + ' ON CONFLICT DO NOTHING';
  if (pgCache.size < 2000) pgCache.set(sql, out);
  return out;
}
/* schema.sql is written for both engines; PostgreSQL needs DOUBLE PRECISION for REAL
   (its REAL is single precision) and BYTEA for BLOB. */
const pgSchema = sql => sql.replace(/\bREAL\b/g, 'DOUBLE PRECISION').replace(/\bBLOB\b/g, 'BYTEA');

function open(file = config.dbFile) {
  eng = config.databaseUrl ? postgresEngine(config.databaseUrl) : sqliteEngine(file);
  const schema = fs.readFileSync(SCHEMA, 'utf8');
  eng.exec(isPg() ? pgSchema(schema) : schema);
  migrate();
  return eng;
}

/* Brings an existing database up to the current schema. schema.sql only creates
   missing tables, so columns added to existing tables are added here. Safe to
   run on every start. */
const CURRENT_VERSION = 3;
function addColumn(table, column, definition) {
  if (isPg()) { eng.exec(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${pgSchema(definition)}`); return; }
  const cols = eng.all(`PRAGMA table_info(${table})`, []).map(c => c.name);
  if (!cols.includes(column)) eng.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
function migrate() {
  const row = get('SELECT MAX(version) AS v FROM schema_version');
  const have = row && row.v != null ? row.v : 0;
  // columns added in version 2 (no-ops on a database created from the current schema.sql)
  addColumn('notifications', 'link', 'TEXT'); // v1.5: what a notification is about, so a click opens it
  addColumn('kpis', 'targets_approved_at', 'TEXT');
  addColumn('kpis', 'targets_approved_by', 'TEXT');
  for (const [c, d] of [['approval', "TEXT NOT NULL DEFAULT 'approved'"], ['proposed_by', 'TEXT'], ['decided_by', 'TEXT'], ['decision_comment', 'TEXT']]) addColumn('kpis', c, d);
  for (const [c, d] of [['kpi_id', 'TEXT'], ['status', "TEXT NOT NULL DEFAULT 'approved'"], ['proposed_by', 'TEXT'], ['decision_comment', 'TEXT'], ['reported_actual', 'REAL'], ['report_note', 'TEXT'], ['report_status', "TEXT NOT NULL DEFAULT 'none'"], ['reported_at', 'TEXT'], ['verified_by', 'TEXT'], ['verified_at', 'TEXT'], ['verify_comment', 'TEXT']]) addColumn('employee_indicators', c, d);
  addColumn('backups', 'format', "TEXT NOT NULL DEFAULT 'sqlite'"); // v1.5: 'json' backups work on both engines
  if (have >= CURRENT_VERSION) return;
  const hasData = get('SELECT COUNT(*) AS n FROM users').n > 0;
  const grant = (role, perm) => run('INSERT OR IGNORE INTO role_permissions (role, permission) VALUES (?, ?)', role, perm);
  if (have === 1 && hasData) {
    // Upgrade of a version-1 database that is already in use.
    tx(() => {
      // Targets that were already in force count as approved, so reporting carries on unchanged.
      run('UPDATE kpis SET targets_approved_at = ? WHERE targets_approved_at IS NULL', now());
      // Existing employee figures were entered by the department head: treat them as verified.
      run("UPDATE employee_indicators SET report_status = 'verified' WHERE actual IS NOT NULL AND report_status = 'none'");
      // Targets are now proposed by departments and approved by the Mayor's Office.
      for (const role of ['dept_head', 'kpi_officer']) grant(role, 'target_propose');
      for (const role of ['mayor', 'mayor_admin']) grant(role, 'target_approve');
      run("DELETE FROM role_permissions WHERE role = 'super_admin' AND permission = 'target_manage'");
    });
  }
  if (have >= 1 && have < 3 && hasData) {
    // version 3: internal messaging for every role except citizens
    for (const role of ['super_admin', 'mayor', 'mayor_admin', 'dept_head', 'staff', 'kpi_officer', 'auditor']) grant(role, 'chat');
  }
  run('INSERT OR IGNORE INTO schema_version (version, applied_at) VALUES (?, ?)', CURRENT_VERSION, now());
}
function close() { if (eng) { eng.close(); eng = null; } }
const handle = () => eng && eng.raw;
const engine = () => (eng ? eng.kind : null);

// node:sqlite accepts only null, number, bigint, string and Buffer; booleans are stored as 0/1 in both engines.
const val = v => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);
const all = (sql, ...p) => eng.all(sql, p.map(val));
const get = (sql, ...p) => all(sql, ...p)[0] || null;
const run = (sql, ...p) => ({ changes: eng.run(sql, p.map(val)) });

function insert(table, row) {
  const keys = Object.keys(row);
  run(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, ...keys.map(k => row[k]));
  return row;
}
function update(table, where, changes) {
  const keys = Object.keys(changes); if (!keys.length) return;
  const wk = Object.keys(where);
  run(`UPDATE ${table} SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE ${wk.map(k => `${k} = ?`).join(' AND ')}`, ...keys.map(k => changes[k]), ...wk.map(k => where[k]));
}
let depth = 0;
function tx(fn) {
  if (depth) { depth++; try { return fn(); } finally { depth--; } } // already inside a transaction
  eng.exec('BEGIN'); depth = 1;
  try { const r = fn(); eng.exec('COMMIT'); return r; } catch (e) { try { eng.exec('ROLLBACK'); } catch {} throw e; } finally { depth = 0; }
}
/** Remove every table (seed --reset). PostgreSQL only; the SQLite file is simply deleted. */
function dropAll() { if (isPg()) eng.exec('DROP SCHEMA public CASCADE; CREATE SCHEMA public;'); }
/** Table names in schema order (parents before children); used by backups. */
function tables() { return [...fs.readFileSync(SCHEMA, 'utf8').matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map(m => m[1]); }

// settings are JSON documents keyed by name
function getSetting(key, fallback = null) { const r = get('SELECT value FROM settings WHERE key = ?', key); return r ? JSON.parse(r.value) : fallback; }
function setSetting(key, value, userId = null) {
  const exists = get('SELECT key FROM settings WHERE key = ?', key);
  if (exists) update('settings', { key }, { value: JSON.stringify(value), updated_at: now(), updated_by: userId });
  else insert('settings', { key, value: JSON.stringify(value), updated_at: now(), updated_by: userId });
}

function now() { return new Date().toISOString(); }
let seq = 0;
function id(prefix = '') { seq = (seq + 1) % 1e6; return prefix + Date.now().toString(36) + seq.toString(36) + Math.random().toString(36).slice(2, 6); }


module.exports = { open, close, dropAll, handle, engine, all, get, run, insert, update, tx, tables, getSetting, setSetting, now, id };
