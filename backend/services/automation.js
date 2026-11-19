/* Scheduled automation: escalation of late work, retention/archival and
   daily backups. Runs at start-up and every SCHEDULER_MINUTES. */
const db = require('../db');
const config = require('../config');
const audit = require('../lib/audit');
const { notify, usersWith, usersByRole } = require('../lib/notify');
const backup = require('./backup');
const { MONTHS } = require('../../shared/constants');

const fmtDate = iso => new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

function runEscalations() {
  const now = Date.now(), E = db.getSetting('escalation'), W = db.getSetting('workflow'); let n = 0;
  const prio = Object.fromEntries(db.all('SELECT * FROM request_priorities').map(p => [p.id, p]));
  for (const r of db.all("SELECT * FROM requests WHERE archived_at IS NULL AND status NOT IN ('Resolved','Closed') AND due_at IS NOT NULL")) {
    const start = Date.parse(r.created_at), due = Date.parse(r.due_at), span = Math.max(1, due - start);
    let lvl = 0; if (now >= start + span * E.l1Pct / 100) lvl = 1; if (now >= due) lvl = 2; if (now >= due + E.l3Hours * 3600e3) lvl = 3;
    for (let L = r.escalation_level + 1; L <= lvl; L++) {
      const head = r.dept_id ? db.get('SELECT head_user_id h FROM departments WHERE id = ?', r.dept_id)?.h : null;
      const to = L === 1 ? [head, r.assigned_to, ...(r.dept_id ? [] : usersWith('desk_intake'))] : L === 2 ? usersWith('desk_intake') : usersByRole('mayor');
      const msg = L === 1 ? `${r.ref} has used ${E.l1Pct}% of its ${(prio[r.priority_id]?.name || '').toLowerCase()}-priority resolution time (due ${fmtDate(r.due_at)}).`
        : L === 2 ? `${r.ref} missed its deadline of ${fmtDate(r.due_at)} and is escalated to the Mayor's Office.`
          : `${r.ref} is still unresolved ${E.l3Hours} hours after its deadline and is escalated to the Mayor.`;
      notify(to, msg, 'escalation', null, `req:${r.id}`);
      db.insert('request_history', { id: db.id('Q'), request_id: r.id, user_id: null, text: `Escalation level ${L}: ${msg}`, at: db.now() });
      audit.log(null, `Escalated (level ${L})`, 'Request', r.ref, msg, { escalation: L - 1 }, { escalation: L });
      n++;
    }
    if (lvl > r.escalation_level) db.update('requests', { id: r.id }, { escalation_level: lvl });
  }
  for (const s of db.all("SELECT s.*, k.code, k.dept_id, d.short_name, d.head_user_id FROM submissions s JOIN kpis k ON k.id = s.kpi_id JOIN departments d ON d.id = k.dept_id WHERE s.status IN ('submitted','verified')")) {
    if (s.status === 'submitted' && W.verifyDays && !s.esc_verify && s.submitted_at && now - Date.parse(s.submitted_at) > W.verifyDays * 864e5) {
      const msg = `${s.code} ${MONTHS[s.month]} report has waited more than ${W.verifyDays} days for verification by ${s.short_name}.`;
      notify([s.head_user_id, ...usersByRole('mayor_admin')], msg, 'escalation', null, `sub:${s.id}`); // the Mayor is told only about late approvals db.update('submissions', { id: s.id }, { esc_verify: 1 });
      audit.log(null, 'Escalated (verification overdue)', 'Submission', s.id, msg); n++;
    }
    if (s.status === 'verified' && W.approveDays && !s.esc_approve && s.verified_at && now - Date.parse(s.verified_at) > W.approveDays * 864e5) {
      const msg = `${s.code} ${MONTHS[s.month]} (${s.short_name}) has waited more than ${W.approveDays} days for approval.`;
      notify([...usersWith('approve'), ...usersByRole('mayor')], msg, 'escalation', null, `sub:${s.id}`); db.update('submissions', { id: s.id }, { esc_approve: 1 });
      audit.log(null, 'Escalated (approval overdue)', 'Submission', s.id, msg); n++;
    }
  }
  return n;
}

function runArchival(ctx = null) {
  const R = db.getSetting('retention'), now = Date.now(), D = 864e5, stamp = db.now();
  const cutReq = new Date(now - R.requestDays * D).toISOString(), cutCap = new Date(now - R.capDays * D).toISOString();
  const ar = db.run("UPDATE requests SET archived_at = ? WHERE archived_at IS NULL AND status IN ('Resolved','Closed') AND COALESCE(resolved_at, created_at) < ?", stamp, cutReq).changes;
  const ac = db.run("UPDATE action_plans SET archived_at = ? WHERE archived_at IS NULL AND status = 'Completed' AND COALESCE(completed_at, created_at) < ?", stamp, cutCap).changes;
  const pn = db.run('DELETE FROM notifications WHERE created_at < ?', new Date(now - R.notifDays * D).toISOString()).changes;
  const po = db.run('DELETE FROM outbox WHERE created_at < ?', new Date(now - R.outboxDays * D).toISOString()).changes;
  const pa = db.run('DELETE FROM audit_log WHERE at < ?', new Date(now - R.auditYears * 365 * D).toISOString()).changes;
  db.run('DELETE FROM sessions WHERE expires_at < ?', stamp);
  db.run('DELETE FROM otp_challenges WHERE expires_at < ?', stamp);
  db.setSetting('lastArchival', stamp.slice(0, 10));
  if (ar || ac || pn || po || pa || ctx) audit.log(ctx, ctx ? 'Archival run' : 'Automatic archival run', 'Retention', 'policy', `Archived ${ar} request(s) and ${ac} action plan(s); purged ${pn} notification(s), ${po} outbox message(s), ${pa} audit entr${pa === 1 ? 'y' : 'ies'} past retention`);
  return { ar, ac, pn, po, pa };
}

function daily() {
  const today = new Date().toISOString().slice(0, 10);
  if (db.getSetting('lastArchival') !== today) runArchival();
  if (!db.get("SELECT id FROM backups WHERE kind = 'daily' AND substr(created_at,1,10) = ?", today)) backup.create(null, 'daily');
}

function start() {
  const tick = () => { try { runEscalations(); daily(); } catch (e) { console.error('[scheduler]', e.message); } };
  tick();
  return setInterval(tick, config.schedulerMinutes * 60e3);
}

module.exports = { runEscalations, runArchival, daily, start };
