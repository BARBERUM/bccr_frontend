<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import * as chainApi from '@/api/blockchain'
import { fetchAdminWorkOverview, fetchWorkList, normalizeListPage } from '@/api/work'
import {
  flattenStatusRows,
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

const statusRows = computed(() => {
  if (!statusPack.value.ok) return []
  return flattenStatusRows(
    /** @type {Record<string, unknown>} */ (statusPack.value.data),
  )
})

const contractRows = computed(() => {
  if (!contractPack.value.ok) return []
  return flattenStatusRows(
    /** @type {Record<string, unknown>} */ (contractPack.value.data),
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

/** 作品总览是否来自接口成功体（区别于仅列表兜底） */
const overviewBodyOk = computed(
  () => workOverview.value != null && typeof workOverview.value === 'object',
)

const totalDataSourceHint = computed(() => {
  if (overviewBodyOk.value) {
    const ov = /** @type {Record<string, unknown>} */ (workOverview.value)
    if (['totalWorks', 'total', 'count'].some((k) => ov[k] != null)) {
      return '来自 overview'
    }
  }
  if (workListTotalOk.value) return '列表分页兜底'
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
          : '作品总览 GET /api/work/admin/overview 请求失败，将尝试用作品列表分页 total 估算规模。'
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
            先快速把握<strong>链路健康</strong>，再对照<strong>作品总览接口</strong>理解业务体量与分布信息结构清晰，关键接口与用途在下方逐项对应。
          </p>

          <div class="iface-rail-wrap">
            <ul class="iface-rail" aria-label="本页数据接口">
              <li class="iface-card iface-card-emerald">
                <span class="iface-endpoint mono">GET /api/work/admin/overview</span>
                <span class="iface-name">作品总览数据</span>
                <span class="iface-note">体量、分布、可按状态/类型聚合</span>
              </li>
              <li class="iface-card iface-card-cyan">
                <span class="iface-endpoint mono">GET /api/blockchain/status</span>
                <span class="iface-name">节点连接状态</span>
                <span class="iface-note">RPC / 块高 / 同步等明细</span>
              </li>
              <li class="iface-card iface-card-violet">
                <span class="iface-endpoint mono">GET /api/blockchain/contract</span>
                <span class="iface-name">合约状态信息</span>
                <span class="iface-note">合约可用性与地址字段</span>
              </li>
            </ul>
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

      <!-- 01 链路与合约 -->
      <section class="bc-section" aria-labelledby="sec-chain">
        <div class="sec-head">
          <span class="sec-badge" aria-hidden="true">01</span>
          <div class="sec-titles">
            <h2 id="sec-chain" class="sec-title">链路与合约</h2>
            <p class="sec-sub">
              对应
              <code class="mono sm">/api/blockchain/status</code>
              与
              <code class="mono sm">/api/blockchain/contract</code>
              ：用于确认节点是否可达及合约配置是否就绪。
            </p>
          </div>
        </div>

        <section class="stat-strip" aria-label="健康摘要">
          <article class="stat-tile" :class="{ ok: nodeConnected, bad: statusPack.ok && !nodeConnected, idle: !statusPack.ok }">
            <div class="stat-glyph" aria-hidden="true">
              <span class="glyph-ring" />
              <span class="stat-dot" :class="{ pulse: nodeConnected && statusPack.ok }" />
            </div>
            <div class="stat-body">
              <span class="stat-k">节点连接</span>
              <span class="stat-v">{{ statusPack.ok ? (nodeConnected ? '已连接' : '未连接') : '加载中/未知' }}</span>
            </div>
          </article>
          <article
            class="stat-tile"
            :class="{ ok: contractAvailable, bad: contractPack.ok && !contractAvailable, idle: !contractPack.ok }"
          >
            <div class="stat-glyph violet" aria-hidden="true">
              <span class="glyph-ring" />
              <span class="stat-dot" />
            </div>
            <div class="stat-body">
              <span class="stat-k">智能合约</span>
              <span class="stat-v">{{ contractPack.ok ? (contractAvailable ? '可用' : '不可用') : '加载中/未知' }}</span>
            </div>
          </article>
        </section>

        <div class="card-grid">
          <article class="card card-node">
            <div class="card-topline" aria-hidden="true" />
            <header class="card-head">
              <div>
                <p class="card-kicker mono">GET /api/blockchain/status</p>
                <h3 class="card-title">节点连接状态</h3>
              </div>
              <span class="pill" :class="statusPack.ok && nodeConnected ? 'pill-ok' : 'pill-bad'">{{ statusPillText }}</span>
            </header>
            <div class="card-body">
              <p v-if="!statusPack.ok" class="card-err">{{ statusPack.message }}</p>
              <template v-else>
                <aside
                  v-if="!nodeConnected && pickStr(statusPack.data, ['errorMessage', 'error', 'message'])"
                  class="callout callout-warn"
                >
                  <span class="callout-tag">诊断</span>
                  <p class="callout-txt">{{ pickStr(statusPack.data, ['errorMessage', 'error', 'message']) }}</p>
                </aside>
                <template v-if="statusRows.length">
                  <p class="kv-intro">以下为接口返回的业务字段（已转为中文标签，便于浏览）：</p>
                  <div class="kv-table">
                    <div v-for="row in statusRows" :key="row.key" class="kv-row">
                      <span class="kv-label" :title="row.key">{{ row.label }}</span>
                      <code class="kv-value mono">{{ row.value }}</code>
                    </div>
                  </div>
                </template>
                <p v-else class="muted box-muted">暂无除连接状态外的标量字段。可在 <code class="mono">BlockChainStatus</code> 中补充块高、链 ID、RPC URL 等。</p>
              </template>
            </div>
          </article>

          <article class="card card-contract">
            <div class="card-topline contract-line" aria-hidden="true" />
            <header class="card-head">
              <div>
                <p class="card-kicker mono">GET /api/blockchain/contract</p>
                <h3 class="card-title">合约状态信息</h3>
              </div>
              <span class="pill" :class="contractPack.ok && contractAvailable ? 'pill-ok' : 'pill-bad'">{{ contractPillText }}</span>
            </header>
            <div class="card-body">
              <p v-if="!contractPack.ok" class="card-err">{{ contractPack.message }}</p>
              <template v-else>
                <aside
                  v-if="!contractAvailable && pickStr(contractPack.data, ['errorMessage', 'error', 'message'])"
                  class="callout callout-warn"
                >
                  <span class="callout-tag">诊断</span>
                  <p class="callout-txt">{{ pickStr(contractPack.data, ['errorMessage', 'error', 'message']) }}</p>
                </aside>
                <div v-if="contractAddress" class="addr-panel">
                  <div class="addr-head">
                    <span class="addr-title">合约地址</span>
                    <button type="button" class="btn-mini" @click="copyText('合约地址', contractAddress)">复制完整地址</button>
                  </div>
                  <p class="addr-full mono">{{ contractAddress }}</p>
                  <p class="addr-hint mono">缩略：<span>{{ shortHex(contractAddress, 10, 8) }}</span></p>
                </div>
                <template v-if="contractRows.length">
                  <p class="kv-intro">其他合约相关字段：</p>
                  <div class="kv-table">
                    <div v-for="row in contractRows" :key="row.key" class="kv-row">
                      <span class="kv-label" :title="row.key">{{ row.label }}</span>
                      <code class="kv-value mono">{{ row.value }}</code>
                    </div>
                  </div>
                </template>
                <p v-else-if="!contractAddress" class="muted box-muted">
                  未返回合约地址或其他标量字段。可在 <code class="mono">ContractInfo</code> 中返回网络名、版本等。
                </p>
              </template>
            </div>
          </article>
        </div>
      </section>

      <!-- 02 作品 -->
      <section class="bc-section bc-section-works" aria-labelledby="sec-works">
        <div class="sec-head">
          <span class="sec-badge emerald" aria-hidden="true">02</span>
          <div class="sec-titles">
            <h2 id="sec-works" class="sec-title">作品总览</h2>
            <p class="sec-sub">
              对应
              <code class="mono sm">GET /api/work/admin/overview</code>
              ：与链解耦的业务视角；若无总数字段，再用
              <code class="mono sm">GET /api/work/list</code>
              的 total 兜底。
            </p>
          </div>
        </div>

        <div class="ov-board">
          <div class="ov-metrics">
            <div class="ov-metric">
              <span class="ov-metric-label">登记作品总数</span>
              <strong class="ov-metric-val">{{ totalWorksDisplay != null ? totalWorksDisplay : '—' }}</strong>
              <span v-if="totalDataSourceHint" class="ov-metric-meta">{{ totalDataSourceHint }}</span>
            </div>
            <div class="ov-metric">
              <span class="ov-metric-label">链上作品数量</span>
              <strong class="ov-metric-val accent">{{ onChainWorksDisplay != null ? onChainWorksDisplay : '—' }}</strong>
              <span class="ov-metric-meta">overview 字段 onChainCount 等</span>
            </div>
            <div class="ov-metric">
              <span class="ov-metric-label">待审核（若有）</span>
              <strong class="ov-metric-val warn">{{ pendingAuditDisplay != null ? pendingAuditDisplay : '—' }}</strong>
              <span class="ov-metric-meta">pendingAuditCount 等</span>
            </div>
          </div>

          <p v-if="workOverviewErr" class="banner-soft">{{ workOverviewErr }}</p>

          <div v-if="byStatusEntries.length || byTypeEntries.length" class="dist-grid">
            <div v-if="byStatusEntries.length" class="dist-block">
              <h4 class="dist-h">按审核 / 状态分布</h4>
              <p class="dist-desc">后端 <code class="mono">byStatus</code> 映射</p>
              <div class="chip-row">
                <span v-for="entry in byStatusEntries" :key="entry[0]" class="chip">
                  <span class="chip-k">{{ entry[0] }}</span>
                  <span class="chip-v">{{ entry[1] }}</span>
                </span>
              </div>
            </div>
            <div v-if="byTypeEntries.length" class="dist-block">
              <h4 class="dist-h">按作品类型分布</h4>
              <p class="dist-desc">后端 <code class="mono">byType</code> 等</p>
              <div class="chip-row">
                <span v-for="entry in byTypeEntries" :key="entry[0]" class="chip chip-type">
                  <span class="chip-k">{{ entry[0] }}</span>
                  <span class="chip-v">{{ entry[1] }}</span>
                </span>
              </div>
            </div>
          </div>

          <p
            v-if="overviewBodyOk && !byStatusEntries.length && !byTypeEntries.length"
            class="muted soft-tip"
          >
            总览已成功拉取；若暂未返回聚合分布字段，可在后端 VO 中补充
            <code class="mono">byStatus</code>、
            <code class="mono">byType</code>
            ，便于本节展示条状分布观感。
          </p>

          <details class="api-foot">
            <summary>开发者：总览 VO 字段参考</summary>
            <div class="api-inner">
              <p class="mono api-line">GET /api/work/admin/overview</p>
              <ul class="api-ul">
                <li><code class="mono">totalWorks</code> · 总数</li>
                <li><code class="mono">onChainCount</code> · 已上链</li>
                <li><code class="mono">pendingAuditCount</code> · 待审</li>
                <li><code class="mono">byStatus</code> / <code class="mono">byType</code> · 分布</li>
              </ul>
            </div>
          </details>
        </div>
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
  color: #ecfdf5;
  background: rgba(15, 23, 42, 0.92);
  border: 1px solid rgba(52, 211, 153, 0.35);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
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
  background: rgba(15, 23, 42, 0.35);
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
  color: rgba(165, 243, 252, 0.75);
}

.title {
  margin: 0 0 0.42rem;
  font-size: 1.68rem;
  font-weight: 780;
  letter-spacing: -0.03em;
  background: linear-gradient(118deg, #ecfeff 0%, #22d3ee 34%, #a78bfa 68%, #e2e8f0 100%);
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
  color: #e2e8f0;
  font-weight: 650;
}

.iface-rail-wrap {
  margin-bottom: 1.05rem;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  padding-bottom: 0.25rem;
}

.iface-rail {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  gap: 0.65rem;
  min-width: min-content;
}

.iface-card {
  flex: 1 1 220px;
  min-width: 200px;
  padding: 0.82rem 0.92rem;
  border-radius: 0.82rem;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  gap: 0.32rem;
}

.iface-card-emerald {
  border-color: rgba(52, 211, 153, 0.22);
  box-shadow: 0 0 0 1px rgba(16, 185, 129, 0.04);
}

.iface-card-cyan {
  border-color: rgba(34, 211, 238, 0.25);
}

.iface-card-violet {
  border-color: rgba(167, 139, 250, 0.28);
}

.iface-endpoint {
  font-size: 0.65rem;
  line-height: 1.35;
  color: rgba(186, 230, 253, 0.78);
}

.iface-name {
  font-size: 0.88rem;
  font-weight: 720;
  color: #f8fafc;
}

.iface-note {
  font-size: 0.72rem;
  line-height: 1.4;
  color: var(--bccr-muted);
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
  color: #ecfeff;
  cursor: pointer;
  background: linear-gradient(135deg, #0e7490, #5b21b6);
  box-shadow: 0 10px 26px rgba(91, 33, 182, 0.28);
}

.btn-refresh:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-refresh-ic {
  font-size: 1rem;
  opacity: 0.9;
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
  border: 1px solid rgba(56, 189, 248, 0.32);
  font-weight: 600;
  font-size: 0.86rem;
  color: #a5f3fc;
  text-decoration: none;
  background: rgba(14, 116, 144, 0.12);
}

.btn-link:hover {
  border-color: rgba(165, 243, 252, 0.5);
}

/* Sections */
.bc-section {
  margin-bottom: 1.75rem;
}

.sec-head {
  display: flex;
  gap: 0.85rem;
  align-items: flex-start;
  margin-bottom: 1rem;
  padding-bottom: 0.65rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
}

.sec-badge {
  flex-shrink: 0;
  width: 2.35rem;
  height: 2.35rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.65rem;
  font-weight: 800;
  font-size: 0.92rem;
  color: #cffafe;
  background: linear-gradient(145deg, rgba(34, 211, 238, 0.2), rgba(99, 102, 241, 0.12));
  border: 1px solid rgba(34, 211, 238, 0.35);
}

.sec-badge.emerald {
  color: #d1fae5;
  border-color: rgba(52, 211, 153, 0.35);
  background: linear-gradient(145deg, rgba(16, 185, 129, 0.18), rgba(15, 23, 42, 0.2));
}

.sec-titles {
  min-width: 0;
}

.sec-title {
  margin: 0 0 0.28rem;
  font-size: 1.12rem;
  font-weight: 720;
  color: #f1f5f9;
}

.sec-sub {
  margin: 0;
  font-size: 0.81rem;
  line-height: 1.62;
  color: var(--bccr-muted);
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
  background: rgba(15, 23, 42, 0.5);
}

.stat-tile.idle {
  border-style: dashed;
  opacity: 0.92;
}

.stat-tile.ok {
  border-color: rgba(52, 211, 153, 0.3);
  background: linear-gradient(125deg, rgba(16, 185, 129, 0.1), rgba(15, 23, 42, 0.55));
}

.stat-tile.bad {
  border-color: rgba(251, 113, 133, 0.3);
  background: linear-gradient(125deg, rgba(251, 113, 133, 0.08), rgba(15, 23, 42, 0.52));
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
  border: 1px solid rgba(56, 189, 248, 0.35);
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
  color: rgba(148, 163, 184, 0.95);
}

.stat-v {
  font-size: 1.06rem;
  font-weight: 780;
  color: #f8fafc;
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
  background: rgba(15, 23, 42, 0.45);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.2);
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
  color: #f8fafc;
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
  color: #bbf7d0;
  border: 1px solid rgba(74, 222, 128, 0.32);
}

.pill-bad {
  background: rgba(248, 113, 113, 0.1);
  color: #fecaca;
  border: 1px solid rgba(251, 113, 133, 0.32);
}

.card-err {
  margin: 0;
  font-size: 0.88rem;
  line-height: 1.58;
  color: #fecaca;
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
  color: #fde047;
  margin-bottom: 0.28rem;
}

.callout-txt {
  margin: 0;
  font-size: 0.84rem;
  line-height: 1.52;
  color: rgba(254, 240, 138, 0.92);
}

.kv-intro {
  margin: 0 0 0.52rem;
  font-size: 0.74rem;
  color: rgba(148, 163, 184, 0.95);
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
  background: rgba(0, 0, 0, 0.16);
  border: 1px solid rgba(148, 163, 184, 0.08);
}

.kv-label {
  font-size: 0.8rem;
  color: rgba(226, 232, 240, 0.9);
}

.kv-value {
  margin: 0;
  font-size: 0.76rem;
  color: rgba(226, 232, 240, 0.95);
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
  background: rgba(0, 0, 0, 0.12);
  border: 1px dashed rgba(148, 163, 184, 0.15);
}

.addr-panel {
  margin-bottom: 0.92rem;
  padding: 0.82rem 0.92rem;
  border-radius: 0.72rem;
  border: 1px solid rgba(167, 139, 250, 0.25);
  background: linear-gradient(135deg, rgba(76, 29, 149, 0.18), rgba(15, 23, 42, 0.3));
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
  color: #ede9fe;
}

.addr-full {
  margin: 0 0 0.42rem;
  font-size: 0.74rem;
  line-height: 1.48;
  color: #faf5ff;
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
  color: #e9d5ff;
  font-size: 0.71rem;
  font-weight: 650;
  cursor: pointer;
  white-space: nowrap;
}

/* Works board */
.ov-board {
  padding: 1rem 1.12rem;
  border-radius: 1.05rem;
  border: 1px solid rgba(52, 211, 153, 0.14);
  background: rgba(15, 23, 42, 0.4);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.16);
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
  border: 1px solid rgba(148, 163, 184, 0.1);
  background: rgba(6, 78, 59, 0.08);
  display: flex;
  flex-direction: column;
  gap: 0.28rem;
}

.ov-metric-label {
  font-size: 0.68rem;
  font-weight: 650;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: rgba(167, 243, 208, 0.8);
}

.ov-metric-val {
  margin: 0;
  font-size: 1.65rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: #ecfdf5;
  line-height: 1.1;
}

.ov-metric-val.accent {
  background: linear-gradient(115deg, #a7f3d0, #67e8f9);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.ov-metric-val.warn {
  color: rgba(253, 230, 138, 0.95);
}

.ov-metric-meta {
  font-size: 0.68rem;
  color: rgba(148, 163, 184, 0.9);
  line-height: 1.35;
}

.banner-soft {
  margin: 0 0 0.82rem;
  padding: 0.55rem 0.72rem;
  border-radius: 0.55rem;
  font-size: 0.82rem;
  line-height: 1.52;
  color: rgba(254, 240, 138, 0.94);
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(251, 191, 36, 0.22);
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
  border: 1px solid rgba(148, 163, 184, 0.1);
  background: rgba(0, 0, 0, 0.14);
}

.dist-h {
  margin: 0 0 0.18rem;
  font-size: 0.82rem;
  font-weight: 700;
  color: #ecfdf5;
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
  background: rgba(15, 23, 42, 0.5);
}

.chip-k {
  color: rgba(148, 163, 184, 0.95);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 0.68rem;
}

.chip-v {
  font-weight: 760;
  color: #a7f3d0;
}

.chip-type .chip-v {
  color: rgba(186, 230, 253, 0.98);
}

.soft-tip {
  margin: 0.65rem 0 0;
  font-size: 0.79rem;
  line-height: 1.55;
}

.api-foot {
  margin-top: 1rem;
  font-size: 0.78rem;
  color: var(--bccr-muted);
}

.api-foot summary {
  cursor: pointer;
  color: rgba(167, 243, 208, 0.75);
  font-weight: 600;
}

.api-inner {
  margin-top: 0.5rem;
  padding: 0.75rem 0.92rem;
  border-radius: 0.62rem;
  border: 1px solid rgba(148, 163, 184, 0.1);
  background: rgba(0, 0, 0, 0.12);
}

.api-line {
  margin: 0 0 0.35rem;
  color: rgba(186, 230, 253, 0.85);
}

.api-ul {
  margin: 0;
  padding-left: 1.05rem;
  line-height: 1.6;
}

</style>
