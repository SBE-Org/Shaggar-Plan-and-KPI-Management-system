/* Database access layer (SQLite through Node's built-in node:sqlite).
   All SQL goes through these helpers so the storage engine can be swapped
   (e.g. for PostgreSQL) in one place. */
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');

let db = null;
const SCHEMA = path.join(config.root, 'database', 'schema.sql');

function open(file = config.dbFile) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(fs.readFileSync(SCHEMA, 'utf8'));
  migrate();
  return db;
}

/* Brings an existing database up to the current schema. schema.sql only creates
   missing tables, so columns added to existing tables are added here. Safe to
   run on every start. */
const CURRENT_VERSION = 3;
function addColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
function migrate() {
  const row = db.prepare('SELECT MAX(version) AS v FROM schema_version').get();
  const have = row && row.v != null ? row.v : 0;
  // columns added in version 2 (no-ops on a database created from the current schema.sql)
  addColumn('notifications', 'link', 'TEXT'); // v1.5: what a notification is about, so a click opens it
  addColumn('kpis', 'targets_approved_at', 'TEXT');
  addColumn('kpis', 'targets_approved_by', 'TEXT');
  for (const [c, d] of [['approval', "TEXT NOT NULL DEFAULT 'approved'"], ['proposed_by', 'TEXT'], ['decided_by', 'TEXT'], ['decision_comment', 'TEXT']]) addColumn('kpis', c, d);
  for (const [c, d] of [['kpi_id', 'TEXT'], ['status', "TEXT NOT NULL DEFAULT 'approved'"], ['proposed_by', 'TEXT'], ['decision_comment', 'TEXT'], ['reported_actual', 'REAL'], ['report_note', 'TEXT'], ['report_status', "TEXT NOT NULL DEFAULT 'none'"], ['reported_at', 'TEXT'], ['verified_by', 'TEXT'], ['verified_at', 'TEXT'], ['verify_comment', 'TEXT']]) addColumn('employee_indicators', c, d);
  if (have >= CURRENT_VERSION) return;
  const hasData = db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0;
  if (have === 1 && hasData) {
    // Upgrade of a version-1 database that is already in use.
    db.exec('BEGIN');
    try {
      // Targets that were already in force count as approved, so reporting carries on unchanged.
      db.prepare('UPDATE kpis SET targets_approved_at = ? WHERE targets_approved_at IS NULL').run(now());
      // Existing employee figures were entered by the department head: treat them as verified.
      db.exec("UPDATE employee_indicators SET report_status = 'verified' WHERE actual IS NOT NULL AND report_status = 'none'");
      // Targets are now proposed by departments and approved by the Mayor's Office.
      const grant = db.prepare('INSERT OR IGNORE INTO role_permissions (role, permission) VALUES (?, ?)');
      for (const role of ['dept_head', 'kpi_officer']) grant.run(role, 'target_propose');
      for (const role of ['mayor', 'mayor_admin']) grant.run(role, 'target_approve');
      db.exec("DELETE FROM role_permissions WHERE role = 'super_admin' AND permission = 'target_manage'");
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  if (have >= 1 && have < 3 && hasData) {
    // version 3: internal messaging for every role except citizens
    const grant = db.prepare('INSERT OR IGNORE INTO role_permissions (role, permission) VALUES (?, ?)');
    for (const role of ['super_admin', 'mayor', 'mayor_admin', 'dept_head', 'staff', 'kpi_officer', 'auditor']) grant.run(role, 'chat');
  }
  db.prepare('INSERT OR IGNORE INTO schema_version (version, applied_at) VALUES (?, ?)').run(CURRENT_VERSION, now());
}
function close() { if (db) { db.close(); db = null; } }
const handle = () => db;

// node:sqlite accepts only null, number, bigint, string and Buffer.
const val = v => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);
const all = (sql, ...p) => db.prepare(sql).all(...p.map(val));
const get = (sql, ...p) => db.prepare(sql).get(...p.map(val)) || null;
const run = (sql, ...p) => db.prepare(sql).run(...p.map(val));

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
function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

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

// Consistent online copy of the whole database (used for backups).
function backupTo(file) { fs.mkdirSync(path.dirname(file), { recursive: true }); if (fs.existsSync(file)) fs.unlinkSync(file); db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`); }

module.exports = { open, close, handle, all, get, run, insert, update, tx, getSetting, setSetting, now, id, backupTo };
