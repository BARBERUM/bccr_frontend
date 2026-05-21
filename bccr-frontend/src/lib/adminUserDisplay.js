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

/**
 * @param {Record<string, unknown>} row
 * @param {string[]} keys
 */
function pickFirstStringField(row, keys) {
  if (!row || typeof row !== 'object') return ''
  const o = /** @type {Record<string, unknown>} */ (row)
  for (const k of keys) {
    const v = o[k]
    if (v == null) continue
    const s = String(v).trim()
    if (s !== '') return s
  }
  return ''
}

/**
 * @param {Record<string, unknown>} row
 * @param {string[]} keys
 * @returns {unknown}
 */
function pickFirstScalar(row, keys) {
  if (!row || typeof row !== 'object') return undefined
  const o = /** @type {Record<string, unknown>} */ (row)
  for (const k of keys) {
    const v = o[k]
    if (v == null) continue
    if (typeof v === 'number' && !Number.isNaN(v)) return v
    if (typeof v === 'string' && v.trim() !== '') return v
  }
  return undefined
}

/** 列表展示用用户主键（优先数值 id） */
export function pickAdminUserIdDisplay(row) {
  return pickFirstStringField(row, ['id', 'userId', 'uid'])
}

export function pickUserEmail(row) {
  return pickFirstStringField(row, ['email', 'mail', 'userEmail', 'user_mail'])
}

export function pickRegisterIp(row) {
  return pickFirstStringField(row, [
    'registerIp',
    'regIp',
    'registrationIp',
    'signupIp',
    'register_ip',
    'reg_ip',
    'createdFromIp',
    'createIp',
    'registerFromIp',
    'registerClientIp',
    'signup_ip',
  ])
}

/** 最近一次登录 IP */
export function pickLoginIp(row) {
  return pickFirstStringField(row, [
    'lastLoginIp',
    'loginIp',
    'lastIp',
    'last_login_ip',
    'recentLoginIp',
    'lastLoginIP',
    'login_ip',
    'lastLoginClientIp',
  ])
}

/** 原始值供格式化（支持时间戳毫秒/秒） */
export function pickLastLoginAtRaw(row) {
  const v = pickFirstScalar(row, [
    'lastLoginTime',
    'lastLoginAt',
    'lastLogin',
    'lastActiveTime',
    'last_access_time',
    'last_login_time',
    'lastAccessTime',
    'recentLoginTime',
  ])
  return v
}

export function pickRegisterAtRaw(row) {
  const v = pickFirstScalar(row, [
    'createTime',
    'createdAt',
    'gmtCreate',
    'registerTime',
    'registrationTime',
    'joinTime',
    'registeredAt',
    'create_time',
    'gmt_created',
  ])
  return v
}

/**
 * @param {unknown} v
 * @returns {string}
 */
export function formatAdminListDateTime(v) {
  if (v == null || v === '') return '—'
  if (typeof v === 'number') {
    let ms = v
    if (v > 0 && v < 1e12) ms = v * 1000
    const d = new Date(ms)
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('zh-CN', { hour12: false })
  }
  const s = String(v).trim()
  if (!s) return '—'
  const d = new Date(s)
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleString('zh-CN', { hour12: false })
  }
  return s
}
