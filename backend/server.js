/* Shaggar City KPI & Performance Management System — HTTP server.
   Zero external dependencies: Node.js 22.5+ (built-in node:sqlite). */
const http = require('node:http');
const config = require('./config');
const db = require('./db');
const H = require('./lib/http');
const A = require('./lib/access');

db.open();
if (db.get('SELECT COUNT(*) AS n FROM users').n === 0) {
  console.log('Empty database — loading sample data and demo accounts…');
  require('../database/seed').seed();
}

// Route modules register themselves with the router.
const { sessionUser } = require('./routes/auth');
require('./routes/performance');
require('./routes/desk');
require('./routes/admin');
require('./routes/ai');
require('./routes/chat');
require('./routes/publicApi');
const state = require('./services/state');
const automation = require('./services/automation');

H.route('GET', '/api/bootstrap', ctx => { if (!ctx.user) H.fail(401, 'Sign in to continue.'); return state.bootstrap(ctx.user); });
H.route('GET', '/api/health', () => ({ ok: true, time: db.now() }));

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;
  if (!pathname.startsWith('/api/')) return H.serveStatic(req, res, pathname);
  const ctx = { req, res, path: pathname, query: Object.fromEntries(url.searchParams), headers: {}, ip: req.socket.remoteAddress, cookies: H.parseCookies(req.headers.cookie), body: {} };
  try {
    const m = H.match(req.method, pathname);
    if (!m) H.fail(404, 'Not found.');
    ctx.params = m.params;
    // Same-origin check for state-changing browser requests (CSRF defence in depth; cookies are SameSite=Strict too).
    if (req.method !== 'GET' && !pathname.startsWith('/api/v1/')) {
      const origin = req.headers.origin; if (origin && new URL(origin).host !== req.headers.host) H.fail(403, 'Cross-site request blocked.');
    }
    if (['POST', 'PUT', 'DELETE'].includes(req.method)) ctx.body = await H.readBody(req);
    if (!pathname.startsWith('/api/v1/')) ctx.user = sessionUser(ctx);
    if (ctx.user && ctx.user.must_change && !['/api/auth/password', '/api/auth/logout', '/api/auth/me', '/api/bootstrap', '/api/public/branding'].includes(pathname)) H.fail(403, 'Change your temporary password to continue.');
    const result = await m.handler(ctx);
    if (!res.writableEnded) H.sendJson(res, ctx.status || 200, result === undefined ? { ok: true } : result, ctx.headers);
  } catch (e) {
    if (res.writableEnded) return;
    const status = e.status || 500;
    if (status === 500) console.error(e);
    H.sendJson(res, status, { error: status === 500 ? 'Something went wrong on the server. The error was logged.' : e.message, ...(e.extra || {}) }, ctx.headers);
  }
});

if (require.main === module) {
  server.listen(config.port, config.host, () => {
    console.log(`Shaggar PMS running at http://localhost:${config.port}  (${config.env}${config.demoMode ? ', DEMO MODE' : ''})`);
    automation.start();
  });
}
module.exports = { server, A };
