import { request } from './client'
import { normalizeWorkIdParam } from './work'

function encWorkId(workId) {
  return encodeURIComponent(normalizeWorkIdParam(String(workId ?? '')))
}

/**
 * @param {unknown} data
 * @returns {{ records: Record<string, unknown>[], total: number, page: number, size: number, pages: number }}
 */
export function normalizeInteractionPage(data) {
  const list = normalizeRecordArray(data)
  if (data == null || typeof data !== 'object') {
    return { records: list, total: list.length, page: 1, size: 10, pages: 1 }
  }
  const d = /** @type {Record<string, unknown>} */ (data)
  const total = Number(d.total ?? d.totalElements ?? list.length) || list.length
  let size = Number(d.pageSize ?? d.size ?? 10) || 10
  if (size > 50) size = 50
  if (size < 1) size = 10
  let page = 1
  if (d.pageNum != null) page = Number(d.pageNum) || 1
  else if (d.current != null) page = Number(d.current) || 1
  else if (typeof d.number === 'number') page = d.number + 1
  else if (d.page != null) page = Number(d.page) || 1
  const pages = Number(d.pages) || (total === 0 ? 0 : Math.ceil(total / size))
  return { records: list, total, page, size, pages }
}

/** @param {unknown} data */
function normalizeRecordArray(data) {
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
 * @param {Record<string, unknown>} row
 */
export function normalizeComment(row) {
  const id = String(row.id ?? row.commentId ?? '').trim()
  const uidRaw = row.userId ?? row.uid ?? row.user_id
  const userId =
    uidRaw != null && uidRaw !== '' && !Number.isNaN(Number(uidRaw)) ? Number(uidRaw) : NaN
  const parentRaw = row.parentId ?? row.parent_id ?? 0
  const parentId = parentRaw != null ? Number(parentRaw) || 0 : 0
  const replyToRaw = row.replyToUserId ?? row.reply_to_user_id
  const replyToUserId =
    replyToRaw != null && replyToRaw !== '' && !Number.isNaN(Number(replyToRaw))
      ? Number(replyToRaw)
      : null
  const nickname = String(
    row.nickname ??
      row.nickName ??
      row.username ??
      row.loginName ??
      row.userName ??
      row.authorName ??
      '用户',
  ).trim()
  const content = String(row.content ?? row.text ?? '').trim()
  const createdAt = row.createTime ?? row.createdAt ?? row.gmtCreate ?? row.time ?? ''
  const replyCount = Number(row.replyCount ?? row.repliesCount ?? row.childrenCount ?? 0) || 0
  return {
    id,
    userId,
    parentId,
    replyToUserId,
    nickname: nickname || '用户',
    content,
    createdAt,
    replyCount,
    raw: row,
  }
}

/** @param {unknown} data */
export function normalizeLikeMap(data) {
  if (data && typeof data === 'object' && 'liked' in /** @type {object} */ (data)) {
    return Boolean(/** @type {{ liked?: unknown }} */ (data).liked)
  }
  return false
}

/** GET /api/interaction/like/{workId}/status */
export function fetchLikeStatus(workId) {
  return request(`/api/interaction/like/${encWorkId(workId)}/status`, { method: 'GET' })
}

/** POST /api/interaction/like/{workId} */
export function postToggleLike(workId) {
  return request(`/api/interaction/like/${encWorkId(workId)}`, { method: 'POST' })
}

/**
 * POST /api/interaction/comment/{workId}
 * @param {string} workId
 * @param {{ content: string; parentId?: number; replyToUserId?: number | null }} body
 */
export function postComment(workId, body) {
  const payload = /** @type {Record<string, unknown>} */ ({
    content: String(body.content ?? '').trim(),
    parentId: body.parentId != null ? Number(body.parentId) || 0 : 0,
  })
  if (body.replyToUserId != null && !Number.isNaN(Number(body.replyToUserId))) {
    payload.replyToUserId = Number(body.replyToUserId)
  }
  return request(`/api/interaction/comment/${encWorkId(workId)}`, {
    method: 'POST',
    json: payload,
  })
}

/** GET /api/interaction/comment/{workId} */
export function fetchCommentPage(workId, pageNum = 1, pageSize = 10) {
  const q = new URLSearchParams()
  q.set('pageNum', String(Math.max(1, pageNum)))
  q.set('pageSize', String(Math.min(50, Math.max(1, pageSize))))
  return request(`/api/interaction/comment/${encWorkId(workId)}?${q.toString()}`, {
    method: 'GET',
  })
}

/** GET /api/interaction/comment/{workId}/replies/{parentId} */
export function fetchReplyPage(workId, parentId, pageNum = 1, pageSize = 5) {
  const q = new URLSearchParams()
  q.set('pageNum', String(Math.max(1, pageNum)))
  q.set('pageSize', String(Math.min(50, Math.max(1, pageSize))))
  const pid = encodeURIComponent(String(parentId ?? ''))
  return request(
    `/api/interaction/comment/${encWorkId(workId)}/replies/${pid}?${q.toString()}`,
    { method: 'GET' },
  )
}

/** DELETE /api/interaction/comment/{commentId} */
export function deleteComment(commentId) {
  return request(`/api/interaction/comment/${encodeURIComponent(String(commentId ?? ''))}`, {
    method: 'DELETE',
  })
}

/**
 * POST /api/interaction/report/{workId}
 * @param {string} workId
 * @param {string} reason
 */
export function postReportWork(workId, reason) {
  const r = String(reason ?? '').trim()
  if (!r) return Promise.reject(new Error('请填写举报原因'))
  return request(`/api/interaction/report/${encWorkId(workId)}`, {
    method: 'POST',
    json: { reason: r },
  })
}
