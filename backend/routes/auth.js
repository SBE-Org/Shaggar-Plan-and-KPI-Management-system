/* Authentication: password + optional one-time code, sessions, profile. */
const db = require('../db');
const config = require('../config');
const { route, fail, cookie, rateLimit } = require('../lib/http');
const sec = require('../lib/security');
const audit = require('../lib/audit');
const { queue, sendEmail, isEmail } = require('../lib/notify');
const { ROLES } = require('../../shared/constants');

const maskEmail = e => { const [n, d] = String(e || '').split('@'); return d ? `${n.slice(0, 2)}${'•'.repeat(Math.max(2, Math.min(6, n.length - 2)))}@${d}` : '—'; };
const maskPhone = p => (p ? p.replace(/\s/g, '').slice(0, 4) + ' ••• ••• ' + p.replace(/\s/g, '').slice(-3) : '—');

function createSession(ctx, user, mfa) {
  const tok = sec.token(); const t = db.now();
  db.insert('sessions', { token_hash: sec.sha256(tok), user_id: user.id, created_at: t, last_seen: t, expires_at: new Date(Date.now() + 12 * 3600e3).toISOString(), ip: ctx.ip, user_agent: String(ctx.req.headers['user-agent'] || '').slice(0, 200) });
  db.update('users', { id: user.id }, { last_login: t, failed_attempts: 0, locked_until: null });
  ctx.headers['Set-Cookie'] = cookie(config.sessionCookie, tok, { maxAge: 12 * 3600 });
  audit.log({ user, ip: ctx.ip }, 'Signed in', 'Session', user.id, `${user.name} (${ROLES[user.role]})${mfa ? ' with two-step verification' : ''}`);
  return { ok: true, mustChange: !!user.must_change };
}

/** Resolve the signed-in user from the session cookie; enforces idle timeout. */
function sessionUser(ctx) {
  const tok = ctx.cookies[config.sessionCookie]; if (!tok) return null;
  const s = db.get('SELECT * FROM sessions WHERE token_hash = ?', sec.sha256(tok)); if (!s) return null;
  const idleMin = db.getSetting('security').sessionMin; const t = Date.now();
  if (Date.parse(s.expires_at) < t || t - Date.parse(s.last_seen) > idleMin * 60e3) {
    db.run('DELETE FROM sessions WHERE token_hash = ?', s.token_hash);
    const u = db.get('SELECT * FROM users WHERE id = ?', s.user_id);
    if (u) audit.log({ user: u, ip: ctx.ip }, 'Session expired', 'Session', u.id, `Signed out after ${idleMin} minutes of inactivity`);
    ctx.expired = true; return null;
  }
  if (t - Date.parse(s.last_seen) > 30e3) db.update('sessions', { token_hash: s.token_hash }, { last_seen: db.now() });
  ctx.sessionHash = s.token_hash;
  const u = db.get('SELECT * FROM users WHERE id = ?', s.user_id);
  return u && u.active ? u : null;
}

route('GET', '/api/public/branding', () => {
  const b = db.getSetting('branding'), s = db.getSetting('security'), sc = db.getSetting('scoring');
  return {
    branding: b, fy: sc.fy, stats: { depts: db.get('SELECT COUNT(*) n FROM departments WHERE active = 1').n, kpis: db.get('SELECT COUNT(*) n FROM kpis WHERE active = 1').n },
    security: { lockMin: s.lockMin, maxAttempts: s.maxAttempts, sessionMin: s.sessionMin },
    demo: config.demoMode ? { password: process.env.DEMO_PASSWORD || 'Shaggar@2026', accounts: db.all('SELECT u.name, u.username, u.role, d.short_name AS dept FROM users u LEFT JOIN departments d ON d.id = u.dept_id WHERE u.active = 1 ORDER BY u.id') } : null,
  };
});

route('POST', '/api/auth/login', async ctx => {
  if (!rateLimit('login:' + ctx.ip, config.loginRateLimit, 15 * 60e3)) fail(429, 'Too many sign-in attempts from this network. Wait 15 minutes.');
  const username = String(ctx.body.username || '').trim().toLowerCase(), password = String(ctx.body.password || '');
  const S = db.getSetting('security');
  const u = db.get('SELECT * FROM users WHERE lower(username) = ?', username);
  if (!u || !u.active) { audit.log({ ip: ctx.ip }, 'Login failed', 'Session', username || '-', `Unknown or disabled account "${username}"`); fail(401, 'The username or password is incorrect.'); }
  if (u.locked_until && Date.parse(u.locked_until) > Date.now()) { audit.log({ user: u, ip: ctx.ip }, 'Login blocked (account locked)', 'User', u.id, u.username); fail(423, `This account is locked after repeated failed attempts. Try again after ${new Date(u.locked_until).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}, or ask an administrator to unlock it.`); }
  if (!sec.verifyPassword(password, u.password_salt, u.password_hash)) {
    const failed = u.failed_attempts + 1;
    if (failed >= S.maxAttempts) {
      const until = new Date(Date.now() + S.lockMin * 60e3).toISOString();
      db.update('users', { id: u.id }, { failed_attempts: 0, locked_until: until });
      audit.log({ user: u, ip: ctx.ip }, 'Account locked', 'User', u.id, `${S.maxAttempts} failed sign-in attempts`, null, { lockedUntil: until });
      fail(423, `Too many failed attempts. The account is locked for ${S.lockMin} minutes.`);
    }
    db.update('users', { id: u.id }, { failed_attempts: failed });
    audit.log({ user: u, ip: ctx.ip }, 'Login failed', 'Session', u.id, 'Wrong password');
    fail(401, `The username or password is incorrect. ${S.maxAttempts - failed} attempt(s) left before the account is locked.`);
  }
  if (S.mfaRoles.includes(u.role)) {
    const code = sec.otpCode(), id = db.id('C'), short = db.getSetting('branding').shortName;
    db.insert('otp_challenges', { id, user_id: u.id, code_hash: sec.sha256(id + code), expires_at: new Date(Date.now() + 5 * 60e3).toISOString(), attempts: 0, created_at: db.now() });
    const channel = S.otpChannel === 'sms' ? 'sms' : 'email'; // sign-in codes go by email unless the policy says SMS
    if (channel === 'sms') {
      const gw = db.getSetting('notify').sms;
      if (u.phone) queue('sms', u.phone, u.id, `${short} sign-in code: ****** (valid 5 minutes)`, 'otp', `${short} sign-in code: ${code} (valid 5 minutes)`);
      audit.log({ user: u, ip: ctx.ip }, 'Password verified, verification code issued', 'Session', u.id, `One-time code sent to ${maskPhone(u.phone)}`);
      if (!gw.approved && !config.demoMode) fail(503, 'Two-step verification needs the SMS gateway, which is not approved yet. Ask the administrator.');
      return { mfa: true, challengeId: id, channel, to: maskPhone(u.phone), phone: maskPhone(u.phone), sent: !!gw.approved, devCode: config.demoMode ? code : undefined };
    }
    // The code is emailed directly and never stored in readable form; the outbox keeps a masked copy.
    let sent = false, why = '';
    if (!isEmail(u.email)) why = 'no email address is recorded for this account';
    else { try { await sendEmail(u.email, `${short} sign-in code`, `Your ${short} sign-in code is ${code}\n\nIt is valid for 5 minutes. If you did not try to sign in, tell your administrator and change your password.`); sent = true; } catch (e) { why = e.message; } }
    db.insert('outbox', { id: db.id('O'), channel: 'email', recipient: u.email || '-', user_id: u.id, text: `${short} sign-in code: ****** (valid 5 minutes)`, event: 'otp', status: sent ? 'sent' : 'failed', created_at: db.now(), sent_at: sent ? db.now() : null });
    audit.log({ user: u, ip: ctx.ip }, sent ? 'Password verified, verification code issued' : 'Verification code could not be emailed', 'Session', u.id, sent ? `One-time code emailed to ${maskEmail(u.email)}` : why);
    if (!sent && !config.demoMode) fail(503, `Your sign-in code could not be emailed: ${why}. Ask the administrator for help.`);
    return { mfa: true, challengeId: id, channel, to: maskEmail(u.email), sent, why: sent ? undefined : why, devCode: config.demoMode ? code : undefined };
  }
  return createSession(ctx, u, false);
});

route('POST', '/api/auth/otp', ctx => {
  const c = db.get('SELECT * FROM otp_challenges WHERE id = ?', String(ctx.body.challengeId || ''));
  if (!c) fail(400, 'Sign in again to get a new code.');
  const u = db.get('SELECT * FROM users WHERE id = ?', c.user_id);
  if (Date.parse(c.expires_at) < Date.now()) { db.run('DELETE FROM otp_challenges WHERE id = ?', c.id); audit.log({ user: u, ip: ctx.ip }, 'Verification code expired', 'Session', u.id); fail(400, 'The verification code expired. Sign in again to get a new code.'); }
  if (sec.sha256(c.id + String(ctx.body.code || '').trim()) !== c.code_hash) {
    const att = c.attempts + 1; audit.log({ user: u, ip: ctx.ip }, 'Verification code rejected', 'Session', u.id);
    if (att >= 3) { db.run('DELETE FROM otp_challenges WHERE id = ?', c.id); fail(400, 'Too many wrong codes. Sign in again to get a new code.'); }
    db.update('otp_challenges', { id: c.id }, { attempts: att }); fail(400, `That code is not correct. ${3 - att} attempt(s) left.`);
  }
  db.run('DELETE FROM otp_challenges WHERE id = ?', c.id);
  return createSession(ctx, u, true);
});

route('POST', '/api/auth/logout', ctx => {
  if (ctx.sessionHash) db.run('DELETE FROM sessions WHERE token_hash = ?', ctx.sessionHash);
  if (ctx.user) audit.log(ctx, 'Signed out', 'Session', ctx.user.id);
  ctx.headers['Set-Cookie'] = cookie(config.sessionCookie, '', { clear: true });
  return { ok: true };
});

route('GET', '/api/auth/me', ctx => {
  if (!ctx.user) fail(401, ctx.expired ? 'Your session ended after a period of inactivity. Sign in again.' : 'Not signed in.');
  const u = ctx.user; return { id: u.id, name: u.name, role: u.role, deptId: u.dept_id, mustChange: !!u.must_change, lang: u.lang };
});

route('POST', '/api/auth/password', ctx => {
  if (!ctx.user) fail(401, 'Sign in to continue.');
  const u = ctx.user;
  if (!sec.verifyPassword(ctx.body.current, u.password_salt, u.password_hash)) fail(400, 'The current password is not correct.');
  const err = sec.policyError(ctx.body.next, db.getSetting('security')); if (err) fail(400, err);
  const { hash, salt } = sec.hashPassword(ctx.body.next);
  db.update('users', { id: u.id }, { password_hash: hash, password_salt: salt, must_change: 0 });
  db.run('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?', u.id, ctx.sessionHash);
  audit.log(ctx, 'Password changed', 'User', u.id, u.username);
  return { ok: true };
});

route('PUT', '/api/profile', ctx => {
  if (!ctx.user) fail(401, 'Sign in to continue.');
  const u = ctx.user, b = ctx.body;
  const before = { phone: u.phone, email: u.email, pref_sms: u.pref_sms, pref_email: u.pref_email, lang: u.lang };
  if (b.email != null && !isEmail(b.email)) fail(422, 'Enter a valid email address. Your sign-in codes are sent to it.');
  const after = { phone: String(b.phone ?? u.phone ?? ''), email: String(b.email ?? u.email ?? '').trim(), pref_sms: b.prefSms ? 1 : 0, pref_email: b.prefEmail ? 1 : 0, lang: ['en', 'om', 'am'].includes(b.lang) ? b.lang : u.lang };
  db.update('users', { id: u.id }, after);
  audit.log(ctx, 'Profile updated', 'User', u.id, u.name, before, after);
  return { ok: true };
});

module.exports = { sessionUser };
