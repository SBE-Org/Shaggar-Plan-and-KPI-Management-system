/* Append-only audit trail. Every important action calls audit.log(). */
const db = require('../db');
const { auditCategory } = require('../../shared/constants');

/**
 * @param ctx     { user, ip } of the caller, or null for automated (system) actions
 * @param action  human-readable verb phrase, e.g. 'Submission approved'
 */
function log(ctx, action, entity, entityId, details = '', before = null, after = null) {
  const u = ctx && ctx.user;
  db.insert('audit_log', {
    id: db.id('A'), at: db.now(), user_id: u ? u.id : null, role: u ? u.role : 'system',
    action, category: auditCategory(action), entity, entity_id: entityId == null ? null : String(entityId),
    details: details || '', before_json: before == null ? null : JSON.stringify(before), after_json: after == null ? null : JSON.stringify(after),
    ip: ctx && ctx.ip ? ctx.ip : null,
  });
}
/** Returns the fields that differ between two flat objects. */
function diff(a = {}, b = {}) {
  const out = {}; for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out[k] = true;
  return out;
}
module.exports = { log, diff };
