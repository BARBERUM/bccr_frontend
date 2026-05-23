import {
  fetchMyWorkList,
  fetchWorkDetail,
  formatWorkSummary,
  normalizeListPage,
  normalizeWorkIdParam,
} from '@/api/work'

/** @param {unknown} raw */
export function normalizeWorkPickQuery(raw) {
  return String(raw ?? '').trim()
}

/** @param {string} q */
export function looksLikeWorkIdQuery(q) {
  const s = normalizeWorkPickQuery(q)
  if (!s) return false
  if (/^work-[\w-]+/i.test(s)) return true
  if (s.length >= 8 && /^[\w-]+$/.test(s)) return true
  return false
}

/**
 * @param {ReturnType<typeof formatWorkSummary>} summary
 * @param {string} query
 */
export function workSummaryMatchesQuery(summary, query) {
  const q = normalizeWorkPickQuery(query).toLowerCase()
  if (!q) return true
  const id = String(summary.id ?? '').toLowerCase()
  const title = String(summary.title ?? '').toLowerCase()
  const type = String(summary.type ?? '').toLowerCase()
  const author = String(summary.author ?? '').toLowerCase()
  const authorName = String(summary.authorName ?? '').toLowerCase()
  return (
    id.includes(q) ||
    title.includes(q) ||
    type.includes(q) ||
    author.includes(q) ||
    authorName.includes(q)
  )
}

/**
 * @param {ReturnType<typeof formatWorkSummary>[]} items
 * @param {string} query
 * @param {number} [limit]
 */
export function filterWorkSummariesByQuery(items, query, limit = 24) {
  const q = normalizeWorkPickQuery(query)
  if (!q) return []
  return items.filter((s) => workSummaryMatchesQuery(s, q)).slice(0, limit)
}

/**
 * 本人作品下拉：请求 GET /api/work/my，再按输入在名称 / ID 上筛选；作品 ID 无列表命中时尝试详情接口。
 * @param {{
 *   query: string
 *   myAddress?: string
 *   pageSize?: number
 * }} opts
 * @returns {Promise<ReturnType<typeof formatWorkSummary>[]>}
 */
export async function fetchMyWorkPickSuggestions(opts) {
  const q = normalizeWorkPickQuery(opts.query)
  if (!q) return []

  const pageSize = Math.min(50, Math.max(10, opts.pageSize ?? 50))
  /** @type {{ page: number, size: number, keyword?: string, workName?: string, workId?: string }} */
  const params = {
    page: 1,
    size: pageSize,
    keyword: q,
    workName: q,
  }
  if (looksLikeWorkIdQuery(q)) {
    params.workId = normalizeWorkIdParam(q)
  }

  const data = await fetchMyWorkList(params)
  const page = normalizeListPage(data)
  const items = page.items.map((row) =>
    formatWorkSummary(/** @type {Record<string, unknown>} */ (row)),
  )
  let filtered = filterWorkSummariesByQuery(items, q, 24)

  if (!filtered.length && looksLikeWorkIdQuery(q)) {
    const wid = normalizeWorkIdParam(q)
    try {
      const raw = await fetchWorkDetail(wid)
      if (raw && typeof raw === 'object') {
        const s = formatWorkSummary(/** @type {Record<string, unknown>} */ (raw))
        const addr = String(opts.myAddress ?? '').trim().toLowerCase()
        const author = String(s.author ?? '').trim().toLowerCase()
        if (!addr || !author || author === addr || workSummaryMatchesQuery(s, q)) {
          filtered = [s]
        }
      }
    } catch {
      /* 非本人或不存在 */
    }
  }

  return filtered
}
