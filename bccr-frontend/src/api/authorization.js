import { request } from './client'

/**
 * 作品授权（/api/auth）— 对接 {@code AuthController}
 */

/**
 * @param {unknown} data
 * @returns {Record<string, unknown>[]}
 */
export function normalizeAuthorizationList(data) {
  if (Array.isArray(data)) {
    return /** @type {Record<string, unknown>[]} */ (data)
  }
  if (data && typeof data === 'object') {
    const d = /** @type {Record<string, unknown>} */ (data)
    const items =
      d.records ?? d.list ?? d.content ?? d.items ?? d.data
    if (Array.isArray(items)) {
      return /** @type {Record<string, unknown>[]} */ (items)
    }
  }
  return []
}

/**
 * 发起授权（POST /api/auth/authorize）
 * 请求体对应 {@code AuthorizeRequest}：workId、toAddress、authType、expireTime（可选）
 * @param {{
 *   workId: string
 *   granteeAddress?: string
 *   toAddress?: string
 *   authType?: string
 *   validUntil?: string
 *   expireTime?: string
 * }} body
 */
export function grantAuthorization(body) {
  const toAddress = String(
    body.toAddress ?? body.granteeAddress ?? '',
  ).trim()
  const json = {
    workId: String(body.workId ?? '').trim(),
    toAddress,
    authType: String(body.authType ?? 'non-exclusive').trim(),
  }
  const exp = body.expireTime ?? body.validUntil
  if (exp != null && String(exp).trim() !== '') {
    json.expireTime = String(exp).trim()
  }
  return request('/api/auth/authorize', {
    method: 'POST',
    json,
  })
}

/**
 * 撤销授权（POST /api/auth/{authId}/revoke），请求体可选 {@code RevokeRequest}：reason
 * @param {string} authId
 * @param {{ reason?: string }} [options]
 */
export function revokeAuthorization(authId, options = {}) {
  const id = encodeURIComponent(String(authId).trim())
  const reason =
    options.reason != null ? String(options.reason).trim() : ''
  if (reason) {
    return request(`/api/auth/${id}/revoke`, {
      method: 'POST',
      json: { reason },
    })
  }
  return request(`/api/auth/${id}/revoke`, { method: 'POST' })
}

/**
 * 单条授权（GET /api/auth/{authId}）
 * @param {string} authId
 */
export function fetchAuthorizationById(authId) {
  const id = encodeURIComponent(String(authId).trim())
  return request(`/api/auth/${id}`, { method: 'GET' })
}

/**
 * 链上授权信息（GET /api/auth/{authId}/onchain）
 * @param {string} authId
 */
export function fetchAuthOnChain(authId) {
  const id = encodeURIComponent(String(authId).trim())
  return request(`/api/auth/${id}/onchain`, { method: 'GET' })
}

/**
 * 某作品下授权分页（GET /api/auth/work/{workId}?page=&size=）
 * @param {string} workId
 * @param {{ page?: number, size?: number }} [params]
 */
export function fetchAuthorizationByWorkId(workId, params = {}) {
  const id = encodeURIComponent(String(workId).trim())
  const page = Math.max(1, Number(params.page) || 1)
  const size = Math.min(50, Math.max(1, Number(params.size) || 10))
  return request(`/api/auth/work/${id}?page=${page}&size=${size}`, {
    method: 'GET',
  })
}

/**
 * 当前用户作为授权方发出的记录（GET /api/auth/my/out?page=&size=）
 * @param {{ page?: number, size?: number }} [params]
 */
export function fetchAuthorizationFromMe(params = {}) {
  const page = Math.max(1, Number(params.page) || 1)
  const size = Math.min(50, Math.max(1, Number(params.size) || 10))
  const q = new URLSearchParams({
    page: String(page),
    size: String(size),
  })
  if (params.status != null && String(params.status).trim() !== '') {
    q.set('status', String(params.status).trim())
  }
  return request(`/api/auth/my/out?${q.toString()}`, {
    method: 'GET',
  })
}

/**
 * 当前用户作为被授权方收到的记录（GET /api/auth/my/in?page=&size=）
 * @param {{ page?: number, size?: number }} [params]
 */
export function fetchAuthorizationToMe(params = {}) {
  const page = Math.max(1, Number(params.page) || 1)
  const size = Math.min(50, Math.max(1, Number(params.size) || 10))
  return request(`/api/auth/my/in?page=${page}&size=${size}`, {
    method: 'GET',
  })
}

/**
 * 延续已过期授权（PUT /api/auth/{authId}/extend）
 * 请求体 {@code newExpireTime}：yyyy-MM-ddTHH:mm:ss；不传或空表示改为永久
 * @param {string} authId
 * @param {{ newExpireTime?: string }} [options]
 */
export function extendAuth(authId, options = {}) {
  const id = encodeURIComponent(String(authId).trim())
  const json = {}
  const exp = options.newExpireTime
  if (exp != null && String(exp).trim() !== '') {
    json.newExpireTime = String(exp).trim()
  }
  return request(`/api/auth/${id}/extend`, {
    method: 'PUT',
    json,
  })
}

/**
 * 刷新单条授权状态（检查是否过期）
 * PUT /api/auth/{authId}/refresh
 * @param {string} authId
 */
export function refreshAuthStatus(authId) {
  const id = encodeURIComponent(String(authId).trim())
  return request(`/api/auth/${id}/refresh`, { method: 'PUT' })
}

/**
 * 全量刷新所有过期授权状态（仅管理员）
 * PUT /api/auth/refresh/all
 * @returns {Promise<{ updatedCount?: number }>}
 */
export function refreshAllExpiredAuth() {
  return request('/api/auth/refresh/all', { method: 'PUT' })
}
