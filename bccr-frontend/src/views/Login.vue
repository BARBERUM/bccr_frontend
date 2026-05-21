<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { fetchLoginCaptchaImage } from '@/api/captcha'
import AuthShell from './AuthShell.vue'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const username = ref('')
const password = ref('')
const captchaCode = ref('')
const captchaKey = ref('')
const captchaImg = ref('')
const captchaLoading = ref(false)
const captchaError = ref('')
const loading = ref(false)
const errorMsg = ref('')

async function refreshCaptcha() {
  captchaError.value = ''
  captchaCode.value = ''
  captchaKey.value = ''
  captchaImg.value = ''
  captchaLoading.value = true
  try {
    const data = await fetchLoginCaptchaImage()
    captchaKey.value = data.captchaKey
    captchaImg.value = data.captchaImg
  } catch (e) {
    captchaError.value = e?.message || '验证码加载失败'
  } finally {
    captchaLoading.value = false
  }
}

onMounted(() => {
  refreshCaptcha()
})

const captchaReady = computed(
  () => Boolean(captchaKey.value && captchaImg.value && !captchaLoading.value),
)

const captchaOk = computed(() => {
  const c = captchaCode.value.trim()
  return c.length > 0 && captchaReady.value
})

const canSubmit = computed(
  () =>
    username.value.trim().length > 0 &&
    password.value.length > 0 &&
    captchaOk.value &&
    !loading.value,
)

async function onSubmit() {
  errorMsg.value = ''
  if (!captchaReady.value) {
    errorMsg.value = '请等待验证码加载完成'
    return
  }
  if (!captchaCode.value.trim()) {
    errorMsg.value = '请输入验证码'
    return
  }
  if (!canSubmit.value) return
  loading.value = true
  try {
    await auth.login({
      username: username.value.trim(),
      password: password.value,
      captchaKey: captchaKey.value,
      captchaCode: captchaCode.value.trim(),
    })
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/app/dashboard'
    await router.replace(redirect || '/app/dashboard')
  } catch (e) {
    errorMsg.value = e?.message || '登录失败'
    await refreshCaptcha()
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AuthShell title="欢迎回来" subtitle="请输入账号、密码及图形验证码后登录">
    <form class="form" @submit.prevent="onSubmit">
      <label class="field">
        <span class="lbl">用户名</span>
        <input
          v-model.trim="username"
          name="username"
          autocomplete="username"
          type="text"
          placeholder="请输入用户名"
          maxlength="64"
          class="inp"
        />
      </label>

      <label class="field">
        <span class="lbl">密码</span>
        <input
          v-model="password"
          name="password"
          autocomplete="current-password"
          type="password"
          placeholder="请输入密码"
          maxlength="128"
          class="inp"
        />
      </label>

      <div class="field captcha-block">
        <span class="lbl">验证码</span>
        <div class="captcha-row">
          <button
            type="button"
            class="captcha-img-btn"
            :disabled="captchaLoading"
            title="点击换一张"
            @click="refreshCaptcha"
          >
            <img
              v-if="captchaImg"
              :src="captchaImg"
              alt="验证码"
              class="captcha-img"
              width="132"
              height="50"
            />
            <span v-else-if="captchaLoading" class="captcha-ph">加载中…</span>
            <span v-else class="captcha-ph">点击加载</span>
          </button>
          <input
            v-model.trim="captchaCode"
            type="text"
            maxlength="12"
            class="inp captcha-inp"
            placeholder="图中字符"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            aria-label="图形验证码"
          />
          <button type="button" class="btn-refresh" title="换一张验证码" @click.prevent="refreshCaptcha">
            换一张
          </button>
        </div>
        <p v-if="captchaError" class="captcha-err">{{ captchaError }}</p>
       </div>

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
  gap: 1.05rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.lbl {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--bccr-label);
  letter-spacing: 0.02em;
}

.inp {
  width: 100%;
  padding: 0.68rem 0.85rem;
  border-radius: 0.55rem;
  border: 1px solid var(--bccr-border);
  background: var(--bccr-panel-bg);
  color: var(--bccr-text);
  font-size: 1rem;
  outline: none;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}

.inp:focus {
  border-color: rgba(59, 130, 246, 0.55);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
}

.inp::placeholder {
  color: var(--bccr-placeholder);
}

.captcha-block {
  padding: 0.65rem 0.75rem;
  border-radius: 0.65rem;
  border: 1px solid rgba(59, 130, 246, 0.18);
  background: linear-gradient(145deg, rgba(59, 130, 246, 0.08), var(--bccr-surface-muted));
}

.captcha-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.55rem;
}

.captcha-img-btn {
  flex-shrink: 0;
  padding: 0;
  border-radius: 0.45rem;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: var(--bccr-input-bg);
  cursor: pointer;
  overflow: hidden;
  line-height: 0;
  transition: border-color 0.12s, opacity 0.12s;
}

.captcha-img-btn:hover:not(:disabled) {
  border-color: rgba(59, 130, 246, 0.45);
}

.captcha-img-btn:disabled {
  opacity: 0.55;
  cursor: wait;
}

.captcha-img {
  display: block;
  width: 132px;
  height: auto;
  min-height: 40px;
  object-fit: contain;
}

.captcha-ph {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 132px;
  min-height: 46px;
  font-size: 0.78rem;
  color: var(--bccr-muted);
}

.captcha-inp {
  flex: 1;
  min-width: 6.5rem;
  max-width: 10rem;
  text-align: center;
  font-weight: 700;
  letter-spacing: 0.12em;
  font-family: ui-monospace, monospace;
}

.btn-refresh {
  padding: 0.45rem 0.65rem;
  border-radius: 0.45rem;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: rgba(30, 41, 59, 0.6);
  color: var(--bccr-muted);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    background 0.12s,
    color 0.12s;
}

.btn-refresh:hover {
  background: var(--bccr-pill-bg);
  color: var(--bccr-text);
}

.captcha-hint {
  margin: 0;
  font-size: 0.72rem;
  color: var(--bccr-muted);
  line-height: 1.45;
}

.captcha-err {
  margin: 0;
  font-size: 0.72rem;
  color: var(--bccr-danger);
  line-height: 1.45;
}

.err {
  margin: 0;
  font-size: 0.875rem;
  color: var(--bccr-danger);
}

.btn {
  margin-top: 0.15rem;
  width: 100%;
  padding: 0.75rem 1rem;
  border-radius: 0.55rem;
  border: none;
  font-size: 1rem;
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
  box-shadow: 0 8px 24px rgba(79, 70, 229, 0.28);
}

.btn.primary:not(:disabled):hover {
  background: linear-gradient(135deg, var(--bccr-accent-hover), #4f46e5);
  transform: translateY(-1px);
}

.hint {
  margin: 0.35rem 0 0;
  text-align: center;
  font-size: 0.875rem;
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
</style>
