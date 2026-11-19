/* Builds the website for Vercel: copies frontend/ and shared/ into dist/.
   Hidden files (.env, .env.example) are never copied. The API is not part of the
   website; vercel.json (written by scripts/configure-vercel.js) forwards /api/* to Render. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..'), out = path.join(root, 'dist');
const vj = path.join(root, 'vercel.json');
if (fs.existsSync(vj) && /YOUR-RENDER-SERVICE|"dest":\s*"\/api/.test(fs.readFileSync(vj, 'utf8'))) {
  console.error('vercel.json does not point to your backend yet. Fill in frontend/.env and run: node scripts/configure-vercel.js');
  process.exit(1);
}
const noHidden = src => !path.basename(src).startsWith('.');
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(path.join(root, 'frontend'), out, { recursive: true, filter: noHidden });
fs.cpSync(path.join(root, 'shared'), path.join(out, 'shared'), { recursive: true, filter: noHidden });
console.log('Website built in dist/');
