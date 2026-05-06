/** @param {Record<string, unknown>} row */
export function pickAuditCaseId(row) {
  return String(row.reportId ?? row.id ?? row.auditId ?? row.caseId ?? '').trim()
}

/** @param {Record<string, unknown>} row */
export function pickWorkId(row) {
  return String(row.workId ?? row.targetWorkId ?? row.workID ?? '').trim()
}

/** @param {Record<string, unknown>} row */
export function pickWorkTitle(row) {
  return String(
    row.workName ?? row.workTitle ?? row.title ?? row.targetWorkName ?? '',
  ).trim()
}

/** @param {Record<string, unknown>} row */
export function pickReporter(row) {
  return String(
    row.reporterAddress ??
      row.reporter ??
      row.reportUser ??
      row.fromAddress ??
      row.userAddress ??
      '',
  ).trim()
}

/** @param {Record<string, unknown>} row */
export function pickReasonRaw(row) {
  return String(row.reason ?? row.reportReason ?? row.type ?? '').trim()
}

/**
 * 举报原因展示：支持 "CODE｜补充说明"（与 report.js 拼接方式一致）
 * @param {string} raw
 */
export function splitReasonDisplay(raw) {
  if (!raw) return { code: '', detail: '' }
  const i = raw.indexOf('｜')
  if (i === -1) return { code: raw.trim(), detail: '' }
  return {
    code: raw.slice(0, i).trim(),
    detail: raw.slice(i + 1).trim(),
  }
}

const REASON_LABELS = {
  SPAM: '垃圾/骚扰',
  INFRINGEMENT: '侵权',
  ILLEGAL: '违法违规',
  OTHER: '其他',
  MISLEADING: '误导信息',
}

/**
 * @param {string} code
 */
export function reasonCodeLabel(code) {
  const k = String(code ?? '').trim().toUpperCase()
  return REASON_LABELS[k] ?? (k || '—')
}

/** @param {unknown} raw */
export function formatAuditStatus(raw) {
  const k = typeof raw === 'string' ? raw.trim().toUpperCase() : ''
  const map = {
    PENDING: { label: '待处理', tone: 'warn' },
    OPEN: { label: '待处理', tone: 'warn' },
    PROCESSING: { label: '处理中', tone: 'info' },
    APPROVED: { label: '已通过', tone: 'ok' },
    RESOLVED: { label: '已通过', tone: 'ok' },
    REJECTED: { label: '已驳回', tone: 'bad' },
    DISMISSED: { label: '已驳回', tone: 'bad' },
    CLOSED: { label: '已关闭', tone: 'muted' },
  }
  if (map[k]) return { key: k, ...map[k] }
  if (!k) return { key: '', label: '—', tone: 'muted' }
  return { key: k, label: k, tone: 'muted' }
}

/**
 * @param {string} addr
 * @param {number} [head]
 * @param {number} [tail]
 */
export function shortAddr(addr, head = 8, tail = 6) {
  const s = String(addr ?? '').trim()
  if (s.length <= head + tail + 1) return s || '—'
  return `${s.slice(0, head)}…${s.slice(-tail)}`
}
