/* Notifications: always in-system; SMS / email go through the outbox and are
   delivered only after the gateway is approved (Notifications → Channels). */
const db = require('../db');
const config = require('../config');
const access = require('./access');

/** Send a notification to users. excludeId: usually the acting user.
    link: what the notification is about, as "kind:id" (sub, kpiprop, kpi, tp, cap, req, emp, alerts),
    so a click opens that record. */
function notify(userIds, text, event = 'general', excludeId = null, link = null) {
  const settings = db.getSetting('notify');
  const rule = (settings && settings.events[event]) || {};
  for (const id of [...new Set((userIds || []).filter(Boolean))]) {
    if (id === excludeId) continue;
    const u = db.get('SELECT id, phone, email, pref_sms, pref_email, active FROM users WHERE id = ?', id);
    if (!u || !u.active) continue;
    db.insert('notifications', { id: db.id('N'), user_id: id, text, event, link, is_read: 0, created_at: db.now() });
    for (const ch of ['sms', 'email']) {
      if (!rule[ch]) continue;
      if ((ch === 'sms' && !u.pref_sms) || (ch === 'email' && !u.pref_email)) continue;
      const to = ch === 'sms' ? u.phone : u.email; if (!to) continue;
      queue(ch, to, id, text, event);
    }
  }
}
/** secretText (e.g. a one-time code) is delivered but never stored; the outbox keeps `text`. */
function queue(channel, recipient, userId, text, event, secretText = null) {
  const row = { id: db.id('O'), channel, recipient, user_id: userId, text, event, status: 'held', created_at: db.now(), sent_at: null };
  db.insert('outbox', row);
  const gw = db.getSetting('notify')?.[channel];
  if (gw && gw.approved) deliver(row, secretText).catch(() => {});
  return row;
}
/* ---------- email ----------
   Sent through an HTTPS email service, because most hosts block direct mail
   ports. Set BREVO_API_KEY or RESEND_API_KEY, plus EMAIL_FROM (an address
   verified with that service). EMAIL_API_URL remains for a custom gateway. */
const emailProvider = () => (config.brevoApiKey ? 'brevo' : config.resendApiKey ? 'resend' : config.emailApiUrl ? 'custom' : null);
const isEmail = v => /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(String(v || '').trim());
/** Send one email. Resolves with the provider name; rejects with a readable reason. */
async function sendEmail(to, subject, text) {
  const p = emailProvider(); if (!p) throw new Error('no email service is set up on the server');
  if (!isEmail(to)) throw new Error('the email address is not valid');
  const gw = db.getSetting('notify')?.email || {}, br = db.getSetting('branding') || {};
  const from = config.emailFrom || gw.from, name = config.emailFromName || br.shortName || br.systemName || 'Performance system';
  if (p !== 'custom' && !isEmail(from)) throw new Error('EMAIL_FROM is not set to a valid sender address');
  let r;
  try {
    if (p === 'brevo') r = await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', 'api-key': config.brevoApiKey }, body: JSON.stringify({ sender: { email: from, name }, to: [{ email: to }], subject, textContent: text }), signal: AbortSignal.timeout(15000) });
    else if (p === 'resend') r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${config.resendApiKey}` }, body: JSON.stringify({ from: `${name} <${from}>`, to: [to], subject, text }), signal: AbortSignal.timeout(15000) });
    else r = await fetch(config.emailApiUrl, { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${config.emailApiToken}` }, body: JSON.stringify({ to, from, subject, text }), signal: AbortSignal.timeout(15000) });
  } catch (e) { throw new Error(`the email service could not be reached (${e.name === 'TimeoutError' ? 'timed out' : e.message})`); }
  if (!r.ok) { let why = ''; try { const j = await r.json(); why = j.message || j.error?.message || j.error || ''; } catch (e) {} throw new Error(`the email service refused the message (${r.status}${why ? ': ' + String(why).slice(0, 140) : ''})`); }
  return p;
}

/** Deliver one outbox row through the configured HTTP gateway. */
async function deliver(row, secretText = null) {
  if (row.channel === 'email') {
    if (!emailProvider()) return; // approved but no email service configured: stays held
    try { await sendEmail(row.recipient, `${db.getSetting('branding')?.shortName || 'Performance system'} notification`, secretText || row.text); db.update('outbox', { id: row.id }, { status: 'sent', sent_at: db.now() }); }
    catch { db.update('outbox', { id: row.id }, { status: 'failed' }); }
    return;
  }
  const url = row.channel === 'sms' ? config.smsGatewayUrl : config.emailApiUrl;
  const tokenV = row.channel === 'sms' ? config.smsGatewayToken : config.emailApiToken;
  if (!url) return; // approved but no gateway configured: stays held
  try {
    const gw = db.getSetting('notify')[row.channel];
    const body = row.channel === 'sms' ? { to: row.recipient, from: gw.sender, message: secretText || row.text } : { to: row.recipient, from: gw.from, subject: 'Shaggar PMS notification', text: secretText || row.text };
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenV}` }, body: JSON.stringify(body) });
    db.update('outbox', { id: row.id }, { status: r.ok ? 'sent' : 'failed', sent_at: db.now() });
  } catch { db.update('outbox', { id: row.id }, { status: 'failed' }); }
}
async function releaseHeld(channel) { const rows = db.all("SELECT * FROM outbox WHERE channel = ? AND status = 'held'", channel); for (const r of rows) await deliver(r); return rows.length; }

/** POST a signed JSON payload to active webhooks subscribed to the event. */
function webhook(event, payload) {
  const { hmac } = require('./security');
  for (const h of db.all('SELECT * FROM webhooks WHERE active = 1')) {
    if (!h.events.split(',').includes(event)) continue;
    const body = JSON.stringify({ event, at: db.now(), data: payload });
    fetch(h.url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shaggar-Event': event, 'X-Shaggar-Signature': 'sha256=' + hmac(h.secret, body) }, body }).catch(() => {});
  }
}
const usersWith = (perm, deptId = null) => db.all('SELECT * FROM users WHERE active = 1').filter(u => access.can(u, perm) && (deptId == null || access.scopeIds(u).includes(deptId))).map(u => u.id);
const usersByRole = role => db.all('SELECT id FROM users WHERE active = 1 AND role = ?', role).map(u => u.id);

module.exports = { notify, queue, deliver, releaseHeld, webhook, usersWith, usersByRole, sendEmail, emailProvider, isEmail };
