import { extractToken, normalizeMediaSrc, request, requestMultipart } from './client'

/** @param {{ username: string, password: string }} body */
export async function login(body) {
  const data = await request('/api/user/login', {
    method: 'POST',
    json: body,
  })
  return { token: extractToken(data), raw: data }
}

/**
 * 注册：multipart/form-data（username, password, email?, avatar?, role?）
 * @param {FormData} formData
 */
export async function registerMultipart(formData) {
  const data = await requestMultipart('/api/user/register', {
    method: 'POST',
    body: formData,
  })
  return { token: extractToken(data), raw: data }
}

export function fetchMe() {
  return request('/api/user/me', { method: 'GET' })
}

/**
 * 按用户名查询链上地址与展示信息（GET /api/user/address?username=）
 * @param {string} username
 * @returns {Promise<{ username?: string, nickname?: string, blockchainAddress?: string, avatar?: string }>}
 */
export function fetchUserAddressByUsername(username) {
  const q = encodeURIComponent(String(username ?? '').trim())
  if (!q) {
    return Promise.reject(new Error('用户名不能为空'))
  }
  return request(`/api/user/address?username=${q}`, { method: 'GET' })
}

/**
 * 规范化用户搜索接口返回的列表。
 * 后端 GET /api/user/search 的 data 为用户对象数组时直接使用；亦兼容分页等包装结构。
 * @param {unknown} data
 * @returns {Record<string, unknown>[]}
 */
export function normalizeUserSearchList(data) {
  if (!data) return []
  if (Array.isArray(data)) {
    return /** @type {Record<string, unknown>[]} */ (data.filter((x) => x && typeof x === 'object'))
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
 * 按关键字搜索用户（GET /api/user/search?keyword=）
 * 与 UserController#searchUsers 一致；data 为含 username、nickname、avatar、blockchainAddress 的对象数组。
 * @param {string} keyword
 * @returns {Promise<Record<string, unknown>[]>} 实际为 request() 解析后的 data
 */
export function searchUsersByKeyword(keyword) {
  const q = encodeURIComponent(String(keyword ?? '').trim())
  if (!q) {
    return Promise.resolve([])
  }
  return request(`/api/user/search?keyword=${q}`, { method: 'GET' })
}

/** @param {File} file */
export function uploadAvatar(file) {
  const fd = new FormData()
  fd.append('file', file)
  return requestMultipart('/api/user/avatar', {
    method: 'POST',
    body: fd,
  })
}

export async function fetchAvatarUrlResolved() {
  const data = await request('/api/user/avatar', { method: 'GET' })
  return extractAvatarUrl(data)
}

/**
 * @param {unknown} data
 * @returns {string}
 */
export function extractAvatarUrl(data) {
  if (data == null) return ''
  if (typeof data === 'string') return normalizeMediaSrc(data)
  if (typeof data === 'object') {
    const o = /** @type {Record<string, unknown>} */ (data)
    const u = o.url ?? o.avatarUrl ?? o.avatar ?? o.data
    return typeof u === 'string' ? normalizeMediaSrc(u) : ''
  }
  return ''
}

/**
 * @param {{ nickname?: string, phone?: string, email?: string }} body
 */
export function updateProfile(body) {
  return request('/api/user/profile', {
    method: 'PUT',
    json: body,
  })
}
