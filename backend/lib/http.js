/* Minimal HTTP toolkit: router, JSON bodies, cookies, static files, security headers. */
const fs = require('node:fs');
const path = require('node:path');
const config = require('../config');

class HttpError extends Error { constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; } }
const fail = (status, message, extra) => { throw new HttpError(status, message, extra); };

const routes = [];
/** route('GET', '/api/kpis/:id', handler) — handler(ctx) returns a value (sent as JSON) or calls ctx.send* */
function route(method, pattern, handler) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  routes.push({ method, re, keys, handler });
}
function match(method, pathname) {
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = pathname.match(r.re);
    if (m) return { handler: r.handler, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > config.maxBodyBytes) { reject(new HttpError(413, 'The request is too large.')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(new HttpError(400, 'The request body is not valid JSON.')); }
    });
    req.on('error', reject);
  });
}
function parseCookies(h = '') { return Object.fromEntries(h.split(';').map(s => s.trim().split('=')).filter(p => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))])); }
function cookie(name, value, { maxAge, clear } = {}) {
  return [`${name}=${clear ? '' : encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', config.secureCookies ? 'Secure' : '', clear ? 'Max-Age=0' : maxAge ? `Max-Age=${maxAge}` : ''].filter(Boolean).join('; ');
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'",
};
function headers(extra = {}) { const h = { ...SECURITY_HEADERS, ...extra }; if (config.secureCookies) h['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'; return h; }
function sendJson(res, status, data, extra = {}) { res.writeHead(status, headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra })); res.end(JSON.stringify(data)); }
function sendFile(res, status, body, type, extra = {}) { res.writeHead(status, headers({ 'Content-Type': type, ...extra })); res.end(body); }

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
/** Serve /shared/* from shared/, everything else from frontend/ (SPA fallback to index.html). */
function serveStatic(req, res, pathname) {
  let base = config.frontendDir, rel = pathname;
  if (pathname.startsWith('/shared/')) { base = config.sharedDir; rel = pathname.slice('/shared'.length); }
  let file = path.normalize(path.join(base, rel));
  if (!file.startsWith(base)) return sendFile(res, 403, 'Forbidden', 'text/plain');
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(config.frontendDir, 'index.html');
  const ext = path.extname(file);
  sendFile(res, 200, fs.readFileSync(file), TYPES[ext] || 'application/octet-stream', { 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300' });
}

// Simple fixed-window rate limiter (per key)
const buckets = new Map();
function rateLimit(key, limit, windowMs) {
  const t = Date.now(); const b = buckets.get(key);
  if (!b || t - b.start > windowMs) { buckets.set(key, { start: t, n: 1 }); return true; }
  b.n++; return b.n <= limit;
}

module.exports = { HttpError, fail, route, match, readBody, parseCookies, cookie, sendJson, sendFile, serveStatic, rateLimit, headers };
