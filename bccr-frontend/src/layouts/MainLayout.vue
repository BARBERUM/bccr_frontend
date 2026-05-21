<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { navItemsForUser } from '@/config/nav'
import { formatRoleLabels } from '@/lib/roles'
import * as userApi from '@/api/user'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

/** 左侧导航：鼠标移入展开，移出后短暂延迟收起，便于移入菜单项 */
const navDockOpen = ref(false)
let navDockLeaveTimer = null
function onNavDockEnter() {
  if (navDockLeaveTimer) {
    clearTimeout(navDockLeaveTimer)
    navDockLeaveTimer = null
  }
  navDockOpen.value = true
}
function onNavDockLeave() {
  navDockLeaveTimer = setTimeout(() => {
    navDockOpen.value = false
    navDockLeaveTimer = null
  }, 220)
}

const loadError = ref('')
const avatarUrl = ref('')
const avatarBust = ref(0)

watch(avatarUrl, (next, prev) => {
  if (next !== prev) avatarBust.value = Date.now()
})

const filteredNav = computed(() => navItemsForUser(auth.user))
const roleLabels = computed(() => formatRoleLabels(auth.user))
const displayName = computed(() => {
  const u = /** @type {Record<string, any>} */ (auth.user || {})
  return u.username ?? u.loginName ?? u.account ?? u.nickname ?? '用户'
})

const accountLabel = computed(() => {
  const u = /** @type {Record<string, unknown>} */ (auth.user || {})
  const s = u.username ?? u.loginName ?? u.account
  return typeof s === 'string' && s.trim() ? s.trim() : ''
})

const avatarInitial = computed(() => {
  const s = accountLabel.value
  if (!s) return '?'
  return s.charAt(0).toUpperCase()
})

const avatarSrc = computed(() => {
  if (!avatarUrl.value) return ''
  const sep = avatarUrl.value.includes('?') ? '&' : '?'
  return `${avatarUrl.value}${sep}t=${avatarBust.value}`
})

async function loadAvatar() {
  if (!auth.isLoggedIn) {
    avatarUrl.value = ''
    return
  }
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

const pageTitle = computed(() => {
  if (route.name === 'work-detail') return '作品详情'
  const m = filteredNav.value.find((i) => route.path === i.to || route.path.startsWith(`${i.to}/`))
  if (m) return m.label
  return '工作台'
})

onMounted(async () => {
  loadError.value = ''
  if (!auth.isLoggedIn) {
    await router.replace({ name: 'login', query: { redirect: route.fullPath } })
    return
  }
  if (!auth.user) {
    const u = await auth.hydrateUser()
    if (!u) loadError.value = '无法加载用户信息，请重新登录'
  }
  await loadAvatar()
})

watch(
  () => auth.user,
  () => {
    loadAvatar()
  },
  { deep: true },
)

watch(
  () => auth.isLoggedIn,
  (ok) => {
    if (!ok) avatarUrl.value = ''
    else loadAvatar()
  },
)

onUnmounted(() => {
  if (navDockLeaveTimer) clearTimeout(navDockLeaveTimer)
})

function logout() {
  auth.logout()
  router.replace({ name: 'login' })
}

function isNavActive(to) {
  if (to === '/app/dashboard') return route.path === to
  return route.path === to || route.path.startsWith(`${to}/`)
}
</script>

<template>
  <div class="layout">
    <div
      class="nav-flyout"
      :class="{ 'is-open': navDockOpen }"
      @mouseenter="onNavDockEnter"
      @mouseleave="onNavDockLeave"
    >
      <div class="nav-rail" aria-hidden="true">
        <span class="nav-rail-mark">菜单</span>
      </div>
      <aside class="aside" aria-label="主导航">
        <div class="brand">
          <span class="logo">BCCR</span>
          <div class="brand-text">
            <span class="name">版权保护系统</span>
            <span class="sub">指纹 · 查重 · 授权</span>
          </div>
        </div>

        <nav class="nav">
          <RouterLink
            v-for="item in filteredNav"
            :key="item.to"
            :to="item.to"
            class="nav-item"
            :class="{ active: isNavActive(item.to) }"
          >
            {{ item.label }}
          </RouterLink>
        </nav>
      </aside>
    </div>

    <div class="main-col">
      <header class="topbar">
        <div class="top-left">
          <h1 class="page-title">{{ pageTitle }}</h1>
        </div>
        <div class="top-right">
          <p v-if="loadError" class="warn">{{ loadError }}</p>
          <template v-else>
            <RouterLink :to="{ name: 'profile' }" class="user-chip" title="个人信息">
              <span class="avatar-wrap" aria-hidden="true">
                <img v-if="avatarSrc" :src="avatarSrc" alt="" class="avatar-img" />
                <span v-else class="avatar-letter">{{ avatarInitial }}</span>
              </span>
              <span class="who">{{ displayName }}</span>
            </RouterLink>
            <span v-for="r in roleLabels" :key="r" class="pill">{{ r }}</span>
          </template>
          <button type="button" class="btn-out" @click="logout">退出</button>
        </div>
      </header>

      <main class="content bccr-scroll-slim">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  min-height: 100dvh;
  position: relative;
}

.nav-flyout {
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  z-index: 300;
  display: flex;
  flex-direction: row;
  align-items: stretch;
  width: min(268px, 90vw);
  max-width: 100%;
  transform: translateX(calc(-100% + 13px));
  transition:
    transform 0.28s cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 0.25s ease;
  box-shadow: none;
  pointer-events: auto;
}

.nav-flyout.is-open {
  transform: translateX(0);
  box-shadow: var(--bccr-shadow-lg);
}

.nav-rail {
  flex-shrink: 0;
  width: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bccr-nav-bg);
  border-right: 1px solid var(--bccr-border);
  cursor: default;
}

.nav-rail-mark {
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  writing-mode: vertical-rl;
  text-orientation: mixed;
  color: var(--bccr-muted);
  user-select: none;
}

.aside {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  border-right: none;
  background: var(--bccr-nav-bg);
  backdrop-filter: blur(14px);
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 1.1rem 1rem 1rem;
  border-bottom: 1px solid var(--bccr-border);
}

.logo {
  flex-shrink: 0;
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.65rem;
  font-weight: 800;
  font-size: 0.72rem;
  letter-spacing: 0.06em;
  color: #fff;
  background: linear-gradient(135deg, var(--bccr-accent), #8b5cf6);
}

.brand-text {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.name {
  font-size: 0.88rem;
  font-weight: 650;
  line-height: 1.2;
}

.sub {
  font-size: 0.68rem;
  color: var(--bccr-muted);
}

.nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.75rem 0.6rem;
  overflow-y: auto;
}

.nav-item {
  padding: 0.55rem 0.75rem;
  border-radius: 0.45rem;
  font-size: 0.9rem;
  color: var(--bccr-muted);
  text-decoration: none;
  transition: background 0.12s, color 0.12s;
}

.nav-item:hover {
  color: var(--bccr-text);
  background: var(--bccr-hover);
}

.nav-item.active {
  color: var(--bccr-accent-text);
  background: var(--bccr-nav-active-bg, var(--bccr-accent-soft));
  font-weight: 600;
}

.main-col {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  padding: 0.85rem 1.35rem;
  border-bottom: 1px solid var(--bccr-border);
  background: var(--bccr-topbar-bg);
  backdrop-filter: blur(10px);
}

.page-title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 650;
}

.top-right {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.user-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  max-width: 14rem;
  text-decoration: none;
  color: inherit;
  border-radius: 999px;
  padding: 0.15rem 0.6rem 0.15rem 0.15rem;
  margin-right: 0.1rem;
  transition: background 0.15s;
}

.user-chip:hover {
  background: var(--bccr-hover);
}

.avatar-wrap {
  flex-shrink: 0;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 50%;
  overflow: hidden;
  border: 1px solid var(--bccr-border);
  background: var(--bccr-surface-muted);
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-letter {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--bccr-accent);
  line-height: 1;
}

.who {
  font-size: 0.88rem;
  color: var(--bccr-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pill {
  font-size: 0.72rem;
  padding: 0.15rem 0.45rem;
  border-radius: 999px;
  background: var(--bccr-pill-bg);
  border: 1px solid var(--bccr-accent-border);
  color: var(--bccr-pill-text);
}

.btn-out {
  margin-left: 0.25rem;
  padding: 0.4rem 0.75rem;
  border-radius: 0.4rem;
  border: 1px solid var(--bccr-border);
  background: transparent;
  color: var(--bccr-accent);
  font-size: 0.85rem;
  cursor: pointer;
}

.btn-out:hover {
  background: var(--bccr-accent-soft);
}

.warn {
  margin: 0;
  font-size: 0.85rem;
  color: var(--bccr-danger);
}

.content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 1.1rem 1.15rem 2rem;
  overflow-x: hidden;
  overflow-y: auto;
  /* 与全局 body 一致：内部滚动到底时不再透出浅色底 */
  background: var(--bccr-page-bg);
  background-color: var(--bccr-bg-1);
}
</style>
