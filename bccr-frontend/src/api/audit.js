import { request } from './client'

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
 * 待审核/待处理队列（GET /api/audit/pending）
 */
export function fetchPendingAuditQueue() {
  return request('/api/audit/pending', { method: 'GET' })
}

/**
 * 已处理记录（GET /api/audit/history?page=）
 * 若后端未实现，前端捕获后展示空列表即可。
 * @param {{ page?: number }} [params]
 */
export function fetchAuditHistory(params = {}) {
  const page = Math.max(1, Number(params.page) || 1)
  return request(`/api/audit/history?page=${page}`, { method: 'GET' })
}

/**
 * 通过审核（POST /api/audit/{id}/approve）
 * @param {string} id 举报/审核单 ID
 * @param {{ remark?: string }} [body]
 */
function compactRemark(body) {
  const r = body?.remark != null ? String(body.remark).trim() : ''
  if (!r) return undefined
  return { remark: r }
}

/**
 * 通过审核（POST /api/audit/{id}/approve）
 * @param {string} id 举报/审核单 ID
 * @param {{ remark?: string }} [body]
 */
export function approveAuditCase(id, body = {}) {
  const enc = encodeURIComponent(String(id ?? '').trim())
  if (!enc) throw new Error('缺少审核单 ID')
  const json = compactRemark(body)
  return request(`/api/audit/${enc}/approve`, {
    method: 'POST',
    ...(json ? { json } : {}),
  })
}

/**
 * 拒绝/驳回（POST /api/audit/{id}/reject）
 * @param {string} id
 * @param {{ remark?: string }} [body]
 */
export function rejectAuditCase(id, body = {}) {
  const enc = encodeURIComponent(String(id ?? '').trim())
  if (!enc) throw new Error('缺少审核单 ID')
  const json = compactRemark(body)
  return request(`/api/audit/${enc}/reject`, {
    method: 'POST',
    ...(json ? { json } : {}),
  })
}
