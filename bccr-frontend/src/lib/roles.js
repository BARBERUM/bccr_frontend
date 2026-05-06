/**
 * @param {Record<string, unknown>|null|undefined} user
 * @returns {Set<string>}
 */
export function getRoleCodes(user) {
  if (!user || typeof user !== 'object') return new Set()

  const out = []

  const push = (v) => {
    if (v == null) return
    if (typeof v === 'string' && v.trim()) out.push(v.trim().toLowerCase())
  }

  const arr = user.roles ?? user.roleList ?? user.authorities
  if (Array.isArray(arr)) {
    for (const r of arr) {
      if (typeof r === 'string') push(r)
      else if (r && typeof r === 'object') {
        push(/** @type {any} */ (r).role ?? /** @type {any} */ (r).roleCode ?? /** @type {any} */ (r).code)
      }
    }
  }

  push(/** @type {any} */ (user).role)
  push(/** @type {any} */ (user).roleCode)

  const codes = /** @type {any} */ (user).roleCodes
  if (Array.isArray(codes)) codes.forEach((c) => push(String(c)))

  return new Set(out)
}

/**
 * @param {Record<string, unknown>|null|undefined} user
 * @param {string[]} roles
 */
export function hasAnyRole(user, roles) {
  if (!roles?.length) return true
  const set = getRoleCodes(user)
  return roles.some((r) => set.has(String(r).toLowerCase()))
}

/**
 * @param {Record<string, unknown>|null|undefined} user
 */
export function formatRoleLabels(user) {
  const map = {
    admin: '超级管理员',
    auditor: '审核员',
    user: '普通用户',
    agent: '版权代理',
  }
  return [...getRoleCodes(user)].map((c) => map[c] ?? c)
}
