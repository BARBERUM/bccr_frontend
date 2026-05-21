<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { navItemsForUser } from '@/config/nav'
import { formatRoleLabels } from '@/lib/roles'
import DashboardNavIcon from '@/components/icons/DashboardNavIcon.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const meError = ref('')
const tipForbidden = ref(false)

const nav = computed(() => navItemsForUser(auth.user))
const roleLabels = computed(() => formatRoleLabels(auth.user))
const displayName = computed(() => {
  const u = /** @type {Record<string, any>} */ (auth.user || {})
  return u.username ?? u.loginName ?? u.account ?? u.nickname ?? '用户'
})

const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 6) return '夜深了'
  if (h < 12) return '上午好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
})

/** @type {Record<string, string>} */
const ENTRY_DESC = {
  概览: '工作台总览与快捷导航',
  个人信息: '头像、昵称与联系方式',
  作品广场: '浏览全站已登记作品',
  我的作品: '管理本人链上作品',
  登记作品: '指纹提取与链上存证',
  查重: '手动比对相似度',
  授权: '授权他人使用作品',
  审核: '待审队列与举报处理',
  用户管理: '账号、角色与启停',
  区块链: '节点状态与合约信息',
}

function descFor(label) {
  return ENTRY_DESC[label] ?? '进入该功能模块'
}

const ACCENTS = [
  'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
  'linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%)',
  'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
  'linear-gradient(135deg, #10b981 0%, #14b8a6 100%)',
  'linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)',
  'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
]

function accentAt(i) {
  return ACCENTS[i % ACCENTS.length]
}

onMounted(async () => {
  meError.value = ''
  if (!auth.user && auth.isLoggedIn) {
    const u = await auth.hydrateUser()
    if (!u) meError.value = '无法获取当前用户信息，请重新登录'
  }
  syncTip()
})

watch(
  () => route.query.tip,
  () => syncTip(),
)

function syncTip() {
  if (route.query.tip === 'forbidden') {
    tipForbidden.value = true
    const q = { ...route.query }
    delete q.tip
    router.replace({ query: q })
  }
}

function clearForbiddenTip() {
  tipForbidden.value = false
}
</script>

<template>
  <div class="dash">
    <Transition name="fade">
      <p v-if="tipForbidden" class="banner">
        <span class="banner-icon" aria-hidden="true">!</span>
        <span>您没有权限访问该页面，已跳转到概览。</span>
        <button type="button" class="dismiss" @click="clearForbiddenTip">知道了</button>
      </p>
    </Transition>

    <p v-if="meError" class="err">{{ meError }}</p>

    <template v-else>
      <section class="hero">
        <div class="hero-glow" aria-hidden="true" />
        <div class="hero-grid-bg" aria-hidden="true" />
        <div class="hero-content">
          <p class="greeting">{{ greeting }}</p>
          <h1 class="hero-title">
            <span class="name">{{ displayName }}</span>
          </h1>
          <p class="hero-lead">
            AIGC 作品指纹版权保护系统 · 指纹存证、相似查重与授权溯源一站式工作台
          </p>
          <div v-if="roleLabels.length" class="roles">
            <span v-for="r in roleLabels" :key="r" class="role-pill">{{ r }}</span>
          </div>
          <p v-else class="hero-muted">
            当前账号未解析到角色码；导航已按宽松策略展示，请确认后端 <code>/me</code> 返回角色字段。
          </p>
        </div>
      </section>

      <div class="section-head">
        <h2 class="section-title">快捷入口</h2>
        <p class="section-sub">根据权限展示 · 点击卡片跳转对应模块</p>
      </div>

      <div class="tiles">
        <RouterLink
          v-for="(item, i) in nav"
          :key="item.to"
          :to="item.to"
          class="tile"
          :style="{ '--tile-accent': accentAt(i) }"
        >
          <div class="tile-icon" aria-hidden="true">
            <DashboardNavIcon :label="item.label" />
          </div>
          <div class="tile-text">
            <span class="tile-title">{{ item.label }}</span>
            <span class="tile-desc">{{ descFor(item.label) }}</span>
          </div>
          <span class="tile-arrow" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </span>
        </RouterLink>
      </div>

      <footer class="dash-foot">
        <span class="dot" />
        链上存证不可篡改 · Token 有效期请参考服务端策略
      </footer>
    </template>
  </div>
</template>

<style scoped>
.dash {
  max-width: 1040px;
  margin: 0 auto;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.65rem;
  margin: 0 0 1.5rem;
  padding: 0.75rem 1rem 0.75rem 0.85rem;
  border-radius: 0.65rem;
  background: linear-gradient(135deg, rgba(248, 113, 113, 0.14), rgba(251, 146, 60, 0.08));
  border: 1px solid rgba(248, 113, 113, 0.38);
  color: var(--bccr-danger);
  font-size: 0.9rem;
}

.banner-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.65rem;
  height: 1.65rem;
  border-radius: 0.4rem;
  background: rgba(248, 113, 113, 0.35);
  font-weight: 800;
  font-size: 0.95rem;
}

.dismiss {
  margin-left: auto;
  border: none;
  border-radius: 0.4rem;
  padding: 0.35rem 0.75rem;
  font-size: 0.8rem;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  transition: background 0.15s;
}

.dismiss:hover {
  background: rgba(255, 255, 255, 0.22);
}

.err {
  color: var(--bccr-danger);
  font-size: 0.9rem;
}

.hero {
  position: relative;
  margin-bottom: 2rem;
  padding: 1.75rem 1.5rem 1.65rem;
  border-radius: 1rem;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: var(--bccr-panel-bg);
  overflow: hidden;
  box-shadow: 0 24px 60px var(--bccr-shadow-md);
}

.hero-glow {
  position: absolute;
  inset: -40% -20% auto auto;
  width: min(420px, 70vw);
  height: min(420px, 70vw);
  border-radius: 50%;
  background: radial-gradient(circle at center, rgba(59, 130, 246, 0.35), transparent 62%);
  pointer-events: none;
}

.hero-grid-bg {
  position: absolute;
  inset: 0;
  opacity: 0.06;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.08) 1px, transparent 1px);
  background-size: 24px 24px;
  pointer-events: none;
}

.hero-content {
  position: relative;
  z-index: 1;
}

.greeting {
  margin: 0 0 0.35rem;
  font-size: 0.85rem;
  font-weight: 500;
  letter-spacing: 0.02em;
  color: var(--bccr-muted);
}

.hero-title {
  margin: 0 0 0.5rem;
  font-size: clamp(1.45rem, 3.5vw, 1.85rem);
  font-weight: 750;
  line-height: 1.25;
  letter-spacing: -0.02em;
}

.name {
  background: linear-gradient(120deg, #e8eef7 0%, #93c5fd 45%, #c4b5fd 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.hero-lead {
  margin: 0 0 1rem;
  max-width: 38rem;
  font-size: 0.92rem;
  line-height: 1.65;
  color: var(--bccr-muted);
}

.roles {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.role-pill {
  font-size: 0.78rem;
  padding: 0.28rem 0.65rem;
  border-radius: 999px;
  background: var(--bccr-accent-soft);
  border: 1px solid var(--bccr-accent-border);
  color: var(--bccr-pill-text);
  font-weight: 500;
}

.hero-muted {
  margin: 0;
  font-size: 0.85rem;
  color: var(--bccr-muted);
  line-height: 1.55;
  max-width: 40rem;
}

.hero-muted code {
  font-size: 0.8rem;
  padding: 0.1rem 0.35rem;
  border-radius: 0.25rem;
  background: var(--bccr-hover);
  color: var(--bccr-muted);
}

.section-head {
  margin-bottom: 1rem;
}

.section-title {
  margin: 0 0 0.25rem;
  font-size: 1.05rem;
  font-weight: 650;
  letter-spacing: -0.01em;
}

.section-sub {
  margin: 0;
  font-size: 0.82rem;
  color: var(--bccr-muted);
}

.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 1rem;
}

.tile {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 0.9rem;
  padding: 1.05rem 1rem 1.05rem 1.05rem;
  border-radius: 0.85rem;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: var(--bccr-card);
  color: var(--bccr-text);
  text-decoration: none;
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    background 0.18s ease;
  overflow: hidden;
}

.tile::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--tile-accent);
  opacity: 0.85;
  border-radius: 0.85rem 0 0 0.85rem;
}

.tile:hover {
  transform: translateY(-3px);
  border-color: rgba(59, 130, 246, 0.35);
  background: var(--bccr-surface-muted);
  box-shadow: 0 16px 40px var(--bccr-shadow-md);
}

.tile:active {
  transform: translateY(-1px);
}

.tile-icon {
  flex-shrink: 0;
  width: 2.65rem;
  height: 2.65rem;
  border-radius: 0.65rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--tile-accent);
  color: #fff;
  box-shadow: 0 8px 20px rgba(59, 130, 246, 0.22);
}

.tile-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.tile-title {
  font-weight: 650;
  font-size: 0.98rem;
}

.tile-desc {
  font-size: 0.78rem;
  line-height: 1.45;
  color: var(--bccr-muted);
}

.tile-arrow {
  flex-shrink: 0;
  align-self: center;
  width: 1.35rem;
  height: 1.35rem;
  color: var(--bccr-placeholder);
  transition: color 0.15s, transform 0.18s ease;
}

.tile:hover .tile-arrow {
  color: var(--bccr-accent);
  transform: translateX(3px);
}

.tile-arrow svg {
  width: 100%;
  height: 100%;
}

.dash-foot {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 2rem;
  padding-top: 1.25rem;
  border-top: 1px solid rgba(148, 163, 184, 0.12);
  font-size: 0.78rem;
  color: var(--bccr-muted);
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(59, 130, 246, 0.55);
  box-shadow: 0 0 10px rgba(59, 130, 246, 0.45);
}

@media (max-width: 520px) {
  .hero {
    padding: 1.35rem 1.15rem;
  }

  .tiles {
    grid-template-columns: 1fr;
  }
}
</style>
