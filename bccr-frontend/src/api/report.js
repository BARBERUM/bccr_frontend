import { request } from './client'

/**
 * 举报作品（对接 BCCRight AuditController）
 * POST /api/audit/{workId}/report
 * Body: { reason } — ReportRequest 仅含 reason；补充说明并入同一字段。
 *
 * @param {{ workId: string; reason: string; detail?: string }} payload
 */
export async function submitWorkReport(payload) {
  const workId = String(payload.workId ?? '').trim()
  const reason = String(payload.reason ?? '').trim()
  const detail = payload.detail != null ? String(payload.detail).trim() : ''
  if (!workId) throw new Error('缺少作品 ID')
  if (!reason) throw new Error('请选择举报原因')

  let reasonText = reason
  if (detail) {
    reasonText = `${reason}｜${detail}`
  }

  const id = encodeURIComponent(workId)

  return request(`/api/audit/${id}/report`, {
    method: 'POST',
    json: { reason: reasonText },
  })
}
