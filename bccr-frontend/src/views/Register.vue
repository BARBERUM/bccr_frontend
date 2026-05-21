<script setup>
import { ref, computed, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import * as userApi from '@/api/user'
import AuthShell from './AuthShell.vue'

const router = useRouter()
const auth = useAuthStore()

const username = ref('')
const password = ref('')
const confirm = ref('')
const email = ref('')
const emailCode = ref('')
const nickname = ref('')
const phone = ref('')
const avatarFile = ref(/** @type {File | null} */ (null))
const avatarPreview = ref('')
const loading = ref(false)
const errorMsg = ref('')
const successMsg = ref('')

const sendingCode = ref(false)
const sendCooldown = ref(0)
/** @type {ReturnType<typeof setInterval> | null} */
let cooldownTimer = null

function isValidEmail(s) {
  const t = String(s ?? '').trim()
  if (!t) return false
  // 与后端 UserController 邮箱校验一致
  return /^[\w.-]+@[\w.-]+\.[a-zA-Z]{2,}$/.test(t)
}

const emailOk = computed(() => isValidEmail(email.value))

/** 只要填了邮箱且非发送中、非冷却即可点「获取验证码」，点击时再校验格式并请求 */
const canClickSendCode = computed(
  () => email.value.trim().length > 0 && sendCooldown.value === 0 && !sendingCode.value,
)

const canSubmit = computed(() => {
  if (loading.value) return false
  if (username.value.trim().length < 2) return false
  if (!emailOk.value) return false
  const code = emailCode.value.trim()
  if (code.length < 4 || code.length > 12) return false
  if (password.value.length < 6) return false
  if (password.value !== confirm.value) return false
  return true
})

const sendCodeLabel = computed(() => {
  if (sendingCode.value) return '发送中…'
  if (sendCooldown.value > 0) return `${sendCooldown.value}s 后重发`
  return '获取验证码'
})

function clearCooldown() {
  if (cooldownTimer) {
    clearInterval(cooldownTimer)
    cooldownTimer = null
  }
  sendCooldown.value = 0
}

function startCooldown(seconds = 60) {
  clearCooldown()
  sendCooldown.value = seconds
  cooldownTimer = setInterval(() => {
    sendCooldown.value -= 1
    if (sendCooldown.value <= 0) clearCooldown()
  }, 1000)
}

async function sendEmailCode() {
  errorMsg.value = ''
  successMsg.value = ''
  const em = email.value.trim()
  if (!em) {
    errorMsg.value = '请先填写邮箱'
    return
  }
  if (!isValidEmail(em)) {
    errorMsg.value = '邮箱格式不正确，请与注册邮箱一致'
    return
  }
  sendingCode.value = true
  try {
    await userApi.sendRegisterEmailCode(em)
    startCooldown(60)
    successMsg.value = '验证码已发送，请查收邮箱（含垃圾箱）'
    setTimeout(() => {
      if (successMsg.value === '验证码已发送，请查收邮箱（含垃圾箱）') successMsg.value = ''
    }, 4000)
  } catch (e) {
    const status = /** @type {any} */ (e)?.httpStatus
    const msg = String(e?.message || '验证码发送失败，请稍后重试')
    if (status === 404 || /not\s*found/i.test(msg)) {
      errorMsg.value =
        '发送验证码接口未找到(404)。请确认：① 后端已编译并包含 POST /api/user/register/send-email-code；② 若服务带 context-path 或端口不同，在本项目根目录 `.env.development` 配置 VITE_PROXY_TARGET（如 http://localhost:8080/你的上下文）；③ 若实际路径不同，配置 VITE_REGISTER_EMAIL_CODE_PATH。'
    } else if (status === 403 || status === 401) {
      errorMsg.value =
        '发送验证码被拒绝(403/401)。请在 Spring Security 中对注册相关接口放行，例如：requestMatchers("/api/user/register/**").permitAll()（并注意 CSRF 对 POST 的限制）。'
    } else {
      errorMsg.value = msg
    }
  } finally {
    sendingCode.value = false
  }
}

function onAvatarPick(ev) {
  const input = /** @type {HTMLInputElement} */ (ev.target)
  const file = input.files?.[0] ?? null
  if (avatarPreview.value) {
    URL.revokeObjectURL(avatarPreview.value)
    avatarPreview.value = ''
  }
  avatarFile.value = file
  if (file) {
    avatarPreview.value = URL.createObjectURL(file)
  }
}

function buildFormData() {
  const fd = new FormData()
  fd.append('username', username.value.trim())
  fd.append('password', password.value)
  fd.append('email', email.value.trim())
  fd.append('emailCode', emailCode.value.trim())
  const nick = nickname.value.trim()
  if (nick) fd.append('nickname', nick)
  const ph = phone.value.trim()
  if (ph) fd.append('phone', ph)
  if (avatarFile.value) fd.append('avatar', avatarFile.value)
  return fd
}

async function onSubmit() {
  errorMsg.value = ''
  successMsg.value = ''
  if (password.value !== confirm.value) {
    errorMsg.value = '两次输入的密码不一致'
    return
  }
  if (!canSubmit.value) return
  loading.value = true
  try {
    const { token } = await auth.register(buildFormData())
    if (token) {
      successMsg.value = '注册成功，已自动登录'
      await router.replace('/app/dashboard')
    } else {
      successMsg.value = '注册成功，请使用新账号登录'
      await router.replace({ name: 'login' })
    }
  } catch (e) {
    errorMsg.value = e?.message || '注册失败'
  } finally {
    loading.value = false
  }
}

onBeforeUnmount(() => {
  clearCooldown()
  if (avatarPreview.value) URL.revokeObjectURL(avatarPreview.value)
})
</script>

<template>
  <AuthShell
    wide
    compact
    title="创建账号"
    subtitle="需验证邮箱：获取验证码后填入；头像选填。"
  >
    <form class="reg-form" @submit.prevent="onSubmit">
      <div class="reg-cols">
        <section class="reg-card" aria-labelledby="reg-sec-basic">
          <h3 id="reg-sec-basic" class="reg-card-title">
            <span class="reg-card-ic" aria-hidden="true">◇</span>
            基本资料
          </h3>
          <label class="field">
            <span class="lbl">用户名 <em class="req">*</em></span>
            <input
              v-model.trim="username"
              name="username"
              autocomplete="username"
              type="text"
              placeholder="2～64 个字符"
              minlength="2"
              maxlength="64"
              class="inp"
            />
          </label>

          <div class="opt-grid">
            <label class="field">
              <span class="lbl">昵称 <span class="opt">选填</span></span>
              <input
                v-model.trim="nickname"
                name="nickname"
                type="text"
                maxlength="64"
                placeholder="展示名称"
                class="inp"
              />
            </label>
            <label class="field">
              <span class="lbl">手机 <span class="opt">选填</span></span>
              <input
                v-model.trim="phone"
                name="phone"
                type="tel"
                autocomplete="tel"
                maxlength="20"
                placeholder="手机号"
                class="inp"
              />
            </label>
          </div>

          <div class="field">
            <span class="lbl">邮箱 <em class="req">*</em></span>
            <div class="email-row">
              <input
                v-model.trim="email"
                name="email"
                autocomplete="email"
                type="email"
                placeholder="name@example.com"
                maxlength="128"
                class="inp email-inp"
              />
              <button
                type="button"
                class="btn-code"
                :disabled="!canClickSendCode"
                @click.prevent="sendEmailCode"
              >
                {{ sendCodeLabel }}
              </button>
            </div>
          </div>

          <label class="field">
            <span class="lbl">邮箱验证码 <em class="req">*</em></span>
            <input
              v-model.trim="emailCode"
              name="email-verification-code"
              type="text"
              inputmode="numeric"
              autocomplete="one-time-code"
              placeholder="邮件中的验证码"
              maxlength="12"
              class="inp mono-code"
            />
          </label>
        </section>

        <section class="reg-card" aria-labelledby="reg-sec-safe">
          <h3 id="reg-sec-safe" class="reg-card-title">
            <span class="reg-card-ic" aria-hidden="true">◎</span>
            账号安全
          </h3>
          <div class="pwd-grid">
            <label class="field">
              <span class="lbl">密码 <em class="req">*</em></span>
              <input
                v-model="password"
                name="new-password"
                autocomplete="new-password"
                type="password"
                placeholder="≥6 位"
                minlength="6"
                maxlength="128"
                class="inp"
              />
            </label>
            <label class="field">
              <span class="lbl">确认 <em class="req">*</em></span>
              <input
                v-model="confirm"
                autocomplete="new-password"
                type="password"
                placeholder="再输一次"
                maxlength="128"
                class="inp"
              />
            </label>
          </div>
          <p class="pwd-tip">建议字母与数字组合。</p>

          <div class="avatar-row" aria-label="头像选填">
            <span class="lbl lbl--inline">头像 <span class="opt">选填</span></span>
            <div class="avatar-ring" :class="{ empty: !avatarPreview }">
              <img v-if="avatarPreview" :src="avatarPreview" alt="" class="avatar-img" />
              <span v-else class="avatar-ph">无</span>
            </div>
            <label class="file-btn">
              <input type="file" accept="image/*" class="sr-only" @change="onAvatarPick" />
              选择
            </label>
          </div>
        </section>
      </div>

      <div class="reg-foot">
        <p v-if="errorMsg" class="err" role="alert">{{ errorMsg }}</p>
        <p v-else-if="successMsg" class="ok" role="status">{{ successMsg }}</p>
        <div v-else class="err-spacer" aria-hidden="true" />

        <button class="btn primary" type="submit" :disabled="!canSubmit">
          {{ loading ? '提交中…' : '完成注册' }}
        </button>

        <p class="hint">
          已有账号？
          <RouterLink :to="{ name: 'login' }">去登录</RouterLink>
        </p>
      </div>
    </form>
  </AuthShell>
</template>

<style scoped>
.reg-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.reg-cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.65rem;
  align-items: stretch;
}

@media (max-width: 560px) {
  .reg-cols {
    grid-template-columns: 1fr;
  }
}

.reg-card {
  padding: 0.72rem 0.8rem;
  border-radius: 0.65rem;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: var(--bccr-surface-muted);
  min-width: 0;
}

.reg-card-title {
  margin: 0 0 0.55rem;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--bccr-text);
  letter-spacing: 0.02em;
}

.reg-card-ic {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.35rem;
  height: 1.35rem;
  border-radius: 0.3rem;
  font-size: 0.6rem;
  color: var(--bccr-accent-text);
  background: rgba(59, 130, 246, 0.15);
  border: 1px solid rgba(59, 130, 246, 0.25);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.28rem;
  margin-bottom: 0.5rem;
}

.field--flush {
  margin-bottom: 0;
}

.field:last-child {
  margin-bottom: 0;
}

.lbl {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--bccr-label);
}

.lbl--inline {
  flex-shrink: 0;
  min-width: 3.25rem;
}

.req {
  color: var(--bccr-btn-danger-text);
  font-style: normal;
  font-weight: 700;
}

.opt {
  font-weight: 500;
  font-size: 0.68rem;
  color: var(--bccr-muted);
}

.inp {
  width: 100%;
  padding: 0.52rem 0.65rem;
  border-radius: 0.45rem;
  border: 1px solid var(--bccr-border);
  background: var(--bccr-panel-bg);
  color: var(--bccr-text);
  font-size: 0.9rem;
  outline: none;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}

.inp:focus {
  border-color: rgba(59, 130, 246, 0.55);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.18);
}

.inp::placeholder {
  color: var(--bccr-placeholder);
}

.email-row {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  gap: 0.45rem;
}

.email-inp {
  flex: 1;
  min-width: 8.5rem;
}

.btn-code {
  flex-shrink: 0;
  padding: 0 0.75rem;
  border-radius: 0.45rem;
  border: 1px solid rgba(99, 102, 241, 0.45);
  background: rgba(99, 102, 241, 0.18);
  color: #6d28d9;
  font-size: 0.76rem;
  font-weight: 650;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background 0.12s,
    opacity 0.12s;
}

.btn-code:hover:not(:disabled) {
  background: rgba(99, 102, 241, 0.3);
}

.btn-code:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.mono-code {
  font-family: ui-monospace, monospace;
  letter-spacing: 0.12em;
}

.opt-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.45rem;
  margin-bottom: 0.5rem;
}

.opt-grid .field {
  margin-bottom: 0;
}

@media (max-width: 400px) {
  .opt-grid {
    grid-template-columns: 1fr;
  }
}

.pwd-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.45rem;
}

.pwd-grid .field {
  margin-bottom: 0;
}

@media (max-width: 400px) {
  .pwd-grid {
    grid-template-columns: 1fr;
  }
}

.pwd-tip {
  margin: 0.35rem 0 0.45rem;
  font-size: 0.68rem;
  line-height: 1.35;
  color: var(--bccr-muted);
}

.avatar-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  padding-top: 0.35rem;
  border-top: 1px solid rgba(148, 163, 184, 0.1);
}

.avatar-ring {
  flex-shrink: 0;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid rgba(99, 102, 241, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bccr-card);
}

.avatar-ring.empty {
  border-style: dashed;
  border-color: var(--bccr-text-hint);
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-ph {
  font-size: 0.65rem;
  font-weight: 600;
  color: var(--bccr-placeholder);
}

.file-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.38rem 0.65rem;
  border-radius: 0.4rem;
  border: 1px solid rgba(59, 130, 246, 0.4);
  background: rgba(59, 130, 246, 0.14);
  color: var(--bccr-pill-text);
  font-size: 0.76rem;
  font-weight: 650;
  cursor: pointer;
  transition: background 0.12s;
}

.file-btn:hover {
  background: rgba(59, 130, 246, 0.26);
}

.reg-foot {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.err-spacer {
  min-height: 0.875rem;
}

.err {
  margin: 0;
  font-size: 0.82rem;
  color: var(--bccr-danger);
}

.ok {
  margin: 0;
  font-size: 0.82rem;
  color: var(--bccr-success);
}

.btn {
  width: 100%;
  padding: 0.62rem 0.85rem;
  border-radius: 0.5rem;
  border: none;
  font-size: 0.95rem;
  font-weight: 650;
  cursor: pointer;
  transition:
    background 0.15s,
    opacity 0.15s,
    transform 0.12s;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn.primary {
  color: #fff;
  background: linear-gradient(135deg, var(--bccr-accent), #6366f1);
  box-shadow: 0 6px 20px rgba(79, 70, 229, 0.25);
}

.btn.primary:not(:disabled):hover {
  background: linear-gradient(135deg, var(--bccr-accent-hover), #4f46e5);
  transform: translateY(-1px);
}

.hint {
  margin: 0;
  text-align: center;
  font-size: 0.8rem;
  color: var(--bccr-muted);
}

.hint :deep(a) {
  color: var(--bccr-accent-text);
  font-weight: 600;
  text-decoration: none;
}

.hint :deep(a:hover) {
  text-decoration: underline;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}
</style>
