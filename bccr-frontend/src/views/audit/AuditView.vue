<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import * as auditApi from '@/api/audit'
import * as userApi from '@/api/user'
import { normalizeWorkIdParam } from '@/api/work'
import {
  formatAuditHistoryBadge,
  formatAuditStatus,
  pickAuditCaseId,
  pickAuditLogAddress,
  pickAuditOperator,
  pickAuditRemark,
  pickReasonRaw,
  pickReporter,
  pickWorkAuthorLabel,
  pickWorkId,
  pickWorkTitle,
  reasonCodeLabel,
  shortAddr,
  splitReasonDisplay,
} from '@/lib/auditDisplay'

const router = useRouter()

/** @type {import('vue').Ref<'pending' | 'history'>} */
const mainTab = ref('pending')

/** @type {import('vue').Ref<Record<string, unknown>[]>} */
const pendingList = ref([])
/** @type {import('vue').Ref<Record<string, unknown>[]>} */
const historyList = ref([])

const listLoading = ref(false)
const listError = ref('')
const historyPage = ref(1)
const historySize = ref(10)
const historyTotal = ref(0)
const historyPages = ref(0)
/** @type {import('vue').Ref<string>} */
const historyAction = ref('')
const historyWorkIdFilter = ref('')
const historyWorkFullMode = ref(false)

/** 链上地址 → 用户展示信息（审核记录「处理人」反查） */
const historyProfileByAddress = ref(
  /** @type {Record<string, Record<string, unknown>>} */ ({}),
)

/** @type {import('vue').Ref<{ type: 'approve' | 'reject'; row: Record<string, unknown> } | null>} */
const pendingAction = ref(null)
const actionNote = ref('')
const actionSubmitting = ref(false)

const hasPendingAction = computed(() => pendingAction.value != null)

watch(mainTab, (t) => {
  listError.value = ''
  if (t === 'history') {
    loadHistory()
  }
})

function formatTime(v) {
  if (v == null || v === '') return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return String(v)
  return d.toLocaleString('zh-CN')
}

/** @param {unknown} id */
function goWork(id) {
  const w = normalizeWorkIdParam(id)
  if (!w) return
  router.push({ name: 'work-detail', params: { workId: w } })
}

/** 跳转查重中心并按作品 ID 加载相似度/查重链上记录 */
function goSimilarityRecordsForWork(id) {
  const w = normalizeWorkIdParam(id)
  if (!w) return
  router.push({ name: 'check', query: { workId: w } })
}

function openApprove(row) {
  pendingAction.value = { type: 'approve', row }
  actionNote.value = ''
}

function openReject(row) {
  pendingAction.value = { type: 'reject', row }
  actionNote.value = ''
}

function cancelAction() {
  pendingAction.value = null
  actionNote.value = ''
}

async function confirmAction() {
  const ctx = pendingAction.value
  if (!ctx) return
  const workId = normalizeWorkIdParam(pickWorkId(ctx.row))
  if (!workId) {
    listError.value = '缺少业务作品 ID（如 work-…），无法提交审核。请确认待办数据里包含作品编号。'
    return
  }
  actionSubmitting.value = true
  listError.value = ''
  try {
    const note = actionNote.value.trim()
    if (ctx.type === 'approve') {
      await auditApi.approveAuditCase(workId, note ? { remark: note } : {})
    } else {
      await auditApi.rejectAuditCase(workId, note ? { remark: note } : {})
    }
    cancelAction()
    await loadPending()
    if (mainTab.value === 'history') await loadHistory()
  } catch (e) {
    listError.value = e?.message || '操作失败'
  } finally {
    actionSubmitting.value = false
  }
}

async function loadPending() {
  listLoading.value = true
  listError.value = ''
  try {
    const data = await auditApi.fetchPendingAuditQueue()
    pendingList.value = auditApi.normalizeAuditList(data)
  } catch (e) {
    listError.value = e?.message || '加载待办失败'
    pendingList.value = []
  } finally {
    listLoading.value = false
  }
}

function historyRowTime(row) {
  return row.operateTime ?? row.createdAt ?? row.updatedAt ?? row.resolvedAt ?? ''
}

/** @param {Record<string, unknown>} row */
function historyWorkDisplayTitle(row) {
  const t = pickWorkTitle(row)
  return t || '（未命名作品）'
}

/** @param {string} addr */
function auditAddressCacheKey(addr) {
  const s = String(addr ?? '').trim()
  if (/^0x[a-fA-F0-9]{20,}$/i.test(s)) return s.toLowerCase()
  return s
}

/** @param {Record<string, unknown>} row */
function historyOperatorDisplay(row) {
  const addr = pickAuditLogAddress(row)
  if (addr) {
    const key = auditAddressCacheKey(addr)
    if (historyProfileByAddress.value[key]) {
      const p = historyProfileByAddress.value[key]
      const nick = String(p.nickname ?? '').trim()
      const user = String(p.username ?? '').trim()
      if (nick && user) return `${nick}（${user}）`
      if (nick) return nick
      if (user) return user
    }
  }
  const op = pickAuditOperator(row)
  if (op) return op
  if (addr) return shortAddr(addr, 10, 8)
  return '—'
}

/**
 * 根据审核日志中的 address 批量拉取用户昵称等（去重、静默失败）
 * @param {Record<string, unknown>[]} rows
 */
async function hydrateHistoryOperatorProfiles(rows) {
  /** @type {Map<string, string>} key -> 请求用原始地址 */
  const toFetch = new Map()
  for (const row of rows) {
    const addr = pickAuditLogAddress(/** @type {Record<string, unknown>} */ (row))
    if (!addr) continue
    const key = auditAddressCacheKey(addr)
    if (historyProfileByAddress.value[key]) continue
    if (!toFetch.has(key)) toFetch.set(key, addr)
  }
  if (!toFetch.size) return
  await Promise.all(
    [...toFetch.entries()].map(async ([key, fetchAddr]) => {
      try {
        const data = await userApi.fetchUserByBlockchainAddress(fetchAddr)
        if (data && typeof data === 'object') {
          historyProfileByAddress.value = {
            ...historyProfileByAddress.value,
            [key]: /** @type {Record<string, unknown>} */ (data),
          }
        }
      } catch {
        /* 用户不存在或无权：保留地址缩写展示 */
      }
    }),
  )
}

function applyHistoryFilters() {
  historyWorkFullMode.value = false
  historyPage.value = 1
  loadHistory()
}

function openWorkFullHistory() {
  if (!historyWorkIdFilter.value.trim()) {
    listError.value = '请先填写作品 ID'
    return
  }
  historyWorkFullMode.value = true
  historyPage.value = 1
  loadHistory()
}

function backToPagedHistory() {
  historyWorkFullMode.value = false
  loadHistory()
}

function historyPrev() {
  if (historyWorkFullMode.value || historyPage.value <= 1) return
  historyPage.value -= 1
  loadHistory()
}

function historyNext() {
  if (historyWorkFullMode.value) return
  const maxP = historyPages.value || 1
  if (historyPage.value >= maxP) return
  historyPage.value += 1
  loadHistory()
}

async function loadHistory() {
  listLoading.value = true
  listError.value = ''
  try {
    if (historyWorkFullMode.value) {
      const wid = historyWorkIdFilter.value.trim()
      if (!wid) {
        historyList.value = []
        historyTotal.value = 0
        historyPages.value = 0
        listError.value = '「该作品全部」需填写作品 ID'
        return
      }
      const data = await auditApi.fetchWorkAuditLogs(wid)
      historyList.value = auditApi.normalizeAuditList(data)
      historyTotal.value = historyList.value.length
      historyPages.value = 1
      await hydrateHistoryOperatorProfiles(historyList.value)
      return
    }
    const data = await auditApi.fetchAuditLogs({
      page: historyPage.value,
      size: historySize.value,
      action: historyAction.value.trim() || undefined,
      workId: historyWorkIdFilter.value.trim() || undefined,
    })
    const norm = auditApi.normalizeAuditLogPage(data)
    historyList.value = /** @type {Record<string, unknown>[]} */ (norm.items)
    historyTotal.value = norm.total
    historyPages.value = norm.pages
    historyPage.value = norm.page
    historySize.value = norm.size
    await hydrateHistoryOperatorProfiles(historyList.value)
  } catch (e) {
    listError.value = e?.message || '加载记录失败'
    historyList.value = []
    historyTotal.value = 0
    historyPages.value = 0
  } finally {
    listLoading.value = false
  }
}

loadPending()
</script>

<template>
  <div class="audit-shell">
    <div class="audit-page">
      <header class="hero">
        <div class="hero-aura" aria-hidden="true" />
        <h1 class="title">审核工作台</h1>
        <p class="lead">
          处理待办举报与审核单，核对作品信息后作出通过或驳回决定；操作将提交至后端与链上流程（以实际接口为准）。
        </p>
        <div class="tabs" role="tablist" aria-label="审核分区">
          <button
            type="button"
            role="tab"
            class="tab"
            :class="{ active: mainTab === 'pending' }"
            :aria-selected="mainTab === 'pending'"
            @click="mainTab = 'pending'"
          >
            <span class="tab-ic" aria-hidden="true">◇</span>
            待处理
          </button>
          <button
            type="button"
            role="tab"
            class="tab"
            :class="{ active: mainTab === 'history' }"
            :aria-selected="mainTab === 'history'"
            @click="mainTab = 'history'"
          >
            <span class="tab-ic" aria-hidden="true">☰</span>
            处理记录
          </button>
        </div>
      </header>

      <p v-if="listError" class="banner-err">{{ listError }}</p>

      <section v-show="mainTab === 'pending'" class="panel">
        <div class="panel-head">
          <h2 class="h2">待办队列</h2>
          <button type="button" class="btn-ghost" :disabled="listLoading" @click="loadPending">
            {{ listLoading ? '刷新中…' : '刷新' }}
          </button>
        </div>
        <p v-if="listLoading && !pendingList.length" class="empty">
          <span class="empty-ic" aria-hidden="true">⟳</span>
          正在加载待办…
        </p>
        <p v-else-if="!listLoading && !pendingList.length" class="empty">
          <span class="empty-ic" aria-hidden="true">✓</span>
          当前没有待处理项，或后端尚未返回数据。
        </p>
        <ul v-else class="case-list">
          <li
            v-for="row in pendingList"
            :key="pickAuditCaseId(row) || pickWorkId(row)"
            class="case-card"
          >
            <div class="case-top">
              <span
                class="pill-status"
                :class="`tone-${formatAuditStatus(row.status ?? row.state).tone}`"
              >
                {{ formatAuditStatus(row.status ?? row.state).label }}
              </span>
              <span class="case-id mono">{{ pickAuditCaseId(row) || '—' }}</span>
            </div>
            <h3 class="case-title">
              {{ pickWorkTitle(row) || '未命名作品' }}
            </h3>
            <div class="case-meta">
              <span class="meta-k">作品 ID</span>
              <button
                v-if="pickWorkId(row)"
                type="button"
                class="link-work mono"
                @click="goWork(pickWorkId(row))"
              >
                {{ pickWorkId(row) }}
              </button>
              <span v-else class="meta-v muted">—</span>
            </div>
            <div class="case-meta">
              <span class="meta-k">举报人</span>
              <span class="meta-v mono" :title="pickReporter(row)">{{
                shortAddr(pickReporter(row), 10, 8)
              }}</span>
            </div>
            <div class="case-meta">
              <span class="meta-k">时间</span>
              <span class="meta-v">{{
                formatTime(row.createdAt ?? row.reportTime ?? row.gmtCreate)
              }}</span>
            </div>
            <div class="reason-block">
              <span class="reason-label">事由</span>
              <div class="reason-body">
                <span class="reason-code">{{ reasonCodeLabel(splitReasonDisplay(pickReasonRaw(row)).code) }}</span>
                <p v-if="splitReasonDisplay(pickReasonRaw(row)).detail" class="reason-detail">
                  {{ splitReasonDisplay(pickReasonRaw(row)).detail }}
                </p>
                <p v-else-if="pickReasonRaw(row)" class="reason-raw mono">
                  {{ pickReasonRaw(row) }}
                </p>
              </div>
            </div>
            <div class="case-actions">
              <button
                type="button"
                class="btn-pass"
                :disabled="actionSubmitting"
                @click="openApprove(row)"
              >
                通过
              </button>
              <button
                type="button"
                class="btn-deny"
                :disabled="actionSubmitting"
                @click="openReject(row)"
              >
                驳回
              </button>
            </div>
          </li>
        </ul>
      </section>

      <section v-show="mainTab === 'history'" class="panel panel--muted">
        <div class="panel-head panel-head--split">
          <div>
            <h2 class="h2">处理记录</h2>
            <p class="panel-sub">作品名称、作者与处理结果；作品编号可跳转详情。</p>
          </div>
          <button type="button" class="btn-ghost" :disabled="listLoading" @click="loadHistory">
            {{ listLoading ? '加载中…' : '刷新' }}
          </button>
        </div>
        <div class="hist-toolbar">
          <div class="hist-filters">
            <label class="hist-field">
              <span class="hist-label">操作</span>
              <select v-model="historyAction" class="hist-input" @change="applyHistoryFilters">
                <option value="">全部</option>
                <option value="approve">通过</option>
                <option value="reject">驳回</option>
              </select>
            </label>
            <label class="hist-field hist-field--grow">
              <span class="hist-label">作品 ID</span>
              <input
                v-model.trim="historyWorkIdFilter"
                type="text"
                class="hist-input"
                placeholder="可选，筛选某作品"
                @keyup.enter="applyHistoryFilters"
              />
            </label>
            <label class="hist-field">
              <span class="hist-label">每页</span>
              <select v-model.number="historySize" class="hist-input" @change="applyHistoryFilters">
                <option :value="10">10</option>
                <option :value="20">20</option>
                <option :value="50">50</option>
              </select>
            </label>
          </div>
          <div class="hist-actions">
            <button type="button" class="btn-ghost" :disabled="listLoading" @click="applyHistoryFilters">
              应用筛选
            </button>
            <button
              type="button"
              class="btn-ghost"
              :disabled="listLoading || historyWorkFullMode"
              @click="openWorkFullHistory"
            >
              该作品全部
            </button>
            <button
              v-if="historyWorkFullMode"
              type="button"
              class="btn-ghost"
              :disabled="listLoading"
              @click="backToPagedHistory"
            >
              返回分页
            </button>
          </div>
        </div>
        <p v-if="historyWorkFullMode" class="hist-hint">
          当前展示作品 <span class="mono">{{ historyWorkIdFilter }}</span> 的全部审核记录（共 {{ historyTotal }} 条）。
        </p>
        <div v-if="!historyWorkFullMode && historyTotal > 0" class="hist-pagination">
          <span class="hist-page-meta">
            第 {{ historyPage }} / {{ historyPages || 1 }} 页，共 {{ historyTotal }} 条
          </span>
          <div class="hist-page-btns">
            <button type="button" class="btn-ghost btn-ghost--sm" :disabled="listLoading || historyPage <= 1" @click="historyPrev">
              上一页
            </button>
            <button
              type="button"
              class="btn-ghost btn-ghost--sm"
              :disabled="listLoading || historyPage >= (historyPages || 1)"
              @click="historyNext"
            >
              下一页
            </button>
          </div>
        </div>
        <p v-if="listLoading && !historyList.length" class="empty empty--soft">
          正在加载记录…
        </p>
        <p v-else-if="!listLoading && !historyList.length" class="empty empty--soft">
          暂无记录。可调整筛选条件后重试。
        </p>
        <div v-else class="hist-rec-scroll bccr-scroll-slim">
          <ul class="hist-rec-list">
            <li
              v-for="(row, idx) in historyList"
              :key="`${pickAuditCaseId(row)}-${idx}-${historyRowTime(row)}`"
              class="hist-rec"
            >
            <div class="hist-rec__head">
              <span
                class="hist-rec__badge"
                :class="`tone-${formatAuditHistoryBadge(row).tone}`"
              >
                {{ formatAuditHistoryBadge(row).label }}
              </span>
              <time class="hist-rec__time" :datetime="String(historyRowTime(row) || '')">{{
                formatTime(historyRowTime(row))
              }}</time>
            </div>
            <h3 class="hist-rec__title">{{ historyWorkDisplayTitle(row) }}</h3>
            <p class="hist-rec__author">
              <span class="hist-rec__k">作者</span>
              <span class="hist-rec__v">{{ pickWorkAuthorLabel(row) || '—' }}</span>
            </p>
            <div class="hist-rec__workid">
              <span class="hist-rec__k">作品编号</span>
              <button
                v-if="pickWorkId(row)"
                type="button"
                class="hist-rec__id-btn mono"
                @click="goWork(pickWorkId(row))"
              >
                {{ pickWorkId(row) }}
              </button>
              <span v-else class="hist-rec__v muted">—</span>
            </div>
            <dl class="hist-rec__meta">
              <div v-if="pickAuditCaseId(row)" class="hist-rec__meta-row">
                <dt>关联单号</dt>
                <dd class="mono">{{ pickAuditCaseId(row) }}</dd>
              </div>
              <div v-if="pickAuditLogAddress(row) || pickAuditOperator(row)" class="hist-rec__meta-row">
                <dt>处理人</dt>
                <dd>{{ historyOperatorDisplay(row) }}</dd>
              </div>
            </dl>
            <p v-if="pickAuditRemark(row)" class="hist-rec__remark">
              <span class="hist-rec__remark-k">备注</span>
              {{ pickAuditRemark(row) }}
            </p>
            </li>
          </ul>
        </div>
      </section>

      <div
        v-if="hasPendingAction"
        class="action-dock"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dock-title"
        @click.self="!actionSubmitting && cancelAction()"
      >
        <div class="dock-inner" @click.stop>
          <h3 id="dock-title" class="dock-title">
            {{ pendingAction?.type === 'approve' ? '确认通过' : '确认驳回' }}
          </h3>
          <p class="dock-sub mono">
            单号 {{ pickAuditCaseId(pendingAction?.row ?? {}) }} · 作品
            {{ pickWorkId(pendingAction?.row ?? {}) || '—' }}
          </p>
          <div class="dock-extra">
            <button
              type="button"
              class="btn-dock-link"
              :disabled="!pickWorkId(pendingAction?.row ?? {})"
              @click="goSimilarityRecordsForWork(pickWorkId(pendingAction?.row ?? {}))"
            >
              查看该作品相似度对比记录
            </button>
            <span v-if="!pickWorkId(pendingAction?.row ?? {})" class="dock-extra-hint">当前行无作品 ID</span>
          </div>
          <label class="dock-label">
            <span>备注（可选）</span>
            <textarea
              v-model="actionNote"
              class="dock-area"
              rows="2"
              placeholder="对内备注或对外说明，将随请求提交"
            />
          </label>
          <div class="dock-btns">
            <button type="button" class="btn-cancel" :disabled="actionSubmitting" @click="cancelAction">
              取消
            </button>
            <button
              type="button"
              class="btn-ok"
              :class="{ danger: pendingAction?.type === 'reject' }"
              :disabled="actionSubmitting"
              @click="confirmAction"
            >
              {{ actionSubmitting ? '提交中…' : '确认提交' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.audit-shell {
  width: 100%;
  display: flex;
  justify-content: center;
  padding: 0.5rem 0 2.5rem;
  box-sizing: border-box;
}

.audit-page {
  width: 100%;
  max-width: 820px;
  position: relative;
}

.hero {
  position: relative;
  margin-bottom: 1.35rem;
}

.hero-aura {
  position: absolute;
  width: 280px;
  height: 240px;
  left: -60px;
  top: -100px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgba(244, 114, 182, 0.2) 0%,
    rgba(167, 139, 250, 0.08) 45%,
    transparent 70%
  );
  pointer-events: none;
}

.title {
  position: relative;
  z-index: 1;
  margin: 0 0 0.4rem;
  font-size: 1.55rem;
  font-weight: 780;
  letter-spacing: -0.02em;
  background: linear-gradient(118deg, #fce7f3 0%, #f472b6 38%, #a78bfa 72%, #e2e8f0 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.lead {
  position: relative;
  z-index: 1;
  margin: 0 0 1rem;
  font-size: 0.9rem;
  line-height: 1.6;
  color: var(--bccr-muted);
  max-width: 40rem;
}

.tabs {
  position: relative;
  z-index: 1;
  display: flex;
  gap: 0.45rem;
  padding: 0.32rem;
  border-radius: 0.9rem;
  border: 1px solid rgba(244, 114, 182, 0.22);
  background: var(--bccr-panel-bg);
  backdrop-filter: blur(10px);
}

.tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.65rem 0.8rem;
  border: none;
  border-radius: 0.55rem;
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--bccr-muted);
  background: transparent;
  cursor: pointer;
  transition:
    background 0.16s,
    color 0.16s,
    box-shadow 0.16s;
}

.tab:hover {
  color: #db2777;
}

.tab.active {
  color: #9d174d;
  background: linear-gradient(135deg, rgba(236, 72, 153, 0.42), rgba(139, 92, 246, 0.32));
  box-shadow: 0 4px 22px rgba(236, 72, 153, 0.18);
}

.tab-ic {
  opacity: 0.88;
  font-size: 0.82rem;
}

.banner-err {
  margin: 0 0 1rem;
  padding: 0.55rem 0.75rem;
  border-radius: 0.5rem;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(248, 113, 113, 0.28);
  color: var(--bccr-danger);
  font-size: 0.86rem;
}

.panel {
  padding: 1.25rem 1.35rem;
  border-radius: 1rem;
  border: 1px solid rgba(244, 114, 182, 0.14);
  background: var(--bccr-card);
  box-shadow: 0 0 0 1px rgba(167, 139, 250, 0.05), 0 18px 48px var(--bccr-hover);
}

.panel--muted {
  border-color: rgba(148, 163, 184, 0.14);
  box-shadow: 0 0 0 1px rgba(148, 163, 184, 0.06), 0 14px 40px var(--bccr-hover);
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.panel-head--split {
  align-items: flex-start;
}

.panel-sub {
  margin: 0.3rem 0 0;
  font-size: 0.78rem;
  line-height: 1.45;
  color: var(--bccr-muted);
  max-width: 26rem;
}

.h2 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 650;
}

.empty {
  margin: 0;
  padding: 2rem 1rem;
  text-align: center;
  color: var(--bccr-muted);
  font-size: 0.9rem;
  line-height: 1.55;
}

.empty--soft {
  padding: 1.5rem 1rem;
  font-size: 0.86rem;
}

.empty-ic {
  display: block;
  font-size: 1.4rem;
  margin-bottom: 0.4rem;
  opacity: 0.35;
}

.case-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.case-list--dense {
  gap: 0.65rem;
}

.case-card {
  padding: 1.05rem 1.15rem;
  border-radius: 0.85rem;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: linear-gradient(155deg, var(--bccr-surface-muted), var(--bccr-surface-muted));
  border-left: 4px solid rgba(244, 114, 182, 0.55);
}

.case-card--flat {
  padding: 0.75rem 1rem;
  border-left-width: 3px;
  border-left-color: rgba(148, 163, 184, 0.35);
}

.case-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.55rem;
}

.pill-status {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.18rem 0.55rem;
  border-radius: 999px;
  border: 1px solid transparent;
}

.pill-status.tone-warn {
  background: rgba(251, 191, 36, 0.12);
  border-color: rgba(251, 191, 36, 0.35);
  color: var(--bccr-warning-text);
}

.pill-status.tone-info {
  background: var(--bccr-accent-soft);
  border-color: rgba(96, 165, 250, 0.3);
  color: var(--bccr-pill-text);
}

.pill-status.tone-ok {
  background: rgba(34, 197, 94, 0.12);
  border-color: rgba(74, 222, 128, 0.32);
  color: var(--bccr-success-text);
}

.pill-status.tone-bad {
  background: rgba(248, 113, 113, 0.1);
  border-color: rgba(248, 113, 113, 0.28);
  color: var(--bccr-danger);
}

.pill-status.tone-muted {
  background: var(--bccr-hover);
  border-color: rgba(148, 163, 184, 0.22);
  color: var(--bccr-muted);
}

.pill-status--sm {
  font-size: 0.68rem;
  padding: 0.14rem 0.45rem;
}

.hist-toolbar {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  margin-bottom: 0.85rem;
  padding: 0.65rem 0.75rem;
  border-radius: 0.65rem;
  border: 1px solid rgba(148, 163, 184, 0.12);
  background: var(--bccr-surface-muted);
}

.hist-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 0.75rem;
  align-items: flex-end;
}

.hist-field {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 5.5rem;
}

.hist-field--grow {
  flex: 1 1 10rem;
  min-width: 8rem;
}

.hist-label {
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--bccr-muted);
  letter-spacing: 0.02em;
}

.hist-input {
  font-size: 0.82rem;
  padding: 0.38rem 0.5rem;
  border-radius: 0.45rem;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: var(--bccr-panel-bg);
  color: var(--bccr-text);
}

.hist-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.hist-hint {
  margin: 0 0 0.65rem;
  font-size: 0.82rem;
  color: var(--bccr-muted);
}

.hist-pagination {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.65rem;
  font-size: 0.8rem;
  color: var(--bccr-muted);
}

.hist-rec-scroll {
  max-height: min(52vh, 480px);
  overflow-y: auto;
  overflow-x: hidden;
  margin-top: 0.25rem;
  padding-right: 0.2rem;
}

.hist-page-btns {
  display: flex;
  gap: 0.35rem;
}

.btn-ghost--sm {
  padding: 0.28rem 0.55rem;
  font-size: 0.78rem;
}

/* —— 审核记录列表（处理记录）—— */
.hist-rec-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.hist-rec {
  position: relative;
  padding: 1rem 1.05rem 1rem 1.15rem;
  border-radius: 0.9rem;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: linear-gradient(135deg, var(--bccr-surface-muted), var(--bccr-card));
  box-shadow: 0 8px 28px var(--bccr-hover);
  overflow: hidden;
}

.hist-rec::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  border-radius: 0.9rem 0 0 0.9rem;
  background: linear-gradient(180deg, #f472b6, #a78bfa);
  opacity: 0.85;
}

.hist-rec__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.65rem;
  margin-bottom: 0.55rem;
}

.hist-rec__badge {
  font-size: 0.72rem;
  font-weight: 750;
  letter-spacing: 0.04em;
  padding: 0.2rem 0.58rem;
  border-radius: 999px;
  border: 1px solid transparent;
}

.hist-rec__badge.tone-warn {
  background: rgba(251, 191, 36, 0.14);
  border-color: rgba(251, 191, 36, 0.38);
  color: var(--bccr-warning-text);
}

.hist-rec__badge.tone-info {
  background: rgba(59, 130, 246, 0.14);
  border-color: rgba(96, 165, 250, 0.32);
  color: var(--bccr-pill-text);
}

.hist-rec__badge.tone-ok {
  background: rgba(34, 197, 94, 0.14);
  border-color: rgba(74, 222, 128, 0.34);
  color: var(--bccr-success-text);
}

.hist-rec__badge.tone-bad {
  background: rgba(248, 113, 113, 0.12);
  border-color: rgba(248, 113, 113, 0.3);
  color: var(--bccr-danger);
}

.hist-rec__badge.tone-muted {
  background: rgba(148, 163, 184, 0.12);
  border-color: rgba(148, 163, 184, 0.24);
  color: var(--bccr-muted);
}

.hist-rec__time {
  font-size: 0.76rem;
  font-variant-numeric: tabular-nums;
  color: var(--bccr-muted);
  white-space: nowrap;
}

.hist-rec__title {
  margin: 0 0 0.4rem;
  font-size: 1.02rem;
  font-weight: 720;
  line-height: 1.35;
  color: #9d174d;
  letter-spacing: -0.01em;
}

.hist-rec__author {
  margin: 0 0 0.45rem;
  font-size: 0.84rem;
  line-height: 1.45;
  color: var(--bccr-text);
}

.hist-rec__k {
  display: inline-block;
  min-width: 3.5rem;
  margin-right: 0.35rem;
  font-size: 0.72rem;
  font-weight: 650;
  color: var(--bccr-muted);
  letter-spacing: 0.03em;
}

.hist-rec__v {
  color: var(--bccr-text);
}

.hist-rec__workid {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem 0.5rem;
  margin-bottom: 0.5rem;
  font-size: 0.8rem;
}

.hist-rec__id-btn {
  padding: 0.12rem 0.35rem;
  margin: 0;
  border: none;
  border-radius: 0.35rem;
  background: rgba(244, 114, 182, 0.12);
  color: #db2777;
  font-size: 0.78rem;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.hist-rec__id-btn:hover {
  background: rgba(244, 114, 182, 0.2);
  color: #9d174d;
}

.hist-rec__meta {
  margin: 0;
  padding: 0.55rem 0 0;
  border-top: 1px dashed rgba(148, 163, 184, 0.18);
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.hist-rec__meta-row {
  display: grid;
  grid-template-columns: 4.25rem 1fr;
  gap: 0.35rem 0.5rem;
  font-size: 0.78rem;
  align-items: baseline;
}

.hist-rec__meta-row dt {
  margin: 0;
  color: var(--bccr-muted);
  font-weight: 600;
}

.hist-rec__meta-row dd {
  margin: 0;
  color: var(--bccr-muted);
  word-break: break-all;
}

.hist-rec__remark {
  margin: 0.55rem 0 0;
  padding: 0.5rem 0.55rem;
  border-radius: 0.45rem;
  font-size: 0.78rem;
  line-height: 1.45;
  color: var(--bccr-text);
  background: var(--bccr-hover);
  border: 1px solid rgba(148, 163, 184, 0.12);
}

.hist-rec__remark-k {
  display: block;
  margin-bottom: 0.2rem;
  font-size: 0.68rem;
  font-weight: 650;
  color: var(--bccr-muted);
  letter-spacing: 0.04em;
}

.case-id {
  font-size: 0.74rem;
  color: var(--bccr-label);
}

.case-title {
  margin: 0 0 0.65rem;
  font-size: 1.02rem;
  font-weight: 700;
  color: #9d174d;
  line-height: 1.35;
}

.case-meta {
  display: grid;
  grid-template-columns: 4.5rem 1fr;
  gap: 0.35rem 0.6rem;
  font-size: 0.82rem;
  margin-bottom: 0.35rem;
  align-items: baseline;
}

.meta-k {
  color: var(--bccr-muted);
}

.meta-v {
  color: var(--bccr-text);
  word-break: break-all;
}

.meta-v.muted {
  color: var(--bccr-muted);
}

.link-work {
  padding: 0;
  border: none;
  background: none;
  font-size: 0.82rem;
  color: #f9a8d4;
  cursor: pointer;
  text-align: left;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.link-work:hover {
  color: #9d174d;
}

.reason-block {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid rgba(148, 163, 184, 0.1);
  display: flex;
  gap: 0.65rem;
  align-items: flex-start;
}

.reason-label {
  flex-shrink: 0;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(244, 114, 182, 0.85);
  padding-top: 0.15rem;
}

.reason-body {
  min-width: 0;
}

.reason-code {
  display: inline-block;
  font-size: 0.82rem;
  font-weight: 650;
  color: #db2777;
}

.reason-detail {
  margin: 0.35rem 0 0;
  font-size: 0.8rem;
  line-height: 1.5;
  color: var(--bccr-muted);
}

.reason-raw {
  margin: 0.25rem 0 0;
  font-size: 0.78rem;
  color: var(--bccr-muted);
}

.case-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  margin-top: 1rem;
}

.btn-pass {
  padding: 0.48rem 1.15rem;
  border-radius: 0.5rem;
  border: none;
  font-size: 0.86rem;
  font-weight: 700;
  color: #052e16;
  cursor: pointer;
  background: linear-gradient(135deg, #4ade80, #16a34a);
  box-shadow: 0 4px 16px rgba(34, 197, 94, 0.22);
  transition: filter 0.12s;
}

.btn-pass:hover:not(:disabled) {
  filter: brightness(1.05);
}

.btn-deny {
  padding: 0.48rem 1.15rem;
  border-radius: 0.5rem;
  border: 1px solid var(--bccr-btn-danger-border);
  font-size: 0.86rem;
  font-weight: 700;
  color: var(--bccr-danger);
  cursor: pointer;
  background: rgba(248, 113, 113, 0.1);
  transition:
    background 0.12s,
    border-color 0.12s;
}

.btn-deny:hover:not(:disabled) {
  background: rgba(248, 113, 113, 0.16);
}

.btn-pass:disabled,
.btn-deny:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.case-time {
  font-size: 0.78rem;
  color: var(--bccr-muted);
}

.hist-line {
  margin: 0.25rem 0 0;
  font-size: 0.8rem;
  color: var(--bccr-text);
}

.link-inline {
  padding: 0;
  border: none;
  background: none;
  color: #f9a8d4;
  cursor: pointer;
  text-decoration: underline;
  font-size: inherit;
}

.muted {
  color: var(--bccr-muted);
}

.action-dock {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  padding-bottom: max(1rem, env(safe-area-inset-bottom, 0));
  box-sizing: border-box;
  background: rgba(12, 18, 34, 0.72);
  backdrop-filter: blur(8px);
}

.dock-inner {
  width: 100%;
  max-width: 480px;
  max-height: min(90vh, 560px);
  overflow: auto;
  padding: 1.15rem 1.2rem;
  border-radius: 0.9rem;
  border: 1px solid rgba(244, 114, 182, 0.28);
  background: var(--bccr-surface);
  box-shadow: 0 24px 64px var(--bccr-overlay);
}

.dock-title {
  margin: 0 0 0.25rem;
  font-size: 1rem;
  font-weight: 700;
  color: #9d174d;
}

.dock-sub {
  margin: 0 0 0.5rem;
  font-size: 0.76rem;
  color: var(--bccr-muted);
}

.dock-extra {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 0.65rem;
  margin-bottom: 0.75rem;
}

.btn-dock-link {
  padding: 0.35rem 0.65rem;
  border-radius: 0.45rem;
  border: 1px solid var(--bccr-accent-border);
  background: var(--bccr-accent-soft);
  color: var(--bccr-pill-text);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s;
}

.btn-dock-link:hover:not(:disabled) {
  background: var(--bccr-pill-bg);
  border-color: rgba(147, 197, 253, 0.45);
}

.btn-dock-link:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.dock-extra-hint {
  font-size: 0.72rem;
  color: var(--bccr-muted);
}

.dock-label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.76rem;
  color: var(--bccr-muted);
}

.dock-area {
  resize: vertical;
  min-height: 2.75rem;
  padding: 0.5rem 0.6rem;
  border-radius: 0.45rem;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(0, 0, 0, 0.25);
  color: var(--bccr-text);
  font-family: inherit;
  font-size: 0.86rem;
}

.dock-area:focus {
  outline: none;
  border-color: rgba(244, 114, 182, 0.45);
  box-shadow: 0 0 0 2px rgba(236, 72, 153, 0.12);
}

.dock-btns {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.85rem;
}

.btn-cancel {
  padding: 0.42rem 0.9rem;
  border-radius: 0.45rem;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: transparent;
  color: var(--bccr-muted);
  font-size: 0.84rem;
  font-weight: 600;
  cursor: pointer;
}

.btn-ok {
  padding: 0.42rem 1rem;
  border-radius: 0.45rem;
  border: none;
  font-size: 0.84rem;
  font-weight: 700;
  color: #fff;
  cursor: pointer;
  background: linear-gradient(135deg, #059669, #0d9488);
}

.btn-ok.danger {
  background: linear-gradient(135deg, #dc2626, #b91c1c);
}

.btn-cancel:disabled,
.btn-ok:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.mono {
  font-family: ui-monospace, monospace;
}
</style>
