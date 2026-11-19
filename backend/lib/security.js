/* Cryptography helpers: password hashing, tokens, encryption of backups. */
const crypto = require('node:crypto');
const config = require('../config');

function hashPassword(password, salt = crypto.randomBytes(16).toString('base64'), iterations = config.passwordIterations) {
  const hash = crypto.pbkdf2Sync(String(password), Buffer.from(salt, 'base64'), iterations, 32, 'sha256').toString('base64');
  return { hash: `pbkdf2$${iterations}$${hash}`, salt };
}
function verifyPassword(password, salt, stored) {
  const [, iter, expected] = String(stored).split('$');
  const { hash } = hashPassword(password, salt, Number(iter));
  const a = Buffer.from(hash), b = Buffer.from(stored);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function policyError(pw, policy) {
  pw = String(pw || '');
  if (pw.length < policy.pwMin) return `Use at least ${policy.pwMin} characters.`;
  if (policy.pwComplex && !(/[A-Z]/.test(pw) && /[a-z]/.test(pw) && /\d/.test(pw) && /[^A-Za-z0-9]/.test(pw))) return 'Include upper- and lower-case letters, a number and a symbol.';
  return '';
}
const token = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');
const otpCode = () => String(crypto.randomInt(100000, 1000000));
function tempPassword() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  return 'Tmp-' + Array.from(crypto.randomBytes(8), b => c[b % c.length]).join('') + '!7';
}

// AES-256-GCM with a key derived from a passphrase (for downloadable backups)
function encrypt(buffer, passphrase) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12), iterations = 210000;
  const key = crypto.pbkdf2Sync(passphrase, salt, iterations, 32, 'sha256');
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([c.update(buffer), c.final()]);
  return { format: 'shaggar-pms-backup', version: 2, cipher: 'AES-256-GCM', kdf: 'PBKDF2-SHA256', iterations, salt: salt.toString('base64'), iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64'), checksum: sha256(buffer) };
}
function decrypt(obj, passphrase) {
  const key = crypto.pbkdf2Sync(passphrase, Buffer.from(obj.salt, 'base64'), obj.iterations, 32, 'sha256');
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(obj.iv, 'base64'));
  d.setAuthTag(Buffer.from(obj.tag, 'base64'));
  const out = Buffer.concat([d.update(Buffer.from(obj.data, 'base64')), d.final()]);
  if (obj.checksum && sha256(out) !== obj.checksum) throw new Error('checksum');
  return out;
}
function hmac(secret, body) { return crypto.createHmac('sha256', secret).update(body).digest('hex'); }

module.exports = { hashPassword, verifyPassword, policyError, token, sha256, otpCode, tempPassword, encrypt, decrypt, hmac };
