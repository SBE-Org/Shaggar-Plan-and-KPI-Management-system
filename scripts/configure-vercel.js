/* Writes vercel.json from frontend/.env (BACKEND_URL), so the Vercel site forwards
   /api/* to the backend on Render. Run it once, and again if the backend address changes:
       node scripts/configure-vercel.js
   Then commit vercel.json. ORIGIN_SECRET is not written into the file: Vercel reads it
   from the project's Environment Variables and attaches it to each forwarded request. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

const env = { ...process.env };
const file = path.join(root, 'frontend', '.env');
if (fs.existsSync(file)) for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && !process.env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const backend = String(env.BACKEND_URL || '').trim().replace(/\/+$/, '');
if (!/^https:\/\/[^/\s]+$/.test(backend)) {
  console.error('Set BACKEND_URL in frontend/.env to your Render address, for example https://shaggar-pms.onrender.com (https, no path).');
  process.exit(1);
}
const csp = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'";
const config = {
  $schema: 'https://openapi.vercel.sh/vercel.json',
  framework: null,
  installCommand: 'echo "No dependencies"',
  buildCommand: 'node scripts/build-static.js',
  outputDirectory: 'dist',
  routes: [
    { src: '/(.*)', continue: true, headers: { 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()', 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains', 'Content-Security-Policy': csp } },
    { src: '/(index\\.html)?', continue: true, headers: { 'Cache-Control': 'no-cache' } },
    {
      src: '/api/(.*)', dest: `${backend}/api/$1`,
      // API answers are per user: never cached by Vercel's CDN.
      headers: { 'x-vercel-enable-rewrite-caching': '0' },
      // Proves to the backend that the request came through this site.
      transforms: [{ type: 'request.headers', op: 'set', target: { key: 'x-origin-secret' }, args: '$ORIGIN_SECRET', env: ['ORIGIN_SECRET'] }],
    },
    { handle: 'filesystem' },
  ],
};
fs.writeFileSync(path.join(root, 'vercel.json'), JSON.stringify(config, null, 2) + '\n');
console.log(`vercel.json written: /api/* → ${backend}/api/*`);
console.log('Next: commit vercel.json, and add ORIGIN_SECRET in Vercel → Settings → Environment Variables.');
