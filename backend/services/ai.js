/* AI Executive Assistant (server side).
   Provider order: Anthropic Claude (ANTHROPIC_API_KEY) → local Ollama model
   (OLLAMA_URL, free, self-hosted) → none (browser falls back to built-in rules).
   Tools only read data inside the user's role and department scope. */
const db = require('../db');
const config = require('../config');
const access = require('../lib/access');
const state = require('./state');
const { MONTHS, ROLES } = require('../../shared/constants');

const r1 = v => (v == null ? null : Math.round(v * 10) / 10);

function tools(user) {
  const E = state.engine(user); const S = E.state; const ids = access.scopeIds(user);
  const dept = id => S.depts.find(d => d.id === id);
  const findDept = q => { q = String(q || '').toLowerCase(); return S.depts.filter(d => ids.includes(d.id)).find(d => d.id.toLowerCase() === q || d.short.toLowerCase() === q || d.name.toLowerCase().includes(q) || q.includes(d.short.toLowerCase())); };
  const uname = id => db.get('SELECT name FROM users WHERE id = ?', id)?.name || '—';
  return [
    { name: 'get_city_overview', description: 'Weighted scores for every department this user may see, with last-year comparison. period: "Y" (year-to-date, default), "Q1".."Q4", or "M0".."M11" (M0 = July).', input_schema: { type: 'object', properties: { period: { type: 'string' } } },
      run: ({ period }) => { const p = E.parsePeriod(period), ms = E.periodMonths(p); return { period: E.periodLabel(p), city_index: r1(E.cityIndex(ms)), departments: S.depts.filter(d => ids.includes(d.id)).map(d => { const c = E.deptCalc(d.id, ms); return { department: d.short, code: d.id, head: uname(d.headId), score: r1(c.score), rating: E.band(c.score).label, last_year: r1(E.lastYearDept(d.id, ms)), reports_approved: `${c.rep}/${c.due}` }; }) }; } },
    { name: 'get_department_scorecard', description: 'KPI-level scorecard for one department. department: code or name.', input_schema: { type: 'object', properties: { department: { type: 'string' }, period: { type: 'string' } }, required: ['department'] },
      run: ({ department, period }) => { const d = findDept(department); if (!d) return { error: 'Department not found or outside your access scope.' }; const p = E.parsePeriod(period), ms = E.periodMonths(p), c = E.deptCalc(d.id, ms); return { department: d.name, head: uname(d.headId), period: E.periodLabel(p), score: r1(c.score), rating: E.band(c.score).label, kpis: c.rows.map(r => ({ code: r.k.code, name: r.k.name, unit: r.k.unit, weight: r.k.weight, target: r1(r.target), actual: r1(r.actual), achievement_pct: r1(r.ach), rating: E.band(r.ach).label, last_year_pct: r1(E.lastYearKpi(r.k, ms)) })), open_action_plans: S.caps.filter(x => x.deptId === d.id && x.status !== 'Completed').map(x => ({ ref: x.ref, title: x.title, done: x.actions.filter(a => a.done).length + '/' + x.actions.length })) }; } },
    { name: 'get_kpi_history', description: 'Monthly target, actual, achievement and status for one KPI code, e.g. "LAND-01".', input_schema: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] },
      run: ({ code }) => { const k = S.kpis.find(x => x.code.toLowerCase() === String(code).toLowerCase() && ids.includes(x.deptId)); if (!k) return { error: 'KPI not found or outside your access scope.' }; return { code: k.code, name: k.name, department: dept(k.deptId).short, formula: k.formula, unit: k.unit, months: [...Array(S.config.currentMonth).keys()].filter(m => E.due(k, m)).map(m => { const s = E.subFor(k.id, m); return { month: MONTHS[m] + ' ' + E.monthYear(m), target: k.targets[m], actual: s ? s.actual : null, achievement_pct: s ? r1(E.achv(k, s.actual, k.targets[m])) : null, status: s ? s.status : 'not submitted' }; }) }; } },
    { name: 'list_alerts', description: 'Active performance alerts (year-to-date).', input_schema: { type: 'object', properties: {} },
      run: () => ({ alerts: E.alerts().slice(0, 40).map(a => ({ severity: a.sev, type: a.type, department: dept(a.deptId)?.short, message: a.text })) }) },
    { name: 'list_pending_approvals', description: 'Reports waiting for verification or approval, with waiting days.', input_schema: { type: 'object', properties: {} },
      run: () => ({ items: S.subs.filter(s => ['submitted', 'verified', 'returned'].includes(s.status)).map(s => { const k = S.kpis.find(x => x.id === s.kpiId); return { k, s }; }).filter(x => ids.includes(x.k.deptId)).map(({ k, s }) => ({ kpi: `${k.code} ${k.name}`, department: dept(k.deptId).short, month: MONTHS[s.m], status: s.status, waiting_days: Math.floor((Date.now() - Date.parse(s.status === 'verified' ? s.verifiedAt : s.submittedAt)) / 864e5) })) }) },
    { name: 'list_action_plans', description: 'Corrective action plans with progress and overdue actions.', input_schema: { type: 'object', properties: {} },
      run: () => { const today = db.now().slice(0, 10); return { plans: S.caps.filter(c => ids.includes(c.deptId)).map(c => ({ ref: c.ref, department: dept(c.deptId).short, title: c.title, status: c.status, root_cause: c.rootCause, overdue: c.actions.filter(a => !a.done && a.due < today).map(a => `${a.text} (due ${a.due})`) })) }; } },
  ];
}

function systemPrompt(user, lang) {
  const sc = db.getSetting('scoring'), br = db.getSetting('branding');
  const d = user.dept_id ? db.get('SELECT name FROM departments WHERE id = ?', user.dept_id)?.name : null;
  return `You are the AI Executive Assistant inside the ${br.orgName} ${br.systemName} (${br.office}). You help ${user.name} (${ROLES[user.role]}${d ? ', ' + d : ''}) understand performance and decide what to do next.
Today is ${new Date().toDateString()}. Fiscal year ${sc.fy} runs July to June; the current reporting month is ${MONTHS[sc.currentMonth]}.
Rules: take every figure from the tools and never invent numbers; only discuss what the tools return; scores are weighted achievement % of target capped at ${sc.cap}% (on track ≥${sc.bands.good}%, needs attention ≥${sc.bands.warning}%, underperforming ≥${sc.bands.serious}%, critical below); lead with the answer, then up to five bullets, then "Recommended actions" naming who should act; simple markdown, no tables; drafts are written ready to send from the ${br.office}. Reply in ${lang || 'English'}.`;
}

/* If the configured model cannot be reached, the browser's built-in assistant answers instead, with the reason shown. */
async function chat(user, messages, lang) {
  try { return await chatWithModel(user, messages, lang); }
  catch (e) { console.error('AI assistant:', e.message); return { provider: 'none', note: e.message }; }
}
async function chatWithModel(user, messages, lang) {
  const T = tools(user); const used = [];
  if (config.anthropicApiKey) {
    const convo = messages.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: String(m.content) }));
    for (let i = 0; i < 6; i++) {
      const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': config.anthropicApiKey, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: config.aiModel, max_tokens: 1500, system: systemPrompt(user, lang), tools: T.map(({ name, description, input_schema }) => ({ name, description, input_schema })), messages: convo }) });
      if (!r.ok) { let why = ''; try { why = (await r.json()).error?.message || ''; } catch (e) {} throw new Error(r.status === 401 ? 'the API key was rejected' : r.status === 404 ? `the model "${config.aiModel}" was not found` : r.status === 429 ? 'the AI account has reached its limit' : `AI provider error ${r.status}${why ? ': ' + why.slice(0, 120) : ''}`); }
      const j = await r.json();
      convo.push({ role: 'assistant', content: j.content });
      const calls = j.content.filter(c => c.type === 'tool_use');
      if (!calls.length || j.stop_reason !== 'tool_use') return { provider: 'anthropic', text: j.content.filter(c => c.type === 'text').map(c => c.text).join('\n'), tools: used };
      convo.push({ role: 'user', content: calls.map(c => { used.push(c.name); const t = T.find(x => x.name === c.name); let out; try { out = t ? t.run(c.input || {}) : { error: 'unknown tool' }; } catch (e) { out = { error: e.message }; } return { type: 'tool_result', tool_use_id: c.id, content: JSON.stringify(out) }; }) });
    }
    return { provider: 'anthropic', text: 'The assistant needed too many steps to answer. Try a narrower question.', tools: used };
  }
  if (config.ollamaUrl) {
    // Local open-weight model: give it the data up front (no tool calling required).
    const ctx = { overview: T[0].run({}), alerts: T[3].run({}), pending: T[4].run({}), action_plans: T[5].run({}) };
    const r = await fetch(config.ollamaUrl.replace(/\/$/, '') + '/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: config.ollamaModel, stream: false, messages: [{ role: 'system', content: systemPrompt(user, lang) + '\n\nCurrent data (JSON):\n' + JSON.stringify(ctx) }, ...messages.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: String(m.content) }))] }) });
    if (!r.ok) throw new Error(`Local model error ${r.status}`);
    const j = await r.json();
    return { provider: 'ollama', text: j.message?.content || '', tools: ['overview', 'alerts', 'pending approvals', 'action plans'] };
  }
  return { provider: 'none' };
}

const provider = () => (config.anthropicApiKey ? 'anthropic' : config.ollamaUrl ? 'ollama' : 'none');
module.exports = { chat, provider, tools };
