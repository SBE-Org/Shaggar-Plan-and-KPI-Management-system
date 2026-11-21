/* Notifications: mark one or all as read. */
const db = require('../db');
const { route, fail } = require('../lib/http');

route('POST', '/api/notifications/:id/read', ctx => { if (!ctx.user) fail(401, 'Sign in to continue.'); db.run('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', ctx.params.id, ctx.user.id); return { ok: true }; });
route('POST', '/api/notifications/read-all', ctx => { if (!ctx.user) fail(401, 'Sign in to continue.'); db.run('UPDATE notifications SET is_read = 1 WHERE user_id = ?', ctx.user.id); return { ok: true }; });
