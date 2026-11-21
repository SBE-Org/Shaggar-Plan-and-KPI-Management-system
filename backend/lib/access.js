/* Role-based access control and department scoping. Every route checks here. */
const db = require('../db');
const { fail } = require('./http');

let permCache = null;
function permissions() {
  if (!permCache) { permCache = {}; for (const r of db.all('SELECT role, permission FROM role_permissions')) (permCache[r.role] ||= new Set()).add(r.permission); }
  return permCache;
}
function resetPermCache() { permCache = null; }

function can(user, perm) { return !!user && !!user.active && !!permissions()[user.role]?.has(perm); }
function requirePerm(user, ...perms) {
  if (!user) fail(401, 'Sign in to continue.');
  if (!perms.some(p => can(user, p))) fail(403, 'Your role is not allowed to do this.');
}
/** Department ids the user may see. City-wide roles see all; department roles see their own. */
function scopeIds(user) {
  if (!user) return [];
  const all = db.all('SELECT id FROM departments WHERE active = 1').map(r => r.id);
  if (can(user, 'all_depts') || (!user.dept_id && ['super_admin', 'kpi_officer', 'mayor', 'mayor_admin', 'auditor'].includes(user.role))) return all;
  return user.dept_id ? [user.dept_id] : [];
}
function requireScope(user, deptId) { if (!scopeIds(user).includes(deptId)) fail(403, 'This record belongs to a department outside your access scope.'); }

/** Who may see a service request */

module.exports = { can, requirePerm, scopeIds, requireScope, permissions, resetPermCache };
