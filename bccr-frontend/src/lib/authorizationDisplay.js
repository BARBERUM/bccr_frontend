/** @param {Record<string, unknown>} r */
export function pickAuthId(r) {
  return String(r.authId ?? r.id ?? r.licenseId ?? r.recordId ?? '').trim()
}

/** @param {Record<string, unknown>} r */
export function pickWorkId(r) {
  return String(r.workId ?? r.sourceWorkId ?? r.workID ?? '').trim()
}

/** @param {Record<string, unknown>} r */
export function pickGrantor(r) {
  return String(
    r.grantorAddress ?? r.grantor ?? r.fromAddress ?? r.licensorAddress ?? '',
  ).trim()
}

/** @param {Record<string, unknown>} r */
export function pickGrantee(r) {
  return String(
    r.granteeAddress ?? r.grantee ?? r.toAddress ?? r.licenseeAddress ?? '',
  ).trim()
}

/** @param {Record<string, unknown>} r */
export function pickAuthStatusRaw(r) {
  const s = r.status ?? r.authStatus ?? r.state ?? r.licenseStatus
  return typeof s === 'string' ? s.trim() : s != null ? String(s).trim() : ''
}

/** @param {Record<string, unknown>} r */
export function pickExpireTime(r) {
  const v =
    r.expireTime ?? r.validUntil ?? r.endTime ?? r.expiredAt ?? r.expiryTime
  if (v == null || v === '') return ''
  return String(v).trim()
}

/** @param {Record<string, unknown>} r */
export function pickAuthTypeRaw(r) {
  const t =
    r.authType ?? r.licenseType ?? r.scope ?? r.authorizationType ?? r.type
  if (t == null || String(t).trim() === '') return ''
  return String(t).trim().toLowerCase()
}

/** 转为发起授权表单使用的 authType 值 */
export function normalizeAuthTypeForGrant(raw) {
  const k = String(raw ?? '').trim().toLowerCase()
  if (k === 'exclusive') return 'exclusive'
  if (k === 'sublicense' || k === 'sub-license' || k === 'sublicenseable') {
    return 'sublicense'
  }
  if (
    k === 'non-exclusive' ||
    k === 'nonexclusive' ||
    k === 'non_exclusive' ||
    k === 'usage' ||
    k === 'normal'
  ) {
    return 'non-exclusive'
  }
  return 'non-exclusive'
}

/**
 * 是否已过期：后端状态为 EXPIRED，或 expireTime 早于当前时间（且未撤销）
 * @param {Record<string, unknown>} r
 */
export function isAuthExpired(r) {
  const st = formatAuthStatus(pickAuthStatusRaw(r))
  if (st.key === 'REVOKED' || st.key === 'CANCELLED') return false
  if (st.key === 'EXPIRED') return true
  const exp = pickExpireTime(r)
  if (!exp) return false
  const d = new Date(exp)
  if (Number.isNaN(d.getTime())) return false
  return d.getTime() < Date.now()
}

/** 展示用状态：过期但库内仍为 ACTIVE 时显示「已过期」 */
export function displayAuthStatus(rec) {
  if (isAuthExpired(rec)) {
    return { key: 'EXPIRED', label: '已过期', tone: /** @type {'warn'} */ ('warn') }
  }
  return formatAuthStatus(pickAuthStatusRaw(rec))
}

/**
 * @param {unknown} raw
 * @returns {{ key: string, label: string, tone: 'ok' | 'warn' | 'bad' | 'muted' }}
 */
export function formatAuthStatus(raw) {
  const k = typeof raw === 'string' ? raw.trim().toUpperCase() : ''
  const map = {
    ACTIVE: { key: 'ACTIVE', label: '生效中', tone: 'ok' },
    VALID: { key: 'VALID', label: '生效中', tone: 'ok' },
    EFFECTIVE: { key: 'EFFECTIVE', label: '生效中', tone: 'ok' },
    APPROVED: { key: 'APPROVED', label: '生效中', tone: 'ok' },
    AUTHORIZED: { key: 'AUTHORIZED', label: '生效中', tone: 'ok' },
    SUCCESS: { key: 'SUCCESS', label: '生效中', tone: 'ok' },
    REVOKED: { key: 'REVOKED', label: '已撤销', tone: 'bad' },
    CANCELLED: { key: 'CANCELLED', label: '已撤销', tone: 'bad' },
    EXPIRED: { key: 'EXPIRED', label: '已过期', tone: 'warn' },
    PENDING: { key: 'PENDING', label: '待确认', tone: 'warn' },
  }
  if (map[k]) return map[k]
  if (!k) return { key: '', label: '—', tone: 'muted' }
  return { key: k, label: k, tone: 'muted' }
}

/** @param {Record<string, unknown>} r */
export function pickAuthTypeLabel(r) {
  const t =
    r.authType ??
    r.licenseType ??
    r.scope ??
    r.authorizationType ??
    r.type
  if (t == null || String(t).trim() === '') return '—'
  const k = String(t).trim().toLowerCase()
  const labels = {
    exclusive: '独占授权',
    'non-exclusive': '非独占授权',
    sublicense: '分许可',
  }
  if (labels[k]) return labels[k]
  return String(t)
}

/** @param {string} addr */
export function shortAddress(addr, head = 6, tail = 4) {
  const s = String(addr ?? '').trim()
  if (s.length <= head + tail + 1) return s || '—'
  return `${s.slice(0, head)}…${s.slice(-tail)}`
}

/**
 * @param {string} userAddr
 * @param {Record<string, unknown>} rec
 */
export function canRevokeAsGrantor(userAddr, rec) {
  if (!userAddr) return false
  if (isAuthExpired(rec)) return false
  const g = pickGrantor(rec).toLowerCase()
  const u = userAddr.trim().toLowerCase()
  if (!g || g !== u) return false
  const st = formatAuthStatus(pickAuthStatusRaw(rec))
  return (
    st.key === 'ACTIVE' ||
    st.key === 'VALID' ||
    st.key === 'EFFECTIVE' ||
    st.key === 'APPROVED' ||
    st.key === 'AUTHORIZED' ||
    st.key === 'SUCCESS' ||
    st.key === 'PENDING'
  )
}

/** @param {Record<string, unknown>} rec */
export function isExclusiveAuth(rec) {
  return normalizeAuthTypeForGrant(pickAuthTypeRaw(rec)) === 'exclusive'
}

/** 是否可延续：已过期、或库内状态为 EXPIRED（未撤销） */
export function isAuthExtendable(rec) {
  if (!rec || typeof rec !== 'object') return false
  const st = formatAuthStatus(pickAuthStatusRaw(rec))
  if (st.key === 'REVOKED' || st.key === 'CANCELLED') return false
  if (st.key === 'EXPIRED') return true
  return isAuthExpired(rec)
}

/** 我发出的列表（含「全部」）：当前用户即授权方，仅需可延续且有 authId */
export function canExtendOutgoingRecord(rec) {
  if (!rec || typeof rec !== 'object') return false
  if (!pickAuthId(rec)) return false
  return isAuthExtendable(rec)
}

/** 授权方可对已过期的本人发出记录调用 extend 延续 */
export function canExtendAuthAsGrantor(userAddr, rec) {
  if (!userAddr || !rec || typeof rec !== 'object') return false
  if (!pickAuthId(rec)) return false
  const g = pickGrantor(rec).toLowerCase()
  const u = userAddr.trim().toLowerCase()
  if (!g || g !== u) return false
  return isAuthExtendable(rec)
}

/** 非独占过期记录可跳转发起授权页重新编辑（独占仅支持延续） */
export function canReauthorizeAsGrantor(userAddr, rec) {
  return canExtendAuthAsGrantor(userAddr, rec) && !isExclusiveAuth(rec)
}

/** 我发出的列表中非独占过期记录可「去编辑」 */
export function canReauthorizeOutgoingRecord(rec) {
  return canExtendOutgoingRecord(rec) && !isExclusiveAuth(rec)
}
