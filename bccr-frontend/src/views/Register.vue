<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import AuthShell from './AuthShell.vue'

const router = useRouter()
const auth = useAuthStore()

const username = ref('')
const password = ref('')
const confirm = ref('')
const email = ref('')
const role = ref('user')
const avatarFile = ref(/** @type {File | null} */ (null))
const avatarPreview = ref('')
const loading = ref(false)
const errorMsg = ref('')
const successMsg = ref('')

const canSubmit = computed(() => {
  if (loading.value) return false
  if (username.value.trim().length < 2) return false
  if (password.value.length < 6) return false
  if (password.value !== confirm.value) return false
  return true
})

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
  const em = email.value.trim()
  if (em) fd.append('email', em)
  fd.append('role', role.value === 'agent' ? 'agent' : 'user')
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
</script>

<template>
  <AuthShell
    title="注册"
    subtitle="multipart/form-data；可选头像字段 avatar"
  >
    <form class="form" @submit.prevent="onSubmit">
      <label class="field">
        <span>用户名</span>
        <input
          v-model.trim="username"
          name="username"
          autocomplete="username"
          type="text"
          placeholder="至少 2 个字符"
          minlength="2"
          maxlength="64"
        />
      </label>

      <label class="field">
        <span>邮箱（选填）</span>
        <input
          v-model.trim="email"
          name="email"
          autocomplete="email"
          type="email"
          placeholder="name@example.com"
          maxlength="128"
        />
      </label>

      <label class="field">
        <span>账号类型</span>
        <select v-model="role" class="select">
          <option value="user">普通用户</option>
          <option value="agent">版权代理</option>
        </select>
      </label>

      <div class="field">
        <span>头像（选填）</span>
        <div class="avatar-row">
          <div v-if="avatarPreview" class="thumb-wrap">
            <img :src="avatarPreview" alt="" class="thumb" />
          </div>
          <label class="file-btn">
            <input type="file" accept="image/*" class="sr-only" @change="onAvatarPick" />
            选择图片
          </label>
        </div>
      </div>

      <label class="field">
        <span>密码</span>
        <input
          v-model="password"
          name="new-password"
          autocomplete="new-password"
          type="password"
          placeholder="至少 6 位"
          minlength="6"
          maxlength="128"
        />
      </label>

      <label class="field">
        <span>确认密码</span>
        <input
          v-model="confirm"
          autocomplete="new-password"
          type="password"
          placeholder="再次输入密码"
          maxlength="128"
        />
      </label>

      <p v-if="errorMsg" class="err" role="alert">{{ errorMsg }}</p>
      <p v-if="successMsg" class="ok" role="status">{{ successMsg }}</p>

      <button class="btn primary" type="submit" :disabled="!canSubmit">
        {{ loading ? '提交中…' : '注册' }}
      </button>

      <p class="hint">
        已有账号？
        <RouterLink :to="{ name: 'login' }">去登录</RouterLink>
      </p>
    </form>
  </AuthShell>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.875rem;
  color: var(--bccr-muted);
}

.field span {
  font-weight: 500;
}

.field input,
.select {
  width: 100%;
  padding: 0.65rem 0.75rem;
  border-radius: 0.5rem;
  border: 1px solid var(--bccr-border);
  background: rgba(15, 23, 42, 0.55);
  color: var(--bccr-text);
  font-size: 1rem;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.select {
  cursor: pointer;
}

.field input:focus,
.select:focus {
  border-color: rgba(59, 130, 246, 0.55);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
}

.field input::placeholder {
  color: rgba(148, 163, 184, 0.55);
}

.avatar-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.thumb-wrap {
  width: 56px;
  height: 56px;
  border-radius: 0.45rem;
  overflow: hidden;
  border: 1px solid var(--bccr-border);
}

.thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.file-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.45rem 0.85rem;
  border-radius: 0.45rem;
  border: 1px solid rgba(59, 130, 246, 0.35);
  background: rgba(59, 130, 246, 0.15);
  color: #bfdbfe;
  font-size: 0.85rem;
  cursor: pointer;
}

.file-btn:hover {
  background: rgba(59, 130, 246, 0.25);
}

.err {
  margin: 0;
  font-size: 0.875rem;
  color: var(--bccr-danger);
}

.ok {
  margin: 0;
  font-size: 0.875rem;
  color: var(--bccr-success);
}

.btn {
  margin-top: 0.25rem;
  width: 100%;
  padding: 0.7rem 1rem;
  border-radius: 0.5rem;
  border: none;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s;
}

.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.btn.primary {
  color: #fff;
  background: linear-gradient(135deg, var(--bccr-accent), #6366f1);
}

.btn.primary:not(:disabled):hover {
  background: linear-gradient(135deg, var(--bccr-accent-hover), #4f46e5);
}

.hint {
  margin: 0.25rem 0 0;
  text-align: center;
  font-size: 0.875rem;
  color: var(--bccr-muted);
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
