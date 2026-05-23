import { normalizeMediaSrc, request, requestMultipart } from './client'

/**
 * 路由参数、query、剪贴板等处带入的作品 ID：去空白、去掉误粘贴的尾部 `?`。
 * 注意：若后端在审核待办里把数据库主键数字放在 `workId` 里，而详情接口要业务字符串 ID，需后端对齐字段。
 * @param {unknown} raw
 */
export function normalizeWorkIdParam(raw) {
  let s = String(raw ?? '').trim()
  if (s.endsWith('?')) s = s.slice(0, -1).trim()
  return s
}

/**
 * 登记作品（POST /api/work/register，multipart）
 * 与 BCCRight WorkController：file?、workId、workName、workType、featureCode?、ipfsHash?、description?
 * @param {{
 *   workId: string
 *   workName: string
 *   workType: string
 *   file?: File | null
 *   featureCode?: string
 *   ipfsHash?: string
 *   description?: string
 * }} params
 */
export function registerWork(params) {
  const fd = new FormData()
  fd.append('workId', String(params.workId ?? '').trim())
  fd.append('workName', String(params.workName ?? '').trim())
  fd.append('workType', String(params.workType ?? '').trim())
  if (params.file instanceof File) {
    fd.append('file', params.file)
  }
  if (params.featureCode != null && String(params.featureCode).trim() !== '') {
    fd.append('featureCode', String(params.featureCode).trim())
  }
  if (params.ipfsHash != null && String(params.ipfsHash).trim() !== '') {
    fd.append('ipfsHash', String(params.ipfsHash).trim())
  }
  if (params.description != null && String(params.description).trim() !== '') {
    fd.append('description', String(params.description).trim())
  }
  return requestMultipart('/api/work/register', {
    method: 'POST',
    body: fd,
  })
}

/**
 * 登记后再次查重（POST /api/work/{workId}/recheck），需作品已保存文件。
 * 返回 CheckResult 数组。
 * @param {string} workId
 */
export function recheckWork(workId) {
  const id = encodeURIComponent(normalizeWorkIdParam(workId))
  return request(`/api/work/${id}/recheck`, { method: 'POST' })
}

/**
 * 作品总览数据（GET /api/work/admin/overview，管理员）。
 * 常见字段：totalWorks、onChainCount、byStatus、byType 等；若缺少 total 字段，区块链页会用 {@link fetchWorkList} 分页 total 兜底。
 */
export function fetchAdminWorkOverview() {
  return request('/api/work/admin/overview', { method: 'GET' })
}

export function fetchWorkList(params = {}) {
  const q = new URLSearchParams()
  const page = params.page ?? 1
  let size = params.size ?? 10
  if (size > 50) size = 50
  if (size < 1) size = 10
  q.set('page', String(page))
  q.set('size', String(size))
  if (params.type != null && String(params.type).trim() !== '') {
    q.set('worktype', String(params.type).trim())
  }
  if (params.keyword != null && String(params.keyword).trim() !== '') {
    q.set('keyword', String(params.keyword).trim())
  }
  return request(`/api/work/list?${q.toString()}`)
}

/**
 * 作品高级搜索（GET /api/work/search，与 WorkController 对齐）
 * 前端已收敛参数：不含状态、描述、作者地址、上链时间、是否上链、浏览/评论/举报/评分阈值筛选。
 * @param {{
 *   pageNum?: number,
 *   pageSize?: number,
 *   page?: number,
 *   size?: number,
 *   workId?: string,
 *   workName?: string,
 *   workType?: string,
 *   authorName?: string,
 *   createStart?: string,
 *   createEnd?: string,
 *   fileSizeMin?: number,
 *   fileSizeMax?: number,
 *   likeMin?: number,
 *   sortBy?: string,
 *   sortDir?: string,
 *   authorAddress?: string,
 * }} [params]
 */
export function fetchWorkSearch(params = {}) {
  const pageNum = Math.max(1, Number(params.pageNum ?? params.page) || 1)
  let pageSize = Math.min(50, Math.max(1, Number(params.pageSize ?? params.size) || 10))
  const q = new URLSearchParams()
  q.set('pageNum', String(pageNum))
  q.set('pageSize', String(pageSize))

  const strKeys = [
    ['workId', params.workId],
    ['workName', params.workName],
    ['workType', params.workType],
    ['authorName', params.authorName],
    ['authorAddress', params.authorAddress],
    ['createStart', params.createStart],
    ['createEnd', params.createEnd],
    ['sortBy', params.sortBy],
    ['sortDir', params.sortDir],
  ]
  for (const [k, v] of strKeys) {
    const s = v != null ? String(v).trim() : ''
    if (s) q.set(k, s)
  }

  const intKeys = [
    ['fileSizeMin', params.fileSizeMin],
    ['fileSizeMax', params.fileSizeMax],
    ['likeMin', params.likeMin],
  ]
  for (const [k, v] of intKeys) {
    if (v == null || v === '') continue
    const n = Number(v)
    if (!Number.isFinite(n)) continue
    q.set(k, String(Math.trunc(n)))
  }

  return request(`/api/work/search?${q.toString()}`, { method: 'GET' })
}

/**
 * 当前用户本人作品分页（GET /api/work/my?keyword=&workName=&page=&size=）
 * 与路由「我的作品」说明一致；keyword / workName 可选，用于授权页按作品名关键字筛选（与后端参数名对齐即可）。
 * @param {{ page?: number, size?: number, keyword?: string, workName?: string, workId?: string, type?: string }} [params]
 */
export function fetchMyWorkList(params = {}) {
  const q = new URLSearchParams()
  const page = params.page ?? 1
  let size = params.size ?? 20
  if (size > 50) size = 50
  if (size < 1) size = 10
  q.set('page', String(page))
  q.set('size', String(size))
  if (params.workId != null && String(params.workId).trim() !== '') {
    q.set('workId', normalizeWorkIdParam(params.workId))
  }
  if (params.workName != null && String(params.workName).trim() !== '') {
    q.set('workName', String(params.workName).trim())
  }
  if (params.keyword != null && String(params.keyword).trim() !== '') {
    q.set('keyword', String(params.keyword).trim())
  }
  if (params.type != null && String(params.type).trim() !== '') {
    q.set('worktype', String(params.type).trim())
  }
  return request(`/api/work/my?${q.toString()}`, { method: 'GET' })
}

export function fetchWorkDetail(workId) {
  const id = encodeURIComponent(normalizeWorkIdParam(workId))
  return request(`/api/work/${id}`)
}

/**
 * 删除本人作品（DELETE /api/work/{workId}）
 * @param {string} workId
 */
export function deleteWork(workId) {
  const id = encodeURIComponent(normalizeWorkIdParam(workId))
  return request(`/api/work/${id}`, { method: 'DELETE' })
}

/**
 * 按指纹查询链上原始凭证（GET /api/work/fingerprint/{fingerprint}/onchain）
 * @param {string} fingerprint
 */
export function fetchWorkOnChainByFingerprint(fingerprint) {
  const fp = encodeURIComponent(String(fingerprint ?? '').trim())
  if (!fp) return Promise.reject(new Error('缺少指纹'))
  return request(`/api/work/fingerprint/${fp}/onchain`, { method: 'GET' })
}

export function normalizeListPage(data) {
  if (data == null || typeof data !== 'object') {
    return { items: [], total: 0, page: 1, size: 10, pages: 0 }
  }
  const d = /** @type {Record<string, unknown>} */ (data)
  let items =
    d.records ??
    d.content ??
    d.list ??
    d.items ??
    (Array.isArray(data) ? data : [])
  if (!Array.isArray(items)) items = []

  const total = Number(d.total ?? d.totalElements ?? items.length) || 0
  let size = Number(d.size ?? d.pageSize ?? 10) || 10
  if (size > 50) size = 50
  if (size < 1) size = 10

  let page = 1
  if (d.current != null) page = Number(d.current) || 1
  else if (d.pageNum != null) page = Number(d.pageNum) || 1
  else if (typeof d.number === 'number') page = d.number + 1
  else if (d.page != null) page = Number(d.page) || 1

  let pages = Number(d.pages)
  if (!Number.isFinite(pages) || pages < 0) {
    pages = total === 0 ? 0 : Math.ceil(total / size)
  }

  return { items, total, page, size, pages }
}

/**
 * @param {unknown} type
 * @returns {'image' | 'text' | 'video' | 'audio' | 'other'}
 */
export function workKind(type) {
  const raw = String(type ?? '').trim()
  const t = raw.toUpperCase()
  if (t === 'IMAGE' || t === 'IMG' || raw === '图片') return 'image'
  if (t === 'TEXT' || t === 'TXT' || raw === '文本') return 'text'
  if (t === 'VIDEO' || raw === '视频') return 'video'
  if (t === 'AUDIO' || raw === '音频') return 'audio'
  return 'other'
}

/** @param {Record<string, unknown>} w */
export function pickMediaPlayUrl(w) {
  if (!w || typeof w !== 'object') return ''
  const order = [
    w.filePath,
    w.fileUrl,
    w.url,
    w.storageUrl,
    w.mediaUrl,
    w.videoUrl,
    w.audioUrl,
  ]
  for (const u of order) {
    if (typeof u === 'string' && u.trim()) return normalizeMediaSrc(u.trim())
  }
  return ''
}

/**
 * 是否与广场筛选类型一致（参数为 IMAGE / TEXT / VIDEO / AUDIO）。
 * @param {Record<string, unknown>} row
 * @param {string} worktypeFilter
 */
export function matchesWorkTypeFilter(row, worktypeFilter) {
  if (worktypeFilter == null || String(worktypeFilter).trim() === '') return true
  const f = String(worktypeFilter).trim().toUpperCase()
  const raw = String(
    row.type ?? row.workType ?? row.worktype ?? row.mediaType ?? '',
  ).trim()
  if (!raw) return false
  const u = raw.toUpperCase()
  if (u === f) return true
  const cn = { IMAGE: '图片', TEXT: '文本', VIDEO: '视频', AUDIO: '音频' }
  if (cn[f] && raw === cn[f]) return true
  if (f === 'IMAGE' && (u === 'IMG' || u === 'PICTURE')) return true
  if (f === 'TEXT' && u === 'TXT') return true
  if (f === 'VIDEO' && (u === 'VIDEO' || raw === '视频')) return true
  if (f === 'AUDIO' && (u === 'AUDIO' || raw === '音频')) return true
  const k = workKind(row.type ?? row.workType ?? row.worktype ?? row.mediaType)
  if (f === 'IMAGE' && k === 'image') return true
  if (f === 'TEXT' && k === 'text') return true
  if (f === 'VIDEO' && k === 'video') return true
  if (f === 'AUDIO' && k === 'audio') return true
  return false
}

/**
 * @param {Record<string, unknown>} w
 * @param {number} [maxLen]
 */
export function pickTextPreview(w, maxLen = 160) {
  const candidates = [
    w.textPreview,
    w.previewText,
    w.workContent,
    w.workText,
    w.content,
    w.text,
    w.textBody,
    w.body,
    w.txt,
    w.snippet,
    w.excerpt,
    w.abstract,
    w.description,
    w.summary,
  ]
  let s = ''
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) {
      s = c.trim()
      break
    }
  }
  if (!s) return ''
  s = s.replace(/\s+/g, ' ')
  if (s.length > maxLen) return `${s.slice(0, maxLen)}…`
  return s
}

function pickListPreviewImageUrl(w, kind) {
  const thumb =
    w.coverUrl ??
    w.cover ??
    w.thumbnail ??
    w.posterUrl ??
    w.videoCover ??
    w.firstFrameUrl ??
    w.previewUrl ??
    w.previewImageUrl ??
    w.thumbUrl
  if (typeof thumb === 'string' && thumb.trim()) {
    return normalizeMediaSrc(thumb.trim())
  }
  if (kind === 'image') {
    const fallbacks = [w.filePath, w.fileUrl, w.url, w.imageUrl, w.imgUrl, w.storageUrl]
    for (const u of fallbacks) {
      if (typeof u === 'string' && u.trim()) return normalizeMediaSrc(u.trim())
    }
  }
  return ''
}

export function pickDisplayImageUrl(w) {
  const order = [
    w.filePath,
    w.fileUrl,
    w.originalUrl,
    w.fullImageUrl,
    w.imageUrl,
    w.imgUrl,
    w.url,
    w.storageUrl,
    w.coverUrl,
    w.cover,
    w.previewUrl,
    w.thumbnail,
  ]
  for (const u of order) {
    if (typeof u === 'string' && u.trim()) return normalizeMediaSrc(u.trim())
  }
  return ''
}

/**
 * 作者展示名（与链上地址区分）：优先接口显式姓名字段，其次嵌套 user / creator 等。
 * @param {Record<string, unknown>} w
 */
export function pickAuthorDisplayName(w) {
  if (!w || typeof w !== 'object') return ''
  const o = /** @type {Record<string, unknown>} */ (w)
  const direct = [
    'authorName',
    'authorDisplayName',
    'creatorName',
    'ownerName',
    'realName',
    'realname',
    'userRealName',
    'publisherName',
    'registerUserName',
  ]
  for (const k of direct) {
    const v = o[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  const fallbackKeys = ['nickname', 'nickName', 'displayName', 'username', 'loginName', 'account', 'userName']
  for (const k of fallbackKeys) {
    const v = o[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  for (const nestKey of ['user', 'owner', 'creator', 'authorUser', 'publisher', 'registerUser']) {
    const nested = o[nestKey]
    if (!nested || typeof nested !== 'object') continue
    const n = /** @type {Record<string, unknown>} */ (nested)
    for (const k of ['nickname', 'nickName', 'name', 'realName', 'username', 'loginName', 'account']) {
      const v = n[k]
      if (typeof v === 'string' && v.trim()) return v.trim()
    }
  }
  return ''
}

/**
 * @param {unknown} val
 * @returns {number | null}
 */
function pickNonNegInt(val) {
  if (val == null || val === '') return null
  const n = typeof val === 'number' ? val : parseInt(String(val), 10)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

export function formatWorkSummary(w) {
  const kind = workKind(w.type ?? w.workType ?? w.mediaType)
  const row = /** @type {Record<string, unknown>} */ (typeof w === 'object' && w ? w : {})
  const cover = pickListPreviewImageUrl(row, kind)
  const mediaUrl =
    kind === 'video' || kind === 'audio' ? pickMediaPlayUrl(row) : ''
  return {
    id: String(w.workId ?? w.id ?? ''),
    title: String(
      w.workname ?? w.workName ?? w.title ?? w.workTitle ?? w.name ?? '未命名作品',
    ),
    type: String(w.type ?? w.workType ?? w.mediaType ?? ''),
    kind,
    author: String(w.authorAddress ?? w.author ?? w.authorName ?? ''),
    authorName: pickAuthorDisplayName(row),
    likeCount: pickNonNegInt(w.likeCount ?? w.likeNum ?? w.likes ?? w.thumbCount),
    commentCount: pickNonNegInt(
      w.commentCount ?? w.comments ?? w.commentNum ?? w.commentsCount,
    ),
    cover,
    mediaUrl,
    textPreview: pickTextPreview(w, kind === 'text' ? 320 : 160),
    fingerprint: String(w.fingerprint ?? w.fp ?? ''),
    createdAt: w.createdAt ?? w.createTime ?? w.gmtCreate ?? '',
    status: w.status != null ? String(w.status) : '',
    raw: w,
  }
}

export function formatWorkDetail(w) {
  const s = formatWorkSummary(w)
  const displayImageUrl = pickDisplayImageUrl(
    /** @type {Record<string, unknown>} */ (typeof w === 'object' && w ? w : {}),
  )
  const filePathResolved =
    typeof w.filePath === 'string' && w.filePath.trim()
      ? normalizeMediaSrc(w.filePath.trim())
      : ''
  let fileLink = filePathResolved
  if (!fileLink && typeof w.fileUrl === 'string' && w.fileUrl.trim()) {
    fileLink = normalizeMediaSrc(w.fileUrl.trim())
  } else if (!fileLink && typeof w.url === 'string' && w.url.trim()) {
    fileLink = normalizeMediaSrc(w.url.trim())
  } else if (!fileLink && typeof w.storageUrl === 'string' && w.storageUrl.trim()) {
    fileLink = normalizeMediaSrc(w.storageUrl.trim())
  }
  return {
    ...s,
    filePath: filePathResolved,
    displayImageUrl,
    description: String(
      w.description ?? w.desc ?? w.summary ?? w.content ?? w.text ?? '',
    ),
    fileUrl: fileLink,
    raw: w,
  }
}
