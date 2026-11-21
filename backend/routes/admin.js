/* Administration: users & permissions, settings (incl. branding), departments,
   backups & archive, API keys & webhooks, quality records,
   audit trail queries and export logging. */
const db = require('../db');
const { route, fail, sendFile } = require('../lib/http');
const A = require('../lib/access');
const audit = require('../lib/audit');
const sec = require('../lib/security');
const { releaseHeld, sendEmail, emailProvider, isEmail } = require('../lib/notify');
const backup = require('../services/backup');
const automation = require('../services/automation');
const C = require('../../shared/constants');

const adminOnly = ctx => A.requirePerm(ctx.user, 'config');

/* ---------- users & permissions ---------- */
function userFields(b) {
  const f = { name: String(b.name || '').trim(), role: b.role, dept_id: b.deptId || null, title: String(b.title || ''), phone: String(b.phone || ''), email: String(b.email || '').trim(), active: b.active === false ? 0 : 1 };
  if (!f.name) fail(422, 'Enter the full name.');
  // every account needs a working address: sign-in codes and notifications are sent to it
  if (!isEmail(f.email)) fail(422, 'Enter a valid email address. Sign-in codes are sent to it.');
  if (!C.ROLES[f.role]) fail(422, 'Choose a valid role.');
  if (['dept_head', 'staff'].includes(f.role) && !f.dept_id) fail(422, 'Department Heads and Staff must belong to a department.');
  return f;
}
route('POST', '/api/users', ctx => {
  A.requirePerm(ctx.user, 'users'); const f = userFields(ctx.body); const username = String(ctx.body.username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) fail(422, 'Usernames use 3–40 letters, numbers, dots, dashes or underscores.');
  if (db.get('SELECT id FROM users WHERE username = ?', username)) fail(409, 'That username is taken.');
  const temp = sec.tempPassword(); const { hash, salt } = sec.hashPassword(temp); const id = db.id('U');
  db.insert('users', { id, username, ...f, pref_sms: 1, pref_email: 1, lang: 'en', password_hash: hash, password_salt: salt, failed_attempts: 0, locked_until: null, must_change: 1, last_login: null, created_at: db.now() });
  if (f.role === 'dept_head') db.update('departments', { id: f.dept_id }, { head_user_id: id });
  audit.log(ctx, 'User created', 'User', id, `${f.name} — ${C.ROLES[f.role]}`, null, f);
  return { id, username, tempPassword: temp };
});
route('PUT', '/api/users/:id', ctx => {
  A.requirePerm(ctx.user, 'users'); const u = db.get('SELECT * FROM users WHERE id = ?', ctx.params.id) || fail(404, 'User not found.'); const f = userFields(ctx.body);
  if (u.id === ctx.user.id && (!f.active || f.role !== 'super_admin') && u.role === 'super_admin') fail(422, 'You cannot disable or demote your own administrator account.');
  const before = { name: u.name, role: u.role, dept_id: u.dept_id, title: u.title, phone: u.phone, email: u.email, active: u.active };
  db.update('users', { id: u.id }, f);
  if (f.role === 'dept_head') db.update('departments', { id: f.dept_id }, { head_user_id: u.id });
  if (!f.active) db.run('DELETE FROM sessions WHERE user_id = ?', u.id);
  audit.log(ctx, before.role !== f.role ? 'User role changed' : 'User updated', 'User', u.id, u.name, before, f);
  return { ok: true };
});
route('POST', '/api/users/:id/reset-password', ctx => {
  A.requirePerm(ctx.user, 'users'); const u = db.get('SELECT * FROM users WHERE id = ?', ctx.params.id) || fail(404, 'User not found.');
  const temp = sec.tempPassword(); const { hash, salt } = sec.hashPassword(temp);
  db.update('users', { id: u.id }, { password_hash: hash, password_salt: salt, must_change: 1, failed_attempts: 0, locked_until: null });
  db.run('DELETE FROM sessions WHERE user_id = ?', u.id);
  audit.log(ctx, 'Password reset by administrator', 'User', u.id, u.username, null, { mustChange: true });
  return { tempPassword: temp };
});
route('POST', '/api/users/:id/unlock', ctx => {
  A.requirePerm(ctx.user, 'users', 'config'); const u = db.get('SELECT * FROM users WHERE id = ?', ctx.params.id) || fail(404, 'User not found.');
  db.update('users', { id: u.id }, { locked_until: null, failed_attempts: 0 });
  audit.log(ctx, 'Account unlocked', 'User', u.id, u.username, { locked: true }, { locked: false });
  return { ok: true };
});
route('PUT', '/api/permissions', ctx => {
  A.requirePerm(ctx.user, 'users'); const { role, permission, granted } = ctx.body;
  if (!C.ROLES[role] || !C.PERMS.find(p => p[0] === permission)) fail(422, 'Unknown role or permission.');
  if (role === 'super_admin' && ['users', 'config', 'audit'].includes(permission) && !granted) fail(422, 'This permission is locked to prevent administrators locking themselves out.');
  if (granted) { if (!db.get('SELECT 1 FROM role_permissions WHERE role = ? AND permission = ?', role, permission)) db.insert('role_permissions', { role, permission }); }
  else db.run('DELETE FROM role_permissions WHERE role = ? AND permission = ?', role, permission);
  A.resetPermCache();
  audit.log(ctx, 'Permission changed', 'Role', C.ROLES[role], `${granted ? 'Granted' : 'Revoked'}: ${C.PERMS.find(p => p[0] === permission)[1]}`, { [permission]: !granted }, { [permission]: !!granted });
  return { ok: true };
});

/* ---------- settings ---------- */
const SETTING_VALIDATORS = {
  scoring: v => { const b = v.bands; if (!(b.good > b.warning && b.warning > b.serious)) fail(422, 'Thresholds must go from highest to lowest.'); if (!(v.currentMonth >= 0 && v.currentMonth <= 11)) fail(422, 'Invalid reporting month.'); },
  security: v => { if (v.sessionMin < 5 || v.maxAttempts < 3 || v.pwMin < 8) fail(422, 'Policy values are below the allowed minimum.'); },
  workflow: () => {},
  retention: v => { if (v.auditYears < 1 || v.backupKeep < 2) fail(422, 'Retention values are below the allowed minimum.'); },
  notify: () => {},
  branding: v => {
    if (!String(v.orgName || '').trim() || !String(v.systemName || '').trim()) fail(422, 'The organisation and system names are required.');
    if (v.logo && !/^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(v.logo)) fail(422, 'Upload the logo as PNG, JPG, WEBP or SVG.');
    if (v.logo && v.logo.length > 700000) fail(413, 'The logo must be smaller than 500 KB.');
    if (v.logo && v.logo.startsWith('data:image/svg+xml')) { const svg = Buffer.from(v.logo.split(',')[1], 'base64').toString(); if (/<script|on\w+=|javascript:/i.test(svg)) fail(422, 'The SVG logo contains scripts and was rejected.'); }
  },
};
/* Sends a test message to the administrator's own address, so the email setup can be checked before codes depend on it. */
route('POST', '/api/email/test', async ctx => {
  adminOnly(ctx); const to = String(ctx.body.to || ctx.user.email || '').trim();
  if (!isEmail(to)) fail(422, 'Enter a valid email address to send the test to.');
  const short = db.getSetting('branding').shortName;
  try { const p = await sendEmail(to, `${short} test email`, `This is a test from ${short}. Email sending works, so sign-in codes can be delivered.`); audit.log(ctx, 'Test email sent', 'Configuration', 'email', `to ${to} through ${p}`); return { ok: true, provider: p, to }; }
  catch (e) { audit.log(ctx, 'Test email failed', 'Configuration', 'email', e.message); fail(502, `The test email was not sent: ${e.message}.`); }
});
route('PUT', '/api/settings/:key', async ctx => {
  adminOnly(ctx); const key = ctx.params.key; const validate = SETTING_VALIDATORS[key]; if (!validate) fail(404, 'Unknown setting.');
  const before = db.getSetting(key); const value = { ...before, ...ctx.body }; validate(value);
  if (key === 'branding') { value.logo = ctx.body.logo === undefined ? before.logo : ctx.body.logo; }
  db.setSetting(key, value, ctx.user.id);
  const flat = o => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, k === 'logo' ? (v ? `image (${Math.round(v.length / 1365)} KB)` : 'default') : typeof v === 'object' ? JSON.stringify(v).slice(0, 120) : v]));
  const label = { scoring: 'Settings changed', security: 'Security policy changed', workflow: 'Workflow rules changed', retention: 'Retention policy changed', notify: 'Notification settings changed', branding: 'Branding changed (name and logo)' }[key];
  audit.log(ctx, label, 'Configuration', key, `${key} updated`, flat(before), flat(value));
  if (key === 'notify') for (const ch of ['sms', 'email']) if (!before[ch].approved && value[ch].approved) { const n = await releaseHeld(ch); if (n) audit.log(ctx, 'Held messages released', 'Notification', ch, `${n} ${ch.toUpperCase()} message(s) released to the gateway`); }
  return { ok: true };
});
/* Departments. The head's name is typed in; saving creates the head's account
   (role Department Head, scoped to the department) with a temporary password. */
function deptCode(short) {
  // the first word of the short name, e.g. "Water Supply" -> WATER
  const base = (String(short || '').toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean)[0] || 'DEPT').slice(0, 10);
  let code = base.length < 2 ? base + 'X' : base, n = 2;
  while (db.get('SELECT id FROM departments WHERE id = ?', code)) code = base.slice(0, 9) + (n++);
  return code;
}
function suggestUsername(name) {
  const parts = String(name || '').toLowerCase().replace(/[^a-z\s]/g, ' ').trim().split(/\s+/).filter(w => w && !['dr', 'mr', 'mrs', 'ms', 'ato', 'prof', 'eng', 'w', 'ro', 'rt'].includes(w));
  const base = (parts.length > 1 ? `${parts[0]}.${parts[parts.length - 1][0]}` : (parts[0] || 'head')).slice(0, 30).padEnd(3, 'x');
  let u = base, n = 2; while (db.get('SELECT id FROM users WHERE username = ?', u)) u = base + (n++);
  return u;
}
function createHead(deptId, b) {
  const name = String(b.headName || '').trim();
  if (!isEmail(b.headEmail)) fail(422, "Enter the department head's email address. Sign-in codes are sent to it.");
  let username = String(b.headUsername || '').trim().toLowerCase() || suggestUsername(name);
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) fail(422, 'Usernames use 3–40 letters, numbers, dots, dashes or underscores.');
  if (db.get('SELECT id FROM users WHERE username = ?', username)) fail(409, 'That username is taken. Choose another one.');
  const temp = sec.tempPassword(); const { hash, salt } = sec.hashPassword(temp); const id = db.id('U');
  db.insert('users', { id, username, name, role: 'dept_head', dept_id: deptId, title: String(b.headTitle || 'Department Head'), phone: String(b.headPhone || ''), email: String(b.headEmail || '').trim(), active: 1, pref_sms: 1, pref_email: 1, lang: 'en', password_hash: hash, password_salt: salt, failed_attempts: 0, locked_until: null, must_change: 1, last_login: null, created_at: db.now() });
  db.update('departments', { id: deptId }, { head_user_id: id });
  return { headId: id, username, tempPassword: temp };
}
route('GET', '/api/departments/suggest', ctx => { adminOnly(ctx); return { code: ctx.query.short ? deptCode(ctx.query.short) : '', username: ctx.query.name ? suggestUsername(ctx.query.name) : '' }; });
route('POST', '/api/departments', ctx => {
  adminOnly(ctx); const b = ctx.body; const name = String(b.name || '').trim(), short = String(b.short || '').trim();
  if (!name || !short) fail(422, 'Enter the short name and the full name of the department.');
  const id = String(b.id || '').trim().toUpperCase() || deptCode(short);
  if (!/^[A-Z0-9_]{2,12}$/.test(id)) fail(422, 'Use a 2–12 character code (letters, numbers, underscore).');
  if (db.get('SELECT id FROM departments WHERE id = ?', id)) fail(409, 'That code is already used.');
  const headName = String(b.headName || '').trim(); let head = null;
  db.tx(() => {
    db.insert('departments', { id, name, short_name: short, head_user_id: null, active: 1, created_at: db.now() });
    if (headName) head = createHead(id, b);
  });
  audit.log(ctx, 'Department created', 'Department', id, name, null, { name, short, head: headName || null });
  if (head) audit.log(ctx, 'User created', 'User', head.headId, `${headName} — ${C.ROLES.dept_head} (${short})`, null, { username: head.username, role: 'dept_head', dept_id: id });
  return { ok: true, id, ...(head || {}), headName: headName || null };
});
route('PUT', '/api/departments/:id', ctx => {
  adminOnly(ctx); const d = db.get('SELECT * FROM departments WHERE id = ?', ctx.params.id) || fail(404, 'Department not found.'); const b = ctx.body;
  const name = String(b.name || '').trim(), short = String(b.short || '').trim(); if (!name || !short) fail(422, 'Enter the short name and the full name of the department.');
  const headName = String(b.headName || '').trim(); let head = null;
  const cur = d.head_user_id ? db.get('SELECT * FROM users WHERE id = ?', d.head_user_id) : null;
  db.tx(() => {
    db.update('departments', { id: d.id }, { name, short_name: short });
    if (headName && (!cur || b.replaceHead)) {
      // a new person takes over: the previous head's account is switched off, the new account is created
      if (cur) { if (cur.id === ctx.user.id) fail(422, 'You cannot replace your own account.'); db.update('users', { id: cur.id }, { active: 0 }); db.run('DELETE FROM sessions WHERE user_id = ?', cur.id); }
      head = createHead(d.id, b);
    } else if (headName && cur && headName !== cur.name) db.update('users', { id: cur.id }, { name: headName }); // same person, corrected name
  });
  audit.log(ctx, 'Department updated', 'Department', d.id, name, { name: d.name, short: d.short_name, head: cur ? cur.name : null }, { name, short, head: headName || (cur ? cur.name : null) });
  if (head) audit.log(ctx, 'User created', 'User', head.headId, `${headName} — ${C.ROLES.dept_head} (${short})`, null, { username: head.username, role: 'dept_head', dept_id: d.id, replaced: cur ? cur.username : null });
  return { ok: true, id: d.id, ...(head || {}), headName: headName || null };
});

/* ---------- backups & archive ---------- */
route('POST', '/api/backups', async ctx => { adminOnly(ctx); try { return await backup.create(ctx, 'manual'); } catch (e) { fail(502, e.message); } });
route('POST', '/api/backups/:id/verify', async ctx => { adminOnly(ctx); const ok = await backup.verify(ctx.params.id).catch(() => false); audit.log(ctx, 'Backup integrity checked', 'Backup', ctx.params.id, ok ? 'Checksum matches' : 'CHECKSUM MISMATCH'); return { ok }; });
route('POST', '/api/backups/:id/restore', async ctx => { adminOnly(ctx); try { await backup.restore(ctx, ctx.params.id); } catch (e) { fail(422, e.message); } return { ok: true }; });
route('DELETE', '/api/backups/:id', async ctx => { adminOnly(ctx); await backup.remove(ctx.params.id); audit.log(ctx, 'Backup deleted', 'Backup', ctx.params.id); return { ok: true }; });
route('POST', '/api/backups/:id/download', async ctx => {
  adminOnly(ctx); const pass = String(ctx.body.passphrase || ''); if (pass.length < 12) fail(422, 'Use a passphrase of at least 12 characters.');
  let out; try { out = await backup.exportEncrypted(ctx.params.id, pass); } catch (e) { fail(404, e.message); }
  const { name, payload } = out;
  audit.log(ctx, 'Encrypted backup downloaded', 'Backup', ctx.params.id, 'AES-256-GCM');
  sendFile(ctx.res, 200, JSON.stringify(payload), 'application/json', { 'Content-Disposition': `attachment; filename="${name}"` });
});
route('POST', '/api/backups/import', async ctx => { adminOnly(ctx); try { await backup.importEncrypted(ctx, ctx.body.file, String(ctx.body.passphrase || '')); } catch (e) { audit.log(ctx, 'Backup import failed', 'Backup', 'file', e.message); fail(422, e.message); } return { ok: true }; });
route('POST', '/api/archive/run', ctx => { adminOnly(ctx); return automation.runArchival(ctx); });
route('POST', '/api/archive/restore', ctx => {
  adminOnly(ctx); const { kind, id } = ctx.body;
  if (kind === 'caps') { const c = db.get('SELECT ref FROM action_plans WHERE id = ?', id) || fail(404, 'Not found.'); db.update('action_plans', { id }, { archived_at: null, completed_at: db.now() }); audit.log(ctx, 'Record restored from archive', 'Archive', c.ref, 'action plan'); }
  else fail(422, 'Unknown record type.');
  return { ok: true };
});

/* ---------- API keys & webhooks ---------- */
route('POST', '/api/api-keys', ctx => {
  adminOnly(ctx); const scopes = (ctx.body.scopes || []).filter(s => C.SCOPES.find(x => x[0] === s));
  if (!String(ctx.body.name || '').trim() || !scopes.length) fail(422, 'Give the key a name and at least one scope.');
  const raw = 'shg_live_' + sec.token(18).replace(/[^A-Za-z0-9]/g, '').slice(0, 24);
  const k = { id: db.id('K'), name: ctx.body.name.trim(), prefix: raw.slice(0, 13), key_hash: sec.sha256(raw), scopes: scopes.join(','), created_by: ctx.user.id, created_at: db.now(), last_used: null, revoked: 0 };
  db.insert('api_keys', k); audit.log(ctx, 'API key created', 'API', k.prefix, `${k.name} · scopes: ${k.scopes}`, null, { scopes: k.scopes });
  return { key: raw };
});
route('POST', '/api/api-keys/:id/revoke', ctx => { adminOnly(ctx); const k = db.get('SELECT * FROM api_keys WHERE id = ?', ctx.params.id) || fail(404, 'Key not found.'); db.update('api_keys', { id: k.id }, { revoked: 1 }); audit.log(ctx, 'API key revoked', 'API', k.prefix, k.name, { revoked: false }, { revoked: true }); return { ok: true }; });
route('POST', '/api/webhooks', ctx => {
  adminOnly(ctx); const url = String(ctx.body.url || ''); if (!/^https:\/\//.test(url)) fail(422, 'Webhook URLs must start with https://');
  const events = (ctx.body.events || []).filter(e => C.EVENTS.find(x => x[0] === e)); const secret = sec.token(24);
  db.insert('webhooks', { id: db.id('W'), url, events: events.join(',') || 'submission_approved', secret, active: 0, created_at: db.now() });
  audit.log(ctx, 'Webhook added', 'API', url, events.join(', ')); return { secret };
});
route('POST', '/api/webhooks/:id/toggle', ctx => { adminOnly(ctx); const h = db.get('SELECT * FROM webhooks WHERE id = ?', ctx.params.id) || fail(404, 'Webhook not found.'); db.update('webhooks', { id: h.id }, { active: h.active ? 0 : 1 }); audit.log(ctx, h.active ? 'Webhook disabled' : 'Webhook enabled', 'API', h.url, '', { active: !!h.active }, { active: !h.active }); return { ok: true }; });

/* ---------- quality ---------- */
route('POST', '/api/qa/runs', ctx => {
  adminOnly(ctx); const { results, passed } = ctx.body;
  db.insert('qa_runs', { id: db.id('QR'), at: db.now(), run_by: ctx.user.id, passed: passed ? 1 : 0, results: JSON.stringify(results || {}) });
  audit.log(ctx, 'Quality checks run', 'Quality', 'automated', `${(results?.views || []).length} screens · ${passed ? 'all checks passed' : 'issues found'}`); return { ok: true };
});
route('PUT', '/api/qa/sessions/:id', ctx => { adminOnly(ctx); const s = db.get('SELECT * FROM qa_sessions WHERE id = ?', ctx.params.id) || fail(404, 'Not found.'); const ch = {}; if (ctx.body.status) ch.status = ctx.body.status; if ('findings' in ctx.body) ch.findings = String(ctx.body.findings); db.update('qa_sessions', { id: s.id }, ch); audit.log(ctx, 'Usability session updated', 'Quality', s.role, s.task, { status: s.status, findings: s.findings }, { status: ch.status || s.status, findings: ch.findings ?? s.findings }); return { ok: true }; });

/* ---------- audit trail ---------- */
function auditQuery(q) {
  const where = [], p = [];
  if (q.q) { where.push('(lower(action) LIKE ? OR lower(details) LIKE ? OR lower(entity_id) LIKE ?)'); const s = `%${String(q.q).toLowerCase()}%`; p.push(s, s, s); }
  if (q.cat) { where.push('category = ?'); p.push(q.cat); }
  if (q.user) { if (q.user === 'system') where.push('user_id IS NULL'); else { where.push('user_id = ?'); p.push(q.user); } }
  if (q.entity) { where.push('entity = ?'); p.push(q.entity); }
  if (q.from) { where.push('substr(at,1,10) >= ?'); p.push(q.from); }
  if (q.to) { where.push('substr(at,1,10) <= ?'); p.push(q.to); }
  return { sql: where.length ? 'WHERE ' + where.join(' AND ') : '', p };
}
route('GET', '/api/audit', ctx => {
  A.requirePerm(ctx.user, 'audit'); const q = ctx.query; const { sql, p } = auditQuery(q);
  const size = Math.min(200, Math.max(5, Number(q.size) || 25)), page = Math.max(0, Number(q.page) || 0);
  const total = db.get(`SELECT COUNT(*) n FROM audit_log ${sql}`, ...p).n;
  const rows = db.all(`SELECT * FROM audit_log ${sql} ORDER BY at DESC LIMIT ? OFFSET ?`, ...p, size, page * size).map(a => ({ ...a, before: a.before_json ? JSON.parse(a.before_json) : null, after: a.after_json ? JSON.parse(a.after_json) : null }));
  const counts = Object.fromEntries(db.all(`SELECT category, COUNT(*) n FROM audit_log ${sql} GROUP BY category`, ...p).map(r => [r.category, r.n]));
  return { rows, total, page, size, counts, entities: db.all('SELECT DISTINCT entity FROM audit_log ORDER BY entity').map(r => r.entity) };
});
route('GET', '/api/audit/export', ctx => {
  A.requirePerm(ctx.user, 'audit'); A.requirePerm(ctx.user, 'export'); const { sql, p } = auditQuery(ctx.query);
  const rows = db.all(`SELECT a.*, u.name AS user_name FROM audit_log a LEFT JOIN users u ON u.id = a.user_id ${sql.replace(/\b(action|details|entity_id|category|user_id|entity|at)\b/g, 'a.$1')} ORDER BY a.at DESC`, ...p);
  const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = ['Timestamp,User,Role,Category,Action,Record,Details,Before,After', ...rows.map(a => [a.at, a.user_name || 'System', a.role, a.category, a.action, `${a.entity} ${a.entity_id || ''}`, a.details, a.before_json, a.after_json].map(cell).join(','))].join('\r\n');
  audit.log(ctx, 'Records exported', 'Export', 'audit-trail', `${rows.length} audit entries exported to CSV`);
  sendFile(ctx.res, 200, '﻿' + csv, 'text/csv; charset=utf-8', { 'Content-Disposition': `attachment; filename="audit-trail-${db.now().slice(0, 10)}.csv"` });
});
/** Browser-side table exports are recorded here before the file is generated. */
route('POST', '/api/exports', ctx => { A.requirePerm(ctx.user, 'export'); audit.log(ctx, 'Records exported', 'Export', String(ctx.body.name || 'table'), `${Number(ctx.body.rows) || 0} rows exported to CSV`); return { ok: true }; });
