<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import AuthShell from './AuthShell.vue'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const username = ref('')
const password = ref('')
const loading = ref(false)
const errorMsg = ref('')

const canSubmit = computed(
  () => username.value.trim().length > 0 && password.value.length > 0 && !loading.value,
)

async function onSubmit() {
  errorMsg.value = ''
  if (!canSubmit.value) return
  loading.value = true
  try {
    await auth.login({
      username: username.value.trim(),
      password: password.value,
    })
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/app/dashboard'
    await router.replace(redirect || '/app/dashboard')
  } catch (e) {
    errorMsg.value = e?.message || '登录失败'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AuthShell title="登录">
    <form class="form" @submit.prevent="onSubmit">
      <label class="field">
        <span>用户名</span>
        <input
          v-model.trim="username"
          name="username"
          autocomplete="username"
          type="text"
          placeholder="请输入用户名"
          maxlength="64"
        />
      </label>

      <label class="field">
        <span>密码</span>
        <input
          v-model="password"
          name="password"
          autocomplete="current-password"
          type="password"
          placeholder="请输入密码"
          maxlength="128"
        />
      </label>

      <p v-if="errorMsg" class="err" role="alert">{{ errorMsg }}</p>

      <button class="btn primary" type="submit" :disabled="!canSubmit">
        {{ loading ? '登录中…' : '登录' }}
      </button>

      <p class="hint">
        还没有账号？
        <RouterLink :to="{ name: 'register' }">去注册</RouterLink>
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

.field input {
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

.field input:focus {
  border-color: rgba(59, 130, 246, 0.55);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
}

.field input::placeholder {
  color: rgba(148, 163, 184, 0.55);
}

.err {
  margin: 0;
  font-size: 0.875rem;
  color: var(--bccr-danger);
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
</style>
