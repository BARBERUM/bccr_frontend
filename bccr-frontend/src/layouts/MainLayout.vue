<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { navItemsForUser } from '@/config/nav'
import { formatRoleLabels } from '@/lib/roles'
import * as userApi from '@/api/user'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

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

      <main class="content">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: 240px 1fr;
  min-height: 100%;
}

.aside {
  position: relative;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--bccr-border);
  background: rgba(15, 23, 42, 0.85);
  backdrop-filter: blur(12px);
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
  background: rgba(148, 163, 184, 0.1);
}

.nav-item.active {
  color: #fff;
  background: rgba(59, 130, 246, 0.28);
  font-weight: 600;
}

.main-col {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 100%;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  padding: 0.85rem 1.35rem;
  border-bottom: 1px solid var(--bccr-border);
  background: rgba(15, 23, 42, 0.55);
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
  background: rgba(148, 163, 184, 0.12);
}

.avatar-wrap {
  flex-shrink: 0;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 50%;
  overflow: hidden;
  border: 1px solid var(--bccr-border);
  background: rgba(30, 41, 59, 0.95);
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
  color: #bfdbfe;
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
  background: rgba(59, 130, 246, 0.18);
  border: 1px solid rgba(59, 130, 246, 0.35);
  color: #bfdbfe;
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
  background: rgba(59, 130, 246, 0.12);
}

.warn {
  margin: 0;
  font-size: 0.85rem;
  color: var(--bccr-danger);
}

.content {
  flex: 1;
  padding: 1.35rem 1.35rem 2rem;
  overflow-x: auto;
}

@media (max-width: 860px) {
  .layout {
    grid-template-columns: 1fr;
  }

  .aside {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    border-right: none;
    border-bottom: 1px solid var(--bccr-border);
  }

  .brand {
    border-bottom: none;
    flex: 1;
    min-width: 0;
  }

  .nav {
    flex-direction: row;
    flex-wrap: wrap;
    flex: 1 1 100%;
    padding: 0 0.6rem 0.65rem;
  }
}
</style>
