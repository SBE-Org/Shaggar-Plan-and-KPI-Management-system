/* Public REST API v1 for approved integrations (API key + scope). */
const db = require('../db');
const { route, fail, rateLimit } = require('../lib/http');
const audit = require('../lib/audit');
const { sha256 } = require('../lib/security');
const state = require('../services/state');
const C = require('../../shared/constants');

const ENDPOINTS = [
  { m: 'GET', p: '/api/v1/departments', s: 'perf:read', d: 'List departments with their year-to-date score.' },
  { m: 'GET', p: '/api/v1/departments/{code}/scorecard', s: 'perf:read', d: 'Weighted scorecard for a department. Query: period=Y | Q1–Q4 | M0–M11.', ex: '/api/v1/departments/REV/scorecard?period=Y' },
  { m: 'GET', p: '/api/v1/kpis', s: 'perf:read', d: 'KPI definitions: formula, unit, direction, weight and annual target.' },
  { m: 'GET', p: '/api/v1/kpis/{code}/results', s: 'perf:read', d: 'Monthly targets, approved actuals and achievement for one KPI.', ex: '/api/v1/kpis/LAND-01/results' },
  { m: 'GET', p: '/api/v1/alerts', s: 'perf:read', d: 'Active performance alerts.' },
  { m: 'POST', p: '/api/v1/submissions', s: 'perf:submit', d: 'Submit an actual for a KPI and month. It enters the normal verification workflow.', body: '{"kpi":"TRADE-01","month":3,"actual":950,"note":"From e-Trade system"}' },
  { m: 'GET', p: '/api/v1/audit', s: 'audit:read', d: 'Audit entries. Query: from=YYYY-MM-DD&to=YYYY-MM-DD.', ex: '/api/v1/audit?from=2026-11-01' },
];

function auth(ctx, scope) {
  const key = String(ctx.req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!key) fail(401, 'Send the key in the Authorization header: Bearer <key>.');
  if (!rateLimit('api:' + key.slice(0, 13), 60, 60e3)) fail(429, 'Rate limit exceeded (60 requests per minute).');
  const k = db.get('SELECT * FROM api_keys WHERE key_hash = ? AND revoked = 0', sha256(key));
  if (!k) { audit.log({ ip: ctx.ip }, 'API call rejected', 'API', ctx.path, 'Invalid or revoked key'); fail(401, 'Invalid or revoked API key.'); }
  if (!k.scopes.split(',').includes(scope)) { audit.log({ ip: ctx.ip }, 'API call rejected', 'API', ctx.path, `Key "${k.name}" lacks scope ${scope}`); fail(403, `This key lacks the required scope: ${scope}.`); }
  db.update('api_keys', { id: k.id }, { last_used: db.now() });
  ctx.apiKey = k; ctx.user = db.get('SELECT * FROM users WHERE id = ?', k.created_by);
  audit.log({ ip: ctx.ip }, 'API call', 'API', `${ctx.req.method} ${ctx.path}`, `Key "${k.name}"`);
  return k;
}
const r1 = v => (v == null ? null : Math.round(v * 10) / 10);

route('GET', '/api/v1/departments', ctx => { auth(ctx, 'perf:read'); const E = state.engine(); return { data: E.state.depts.map(d => ({ code: d.id, name: d.name, score_ytd: r1(E.deptCalc(d.id, E.periodMonths({ type: 'Y' })).score) })) }; });
route('GET', '/api/v1/departments/:code/scorecard', ctx => {
  auth(ctx, 'perf:read'); const E = state.engine(); const d = E.state.depts.find(x => x.id === ctx.params.code) || fail(404, 'Department not found.');
  const p = E.parsePeriod(ctx.query.period), c = E.deptCalc(d.id, E.periodMonths(p));
  return { department: d.id, period: E.periodLabel(p), score: r1(c.score), rating: E.band(c.score).label, kpis: c.rows.map(r => ({ code: r.k.code, name: r.k.name, weight: r.k.weight, target: r.target, actual: r.actual, achievement: r1(r.ach) })) };
});
route('GET', '/api/v1/kpis', ctx => { auth(ctx, 'perf:read'); return { data: state.engine().state.kpis.filter(k => k.approval === 'approved').map(k => ({ code: k.code, department: k.deptId, name: k.name, unit: k.unit, direction: k.dir, frequency: k.freq, weight: k.weight, annual_target: k.annual, formula: k.formula })) }; });
route('GET', '/api/v1/kpis/:code/results', ctx => {
  auth(ctx, 'perf:read'); const E = state.engine(); const k = E.state.kpis.find(x => x.code === ctx.params.code) || fail(404, 'KPI not found.');
  return { kpi: k.code, results: [...Array(12).keys()].filter(m => E.due(k, m)).map(m => { const s = E.subFor(k.id, m); return { month: `${C.MONTHS[m]} ${E.monthYear(m)}`, target: k.targets[m], actual: s && s.status === 'approved' ? s.actual : null, status: s ? s.status : 'not_submitted' }; }) };
});
route('GET', '/api/v1/alerts', ctx => { auth(ctx, 'perf:read'); return { data: state.engine().alerts().map(a => ({ severity: a.sev, type: a.type, department: a.deptId, message: a.text })) }; });
route('POST', '/api/v1/submissions', ctx => {
  const k0 = auth(ctx, 'perf:submit'); const b = ctx.body; const sc = db.getSetting('scoring');
  const k = db.get('SELECT * FROM kpis WHERE code = ?', b.kpi);
  if (!k || !(b.month >= 0 && b.month < sc.currentMonth) || typeof b.actual !== 'number') fail(422, 'kpi must be a KPI code, month a closed month index (0 = July), actual a number.');
  let s = db.get('SELECT * FROM submissions WHERE kpi_id = ? AND month = ?', k.id, b.month);
  if (s && ['submitted', 'verified', 'approved'].includes(s.status)) fail(409, `Already ${s.status} for that period.`);
  const t = db.now();
  if (!s) { s = { id: db.id('S'), kpi_id: k.id, month: b.month, actual: b.actual, note: b.note || 'Submitted via API', status: 'submitted', submitted_by: k0.created_by, submitted_at: t, verified_by: null, verified_at: null, approved_by: null, approved_at: null, esc_verify: 0, esc_approve: 0 }; db.insert('submissions', s); }
  else db.update('submissions', { id: s.id }, { actual: b.actual, note: b.note || 'Submitted via API', status: 'submitted', submitted_at: t });
  db.insert('submission_history', { id: db.id('H'), submission_id: s.id, user_id: null, action: `submitted via API key "${k0.name}"`, comment: '', at: t });
  require('../lib/notify').notify([db.get('SELECT head_user_id h FROM departments WHERE id = ?', k.dept_id).h], `${k.code} ${C.MONTHS[b.month]} submitted via API — awaiting verification.`, 'submission_submitted', null, `sub:${s.id}`);
  ctx.status = 201; return { id: s.id, status: 'submitted' };
});
route('GET', '/api/v1/audit', ctx => { auth(ctx, 'audit:read'); const q = ctx.query; return { data: db.all('SELECT a.*, u.name AS user_name FROM audit_log a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.at DESC LIMIT 500').filter(a => (!q.from || a.at.slice(0, 10) >= q.from) && (!q.to || a.at.slice(0, 10) <= q.to)).map(a => ({ at: a.at, user: a.user_name || 'System', action: a.action, record: `${a.entity} ${a.entity_id || ''}`, details: a.details })) }; });

function openApi() {
  const paths = {};
  for (const e of ENDPOINTS) {
    (paths[e.p] ||= {})[e.m.toLowerCase()] = { summary: e.d, security: [{ bearerAuth: [e.s] }], parameters: (e.p.match(/\{(\w+)\}/g) || []).map(x => ({ name: x.slice(1, -1), in: 'path', required: true, schema: { type: 'string' } })), ...(e.body ? { requestBody: { content: { 'application/json': { example: JSON.parse(e.body) } } } } : {}), responses: { 200: { description: 'OK' }, 201: { description: 'Created' }, 401: { description: 'Missing or invalid API key' }, 403: { description: 'Key lacks the required scope' }, 422: { description: 'Validation failed' }, 429: { description: 'Rate limit exceeded' } } };
  }
  const b = db.getSetting('branding');
  return { openapi: '3.0.3', info: { title: `${b.shortName} API`, version: '1.0.0', description: 'REST API for KPIs, scorecards, submissions and audit records. Every call needs an API key with the listed scope and is recorded in the audit trail.' }, components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } } }, paths };
}
route('GET', '/api/v1/openapi.json', () => openApi());
route('GET', '/api/v1/endpoints', () => ENDPOINTS);
