/**
 * 统一响应：{ code, message, data, timestamp, success }
 * 开发环境通过 Vite 代理访问 /api、/uploads；生产环境可设 VITE_API_BASE。
 */
const API_BASE = import.meta.env.VITE_API_BASE?.replace(/\/$/, '') ?? ''

export function getStoredToken() {
  return localStorage.getItem('bccr_token') ?? ''
}

export function setStoredToken(token) {
  if (token) localStorage.setItem('bccr_token', token)
  else localStorage.removeItem('bccr_token')
}

/**
 * @param {string} path 以 / 开头，如 /api/user/login
 * @param {RequestInit & { json?: unknown }} options
 */
export async function request(path, options = {}) {
  const { json, headers: extraHeaders, ...rest } = options
  const headers = new Headers(extraHeaders)

  if (json !== undefined) {
    headers.set('Content-Type', 'application/json')
  }

  const token = getStoredToken()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const url = `${API_BASE}${path}`
  const res = await fetch(url, {
    ...rest,
    headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  })

  const text = await res.text()
  let payload
  try {
    payload = text ? JSON.parse(text) : {}
  } catch {
    throw new Error('服务器返回了非 JSON 数据')
  }

  const okHttp = res.ok
  const success = payload.success === true || payload.code === 200

  if (!okHttp || !success) {
    const msg = payload.message || res.statusText || '请求失败'
    const err = new Error(msg)
    err.code = payload.code
    err.payload = payload
    err.httpStatus = res.status
    throw err
  }

  return payload.data
}

/**
 * multipart/form-data（勿手动设置 Content-Type，以便附带 boundary）
 * @param {string} path
 * @param {RequestInit & { body: FormData }} options
 */
export async function requestMultipart(path, options = {}) {
  const { headers: extraHeaders, body, ...rest } = options
  const headers = new Headers(extraHeaders)

  const token = getStoredToken()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const url = `${API_BASE}${path}`
  const res = await fetch(url, {
    ...rest,
    headers,
    body,
  })

  const text = await res.text()
  let payload
  try {
    payload = text ? JSON.parse(text) : {}
  } catch {
    throw new Error('服务器返回了非 JSON 数据')
  }

  const okHttp = res.ok
  const success = payload.success === true || payload.code === 200

  if (!okHttp || !success) {
    const msg = payload.message || res.statusText || '请求失败'
    const err = new Error(msg)
    err.code = payload.code
    err.payload = payload
    err.httpStatus = res.status
    throw err
  }

  return payload.data
}

export function resolvePublicUrl(pathOrUrl) {
  if (!pathOrUrl || typeof pathOrUrl !== 'string') return ''
  const s = pathOrUrl.trim()
  if (!s) return ''
  if (/^https?:\/\//i.test(s)) return s
  return `${API_BASE}${s.startsWith('/') ? '' : '/'}${s}`
}

/**
 * 将后端返回的完整资源 URL 转为站点相对路径，便于走 Vite / 网关代理（如 /uploads）。
 * 例：http://localhost:8080/uploads/work/2026/04/25/xxx.txt → /uploads/work/2026/04/25/xxx.txt
 * @param {string} fileUrl
 */
export function toRelativeMediaUrl(fileUrl) {
  if (!fileUrl || typeof fileUrl !== 'string') return ''
  const s = fileUrl.trim()
  if (!s) return ''
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s)
      const p = (u.pathname || '/').replace(/\/+/g, '/')
      return p
    } catch {
      return s
    }
  }
  const p = (s.startsWith('/') ? s : `/${s}`).replace(/\/+/g, '/')
  return p
}

/**
 * 相对路径补全（VITE_API_BASE）后，再转为相对路径供 img/fetch 走同源代理
 * @param {string} pathOrUrl
 */
export function normalizeMediaSrc(pathOrUrl) {
  if (!pathOrUrl || typeof pathOrUrl !== 'string') return ''
  return toRelativeMediaUrl(resolvePublicUrl(pathOrUrl.trim()))
}

/**
 * 通过 filePath 等 URL 拉取文本正文；附带 JWT
 * @param {string} url
 */
export async function fetchTextFromUrl(url) {
  if (!url || typeof url !== 'string') {
    throw new Error('无效的文件地址')
  }
  const target = normalizeMediaSrc(url)
  if (!target) {
    throw new Error('无效的文件地址')
  }
  const headers = new Headers()
  const token = getStoredToken()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  const res = await fetch(target, { headers })
  if (!res.ok) {
    throw new Error(`读取文本失败（HTTP ${res.status}）`)
  }
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('application/json')) {
    try {
      const data = await res.json()
      return typeof data === 'string' ? data : JSON.stringify(data, null, 2)
    } catch {
      return await res.text()
    }
  }
  return await res.text()
}

/**
 * 带 JWT 拉取媒体为 Blob URL，供 video/audio 在需鉴权时使用
 * @param {string} url
 * @returns {Promise<string>}
 */
export async function fetchMediaBlobUrl(url) {
  if (!url || typeof url !== 'string') {
    throw new Error('无效的文件地址')
  }
  const target = normalizeMediaSrc(url)
  if (!target) {
    throw new Error('无效的文件地址')
  }
  const headers = new Headers()
  const token = getStoredToken()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  const res = await fetch(target, { headers })
  if (!res.ok) {
    throw new Error(`加载媒体失败（HTTP ${res.status}）`)
  }
  const blob = await res.blob()
  return URL.createObjectURL(blob)
}

export function extractToken(data) {
  if (!data || typeof data !== 'object') return ''
  return (
    data.token ??
    data.accessToken ??
    data.jwt ??
    data.access_token ??
    ''
  )
}
