/* Seeds a new database with the organisation structure, FY 2026/27 KPIs and
   targets, sample (illustrative) performance data and demo accounts.
   Usage:  npm run seed            (only if the database is empty)
           npm run seed -- --reset (deletes the database first) */
const fs = require('node:fs');
const config = require('../backend/config');
const db = require('../backend/db');
const { hashPassword } = require('../backend/lib/security');
const C = require('../shared/constants');

const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'Shaggar@2026';

function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function seed({ reset = false } = {}) {
  if (reset && config.databaseUrl) { db.open(); db.dropAll(); db.close(); console.log('Emptied the PostgreSQL database (DATABASE_URL).'); }
  else if (reset) { db.close(); for (const f of [config.dbFile, config.dbFile + '-wal', config.dbFile + '-shm']) if (fs.existsSync(f)) fs.unlinkSync(f); }
  db.open();
  if (db.get('SELECT COUNT(*) AS n FROM users').n > 0) { console.log('Database already has data — nothing seeded. Use --reset to start over.'); return false; }
  const R = rng(20261113);
  const now = Date.now(), H = 3600e3, D = 24 * H;
  const iso = d => new Date(d).toISOString();
  const T0 = '2026-07-01T05:00:00.000Z';

  db.tx(() => {
    /* ---------- settings ---------- */
    db.setSetting('branding', { orgName: 'Shaggar City Administration', office: 'Office of the Mayor', systemName: 'KPI & Performance Management System', shortName: 'Shaggar PMS', logo: null });
    db.setSetting('scoring', { fy: '2026/27', fyNote: '2019 EFY', fyStart: 2026, currentMonth: 4, deadlineDay: 10, bands: { good: 90, warning: 75, serious: 60 }, cap: 120, varianceNote: 90 });
    db.setSetting('security', { sessionMin: 30, maxAttempts: 5, lockMin: 15, pwMin: 10, pwComplex: true, mfaRoles: ['super_admin', 'mayor', 'mayor_admin', 'dept_head', 'auditor'], iterations: config.passwordIterations });
    db.setSetting('workflow', { verifyRequired: true, approveRequired: true, sod: true, evidenceDefault: true, verifyDays: 3, approveDays: 3 });
    db.setSetting('notify', { sms: { provider: 'Ethio telecom bulk SMS', sender: 'SHAGGAR', approved: false }, email: { provider: 'City mail server', from: 'no-reply@shaggarcity.example', approved: false }, events: Object.fromEntries(C.EVENTS.map(([k]) => [k, { sms: ['kpi_alert', 'escalation', 'otp'].includes(k), email: k !== 'otp' }])) });
    db.setSetting('retention', { auditYears: 7, notifDays: 90, outboxDays: 30, capDays: 90, backupKeep: 14 });

    /* ---------- departments & objectives ---------- */
    const depts = [
      ['REV', 'Revenue Authority', 'Revenue', 'U04'], ['LAND', 'Land Administration & Management Office', 'Land', 'U05'],
      ['JOB', 'Job Creation & Enterprise Development Office', 'Job Creation', 'U06'], ['TRADE', 'Trade & Market Development Office', 'Trade', 'U07'],
      ['INFRA', 'Urban Infrastructure & Construction Office', 'Infrastructure', 'U08'], ['HEALTH', 'Health Office', 'Health', 'U09'],
    ];
    depts.forEach(([id, name, short, head], i) => db.insert('departments', { id, name, short_name: short, head_user_id: head, active: 1, created_at: iso(Date.parse(T0) + i * 1000) }));
    [['SO1', 'Increase own-source revenue and fiscal sustainability'], ['SO2', 'Deliver fast, transparent and fair public services'], ['SO3', 'Expand employment and enterprise growth'], ['SO4', 'Build quality, well-managed urban infrastructure'], ['SO5', 'Improve community health outcomes']].forEach(([id, title]) => db.insert('objectives', { id, title }));

    /* ---------- users ---------- */
    const users = [
      ['U01', 'tolera.g', 'Tolera Gemechu', 'super_admin', null, 'ICT Directorate'],
      ['U02', 'mayor', 'Mayor (demo account)', 'mayor', null, 'City Mayor'],
      ['U03', 'chaltu.b', 'Chaltu Bekele', 'mayor_admin', null, "Head, Mayor's Office Administration"],
      ['U04', 'gemechis.t', 'Gemechis Tadesse', 'dept_head', 'REV', 'Director General, Revenue'],
      ['U05', 'lalise.f', 'Lalise Fikadu', 'dept_head', 'LAND', 'Head, Land Administration'],
      ['U06', 'bontu.a', 'Bontu Abdisa', 'dept_head', 'JOB', 'Head, Job Creation'],
      ['U07', 'dawit.h', 'Dawit Hailu', 'dept_head', 'TRADE', 'Head, Trade & Market'],
      ['U08', 'kedir.m', 'Kedir Mohammed', 'dept_head', 'INFRA', 'Head, Infrastructure'],
      ['U09', 'hawi.t', 'Hawi Tesfaye', 'dept_head', 'HEALTH', 'Head, Health Office'],
      ['U10', 'meron.a', 'Meron Alemu', 'kpi_officer', null, 'Planning, M&E Directorate (city-wide)'],
      ['U11', 'ifa.g', 'Ifa Gudeta', 'kpi_officer', 'REV', 'M&E Officer, Revenue'],
      ['U12', 'sena.o', 'Sena Olana', 'staff', 'LAND', 'Land Service Officer'],
      ['U13', 'robsan.d', 'Robsan Dhaba', 'staff', 'REV', 'Revenue Officer'],
      ['U14', 'abdi.w', 'Abdi Wako', 'auditor', null, 'Internal Audit'],
    ];
    users.forEach(([id, username, name, role, dept, title], i) => {
      const { hash, salt } = hashPassword(DEMO_PASSWORD);
      db.insert('users', { id, username, name, role, dept_id: dept, title, phone: `+251 911 0${10 + i} ${String(100 + i * 7).slice(-3)}`, email: `${username}@shaggarcity.example`, pref_sms: 1, pref_email: 1, lang: 'en', password_hash: hash, password_salt: salt, failed_attempts: 0, locked_until: null, must_change: 0, active: 1, last_login: null, created_at: T0 });
    });
    for (const [role, perms] of Object.entries(C.DEFAULT_PERMS)) for (const p of perms) db.insert('role_permissions', { role, permission: p });

    /* ---------- KPIs, targets, last year ---------- */
    const K = [
      ['REV', 'REV-01', 'Revenue collection', 'SO1', 'ETB M', 'higher', 'monthly', 'sum', 50, 1200, 'Total own-source revenue (taxes, fees, service charges) collected and deposited to the city treasury account.', 'Σ revenue deposited in the period (ETB millions)', 'Treasury bank statements; revenue system report', 980],
      ['REV', 'REV-02', 'New taxpayers registered', 'SO1', 'taxpayers', 'higher', 'monthly', 'sum', 25, 2400, 'Number of new taxpayers registered with a valid TIN in the city taxpayer registry.', 'Count of new TIN registrations in the period', 'Taxpayer registry extract', 2050],
      ['REV', 'REV-03', 'Tax arrears recovered', 'SO1', 'ETB M', 'higher', 'quarterly', 'sum', 25, 120, 'Value of overdue tax liabilities collected from delinquent taxpayers.', 'Σ arrears collected in the quarter (ETB millions)', 'Arrears ledger; enforcement case files', 88],
      ['LAND', 'LAND-01', 'Land service requests delivered', 'SO2', 'requests', 'higher', 'monthly', 'sum', 40, 6000, 'Land-related service requests completed and handed over to the customer.', 'Count of requests closed as "delivered" in the land information system', 'Land information system report; customer sign-off register', 5100],
      ['LAND', 'LAND-02', 'Title deeds issued', 'SO2', 'deeds', 'higher', 'monthly', 'sum', 30, 1800, 'Certificates of land holding / title deeds printed, signed and issued.', 'Count of deeds issued in the period', 'Deed issuance register', 1500],
      ['LAND', 'LAND-03', 'Average service turnaround time', 'SO2', 'days', 'lower', 'monthly', 'avg', 30, 10, 'Average working days between a complete land service application and delivery. Lower is better.', 'Σ(days from application to delivery) ÷ number of requests delivered', 'Land information system timestamps', 14],
      ['JOB', 'JOB-01', 'Employment created', 'SO3', 'jobs', 'higher', 'monthly', 'sum', 50, 24000, 'Permanent and temporary jobs created through city programmes, verified by follow-up.', 'Σ verified jobs created (permanent + temporary) in the period', 'Beneficiary database; employer confirmation letters', 19800],
      ['JOB', 'JOB-02', 'MSEs established', 'SO3', 'enterprises', 'higher', 'monthly', 'sum', 25, 600, 'Micro and small enterprises newly organised, licensed and operational.', 'Count of MSEs registered and licensed in the period', 'MSE registry; trade licences', 470],
      ['JOB', 'JOB-03', 'Youth & women trained', 'SO3', 'persons', 'higher', 'monthly', 'sum', 25, 3600, 'Youth and women completing entrepreneurship or technical skills training.', 'Count of trainees completing training (attendance ≥ 80%)', 'Training attendance sheets; certificates', 3100],
      ['TRADE', 'TRADE-01', 'Business licences processed', 'SO2', 'licences', 'higher', 'monthly', 'sum', 45, 12000, 'New, renewed and amended business licences processed to completion.', 'Count of licence applications completed in the period', 'e-Trade licensing system report', 11300],
      ['TRADE', 'TRADE-02', 'Licences renewed on time', 'SO2', '%', 'higher', 'monthly', 'avg', 30, 95, 'Share of business licences renewed before their expiry date.', 'Licences renewed before expiry ÷ licences due for renewal × 100', 'e-Trade renewal report', 88],
      ['TRADE', 'TRADE-03', 'Market inspections conducted', 'SO2', 'inspections', 'higher', 'monthly', 'sum', 25, 960, 'Inspections of markets and businesses for price, weights & measures and quality compliance.', 'Count of completed inspection reports', 'Inspection reports', 870],
      ['INFRA', 'INFRA-01', 'Roads completed (asphalt & gravel)', 'SO4', 'km', 'higher', 'monthly', 'sum', 40, 36, 'Kilometres of new road completed and accepted by the supervising engineer.', 'Σ km of road accepted at completion in the period', 'Supervision certificates; site acceptance minutes', 24],
      ['INFRA', 'INFRA-02', 'Street lights installed', 'SO4', 'units', 'higher', 'monthly', 'sum', 30, 2400, 'Street-light units installed and energised.', 'Count of energised street-light units', 'Contractor completion reports; utility energisation records', 1700],
      ['INFRA', 'INFRA-03', 'Capital budget utilisation', 'SO4', '%', 'higher', 'quarterly', 'avg', 30, 90, 'Share of the planned capital budget for the quarter that was spent on approved projects.', 'Capital expenditure ÷ planned capital budget for the quarter × 100', 'IFMIS expenditure report', 71],
      ['HEALTH', 'HEALTH-01', 'Child immunisation coverage (Penta-3)', 'SO5', '%', 'higher', 'monthly', 'avg', 40, 95, 'Share of surviving infants who received the third dose of pentavalent vaccine.', 'Children receiving Penta-3 ÷ target infant population × 100', 'DHIS2 / HMIS report', 90],
      ['HEALTH', 'HEALTH-02', 'Antenatal care (4+ visits)', 'SO5', 'mothers', 'higher', 'monthly', 'sum', 30, 14400, 'Pregnant women completing at least four antenatal care visits.', 'Count of mothers completing ANC4 in the period', 'DHIS2 / HMIS report', 12800],
      ['HEALTH', 'HEALTH-03', 'Facility quality inspections', 'SO5', 'inspections', 'higher', 'monthly', 'sum', 30, 240, 'Quality and safety inspections of public and private health facilities.', 'Count of completed inspection checklists', 'Inspection checklists', 210],
    ];
    const base = { REV: .86, LAND: .86, JOB: .81, TRADE: .95, INFRA: .72, HEALTH: .93 };
    const trend = { REV: .004, LAND: -.003, JOB: -.006, TRADE: .003, INFRA: -.025, HEALTH: .002 };
    const officer = d => (d === 'REV' ? 'U11' : 'U10');
    const head = d => depts.find(x => x[0] === d)[3];
    const approver = i => (i % 3 === 0 ? 'U02' : 'U03');
    const audit = (at, userId, action, entity, entityId, details) => db.insert('audit_log', { id: db.id('A'), at, user_id: userId, role: userId ? users.find(u => u[0] === userId)[3] : 'system', action, category: C.auditCategory(action), entity, entity_id: entityId, details, before_json: null, after_json: null, ip: null });

    K.forEach((r, i) => {
      const [deptId, code, name, obj, unit, dir, freq, agg, weight, annual, def, formula, source, baseline] = r;
      const id = 'K' + (i + 1);
      db.insert('kpis', { id, code, dept_id: deptId, objective_id: obj, name, definition: def, formula, source, unit, direction: dir, frequency: freq, aggregation: agg, weight, annual_target: annual, baseline, evidence_required: 1, owner_id: officer(deptId), active: 1, created_at: T0, updated_at: T0, targets_approved_at: T0, targets_approved_by: 'U03' });
      const dueM = [...Array(12).keys()].filter(m => freq === 'monthly' || m % 3 === 2);
      const tgt = m => (dueM.includes(m) ? (agg === 'sum' ? C.roundU(annual / dueM.length, unit) : annual) : null);
      for (let m = 0; m < 12; m++) db.insert('kpi_targets', { kpi_id: id, month: m, target: tgt(m) });
      for (let q = 0; q < 4; q++) {
        const t = agg === 'sum' ? C.roundU(annual * 0.92 / 4, unit) : annual;
        const f = base[deptId] - 0.04 + (R() - 0.5) * 0.12;
        let a = dir === 'higher' ? t * f : t / f; if (unit === '%') a = Math.min(100, a);
        db.insert('kpi_prev_year', { kpi_id: id, quarter: q, target: t, actual: C.roundU(a, unit) });
      }
      for (let m = 0; m < 4; m++) {
        if (!dueM.includes(m)) continue;
        const t = tgt(m);
        const f = base[deptId] + (R() - 0.5) * 0.12 + trend[deptId] * m * 3;
        let a = dir === 'higher' ? t * f : t / f; if (unit === '%') a = Math.min(100, a); a = C.roundU(a, unit);
        let status = 'approved';
        if (m === 3) { const x = R(); status = x < 0.45 ? 'approved' : x < 0.65 ? 'verified' : x < 0.85 ? 'submitted' : x < 0.93 ? 'returned' : 'missing'; }
        if (code === 'INFRA-01' && m === 3) status = 'missing';
        if (code === 'LAND-02' && m === 3) status = 'returned';
        if (status === 'missing') continue;
        const sid = `S${i + 1}_${m}`;
        const sub0 = new Date(2026, 6 + m + 1, 3 + Math.floor(R() * 5), 9 + Math.floor(R() * 6), Math.floor(R() * 60));
        const v = new Date(sub0.getTime() + D * (1 + Math.floor(R() * 2)));
        const ap = new Date(v.getTime() + D * (1 + Math.floor(R() * 3)));
        const row = { id: sid, kpi_id: id, month: m, actual: a, note: a / t < 0.9 && dir === 'higher' ? 'Shortfall mainly due to delayed inputs and staff shortage; recovery plan under way.' : 'Achieved as planned.', status, submitted_by: officer(deptId), submitted_at: sub0.toISOString(), verified_by: null, verified_at: null, approved_by: null, approved_at: null, esc_verify: 0, esc_approve: 0 };
        const hist = (by, action, at, comment = '') => { db.insert('submission_history', { id: db.id('H'), submission_id: sid, user_id: by, action, comment, at }); audit(at, by, 'Submission ' + action, 'Submission', sid, `${code} · ${C.MONTHS[m]} · actual ${C.fmt(a, unit)}${comment ? ' — ' + comment : ''}`); };
        if (['verified', 'approved'].includes(status)) { row.verified_by = head(deptId); row.verified_at = v.toISOString(); }
        if (status === 'approved') { row.approved_by = approver(i + m); row.approved_at = ap.toISOString(); }
        db.insert('submissions', row);
        hist(row.submitted_by, 'submitted', row.submitted_at);
        if (row.verified_by) hist(row.verified_by, 'verified', row.verified_at, 'Checked against source records.');
        if (row.approved_by) hist(row.approved_by, 'approved', row.approved_at);
        if (status === 'returned') hist(head(deptId), 'returned', v.toISOString(), code === 'LAND-02' ? 'Figure does not match the deed issuance register. Please reconcile and attach the signed register.' : 'Evidence does not support the reported figure. Please attach the source extract and correct.');
        db.insert('submission_evidence', { id: db.id('E'), submission_id: sid, file_name: `${code}_${C.MONTHS[m]}_report.pdf`, size: 180000 + Math.floor(R() * 900000), mime: 'application/pdf', storage_path: null, sha256: null, uploaded_by: row.submitted_by, uploaded_at: row.submitted_at });
      }
    });

    /* ---------- employees ---------- */
    const EMP = { REV: [['Robsan Dhaba', 'Revenue Officer', 'U13'], ['Kalkidan Mesfin', 'Tax Auditor'], ['Yosef Getachew', 'Collections Officer']], LAND: [['Sena Olana', 'Land Service Officer', 'U12'], ['Tigist Worku', 'Surveyor'], ['Feyisa Lemma', 'Registry Clerk']], JOB: [['Ebise Tolosa', 'Enterprise Development Officer'], ['Nahom Bekele', 'Employment Officer'], ['Gadise Kebede', 'Training Coordinator']], TRADE: [['Liya Mulugeta', 'Licensing Officer'], ['Biruk Assefa', 'Market Inspector'], ['Obsa Merga', 'Licensing Officer']], INFRA: [['Henok Girma', 'Site Engineer'], ['Desta Bulti', 'Electrical Supervisor'], ['Rahel Tadesse', 'Project Planner']], HEALTH: [['Mekdes Ayana', 'Health Extension Supervisor'], ['Jiregna Fufa', 'EPI Focal Person'], ['Selam Haile', 'Quality Officer']] };
    const IND = { REV: [['Revenue collected', 'ETB M', 'higher', 8], ['Taxpayer files audited', 'files', 'higher', 40], ['Complaints resolved within SLA', '%', 'higher', 95]], LAND: [['Applications processed', 'files', 'higher', 120], ['Average handling time', 'days', 'lower', 8], ['Customer satisfaction', '%', 'higher', 90]], JOB: [['Jobs facilitated', 'jobs', 'higher', 150], ['MSEs supported', 'enterprises', 'higher', 10], ['Follow-up visits', 'visits', 'higher', 40]], TRADE: [['Licences processed', 'licences', 'higher', 260], ['Inspections done', 'inspections', 'higher', 30], ['Processed within SLA', '%', 'higher', 95]], INFRA: [['Supervision reports filed', 'reports', 'higher', 20], ['Defects closed', 'defects', 'higher', 25], ['Milestones on schedule', '%', 'higher', 90]], HEALTH: [['Households visited', 'households', 'higher', 300], ['Children vaccinated', 'children', 'higher', 120], ['Reports submitted on time', '%', 'higher', 100]] };
    for (const [d, list] of Object.entries(EMP)) list.forEach(([name, position, userId], j) => {
      const eid = `E${d}${j}`;
      db.insert('employees', { id: eid, name, position, dept_id: d, user_id: userId || null });
      IND[d].forEach(([n, u, dir, t], x) => { const f = base[d] + (R() - 0.4) * 0.25; let a = dir === 'higher' ? t * f : t / f; if (u === '%') a = Math.min(100, a); db.insert('employee_indicators', { id: `${eid}_${x}`, employee_id: eid, position: x, name: n, unit: u, direction: dir, target: t, actual: C.roundU(a, u), weight: x === 0 ? 40 : 30, kpi_id: x === 0 ? db.get('SELECT id FROM kpis WHERE dept_id = ? ORDER BY code', d).id : null, status: 'approved', report_status: 'verified', reported_actual: C.roundU(a, u), verified_by: head(d), verified_at: '2026-10-10T09:00:00.000Z' }); });
      if (j === 0 && d !== 'INFRA') db.insert('employee_evaluations', { id: db.id('V'), employee_id: eid, period: 'Q1 FY2026/27', rating: 'Very good', comment: 'Consistently meets targets; strong customer focus.', evaluated_by: head(d), at: '2026-10-12T09:00:00.000Z' });
    });

    /* ---------- corrective action plans ---------- */
    db.insert('action_plans', { id: 'CAP1', ref: 'CAP-2026-001', dept_id: 'INFRA', kpi_id: 'K13', title: 'Recover road construction backlog', trigger_text: 'INFRA-01 below 75% for Q1 and declining trend.', root_cause: 'Late mobilisation of two contractors; asphalt supply interruptions; rainy season.', status: 'In progress', created_by: 'U08', created_at: '2026-10-08T08:00:00.000Z', completed_at: null, archived_at: null });
    [['Issue warning letters and revised work schedules to the two lagging contractors', '2026-10-20', 1], ['Secure framework agreement for asphalt supply', '2026-11-10', 0], ['Introduce double-shift work on the main corridor section', '2026-12-15', 0]].forEach(([text, due, done], i) => db.insert('action_items', { id: `CAP1_${i}`, plan_id: 'CAP1', position: i, text, owner_id: 'U08', due_date: due, done }));
    db.insert('action_updates', { id: db.id('U'), plan_id: 'CAP1', kind: 'update', user_id: 'U08', text: 'Warning letters issued; contractors submitted recovery schedules.', at: '2026-10-21T10:00:00.000Z' });
    db.insert('action_updates', { id: db.id('U'), plan_id: 'CAP1', kind: 'review', user_id: 'U02', text: "Report progress fortnightly to the Mayor's Office.", at: '2026-10-23T10:00:00.000Z' });
    db.insert('action_plans', { id: 'CAP2', ref: 'CAP-2026-002', dept_id: 'JOB', kpi_id: 'K7', title: 'Accelerate employment creation', trigger_text: 'JOB-01 below 85% in Aug and Sep.', root_cause: 'Weak linkage with industrial park employers; slow verification of temporary jobs.', status: 'In progress', created_by: 'U06', created_at: '2026-10-14T08:00:00.000Z', completed_at: null, archived_at: null });
    [['Sign placement MoUs with 5 industrial park employers', '2026-11-30', 0], ['Deploy mobile verification teams to woredas', '2026-11-15', 1]].forEach(([text, due, done], i) => db.insert('action_items', { id: `CAP2_${i}`, plan_id: 'CAP2', position: i, text, owner_id: 'U06', due_date: due, done }));

    db.insert('notifications', { id: db.id('N'), user_id: 'U05', text: 'LAND-02 Oct submission was returned for correction.', event: 'submission_returned', is_read: 0, created_at: '2026-11-09T08:00:00.000Z' });
    db.insert('notifications', { id: db.id('N'), user_id: 'U02', text: 'Infrastructure scored below 75% for Q1 — corrective action plan CAP-2026-001 opened.', event: 'kpi_alert', is_read: 0, created_at: '2026-10-08T08:00:00.000Z' });
    db.insert('webhooks', { id: 'W1', url: 'https://planning.example/hooks/shaggar', events: 'submission_approved,kpi_alert', secret: require('node:crypto').randomBytes(16).toString('hex'), active: 0, created_at: T0 });
    [['Mayor', 'Find the lowest-performing department and open its action plan'], ['KPI Officer', 'Submit a monthly report with evidence on a phone'], ['Department Head', 'Verify a report and return one with a comment'], ['Citizen', 'File a complaint in Afaan Oromoo and track it'], ['Auditor', 'Export all approvals for October']]
      .forEach(([role, task], i) => db.insert('qa_sessions', { id: 'Q' + (i + 1), role, task, status: 'Planned', findings: '' }));
    audit(T0, 'U01', 'System initialised', 'System', '-', `FY 2026/27 plan loaded: ${K.length} KPIs across ${depts.length} departments; annual targets set.`);
  });
  console.log(`Seeded the ${db.engine() === 'postgres' ? 'PostgreSQL database (DATABASE_URL)' : `SQLite database at ${config.dbFile}`}\nDemo password for all accounts: ${DEMO_PASSWORD}`);
  return true;
}

if (require.main === module) { seed({ reset: process.argv.includes('--reset') }); db.close(); }
module.exports = { seed, DEMO_PASSWORD };
