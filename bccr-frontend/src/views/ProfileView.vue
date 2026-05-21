<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import * as userApi from '@/api/user'
import { formatRoleLabels } from '@/lib/roles'

const auth = useAuthStore()

const loading = ref(true)
const saving = ref(false)
const uploading = ref(false)
const errorMsg = ref('')
const successMsg = ref('')

const avatarUrl = ref('')
const avatarBust = ref(0)
const fileInput = ref(/** @type {HTMLInputElement | null} */ (null))
const fileCameraInput = ref(/** @type {HTMLInputElement | null} */ (null))
const avatarUploadWrap = ref(/** @type {HTMLElement | null} */ (null))
const avatarMenuOpen = ref(false)

const nickname = ref('')
const phone = ref('')
const email = ref('')
/** 上次保存成功后的邮箱快照，用于判断「是否变更」 */
const emailBaseline = ref('')
const emailCode = ref('')
const sendingEmailCode = ref(false)
const emailSendCooldown = ref(0)
/** @type {ReturnType<typeof setInterval> | null} */
let emailCooldownTimer = null

function isValidEmail(s) {
  const t = String(s ?? '').trim()
  if (!t) return false
  return /^[\w.-]+@[\w.-]+\.[a-zA-Z]{2,}$/.test(t)
}

const emailChangedFromBaseline = computed(
  () => email.value.trim() !== emailBaseline.value.trim(),
)

const canSendProfileEmailCode = computed(
  () =>
    emailChangedFromBaseline.value &&
    isValidEmail(email.value) &&
    emailSendCooldown.value === 0 &&
    !sendingEmailCode.value,
)

const emailSendCodeLabel = computed(() => {
  if (sendingEmailCode.value) return '发送中…'
  if (emailSendCooldown.value > 0) return `${emailSendCooldown.value}s 后重发`
  return '获取验证码'
})

function clearEmailCooldown() {
  if (emailCooldownTimer) {
    clearInterval(emailCooldownTimer)
    emailCooldownTimer = null
  }
  emailSendCooldown.value = 0
}

function startEmailCooldown(seconds = 60) {
  clearEmailCooldown()
  emailSendCooldown.value = seconds
  emailCooldownTimer = setInterval(() => {
    emailSendCooldown.value -= 1
    if (emailSendCooldown.value <= 0) clearEmailCooldown()
  }, 1000)
}

function syncEmailBaselineFromForm() {
  emailBaseline.value = email.value.trim()
  emailCode.value = ''
}

async function sendProfileEmailCode() {
  errorMsg.value = ''
  successMsg.value = ''
  const em = email.value.trim()
  if (!emailChangedFromBaseline.value) {
    errorMsg.value = '请先修改为新邮箱后再获取验证码'
    return
  }
  if (!isValidEmail(em)) {
    errorMsg.value = '请先填写格式正确的新邮箱'
    return
  }
  sendingEmailCode.value = true
  try {
    await userApi.sendProfileEmailChangeCode(em)
    startEmailCooldown(60)
    successMsg.value = '验证码已发送至新邮箱，请查收（含垃圾箱）'
    window.setTimeout(() => {
      if (successMsg.value === '验证码已发送至新邮箱，请查收（含垃圾箱）') successMsg.value = ''
    }, 4000)
  } catch (e) {
    const status = /** @type {any} */ (e)?.httpStatus
    const msg = String(e?.message || '验证码发送失败，请稍后重试')
    if (status === 404 || /not\s*found/i.test(msg)) {
      errorMsg.value =
        '发码接口未找到(404)。默认使用与注册相同的路径；请在 `.env.development` 检查 `VITE_PROXY_TARGET`，或设置 `VITE_PROFILE_EMAIL_CODE_PATH` / `VITE_REGISTER_EMAIL_CODE_PATH`。'
    } else {
      errorMsg.value = msg
    }
  } finally {
    sendingEmailCode.value = false
  }
}

watch(
  () => email.value.trim(),
  (v) => {
    if (v === emailBaseline.value.trim()) emailCode.value = ''
  },
)

onBeforeUnmount(() => {
  clearEmailCooldown()
  document.removeEventListener('pointerdown', onAvatarMenuOutside)
})

/** 移动端展示「拍照」，可走相机意图，减少系统大图选择面板 */
const showAvatarCameraEntry = computed(() => {
  if (typeof navigator === 'undefined' || !navigator.userAgent) return false
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
})

function onAvatarMenuOutside(ev) {
  const wrap = avatarUploadWrap.value
  if (!wrap || !avatarMenuOpen.value) return
  const t = /** @type {Node | null} */ (ev.target)
  if (t && !wrap.contains(t)) avatarMenuOpen.value = false
}

onMounted(() => {
  document.addEventListener('pointerdown', onAvatarMenuOutside)
})

function toggleAvatarMenu() {
  if (uploading.value) return
  avatarMenuOpen.value = !avatarMenuOpen.value
}

async function openAvatarPicker(kind) {
  avatarMenuOpen.value = false
  await nextTick()
  if (kind === 'camera') fileCameraInput.value?.click()
  else fileInput.value?.click()
}

const readonlyAccount = computed(() => {
  const u = /** @type {Record<string, unknown>} */ (auth.user || {})
  return String(u.username ?? u.loginName ?? u.account ?? '—')
})

const displayInitial = computed(() => {
  const nick = nickname.value.trim()
  if (nick) return nick.charAt(0).toUpperCase()
  const s = readonlyAccount.value
  return s && s !== '—' ? s.charAt(0).toUpperCase() : '?'
})

const headlineName = computed(() => {
  const n = nickname.value.trim()
  if (n) return n
  const u = readonlyAccount.value
  return u !== '—' ? u : '用户'
})

const roleLabels = computed(() => formatRoleLabels(auth.user))

const blockchainAddress = computed(() => {
  const u = /** @type {Record<string, unknown>} */ (auth.user || {})
  return String(u.blockchainAddress ?? u.blockChainAddress ?? '').trim()
})

function pickUserField(user, keys) {
  if (!user || typeof user !== 'object') return ''
  const o = /** @type {Record<string, unknown>} */ (user)
  for (const k of keys) {
    const v = o[k]
    if (v != null && v !== '') return String(v)
  }
  return ''
}

function fillFormFromUser() {
  const u = auth.user
  nickname.value = pickUserField(u, ['nickname', 'nickName', 'name'])
  phone.value = pickUserField(u, ['phone', 'mobile', 'phoneNumber', 'tel'])
  email.value = pickUserField(u, ['email'])
}

async function loadAvatar() {
  try {
    const u = await userApi.fetchAvatarUrlResolved()
    if (u) {
      avatarUrl.value = u
      return
    }
  } catch {
    /* ignore */
  }
  const u = /** @type {Record<string, unknown>} */ (auth.user || {})
  avatarUrl.value = userApi.extractAvatarUrl({
    url: u.avatarUrl ?? u.avatar ?? u.headImg,
  })
}

const avatarDisplay = computed(() => {
  if (!avatarUrl.value) return ''
  const sep = avatarUrl.value.includes('?') ? '&' : '?'
  return `${avatarUrl.value}${sep}t=${avatarBust.value}`
})

/** @param {string} addr */
function shortAddr(addr, head = 10, tail = 8) {
  const s = String(addr ?? '').trim()
  if (!s) return ''
  if (s.length <= head + tail + 1) return s
  return `${s.slice(0, head)}…${s.slice(-tail)}`
}

async function copyBlockchainAddress() {
  if (!blockchainAddress.value) return
  try {
    await navigator.clipboard.writeText(blockchainAddress.value)
    successMsg.value = '链上地址已复制到剪贴板'
    errorMsg.value = ''
    window.setTimeout(() => {
      if (successMsg.value === '链上地址已复制到剪贴板') successMsg.value = ''
    }, 2400)
  } catch {
    errorMsg.value = '复制失败，请手动选择文本复制'
  }
}

async function boot() {
  loading.value = true
  errorMsg.value = ''
  try {
    if (!auth.user) await auth.refreshUser()
    fillFormFromUser()
    await loadAvatar()
    syncEmailBaselineFromForm()
  } finally {
    loading.value = false
  }
}

onMounted(boot)

watch(
  () => auth.user,
  () => {
    fillFormFromUser()
  },
  { deep: true },
)

async function onSaveProfile() {
  successMsg.value = ''
  errorMsg.value = ''
  const em = email.value.trim()
  const base = emailBaseline.value.trim()
  if (em !== base) {
    if (!em) {
      errorMsg.value = '暂不支持在此处直接清空邮箱；请保留原邮箱或填写新邮箱并完成验证。'
      return
    }
    if (!isValidEmail(em)) {
      errorMsg.value = '新邮箱格式不正确'
      return
    }
    const code = emailCode.value.trim()
    if (code.length < 4 || code.length > 12) {
      errorMsg.value = '修改邮箱需先点击「获取验证码」，并填写邮件中的验证码（通常 4～12 位）'
      return
    }
  }
  saving.value = true
  try {
    /** @type {{ nickname?: string, phone?: string, email?: string, emailCode?: string }} */
    const payload = {
      nickname: nickname.value.trim() || undefined,
      phone: phone.value.trim() || undefined,
    }
    if (em !== base) {
      payload.email = em
      payload.emailCode = emailCode.value.trim()
    }
    await userApi.updateProfile(payload)
    await auth.refreshUser()
    fillFormFromUser()
    syncEmailBaselineFromForm()
    successMsg.value = '资料已保存'
  } catch (e) {
    errorMsg.value = e?.message || '保存失败'
  } finally {
    saving.value = false
  }
}

async function onAvatarChange(ev) {
  const input = /** @type {HTMLInputElement} */ (ev.target)
  const file = input.files?.[0]
  if (!file) {
    input.value = ''
    return
  }
  input.value = ''
  if (!file.type.startsWith('image/')) {
    errorMsg.value = '请选择图片文件'
    return
  }
  errorMsg.value = ''
  successMsg.value = ''
  uploading.value = true
  try {
    await userApi.uploadAvatar(file)
    await loadAvatar()
    await auth.refreshUser()
    avatarBust.value = Date.now()
    successMsg.value = '头像已更新'
  } catch (e) {
    errorMsg.value = e?.message || '头像上传失败'
  } finally {
    uploading.value = false
    avatarMenuOpen.value = false
  }
}

const pwdOld = ref('')
const pwdNew = ref('')
const pwdConfirm = ref('')
const pwdSaving = ref(false)
const pwdErr = ref('')
const pwdOk = ref('')
const pwdModalOpen = ref(false)

function openPwdModal() {
  pwdModalOpen.value = true
  pwdErr.value = ''
  pwdOk.value = ''
}

function closePwdModal() {
  if (pwdSaving.value) return
  pwdModalOpen.value = false
  pwdOld.value = ''
  pwdNew.value = ''
  pwdConfirm.value = ''
  pwdErr.value = ''
  pwdOk.value = ''
}

async function onChangePassword() {
  pwdErr.value = ''
  pwdOk.value = ''
  const old = pwdOld.value
  const nw = pwdNew.value
  const cf = pwdConfirm.value
  if (!String(old).trim()) {
    pwdErr.value = '请输入原密码'
    return
  }
  if (nw.length < 6) {
    pwdErr.value = '新密码至少 6 位'
    return
  }
  if (nw !== cf) {
    pwdErr.value = '两次输入的新密码不一致'
    return
  }
  if (old === nw) {
    pwdErr.value = '新密码不能与原密码相同'
    return
  }
  pwdSaving.value = true
  try {
    await userApi.updatePassword({ oldPassword: old, newPassword: nw })
    pwdOld.value = ''
    pwdNew.value = ''
    pwdConfirm.value = ''
    pwdOk.value = '密码已更新，下次登录请使用新密码。'
  } catch (e) {
    pwdErr.value = e?.message || '修改失败'
  } finally {
    pwdSaving.value = false
  }
}
</script>

<template>
  <div class="profile-shell">
    <div class="profile-page">
      <header class="hero">
        <div class="hero-glow" aria-hidden="true" />
        <h1 class="title">个人信息</h1>
        <p class="lead">
          维护头像与联系方式；用户名与链上地址由系统分配或绑定，用于登录与授权等业务场景。
        </p>
      </header>

      <div v-if="loading" class="skeleton-card" aria-busy="true">
        <div class="sk sk-avatar" />
        <div class="sk-col">
          <div class="sk sk-line lg" />
          <div class="sk sk-line" />
          <div class="sk sk-line sm" />
          <div class="sk sk-line" />
          <div class="sk sk-line" />
        </div>
      </div>

      <template v-else>
        <div class="profile-grid">
          <aside class="identity-card">
            <div class="avatar-shell">
              <div class="avatar-ring">
                <div class="preview">
                  <img v-if="avatarDisplay" :src="avatarDisplay" alt="" class="img" />
                  <span v-else class="placeholder">{{ displayInitial }}</span>
                </div>
              </div>
              <p class="identity-name">{{ headlineName }}</p>
              <p class="identity-account mono">@{{ readonlyAccount }}</p>
              <div v-if="roleLabels.length" class="role-row">
                <span v-for="r in roleLabels" :key="r" class="role-pill">{{ r }}</span>
              </div>
            </div>

            <div ref="avatarUploadWrap" class="avatar-upload-wrap">
            <input
              ref="fileInput"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
              class="sr-only"
              @change="onAvatarChange"
            />
            <input
              ref="fileCameraInput"
              type="file"
              accept="image/*"
              capture="environment"
              class="sr-only"
              @change="onAvatarChange"
            />
            <button
              type="button"
              class="btn-upload"
              :disabled="uploading"
              @click.stop="toggleAvatarMenu"
            >
              <span class="btn-upload-ic" aria-hidden="true">✦</span>
              {{ uploading ? '上传中…' : '更换头像' }}
            </button>
            <div
              v-if="avatarMenuOpen"
              class="avatar-source-pop"
              role="menu"
              aria-label="选择头像图片来源"
              @click.stop
            >
              <button type="button" class="avatar-pop-item" role="menuitem" @click="openAvatarPicker('file')">
                从相册 / 文件夹选择…
              </button>
              <button
                v-if="showAvatarCameraEntry"
                type="button"
                class="avatar-pop-item"
                role="menuitem"
                @click="openAvatarPicker('camera')"
              >
                拍照
              </button>
            </div>
            </div>

          </aside>

          <section class="form-card">
            <div class="form-card-head">
              <h2 class="form-card-title">联系方式</h2>
              <p class="form-card-desc">以下字段可通过保存同步至服务端。</p>
            </div>

            <div class="readonly-block chain-block">
              <div class="chain-head">
                <span class="readonly-label">链上地址</span>
                <button
                  v-if="blockchainAddress"
                  type="button"
                  class="btn-copy"
                  @click="copyBlockchainAddress"
                >
                  复制
                </button>
              </div>
              <p v-if="blockchainAddress" class="chain-value mono" :title="blockchainAddress">
                {{ shortAddr(blockchainAddress) }}
              </p>
              <p v-else class="chain-empty">尚未绑定 · 授权等功能可能受限</p>
            </div>

            <div class="fields">
              <label class="field">
                <span class="field-lbl">昵称</span>
                <input
                  v-model="nickname"
                  type="text"
                  maxlength="64"
                  class="field-inp"
                  placeholder="对外展示的名称"
                  autocomplete="nickname"
                />
              </label>

              <label class="field">
                <span class="field-lbl">手机号</span>
                <input
                  v-model="phone"
                  type="tel"
                  maxlength="20"
                  class="field-inp"
                  placeholder="可选"
                  autocomplete="tel"
                />
              </label>

              <label class="field span-2">
                <span class="field-lbl">邮箱</span>
                <input
                  v-model="email"
                  type="email"
                  maxlength="128"
                  class="field-inp"
                  placeholder="可选"
                  autocomplete="email"
                />
              </label>

              <div v-if="emailChangedFromBaseline" class="email-verify-block span-2">
                <p class="email-verify-hint">
                  您已修改邮箱，需向<strong>新邮箱</strong>获取验证码并填写后再保存。
                </p>
                <div class="email-verify-row">
                  <input
                    v-model.trim="emailCode"
                    type="text"
                    inputmode="numeric"
                    maxlength="12"
                    class="field-inp email-code-inp"
                    placeholder="邮箱验证码"
                    autocomplete="one-time-code"
                  />
                  <button
                    type="button"
                    class="btn-email-code"
                    :disabled="!canSendProfileEmailCode"
                    @click="sendProfileEmailCode"
                  >
                    {{ emailSendCodeLabel }}
                  </button>
                </div>
              </div>
            </div>

            <div v-if="errorMsg" class="banner banner-err" role="alert">{{ errorMsg }}</div>
            <div v-if="successMsg" class="banner banner-ok">{{ successMsg }}</div>

            <div class="form-actions">
              <button type="button" class="btn-save" :disabled="saving" @click="onSaveProfile">
                <span class="btn-save-inner">{{ saving ? '保存中…' : '保存资料' }}</span>
              </button>
              <button type="button" class="btn-pwd-trigger" @click="openPwdModal">
                修改登录密码
              </button>
            </div>
          </section>
        </div>
      </template>

      <div
        v-if="pwdModalOpen"
        class="pwd-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pwd-modal-title"
        @click.self="closePwdModal"
      >
        <div class="pwd-modal bccr-scroll-slim" @click.stop>
          <div class="pwd-modal__head">
            <h2 id="pwd-modal-title" class="pwd-modal__title">修改登录密码</h2>
            <button type="button" class="pwd-modal__close" aria-label="关闭" @click="closePwdModal">
              ×
            </button>
          </div>
          <p class="pwd-modal__lead">
            请填写当前密码与新密码。修改成功后请使用新密码登录；其他设备上的会话可能需重新登录。
          </p>
          <div class="pwd-modal__fields">
            <label class="pwd-field">
              <span class="pwd-field__lbl">当前密码</span>
              <input
                v-model="pwdOld"
                type="password"
                class="pwd-field__inp"
                autocomplete="current-password"
                placeholder="请输入原密码"
              />
            </label>
            <label class="pwd-field">
              <span class="pwd-field__lbl">新密码</span>
              <input
                v-model="pwdNew"
                type="password"
                class="pwd-field__inp"
                autocomplete="new-password"
                placeholder="至少 6 位"
                minlength="6"
              />
            </label>
            <label class="pwd-field">
              <span class="pwd-field__lbl">确认新密码</span>
              <input
                v-model="pwdConfirm"
                type="password"
                class="pwd-field__inp"
                autocomplete="new-password"
                placeholder="再次输入新密码"
                minlength="6"
              />
            </label>
          </div>
          <div v-if="pwdErr" class="banner banner-err pwd-modal__banner" role="alert">{{ pwdErr }}</div>
          <div v-if="pwdOk" class="banner banner-ok pwd-modal__banner">{{ pwdOk }}</div>
          <div class="pwd-modal__actions">
            <button type="button" class="pwd-btn pwd-btn--ghost" :disabled="pwdSaving" @click="closePwdModal">
              取消
            </button>
            <button type="button" class="pwd-btn pwd-btn--primary" :disabled="pwdSaving" @click="onChangePassword">
              {{ pwdSaving ? '提交中…' : '确认修改' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.profile-shell {
  width: 100%;
  display: flex;
  justify-content: center;
  padding: 0.75rem 0 2.75rem;
  box-sizing: border-box;
  min-height: min(78vh, calc(100dvh - 8rem));
}

.profile-page {
  width: 100%;
  max-width: 880px;
}

.hero {
  position: relative;
  margin-bottom: 1.35rem;
  padding-bottom: 0.2rem;
}

.hero-glow {
  position: absolute;
  width: 240px;
  height: 240px;
  right: -30px;
  top: -70px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgba(56, 189, 248, 0.22) 0%,
    rgba(52, 211, 153, 0.08) 42%,
    transparent 68%
  );
  pointer-events: none;
  z-index: 0;
}

.title {
  position: relative;
  z-index: 1;
  margin: 0 0 0.45rem;
  font-size: 1.55rem;
  font-weight: 780;
  letter-spacing: -0.03em;
  background: linear-gradient(118deg, #e0f2fe 0%, #38bdf8 38%, #34d399 72%, #cbd5e1 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.lead {
  position: relative;
  z-index: 1;
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.62;
  color: var(--bccr-muted);
  max-width: 34rem;
}

.profile-grid {
  display: grid;
  grid-template-columns: minmax(0, 280px) minmax(0, 1fr);
  gap: 1.15rem;
  align-items: start;
}

@media (max-width: 780px) {
  .profile-grid {
    grid-template-columns: 1fr;
  }
}

.form-actions {
  margin-top: 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  align-items: stretch;
}

.btn-pwd-trigger {
  width: 100%;
  padding: 0.62rem 1rem;
  border-radius: 0.65rem;
  border: 1px solid rgba(148, 163, 184, 0.28);
  background: var(--bccr-card);
  color: var(--bccr-muted);
  font-size: 0.86rem;
  font-weight: 650;
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s,
    color 0.15s;
}

.btn-pwd-trigger:hover {
  background: rgba(56, 189, 248, 0.1);
  border-color: rgba(56, 189, 248, 0.35);
  color: var(--bccr-accent-text);
}

.identity-card {
  position: relative;
  padding: 1.35rem 1.25rem;
  border-radius: 1.05rem;
  border: 1px solid rgba(52, 211, 153, 0.18);
  background: var(--bccr-card);
  box-shadow:
    0 0 0 1px rgba(16, 185, 129, 0.06),
    0 18px 48px var(--bccr-code-bg);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.avatar-shell {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.avatar-ring {
  padding: 4px;
  border-radius: 50%;
  background: linear-gradient(145deg, rgba(56, 189, 248, 0.85), rgba(52, 211, 153, 0.65), rgba(99, 102, 241, 0.45));
  box-shadow: 0 12px 36px rgba(34, 211, 238, 0.15);
  margin-bottom: 1rem;
}

.preview {
  width: 112px;
  height: 112px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--bccr-nav-bg);
  border: 2px solid var(--bccr-surface);
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview .img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.placeholder {
  font-size: 2.35rem;
  font-weight: 750;
  color: var(--bccr-label);
}

.identity-name {
  margin: 0 0 0.25rem;
  font-size: 1.12rem;
  font-weight: 720;
  color: var(--bccr-text);
  letter-spacing: -0.02em;
}

.identity-account {
  margin: 0 0 0.75rem;
  font-size: 0.82rem;
  color: rgba(167, 243, 208, 0.82);
}

.role-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  justify-content: center;
  margin-bottom: 0.25rem;
}

.role-pill {
  font-size: 0.68rem;
  font-weight: 650;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 0.22rem 0.55rem;
  border-radius: 999px;
  border: 1px solid rgba(52, 211, 153, 0.35);
  background: rgba(16, 185, 129, 0.12);
  color: var(--bccr-success-text);
}

.avatar-upload-wrap {
  position: relative;
  width: 100%;
  max-width: 11rem;
  margin-top: 0.85rem;
  display: flex;
  flex-direction: column;
  align-items: stretch;
}

.avatar-source-pop {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  bottom: calc(100% + 0.4rem);
  z-index: 8;
  width: max-content;
  min-width: 10.25rem;
  max-width: min(13.5rem, 92vw);
  padding: 0.3rem;
  border-radius: 0.55rem;
  border: 1px solid rgba(56, 189, 248, 0.32);
  background: var(--bccr-surface-overlay);
  box-shadow:
    0 0 0 1px var(--bccr-hover),
    0 12px 32px rgba(0, 0, 0, 0.38);
  backdrop-filter: blur(10px);
}

.avatar-pop-item {
  display: block;
  width: 100%;
  margin: 0;
  padding: 0.45rem 0.55rem;
  border: none;
  border-radius: 0.4rem;
  background: transparent;
  color: var(--bccr-text);
  font-size: 0.78rem;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
  line-height: 1.35;
  transition: background 0.12s;
}

.avatar-pop-item:hover {
  background: rgba(56, 189, 248, 0.12);
}

.btn-upload {
  width: 100%;
  margin-top: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.48rem 0.75rem;
  border-radius: 0.6rem;
  border: 1px solid rgba(56, 189, 248, 0.38);
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.18), rgba(59, 130, 246, 0.12));
  color: var(--bccr-accent-text);
  font-size: 0.82rem;
  font-weight: 650;
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s,
    transform 0.12s;
}

.btn-upload:hover:not(:disabled) {
  border-color: rgba(125, 211, 252, 0.55);
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.28), rgba(59, 130, 246, 0.18));
}

.btn-upload:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-upload-ic {
  font-size: 0.75rem;
  opacity: 0.85;
}

.form-card {
  padding: 1.35rem 1.45rem;
  border-radius: 1.05rem;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: var(--bccr-card);
  box-shadow: 0 20px 50px var(--bccr-hover);
}

.form-card-head {
  margin-bottom: 1.15rem;
}

.form-card-title {
  margin: 0 0 0.35rem;
  font-size: 1.02rem;
  font-weight: 680;
  color: var(--bccr-text);
}

.form-card-desc {
  margin: 0;
  font-size: 0.82rem;
  color: var(--bccr-muted);
  line-height: 1.5;
}

.readonly-block {
  padding: 0.72rem 0.85rem;
  border-radius: 0.65rem;
  border: 1px solid rgba(148, 163, 184, 0.12);
  background: var(--bccr-hover);
  margin-bottom: 0.65rem;
}

.chain-block {
  margin-bottom: 1rem;
  border-color: rgba(52, 211, 153, 0.15);
  background: linear-gradient(125deg, rgba(16, 185, 129, 0.06), var(--bccr-surface-muted));
}

.chain-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.readonly-label {
  display: block;
  font-size: 0.68rem;
  font-weight: 650;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--bccr-text-secondary);
  margin-bottom: 0.35rem;
}

.chain-block .readonly-label {
  margin-bottom: 0;
}

.readonly-value {
  font-size: 0.92rem;
  color: var(--bccr-text);
  word-break: break-all;
}

.chain-value {
  margin: 0.45rem 0 0;
  font-size: 0.84rem;
  color: var(--bccr-success-text);
  word-break: break-all;
}

.chain-empty {
  margin: 0.35rem 0 0;
  font-size: 0.82rem;
  color: rgba(251, 191, 36, 0.88);
}

.btn-copy {
  flex-shrink: 0;
  padding: 0.28rem 0.55rem;
  border-radius: 0.4rem;
  border: 1px solid rgba(52, 211, 153, 0.35);
  background: rgba(16, 185, 129, 0.12);
  color: var(--bccr-success-text);
  font-size: 0.72rem;
  font-weight: 650;
  cursor: pointer;
}

.btn-copy:hover {
  background: rgba(16, 185, 129, 0.2);
}

.fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.85rem 1rem;
}

@media (max-width: 520px) {
  .fields {
    grid-template-columns: 1fr;
  }

  .field.span-2 {
    grid-column: auto;
  }

  .email-verify-block.span-2 {
    grid-column: auto;
  }
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.38rem;
}

.field.span-2 {
  grid-column: 1 / -1;
}

.email-verify-block.span-2 {
  grid-column: 1 / -1;
}

.email-verify-hint {
  margin: 0 0 0.5rem;
  font-size: 0.78rem;
  line-height: 1.5;
  color: rgba(251, 191, 36, 0.92);
}

.email-verify-hint strong {
  color: var(--bccr-warning-text);
  font-weight: 700;
}

.email-verify-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: stretch;
}

.email-code-inp {
  flex: 1 1 10rem;
  min-width: 0;
}

.btn-email-code {
  flex-shrink: 0;
  padding: 0.58rem 0.95rem;
  border-radius: 0.55rem;
  border: 1px solid rgba(56, 189, 248, 0.4);
  background: rgba(14, 165, 233, 0.15);
  color: var(--bccr-accent-text);
  font-size: 0.82rem;
  font-weight: 650;
  cursor: pointer;
  white-space: nowrap;
  transition:
    background 0.12s,
    border-color 0.12s,
    opacity 0.12s;
}

.btn-email-code:hover:not(:disabled) {
  background: rgba(14, 165, 233, 0.26);
  border-color: rgba(125, 211, 252, 0.55);
}

.btn-email-code:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.field-lbl {
  font-size: 0.74rem;
  font-weight: 600;
  color: var(--bccr-label);
}

.field-inp {
  padding: 0.58rem 0.78rem;
  border-radius: 0.55rem;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: var(--bccr-card);
  color: var(--bccr-text);
  font-size: 0.9rem;
  outline: none;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}

.field-inp:focus {
  border-color: rgba(56, 189, 248, 0.45);
  box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.14);
}

.banner {
  margin-top: 1rem;
  padding: 0.58rem 0.78rem;
  border-radius: 0.55rem;
  font-size: 0.86rem;
  line-height: 1.45;
}

.banner-err {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(248, 113, 113, 0.28);
  color: var(--bccr-danger);
}

.banner-ok {
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(74, 222, 128, 0.28);
  color: var(--bccr-success-text);
}

.btn-save {
  width: 100%;
  margin-top: 0;
  padding: 0;
  border: none;
  border-radius: 0.68rem;
  cursor: pointer;
  background: linear-gradient(135deg, #0ea5e9, #6366f1);
  box-shadow: 0 10px 28px rgba(99, 102, 241, 0.28);
  transition:
    transform 0.12s,
    filter 0.12s,
    opacity 0.12s;
}

.btn-save:hover:not(:disabled) {
  filter: brightness(1.06);
  transform: translateY(-1px);
}

.btn-save:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
}

.btn-save-inner {
  display: block;
  padding: 0.78rem 1rem;
  font-size: 0.93rem;
  font-weight: 700;
  color: var(--bccr-text);
}

.pwd-overlay {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  padding-bottom: max(1rem, env(safe-area-inset-bottom, 0));
  box-sizing: border-box;
  background: rgba(12, 18, 34, 0.72);
  backdrop-filter: blur(8px);
}

.pwd-modal {
  width: 100%;
  max-width: 420px;
  max-height: min(90vh, 560px);
  overflow: auto;
  padding: 1.25rem 1.35rem 1.2rem;
  border-radius: 1rem;
  border: 1px solid rgba(56, 189, 248, 0.28);
  background: var(--bccr-surface);
  box-shadow: 0 24px 64px var(--bccr-overlay);
}

.pwd-modal__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.pwd-modal__title {
  margin: 0;
  font-size: 1.12rem;
  font-weight: 750;
  color: var(--bccr-accent-text);
  letter-spacing: -0.02em;
}

.pwd-modal__close {
  flex-shrink: 0;
  width: 2rem;
  height: 2rem;
  margin: -0.25rem -0.35rem 0 0;
  padding: 0;
  border: none;
  border-radius: 0.45rem;
  background: transparent;
  color: var(--bccr-muted);
  font-size: 1.35rem;
  line-height: 1;
  cursor: pointer;
  transition:
    background 0.12s,
    color 0.12s;
}

.pwd-modal__close:hover {
  background: rgba(148, 163, 184, 0.12);
  color: var(--bccr-text);
}

.pwd-modal__lead {
  margin: 0 0 1rem;
  font-size: 0.8rem;
  line-height: 1.55;
  color: var(--bccr-muted);
}

.pwd-modal__fields {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.pwd-field {
  display: flex;
  flex-direction: column;
  gap: 0.32rem;
}

.pwd-field__lbl {
  font-size: 0.72rem;
  font-weight: 650;
  color: var(--bccr-muted);
  letter-spacing: 0.03em;
}

.pwd-field__inp {
  padding: 0.55rem 0.65rem;
  border-radius: 0.5rem;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: var(--bccr-code-bg);
  color: var(--bccr-text);
  font-size: 0.9rem;
  font-family: inherit;
}

.pwd-field__inp:focus {
  outline: none;
  border-color: rgba(56, 189, 248, 0.45);
  box-shadow: 0 0 0 2px rgba(14, 165, 233, 0.12);
}

.pwd-modal__banner {
  margin-top: 0.75rem;
}

.pwd-modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.1rem;
  flex-wrap: wrap;
}

.pwd-btn {
  padding: 0.48rem 1.1rem;
  border-radius: 0.5rem;
  font-size: 0.86rem;
  font-weight: 650;
  cursor: pointer;
  border: none;
  transition:
    opacity 0.12s,
    filter 0.12s;
}

.pwd-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.pwd-btn--ghost {
  border: 1px solid rgba(148, 163, 184, 0.28);
  background: transparent;
  color: var(--bccr-muted);
}

.pwd-btn--ghost:hover:not(:disabled) {
  background: rgba(148, 163, 184, 0.08);
  color: var(--bccr-text);
}

.pwd-btn--primary {
  background: linear-gradient(135deg, #0ea5e9, #6366f1);
  color: var(--bccr-text);
  box-shadow: 0 6px 20px rgba(99, 102, 241, 0.25);
}

.pwd-btn--primary:hover:not(:disabled) {
  filter: brightness(1.05);
}

.mono {
  font-family: ui-monospace, monospace;
  font-size: 0.82em;
}

.skeleton-card {
  display: grid;
  grid-template-columns: minmax(0, 260px) minmax(0, 1fr);
  gap: 1.15rem;
  padding: 1.35rem;
  border-radius: 1.05rem;
  border: 1px solid rgba(148, 163, 184, 0.12);
  background: var(--bccr-surface-muted);
}

@media (max-width: 640px) {
  .skeleton-card {
    grid-template-columns: 1fr;
    justify-items: center;
  }
}

.sk-col {
  flex: 1;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.sk {
  border-radius: 0.5rem;
  background: linear-gradient(
    90deg,
    rgba(51, 65, 85, 0.35) 0%,
    rgba(71, 85, 105, 0.45) 50%,
    rgba(51, 65, 85, 0.35) 100%
  );
  background-size: 200% 100%;
  animation: sk-shimmer 1.2s ease-in-out infinite;
}

.sk-avatar {
  width: 120px;
  height: 120px;
  border-radius: 50%;
}

.sk-line {
  height: 0.85rem;
}

.sk-line.lg {
  height: 1.15rem;
  width: 55%;
}

.sk-line.sm {
  width: 40%;
}

@keyframes sk-shimmer {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: -100% 0;
  }
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
