import { normalizeWorkIdParam } from '@/api/work'

/** @param {Record<string, unknown>} row */
export function pickAuditCaseId(row) {
  return String(row.reportId ?? row.id ?? row.auditId ?? row.caseId ?? '').trim()
}

/** @param {Record<string, unknown>} row */
export function pickWorkId(row) {
  if (!row || typeof row !== 'object') return ''
  const r = /** @type {Record<string, unknown>} */ (row)
  const nested =
    r.work && typeof r.work === 'object'
      ? /** @type {Record<string, unknown>} */ (r.work)
      : null

  const rawCandidates = [
    nested?.workId,
    nested?.workID,
    nested?.workUuid,
    nested?.bizWorkId,
    r.workUuid,
    r.workBizId,
    r.chainWorkId,
    r.workId,
    r.workID,
    r.targetWorkId,
    r.targetWorkID,
    r.reportedWorkId,
    r.reportWorkId,
    r.bizWorkId,
    r.subjectWorkId,
    r.work_id,
    r.target_work_id,
  ]

  const candidates = []
  for (const v of rawCandidates) {
    const n = normalizeWorkIdParam(v)
    if (n) candidates.push(n)
  }
  if (!candidates.length) return ''

  // 同时存在「纯数字」与「含字母/连字符」时，优先后者，避免误用举报主键当业务 workId
  const nonDigitOnly = candidates.filter((s) => !/^\d+$/.test(s))
  const chosen = nonDigitOnly[0] ?? candidates[0]
  return normalizeWorkIdParam(chosen)
}

/** @param {Record<string, unknown>} row */
export function pickWorkTitle(row) {
  if (!row || typeof row !== 'object') return ''
  const r = /** @type {Record<string, unknown>} */ (row)
  const nested =
    r.work && typeof r.work === 'object'
      ? /** @type {Record<string, unknown>} */ (r.work)
      : null
  return String(
    nested?.workName ??
      nested?.workTitle ??
      nested?.title ??
      r.workName ??
      r.workTitle ??
      r.title ??
      r.targetWorkName ??
      r.work_name ??
      r.target_work_name ??
      '',
  ).trim()
}

/**
 * 作品作者展示名（优先昵称/姓名，否则链上地址缩写）
 * @param {Record<string, unknown>} row
 */
export function pickWorkAuthorLabel(row) {
  if (!row || typeof row !== 'object') return ''
  const r = /** @type {Record<string, unknown>} */ (row)
  const nested =
    r.work && typeof r.work === 'object'
      ? /** @type {Record<string, unknown>} */ (r.work)
      : null
  const name = String(
    nested?.authorName ??
      nested?.ownerName ??
      nested?.creatorName ??
      nested?.userName ??
      nested?.authorNick ??
      r.authorName ??
      r.author ??
      r.ownerName ??
      r.creatorName ??
      r.workAuthor ??
      r.work_author ??
      r.authorNick ??
      r.authorNickname ??
      r.ownerNick ??
      '',
  ).trim()
  if (name) return name
  const addr = String(
    r.ownerAddress ??
      r.owner_address ??
      r.authorAddress ??
      r.creatorAddress ??
      r.reportedAuthorAddress ??
      nested?.ownerAddress ??
      nested?.authorAddress ??
      '',
  ).trim()
  if (addr) return shortAddr(addr, 10, 8)
  return ''
}

/** @param {Record<string, unknown>} row */
export function pickAuditRemark(row) {
  if (!row || typeof row !== 'object') return ''
  const r = /** @type {Record<string, unknown>} */ (row)
  return String(
    r.remark ?? r.comment ?? r.note ?? r.auditRemark ?? r.rejectReason ?? '',
  ).trim()
}

/**
 * 审核日志中的链上地址（用于 GET /api/user/name-by-address?address= 反查昵称等）
 * @param {Record<string, unknown>} row
 */
export function pickAuditLogAddress(row) {
  if (!row || typeof row !== 'object') return ''
  const r = /** @type {Record<string, unknown>} */ (row)
  return String(
    r.address ??
      r.blockchainAddress ??
      r.operatorAddress ??
      r.auditorAddress ??
      r.handlerAddress ??
      '',
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
  const k = String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/-/g, '_')
  const map = {
    PENDING: { label: '待处理', tone: 'warn' },
    OPEN: { label: '待处理', tone: 'warn' },
    PROCESSING: { label: '处理中', tone: 'info' },
    APPROVED: { label: '已通过', tone: 'ok' },
    RESOLVED: { label: '已通过', tone: 'ok' },
    REJECTED: { label: '已驳回', tone: 'bad' },
    DISMISSED: { label: '已驳回', tone: 'bad' },
    CLOSED: { label: '已关闭', tone: 'muted' },
    REPORT: { label: '举报', tone: 'warn' },
    REPORTED: { label: '举报', tone: 'warn' },
    REPORTING: { label: '举报中', tone: 'warn' },
    DELIST: { label: '下架', tone: 'bad' },
    DELISTED: { label: '已下架', tone: 'bad' },
    TAKEDOWN: { label: '下架', tone: 'bad' },
    OFFLINE: { label: '下架', tone: 'bad' },
    REMOVED: { label: '已移除', tone: 'bad' },
    BAN: { label: '封禁', tone: 'bad' },
    BANNED: { label: '已封禁', tone: 'bad' },
    SUSPEND: { label: '暂停', tone: 'info' },
    SUSPENDED: { label: '已暂停', tone: 'info' },
  }
  if (map[k]) return { key: k, ...map[k] }
  if (!k) return { key: '', label: '—', tone: 'muted' }
  return { key: k, label: k, tone: 'muted' }
}

/** @param {unknown} raw */
export function formatAuditAction(raw) {
  const k = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_')
  const map = {
    approve: { label: '通过', tone: 'ok' },
    approved: { label: '通过', tone: 'ok' },
    resolve: { label: '通过', tone: 'ok' },
    resolved: { label: '通过', tone: 'ok' },
    accept: { label: '通过', tone: 'ok' },
    reject: { label: '驳回', tone: 'bad' },
    rejected: { label: '驳回', tone: 'bad' },
    deny: { label: '驳回', tone: 'bad' },
    dismiss: { label: '驳回', tone: 'bad' },
    report: { label: '举报', tone: 'warn' },
    reported: { label: '举报', tone: 'warn' },
    delist: { label: '下架', tone: 'bad' },
    takedown: { label: '下架', tone: 'bad' },
    offline: { label: '下架', tone: 'bad' },
    remove: { label: '下架', tone: 'bad' },
    ban: { label: '封禁', tone: 'bad' },
    suspend: { label: '暂停', tone: 'info' },
    restore: { label: '恢复', tone: 'ok' },
    reopen: { label: '重开', tone: 'info' },
    work_report: { label: '举报', tone: 'warn' },
    report_work: { label: '举报', tone: 'warn' },
  }
  if (map[k]) return { key: k, ...map[k] }
  if (!k) return { key: '', label: '—', tone: 'muted' }
  return { key: k, label: String(raw).trim(), tone: 'muted' }
}

/**
 * 审核记录列表用：综合 action / operation / type / status 得到中文短标签
 * @param {Record<string, unknown>} row
 */
export function formatAuditHistoryBadge(row) {
  if (!row || typeof row !== 'object') {
    return { key: '', label: '—', tone: 'muted' }
  }
  const r = /** @type {Record<string, unknown>} */ (row)
  const tryVals = [
    r.action,
    r.operation,
    r.auditAction,
    r.auditType,
    r.audit_type,
    r.eventType,
    r.event_type,
    r.type,
  ]
  for (const v of tryVals) {
    if (v == null || String(v).trim() === '') continue
    const fa = formatAuditAction(v)
    if (fa.tone !== 'muted') {
      return { key: String(v), label: fa.label, tone: fa.tone }
    }
    const fs = formatAuditStatus(v)
    if (fs.label !== '—') {
      return { key: String(v), label: fs.label, tone: fs.tone }
    }
  }
  const st = r.status ?? r.state
  if (st != null && String(st).trim() !== '') return formatAuditStatus(st)
  return { key: '', label: '记录', tone: 'muted' }
}

/** @param {Record<string, unknown>} row */
export function pickAuditOperator(row) {
  return String(
    row.operatorName ??
      row.operator ??
      row.auditorName ??
      row.adminName ??
      row.userName ??
      '',
  ).trim()
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
