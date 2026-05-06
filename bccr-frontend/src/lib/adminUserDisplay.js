import { getRoleCodes } from '@/lib/roles'

/**
 * @param {Record<string, unknown>} r
 */
export function pickAdminUserKey(r) {
  return String(r.id ?? r.userId ?? r.username ?? r.loginName ?? r.account ?? '').trim()
}

/**
 * @param {Record<string, unknown>} r
 */
export function pickUsername(r) {
  return String(r.username ?? r.loginName ?? r.account ?? '').trim()
}

/**
 * @param {Record<string, unknown>} r
 */
export function pickNickname(r) {
  return String(r.nickname ?? r.nickName ?? r.name ?? '').trim()
}

/**
 * @param {Record<string, unknown>} r
 * @returns {string[]}
 */
/**
 * 从 Role 实体或字符串列表解析角色码（小写）
 * @param {unknown} roleRow
 */
export function pickRoleEntityCode(roleRow) {
  if (roleRow == null) return ''
  if (typeof roleRow === 'string') return roleRow.trim().toLowerCase()
  if (typeof roleRow === 'object') {
    const o = /** @type {Record<string, unknown>} */ (roleRow)
    const c = String(
      o.roleCode ?? o.code ?? o.role ?? o.authority ?? o.name ?? '',
    ).trim()
    return c.toLowerCase()
  }
  return ''
}

/**
 * @param {Record<string, unknown>} r
 * @returns {string[]}
 */
export function userRowRoleCodes(r) {
  const raw = r.roles
  if (Array.isArray(raw) && raw.length) {
    const codes = raw.map(pickRoleEntityCode).filter(Boolean)
    if (codes.length) return [...new Set(codes)]
  }
  return [...getRoleCodes(r)]
}

/**
 * @param {Record<string, unknown>} r
 * @returns {{ enabled: boolean, label: string, tone: 'ok' | 'bad' | 'muted' }}
 */
export function formatUserEnabled(r) {
  if (r.status === 0 || r.status === '0') return { enabled: false, label: '已停用', tone: 'bad' }
  if (r.status === 1 || r.status === '1') return { enabled: true, label: '正常', tone: 'ok' }
  if (r.enabled === true) return { enabled: true, label: '正常', tone: 'ok' }
  if (r.enabled === false) return { enabled: false, label: '已停用', tone: 'bad' }
  if (r.disabled === true) return { enabled: false, label: '已停用', tone: 'bad' }
  if (r.locked === true) return { enabled: false, label: '已锁定', tone: 'bad' }
  const st = String(r.status ?? r.accountStatus ?? '').trim().toLowerCase()
  if (st === 'disabled' || st === 'inactive' || st === 'locked' || st === 'banned') {
    return { enabled: false, label: '已停用', tone: 'bad' }
  }
  if (st === 'active' || st === 'enabled' || st === 'normal') {
    return { enabled: true, label: '正常', tone: 'ok' }
  }
  return { enabled: true, label: '正常', tone: 'muted' }
}

/**
 * @param {Record<string, unknown>|null|undefined} me
 * @param {Record<string, unknown>} row
 */
export function isSameUser(me, row) {
  if (!me || typeof me !== 'object') return false
  const m = /** @type {Record<string, unknown>} */ (me)
  const mu = String(m.username ?? m.loginName ?? m.account ?? '').trim()
  const ru = pickUsername(row)
  if (mu && ru && mu === ru) return true
  const mid = String(m.id ?? m.userId ?? '').trim()
  const rid = String(row.id ?? row.userId ?? '').trim()
  return Boolean(mid && rid && mid === rid)
}
