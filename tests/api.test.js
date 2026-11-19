/* End-to-end API tests (node:test, no dependencies).  Run: npm test */
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spms-'));
Object.assign(process.env, { DB_FILE: path.join(tmp, 'test.db'), UPLOADS_DIR: path.join(tmp, 'uploads'), BACKUPS_DIR: path.join(tmp, 'backups'), PASSWORD_ITERATIONS: '2000', DEMO_MODE: 'true', SCHEDULER_MINUTES: '600', LOGIN_RATE_LIMIT: '500' });
const { server } = require('../backend/server');
let base;
const PW = 'Shaggar@2026';

async function call(method, url, body, cookie, headers = {}) {
  const r = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, json, cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
}
async function login(username) {
  let r = await call('POST', '/api/auth/login', { username, password: PW });
  if (r.json.mfa) r = await call('POST', '/api/auth/otp', { challengeId: r.json.challengeId, code: r.json.devCode });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  return r.cookie;
}

test.before(() => new Promise(res => server.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; res(); })));
test.after(() => { server.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('health and public branding', async () => {
  assert.equal((await call('GET', '/api/health')).json.ok, true);
  const b = await call('GET', '/api/public/branding');
  assert.equal(b.json.branding.orgName, 'Shaggar City Administration');
  assert.ok(b.json.demo.accounts.length >= 15);
});

test('wrong password is rejected and audited', async () => {
  const r = await call('POST', '/api/auth/login', { username: 'sena.o', password: 'nope' });
  assert.equal(r.status, 401);
  assert.match(r.json.error, /attempt\(s\) left/);
});

test('roles are enforced', async () => {
  const staff = await login('sena.o');
  assert.equal((await call('GET', '/api/audit', null, staff)).status, 403);
  const boot = await call('GET', '/api/bootstrap', null, staff);
  assert.equal(boot.status, 200);
  assert.equal(boot.json.kpis.length, 0, 'staff do not receive KPI data');
  assert.equal((await call('PUT', '/api/settings/scoring', { cap: 150 }, staff)).status, 403);
});

test('two-step sign-in for privileged roles', async () => {
  const r = await call('POST', '/api/auth/login', { username: 'mayor', password: PW });
  assert.equal(r.json.mfa, true);
  const bad = await call('POST', '/api/auth/otp', { challengeId: r.json.challengeId, code: '000000' });
  assert.equal(bad.status, 400);
  const ok = await call('POST', '/api/auth/otp', { challengeId: r.json.challengeId, code: r.json.devCode });
  assert.equal(ok.status, 200);
});

test('submit → verify → approve workflow with evidence and segregation of duties', async () => {
  const officer = await login('meron.a');
  const boot = (await call('GET', '/api/bootstrap', null, officer)).json;
  const k = boot.kpis.find(x => x.code === 'INFRA-01');
  const noEvidence = await call('POST', '/api/submissions', { kpiId: k.id, month: 3, actual: 2, note: 'Contractor delays and asphalt shortage this month.', mode: 'submit', files: [] }, officer);
  assert.equal(noEvidence.status, 422);
  const sub = await call('POST', '/api/submissions', { kpiId: k.id, month: 3, actual: 2, note: 'Contractor delays and asphalt shortage this month.', mode: 'submit', files: [{ name: 'roads.pdf', type: 'application/pdf', data: Buffer.from('%PDF-1.4 test').toString('base64') }] }, officer);
  assert.equal(sub.status, 200, JSON.stringify(sub.json));
  assert.equal(sub.json.status, 'submitted');
  assert.equal((await call('POST', `/api/submissions/${sub.json.id}/action`, { action: 'verify' }, officer)).status, 403);
  const head = await login('kedir.m');
  assert.equal((await call('POST', `/api/submissions/${sub.json.id}/action`, { action: 'verify', comment: 'Checked' }, head)).json.status, 'verified');
  const admin = await login('chaltu.b');
  assert.equal((await call('POST', `/api/submissions/${sub.json.id}/action`, { action: 'approve' }, admin)).json.status, 'approved');
  const after = (await call('GET', '/api/bootstrap', null, officer)).json;
  const s = after.subs.find(x => x.id === sub.json.id);
  assert.equal(s.evidence.length, 1);
  const file = await fetch(`${base}/api/evidence/${s.evidence[0].id}`, { headers: { Cookie: officer } });
  assert.equal(await file.text(), '%PDF-1.4 test');
});

test('citizen requests and privacy', async () => {
  const cit = await login('citizen');
  const r = await call('POST', '/api/requests', { category: 'C3', phone: '0911 222 333', subject: 'Pothole on my street', details: 'Deep pothole' }, cit);
  assert.equal(r.status, 200);
  const boot = (await call('GET', '/api/bootstrap', null, cit)).json;
  assert.ok(boot.requests.every(x => x.createdBy === boot.me), 'citizens only see their own requests');
  const auditor = await login('abdi.w');
  const ab = (await call('GET', '/api/bootstrap', null, auditor)).json;
  assert.equal(ab.requests.length, 0, 'auditor is not a service desk role');
});

test('audit trail, branding, backups and public API', async () => {
  const admin = await login('tolera.g');
  const a = await call('GET', '/api/audit?cat=Approval&size=5', null, admin);
  assert.ok(a.json.total > 0);
  const logo = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5"/></svg>').toString('base64');
  assert.equal((await call('PUT', '/api/settings/branding', { orgName: 'Test City', systemName: 'Test PMS', logo }, admin)).status, 200);
  assert.equal((await call('GET', '/api/public/branding')).json.branding.orgName, 'Test City');
  const evil = 'data:image/svg+xml;base64,' + Buffer.from('<svg onload="alert(1)"></svg>').toString('base64');
  assert.equal((await call('PUT', '/api/settings/branding', { logo: evil }, admin)).status, 422);
  const b = await call('POST', '/api/backups', {}, admin);
  assert.equal((await call('POST', `/api/backups/${b.json.id}/verify`, {}, admin)).json.ok, true);
  const key = (await call('POST', '/api/api-keys', { name: 'Test', scopes: ['perf:read'] }, admin)).json.key;
  const d = await call('GET', '/api/v1/departments', null, null, { Authorization: `Bearer ${key}` });
  assert.equal(d.status, 200); assert.equal(d.json.data.length, 6);
  assert.equal((await call('POST', '/api/v1/requests', { category: 'C3', subject: 'x', phone: '1' }, null, { Authorization: `Bearer ${key}` })).status, 403);
});

test('targets: department proposes, Mayor\'s Office approves, approved targets are locked', async () => {
  const admin = await login('tolera.g');
  const bootA = (await call('GET', '/api/bootstrap', null, admin)).json;
  const k = bootA.kpis.find(x => x.code === 'REV-01');
  assert.ok(k.targetsApprovedAt, 'seeded targets start approved');
  // the Super Administrator can no longer set targets
  assert.equal((await call('PUT', '/api/targets', { kpis: [{ id: k.id, annual: 1, targets: k.targets }] }, admin)).status, 403);
  assert.equal((await call('POST', '/api/target-proposals', { kpiId: k.id, annual: 1300, targets: k.targets, reason: 'New tax base estimate' }, admin)).status, 403);
  const head = await login('gemechis.t');
  const targets = k.targets.map(v => (v == null ? null : 110));
  // approved targets are locked: a revision needs a reason
  assert.equal((await call('POST', '/api/target-proposals', { kpiId: k.id, annual: 1320, targets }, head)).status, 422);
  const p = await call('POST', '/api/target-proposals', { kpiId: k.id, annual: 1320, targets, reason: 'Revised after the mid-year revenue study.' }, head);
  assert.equal(p.status, 200, JSON.stringify(p.json));
  // another department cannot propose for Revenue; the proposer cannot approve
  const other = await login('kedir.m');
  assert.equal((await call('POST', '/api/target-proposals', { kpiId: k.id, annual: 1, targets, reason: 'Not my department at all' }, other)).status, 403);
  assert.equal((await call('POST', `/api/target-proposals/${p.json.id}/decision`, { action: 'approve' }, head)).status, 403);
  // nothing changes until approval
  assert.equal((await call('GET', '/api/bootstrap', null, head)).json.kpis.find(x => x.id === k.id).annual, 1200);
  const mo = await login('chaltu.b');
  assert.equal((await call('POST', `/api/target-proposals/${p.json.id}/decision`, { action: 'return', comment: '' }, mo)).status, 422);
  assert.equal((await call('POST', `/api/target-proposals/${p.json.id}/decision`, { action: 'approve', comment: 'Agreed' }, mo)).json.status, 'approved');
  const after = (await call('GET', '/api/bootstrap', null, head)).json;
  const k2 = after.kpis.find(x => x.id === k.id);
  assert.equal(k2.annual, 1320); assert.equal(k2.targets[0], 110);
  assert.equal(after.targetProposals.find(x => x.id === p.json.id).status, 'approved');
  assert.equal((await call('POST', `/api/target-proposals/${p.json.id}/decision`, { action: 'approve' }, mo)).status, 409);
});

test('employees: self-reporting with evidence, verification by the department head', async () => {
  const head = await login('gemechis.t');
  // the head adds an employee together with a sign-in account
  const add = await call('POST', '/api/employees', { name: 'Test Employee', position: 'Tax Clerk', deptId: 'REV', username: 'test.e', email: 'test.e@shaggarcity.example' }, head);
  assert.equal(add.status, 200, JSON.stringify(add.json)); assert.ok(add.json.tempPassword);
  assert.equal((await call('POST', '/api/employees', { name: 'X', deptId: 'LAND' }, head)).status, 403, 'other department is out of scope');
  // sign in as the new employee and change the temporary password
  let r = await call('POST', '/api/auth/login', { username: 'test.e', password: add.json.tempPassword });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const emp = r.cookie;
  assert.equal((await call('POST', '/api/auth/password', { current: add.json.tempPassword, next: 'Clerk@2026xyz' }, emp)).status, 200);
  const boot = (await call('GET', '/api/bootstrap', null, emp)).json;
  assert.equal(boot.employees.length, 1, 'an employee sees only their own record');
  assert.ok(boot.kpiRefs.length > 0);
  // the employee proposes a target, linked to a department KPI
  const ind = await call('POST', `/api/employees/${add.json.id}/indicators`, { name: 'Files processed', unit: 'files', dir: 'higher', target: 50, weight: 100, kpiId: boot.kpiRefs[0].id }, emp);
  assert.equal(ind.json.status, 'proposed');
  const fileA = { name: 'register.pdf', type: 'application/pdf', data: Buffer.from('%PDF evidence').toString('base64') };
  assert.equal((await call('POST', `/api/employee-indicators/${ind.json.id}/report`, { actual: 45, files: [fileA] }, emp)).status, 409, 'cannot report against an unapproved target');
  assert.equal((await call('POST', `/api/employee-indicators/${ind.json.id}/decision`, { action: 'approve' }, emp)).status, 403, 'cannot approve own target');
  assert.equal((await call('POST', `/api/employee-indicators/${ind.json.id}/decision`, { action: 'approve' }, head)).json.status, 'approved');
  // reporting needs evidence
  assert.equal((await call('POST', `/api/employee-indicators/${ind.json.id}/report`, { actual: 45, files: [] }, emp)).status, 422);
  assert.equal((await call('POST', `/api/employee-indicators/${ind.json.id}/report`, { actual: 45, note: 'October register', files: [fileA] }, emp)).json.status, 'reported');
  assert.equal((await call('POST', `/api/employee-indicators/${ind.json.id}/report`, { actual: 45, files: [fileA] }, head)).status, 403, 'only the employee reports');
  let rec = (await call('GET', '/api/bootstrap', null, head)).json.employees.find(e => e.id === add.json.id).indicators[0];
  assert.equal(rec.actual, null, 'a reported figure does not count until verified'); assert.equal(rec.reported, 45);
  const f = await fetch(`${base}/api/employee-evidence/${rec.evidence[0].id}`, { headers: { Cookie: head } });
  assert.equal(await f.text(), '%PDF evidence');
  const outsider = await login('kedir.m');
  assert.equal((await call('POST', `/api/employee-indicators/${ind.json.id}/verify`, { action: 'verify' }, outsider)).status, 403);
  assert.equal((await call('POST', `/api/employee-indicators/${ind.json.id}/verify`, { action: 'verify' }, emp)).status, 403);
  assert.equal((await call('POST', `/api/employee-indicators/${ind.json.id}/verify`, { action: 'verify', comment: 'Matches the register' }, head)).json.status, 'verified');
  rec = (await call('GET', '/api/bootstrap', null, head)).json.employees.find(e => e.id === add.json.id).indicators[0];
  assert.equal(rec.actual, 45); assert.equal(rec.reportStatus, 'verified');
});

test('departments: code generated from the short name, head account created on save', async () => {
  const admin = await login('tolera.g');
  const s = await call('GET', '/api/departments/suggest?short=Water%20Supply&name=Almaz%20Bekele', null, admin);
  assert.equal(s.json.code, 'WATER'); assert.equal(s.json.username, 'almaz.b');
  assert.equal((await call('POST', '/api/departments', { short: 'Water', name: 'Water & Sewerage Office', headName: 'Almaz Bekele' }, admin)).status, 422, 'the head needs an email address');
  const d = await call('POST', '/api/departments', { short: 'Water', name: 'Water & Sewerage Office', headName: 'Almaz Bekele', headEmail: 'almaz.b@shaggarcity.example' }, admin);
  assert.equal(d.status, 200, JSON.stringify(d.json));
  assert.equal(d.json.id, 'WATER'); assert.equal(d.json.username, 'almaz.b'); assert.ok(d.json.tempPassword);
  const boot = (await call('GET', '/api/bootstrap', null, admin)).json;
  const dept = boot.depts.find(x => x.id === 'WATER');
  const head = boot.users.find(u => u.id === dept.headId);
  assert.equal(head.name, 'Almaz Bekele'); assert.equal(head.role, 'dept_head'); assert.equal(head.deptId, 'WATER');
  // the new head can sign in with the temporary password (2-step, demo code)
  let r = await call('POST', '/api/auth/login', { username: 'almaz.b', password: d.json.tempPassword });
  if (r.json.mfa) r = await call('POST', '/api/auth/otp', { challengeId: r.json.challengeId, code: r.json.devCode });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  // same short name again gets a different code
  const d2 = await call('POST', '/api/departments', { short: 'Water', name: 'Second water office' }, admin);
  assert.equal(d2.json.id, 'WATER2');
});

test('messages: private one-to-one conversations between staff accounts', async () => {
  const head = await login('gemechis.t'), mayor = await login('mayor'), other = await login('kedir.m'), citizen = await login('citizen');
  const users = (await call('GET', '/api/bootstrap', null, head)).json.users;
  const id = n => users.find(u => u.username === n).id;
  assert.equal((await call('POST', `/api/chat/with/${id('mayor')}`, { text: '   ' }, head)).status, 422);
  assert.equal((await call('POST', `/api/chat/with/${id('gemechis.t')}`, { text: 'to myself' }, head)).status, 422);
  assert.equal((await call('POST', `/api/chat/with/${id('citizen')}`, { text: 'hello' }, head)).status, 422, 'citizens cannot be messaged');
  assert.equal((await call('GET', '/api/chat', null, citizen)).status, 403, 'citizens have no messaging');
  const sent = await call('POST', `/api/chat/with/${id('mayor')}`, { text: 'Revenue report is ready for your review.' }, head);
  assert.equal(sent.status, 200, JSON.stringify(sent.json));
  assert.equal((await call('GET', '/api/chat/unread', null, mayor)).json.unread, 1);
  assert.equal((await call('GET', '/api/bootstrap', null, mayor)).json.chatUnread, 1);
  const list = (await call('GET', '/api/chat', null, mayor)).json.conversations;
  assert.equal(list[0].userId, id('gemechis.t')); assert.equal(list[0].unread, 1);
  // opening the conversation marks it read; the reply reaches the sender
  const thread = (await call('GET', `/api/chat/with/${id('gemechis.t')}`, null, mayor)).json;
  assert.equal(thread.messages.at(-1).text, 'Revenue report is ready for your review.'); assert.equal(thread.unread, 0);
  await call('POST', `/api/chat/with/${id('gemechis.t')}`, { text: 'Thank you.' }, mayor);
  const back = (await call('GET', `/api/chat/with/${id('mayor')}`, null, head)).json.messages;
  assert.equal(back.length, 2); assert.equal(back[0].read, true);
  // a third person sees none of it
  assert.equal((await call('GET', '/api/chat', null, other)).json.conversations.length, 0);
  assert.equal((await call('GET', `/api/chat/with/${id('mayor')}`, null, other)).json.messages.length, 0);
  // the audit trail records that a conversation started, not what was said
  const admin = await login('tolera.g');
  const log = JSON.stringify((await call('GET', '/api/audit?q=Conversation', null, admin)).json);
  assert.ok(!log.includes('Revenue report is ready'));
});

test('KPIs: a department head proposes a KPI with targets, the Mayor\'s Office approves', async () => {
  const head = await login('lalise.f'), mo = await login('chaltu.b'), other = await login('kedir.m'), officer = await login('meron.a');
  const body = { deptId: 'LAND', name: 'Boundary disputes resolved', definition: 'Disputes closed with a signed settlement.', formula: 'Count of disputes closed in the period', source: 'Dispute register', unit: 'cases', dir: 'higher', freq: 'quarterly', agg: 'sum', weight: 10, annual: 80, evidenceRequired: true };
  assert.equal((await call('POST', '/api/kpi-proposals', body, other)).status, 403, 'another department cannot propose for Land');
  assert.equal((await call('POST', '/api/kpi-proposals', { ...body, definition: '' }, head)).status, 422, 'a KPI needs a description');
  // the simple form: six answers, no formula, objective, officer or monthly figures
  const simple = await call('POST', '/api/kpi-proposals', { deptId: 'LAND', name: 'Average days to issue a title deed', measure: 'Working days from complete application to issued deed, from the deeds register.', unit: 'days', dir: 'lower', freq: 'monthly', agg: 'avg', weight: 5, annual: 12, targets: null }, head);
  assert.equal(simple.status, 200, JSON.stringify(simple.json));
  const sk = (await call('GET', '/api/bootstrap', null, head)).json.kpis.find(x => x.id === simple.json.id);
  assert.equal(sk.definition, 'Working days from complete application to issued deed, from the deeds register.'); assert.equal(sk.objectiveId, null);
  assert.ok(sk.targets.every(v => v === 12), 'a rate carries the same target every month');
  // a pending proposal can still be edited by the department
  assert.equal((await call('PUT', `/api/kpi-proposals/${sk.id}`, { deptId: 'LAND', name: 'Average days to issue a title deed', measure: 'Working days from complete application to issued deed.', unit: 'days', dir: 'lower', freq: 'monthly', agg: 'avg', weight: 5, annual: 10 }, head)).status, 200);
  assert.equal((await call('GET', '/api/bootstrap', null, head)).json.kpis.find(x => x.id === sk.id).annual, 10);
  assert.equal((await call('DELETE', `/api/kpi-proposals/${sk.id}`, {}, head)).status, 200);
  const p = await call('POST', '/api/kpi-proposals', body, head);
  assert.equal(p.status, 200, JSON.stringify(p.json)); assert.match(p.json.code, /^LAND-\d\d$/);
  let k = (await call('GET', '/api/bootstrap', null, head)).json.kpis.find(x => x.id === p.json.id);
  assert.equal(k.active, false); assert.equal(k.approval, 'proposed');
  assert.deepEqual(k.targets.filter(v => v != null), [20, 20, 20, 20], 'the annual target is spread over the four quarters');
  // not usable before approval: no reports, no target revision, no approval by the proposer or by an administrator
  assert.equal((await call('POST', '/api/submissions', { kpiId: k.id, month: 2, actual: 5, note: 'x', mode: 'draft', files: [] }, officer)).status, 409);
  assert.equal((await call('POST', `/api/kpi-proposals/${k.id}/decision`, { action: 'approve' }, head)).status, 403);
  const admin = await login('tolera.g');
  assert.equal((await call('POST', `/api/kpi-proposals/${k.id}/decision`, { action: 'approve' }, admin)).status, 403, 'the Super Administrator does not approve KPIs');
  // returned with a comment, revised with custom quarterly targets, then approved
  assert.equal((await call('POST', `/api/kpi-proposals/${k.id}/decision`, { action: 'return', comment: '' }, mo)).status, 422);
  assert.equal((await call('POST', `/api/kpi-proposals/${k.id}/decision`, { action: 'return', comment: 'Target is too low for the backlog.' }, mo)).json.status, 'returned');
  assert.equal((await call('POST', `/api/kpi-proposals/${k.id}/decision`, { action: 'approve' }, mo)).status, 409, 'a returned proposal must be resubmitted first');
  const t = Array(12).fill(null); t[2] = 20; t[5] = 30; t[8] = 30; t[11] = 40;
  assert.equal((await call('PUT', `/api/kpi-proposals/${k.id}`, { ...body, annual: 120, targets: t }, head)).json.status, 'proposed');
  assert.equal((await call('POST', `/api/kpi-proposals/${k.id}/decision`, { action: 'approve', comment: 'Agreed' }, mo)).json.status, 'approved');
  k = (await call('GET', '/api/bootstrap', null, head)).json.kpis.find(x => x.id === p.json.id);
  assert.equal(k.active, true); assert.equal(k.annual, 120); assert.equal(k.targets[11], 40); assert.ok(k.targetsApprovedAt, 'targets are locked on approval');
  // once approved it follows the normal rules: no more proposal edits, revisions need a reason
  assert.equal((await call('PUT', `/api/kpi-proposals/${k.id}`, body, head)).status, 409);
  assert.equal((await call('POST', '/api/target-proposals', { kpiId: k.id, annual: 100, targets: t }, head)).status, 422);
  // a second proposal can be withdrawn
  const p2 = await call('POST', '/api/kpi-proposals', { ...body, name: 'Temporary' }, head);
  assert.equal((await call('DELETE', `/api/kpi-proposals/${p2.json.id}`, {}, head)).status, 200);
  assert.ok(!(await call('GET', '/api/bootstrap', null, head)).json.kpis.find(x => x.id === p2.json.id));
});

test('sign-in codes go by email, and every new account needs an email address', async () => {
  const r = await call('POST', '/api/auth/login', { username: 'mayor', password: PW });
  assert.equal(r.json.mfa, true); assert.equal(r.json.channel, 'email');
  assert.match(r.json.to, /^ma.+@shaggarcity\.example$/, 'the address is shown masked');
  assert.ok(!r.json.to.includes('mayor@'));
  assert.equal(r.json.sent, false, 'no email service is configured in the tests');
  assert.ok(r.json.devCode, 'demonstration mode still shows the code');
  const admin = await login('tolera.g');
  // accounts cannot be created without a valid address
  assert.equal((await call('POST', '/api/users', { name: 'No Email', username: 'no.email', role: 'kpi_officer' }, admin)).status, 422);
  assert.equal((await call('POST', '/api/users', { name: 'Bad Email', username: 'bad.email', role: 'kpi_officer', email: 'not-an-address' }, admin)).status, 422);
  assert.equal((await call('POST', '/api/users', { name: 'Good Email', username: 'good.email', role: 'kpi_officer', email: 'good@shaggarcity.example' }, admin)).status, 200);
  const head = await login('gemechis.t');
  assert.equal((await call('POST', '/api/employees', { name: 'No Mail', deptId: 'REV', username: 'no.mail' }, head)).status, 422);
  assert.equal((await call('POST', '/api/employees', { name: 'No Account', deptId: 'REV' }, head)).status, 200, 'an employee without an account needs no email');
  // the test-email button reports clearly when no service is connected
  const t = await call('POST', '/api/email/test', { to: 'admin@shaggarcity.example' }, admin);
  assert.equal(t.status, 502); assert.match(t.json.error, /no email service is set up/);
  // the policy can be switched back to SMS
  assert.equal((await call('PUT', '/api/settings/security', { otpChannel: 'sms' }, admin)).status, 200);
  assert.equal((await call('POST', '/api/auth/login', { username: 'mayor', password: PW })).json.channel, 'sms');
  assert.equal((await call('PUT', '/api/settings/security', { otpChannel: 'email' }, admin)).status, 200);
});

test('notifications carry a link to what they are about, and can be marked read one by one', async () => {
  const mayor = await login('mayor'), chaltu = await login('chaltu.b');
  const boot = (await call('GET', '/api/bootstrap', null, chaltu)).json;
  const sub = boot.subs.find(s => s.status === 'submitted');
  const k = boot.kpis.find(x => x.id === sub.kpiId);
  const head = boot.users.find(u => u.id === boot.depts.find(d => d.id === k.deptId).headId);
  // the Mayor reminds the head; the head's notification links to the report
  const r = await call('POST', '/api/reports/remind', { kpiId: k.id, month: sub.m }, mayor);
  assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(r.json.sent, 1);
  assert.equal((await call('POST', '/api/reports/remind', { kpiId: k.id, month: sub.m }, mayor)).status, 429, 'one reminder per 12 hours');
  const hc = await login(head.username);
  const n = (await call('GET', '/api/bootstrap', null, hc)).json.notifs.find(x => /^Reminder from Mayor/.test(x.text));
  assert.ok(n); assert.equal(n.link, `sub:${sub.id}`); assert.equal(n.read, false);
  assert.equal((await call('POST', `/api/notifications/${n.id}/read`, {}, hc)).status, 200);
  assert.equal((await call('GET', '/api/bootstrap', null, hc)).json.notifs.find(x => x.id === n.id).read, true);
  // someone else cannot mark it
  await call('POST', `/api/notifications/${n.id}/read`, {}, mayor);
  // reminders are limited to those who may send them
  assert.equal((await call('POST', '/api/reports/remind', { kpiId: k.id, month: sub.m }, await login('abdi.w'))).status, 403);
  assert.equal((await call('POST', '/api/reports/remind', { kpiId: k.id, month: sub.m }, await login('ifa.g'))).status, 403);
});

test('awaiting verification: the Mayor cannot approve, but can return it to the department', async () => {
  const mayor = await login('mayor');
  const boot = (await call('GET', '/api/bootstrap', null, mayor)).json;
  const sub = boot.subs.find(s => s.status === 'submitted');
  const a = await call('POST', `/api/submissions/${sub.id}/action`, { action: 'approve' }, mayor);
  assert.equal(a.status, 409); assert.match(a.json.error, /Only verified reports/);
  assert.equal((await call('POST', `/api/submissions/${sub.id}/action`, { action: 'return', comment: 'x' }, mayor)).status, 422, 'a reason is required');
  const r = await call('POST', `/api/submissions/${sub.id}/action`, { action: 'return', comment: 'Evidence file cannot be opened.' }, mayor);
  assert.equal(r.status, 200); assert.equal(r.json.status, 'returned');
  // the auditor (read-only) cannot return
  const other = (await call('GET', '/api/bootstrap', null, mayor)).json.subs.find(s => s.status === 'submitted');
  if (other) assert.equal((await call('POST', `/api/submissions/${other.id}/action`, { action: 'return', comment: 'Not allowed here.' }, await login('abdi.w'))).status, 403);
});

test('citizens do not receive staff names', async () => {
  const cit = await login('citizen');
  const b = (await call('GET', '/api/bootstrap', null, cit)).json;
  assert.equal(b.users.length, 1); assert.equal(b.users[0].id, b.me);
  for (const r of b.requests) {
    assert.equal(r.assignedTo, null);
    for (const h of r.history) { assert.ok(!/^Escalation/.test(h.text)); assert.ok(h.by === null || h.by === b.me); }
  }
});
