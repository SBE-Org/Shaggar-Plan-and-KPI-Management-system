/* KPIs, objectives, targets, performance submissions (with evidence files),
   corrective action plans and employee evaluations. */
const db = require('../db');
const config = require('../config');
const { route, fail, sendFile } = require('../lib/http');
const A = require('../lib/access');
const audit = require('../lib/audit');
const { notify, usersWith, usersByRole, webhook } = require('../lib/notify');
const { sha256 } = require('../lib/security');
const storage = require('../lib/storage');
/* Evidence files are saved before the database records them, and removed files are
   deleted after the change is committed, so a failure never leaves a record without its file. */
const safeName = n => String(n).replace(/[^\w.\-]+/g, '_').slice(0, 120);
async function saveFiles(files, folder, prefix) {
  const saved = [];
  try { for (const f of files) { const buf = Buffer.from(f.data || '', 'base64'), id = db.id(prefix), key = `evidence/${folder}/${id}-${safeName(f.name)}`; await storage.put(key, buf, f.type); saved.push({ id, key, buf, f }); } }
  catch (e) { await storage.remove(saved.map(x => x.key)).catch(() => {}); fail(502, e.message); }
  return saved;
}
const dropFiles = rows => storage.remove(rows.filter(r => r.storage_path).map(r => storage.evidenceKey(r.storage_path))).catch(e => console.error('[storage]', e.message));
async function sendEvidence(ctx, row) {
  if (!row.storage_path) fail(404, 'Only the file details were recorded for this sample item; the file itself is not stored.');
  const buf = await storage.get(storage.evidenceKey(row.storage_path)).catch(e => fail(502, e.message));
  if (!buf) fail(404, 'The file is missing from storage.');
  audit.log(ctx, 'Evidence downloaded', 'Evidence', row.id, row.file_name);
  sendFile(ctx.res, 200, buf, row.mime || 'application/octet-stream', { 'Content-Disposition': `attachment; filename="${row.file_name.replace(/"/g, '')}"`, 'Cache-Control': 'private, no-store' });
}
const state = require('../services/state');
const C = require('../../shared/constants');

const kpiRow = id => db.get('SELECT * FROM kpis WHERE id = ?', id) || fail(404, 'KPI not found.');
const deptOf = id => db.get('SELECT * FROM departments WHERE id = ?', id);
const num = (v, name) => { const n = Number(v); if (!Number.isFinite(n)) fail(422, `${name} must be a number.`); return n; };
const pickK = k => ({ code: k.code, name: k.name, dept_id: k.dept_id, objective_id: k.objective_id, unit: k.unit, direction: k.direction, frequency: k.frequency, aggregation: k.aggregation, weight: k.weight, annual_target: k.annual_target, formula: k.formula, owner_id: k.owner_id, evidence_required: k.evidence_required, active: k.active });
function distribute(freq, agg, unit, annual) {
  const dueM = [...Array(12).keys()].filter(m => freq === 'monthly' || m % 3 === 2);
  return [...Array(12).keys()].map(m => (dueM.includes(m) ? (agg === 'sum' ? C.roundU(annual / dueM.length, unit) : annual) : null));
}
const MAX_FILE = 10 * 1024 * 1024;
const ALLOWED = /\.(pdf|png|jpe?g|webp|docx?|xlsx?|csv|txt|pptx?|zip)$/i;

/* ---------- KPIs ---------- */
function kpiFields(b) {
  const f = { code: String(b.code || '').trim(), dept_id: b.deptId, objective_id: b.objectiveId || null, name: String(b.name || '').trim(), definition: b.definition || '', formula: b.formula || '', source: b.source || '', unit: String(b.unit || '').trim(), direction: b.dir === 'lower' ? 'lower' : 'higher', frequency: b.freq === 'quarterly' ? 'quarterly' : 'monthly', aggregation: b.agg === 'avg' ? 'avg' : 'sum', weight: num(b.weight, 'Weight'), annual_target: num(b.annual, 'Annual target'), baseline: b.baseline === '' || b.baseline == null ? null : num(b.baseline, 'Baseline'), evidence_required: b.evidenceRequired ? 1 : 0, owner_id: b.ownerId || null, active: b.active === false ? 0 : 1 };
  if (!f.code || !f.name || !f.unit) fail(422, 'Code, name and unit are required.');
  if (!deptOf(f.dept_id)) fail(422, 'Choose a valid department.');
  if (f.weight < 0 || f.weight > 100) fail(422, 'Weight must be between 0 and 100.');
  return f;
}
route('POST', '/api/kpis', ctx => {
  A.requirePerm(ctx.user, 'kpi_manage'); const f = kpiFields(ctx.body);
  if (db.get('SELECT id FROM kpis WHERE code = ?', f.code)) fail(409, 'That KPI code is already used.');
  const id = db.id('K'); const t = db.now();
  db.tx(() => { db.insert('kpis', { id, ...f, created_at: t, updated_at: t }); distribute(f.frequency, f.aggregation, f.unit, f.annual_target).forEach((v, m) => db.insert('kpi_targets', { kpi_id: id, month: m, target: v })); });
  audit.log(ctx, 'KPI defined', 'KPI', f.code, `${f.name}, annual target ${C.fmt(f.annual_target, f.unit)}`, null, f);
  return { id };
});
route('PUT', '/api/kpis/:id', ctx => {
  A.requirePerm(ctx.user, 'kpi_manage'); const k = kpiRow(ctx.params.id); const f = kpiFields(ctx.body);
  if (k.approval !== 'approved') fail(409, "This KPI is a department's proposal. The Mayor's Office approves or returns it.");
  if (db.get('SELECT id FROM kpis WHERE code = ? AND id <> ?', f.code, k.id)) fail(409, 'That KPI code is already used.');
  db.tx(() => {
    db.update('kpis', { id: k.id }, { ...f, updated_at: db.now() });
    if (f.frequency !== k.frequency || f.aggregation !== k.aggregation) distribute(f.frequency, f.aggregation, f.unit, f.annual_target).forEach((v, m) => db.update('kpi_targets', { kpi_id: k.id, month: m }, { target: v }));
  });
  audit.log(ctx, 'KPI updated', 'KPI', f.code, f.name, pickK(k), pickK({ ...k, ...f }));
  return { ok: true };
});
route('PUT', '/api/objectives', ctx => {
  A.requirePerm(ctx.user, 'kpi_manage');
  const before = db.all('SELECT * FROM objectives ORDER BY id');
  db.tx(() => { for (const o of ctx.body.objectives || []) { const id = String(o.id || '').trim(), title = String(o.title || '').trim(); if (!id || !title) continue; if (db.get('SELECT id FROM objectives WHERE id = ?', id)) db.update('objectives', { id }, { title }); else db.insert('objectives', { id, title }); } });
  audit.log(ctx, 'Strategic objectives updated', 'Objective', '-', '', { list: before.map(o => o.id + ': ' + o.title).join(' | ') }, { list: db.all('SELECT * FROM objectives ORDER BY id').map(o => o.id + ': ' + o.title).join(' | ') });
  return { ok: true };
});

/* ---------- KPI proposals ----------
   A department (Department Head or KPI Officer) proposes a new KPI together with
   its targets. It stays inactive, outside every score, until the Mayor's Office
   approves it. Approval activates the KPI and locks its targets. */
function nextKpiCode(deptId) {
  let n = db.get('SELECT COUNT(*) AS n FROM kpis WHERE dept_id = ?', deptId).n + 1, code;
  do { code = `${deptId}-${String(n++).padStart(2, '0')}`; } while (db.get('SELECT id FROM kpis WHERE code = ?', code));
  return code;
}
function proposalTargets(f, b) {
  const even = distribute(f.frequency, f.aggregation, f.unit, f.annual_target);
  return even.map((v, m) => { if (v == null) return null; const x = (b.targets || [])[m]; if (x == null || x === '') return v; const n = num(x, `${C.MONTHS[m]} target`); if (n < 0) fail(422, 'Targets cannot be negative.'); return n; });
}
function proposalFields(ctx, deptId, code) {
  const b = ctx.body;
  // the form asks one question, "How is it measured?"; older clients send definition and formula separately
  const measure = String(b.measure ?? b.definition ?? '').trim();
  const f = kpiFields({ ...b, deptId, code, active: false, definition: measure, formula: b.measure != null ? '' : (b.formula || ''), source: b.measure != null ? '' : (b.source || '') });
  if (measure.length < 5) fail(422, 'Describe how the KPI is measured.');
  if (f.annual_target < 0) fail(422, 'The annual target cannot be negative.');
  if (f.weight <= 0) fail(422, 'Give the KPI a weight above zero.');
  if (f.objective_id && !db.get('SELECT id FROM objectives WHERE id = ?', f.objective_id)) fail(422, 'Choose a valid strategic objective.');
  if (f.owner_id) { const o = db.get('SELECT * FROM users WHERE id = ?', f.owner_id); if (!o || (o.dept_id && o.dept_id !== deptId)) fail(422, 'Choose a KPI officer from this department or a central officer.'); }
  return f;
}
const kpiProposal = id => { const k = kpiRow(id); if (k.approval === 'approved') fail(409, 'This KPI is already approved. Changes to its targets go through a revision request.'); return k; };
route('POST', '/api/kpi-proposals', ctx => {
  A.requirePerm(ctx.user, 'target_propose'); const deptId = ctx.body.deptId; A.requireScope(ctx.user, deptId);
  const f = proposalFields(ctx, deptId, nextKpiCode(deptId)), targets = proposalTargets(f, ctx.body), id = db.id('K'), t = db.now();
  db.tx(() => {
    db.insert('kpis', { id, ...f, active: 0, created_at: t, updated_at: t, targets_approved_at: null, targets_approved_by: null, approval: 'proposed', proposed_by: ctx.user.id, decided_by: null, decision_comment: null });
    targets.forEach((v, m) => db.insert('kpi_targets', { kpi_id: id, month: m, target: v }));
  });
  audit.log(ctx, 'KPI proposed', 'KPI', f.code, `${deptOf(deptId).short_name}: ${f.name}, annual target ${C.fmt(f.annual_target, f.unit)}, weight ${f.weight}%`, null, pickK(f));
  notify(usersWith('target_approve'), `${deptOf(deptId).short_name} proposed a new KPI "${f.name}" with its targets — awaiting your approval.`, 'target_proposed', ctx.user.id, `kpiprop:${id}`);
  return { id, code: f.code, status: 'proposed' };
});
route('PUT', '/api/kpi-proposals/:id', ctx => {
  A.requirePerm(ctx.user, 'target_propose'); const k = kpiProposal(ctx.params.id); A.requireScope(ctx.user, k.dept_id);
  const f = proposalFields(ctx, k.dept_id, k.code), targets = proposalTargets(f, ctx.body);
  db.tx(() => {
    db.update('kpis', { id: k.id }, { ...f, active: 0, updated_at: db.now(), approval: 'proposed', proposed_by: ctx.user.id, decided_by: null, decision_comment: null });
    targets.forEach((v, m) => db.update('kpi_targets', { kpi_id: k.id, month: m }, { target: v }));
  });
  audit.log(ctx, k.approval === 'returned' ? 'KPI proposal resubmitted' : 'KPI proposal updated', 'KPI', k.code, f.name, pickK(k), pickK({ ...k, ...f }));
  if (k.approval === 'returned') notify(usersWith('target_approve'), `${deptOf(k.dept_id).short_name} resubmitted the proposed KPI "${f.name}" — awaiting your approval.`, 'target_proposed', ctx.user.id, `kpiprop:${k.id}`);
  return { id: k.id, status: 'proposed' };
});
route('POST', '/api/kpi-proposals/:id/decision', ctx => {
  A.requirePerm(ctx.user, 'target_approve'); const k = kpiProposal(ctx.params.id); A.requireScope(ctx.user, k.dept_id);
  if (k.approval !== 'proposed') fail(409, 'This proposal was returned and has not been resubmitted yet.');
  if (k.proposed_by === ctx.user.id) fail(403, 'You proposed this KPI, so someone else must approve it.');
  const action = ctx.body.action, comment = String(ctx.body.comment || '').trim(), t = db.now();
  if (action === 'approve') {
    db.update('kpis', { id: k.id }, { active: 1, approval: 'approved', decided_by: ctx.user.id, decision_comment: comment, targets_approved_at: t, targets_approved_by: ctx.user.id, updated_at: t });
    audit.log(ctx, 'KPI approved', 'KPI', k.code, `${k.name}: annual target ${C.fmt(k.annual_target, k.unit)}${comment ? ' — ' + comment : ''}`, { status: 'proposed', active: false }, { status: 'approved', active: true });
    notify([k.proposed_by, deptOf(k.dept_id).head_user_id, k.owner_id], `The KPI ${k.code} "${k.name}" was approved by ${ctx.user.name}. It is now active and its targets are locked.`, 'target_decided', ctx.user.id, `kpi:${k.id}`);
    return { status: 'approved' };
  }
  if (action === 'return') {
    if (comment.length < 5) fail(422, 'Give a reason when returning a proposed KPI.');
    db.update('kpis', { id: k.id }, { approval: 'returned', decided_by: ctx.user.id, decision_comment: comment, updated_at: t });
    audit.log(ctx, 'KPI proposal returned', 'KPI', k.code, `${k.name} — ${comment}`, { status: 'proposed' }, { status: 'returned' });
    notify([k.proposed_by, deptOf(k.dept_id).head_user_id], `The proposed KPI "${k.name}" was returned by ${ctx.user.name}: ${comment}`, 'target_decided', ctx.user.id, `kpiprop:${k.id}`);
    return { status: 'returned' };
  }
  fail(400, 'Unknown action.');
});
route('DELETE', '/api/kpi-proposals/:id', ctx => {
  A.requirePerm(ctx.user, 'target_propose'); const k = kpiProposal(ctx.params.id); A.requireScope(ctx.user, k.dept_id);
  db.tx(() => { db.run('DELETE FROM target_proposals WHERE kpi_id = ?', k.id); db.run('DELETE FROM kpi_targets WHERE kpi_id = ?', k.id); db.run('DELETE FROM kpis WHERE id = ?', k.id); });
  audit.log(ctx, 'KPI proposal withdrawn', 'KPI', k.code, k.name, pickK(k), null);
  return { ok: true };
});

/* ---------- Targets ---------- */
route('PUT', '/api/targets', ctx => {
  A.requirePerm(ctx.user, 'target_manage'); let n = 0;
  db.tx(() => {
    for (const item of ctx.body.kpis || []) {
      const k = kpiRow(item.id); A.requireScope(ctx.user, k.dept_id);
      const before = { annual: k.annual_target, ...Object.fromEntries(db.all('SELECT month, target FROM kpi_targets WHERE kpi_id = ? ORDER BY month', k.id).filter(r => r.target != null).map(r => [C.MONTHS[r.month], r.target])) };
      const annual = num(item.annual, 'Annual target');
      db.update('kpis', { id: k.id }, { annual_target: annual, updated_at: db.now(), targets_approved_at: db.now(), targets_approved_by: ctx.user.id });
      (item.targets || []).forEach((v, m) => { if (v != null && v !== '') db.update('kpi_targets', { kpi_id: k.id, month: m }, { target: num(v, 'Target') }); });
      const after = { annual, ...Object.fromEntries(db.all('SELECT month, target FROM kpi_targets WHERE kpi_id = ? ORDER BY month', k.id).filter(r => r.target != null).map(r => [C.MONTHS[r.month], r.target])) };
      if (JSON.stringify(before) !== JSON.stringify(after)) { n++; audit.log(ctx, 'Targets changed', 'Target', k.code, Object.keys(audit.diff(before, after)).map(x => `${x} ${before[x]}→${after[x]}`).join(', '), before, after); }
    }
  });
  return { changed: n };
});

/* Targets workflow: the department proposes, the Mayor's Office approves.
   Approved targets are locked; changing them needs a revision request with a
   reason, which goes through the same approval. */
const monthTargets = kid => { const a = Array(12).fill(null); for (const r of db.all('SELECT month, target FROM kpi_targets WHERE kpi_id = ?', kid)) a[r.month] = r.target; return a; };
const propRow = id => db.get('SELECT * FROM target_proposals WHERE id = ?', id) || fail(404, 'Target proposal not found.');
route('POST', '/api/target-proposals', ctx => {
  A.requirePerm(ctx.user, 'target_propose'); const b = ctx.body, k = kpiRow(b.kpiId); A.requireScope(ctx.user, k.dept_id);
  if (k.approval !== 'approved') fail(409, 'This KPI is still a proposal. Edit the proposal itself to change its targets.');
  const annual = num(b.annual, 'Annual target'); if (annual < 0) fail(422, 'The annual target cannot be negative.');
  const dueM = m => k.frequency === 'monthly' || m % 3 === 2;
  const targets = [...Array(12).keys()].map(m => { if (!dueM(m)) return null; const v = (b.targets || [])[m]; if (v == null || v === '') fail(422, `Enter a target for ${C.MONTHS[m]}.`); const n = num(v, `${C.MONTHS[m]} target`); if (n < 0) fail(422, 'Targets cannot be negative.'); return n; });
  const isRevision = k.targets_approved_at ? 1 : 0, reason = String(b.reason || '').trim();
  if (isRevision && reason.length < 10) fail(422, 'These targets are approved and locked. Explain why they should be revised (at least 10 characters).');
  const id = db.id('TP');
  db.tx(() => {
    db.run("UPDATE target_proposals SET status = 'withdrawn', decided_at = ?, decision_comment = 'Replaced by a newer proposal' WHERE kpi_id = ? AND status IN ('pending', 'returned')", db.now(), k.id);
    db.insert('target_proposals', { id, kpi_id: k.id, annual, targets: JSON.stringify(targets), reason, is_revision: isRevision, status: 'pending', proposed_by: ctx.user.id, proposed_at: db.now(), decided_by: null, decided_at: null, decision_comment: null });
  });
  audit.log(ctx, isRevision ? 'Target revision requested' : 'Targets proposed', 'Target', k.code, `${k.name}: annual ${C.fmt(annual, k.unit)}${reason ? ' — ' + reason : ''}`, { annual: k.annual_target }, { annual, status: 'pending' });
  notify(usersWith('target_approve'), `${deptOf(k.dept_id).short_name} ${isRevision ? 'asks to revise' : 'proposed'} targets for ${k.code} ${k.name} — awaiting your approval.`, 'target_proposed', ctx.user.id, `tp:${id}`);
  return { id, status: 'pending' };
});
route('POST', '/api/target-proposals/:id/decision', ctx => {
  A.requirePerm(ctx.user, 'target_approve'); const p = propRow(ctx.params.id), k = kpiRow(p.kpi_id); A.requireScope(ctx.user, k.dept_id);
  if (p.status !== 'pending') fail(409, 'This proposal has already been decided.');
  if (p.proposed_by === ctx.user.id) fail(403, 'You proposed these targets, so someone else must approve them.');
  const action = ctx.body.action, comment = String(ctx.body.comment || '').trim(), t = db.now();
  if (action === 'approve') {
    const targets = JSON.parse(p.targets), before = { annual: k.annual_target, ...Object.fromEntries(monthTargets(k.id).map((v, m) => [C.MONTHS[m], v]).filter(x => x[1] != null)) };
    db.tx(() => {
      db.update('kpis', { id: k.id }, { annual_target: p.annual, targets_approved_at: t, targets_approved_by: ctx.user.id, updated_at: t });
      targets.forEach((v, m) => db.update('kpi_targets', { kpi_id: k.id, month: m }, { target: v }));
      db.update('target_proposals', { id: p.id }, { status: 'approved', decided_by: ctx.user.id, decided_at: t, decision_comment: comment });
    });
    audit.log(ctx, 'Targets approved', 'Target', k.code, `${k.name}: annual ${C.fmt(p.annual, k.unit)}${comment ? ' — ' + comment : ''}`, before, { annual: p.annual, ...Object.fromEntries(targets.map((v, m) => [C.MONTHS[m], v]).filter(x => x[1] != null)) });
    notify([p.proposed_by, deptOf(k.dept_id).head_user_id], `Targets for ${k.code} ${k.name} were approved by ${ctx.user.name} and are now locked.`, 'target_decided', ctx.user.id, `kpi:${k.id}`);
    return { status: 'approved' };
  }
  if (action === 'return') {
    if (comment.length < 5) fail(422, 'Give a reason when returning proposed targets.');
    db.update('target_proposals', { id: p.id }, { status: 'returned', decided_by: ctx.user.id, decided_at: t, decision_comment: comment });
    audit.log(ctx, 'Targets returned', 'Target', k.code, `${k.name} — ${comment}`, { status: 'pending' }, { status: 'returned' });
    notify([p.proposed_by, deptOf(k.dept_id).head_user_id], `Proposed targets for ${k.code} ${k.name} were returned by ${ctx.user.name}: ${comment}`, 'target_decided', ctx.user.id, `tp:${p.id}`);
    return { status: 'returned' };
  }
  fail(400, 'Unknown action.');
});
route('POST', '/api/target-proposals/:id/withdraw', ctx => {
  const p = propRow(ctx.params.id), k = kpiRow(p.kpi_id); A.requireScope(ctx.user, k.dept_id);
  if (p.proposed_by !== ctx.user.id && !(A.can(ctx.user, 'target_propose') && ctx.user.dept_id === k.dept_id)) fail(403, 'Only the department that made this proposal can withdraw it.');
  if (!['pending', 'returned'].includes(p.status)) fail(409, 'This proposal can no longer be withdrawn.');
  db.update('target_proposals', { id: p.id }, { status: 'withdrawn', decided_at: db.now() });
  audit.log(ctx, 'Target proposal withdrawn', 'Target', k.code, k.name, { status: p.status }, { status: 'withdrawn' });
  return { status: 'withdrawn' };
});

/* ---------- Submissions ---------- */
const subHist = (sid, userId, action, comment = '') => db.insert('submission_history', { id: db.id('H'), submission_id: sid, user_id: userId, action, comment, at: db.now() });
function achievement(k, actual, target) { if (actual == null || target == null) return null; if (k.direction === 'higher') return target ? actual / target * 100 : null; return actual ? target / actual * 100 : 120; }

route('POST', '/api/submissions', async ctx => {
  A.requirePerm(ctx.user, 'submit');
  const b = ctx.body, k = kpiRow(b.kpiId); A.requireScope(ctx.user, k.dept_id);
  if (!k.active) fail(409, k.approval === 'approved' ? 'This KPI is inactive.' : 'This KPI is not approved yet, so results cannot be reported against it.');
  const m = Number(b.month), sc = db.getSetting('scoring'), W = db.getSetting('workflow');
  if (!(m >= 0 && m < sc.currentMonth) || !(k.frequency === 'monthly' || m % 3 === 2)) fail(422, 'This period is not open for reporting.');
  const actual = num(b.actual, 'Actual'), note = String(b.note || '').trim(), mode = b.mode === 'draft' ? 'draft' : 'submit';
  let s = db.get('SELECT * FROM submissions WHERE kpi_id = ? AND month = ?', k.id, m);
  if (s && !['draft', 'returned'].includes(s.status)) fail(409, 'This report was already submitted and is in the approval workflow.');
  const target = db.get('SELECT target FROM kpi_targets WHERE kpi_id = ? AND month = ?', k.id, m).target;
  const ach = achievement(k, actual, target);
  const keep = new Set(b.keepEvidence || []), files = Array.isArray(b.files) ? b.files : [];
  for (const f of files) { if (!ALLOWED.test(f.name || '')) fail(422, `${f.name}: this file type is not accepted.`); if (Buffer.byteLength(f.data || '', 'base64') > MAX_FILE) fail(413, `${f.name} is larger than 10 MB.`); }
  const existing = s ? db.all('SELECT * FROM submission_evidence WHERE submission_id = ?', s.id) : [];
  const evidenceCount = existing.filter(e => keep.has(e.id)).length + files.length;
  if (mode === 'submit') {
    if (k.evidence_required && !evidenceCount) fail(422, 'Evidence is required for this KPI — attach at least one file.');
    if (ach != null && ach < sc.varianceNote && note.length < 15) fail(422, `Explain the variance — achievement is below ${sc.varianceNote}%.`);
  }
  const before = s ? { actual: s.actual, status: s.status, evidence: existing.length, note: s.note } : null;
  const wasReturned = s && s.status === 'returned';
  const t = db.now();
  const sid = s ? s.id : db.id('S'), removed = existing.filter(e => !keep.has(e.id));
  const saved = await saveFiles(files, sid, 'E');
  try { db.tx(() => {
    if (!s) { s = { id: sid, kpi_id: k.id, month: m, actual, note, status: 'draft', submitted_by: ctx.user.id, submitted_at: null, verified_by: null, verified_at: null, approved_by: null, approved_at: null, esc_verify: 0, esc_approve: 0 }; db.insert('submissions', s); }
    for (const e of removed) db.run('DELETE FROM submission_evidence WHERE id = ?', e.id);
    for (const { id: eid, key, buf, f } of saved) db.insert('submission_evidence', { id: eid, submission_id: s.id, file_name: String(f.name).slice(0, 200), size: buf.length, mime: f.type || null, storage_path: key, sha256: sha256(buf), uploaded_by: ctx.user.id, uploaded_at: t });
    if (mode === 'submit') {
      let status = 'submitted', changes = { actual, note, status, submitted_by: ctx.user.id, submitted_at: t, verified_by: null, verified_at: null, approved_by: null, approved_at: null, esc_verify: 0, esc_approve: 0 };
      subHist(s.id, ctx.user.id, wasReturned ? 'resubmitted' : 'submitted');
      if (!W.verifyRequired) { changes.status = 'verified'; changes.verified_at = t; subHist(s.id, null, 'verification skipped (workflow setting)'); if (!W.approveRequired) { changes.status = 'approved'; changes.approved_at = t; subHist(s.id, null, 'auto-approved (workflow setting)'); } }
      db.update('submissions', { id: s.id }, changes);
      const head = deptOf(k.dept_id).head_user_id;
      if (changes.status === 'submitted') notify([head], `${k.code} ${C.MONTHS[m]} report submitted by ${ctx.user.name} — awaiting your verification.`, 'submission_submitted', ctx.user.id, `sub:${s.id}`);
      else if (changes.status === 'verified') notify(usersWith('approve'), `${k.code} ${C.MONTHS[m]} submitted — awaiting Mayor's Office approval.`, 'submission_verified', ctx.user.id, `sub:${s.id}`);
    } else { db.update('submissions', { id: s.id }, { actual, note, status: wasReturned ? 'returned' : 'draft' }); subHist(s.id, ctx.user.id, 'saved draft'); }
  }); } catch (e) { await dropFiles(saved.map(x => ({ storage_path: x.key }))); throw e; }
  await dropFiles(removed);
  const after = db.get('SELECT * FROM submissions WHERE id = ?', s.id);
  audit.log(ctx, mode === 'submit' ? (wasReturned ? 'Submission resubmitted' : 'Submission submitted') : 'Submission draft saved', 'Submission', s.id, `${k.code} · ${C.MONTHS[m]} · actual ${C.fmt(actual, k.unit)} (${C.pct(ach)})`, before, { actual, status: after.status, evidence: evidenceCount, note });
  return { id: s.id, status: after.status };
});

function act(ctx, s, action, comment, silent) {
  const k = kpiRow(s.kpi_id), d = deptOf(k.dept_id), W = db.getSetting('workflow'), u = ctx.user, t = db.now();
  if (action === 'verify') {
    A.requirePerm(u, 'verify'); if (u.dept_id !== k.dept_id) fail(403, 'Only the head of this department can verify it.');
    if (s.status !== 'submitted') fail(409, 'Only submitted reports can be verified.');
    if (W.sod && s.submitted_by === u.id) fail(403, 'Segregation of duties: you submitted this report, so someone else must verify it.');
    if (!W.approveRequired) { db.update('submissions', { id: s.id }, { status: 'approved', verified_by: u.id, verified_at: t, approved_at: t }); subHist(s.id, u.id, 'verified', comment); subHist(s.id, null, 'auto-approved (workflow setting)'); }
    else { db.update('submissions', { id: s.id }, { status: 'verified', verified_by: u.id, verified_at: t }); subHist(s.id, u.id, 'verified', comment); notify(usersWith('approve'), `${k.code} ${C.MONTHS[s.month]} (${d.short_name}) verified — awaiting Mayor's Office approval.`, 'submission_verified', u.id, `sub:${s.id}`); }
  } else if (action === 'approve') {
    A.requirePerm(u, 'approve'); if (s.status !== 'verified') fail(409, 'Only verified reports can be approved.');
    if (W.sod && (s.verified_by === u.id || s.submitted_by === u.id)) fail(403, 'Segregation of duties: you already acted on this report, so another authorised user must approve it.');
    db.update('submissions', { id: s.id }, { status: 'approved', approved_by: u.id, approved_at: t }); subHist(s.id, u.id, 'approved', comment);
    notify([s.submitted_by, d.head_user_id], `${k.code} ${C.MONTHS[s.month]} report approved by ${u.name}.`, 'submission_approved', u.id, `sub:${s.id}`);
    webhook('submission_approved', { kpi: k.code, month: s.month, actual: s.actual });
    const target = db.get('SELECT target FROM kpi_targets WHERE kpi_id = ? AND month = ?', k.id, s.month).target;
    const ach = achievement(k, s.actual, target), bands = db.getSetting('scoring').bands;
    if (ach != null && ach < bands.warning) { notify([d.head_user_id, ...usersWith('approve')], `ALERT: ${k.code} achieved ${C.pct(ach)} in ${C.MONTHS[s.month]} — below the ${bands.warning}% threshold. A corrective action plan is required.`, 'kpi_alert', u.id, `alerts:${k.dept_id}`); webhook('kpi_alert', { kpi: k.code, month: s.month, achievement: ach }); }
    const sc = state.engine().deptCalc(k.dept_id, [s.month]).score;
    if (sc != null && sc < bands.warning) notify([d.head_user_id, ...usersByRole('mayor')], `ALERT: ${d.short_name} monthly score for ${C.MONTHS[s.month]} is ${C.pct(sc)} — underperforming.`, 'kpi_alert', u.id, `alerts:${k.dept_id}`);
  } else if (action === 'return') {
    if (!(comment && comment.length >= 5)) fail(422, 'Give a reason when returning a report.');
    const asVerifier = s.status === 'submitted' && A.can(u, 'verify') && u.dept_id === k.dept_id;
    // The Mayor's Office may send a report back at either step; approving still needs verification first.
    const asApprover = ['submitted', 'verified'].includes(s.status) && A.can(u, 'approve') && !asVerifier;
    if (!asVerifier && !asApprover) fail(403, 'You cannot return this report at its current step.');
    if (asApprover && W.sod && (s.submitted_by === u.id || s.verified_by === u.id)) fail(403, 'Segregation of duties: you already acted on this report, so another authorised user must decide on it.');
    db.update('submissions', { id: s.id }, { status: 'returned' }); subHist(s.id, u.id, 'returned', comment);
    notify([s.submitted_by, asApprover ? d.head_user_id : null], `${k.code} ${C.MONTHS[s.month]} returned by ${u.name}: ${comment}`, 'submission_returned', u.id, `sub:${s.id}`);
  } else fail(400, 'Unknown action.');
  const now = db.get('SELECT status FROM submissions WHERE id = ?', s.id).status;
  audit.log(ctx, action === 'return' ? 'Submission returned' : action === 'verify' ? (now === 'approved' ? 'Submission verified and auto-approved' : 'Submission verified') : silent ? 'Submission approved (bulk)' : 'Submission approved', 'Submission', s.id, `${k.code} · ${C.MONTHS[s.month]} · actual ${C.fmt(s.actual, k.unit)}${comment ? ' — ' + comment : ''}`, { status: s.status }, { status: now });
  return now;
}
route('POST', '/api/submissions/:id/action', ctx => {
  const s = db.get('SELECT * FROM submissions WHERE id = ?', ctx.params.id) || fail(404, 'Submission not found.');
  A.requireScope(ctx.user, kpiRow(s.kpi_id).dept_id);
  return { status: db.tx(() => act(ctx, s, ctx.body.action, String(ctx.body.comment || '').trim())) };
});
/* Remind whoever holds a report at its current step. Approvers can remind any
   department in scope; a department head can remind their own KPI officers.
   At most one reminder per report and step every 12 hours. */
route('POST', '/api/reports/remind', ctx => {
  const u = ctx.user || fail(401, 'Sign in to continue.'); const k = kpiRow(ctx.body.kpiId); const m = Number(ctx.body.month);
  A.requireScope(u, k.dept_id); const sc = db.getSetting('scoring');
  if (!(m >= 0 && m < sc.currentMonth)) fail(422, 'This period is not open for reporting yet.');
  const s = db.get('SELECT * FROM submissions WHERE kpi_id = ? AND month = ?', k.id, m), d = deptOf(k.dept_id);
  const status = s ? s.status : 'missing';
  const officers = usersWith('submit', k.dept_id).filter(id => db.get('SELECT role FROM users WHERE id = ?', id).role !== 'super_admin');
  let to, what;
  if (status === 'submitted') { if (!A.can(u, 'approve')) fail(403, 'Only the Mayor\'s Office can remind a department head to verify.'); to = [d.head_user_id]; what = `is waiting for your verification`; }
  else if (['missing', 'draft', 'returned'].includes(status)) {
    if (!(A.can(u, 'approve') || (A.can(u, 'verify') && u.dept_id === k.dept_id))) fail(403, 'You cannot send this reminder.');
    to = status === 'returned' ? [s.submitted_by, ...officers, d.head_user_id] : [...officers, d.head_user_id];
    what = status === 'returned' ? 'was returned and needs to be corrected and resubmitted' : 'has not been submitted yet';
  } else fail(409, status === 'verified' ? "This report is verified and waiting for the Mayor's Office." : 'This report is already approved.');
  const key = `${k.id}:${m}:${status}`;
  const last = db.get("SELECT at FROM audit_log WHERE action = 'Reminder sent' AND entity_id = ? ORDER BY at DESC LIMIT 1", key);
  if (last && Date.now() - Date.parse(last.at) < 12 * 3600e3) { const h = Math.max(1, Math.ceil(12 - (Date.now() - Date.parse(last.at)) / 3600e3)); fail(429, `A reminder for this report was already sent in the last 12 hours. You can send another in about ${h} hour${h === 1 ? '' : 's'}.`); }
  to = [...new Set(to.filter(Boolean))].filter(id => id !== u.id);
  if (!to.length) fail(409, 'There is nobody to remind for this report.');
  notify(to, `Reminder from ${u.name}: the ${k.code} ${k.name} report for ${C.MONTHS[m]} ${what}.`, 'general', u.id, s ? `sub:${s.id}` : `rep:${k.id}.${m}`);
  audit.log(ctx, 'Reminder sent', 'Report', key, `${k.code} · ${C.MONTHS[m]} · ${status} — ${to.length} recipient(s)`);
  return { sent: to.length };
});
route('POST', '/api/submissions/bulk-approve', ctx => {
  A.requirePerm(ctx.user, 'approve'); const W = db.getSetting('workflow'); let n = 0;
  db.tx(() => { for (const s of db.all("SELECT * FROM submissions WHERE status = 'verified'")) { if (W.sod && (s.verified_by === ctx.user.id || s.submitted_by === ctx.user.id)) continue; if (!A.scopeIds(ctx.user).includes(kpiRow(s.kpi_id).dept_id)) continue; act(ctx, s, 'approve', 'Bulk approval', true); n++; } });
  return { approved: n };
});
route('GET', '/api/evidence/:id', async ctx => {
  const e = db.get('SELECT e.*, k.dept_id FROM submission_evidence e JOIN submissions s ON s.id = e.submission_id JOIN kpis k ON k.id = s.kpi_id WHERE e.id = ?', ctx.params.id) || fail(404, 'File not found.');
  A.requireScope(ctx.user, e.dept_id);
  await sendEvidence(ctx, e);
});

/* ---------- Corrective action plans ---------- */
const planRow = id => db.get('SELECT * FROM action_plans WHERE id = ?', id) || fail(404, 'Action plan not found.');
route('POST', '/api/caps', ctx => {
  A.requirePerm(ctx.user, 'cap_manage'); const b = ctx.body; A.requireScope(ctx.user, b.deptId);
  const actions = (b.actions || []).filter(a => String(a.text || '').trim());
  if (!b.title || !actions.length || actions.some(a => !a.due)) fail(422, 'Add a title and at least one action, each with a due date.');
  const n = db.get('SELECT COUNT(*) n FROM action_plans').n + 1; const id = db.id('CAP'); const ref = `CAP-${db.getSetting('scoring').fyStart}-${String(n).padStart(3, '0')}`;
  db.tx(() => { db.insert('action_plans', { id, ref, dept_id: b.deptId, kpi_id: b.kpiId || null, title: b.title, trigger_text: b.trigger || '', root_cause: b.rootCause || '', status: 'Open', created_by: ctx.user.id, created_at: db.now(), completed_at: null, archived_at: null }); actions.forEach((a, i) => db.insert('action_items', { id: db.id('AI'), plan_id: id, position: i, text: a.text.trim(), owner_id: a.owner || null, due_date: a.due, done: 0 })); });
  audit.log(ctx, 'Action plan created', 'CAP', ref, `${deptOf(b.deptId).short_name}: ${b.title} (${actions.length} actions)`, null, { title: b.title, actions: actions.length });
  notify(usersWith('approve'), `New corrective action plan ${ref} from ${deptOf(b.deptId).short_name}: ${b.title}`, 'cap_created', ctx.user.id, `cap:${id}`);
  return { id, ref };
});
route('PUT', '/api/caps/:id', ctx => {
  A.requirePerm(ctx.user, 'cap_manage'); const c = planRow(ctx.params.id); A.requireScope(ctx.user, c.dept_id); const b = ctx.body;
  const actions = (b.actions || []).filter(a => String(a.text || '').trim()); if (!actions.length || actions.some(a => !a.due)) fail(422, 'Each action needs a due date.');
  const old = db.all('SELECT * FROM action_items WHERE plan_id = ?', c.id);
  db.tx(() => { db.update('action_plans', { id: c.id }, { title: b.title, trigger_text: b.trigger, root_cause: b.rootCause, kpi_id: b.kpiId || null }); db.run('DELETE FROM action_items WHERE plan_id = ?', c.id); actions.forEach((a, i) => db.insert('action_items', { id: db.id('AI'), plan_id: c.id, position: i, text: a.text.trim(), owner_id: a.owner || null, due_date: a.due, done: old.find(o => o.text === a.text.trim())?.done || 0 })); });
  audit.log(ctx, 'Action plan updated', 'CAP', c.ref, b.title, { title: c.title, root_cause: c.root_cause, actions: old.length }, { title: b.title, root_cause: b.rootCause, actions: actions.length });
  return { ok: true };
});
route('POST', '/api/caps/:id/items/:itemId', ctx => {
  A.requirePerm(ctx.user, 'cap_manage'); const c = planRow(ctx.params.id); A.requireScope(ctx.user, c.dept_id);
  const it = db.get('SELECT * FROM action_items WHERE id = ? AND plan_id = ?', ctx.params.itemId, c.id) || fail(404, 'Action not found.');
  const done = ctx.body.done ? 1 : 0; db.update('action_items', { id: it.id }, { done });
  if (c.status === 'Open' && done) db.update('action_plans', { id: c.id }, { status: 'In progress' });
  audit.log(ctx, done ? 'Action marked done' : 'Action reopened', 'CAP', c.ref, it.text, { done: !!it.done }, { done: !!done });
  return { ok: true };
});
route('POST', '/api/caps/:id/update', ctx => {
  const c = planRow(ctx.params.id); A.requireScope(ctx.user, c.dept_id); const b = ctx.body; const text = String(b.text || '').trim();
  if (b.kind === 'review') {
    A.requirePerm(ctx.user, 'approve'); if (!text) fail(422, 'Write a review comment.');
    db.insert('action_updates', { id: db.id('U'), plan_id: c.id, kind: 'review', user_id: ctx.user.id, text, at: db.now() });
    notify([deptOf(c.dept_id).head_user_id], `Mayor's Office reviewed ${c.ref}: ${text}`, 'general', ctx.user.id, `cap:${c.id}`);
    audit.log(ctx, 'Action plan reviewed', 'CAP', c.ref, text); return { ok: true };
  }
  A.requirePerm(ctx.user, 'cap_manage');
  const items = db.all('SELECT done FROM action_items WHERE plan_id = ?', c.id);
  if (b.status === 'Completed' && items.some(i => !i.done)) fail(422, 'Complete every action before closing the plan.');
  if (text) db.insert('action_updates', { id: db.id('U'), plan_id: c.id, kind: 'update', user_id: ctx.user.id, text, at: db.now() });
  if (b.status && b.status !== c.status) db.update('action_plans', { id: c.id }, { status: b.status, completed_at: b.status === 'Completed' ? db.now() : null });
  audit.log(ctx, 'Action plan progress update', 'CAP', c.ref, text || `status ${b.status}`, { status: c.status }, { status: b.status || c.status });
  return { ok: true };
});

/* ---------- Employees ----------
   The department head adds employees. Indicators and their targets are proposed
   by the employee (approved by the department head) or set by the head. Each
   period the employee reports the actual result with evidence; the head
   verifies it, and only verified results count towards the score. */
const sec = require('../lib/security');
const empRow = id => db.get('SELECT * FROM employees WHERE id = ?', id) || fail(404, 'Employee not found.');
const indRow = id => db.get('SELECT * FROM employee_indicators WHERE id = ?', id) || fail(404, 'Indicator not found.');
const isSupervisor = (u, e) => A.can(u, 'emp_eval') && A.scopeIds(u).includes(e.dept_id) && e.user_id !== u.id;
const requireSupervisor = (u, e) => { A.requirePerm(u, 'emp_eval'); A.requireScope(u, e.dept_id); if (e.user_id === u.id) fail(403, 'You cannot approve, verify or evaluate your own record.'); };
function indicatorFields(b, e) {
  const f = { name: String(b.name || '').trim().slice(0, 120), unit: String(b.unit || '').trim().slice(0, 30), direction: b.dir === 'lower' ? 'lower' : 'higher', target: num(b.target, 'Target'), weight: num(b.weight, 'Weight'), kpi_id: b.kpiId || null };
  if (!f.name) fail(422, 'Name the indicator.');
  if (f.target <= 0) fail(422, 'The target must be greater than zero.');
  if (f.weight <= 0 || f.weight > 100) fail(422, 'Weight must be between 1 and 100.');
  if (f.kpi_id) { const k = db.get('SELECT dept_id FROM kpis WHERE id = ?', f.kpi_id); if (!k || k.dept_id !== e.dept_id) fail(422, 'Link the indicator to a KPI of the same department.'); }
  return f;
}
route('POST', '/api/employees', ctx => {
  A.requirePerm(ctx.user, 'emp_eval'); const b = ctx.body; A.requireScope(ctx.user, b.deptId);
  const name = String(b.name || '').trim(), position = String(b.position || '').trim();
  if (!name) fail(422, "Enter the employee's full name.");
  const username = String(b.username || '').trim().toLowerCase();
  let userId = null, temp = null; const id = db.id('EM');
  if (username) {
    if (!/^[a-z0-9._-]{3,40}$/.test(username)) fail(422, 'Usernames use 3–40 letters, numbers, dots, dashes or underscores.');
    if (db.get('SELECT id FROM users WHERE username = ?', username)) fail(409, 'That username is taken.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(String(b.email || '').trim())) fail(422, "Enter the employee's email address. It is needed for the sign-in account.");
  }
  db.tx(() => {
    if (username) {
      temp = sec.tempPassword(); const { hash, salt } = sec.hashPassword(temp); userId = db.id('U');
      db.insert('users', { id: userId, username, name, role: 'staff', dept_id: b.deptId, title: position, phone: String(b.phone || ''), email: String(b.email || '').trim(), active: 1, pref_sms: 1, pref_email: 1, lang: 'en', password_hash: hash, password_salt: salt, failed_attempts: 0, locked_until: null, must_change: 1, last_login: null, created_at: db.now() });
    }
    db.insert('employees', { id, name, position, dept_id: b.deptId, user_id: userId });
  });
  audit.log(ctx, 'Employee added', 'Employee', name, `${deptOf(b.deptId).short_name}: ${position || 'no position'}${username ? ` — account ${username} created` : ''}`, null, { name, position, account: username || null });
  return { id, username: username || null, tempPassword: temp };
});
route('PUT', '/api/employees/:id/profile', ctx => {
  const e = empRow(ctx.params.id); A.requirePerm(ctx.user, 'emp_eval'); A.requireScope(ctx.user, e.dept_id);
  const name = String(ctx.body.name || '').trim(), position = String(ctx.body.position || '').trim(); if (!name) fail(422, "Enter the employee's full name.");
  db.update('employees', { id: e.id }, { name, position });
  audit.log(ctx, 'Employee updated', 'Employee', name, position, { name: e.name, position: e.position }, { name, position });
  return { ok: true };
});
route('POST', '/api/employees/:id/indicators', ctx => {
  const e = empRow(ctx.params.id), own = e.user_id === ctx.user.id;
  if (!own) requireSupervisor(ctx.user, e);
  const f = indicatorFields(ctx.body, e), id = db.id('IN');
  const pos = db.get('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM employee_indicators WHERE employee_id = ?', e.id).p;
  // Proposed by the employee -> needs the department head's approval. Set by the head -> in force at once.
  db.insert('employee_indicators', { id, employee_id: e.id, position: pos, ...f, actual: null, status: own ? 'proposed' : 'approved', proposed_by: ctx.user.id, report_status: 'none' });
  audit.log(ctx, own ? 'Employee indicator proposed' : 'Employee indicator set', 'Employee', e.name, `${f.name}: target ${C.fmt(f.target, f.unit)}, weight ${f.weight}%`, null, f);
  if (own) notify([deptOf(e.dept_id).head_user_id], `${e.name} proposed an individual target "${f.name}" — awaiting your approval.`, 'target_proposed', ctx.user.id, `emp:${e.id}`);
  else if (e.user_id) notify([e.user_id], `A new individual target was set for you: ${f.name} (${C.fmt(f.target, f.unit)}).`, 'target_decided', ctx.user.id, `emp:${e.id}`);
  return { id, status: own ? 'proposed' : 'approved' };
});
route('PUT', '/api/employee-indicators/:id', ctx => {
  const i = indRow(ctx.params.id), e = empRow(i.employee_id), own = e.user_id === ctx.user.id;
  if (own) { if (i.status === 'approved') fail(409, 'This target is approved and locked. Ask your department head to change it.'); }
  else requireSupervisor(ctx.user, e);
  const f = indicatorFields(ctx.body, e);
  db.update('employee_indicators', { id: i.id }, { ...f, status: own ? 'proposed' : 'approved', decision_comment: null });
  audit.log(ctx, own ? 'Employee indicator proposed' : 'Employee indicator changed', 'Employee', e.name, `${f.name}: target ${C.fmt(f.target, f.unit)}, weight ${f.weight}%`, { name: i.name, target: i.target, weight: i.weight }, { name: f.name, target: f.target, weight: f.weight });
  if (own) notify([deptOf(e.dept_id).head_user_id], `${e.name} resubmitted the individual target "${f.name}" — awaiting your approval.`, 'target_proposed', ctx.user.id, `emp:${e.id}`);
  return { ok: true };
});
route('DELETE', '/api/employee-indicators/:id', async ctx => {
  const i = indRow(ctx.params.id), e = empRow(i.employee_id), own = e.user_id === ctx.user.id;
  if (own) { if (i.status === 'approved') fail(409, 'An approved target can only be removed by your department head.'); } else requireSupervisor(ctx.user, e);
  const files = db.all('SELECT * FROM employee_evidence WHERE indicator_id = ?', i.id);
  db.tx(() => { db.run('DELETE FROM employee_evidence WHERE indicator_id = ?', i.id); db.run('DELETE FROM employee_indicators WHERE id = ?', i.id); });
  await dropFiles(files);
  audit.log(ctx, 'Employee indicator removed', 'Employee', e.name, i.name, { name: i.name, target: i.target }, null);
  return { ok: true };
});
route('POST', '/api/employee-indicators/:id/decision', ctx => {
  const i = indRow(ctx.params.id), e = empRow(i.employee_id); requireSupervisor(ctx.user, e);
  if (i.status !== 'proposed') fail(409, 'Only proposed targets can be approved or returned.');
  const comment = String(ctx.body.comment || '').trim();
  if (ctx.body.action === 'approve') db.update('employee_indicators', { id: i.id }, { status: 'approved', decision_comment: comment });
  else if (ctx.body.action === 'return') { if (comment.length < 5) fail(422, 'Give a reason when returning a proposed target.'); db.update('employee_indicators', { id: i.id }, { status: 'returned', decision_comment: comment }); }
  else fail(400, 'Unknown action.');
  const st = ctx.body.action === 'approve' ? 'approved' : 'returned';
  audit.log(ctx, `Employee target ${st}`, 'Employee', e.name, `${i.name}${comment ? ' — ' + comment : ''}`, { status: 'proposed' }, { status: st });
  if (e.user_id) notify([e.user_id], `Your proposed target "${i.name}" was ${st} by ${ctx.user.name}${comment ? ': ' + comment : '.'}`, 'target_decided', ctx.user.id, `emp:${e.id}`);
  return { status: st };
});
route('POST', '/api/employee-indicators/:id/report', async ctx => {
  const i = indRow(ctx.params.id), e = empRow(i.employee_id);
  if (e.user_id !== ctx.user.id) fail(403, 'Only the employee can report their own result. A supervisor records it from the evaluation form.');
  if (i.status !== 'approved') fail(409, 'This target is not approved yet, so results cannot be reported against it.');
  const actual = num(ctx.body.actual, 'Actual'), note = String(ctx.body.note || '').trim();
  if (actual < 0) fail(422, 'The result cannot be negative.');
  const files = Array.isArray(ctx.body.files) ? ctx.body.files : [], keep = new Set(ctx.body.keepEvidence || []);
  for (const f of files) { if (!ALLOWED.test(f.name || '')) fail(422, `${f.name}: this file type is not accepted.`); if (Buffer.byteLength(f.data || '', 'base64') > MAX_FILE) fail(413, `${f.name} is larger than 10 MB.`); }
  const existing = db.all('SELECT * FROM employee_evidence WHERE indicator_id = ?', i.id);
  if (!(existing.filter(x => keep.has(x.id)).length + files.length)) fail(422, 'Attach at least one file as evidence of the result.');
  const t = db.now(), removed = existing.filter(x => !keep.has(x.id));
  const saved = await saveFiles(files, `employees/${i.id}`, 'EE');
  try { db.tx(() => {
    for (const x of removed) db.run('DELETE FROM employee_evidence WHERE id = ?', x.id);
    for (const { id: eid, key, buf, f } of saved) db.insert('employee_evidence', { id: eid, indicator_id: i.id, file_name: String(f.name).slice(0, 200), size: buf.length, mime: f.type || null, storage_path: key, sha256: sha256(buf), uploaded_by: ctx.user.id, uploaded_at: t });
    db.update('employee_indicators', { id: i.id }, { reported_actual: actual, report_note: note, report_status: 'reported', reported_at: t, verified_by: null, verified_at: null, verify_comment: null });
  }); } catch (e) { await dropFiles(saved.map(x => ({ storage_path: x.key }))); throw e; }
  await dropFiles(removed);
  audit.log(ctx, 'Employee result reported', 'Employee', e.name, `${i.name}: ${C.fmt(actual, i.unit)} against ${C.fmt(i.target, i.unit)}`, { actual: i.actual, status: i.report_status }, { reported: actual, status: 'reported' });
  notify([deptOf(e.dept_id).head_user_id], `${e.name} reported a result for "${i.name}" — awaiting your verification.`, 'employee_report', ctx.user.id, `emp:${e.id}`);
  return { status: 'reported' };
});
route('POST', '/api/employee-indicators/:id/verify', ctx => {
  const i = indRow(ctx.params.id), e = empRow(i.employee_id); requireSupervisor(ctx.user, e);
  if (i.report_status !== 'reported') fail(409, 'There is no reported result waiting for verification.');
  const comment = String(ctx.body.comment || '').trim(), t = db.now();
  if (ctx.body.action === 'verify') db.update('employee_indicators', { id: i.id }, { actual: i.reported_actual, report_status: 'verified', verified_by: ctx.user.id, verified_at: t, verify_comment: comment });
  else if (ctx.body.action === 'return') { if (comment.length < 5) fail(422, 'Give a reason when returning a reported result.'); db.update('employee_indicators', { id: i.id }, { report_status: 'returned', verified_by: ctx.user.id, verified_at: t, verify_comment: comment }); }
  else fail(400, 'Unknown action.');
  const st = ctx.body.action === 'verify' ? 'verified' : 'returned';
  audit.log(ctx, `Employee result ${st}`, 'Employee', e.name, `${i.name}: ${C.fmt(i.reported_actual, i.unit)}${comment ? ' — ' + comment : ''}`, { status: 'reported' }, { status: st });
  if (e.user_id) notify([e.user_id], `Your result for "${i.name}" was ${st} by ${ctx.user.name}${comment ? ': ' + comment : '.'}`, 'employee_report', ctx.user.id, `emp:${e.id}`);
  return { status: st };
});
route('GET', '/api/employee-evidence/:id', async ctx => {
  if (!ctx.user) fail(401, 'Sign in to continue.');
  const ev = db.get('SELECT ev.*, e.dept_id, e.user_id AS emp_user FROM employee_evidence ev JOIN employee_indicators i ON i.id = ev.indicator_id JOIN employees e ON e.id = i.employee_id WHERE ev.id = ?', ctx.params.id) || fail(404, 'File not found.');
  if (ev.emp_user !== ctx.user.id) { A.requirePerm(ctx.user, 'emp_eval', 'all_depts'); A.requireScope(ctx.user, ev.dept_id); }
  if (!ev.storage_path) fail(404, 'The file is missing from storage.');
  await sendEvidence(ctx, ev);
});
/* Supervisor form: record results on behalf of an employee without an account
   (saved as verified by the supervisor) and give the period rating. */
route('PUT', '/api/employees/:id', ctx => {
  const e = empRow(ctx.params.id); requireSupervisor(ctx.user, e);
  const before = state.employeeList().find(x => x.id === e.id);
  db.tx(() => {
    for (const x of ctx.body.indicators || []) {
      const i = db.get('SELECT * FROM employee_indicators WHERE id = ? AND employee_id = ?', x.id, e.id); if (!i) continue;
      const ch = {};
      if (x.target != null && x.target !== '') { ch.target = num(x.target, 'Target'); if (ch.target <= 0) fail(422, 'Targets must be greater than zero.'); }
      if (x.actual != null && x.actual !== '') { const a = num(x.actual, 'Actual'); if (a !== i.actual) Object.assign(ch, { actual: a, reported_actual: a, report_status: 'verified', verified_by: ctx.user.id, verified_at: db.now(), verify_comment: 'Recorded by the supervisor' }); }
      if (Object.keys(ch).length) db.update('employee_indicators', { id: i.id }, ch);
    }
    if (ctx.body.rating) { if (!C.RATINGS.includes(ctx.body.rating)) fail(422, 'Choose a valid rating.'); db.insert('employee_evaluations', { id: db.id('V'), employee_id: e.id, period: `Q${Math.floor(Math.max(0, db.getSetting('scoring').currentMonth - 1) / 3) + 1} FY${db.getSetting('scoring').fy}`, rating: ctx.body.rating, comment: ctx.body.comment || '', evaluated_by: ctx.user.id, at: db.now() }); }
  });
  audit.log(ctx, 'Employee evaluation saved', 'Employee', e.name, `${deptOf(e.dept_id).short_name}: ${ctx.body.rating || 'indicators updated'}`, { rating: before.evaluation?.rating || null }, { rating: ctx.body.rating || before.evaluation?.rating || null });
  if (e.user_id) notify([e.user_id], 'Your performance evaluation has been updated.', 'general', ctx.user.id, `emp:${e.id}`);
  return { ok: true };
});
