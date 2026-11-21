/* Shared constants and formatting helpers.
   Loaded by the backend (require) and by the browser (<script>, exposes window.SHARED). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SHARED = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const MONTHS = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];

  const ROLES = {
    super_admin: 'Super Administrator',
    mayor: 'Mayor',
    mayor_admin: "Mayor's Office Administrator",
    dept_head: 'Department Head',
    staff: 'Department Staff',
    kpi_officer: 'KPI Officer',
    auditor: 'Auditor / Reviewer',
  };

  const ROLE_DESC = {
    super_admin: 'Full system configuration and management',
    mayor: 'Executive overview and decision monitoring',
    mayor_admin: 'Daily coordination for the Mayor and final approval of performance data',
    dept_head: 'Department activities, KPIs, verification and assigned tasks',
    staff: 'Own individual targets, results and evaluation',
    kpi_officer: 'Performance submissions and reporting',
    auditor: 'Read-only access to authorised reports and audit records',
  };

  const PERMS = [
    ['dash', 'View performance dashboards & scorecards'],
    ['all_depts', 'See all departments (city-wide scope)'],
    ['kpi_manage', 'Edit the KPI library and strategic objectives directly (administration)'],
    ['target_propose', 'Propose KPIs and targets for own department (sent for approval)'],
    ['target_approve', "Approve or return proposed KPIs and targets (Mayor's Office)"],
    ['submit', 'Submit performance data with evidence'],
    ['verify', 'Verify submissions (department head)'],
    ['approve', "Approve submissions (Mayor's Office)"],
    ['cap_manage', 'Create & update corrective action plans'],
    ['emp_eval', 'Evaluate employees'],
    ['reports', 'View & export reports'],
    ['audit', 'View audit trail'],
    ['users', 'Manage users, roles & permissions'],
    ['config', 'System configuration'],
    ['export', 'Export authorised records (CSV)'],
    ['ai', 'Use the AI executive assistant'],
    ['chat', 'Send and receive internal messages'],
  ];

  const DEFAULT_PERMS = {
    super_admin: ['dash', 'all_depts', 'kpi_manage', 'submit', 'verify', 'approve', 'cap_manage', 'emp_eval', 'reports', 'audit', 'users', 'config', 'export', 'ai', 'chat'],
    mayor: ['dash', 'all_depts', 'approve', 'target_approve', 'reports', 'audit', 'export', 'ai', 'chat'],
    mayor_admin: ['dash', 'all_depts', 'approve', 'target_approve', 'reports', 'export', 'ai', 'chat'],
    dept_head: ['dash', 'verify', 'target_propose', 'cap_manage', 'emp_eval', 'reports', 'export', 'ai', 'chat'],
    staff: ['chat'],
    kpi_officer: ['dash', 'submit', 'target_propose', 'reports', 'export', 'ai', 'chat'],
    auditor: ['dash', 'all_depts', 'reports', 'audit', 'export', 'ai', 'chat'],
  };

  const EVENTS = [
    ['submission_submitted', 'Report submitted for verification'],
    ['submission_verified', 'Report verified, awaiting approval'],
    ['submission_approved', 'Report approved'],
    ['submission_returned', 'Report returned for correction'],
    ['kpi_alert', 'Performance alert (below threshold)'],
    ['cap_created', 'Corrective action plan created'],
    ['target_proposed', 'Targets proposed, awaiting approval'],
    ['target_decided', 'Proposed targets approved or returned'],
    ['employee_report', 'Employee result reported or verified'],
    ['escalation', 'Escalation'],
    ['otp', 'Sign-in verification code'],
    ['general', 'General'],
  ];

  const SCOPES = [
    ['perf:read', 'Read KPIs, scorecards and alerts'],
    ['perf:submit', 'Submit performance data'],
    ['audit:read', 'Read the audit trail'],
  ];

  const RATINGS = ['Outstanding', 'Very good', 'Good', 'Needs improvement', 'Unsatisfactory'];

  const sum = a => a.reduce((x, y) => x + y, 0);
  const avg = a => (a.length ? sum(a) / a.length : null);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const decimals = unit => (['ETB M', 'km', '%', 'days'].includes(unit) ? 1 : 0);
  const pct = v => (v == null || isNaN(v) ? '—' : v.toFixed(1) + '%');
  function fmt(v, unit) {
    if (v == null || isNaN(v)) return '—';
    const d = decimals(unit);
    const n = Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
    if (unit === '%') return n + '%';
    if (unit === 'ETB M') return 'ETB ' + n + 'M';
    if (unit === 'days') return n + ' days';
    return n;
  }
  const roundU = (v, unit) => { const d = decimals(unit); return Math.round(v * 10 ** d) / 10 ** d; };

  function auditCategory(action) {
    const a = (action || '').toLowerCase();
    if (/sign|login|session|password|verification code|locked|unlock|mfa/.test(a)) return 'Authentication';
    if (/approv|verif|return/.test(a)) return 'Approval';
    if (/assign|rout|escalat/.test(a)) return 'Assignment';
    if (/status|progress|marked|reopen|resolv|action done/.test(a)) return 'Status change';
    if (/export|download|backup|restore|archiv|import|purge|upload/.test(a)) return 'Data management';
    if (/setting|permission|config|policy|rule|workflow|categor|priorit|language|branding|logo/.test(a)) return 'Configuration';
    if (/^ai /.test(a)) return 'AI assistant';
    if (/api/.test(a)) return 'API';
    if (/creat|defined|registered|submitted|generated|added|initialised/.test(a)) return 'Create';
    return 'Update';
  }
  const AUDIT_CATEGORIES = ['Authentication', 'Create', 'Update', 'Approval', 'Assignment', 'Status change', 'Configuration', 'Data management', 'API', 'AI assistant'];

  return { MONTHS, ROLES, ROLE_DESC, PERMS, DEFAULT_PERMS, EVENTS, SCOPES, RATINGS, AUDIT_CATEGORIES, sum, avg, clamp, decimals, pct, fmt, roundU, auditCategory };
});
