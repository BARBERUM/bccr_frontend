import { getStoredToken } from './client'

const API_BASE = import.meta.env.VITE_API_BASE?.replace(/\/$/, '') ?? ''

const CAPTCHA_IMAGE_PATH =
  import.meta.env.VITE_CAPTCHA_IMAGE_PATH || '/api/captcha/image'

/**
 * 获取登录用图形验证码（与 CaptchaController GET /api/captcha/image 一致）。
 * 兼容直接返回 `{ captchaKey, captchaImg }` 或统一 Result 包装 `{ success, data }`。
 * @returns {Promise<{ captchaKey: string, captchaImg: string }>}
 */
export async function fetchLoginCaptchaImage() {
  const headers = new Headers()
  const token = getStoredToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(`${API_BASE}${CAPTCHA_IMAGE_PATH}`, {
    method: 'GET',
    headers,
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(
      res.status === 404 ? '验证码接口不可用' : `加载验证码失败（${res.status}）`,
    )
  }
  let payload = {}
  try {
    payload = text ? JSON.parse(text) : {}
  } catch {
    throw new Error('验证码返回格式错误')
  }

  if (
    payload &&
    typeof payload === 'object' &&
    payload.data != null &&
    (payload.success === true || payload.code === 200)
  ) {
    payload = /** @type {Record<string, unknown>} */ (payload).data
  }

  const p = /** @type {Record<string, unknown>} */ (
    payload && typeof payload === 'object' ? payload : {}
  )
  const captchaKey = String(p.captchaKey ?? '').trim()
  const captchaImg = String(p.captchaImg ?? '').trim()
  if (!captchaKey || !captchaImg) {
    throw new Error('验证码数据不完整')
  }
  return { captchaKey, captchaImg }
}
