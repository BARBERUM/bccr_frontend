<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import * as chainApi from '@/api/blockchain'
import { fetchAdminWorkOverview, fetchWorkList, normalizeListPage } from '@/api/work'
import DistPieChart from '@/components/charts/DistPieChart.vue'
import {
  extractContractHighlights,
  extractNodeGroups,
  extractNodeHighlights,
  extractNodeQuickStats,
  humanizeWorkStatusKey,
  humanizeWorkTypeKey,
  isCopyableValue,
  pickBool,
  pickStr,
  shortHex,
} from '@/lib/blockchainDisplay'

const loading = ref(true)
const toast = ref('')
let toastTimer = /** @type {ReturnType<typeof setTimeout> | null} */ (null)

/** @type {import('vue').Ref<Awaited<ReturnType<typeof chainApi.fetchBlockchainStatusSafe>>>} */
const statusPack = ref({ ok: false, message: '尚未加载' })
/** @type {import('vue').Ref<Awaited<ReturnType<typeof chainApi.fetchContractInfoSafe>>>} */
const contractPack = ref({ ok: false, message: '尚未加载' })

/** @type {import('vue').Ref<Record<string, unknown> | null>} */
const workOverview = ref(null)
const workOverviewErr = ref('')
const workListTotal = ref(0)
const workListTotalOk = ref(false)

/** @type {import('vue').Ref<'works' | 'node' | 'contract'>} */
const activeTab = ref('works')

const TABS = [
  {
    id: /** @type {'works'} */ ('works'),
    name: '作品总览',
    note: '登记总量、上链数量及类型/状态分布',
    tone: 'emerald',
  },
  {
    id: /** @type {'node'} */ ('node'),
    name: '节点状态',
    note: '是否连通及链上同步相关信息',
    tone: 'cyan',
  },
  {
    id: /** @type {'contract'} */ ('contract'),
    name: '合约信息',
    note: '合约是否可用及部署地址等',
    tone: 'violet',
  },
]

const nodeConnected = computed(() => {
  if (!statusPack.value.ok) return false
  const d = /** @type {Record<string, unknown>} */ (statusPack.value.data)
  return pickBool(d, ['connected', 'isConnected'], false)
})

const contractAvailable = computed(() => {
  if (!contractPack.value.ok) return false
  const d = /** @type {Record<string, unknown>} */ (contractPack.value.data)
  return pickBool(d, ['available', 'isAvailable'], false)
})

const nodeHighlights = computed(() => {
  if (!statusPack.value.ok) return []
  return extractNodeHighlights(
    /** @type {Record<string, unknown>} */ (statusPack.value.data),
  )
})

const nodeQuickStats = computed(() => {
  if (!statusPack.value.ok) return []
  return extractNodeQuickStats(
    /** @type {Record<string, unknown>} */ (statusPack.value.data),
  )
})

const nodeGroups = computed(() => {
  if (!statusPack.value.ok) return []
  const groups = extractNodeGroups(
    /** @type {Record<string, unknown>} */ (statusPack.value.data),
  )
  if (!nodeRpcUrl.value) return groups
  return groups
    .map((g) => ({
      ...g,
      items: g.items.filter((it) => it.key !== 'rpc'),
    }))
    .filter((g) => g.items.length > 0)
})

const nodeRpcUrl = computed(() => {
  if (!statusPack.value.ok) return ''
  return pickStr(
    /** @type {Record<string, unknown>} */ (statusPack.value.data),
    ['nodeUrl', 'rpcUrl', 'channelUrl'],
  )
})

const contractHighlights = computed(() => {
  if (!contractPack.value.ok) return []
  return extractContractHighlights(
    /** @type {Record<string, unknown>} */ (contractPack.value.data),
  )
})

const nodeErrorMessage = computed(() => {
  if (!statusPack.value.ok) return statusPack.value.message
  if (nodeConnected.value) return ''
  return pickStr(
    /** @type {Record<string, unknown>} */ (statusPack.value.data),
    ['errorMessage', 'error', 'message'],
  )
})

const contractErrorMessage = computed(() => {
  if (!contractPack.value.ok) return contractPack.value.message
  if (contractAvailable.value) return ''
  return pickStr(
    /** @type {Record<string, unknown>} */ (contractPack.value.data),
    ['errorMessage', 'error', 'message'],
  )
})

const contractAddress = computed(() => {
  if (!contractPack.value.ok) return ''
  const d = /** @type {Record<string, unknown>} */ (contractPack.value.data)
  return pickStr(d, [
    'contractAddress',
    'address',
    'proxyAddress',
    'implementationAddress',
  ])
})

const statusPillText = computed(() => {
  if (!statusPack.value.ok) return '无数据'
  return nodeConnected.value ? '正常' : '异常'
})

const contractPillText = computed(() => {
  if (!contractPack.value.ok) return '无数据'
  return contractAvailable.value ? '正常' : '不可用'
})

const totalWorksDisplay = computed(() => {
  const ov = workOverview.value
  if (ov && typeof ov === 'object') {
    const t = ov.totalWorks ?? ov.total ?? ov.count
    if (t != null && Number.isFinite(Number(t))) return Number(t)
  }
  if (workListTotalOk.value) return workListTotal.value
  return null
})

const onChainWorksDisplay = computed(() => {
  const ov = workOverview.value
  if (!ov || typeof ov !== 'object') return null
  const t = ov.onChainCount ?? ov.chainWorks ?? ov.onchainTotal
  if (t != null && Number.isFinite(Number(t))) return Number(t)
  return null
})

const pendingAuditDisplay = computed(() => {
  const ov = workOverview.value
  if (!ov || typeof ov !== 'object') return null
  const t = ov.pendingAuditCount ?? ov.pendingAudit ?? ov.auditPending
  if (t != null && Number.isFinite(Number(t))) return Number(t)
  return null
})

const byStatusEntries = computed(() => {
  const ov = workOverview.value
  if (!ov || typeof ov !== 'object') return []
  const bs = ov.byStatus ?? ov.statusCounts
  if (!bs || typeof bs !== 'object') return []
  return Object.entries(/** @type {Record<string, unknown>} */ (bs)).filter(
    ([, v]) => v != null && String(v) !== '',
  )
})

const byTypeEntries = computed(() => {
  const ov = workOverview.value
  if (!ov || typeof ov !== 'object') return []
  const bt = ov.byType ?? ov.typeCounts ?? ov.workTypeCounts
  if (!bt || typeof bt !== 'object') return []
  return Object.entries(/** @type {Record<string, unknown>} */ (bt)).filter(
    ([, v]) => v != null && String(v) !== '',
  )
})

/** @param {[string, unknown][]} entries */
function distWithPercent(entries) {
  const nums = entries.map(([, v]) => Number(v)).filter((n) => Number.isFinite(n))
  const max = nums.length ? Math.max(...nums) : 1
  return entries.map(([k, v]) => {
    const n = Number(v)
    const count = Number.isFinite(n) ? n : 0
    return {
      key: k,
      count,
      pct: max > 0 ? Math.round((count / max) * 100) : 0,
    }
  })
}

const statusDist = computed(() =>
  distWithPercent(byStatusEntries.value).map((row) => ({
    ...row,
    label: humanizeWorkStatusKey(row.key),
  })),
)

const typeDist = computed(() =>
  distWithPercent(byTypeEntries.value).map((row) => ({
    ...row,
    label: humanizeWorkTypeKey(row.key),
  })),
)

const onChainRate = computed(() => {
  const total = totalWorksDisplay.value
  const onChain = onChainWorksDisplay.value
  if (total == null || onChain == null || total <= 0) return null
  return Math.round((onChain / total) * 100)
})

const chainPieSlices = computed(() => {
  const total = totalWorksDisplay.value
  const onChain = onChainWorksDisplay.value
  if (total == null || onChain == null || total <= 0) return []
  const offChain = Math.max(0, total - onChain)
  /** @type {{ key: string, label: string, count: number, color: string }[]} */
  const slices = [
    { key: 'on-chain', label: '已上链', count: onChain, color: '#34d399' },
  ]
  if (offChain > 0) {
    slices.push({ key: 'off-chain', label: '未上链', count: offChain, color: '#475569' })
  }
  return slices
})

const hasPieCharts = computed(
  () => chainPieSlices.value.length > 0 || statusDist.value.length > 0 || typeDist.value.length > 0,
)

/** @param {'works' | 'node' | 'contract'} id */
function selectTab(id) {
  activeTab.value = id
}

const overviewBodyOk = computed(
  () => workOverview.value != null && typeof workOverview.value === 'object',
)

const totalDataSourceHint = computed(() => {
  if (overviewBodyOk.value) {
    const ov = /** @type {Record<string, unknown>} */ (workOverview.value)
    if (['totalWorks', 'total', 'count'].some((k) => ov[k] != null)) {
      return '来自作品总览'
    }
  }
  if (workListTotalOk.value) return '来自作品列表统计'
  return ''
})

/** @param {Record<string, unknown> | null} ov */
function overviewHasTotal(ov) {
  if (!ov) return false
  const t = ov.totalWorks ?? ov.total ?? ov.count
  return t != null && Number.isFinite(Number(t))
}

async function loadDashboard() {
  loading.value = true
  workOverviewErr.value = ''
  workListTotalOk.value = false
  workListTotal.value = 0

  const [st, ct, ovResult] = await Promise.all([
    chainApi.fetchBlockchainStatusSafe(),
    chainApi.fetchContractInfoSafe(),
    fetchAdminWorkOverview()
      .then((data) => ({ ok: true, data }))
      .catch((e) => ({ ok: false, error: e })),
  ])
  statusPack.value = st
  contractPack.value = ct

  if (ovResult.ok && ovResult.data && typeof ovResult.data === 'object') {
    workOverview.value = /** @type {Record<string, unknown>} */ (ovResult.data)
    workOverviewErr.value = ''
  } else {
    workOverview.value = null
    if (ovResult.ok) {
      workOverviewErr.value = '作品总览接口返回为空或非 JSON 对象'
    } else {
      const err = 'error' in ovResult ? ovResult.error : null
      workOverviewErr.value =
        err instanceof Error
          ? err.message
          : '作品总览暂时不可用，已尝试用作品列表数量估算规模。'
    }
  }

  if (!overviewHasTotal(workOverview.value)) {
    try {
      const pageData = await fetchWorkList({ page: 1, size: 1 })
      const p = normalizeListPage(pageData)
      workListTotal.value = p.total
      workListTotalOk.value = true
    } catch {
      workListTotal.value = 0
      workListTotalOk.value = false
    }
  }

  loading.value = false
}

function showToast(msg) {
  toast.value = String(msg)
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.value = ''
    toastTimer = null
  }, 2400)
}

async function copyText(label, text) {
  const s = String(text ?? '').trim()
  if (!s) return
  try {
    await navigator.clipboard.writeText(s)
    showToast(`${label} 已复制到剪贴板`)
  } catch {
    showToast('复制失败，请手动选择文本')
  }
}

onMounted(loadDashboard)

onBeforeUnmount(() => {
  if (toastTimer) clearTimeout(toastTimer)
})
</script>

<template>
  <div class="bc-shell">
    <Transition name="toast-fade">
      <div v-if="toast" class="toast" role="status">{{ toast }}</div>
    </Transition>

    <div class="bc-page">
      <div class="load-bar" :class="{ active: loading }" aria-hidden="true" />

      <header class="hero">
        <div class="hero-grid" aria-hidden="true" />
        <div class="hero-orbit" aria-hidden="true" />
        <div class="hero-inner">
          <p class="eyebrow">管理员 · 只读巡检</p>
          <h1 class="title">区块链控制台</h1>
          <p class="lead">
            通过下方三个分区切换查看<strong>作品登记概况</strong>、<strong>节点连通与同步</strong>、<strong>智能合约部署</strong>。数据为只读巡检，可随时刷新。
          </p>

          <div class="tab-rail-wrap">
            <div class="tab-rail" role="tablist" aria-label="控制台分区">
              <button
                v-for="tab in TABS"
                :key="tab.id"
                type="button"
                role="tab"
                class="tab-btn"
                :class="[`tab-btn-${tab.tone}`, { active: activeTab === tab.id }]"
                :aria-selected="activeTab === tab.id"
                @click="selectTab(tab.id)"
              >
                <span class="tab-btn-head">
                  <span class="tab-indicator" aria-hidden="true" />
                  <span class="tab-name">{{ tab.name }}</span>
                  <span
                    v-if="tab.id === 'node'"
                    class="tab-live"
                    :class="{
                      ok: statusPack.ok && nodeConnected,
                      bad: statusPack.ok && !nodeConnected,
                    }"
                    aria-hidden="true"
                  />
                  <span
                    v-else-if="tab.id === 'contract'"
                    class="tab-live violet"
                    :class="{
                      ok: contractPack.ok && contractAvailable,
                      bad: contractPack.ok && !contractAvailable,
                    }"
                    aria-hidden="true"
                  />
                </span>
                <span class="tab-note">{{ tab.note }}</span>
              </button>
            </div>
          </div>

          <div class="hero-actions">
            <button type="button" class="btn-refresh" :disabled="loading" @click="loadDashboard">
              <span class="btn-refresh-ic" :class="{ spin: loading }" aria-hidden="true">⟳</span>
              {{ loading ? '同步中…' : '一键刷新三项数据' }}
            </button>
            <RouterLink :to="{ name: 'works-square' }" class="btn-link">作品广场</RouterLink>
          </div>
        </div>
      </header>

      <section class="panel-shell" aria-live="polite">
        <Transition name="panel-fade" mode="out-in">
          <div v-if="activeTab === 'works'" key="works" class="panel panel-works" role="tabpanel">
            <header class="panel-head">
              <div>
                <h2 class="panel-title">作品总览</h2>
                <p class="panel-sub">登记规模、上链进度与类型/状态分布</p>
              </div>
              <RouterLink :to="{ name: 'works-square' }" class="panel-link">前往作品广场 →</RouterLink>
            </header>

            <div class="ov-board">
              <div class="ov-metrics">
                <article class="ov-metric ov-metric-main">
                  <span class="ov-metric-label">登记作品总数</span>
                  <strong class="ov-metric-val">{{ totalWorksDisplay != null ? totalWorksDisplay : '—' }}</strong>
                  <span v-if="totalDataSourceHint" class="ov-metric-meta">{{ totalDataSourceHint }}</span>
                </article>
                <article class="ov-metric">
                  <span class="ov-metric-label">链上作品数量</span>
                  <strong class="ov-metric-val accent">{{ onChainWorksDisplay != null ? onChainWorksDisplay : '—' }}</strong>
                  <span v-if="onChainRate != null" class="ov-metric-meta">上链率约 {{ onChainRate }}%</span>
                  <span v-else class="ov-metric-meta">来自总览数据</span>
                </article>
                <article class="ov-metric">
                  <span class="ov-metric-label">待审核</span>
                  <strong class="ov-metric-val warn">{{ pendingAuditDisplay != null ? pendingAuditDisplay : '—' }}</strong>
                  <span class="ov-metric-meta">审核队列规模</span>
                </article>
              </div>

              <div v-if="onChainRate != null" class="rate-bar-wrap">
                <div class="rate-bar-head">
                  <span>上链进度</span>
                  <strong>{{ onChainRate }}%</strong>
                </div>
                <div class="rate-bar-track" aria-hidden="true">
                  <span class="rate-bar-fill" :style="{ width: `${onChainRate}%` }" />
                </div>
              </div>

              <p v-if="workOverviewErr" class="banner-soft">{{ workOverviewErr }}</p>

              <div v-if="hasPieCharts" class="pie-grid">
                <DistPieChart
                  v-if="chainPieSlices.length"
                  title="上链情况"
                  :slices="chainPieSlices"
                  tone="emerald"
                />
                <DistPieChart
                  v-if="statusDist.length"
                  title="审核 / 状态分布"
                  :slices="statusDist"
                  tone="emerald"
                />
                <DistPieChart
                  v-if="typeDist.length"
                  title="作品类型分布"
                  :slices="typeDist"
                  tone="cyan"
                />
              </div>

              <p
                v-if="overviewBodyOk && !hasPieCharts"
                class="muted soft-tip"
              >
                总览已加载；若暂无状态或类型分布，上方核心指标仍可参考。
              </p>
              <p v-else-if="!overviewBodyOk && !workOverviewErr" class="muted soft-tip">
                正在加载作品统计数据…
              </p>
            </div>
          </div>

          <div v-else-if="activeTab === 'node'" key="node" class="panel panel-node" role="tabpanel">
            <header class="panel-head">
              <div>
                <h2 class="panel-title">节点状态</h2>
                <p class="panel-sub">区块链节点连通性与链上同步信息</p>
              </div>
              <span class="pill" :class="statusPack.ok && nodeConnected ? 'pill-ok' : 'pill-bad'">{{ statusPillText }}</span>
            </header>

            <article
              class="status-hero"
              :class="{
                ok: statusPack.ok && nodeConnected,
                bad: statusPack.ok && !nodeConnected,
                idle: !statusPack.ok,
              }"
            >
              <div class="status-hero-glyph" aria-hidden="true">
                <span class="glyph-ring lg" />
                <span class="stat-dot lg" :class="{ pulse: nodeConnected && statusPack.ok }" />
              </div>
              <div class="status-hero-body">
                <span class="status-hero-k">连接状态</span>
                <strong class="status-hero-v">
                  {{ statusPack.ok ? (nodeConnected ? '节点已连接' : '节点未连接') : '状态未知' }}
                </strong>
                <p class="status-hero-hint">
                  {{
                    statusPack.ok
                      ? nodeConnected
                        ? 'RPC 可达，可继续查看区块高度与同步情况。'
                        : '无法与链节点建立连接，请检查 RPC 配置或网络。'
                      : '尚未获取节点状态，可点击上方刷新。'
                  }}
                </p>
              </div>
            </article>

            <aside v-if="nodeErrorMessage" class="callout callout-warn">
              <span class="callout-tag">诊断</span>
              <p class="callout-txt">{{ nodeErrorMessage }}</p>
            </aside>

            <section v-if="nodeQuickStats.length" class="node-quick-strip" aria-label="节点关键指标">
              <article v-for="item in nodeQuickStats" :key="item.key" class="node-quick-tile">
                <span class="node-quick-icon" aria-hidden="true">{{ item.icon }}</span>
                <div class="node-quick-body">
                  <span class="node-quick-k">{{ item.label }}</span>
                  <strong class="node-quick-v mono" :title="item.rawValue ?? item.value">{{ item.value }}</strong>
                </div>
              </article>
            </section>

            <div v-if="nodeRpcUrl && statusPack.ok && nodeConnected" class="node-rpc-panel">
              <div class="node-rpc-head">
                <span class="node-rpc-title">节点接入地址</span>
                <button type="button" class="btn-mini cyan" @click="copyText('节点地址', nodeRpcUrl)">复制</button>
              </div>
              <p class="node-rpc-val mono">{{ nodeRpcUrl }}</p>
            </div>

            <div v-if="nodeGroups.length" class="node-group-list">
              <section v-for="group in nodeGroups" :key="group.id" class="node-group">
                <header class="node-group-head">
                  <h3 class="node-group-title">{{ group.title }}</h3>
                  <p class="node-group-desc">{{ group.desc }}</p>
                </header>
                <div class="metric-grid node-metric-grid">
                  <article v-for="item in group.items" :key="`${group.id}-${item.key}`" class="metric-card node-metric">
                    <span class="metric-icon" aria-hidden="true">{{ item.icon }}</span>
                    <div class="metric-body">
                      <span class="metric-label">{{ item.label }}</span>
                      <div class="metric-value-row">
                        <code class="metric-value mono" :title="item.rawValue ?? item.value">{{ item.value }}</code>
                        <button
                          v-if="isCopyableValue(item.rawValue ?? item.value)"
                          type="button"
                          class="btn-copy-inline"
                          @click="copyText(item.label, item.rawValue ?? item.value)"
                        >
                          复制
                        </button>
                      </div>
                    </div>
                  </article>
                </div>
              </section>
            </div>

            <div v-else-if="nodeHighlights.length" class="metric-grid">
              <article v-for="item in nodeHighlights" :key="item.key" class="metric-card">
                <span class="metric-icon" aria-hidden="true">{{ item.icon }}</span>
                <div class="metric-body">
                  <span class="metric-label">{{ item.label }}</span>
                  <code class="metric-value mono" :title="item.rawValue ?? item.value">{{ item.value }}</code>
                </div>
              </article>
            </div>
            <p v-else-if="statusPack.ok && nodeConnected" class="muted box-muted">
              节点已连接，但暂未返回块高、链 ID 等扩展字段。
            </p>
            <p v-else-if="!statusPack.ok" class="card-err">{{ statusPack.message }}</p>
          </div>

          <div v-else key="contract" class="panel panel-contract" role="tabpanel">
            <header class="panel-head">
              <div>
                <h2 class="panel-title">合约信息</h2>
                <p class="panel-sub">智能合约可用性与链上部署详情</p>
              </div>
              <span class="pill" :class="contractPack.ok && contractAvailable ? 'pill-ok' : 'pill-bad'">{{ contractPillText }}</span>
            </header>

            <article
              class="status-hero violet"
              :class="{
                ok: contractPack.ok && contractAvailable,
                bad: contractPack.ok && !contractAvailable,
                idle: !contractPack.ok,
              }"
            >
              <div class="status-hero-glyph violet" aria-hidden="true">
                <span class="glyph-ring lg" />
                <span class="stat-dot lg" />
              </div>
              <div class="status-hero-body">
                <span class="status-hero-k">合约状态</span>
                <strong class="status-hero-v">
                  {{ contractPack.ok ? (contractAvailable ? '合约可用' : '合约不可用') : '状态未知' }}
                </strong>
                <p class="status-hero-hint">
                  {{
                    contractPack.ok
                      ? contractAvailable
                        ? '链上合约已就绪，可进行作品确权相关操作。'
                        : '合约未部署或调用失败，请检查部署配置。'
                      : '尚未获取合约信息，可点击上方刷新。'
                  }}
                </p>
              </div>
            </article>

            <aside v-if="contractErrorMessage" class="callout callout-warn">
              <span class="callout-tag">诊断</span>
              <p class="callout-txt">{{ contractErrorMessage }}</p>
            </aside>

            <div v-if="contractAddress" class="addr-panel">
              <div class="addr-head">
                <span class="addr-title">链上合约地址</span>
                <button type="button" class="btn-mini" @click="copyText('合约地址', contractAddress)">复制地址</button>
              </div>
              <p class="addr-full mono">{{ contractAddress }}</p>
              <p class="addr-hint mono">缩略显示：{{ shortHex(contractAddress, 10, 8) }}</p>
            </div>

            <div v-if="contractHighlights.length" class="metric-grid contract-grid">
              <article v-for="item in contractHighlights" :key="item.key" class="metric-card contract-metric">
                <div class="metric-body">
                  <span class="metric-label">{{ item.label }}</span>
                  <div class="metric-value-row">
                    <code class="metric-value mono" :title="item.rawValue ?? item.value">{{ item.value }}</code>
                    <button
                      v-if="item.copyable"
                      type="button"
                      class="btn-copy-inline"
                      @click="copyText(item.label, item.rawValue ?? item.value)"
                    >
                      复制
                    </button>
                  </div>
                </div>
              </article>
            </div>
            <p v-else-if="contractPack.ok && contractAvailable && !contractAddress" class="muted box-muted">
              合约可用，但未返回地址或其他元数据。
            </p>
            <p v-else-if="!contractPack.ok" class="card-err">{{ contractPack.message }}</p>
          </div>
        </Transition>
      </section>
    </div>
  </div>
</template>

<style scoped>
.toast-fade-enter-active,
.toast-fade-leave-active {
  transition:
    opacity 0.28s ease,
    transform 0.28s ease;
}
.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, 6px);
}

.toast {
  position: fixed;
  bottom: 1.65rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 900;
  padding: 0.55rem 1.25rem;
  border-radius: 999px;
  font-size: 0.84rem;
  font-weight: 600;
  color: var(--bccr-text);
  background: var(--bccr-nav-bg);
  border: 1px solid rgba(52, 211, 153, 0.35);
  box-shadow: 0 12px 40px var(--bccr-shadow-md);
}

.bc-shell {
  width: 100%;
  display: flex;
  justify-content: center;
  padding: 0.65rem 0 2.75rem;
  box-sizing: border-box;
  min-height: min(86vh, calc(100dvh - 7.5rem));
}

.bc-page {
  width: 100%;
  max-width: 920px;
  position: relative;
}

.load-bar {
  position: absolute;
  top: 0;
  left: 0;
  height: 2px;
  width: 0;
  border-radius: 2px;
  background: linear-gradient(90deg, #22d3ee, #818cf8);
  z-index: 2;
}

.load-bar.active {
  width: 100%;
  animation: load-scan 1.1s ease-in-out infinite;
}

@keyframes load-scan {
  0% {
    opacity: 0.35;
    width: 22%;
    margin-left: 0;
  }
  50% {
    opacity: 1;
    width: 72%;
    margin-left: 14%;
  }
  100% {
    opacity: 0.35;
    width: 22%;
    margin-left: 78%;
  }
}

.hero {
  position: relative;
  margin-bottom: 1.6rem;
  padding: 0.75rem 0 0;
  overflow: hidden;
  border-radius: 1.15rem;
  border: 1px solid rgba(56, 189, 248, 0.12);
  background: var(--bccr-surface-muted);
}

.hero-inner {
  position: relative;
  z-index: 1;
  padding: 1.05rem 1.25rem 1.35rem;
}

.hero-grid {
  position: absolute;
  inset: 0;
  opacity: 0.06;
  background-image:
    linear-gradient(rgba(56, 189, 248, 0.9) 1px, transparent 1px),
    linear-gradient(90deg, rgba(167, 139, 250, 0.85) 1px, transparent 1px);
  background-size: 24px 24px;
  pointer-events: none;
}

.hero-orbit {
  position: absolute;
  width: min(340px, 90vw);
  height: 340px;
  right: -120px;
  top: -160px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgba(34, 211, 238, 0.2) 0%,
    rgba(129, 140, 248, 0.1) 45%,
    transparent 72%
  );
  pointer-events: none;
}

.eyebrow {
  margin: 0 0 0.35rem;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--bccr-accent-text);
}

.title {
  margin: 0 0 0.42rem;
  font-size: 1.68rem;
  font-weight: 780;
  letter-spacing: -0.03em;
  background: linear-gradient(118deg, #1d4ed8 0%, #0891b2 38%, #6d28d9 72%, #334155 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.lead {
  margin: 0 0 1.1rem;
  font-size: 0.92rem;
  line-height: 1.72;
  color: var(--bccr-muted);
  max-width: 36rem;
}

.lead strong {
  color: var(--bccr-text-strong);
  font-weight: 650;
}

.iface-rail-wrap,
.tab-rail-wrap {
  margin-bottom: 1.05rem;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  padding-bottom: 0.25rem;
}

.tab-rail {
  display: flex;
  gap: 0.65rem;
  min-width: min-content;
}

.tab-btn {
  flex: 1 1 220px;
  min-width: 200px;
  padding: 0.82rem 0.92rem;
  border-radius: 0.82rem;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: var(--bccr-hover);
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    background 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.15s ease;
}

.tab-btn:hover {
  transform: translateY(-1px);
}

.tab-btn-emerald {
  border-color: rgba(52, 211, 153, 0.22);
}

.tab-btn-cyan {
  border-color: rgba(34, 211, 238, 0.25);
}

.tab-btn-violet {
  border-color: rgba(167, 139, 250, 0.28);
}

.tab-btn.active {
  background: var(--bccr-card);
  box-shadow: 0 10px 28px var(--bccr-code-bg);
}

.tab-btn-emerald.active {
  border-color: rgba(52, 211, 153, 0.55);
  box-shadow: 0 0 0 1px rgba(16, 185, 129, 0.12), 0 12px 30px rgba(16, 185, 129, 0.08);
}

.tab-btn-cyan.active {
  border-color: rgba(34, 211, 238, 0.55);
  box-shadow: 0 0 0 1px rgba(34, 211, 238, 0.1), 0 12px 30px rgba(34, 211, 238, 0.08);
}

.tab-btn-violet.active {
  border-color: rgba(167, 139, 250, 0.55);
  box-shadow: 0 0 0 1px rgba(167, 139, 250, 0.1), 0 12px 30px rgba(91, 33, 182, 0.1);
}

.tab-btn-head {
  display: flex;
  align-items: center;
  gap: 0.42rem;
}

.tab-indicator {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: rgba(148, 163, 184, 0.45);
  flex-shrink: 0;
}

.tab-btn-emerald.active .tab-indicator {
  background: #4ade80;
  box-shadow: 0 0 10px rgba(74, 222, 128, 0.45);
}

.tab-btn-cyan.active .tab-indicator {
  background: #22d3ee;
  box-shadow: 0 0 10px rgba(34, 211, 238, 0.45);
}

.tab-btn-violet.active .tab-indicator {
  background: #a78bfa;
  box-shadow: 0 0 10px rgba(167, 139, 250, 0.45);
}

.tab-name {
  font-size: 0.88rem;
  font-weight: 720;
  color: var(--bccr-text);
}

.tab-note {
  font-size: 0.72rem;
  line-height: 1.4;
  color: var(--bccr-muted);
}

.tab-live {
  margin-left: auto;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(148, 163, 184, 0.45);
  flex-shrink: 0;
}

.tab-live.ok {
  background: #4ade80;
  box-shadow: 0 0 10px rgba(74, 222, 128, 0.4);
}

.tab-live.bad {
  background: #f87171;
}

.tab-live.violet.ok {
  background: #c4b5fd;
  box-shadow: 0 0 10px rgba(196, 181, 253, 0.4);
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  align-items: center;
}

.btn-refresh {
  display: inline-flex;
  align-items: center;
  gap: 0.42rem;
  padding: 0.58rem 1.08rem;
  border-radius: 0.62rem;
  border: none;
  font-weight: 660;
  font-size: 0.88rem;
  color: var(--bccr-on-accent);
  cursor: pointer;
  background: var(--bccr-btn-primary-bg);
  box-shadow: var(--bccr-shadow-sm);
  transition:
    background 0.12s,
    box-shadow 0.12s;
}

.btn-refresh:hover:not(:disabled) {
  background: var(--bccr-btn-primary-hover);
  box-shadow: var(--bccr-shadow-md);
}

.btn-refresh:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-refresh-ic {
  font-size: 1rem;
  color: var(--bccr-on-accent);
  opacity: 0.95;
}

.btn-refresh-ic.spin {
  animation: spin-ic 0.85s linear infinite;
}

@keyframes spin-ic {
  to {
    transform: rotate(360deg);
  }
}

.btn-link {
  padding: 0.52rem 0.95rem;
  border-radius: 0.62rem;
  border: 1px solid var(--bccr-btn-info-border);
  font-weight: 600;
  font-size: 0.86rem;
  color: var(--bccr-btn-info-text);
  text-decoration: none;
  background: var(--bccr-btn-info-bg);
  transition:
    background 0.12s,
    border-color 0.12s,
    color 0.12s;
}

.btn-link:hover {
  border-color: var(--bccr-option-hover-border);
  background: var(--bccr-btn-info-hover);
  color: var(--bccr-accent-text);
}

/* Panel shell */
.panel-fade-enter-active,
.panel-fade-leave-active {
  transition:
    opacity 0.22s ease,
    transform 0.22s ease;
}

.panel-fade-enter-from,
.panel-fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

.panel-shell {
  margin-top: 0.25rem;
}

.panel {
  padding: 1.05rem 1.12rem 1.2rem;
  border-radius: 1.05rem;
  border: 1px solid rgba(148, 163, 184, 0.12);
  background: var(--bccr-card);
  box-shadow: 0 16px 40px var(--bccr-hover);
}

.panel-works {
  border-color: rgba(52, 211, 153, 0.16);
}

.panel-node {
  border-color: rgba(34, 211, 238, 0.16);
}

.panel-contract {
  border-color: rgba(167, 139, 250, 0.18);
}

.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 1rem;
  padding-bottom: 0.72rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
}

.panel-title {
  margin: 0 0 0.22rem;
  font-size: 1.12rem;
  font-weight: 720;
  color: var(--bccr-text);
}

.panel-sub {
  margin: 0;
  font-size: 0.81rem;
  line-height: 1.55;
  color: var(--bccr-muted);
}

.panel-link {
  flex-shrink: 0;
  font-size: 0.8rem;
  font-weight: 650;
  color: var(--bccr-success-text);
  text-decoration: none;
  padding: 0.35rem 0.62rem;
  border-radius: 0.5rem;
  border: 1px solid rgba(22, 163, 74, 0.32);
  background: var(--bccr-success-soft);
  transition:
    background 0.12s,
    border-color 0.12s;
}

.panel-link:hover {
  border-color: rgba(22, 163, 74, 0.45);
  background: rgba(22, 163, 74, 0.14);
  color: #15803d;
}

.status-hero {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.05rem;
  margin-bottom: 0.95rem;
  border-radius: 0.92rem;
  border: 1px solid rgba(148, 163, 184, 0.12);
  background: var(--bccr-media-bg);
}

.status-hero.ok {
  border-color: rgba(52, 211, 153, 0.28);
  background: linear-gradient(125deg, rgba(16, 185, 129, 0.1), var(--bccr-panel-bg));
}

.status-hero.bad {
  border-color: rgba(251, 113, 133, 0.28);
  background: linear-gradient(125deg, rgba(251, 113, 133, 0.08), var(--bccr-card));
}

.status-hero.idle {
  border-style: dashed;
}

.status-hero.violet.ok {
  border-color: rgba(167, 139, 250, 0.32);
  background: linear-gradient(125deg, rgba(91, 33, 182, 0.14), var(--bccr-panel-bg));
}

.status-hero-glyph {
  position: relative;
  width: 3rem;
  height: 3rem;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.status-hero-glyph.violet .glyph-ring.lg {
  border-color: rgba(167, 139, 250, 0.4);
}

.glyph-ring.lg {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 1px solid var(--bccr-btn-info-border);
}

.stat-dot.lg {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: rgba(148, 163, 184, 0.55);
  z-index: 1;
}

.status-hero.ok .stat-dot.lg {
  background: #4ade80;
  box-shadow: 0 0 14px rgba(74, 222, 128, 0.45);
}

.status-hero.bad .stat-dot.lg {
  background: #f87171;
}

.status-hero-body {
  min-width: 0;
}

.status-hero-k {
  display: block;
  font-size: 0.68rem;
  font-weight: 650;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--bccr-label);
  margin-bottom: 0.2rem;
}

.status-hero-v {
  display: block;
  font-size: 1.18rem;
  font-weight: 780;
  color: var(--bccr-text);
  margin-bottom: 0.28rem;
}

.status-hero-hint {
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.55;
  color: var(--bccr-muted);
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.65rem;
}

@media (max-width: 640px) {
  .metric-grid {
    grid-template-columns: 1fr;
  }
}

.metric-card {
  display: flex;
  align-items: flex-start;
  gap: 0.62rem;
  padding: 0.78rem 0.88rem;
  border-radius: 0.78rem;
  border: 1px solid rgba(148, 163, 184, 0.1);
  background: var(--bccr-hover);
}

.contract-metric {
  background: rgba(76, 29, 149, 0.08);
  border-color: rgba(167, 139, 250, 0.14);
}

.metric-icon {
  font-size: 0.95rem;
  opacity: 0.75;
  line-height: 1;
  margin-top: 0.12rem;
}

.metric-body {
  min-width: 0;
  flex: 1;
}

.metric-label {
  display: block;
  font-size: 0.7rem;
  font-weight: 650;
  letter-spacing: 0.04em;
  color: var(--bccr-label);
  margin-bottom: 0.22rem;
}

.metric-value {
  display: block;
  font-size: 0.8rem;
  line-height: 1.45;
  color: var(--bccr-text);
  word-break: break-all;
}

.metric-value-row {
  display: flex;
  align-items: flex-start;
  gap: 0.45rem;
}

.metric-value-row .metric-value {
  flex: 1;
  min-width: 0;
}

.btn-copy-inline {
  flex-shrink: 0;
  padding: 0.18rem 0.42rem;
  border-radius: 0.38rem;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: var(--bccr-card);
  color: var(--bccr-text);
  font-size: 0.66rem;
  font-weight: 650;
  cursor: pointer;
}

.btn-copy-inline:hover {
  border-color: rgba(56, 189, 248, 0.35);
  color: var(--bccr-accent-text);
}

.btn-mini.cyan {
  border-color: rgba(34, 211, 238, 0.32);
  background: rgba(14, 116, 144, 0.2);
  color: var(--bccr-accent-text);
}

.node-quick-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.62rem;
  margin-bottom: 0.95rem;
}

@media (max-width: 760px) {
  .node-quick-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 420px) {
  .node-quick-strip {
    grid-template-columns: 1fr;
  }
}

.node-quick-tile {
  display: flex;
  align-items: center;
  gap: 0.62rem;
  padding: 0.78rem 0.85rem;
  border-radius: 0.78rem;
  border: 1px solid rgba(34, 211, 238, 0.16);
  background: linear-gradient(135deg, rgba(14, 116, 144, 0.12), var(--bccr-card));
}

.node-quick-icon {
  font-size: 1rem;
  opacity: 0.85;
}

.node-quick-k {
  display: block;
  font-size: 0.66rem;
  font-weight: 650;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--bccr-label);
  margin-bottom: 0.15rem;
}

.node-quick-v {
  display: block;
  font-size: 0.95rem;
  font-weight: 780;
  color: var(--bccr-accent-text);
  line-height: 1.2;
}

.node-rpc-panel {
  margin-bottom: 0.95rem;
  padding: 0.82rem 0.92rem;
  border-radius: 0.78rem;
  border: 1px solid rgba(34, 211, 238, 0.2);
  background: rgba(8, 47, 73, 0.22);
}

.node-rpc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.42rem;
}

.node-rpc-title {
  font-size: 0.74rem;
  font-weight: 700;
  color: var(--bccr-accent-text);
}

.node-rpc-val {
  margin: 0;
  font-size: 0.74rem;
  line-height: 1.48;
  color: var(--bccr-accent-text);
  word-break: break-all;
}

.node-group-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.node-group {
  padding: 0.82rem 0.88rem;
  border-radius: 0.82rem;
  border: 1px solid rgba(148, 163, 184, 0.1);
  background: var(--bccr-hover);
}

.node-group-head {
  margin-bottom: 0.72rem;
}

.node-group-title {
  margin: 0 0 0.18rem;
  font-size: 0.86rem;
  font-weight: 720;
  color: var(--bccr-text);
}

.node-group-desc {
  margin: 0;
  font-size: 0.72rem;
  color: var(--bccr-muted);
}

.node-metric-grid {
  gap: 0.55rem;
}

.node-metric {
  background: var(--bccr-card);
}

.rate-bar-wrap {
  margin-bottom: 0.9rem;
  padding: 0.72rem 0.82rem;
  border-radius: 0.72rem;
  border: 1px solid var(--bccr-choice-surface-border);
  background: linear-gradient(165deg, #ffffff 0%, #f0fdf4 55%, #f8fafc 100%);
  box-shadow: var(--bccr-shadow-sm);
}

.rate-bar-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.45rem;
  font-size: 0.78rem;
  color: var(--bccr-text-secondary);
}

.rate-bar-head strong {
  font-size: 0.92rem;
  font-weight: 750;
  color: var(--bccr-success-text);
}

.rate-bar-track {
  height: 7px;
  border-radius: 999px;
  background: #e2e8f0;
  overflow: hidden;
}

.rate-bar-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #34d399, #22d3ee);
  transition: width 0.5s ease;
}

.dist-bars {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.dist-row-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.5rem;
  margin-bottom: 0.28rem;
}

.dist-label {
  font-size: 0.78rem;
  color: var(--bccr-text);
}

.dist-count {
  font-size: 0.78rem;
  font-weight: 750;
  color: var(--bccr-success-text);
}

.dist-track {
  height: 6px;
  border-radius: 999px;
  background: #e2e8f0;
  overflow: hidden;
}

.dist-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  transition: width 0.45s ease;
}

.dist-fill.status {
  background: linear-gradient(90deg, #34d399, #6ee7b7);
}

.dist-fill.type {
  background: linear-gradient(90deg, #38bdf8, #818cf8);
}

.mono {
  font-family: ui-monospace, monospace;
}

.mono.sm {
  font-size: 0.78em;
}

/* Stat strip — only chain summary */
.stat-strip {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.72rem;
  margin-bottom: 1rem;
}

@media (max-width: 560px) {
  .stat-strip {
    grid-template-columns: 1fr;
  }
}

.stat-tile {
  display: flex;
  align-items: center;
  gap: 0.82rem;
  padding: 0.92rem 1rem;
  border-radius: 0.92rem;
  border: 1px solid rgba(148, 163, 184, 0.12);
  background: var(--bccr-media-bg);
}

.stat-tile.idle {
  border-style: dashed;
  opacity: 0.92;
}

.stat-tile.ok {
  border-color: rgba(52, 211, 153, 0.3);
  background: linear-gradient(125deg, rgba(16, 185, 129, 0.1), var(--bccr-panel-bg));
}

.stat-tile.bad {
  border-color: rgba(251, 113, 133, 0.3);
  background: linear-gradient(125deg, rgba(251, 113, 133, 0.08), var(--bccr-card));
}

.stat-glyph {
  position: relative;
  width: 2.35rem;
  height: 2.35rem;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.stat-glyph.violet .glyph-ring {
  border-color: rgba(167, 139, 250, 0.4);
}

.glyph-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 1px solid var(--bccr-btn-info-border);
  opacity: 0.75;
}

.stat-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: rgba(148, 163, 184, 0.55);
  z-index: 1;
}

.stat-tile.ok .stat-dot {
  background: #4ade80;
  box-shadow: 0 0 14px rgba(74, 222, 128, 0.45);
}

.stat-tile.bad .stat-dot {
  background: #f87171;
}

.stat-dot.pulse {
  animation: pulse-dot 1.8s ease-in-out infinite;
}

@keyframes pulse-dot {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.4);
  }
  50% {
    box-shadow: 0 0 0 9px rgba(74, 222, 128, 0);
  }
}

.stat-body {
  min-width: 0;
}

.stat-k {
  display: block;
  font-size: 0.7rem;
  font-weight: 650;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--bccr-label);
}

.stat-v {
  font-size: 1.06rem;
  font-weight: 780;
  color: var(--bccr-text);
}

/* Cards */
.card-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

@media (max-width: 760px) {
  .card-grid {
    grid-template-columns: 1fr;
  }
}

.card {
  padding: 0;
  overflow: hidden;
  border-radius: 1rem;
  border: 1px solid rgba(148, 163, 184, 0.12);
  background: var(--bccr-card);
  box-shadow: 0 16px 40px var(--bccr-hover);
}

.card-node {
  border-color: rgba(34, 211, 238, 0.15);
}

.card-contract {
  border-color: rgba(167, 139, 250, 0.16);
}

.card-topline {
  height: 3px;
  background: linear-gradient(90deg, rgba(34, 211, 238, 0.9), transparent);
}

.contract-line {
  background: linear-gradient(90deg, rgba(167, 139, 250, 0.95), transparent);
}

.card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.65rem;
  padding: 1rem 1.12rem 0.65rem;
}

.card-kicker {
  margin: 0 0 0.15rem;
  font-size: 0.62rem;
  color: rgba(103, 232, 249, 0.55);
}

.card-contract .card-kicker {
  color: rgba(216, 180, 254, 0.55);
}

.card-title {
  margin: 0;
  font-size: 1.02rem;
  font-weight: 700;
  color: var(--bccr-text);
}

.card-body {
  padding: 0 1.12rem 1.12rem;
}

.pill {
  flex-shrink: 0;
  font-size: 0.66rem;
  font-weight: 750;
  letter-spacing: 0.06em;
  padding: 0.24rem 0.52rem;
  border-radius: 999px;
  text-transform: none;
}

.pill-ok {
  background: rgba(34, 197, 94, 0.15);
  color: var(--bccr-success-text);
  border: 1px solid rgba(74, 222, 128, 0.32);
}

.pill-bad {
  background: rgba(248, 113, 113, 0.1);
  color: var(--bccr-danger);
  border: 1px solid rgba(251, 113, 133, 0.32);
}

.card-err {
  margin: 0;
  font-size: 0.88rem;
  line-height: 1.58;
  color: var(--bccr-danger);
}

.callout {
  margin-bottom: 0.82rem;
  padding: 0.65rem 0.82rem;
  border-radius: 0.62rem;
  border: 1px solid rgba(251, 191, 36, 0.22);
  background: rgba(245, 158, 11, 0.06);
}

.callout-tag {
  display: inline-block;
  font-size: 0.62rem;
  font-weight: 750;
  letter-spacing: 0.08em;
  color: var(--bccr-warning-text);
  margin-bottom: 0.28rem;
}

.callout-txt {
  margin: 0;
  font-size: 0.84rem;
  line-height: 1.52;
  color: var(--bccr-warning-text);
}

.kv-intro {
  margin: 0 0 0.52rem;
  font-size: 0.74rem;
  color: var(--bccr-label);
}

.kv-table {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.kv-row {
  display: grid;
  grid-template-columns: minmax(0, 42%) 1fr;
  gap: 0.65rem;
  align-items: baseline;
  padding: 0.52rem 0.62rem;
  border-radius: 0.52rem;
  background: var(--bccr-hover);
  border: 1px solid rgba(148, 163, 184, 0.08);
}

.kv-label {
  font-size: 0.8rem;
  color: var(--bccr-text);
}

.kv-value {
  margin: 0;
  font-size: 0.76rem;
  color: var(--bccr-text);
  justify-self: end;
  text-align: right;
  word-break: break-all;
}

.muted {
  margin: 0;
  font-size: 0.8rem;
  color: var(--bccr-muted);
  line-height: 1.55;
}

.box-muted {
  padding: 0.65rem;
  border-radius: 0.55rem;
  background: var(--bccr-hover);
  border: 1px dashed rgba(148, 163, 184, 0.15);
}

.addr-panel {
  margin-bottom: 0.92rem;
  padding: 0.82rem 0.92rem;
  border-radius: 0.72rem;
  border: 1px solid rgba(167, 139, 250, 0.25);
  background: linear-gradient(135deg, rgba(76, 29, 149, 0.18), var(--bccr-surface-muted));
}

.addr-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.45rem;
}

.addr-title {
  font-size: 0.74rem;
  font-weight: 700;
  color: #5b21b6;
}

.addr-full {
  margin: 0 0 0.42rem;
  font-size: 0.74rem;
  line-height: 1.48;
  color: var(--bccr-text);
  word-break: break-all;
}

.addr-hint {
  margin: 0;
  font-size: 0.7rem;
  color: rgba(196, 181, 253, 0.7);
}

.btn-mini {
  padding: 0.3rem 0.58rem;
  border-radius: 0.42rem;
  border: 1px solid rgba(196, 181, 253, 0.32);
  background: rgba(91, 33, 182, 0.2);
  color: #6d28d9;
  font-size: 0.71rem;
  font-weight: 650;
  cursor: pointer;
  white-space: nowrap;
}

/* Works board */
.ov-board {
  padding: 0;
  border: none;
  background: transparent;
  box-shadow: none;
}

.ov-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.65rem;
  margin-bottom: 0.85rem;
}

@media (max-width: 640px) {
  .ov-metrics {
    grid-template-columns: 1fr;
  }
}

.ov-metric {
  padding: 1rem 0.92rem;
  border-radius: 0.82rem;
  border: 1px solid var(--bccr-choice-surface-border);
  background: linear-gradient(165deg, #ffffff 0%, #f8fafc 100%);
  box-shadow: var(--bccr-shadow-sm);
  display: flex;
  flex-direction: column;
  gap: 0.28rem;
}

.ov-metric-main {
  border-color: rgba(22, 163, 74, 0.24);
  background: linear-gradient(165deg, #ffffff 0%, #f0fdf4 55%, #f8fafc 100%);
}

.ov-metric:nth-child(2) {
  border-color: rgba(37, 99, 235, 0.2);
  background: linear-gradient(165deg, #ffffff 0%, #eff6ff 55%, #f8fafc 100%);
}

.ov-metric:nth-child(3) {
  border-color: rgba(245, 158, 11, 0.28);
  background: linear-gradient(165deg, #ffffff 0%, #fffbeb 55%, #f8fafc 100%);
}

.ov-metric-label {
  font-size: 0.68rem;
  font-weight: 650;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--bccr-muted);
}

.ov-metric-val {
  margin: 0;
  font-size: 1.65rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--bccr-heading);
  line-height: 1.1;
}

.ov-metric-val.accent {
  color: var(--bccr-accent-text);
}

.ov-metric-val.warn {
  color: var(--bccr-warning-text);
}

.ov-metric-meta {
  font-size: 0.68rem;
  color: var(--bccr-text-secondary);
  line-height: 1.35;
}

.banner-soft {
  margin: 0 0 0.82rem;
  padding: 0.55rem 0.72rem;
  border-radius: 0.55rem;
  font-size: 0.82rem;
  line-height: 1.52;
  color: var(--bccr-warning-text);
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(251, 191, 36, 0.22);
}

.pie-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 0.92rem;
  margin-top: 0.25rem;
}

.dist-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.92rem;
}

@media (max-width: 680px) {
  .dist-grid {
    grid-template-columns: 1fr;
  }
}

.dist-block {
  padding: 0.82rem 0.92rem;
  border-radius: 0.82rem;
  border: 1px solid var(--bccr-choice-surface-border);
  background: var(--bccr-choice-surface-bg);
  box-shadow: var(--bccr-shadow-sm);
}

.dist-h {
  margin: 0 0 0.18rem;
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--bccr-text);
}

.dist-desc {
  margin: 0 0 0.52rem;
  font-size: 0.71rem;
  color: var(--bccr-muted);
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.42rem;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.62rem;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: var(--bccr-media-bg);
}

.chip-k {
  color: var(--bccr-label);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 0.68rem;
}

.chip-v {
  font-weight: 760;
  color: var(--bccr-success-text);
}

.chip-type .chip-v {
  color: rgba(186, 230, 253, 0.98);
}

.soft-tip {
  margin: 0.65rem 0 0;
  font-size: 0.79rem;
  line-height: 1.55;
}

</style>
