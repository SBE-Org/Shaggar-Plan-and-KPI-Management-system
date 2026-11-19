/* Builds the data the browser needs for one user ("bootstrap"), already
   filtered to that user's role and department scope, plus a performance
   engine bound to the same data for server-side calculations. */
const db = require('../db');
const access = require('../lib/access');
const env = require('../config');
const createEngine = require('../../shared/performance');

function config() {
  const scoring = db.getSetting('scoring'), branding = db.getSetting('branding');
  return {
    ...scoring, org: branding.orgName, office: branding.office, branding,
    security: db.getSetting('security'), workflow: db.getSetting('workflow'), escalation: db.getSetting('escalation'),
    notify: db.getSetting('notify'), retention: db.getSetting('retention'),
    emailProvider: env.brevoApiKey ? 'Brevo' : env.resendApiKey ? 'Resend' : env.emailApiUrl ? 'custom gateway' : null, emailFrom: env.emailFrom || null, demoMode: env.demoMode,
    desk: {
      priorities: db.all('SELECT id, name, hours FROM request_priorities ORDER BY position'),
      categories: db.all('SELECT id, name, type, dept_id AS deptId, priority_id AS priority FROM request_categories WHERE active = 1 ORDER BY id'),
    },
  };
}
const maskPhone = p => { if (!p) return null; const d = p.replace(/\s/g, ''); return d.slice(0, 4) + ' ••• ••• ' + d.slice(-3); };

function kpisWithTargets(where = '', ...p) {
  const kpis = db.all(`SELECT * FROM kpis ${where} ORDER BY code`, ...p);
  const targets = db.all('SELECT kpi_id, month, target FROM kpi_targets');
  const tmap = {}; for (const t of targets) (tmap[t.kpi_id] ||= Array(12).fill(null))[t.month] = t.target;
  return kpis.map(k => ({ id: k.id, code: k.code, deptId: k.dept_id, objectiveId: k.objective_id, name: k.name, definition: k.definition, formula: k.formula, source: k.source, unit: k.unit, dir: k.direction, freq: k.frequency, agg: k.aggregation, weight: k.weight, annual: k.annual_target, baseline: k.baseline, evidenceRequired: !!k.evidence_required, ownerId: k.owner_id, active: !!k.active, targets: tmap[k.id] || Array(12).fill(null), targetsApprovedAt: k.targets_approved_at || null, targetsApprovedBy: k.targets_approved_by || null, approval: k.approval || 'approved', proposedBy: k.proposed_by || null, decidedBy: k.decided_by || null, decisionComment: k.decision_comment || '', createdAt: k.created_at }));
}
function targetProposals(kpiIds) {
  const set = new Set(kpiIds);
  return db.all("SELECT * FROM target_proposals WHERE status <> 'withdrawn' ORDER BY proposed_at DESC").filter(p => set.has(p.kpi_id)).map(p => ({ id: p.id, kpiId: p.kpi_id, annual: p.annual, targets: JSON.parse(p.targets), reason: p.reason || '', isRevision: !!p.is_revision, status: p.status, proposedBy: p.proposed_by, proposedAt: p.proposed_at, decidedBy: p.decided_by, decidedAt: p.decided_at, comment: p.decision_comment || '' }));
}
function prevYear() { const out = {}; for (const r of db.all('SELECT * FROM kpi_prev_year ORDER BY quarter')) (out[r.kpi_id] ||= [])[r.quarter] = { t: r.target, a: r.actual }; return out; }
function submissions(kpiIds) {
  const set = new Set(kpiIds);
  const ev = {}; for (const e of db.all('SELECT id, submission_id, file_name, size, mime, storage_path FROM submission_evidence ORDER BY uploaded_at')) (ev[e.submission_id] ||= []).push({ id: e.id, name: e.file_name, size: e.size, type: e.mime, hasFile: !!e.storage_path });
  const hist = {}; for (const h of db.all('SELECT * FROM submission_history ORDER BY at')) (hist[h.submission_id] ||= []).push({ by: h.user_id, action: h.action, at: h.at, comment: h.comment || '' });
  return db.all('SELECT * FROM submissions').filter(s => set.has(s.kpi_id)).map(s => ({ id: s.id, kpiId: s.kpi_id, m: s.month, actual: s.actual, note: s.note || '', status: s.status, submittedBy: s.submitted_by, submittedAt: s.submitted_at, verifiedBy: s.verified_by, verifiedAt: s.verified_at, approvedBy: s.approved_by, approvedAt: s.approved_at, evidence: ev[s.id] || [], history: hist[s.id] || [] }));
}
function plans(deptIds, archived = false) {
  const items = {}; for (const a of db.all('SELECT * FROM action_items ORDER BY position')) (items[a.plan_id] ||= []).push({ id: a.id, text: a.text, owner: a.owner_id, due: a.due_date, done: !!a.done });
  const ups = {}; for (const u of db.all('SELECT * FROM action_updates ORDER BY at')) (ups[u.plan_id] ||= []).push(u);
  return db.all(`SELECT * FROM action_plans WHERE archived_at IS ${archived ? 'NOT' : ''} NULL ORDER BY ref`).filter(c => deptIds.includes(c.dept_id)).map(c => ({
    id: c.id, ref: c.ref, deptId: c.dept_id, kpiId: c.kpi_id, title: c.title, trigger: c.trigger_text, rootCause: c.root_cause, status: c.status, createdBy: c.created_by, createdAt: c.created_at, archivedAt: c.archived_at,
    actions: items[c.id] || [], updates: (ups[c.id] || []).filter(u => u.kind === 'update').map(u => ({ at: u.at, by: u.user_id, text: u.text })), review: (ups[c.id] || []).filter(u => u.kind === 'review').map(u => ({ at: u.at, by: u.user_id, text: u.text })),
  }));
}
function requestRow(r, user, hist) {
  const seePII = !db.getSetting('security').maskPII || access.can(user, 'desk_intake') || r.assigned_to === user.id || r.created_by === user.id || (user.role === 'dept_head' && r.dept_id === user.dept_id);
  return { id: r.id, ref: r.ref, type: r.type, category: r.category_id, priority: r.priority_id, citizenName: r.citizen_name, phone: seePII ? r.phone : maskPhone(r.phone), phoneMasked: !seePII, subject: r.subject, details: r.details, deptId: r.dept_id, status: r.status, assignedTo: r.assigned_to, createdBy: r.created_by, createdAt: r.created_at, dueAt: r.due_at, resolvedAt: r.resolved_at, esc: r.escalation_level, preferredDate: r.preferred_date, archivedAt: r.archived_at, history: (hist[r.id] || []).map(h => ({ at: h.at, by: h.user_id, text: h.text })) };
}
/* Citizens track their own requests without seeing who handles them (guide 4.7):
   no officer names, no internal escalation notes. */
function citizenRequestRow(row) {
  return { ...row, assignedTo: null, history: row.history.filter(h => !/^Escalation/.test(h.text)).map(h => ({ at: h.at, by: h.by === row.createdBy ? h.by : null, text: h.text.replace(/Assigned to [^;—.]+/g, 'Assigned to an officer') })) };
}

/** Full client state for this user. */
function bootstrap(user) {
  const ids = access.scopeIds(user);
  const can = p => access.can(user, p);
  const perfVisible = can('dash') || can('submit') || can('verify') || can('approve') || can('audit');
  const kpis = perfVisible ? kpisWithTargets().filter(k => ids.includes(k.deptId)) : [];
  const hist = {}; for (const h of db.all('SELECT * FROM request_history ORDER BY at')) (hist[h.request_id] ||= []).push(h);
  const reqs = db.all('SELECT * FROM requests WHERE archived_at IS NULL ORDER BY created_at').filter(r => access.requestVisible(user, r)).map(r => requestRow(r, user, hist)).map(r => (user.role === 'citizen' ? citizenRequestRow(r) : r));
  const showContacts = can('users');
  // citizens receive no staff directory: only their own account
  const users = db.all('SELECT * FROM users ORDER BY name').filter(u => user.role !== 'citizen' || u.id === user.id).map(u => ({
    id: u.id, name: u.name, role: u.role, deptId: u.dept_id, title: u.title, active: !!u.active, username: u.username,
    ...(showContacts || u.id === user.id ? { phone: u.phone, email: u.email, prefSms: !!u.pref_sms, prefEmail: !!u.pref_email, lastLogin: u.last_login, lockedUntil: u.locked_until, mustChange: !!u.must_change, lang: u.lang } : {}),
  }));
  const perms = {}; for (const [r, s] of Object.entries(access.permissions())) perms[r] = [...s];
  const isAdmin = can('config');
  // Supervisors and city-wide roles see the employees in their scope; everyone else sees only their own record.
  const seesTeam = can('emp_eval') || can('all_depts');
  const employees = employeeList().filter(e => e.userId === user.id || (seesTeam && ids.includes(e.deptId)));
  const kpiRefDepts = new Set([...employees.map(e => e.deptId)]);
  const kpiRefs = db.all('SELECT id, code, name, dept_id FROM kpis WHERE active = 1 ORDER BY code').filter(k => kpiRefDepts.has(k.dept_id)).map(k => ({ id: k.id, code: k.code, name: k.name, deptId: k.dept_id }));
  return {
    me: user.id, config: config(),
    depts: db.all('SELECT * FROM departments WHERE active = 1 ORDER BY created_at, id').map(d => ({ id: d.id, name: d.name, short: d.short_name, headId: d.head_user_id })),
    objectives: db.all('SELECT * FROM objectives ORDER BY id'),
    users, perms, kpis, prev: perfVisible ? prevYear() : {}, subs: perfVisible ? submissions(kpis.map(k => k.id)) : [],
    caps: perfVisible ? plans(ids) : [], employees, kpiRefs, targetProposals: perfVisible ? targetProposals(kpis.map(k => k.id)) : [], requests: reqs,
    notifs: db.all('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 200', user.id).map(n => ({ id: n.id, to: n.user_id, text: n.text, event: n.event, link: n.link || null, at: n.created_at, read: !!n.is_read })),
    outbox: isAdmin ? db.all('SELECT * FROM outbox ORDER BY created_at DESC LIMIT 500').map(o => ({ id: o.id, channel: o.channel, to: o.recipient, userId: o.user_id, text: o.text, event: o.event, at: o.created_at, status: o.status === 'held' ? 'Held — integration pending approval' : o.status === 'sent' ? 'Sent' : 'Failed' })) : [],
    api: isAdmin ? { keys: db.all('SELECT * FROM api_keys ORDER BY created_at').map(k => ({ id: k.id, name: k.name, prefix: k.prefix, scopes: k.scopes.split(','), createdBy: k.created_by, createdAt: k.created_at, lastUsed: k.last_used, revoked: !!k.revoked })), hooks: db.all('SELECT * FROM webhooks').map(h => ({ id: h.id, url: h.url, events: h.events.split(','), active: !!h.active })) } : { keys: [], hooks: [] },
    qa: isAdmin ? { runs: db.all('SELECT * FROM qa_runs ORDER BY at DESC LIMIT 10').map(r => ({ ...JSON.parse(r.results), at: r.at, by: r.run_by, pass: !!r.passed })), sessions: db.all('SELECT * FROM qa_sessions ORDER BY id') } : { runs: [], sessions: [] },
    archive: isAdmin ? { requests: db.all('SELECT * FROM requests WHERE archived_at IS NOT NULL').map(r => requestRow(r, user, hist)), caps: plans(ids, true) } : { requests: [], caps: [] },
    backups: isAdmin ? db.all('SELECT * FROM backups ORDER BY created_at DESC').map(b => ({ id: b.id, at: b.created_at, by: b.created_by, kind: b.kind, size: b.size, checksum: b.checksum })) : [],
    chatUnread: can('chat') ? db.get('SELECT COUNT(*) AS n FROM messages WHERE to_id = ? AND read_at IS NULL', user.id).n : 0,
    lastArchival: db.getSetting('lastArchival'),
    serverTime: db.now(),
  };
}
function employeeList() {
  const evd = {}; for (const x of db.all('SELECT id, indicator_id, file_name, size FROM employee_evidence ORDER BY uploaded_at')) (evd[x.indicator_id] ||= []).push({ id: x.id, name: x.file_name, size: x.size });
  const ind = {}; for (const i of db.all('SELECT * FROM employee_indicators ORDER BY position')) (ind[i.employee_id] ||= []).push({ id: i.id, name: i.name, unit: i.unit, dir: i.direction, target: i.target, actual: i.actual, weight: i.weight, kpiId: i.kpi_id || null, status: i.status || 'approved', proposedBy: i.proposed_by || null, decisionComment: i.decision_comment || '', reported: i.reported_actual, reportNote: i.report_note || '', reportStatus: i.report_status || 'none', reportedAt: i.reported_at || null, verifiedBy: i.verified_by || null, verifiedAt: i.verified_at || null, verifyComment: i.verify_comment || '', evidence: evd[i.id] || [] });
  const ev = {}; for (const e of db.all('SELECT * FROM employee_evaluations ORDER BY at')) ev[e.employee_id] = { rating: e.rating, comment: e.comment, by: e.evaluated_by, at: e.at };
  return db.all('SELECT * FROM employees ORDER BY dept_id, name').map(e => ({ id: e.id, name: e.name, position: e.position, deptId: e.dept_id, userId: e.user_id, indicators: ind[e.id] || [], evaluation: ev[e.id] || null }));
}

/** Unscoped performance data + engine (for alerts, notifications and API). */
function engine(scopeUser = null) {
  const allIds = db.all('SELECT id FROM departments WHERE active = 1').map(r => r.id);
  const kpis = kpisWithTargets();
  const st = { config: config(), depts: db.all('SELECT * FROM departments WHERE active = 1').map(d => ({ id: d.id, name: d.name, short: d.short_name, headId: d.head_user_id })), kpis, prev: prevYear(), subs: submissions(kpis.map(k => k.id)), caps: plans(allIds) };
  const ids = scopeUser ? access.scopeIds(scopeUser) : allIds;
  return { state: st, ...createEngine({ getState: () => st, scopeIds: () => ids }) };
}

module.exports = { bootstrap, engine, config, employeeList, maskPhone };
