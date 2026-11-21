/* Internal messaging: one-to-one conversations between staff accounts
   (departments, the Mayor, the Mayor's Office, administrators).
   Only the two participants can read a conversation. */
const db = require('../db');
const { route, fail, rateLimit } = require('../lib/http');
const A = require('../lib/access');
const audit = require('../lib/audit');

const MAX_LEN = 2000;
const partner = (ctx, id) => {
  A.requirePerm(ctx.user, 'chat');
  const u = db.get('SELECT * FROM users WHERE id = ?', id) || fail(404, 'That person was not found.');
  if (u.id === ctx.user.id) fail(422, 'You cannot message yourself.');
  if (!u.active || !A.can(u, 'chat')) fail(422, 'That account cannot receive messages.');
  return u;
};
const row = m => ({ id: m.id, from: m.from_id, to: m.to_id, text: m.body, at: m.created_at, read: !!m.read_at });
const unreadCount = uid => db.get('SELECT COUNT(*) AS n FROM messages WHERE to_id = ? AND read_at IS NULL', uid).n;

/** Conversation list: the other person, the latest message and the unread count. */
function conversations(uid) {
  const out = new Map();
  for (const m of db.all('SELECT * FROM messages WHERE from_id = ? OR to_id = ? ORDER BY created_at DESC, id DESC', uid, uid)) {
    const other = m.from_id === uid ? m.to_id : m.from_id;
    let c = out.get(other); if (!c) out.set(other, c = { userId: other, last: row(m), unread: 0 });
    if (m.to_id === uid && !m.read_at) c.unread++;
  }
  return [...out.values()];
}
route('GET', '/api/chat', ctx => { A.requirePerm(ctx.user, 'chat'); return { conversations: conversations(ctx.user.id), unread: unreadCount(ctx.user.id) }; });
/* light call used for the menu counter */
route('GET', '/api/chat/unread', ctx => { A.requirePerm(ctx.user, 'chat'); return { unread: unreadCount(ctx.user.id) }; });
/* Messages with one person (latest 300). Opening the conversation marks incoming messages as read. */
route('GET', '/api/chat/with/:userId', ctx => {
  const u = partner(ctx, ctx.params.userId), me = ctx.user.id;
  const list = db.all('SELECT * FROM (SELECT * FROM messages WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?) ORDER BY created_at DESC, id DESC LIMIT 300) ORDER BY created_at, id', me, u.id, u.id, me);
  db.run('UPDATE messages SET read_at = ? WHERE to_id = ? AND from_id = ? AND read_at IS NULL', db.now(), me, u.id);
  return { messages: list.map(row), unread: unreadCount(me) };
});
route('POST', '/api/chat/with/:userId', ctx => {
  const u = partner(ctx, ctx.params.userId), text = String(ctx.body.text || '').trim();
  if (!text) fail(422, 'Write a message first.');
  if (text.length > MAX_LEN) fail(422, `Messages can be up to ${MAX_LEN} characters.`);
  if (!rateLimit('chat:' + ctx.user.id, 40, 60e3)) fail(429, 'You are sending messages too quickly. Wait a moment.');
  const m = { id: db.id('M'), from_id: ctx.user.id, to_id: u.id, body: text, created_at: db.now(), read_at: null };
  db.insert('messages', m);
  // the audit trail records that a message was sent, never its content
  if (!db.get('SELECT 1 AS x FROM messages WHERE ((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)) AND id <> ? LIMIT 1', m.from_id, m.to_id, m.to_id, m.from_id, m.id)) audit.log(ctx, 'Conversation started', 'Message', u.id, `with ${u.name}`);
  return { message: row(m) };
});
module.exports = { unreadCount };
