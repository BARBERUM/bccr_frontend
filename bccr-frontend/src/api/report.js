import { postReportWork } from './interaction'

/**
 * 举报作品（对接 InteractionController）
 * POST /api/interaction/report/{workId}
 * Body: { reason }；补充说明并入同一 reason 字符串。
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

  return postReportWork(workId, reasonText)
}
