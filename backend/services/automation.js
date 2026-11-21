/* Scheduled automation: escalation of late reports, retention/archival and
   daily backups. Runs at start-up and every SCHEDULER_MINUTES. */
const db = require('../db');
const config = require('../config');
const audit = require('../lib/audit');
const { notify, usersWith, usersByRole } = require('../lib/notify');
const backup = require('./backup');
const { MONTHS } = require('../../shared/constants');


function runEscalations() {
  const now = Date.now(), W = db.getSetting('workflow'); let n = 0;
  for (const s of db.all("SELECT s.*, k.code, k.dept_id, d.short_name, d.head_user_id FROM submissions s JOIN kpis k ON k.id = s.kpi_id JOIN departments d ON d.id = k.dept_id WHERE s.status IN ('submitted','verified')")) {
    if (s.status === 'submitted' && W.verifyDays && !s.esc_verify && s.submitted_at && now - Date.parse(s.submitted_at) > W.verifyDays * 864e5) {
      const msg = `${s.code} ${MONTHS[s.month]} report has waited more than ${W.verifyDays} days for verification by ${s.short_name}.`;
      // the Mayor is told only about late approvals
      notify([s.head_user_id, ...usersByRole('mayor_admin')], msg, 'escalation', null, `sub:${s.id}`); db.update('submissions', { id: s.id }, { esc_verify: 1 });
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
  const cutCap = new Date(now - R.capDays * D).toISOString();
  const ac = db.run("UPDATE action_plans SET archived_at = ? WHERE archived_at IS NULL AND status = 'Completed' AND COALESCE(completed_at, created_at) < ?", stamp, cutCap).changes;
  const pn = db.run('DELETE FROM notifications WHERE created_at < ?', new Date(now - R.notifDays * D).toISOString()).changes;
  const po = db.run('DELETE FROM outbox WHERE created_at < ?', new Date(now - R.outboxDays * D).toISOString()).changes;
  const pa = db.run('DELETE FROM audit_log WHERE at < ?', new Date(now - R.auditYears * 365 * D).toISOString()).changes;
  db.run('DELETE FROM sessions WHERE expires_at < ?', stamp);
  db.run('DELETE FROM otp_challenges WHERE expires_at < ?', stamp);
  db.setSetting('lastArchival', stamp.slice(0, 10));
  if (ac || pn || po || pa || ctx) audit.log(ctx, ctx ? 'Archival run' : 'Automatic archival run', 'Retention', 'policy', `Archived ${ac} action plan(s); purged ${pn} notification(s), ${po} outbox message(s), ${pa} audit entr${pa === 1 ? 'y' : 'ies'} past retention`);
  return { ac, pn, po, pa };
}

function daily() {
  const today = new Date().toISOString().slice(0, 10);
  if (db.getSetting('lastArchival') !== today) runArchival();
  if (!db.get("SELECT id FROM backups WHERE kind = 'daily' AND substr(created_at,1,10) = ?", today)) backup.create(null, 'daily').catch(e => console.error('[backup] daily backup failed:', e.message));
}

function start() {
  const tick = () => { try { runEscalations(); daily(); } catch (e) { console.error('[scheduler]', e.message); } };
  tick();
  return setInterval(tick, config.schedulerMinutes * 60e3);
}

module.exports = { runEscalations, runArchival, daily, start };
