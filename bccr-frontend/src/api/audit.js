import { request } from './client'
import { normalizeListPage, normalizeWorkIdParam } from './work'

/**
 * 审核中心（/api/audit）
 * 与 BCCRight AuditController 常见约定：待办列表、通过/拒绝。
 */

/**
 * @param {unknown} data
 * @returns {Record<string, unknown>[]}
 */
export function normalizeAuditList(data) {
  if (!data) return []
  if (Array.isArray(data)) {
    return /** @type {Record<string, unknown>[]} */ (
      data.filter((x) => x && typeof x === 'object')
    )
  }
  if (typeof data === 'object') {
    const d = /** @type {Record<string, unknown>} */ (data)
    const items =
      d.records ?? d.list ?? d.content ?? d.items ?? d.rows ?? d.data
    if (Array.isArray(items)) {
      return /** @type {Record<string, unknown>[]} */ (
        items.filter((x) => x && typeof x === 'object')
      )
    }
  }
  return []
}

/**
 * 待审核作品分页（GET /api/audit/pending?page=&size=）
 * @param {{ page?: number, size?: number }} [params]
 */
export function fetchPendingAuditQueue(params = {}) {
  const page = Math.max(1, Number(params.page) || 1)
  let size = Math.min(50, Math.max(1, Number(params.size) || 20))
  return request(`/api/audit/pending?page=${page}&size=${size}`, { method: 'GET' })
}

/** @param {unknown} data */
export function normalizeAuditWorkPage(data) {
  return normalizeListPage(data)
}

/**
 * 审核日志分页（与 MyBatis IPage / 常见 records 字段一致）
 * @param {unknown} data
 */
export function normalizeAuditLogPage(data) {
  return normalizeListPage(data)
}

/**
 * 分页查询审核历史 GET /api/audit/logs
 * @param {{ page?: number, size?: number, action?: string, workId?: string }} [params]
 */
export function fetchAuditLogs(params = {}) {
  const q = new URLSearchParams()
  let page = Math.max(1, Number(params.page) || 1)
  let size = Number(params.size) || 10
  if (size > 50) size = 50
  if (size < 1) size = 10
  q.set('page', String(page))
  q.set('size', String(size))
  const action = params.action != null ? String(params.action).trim() : ''
  if (action) q.set('action', action)
  const workId = normalizeWorkIdParam(params.workId != null ? String(params.workId) : '')
  if (workId) q.set('workId', workId)
  return request(`/api/audit/logs?${q.toString()}`, { method: 'GET' })
}

/**
 * 某作品全部审核历史 GET /api/audit/logs/work/{workId}
 * @param {string} workId
 */
export function fetchWorkAuditLogs(workId) {
  const id = encodeURIComponent(normalizeWorkIdParam(workId))
  if (!id) return Promise.reject(new Error('缺少作品 ID'))
  return request(`/api/audit/logs/work/${id}`, { method: 'GET' })
}

/**
 * @deprecated 请使用 {@link fetchAuditLogs}
 */
export function fetchAuditHistory(params = {}) {
  return fetchAuditLogs({ page: params.page, size: 10 })
}

function compactRemark(body) {
  const r = body?.remark != null ? String(body.remark).trim() : ''
  if (!r) return undefined
  return { remark: r }
}

/**
 * 通过审核（POST /api/audit/{workId}/approve）
 * 路径参数为业务作品 ID（如 work-uuid），与作品详情接口一致。
 * @param {string} workId
 * @param {{ remark?: string }} [body]
 */
export function approveAuditCase(workId, body = {}) {
  const enc = encodeURIComponent(normalizeWorkIdParam(workId))
  if (!enc) throw new Error('缺少作品 ID')
  const json = compactRemark(body)
  return request(`/api/audit/${enc}/approve`, {
    method: 'POST',
    ...(json ? { json } : {}),
  })
}

/**
 * 拒绝/驳回（POST /api/audit/{workId}/reject）
 * @param {string} workId 业务作品 ID
 * @param {{ remark?: string }} [body]
 */
export function rejectAuditCase(workId, body = {}) {
  const enc = encodeURIComponent(normalizeWorkIdParam(workId))
  if (!enc) throw new Error('缺少作品 ID')
  const json = compactRemark(body)
  return request(`/api/audit/${enc}/reject`, {
    method: 'PUT',
    ...(json ? { json } : {}),
  })
}
