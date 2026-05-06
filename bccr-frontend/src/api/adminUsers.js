import { request } from './client'

/**
 * 管理员用户操作 — 与 {@code UserController} {@code /api/user} 对齐
 *
 * 已有：
 * - GET    /api/user/list?page=&size=&keyword=
 * - PUT    /api/user/{userId}/enable
 * - PUT    /api/user/{userId}/disable
 * - PUT    /api/user/{userId}/role           — body: RoleRequest，如 { "role": "auditor" }
 * - GET    /api/user/{userId}/roles          — List&lt;Role&gt;
 * - DELETE /api/user/{userId}                — 删除用户
 *
 * 建议后端补充（收回角色，当前控制器无对应接口）：
 * - DELETE /api/user/{userId}/role/{roleCode}
 */

/**
 * @param {unknown} data
 * @returns {Record<string, unknown>[]}
 */
export function normalizeAdminUserList(data) {
  if (!data) return []
  if (Array.isArray(data)) {
    return /** @type {Record<string, unknown>[]} */ (
      data.filter((x) => x && typeof x === 'object')
    )
  }
  if (typeof data === 'object') {
    const d = /** @type {Record<string, unknown>} */ (data)
    const items =
      d.records ?? d.list ?? d.content ?? d.items ?? d.users ?? d.rows ?? d.data
    if (Array.isArray(items)) {
      return /** @type {Record<string, unknown>[]} */ (
        items.filter((x) => x && typeof x === 'object')
      )
    }
  }
  return []
}

/**
 * @param {unknown} data
 */
export function normalizeAdminUserPage(data) {
  const list = normalizeAdminUserList(data)
  if (data == null || typeof data !== 'object') {
    return { records: list, total: list.length, page: 1, size: 10, pages: 1 }
  }
  const d = /** @type {Record<string, unknown>} */ (data)
  const total = Number(d.total ?? d.totalElements ?? list.length) || list.length
  let size = Number(d.size ?? d.pageSize ?? 10) || 10
  if (size > 50) size = 50
  if (size < 1) size = 10
  let page = 1
  if (d.current != null) page = Number(d.current) || 1
  else if (typeof d.number === 'number') page = d.number + 1
  else if (d.page != null) page = Number(d.page) || 1
  const pages = total === 0 ? 0 : Math.ceil(total / size)
  return { records: list, total, page, size, pages }
}

/**
 * @param {{ page?: number, size?: number, keyword?: string }} [params]
 */
export function fetchAdminUserList(params = {}) {
  const page = Math.max(1, Number(params.page) || 1)
  const size = Math.min(50, Math.max(1, Number(params.size) || 10))
  const q = new URLSearchParams()
  q.set('page', String(page))
  q.set('size', String(size))
  if (params.keyword != null && String(params.keyword).trim() !== '') {
    q.set('keyword', String(params.keyword).trim())
  }
  return request(`/api/user/list?${q.toString()}`, { method: 'GET' })
}

/**
 * @param {string|number} userId
 * @returns {Promise<unknown>} List&lt;Role&gt; 解析后的 data
 */
export function fetchUserRoles(userId) {
  const id = encodeURIComponent(String(userId ?? '').trim())
  if (!id) return Promise.reject(new Error('缺少用户 ID'))
  return request(`/api/user/${id}/roles`, { method: 'GET' })
}

/**
 * @param {unknown} data
 * @returns {Record<string, unknown>[]}
 */
export function normalizeRolesList(data) {
  if (!Array.isArray(data)) return []
  return /** @type {Record<string, unknown>[]} */ (
    data.filter((x) => x && typeof x === 'object')
  )
}

/**
 * @param {string|number} userId
 */
export function putUserEnable(userId) {
  const id = encodeURIComponent(String(userId ?? '').trim())
  if (!id) return Promise.reject(new Error('缺少用户 ID'))
  return request(`/api/user/${id}/enable`, { method: 'PUT' })
}

/**
 * @param {string|number} userId
 */
export function putUserDisable(userId) {
  const id = encodeURIComponent(String(userId ?? '').trim())
  if (!id) return Promise.reject(new Error('缺少用户 ID'))
  return request(`/api/user/${id}/disable`, { method: 'PUT' })
}

/**
 * RoleRequest：至少包含 role 字段（与后端 DTO 一致）
 * @param {string|number} userId
 * @param {string} role
 */
export function putUserRole(userId, role) {
  const id = encodeURIComponent(String(userId ?? '').trim())
  const r = String(role ?? '').trim().toLowerCase()
  if (!id || !r) return Promise.reject(new Error('缺少用户或角色'))
  return request(`/api/user/${id}/role`, {
    method: 'PUT',
    json: { role: r },
  })
}

/**
 * 收回角色 — 需后端增加 DELETE /api/user/{userId}/role/{roleCode}
 * @param {string|number} userId
 * @param {string} role
 */
export function deleteUserRole(userId, role) {
  const id = encodeURIComponent(String(userId ?? '').trim())
  const r = encodeURIComponent(String(role ?? '').trim().toLowerCase())
  if (!id || !r) return Promise.reject(new Error('缺少用户或角色'))
  return request(`/api/user/${id}/role/${r}`, { method: 'DELETE' })
}

/**
 * @param {string|number} userId
 */
export function deleteUser(userId) {
  const id = encodeURIComponent(String(userId ?? '').trim())
  if (!id) return Promise.reject(new Error('缺少用户 ID'))
  return request(`/api/user/${id}`, { method: 'DELETE' })
}
