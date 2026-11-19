/* Service desk (complaints, service requests, appointments) and notifications. */
const db = require('../db');
const { route, fail } = require('../lib/http');
const A = require('../lib/access');
const audit = require('../lib/audit');
const { notify, usersWith } = require('../lib/notify');
const { REQUEST_STATUSES } = require('../../shared/constants');

const reqRow = id => db.get('SELECT * FROM requests WHERE id = ?', id) || fail(404, 'Request not found.');
const hist = (rid, userId, text) => db.insert('request_history', { id: db.id('Q'), request_id: rid, user_id: userId, text, at: db.now() });
const deptName = id => (id ? db.get('SELECT short_name n FROM departments WHERE id = ?', id)?.n : "Mayor's Office");
const uname = id => db.get('SELECT name FROM users WHERE id = ?', id)?.name || '—';
const fmt = iso => new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Shared by the web UI and the public API. */
function createRequest(ctx, b, { viaApi = false } = {}) {
  const c = db.get('SELECT * FROM request_categories WHERE id = ? AND active = 1', b.category) || fail(422, 'Choose a valid category.');
  if (!String(b.subject || '').trim() || !String(b.phone || '').trim()) fail(422, 'Subject and phone are required.');
  const citizen = ctx.user && ctx.user.role === 'citizen';
  const p = db.get('SELECT * FROM request_priorities WHERE id = ?', (!citizen && b.priority) || c.priority_id);
  const n = db.get('SELECT COUNT(*) n FROM requests').n + 1; const t = new Date();
  const r = { id: db.id('R'), ref: `SR-${db.getSetting('scoring').fyStart}-${String(n).padStart(4, '0')}`, type: c.type, category_id: c.id, priority_id: p.id, citizen_name: citizen ? ctx.user.name : String(b.citizenName || 'Citizen').slice(0, 120), phone: String(b.phone).slice(0, 30), subject: String(b.subject).slice(0, 200), details: String(b.details || '').slice(0, 4000), dept_id: c.dept_id, status: c.dept_id ? 'Assigned' : 'New', assigned_to: null, created_by: ctx.user ? ctx.user.id : null, created_at: t.toISOString(), due_at: new Date(t.getTime() + p.hours * 3600e3).toISOString(), resolved_at: null, escalation_level: 0, preferred_date: c.type === 'Appointment' ? b.preferredDate || null : null, archived_at: null };
  db.insert('requests', r);
  hist(r.id, r.created_by, (viaApi ? `Registered via API key "${ctx.apiKey.name}"` : citizen ? 'Submitted online by citizen' : "Registered at the Mayor's Office") + (c.dept_id ? ` — routed to ${deptName(c.dept_id)} by category` : ''));
  audit.log(ctx, 'Request registered', 'Request', r.ref, `${r.type}: ${r.subject} (${p.name} priority, due ${fmt(r.due_at)})`, null, { status: r.status, priority: p.id });
  notify(usersWith('desk_intake'), `New ${r.type.toLowerCase()} ${r.ref}: ${r.subject}`, 'request_new', ctx.user?.id, `req:${r.id}`);
  if (c.dept_id) notify([db.get('SELECT head_user_id h FROM departments WHERE id = ?', c.dept_id).h], `${r.ref} routed to your department: ${r.subject}`, 'request_assigned', ctx.user?.id, `req:${r.id}`);
  return r;
}

route('POST', '/api/requests', ctx => {
  if (!ctx.user || !(A.can(ctx.user, 'desk_intake') || A.can(ctx.user, 'citizen'))) fail(403, 'Your role cannot register requests.');
  const r = createRequest(ctx, ctx.body); return { id: r.id, ref: r.ref };
});

route('PUT', '/api/requests/:id', ctx => {
  const u = ctx.user, r = reqRow(ctx.params.id), b = ctx.body;
  if (!u) fail(401, 'Sign in to continue.');
  const intake = A.can(u, 'desk_intake'), head = u.role === 'dept_head' && r.dept_id === u.dept_id;
  if (!(intake || head || r.assigned_to === u.id) || u.role === 'citizen') fail(403, 'You cannot change this request.');
  if (r.status === 'Closed') fail(409, 'Closed requests cannot be changed.');
  const before = { status: r.status, dept_id: r.dept_id, assigned_to: r.assigned_to, priority_id: r.priority_id };
  const ch = {};
  if (intake && 'deptId' in b) ch.dept_id = b.deptId || null;
  if ((intake || head) && 'assignedTo' in b) {
    const a = b.assignedTo || null;
    if (a) { const au = db.get('SELECT * FROM users WHERE id = ? AND active = 1', a); if (!au) fail(422, 'Choose an active user.'); if ((ch.dept_id ?? r.dept_id) && au.dept_id !== (ch.dept_id ?? r.dept_id)) fail(422, 'Assign someone from the responsible office.'); }
    ch.assigned_to = a;
  }
  if (intake && b.priority && b.priority !== r.priority_id) { const p = db.get('SELECT * FROM request_priorities WHERE id = ?', b.priority) || fail(422, 'Invalid priority.'); ch.priority_id = p.id; ch.due_at = new Date(Date.parse(r.created_at) + p.hours * 3600e3).toISOString(); ch.escalation_level = 0; }
  if (b.status) { if (!REQUEST_STATUSES.includes(b.status)) fail(422, 'Invalid status.'); ch.status = b.status; }
  if ((ch.status || r.status) === 'New' && ((ch.dept_id ?? r.dept_id) || (ch.assigned_to ?? r.assigned_to))) ch.status = 'Assigned';
  if (['Resolved', 'Closed'].includes(ch.status) && !r.resolved_at) ch.resolved_at = db.now();
  const after = { ...before, ...Object.fromEntries(Object.entries(ch).filter(([k]) => k in before)) };
  const changed = Object.keys(audit.diff(before, after)); const note = String(b.note || '').trim();
  if (!changed.length && !note) return { ok: true };
  db.tx(() => {
    db.update('requests', { id: r.id }, ch);
    const label = k => (k === 'assigned_to' ? `Assigned to ${uname(after.assigned_to)}` : k === 'dept_id' ? `Routed to ${deptName(after.dept_id)}` : k === 'priority_id' ? `Priority → ${after.priority_id} (new deadline ${fmt(ch.due_at)})` : `Status → ${after.status}`);
    hist(r.id, u.id, [changed.map(label).join('; '), note].filter(Boolean).join(' — '));
  });
  if (changed.includes('assigned_to') && after.assigned_to) { notify([after.assigned_to], `${r.ref} assigned to you: ${r.subject}`, 'request_assigned', u.id, `req:${r.id}`); audit.log(ctx, 'Request assigned', 'Request', r.ref, `Assigned to ${uname(after.assigned_to)}`, { assigned_to: before.assigned_to }, { assigned_to: after.assigned_to }); }
  if (changed.includes('dept_id')) { if (after.dept_id) notify([db.get('SELECT head_user_id h FROM departments WHERE id = ?', after.dept_id).h], `${r.ref} routed to your department: ${r.subject}`, 'request_assigned', u.id, `req:${r.id}`); audit.log(ctx, 'Request routed', 'Request', r.ref, `Routed to ${deptName(after.dept_id)}`, { dept_id: before.dept_id }, { dept_id: after.dept_id }); }
  if (changed.includes('status')) { notify([r.created_by], `${r.ref} status: ${after.status}`, 'request_status', u.id, `req:${r.id}`); audit.log(ctx, 'Request status changed', 'Request', r.ref, note || `${before.status} → ${after.status}`, { status: before.status }, { status: after.status }); }
  if (changed.includes('priority_id')) audit.log(ctx, 'Request priority changed', 'Request', r.ref, `${before.priority_id} → ${after.priority_id}`, { priority: before.priority_id }, { priority: after.priority_id });
  if (!changed.length && note) audit.log(ctx, 'Request note added', 'Request', r.ref, note);
  return { ok: true };
});

route('POST', '/api/notifications/:id/read', ctx => { if (!ctx.user) fail(401, 'Sign in to continue.'); db.run('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', ctx.params.id, ctx.user.id); return { ok: true }; });
route('POST', '/api/notifications/read-all', ctx => { if (!ctx.user) fail(401, 'Sign in to continue.'); db.run('UPDATE notifications SET is_read = 1 WHERE user_id = ?', ctx.user.id); return { ok: true }; });

module.exports = { createRequest };
