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
