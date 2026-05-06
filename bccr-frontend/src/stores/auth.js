import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as userApi from '@/api/user'
import { getStoredToken, setStoredToken } from '@/api/client'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(getStoredToken())
  const user = ref(null)

  const isLoggedIn = computed(() => Boolean(token.value))

  function persistToken(t) {
    token.value = t
    setStoredToken(t)
  }

  async function login(credentials) {
    const { token: t, raw } = await userApi.login(credentials)
    if (!t) {
      throw new Error('登录成功但未返回 Token，请检查后端 data 字段')
    }
    persistToken(t)
    user.value = raw?.user ?? raw ?? null
    try {
      user.value = await userApi.fetchMe()
    } catch {
      /* ignore */
    }
    return user.value
  }

  async function register(formData) {
    const { token: t, raw } = await userApi.registerMultipart(formData)
    if (t) {
      persistToken(t)
      user.value = raw?.user ?? raw ?? null
      try {
        user.value = await userApi.fetchMe()
      } catch {
        /* ignore */
      }
    }
    return { token: t, raw }
  }

  function logout() {
    persistToken('')
    user.value = null
  }

  async function hydrateUser() {
    if (!token.value) return null
    try {
      user.value = await userApi.fetchMe()
      return user.value
    } catch {
      logout()
      return null
    }
  }

  async function refreshUser() {
    if (!token.value) return null
    try {
      user.value = await userApi.fetchMe()
      return user.value
    } catch {
      return null
    }
  }

  return {
    token,
    user,
    isLoggedIn,
    login,
    register,
    logout,
    hydrateUser,
    refreshUser,
  }
})
