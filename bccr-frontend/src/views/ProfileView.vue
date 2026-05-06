<script setup>
import { computed, onMounted, ref, watch } from 'vue'
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

const nickname = ref('')
const phone = ref('')
const email = ref('')

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
  saving.value = true
  try {
    await userApi.updateProfile({
      nickname: nickname.value.trim() || undefined,
      phone: phone.value.trim() || undefined,
      email: email.value.trim() || undefined,
    })
    await auth.refreshUser()
    fillFormFromUser()
    successMsg.value = '资料已保存'
  } catch (e) {
    errorMsg.value = e?.message || '保存失败'
  } finally {
    saving.value = false
  }
}

function triggerPickAvatar() {
  fileInput.value?.click()
}

async function onAvatarChange(ev) {
  const input = /** @type {HTMLInputElement} */ (ev.target)
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
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

            <input
              ref="fileInput"
              type="file"
              accept="image/*"
              class="sr-only"
              @change="onAvatarChange"
            />
            <button
              type="button"
              class="btn-upload"
              :disabled="uploading"
              @click="triggerPickAvatar"
            >
              <span class="btn-upload-ic" aria-hidden="true">✦</span>
              {{ uploading ? '上传中…' : '更换头像' }}
            </button>

            <details class="api-details">
              <summary>接口说明</summary>
              <p class="api-details-body">
                头像上传 <code class="mono">POST /api/user/avatar</code>，字段
                <code class="mono">file</code>
              </p>
            </details>
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
            </div>

            <div v-if="errorMsg" class="banner banner-err" role="alert">{{ errorMsg }}</div>
            <div v-if="successMsg" class="banner banner-ok">{{ successMsg }}</div>

            <button type="button" class="btn-save" :disabled="saving" @click="onSaveProfile">
              <span class="btn-save-inner">{{ saving ? '保存中…' : '保存资料' }}</span>
            </button>

            <details class="api-details api-details-foot">
              <summary>保存接口</summary>
              <p class="api-details-body">
                <code class="mono">PUT /api/user/profile</code>
                ，请求体含昵称、手机、邮箱等可写字段。
              </p>
            </details>
          </section>
        </div>
      </template>
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

.identity-card {
  padding: 1.35rem 1.25rem;
  border-radius: 1.05rem;
  border: 1px solid rgba(52, 211, 153, 0.18);
  background: rgba(15, 23, 42, 0.52);
  box-shadow:
    0 0 0 1px rgba(16, 185, 129, 0.06),
    0 18px 48px rgba(0, 0, 0, 0.22);
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
  background: rgba(15, 23, 42, 0.92);
  border: 2px solid rgba(15, 23, 42, 0.95);
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
  color: rgba(148, 163, 184, 0.95);
}

.identity-name {
  margin: 0 0 0.25rem;
  font-size: 1.12rem;
  font-weight: 720;
  color: #f8fafc;
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
  color: #a7f3d0;
}

.btn-upload {
  width: 100%;
  margin-top: 0.85rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  padding: 0.58rem 1rem;
  border-radius: 0.65rem;
  border: 1px solid rgba(56, 189, 248, 0.38);
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.18), rgba(59, 130, 246, 0.12));
  color: #bae6fd;
  font-size: 0.88rem;
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
  background: rgba(15, 23, 42, 0.48);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.2);
}

.form-card-head {
  margin-bottom: 1.15rem;
}

.form-card-title {
  margin: 0 0 0.35rem;
  font-size: 1.02rem;
  font-weight: 680;
  color: #f1f5f9;
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
  background: rgba(0, 0, 0, 0.18);
  margin-bottom: 0.65rem;
}

.chain-block {
  margin-bottom: 1rem;
  border-color: rgba(52, 211, 153, 0.15);
  background: linear-gradient(125deg, rgba(16, 185, 129, 0.06), rgba(15, 23, 42, 0.35));
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
  color: rgba(148, 163, 184, 0.92);
  margin-bottom: 0.35rem;
}

.chain-block .readonly-label {
  margin-bottom: 0;
}

.readonly-value {
  font-size: 0.92rem;
  color: #e2e8f0;
  word-break: break-all;
}

.chain-value {
  margin: 0.45rem 0 0;
  font-size: 0.84rem;
  color: #d1fae5;
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
  color: #a7f3d0;
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
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.38rem;
}

.field.span-2 {
  grid-column: 1 / -1;
}

.field-lbl {
  font-size: 0.74rem;
  font-weight: 600;
  color: rgba(148, 163, 184, 0.95);
}

.field-inp {
  padding: 0.58rem 0.78rem;
  border-radius: 0.55rem;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(15, 23, 42, 0.72);
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
  color: #fecaca;
}

.banner-ok {
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(74, 222, 128, 0.28);
  color: #bbf7d0;
}

.btn-save {
  width: 100%;
  margin-top: 1.1rem;
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
  color: #f8fafc;
}

.api-details {
  margin-top: 1rem;
  width: 100%;
  font-size: 0.76rem;
  color: var(--bccr-muted);
  text-align: left;
}

.api-details-foot {
  margin-top: 0.85rem;
}

.api-details summary {
  cursor: pointer;
  color: rgba(148, 163, 184, 0.95);
  font-weight: 500;
}

.api-details-body {
  margin: 0.45rem 0 0;
  line-height: 1.55;
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
  background: rgba(15, 23, 42, 0.4);
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
