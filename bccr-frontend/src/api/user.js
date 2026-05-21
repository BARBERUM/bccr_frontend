import { extractToken, normalizeMediaSrc, request, requestMultipart } from './client'

/**
 * @param {{ username: string, password: string, captchaKey: string, captchaCode: string }} body
 */
export async function login(body) {
  const data = await request('/api/user/login', {
    method: 'POST',
    json: body,
  })
  return { token: extractToken(data), raw: data }
}

const SEND_REGISTER_EMAIL_CODE_PATH =
  import.meta.env.VITE_REGISTER_EMAIL_CODE_PATH || '/api/user/register/send-email-code'

/**
 * 注册前发送邮箱验证码（默认 POST …/register/send-email-code，JSON：{ email }）。
 * 若 404，可在 `.env.development` 设置 `VITE_REGISTER_EMAIL_CODE_PATH` 为实际路径。
 */
export function sendRegisterEmailCode(email) {
  const em = String(email ?? '').trim()
  if (!em) {
    return Promise.reject(new Error('请先填写邮箱'))
  }
  return request(SEND_REGISTER_EMAIL_CODE_PATH, {
    method: 'POST',
    json: { email: em },
  })
}

/**
 * 注册 multipart：username、password、email、emailCode 必填；phone、nickname、avatar 可选（与 UserController 一致）。
 * @param {FormData} formData
 */
export async function registerMultipart(formData) {
  const data = await requestMultipart('/api/user/register', {
    method: 'POST',
    body: formData,
  })
  return { token: extractToken(data), raw: data }
}

export function fetchMe() {
  return request('/api/user/me', { method: 'GET' })
}

/**
 * 按用户 ID 查询展示信息（GET …/userId?userId=，与 UserController 对齐）
 * @param {number|string} userId
 * @returns {Promise<{ username?: string, nickname?: string, blockchainAddress?: string, avatar?: string }>}
 */
const USER_BY_ID_PATH = import.meta.env.VITE_USER_BY_ID_PATH || '/api/user/userId'

export function fetchUserById(userId) {
  const id = String(userId ?? '').trim()
  if (!id || !/^\d+$/.test(id)) {
    return Promise.reject(new Error('缺少有效用户 ID'))
  }
  return request(`${USER_BY_ID_PATH}?userId=${encodeURIComponent(id)}`, { method: 'GET' })
}

/** 用户展示信息反查（与 UserController `/name-by-address` 对齐） */
const NAME_BY_ADDRESS_PATH =
  import.meta.env.VITE_USER_NAME_BY_ADDRESS_PATH || '/api/user/name-by-address'

/** 链上地址反查可与用户名反查同一路径；若后端分开实现，可单独配置 `VITE_USER_BY_BLOCKCHAIN_PATH` */
const USER_BY_BLOCKCHAIN_PATH =
  import.meta.env.VITE_USER_BY_BLOCKCHAIN_PATH || NAME_BY_ADDRESS_PATH

/**
 * 按用户名查询链上地址与展示信息（GET /api/user/name-by-address?username=）
 * @param {string} username
 * @returns {Promise<{ username?: string, nickname?: string, blockchainAddress?: string, avatar?: string }>}
 */
export function fetchUserAddressByUsername(username) {
  const q = encodeURIComponent(String(username ?? '').trim())
  if (!q) {
    return Promise.reject(new Error('用户名不能为空'))
  }
  return request(`${NAME_BY_ADDRESS_PATH}?username=${q}`, { method: 'GET' })
}

/**
 * 按链上地址查询用户展示信息（默认 GET /api/user/name-by-address?address=）。
 * @param {string} address
 * @returns {Promise<{ username?: string, nickname?: string, blockchainAddress?: string, avatar?: string }>}
 */
export function fetchUserByBlockchainAddress(address) {
  const q = encodeURIComponent(String(address ?? '').trim())
  if (!q) {
    return Promise.reject(new Error('地址不能为空'))
  }
  return request(`${USER_BY_BLOCKCHAIN_PATH}?address=${q}`, { method: 'GET' })
}

/**
 * 规范化用户搜索接口返回的列表。
 * 后端 GET /api/user/search 的 data 为用户对象数组时直接使用；亦兼容分页等包装结构。
 * @param {unknown} data
 * @returns {Record<string, unknown>[]}
 */
export function normalizeUserSearchList(data) {
  if (!data) return []
  if (Array.isArray(data)) {
    return /** @type {Record<string, unknown>[]} */ (data.filter((x) => x && typeof x === 'object'))
  }
  if (typeof data === 'object') {
    const d = /** @type {Record<string, unknown>} */ (data)
    const items =
      d.records ?? d.list ?? d.content ?? d.items ?? d.users ?? d.rows ?? d.data
    if (Array.isArray(items)) {
      return /** @type {Record<string, unknown>[]} */ (
        items.filter((x) => x && typeof x === 'object')
      )
    }
  }
  return []
}

/**
 * 按关键字搜索用户（GET /api/user/search?keyword=）
 * 与 UserController#searchUsers 一致；data 为含 username、nickname、avatar、blockchainAddress 的对象数组。
 * @param {string} keyword
 * @returns {Promise<Record<string, unknown>[]>} 实际为 request() 解析后的 data
 */
export function searchUsersByKeyword(keyword) {
  const q = encodeURIComponent(String(keyword ?? '').trim())
  if (!q) {
    return Promise.resolve([])
  }
  return request(`/api/user/search?keyword=${q}`, { method: 'GET' })
}

/** @param {File} file */
export function uploadAvatar(file) {
  const fd = new FormData()
  fd.append('file', file)
  return requestMultipart('/api/user/avatar', {
    method: 'POST',
    body: fd,
  })
}

export async function fetchAvatarUrlResolved() {
  const data = await request('/api/user/avatar', { method: 'GET' })
  return extractAvatarUrl(data)
}

/**
 * @param {unknown} data
 * @returns {string}
 */
export function extractAvatarUrl(data) {
  if (data == null) return ''
  if (typeof data === 'string') return normalizeMediaSrc(data)
  if (typeof data === 'object') {
    const o = /** @type {Record<string, unknown>} */ (data)
    const u = o.url ?? o.avatarUrl ?? o.avatar ?? o.data
    return typeof u === 'string' ? normalizeMediaSrc(u) : ''
  }
  return ''
}

const SEND_PROFILE_EMAIL_CODE_PATH =
  import.meta.env.VITE_PROFILE_EMAIL_CODE_PATH || SEND_REGISTER_EMAIL_CODE_PATH

/**
 * 修改资料前：向新邮箱发送验证码（POST，JSON：{ email }）。
 * 默认与注册发码同路径 {@link SEND_REGISTER_EMAIL_CODE_PATH}；可单独配置 `VITE_PROFILE_EMAIL_CODE_PATH`。
 * @param {string} email
 */
export function sendProfileEmailChangeCode(email) {
  const em = String(email ?? '').trim()
  if (!em) {
    return Promise.reject(new Error('请先填写新邮箱'))
  }
  return request(SEND_PROFILE_EMAIL_CODE_PATH, {
    method: 'POST',
    json: { email: em },
  })
}

/**
 * 更新个人资料 `PUT /api/user/profile`。
 * 后端 {@code uploadProfile(UpdateProfileDTO dto, String emailcode)} 将验证码作为 **查询参数** `emailcode` 传入（与 {@code @RequestBody} 并存），
 * 故前端从 body 中拆出 `emailCode`，通过 `?emailcode=` 发送；JSON 仅含 DTO 字段（nickname、phone、email 等）。
 * @param {{ nickname?: string, phone?: string, email?: string, emailCode?: string }} body
 */
export function updateProfile(body) {
  const payload = { ...body }
  const code = payload.emailCode != null ? String(payload.emailCode).trim() : ''
  delete payload.emailCode
  const q = new URLSearchParams()
  if (code) q.set('emailcode', code)
  const qs = q.toString()
  return request(`/api/user/profile${qs ? `?${qs}` : ''}`, {
    method: 'PUT',
    json: payload,
  })
}

/**
 * 修改登录密码（PUT /api/user/password）
 * @param {{ oldPassword: string, newPassword: string }} body
 */
export function updatePassword(body) {
  const oldPassword = String(body.oldPassword ?? '').trim()
  const newPassword = String(body.newPassword ?? '')
  if (!oldPassword) {
    return Promise.reject(new Error('请输入原密码'))
  }
  if (newPassword.length < 6) {
    return Promise.reject(new Error('新密码至少 6 位'))
  }
  return request('/api/user/password', {
    method: 'PUT',
    json: { oldPassword, newPassword },
  })
}
