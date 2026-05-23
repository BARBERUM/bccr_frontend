<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import AuditComparePanel from '@/components/audit/AuditComparePanel.vue'
import BccrIcon from '@/components/icons/BccrIcon.vue'
import * as auditApi from '@/api/audit'
import * as userApi from '@/api/user'
import {
  fetchWorkDetail,
  fetchWorkOnChainByFingerprint,
  formatWorkDetail,
  normalizeWorkIdParam,
} from '@/api/work'
import {
  buildAuditCompareContext,
  formatAuditHistoryBadge,
  formatAuditSimilarity,
  formatAuditStatus,
  pickAuditCaseId,
  pickAuditLogAddress,
  pickAuditOperator,
  pickAuditRemark,
  normalizeOnChainRecord,
  pickMatchWorkId,
  pickReasonRaw,
  pickReporter,
  pickSimilarityValue,
  pickWorkAuthorLabel,
  pickWorkBlockTime,
  pickWorkFingerprint,
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

const actionNote = ref('')
const actionSubmitting = ref(false)

/** @type {import('vue').Ref<Record<string, unknown> | null>} */
const selectedRow = ref(null)
const detailLoading = ref(false)
/** @type {import('vue').Ref<ReturnType<typeof formatWorkDetail> | null>} */
const subjectDetail = ref(null)
/** @type {import('vue').Ref<ReturnType<typeof formatWorkDetail> | null>} */
const matchDetail = ref(null)
/** @type {import('vue').Ref<Record<string, unknown> | null>} */
const compareContext = ref(null)
/** @type {import('vue').Ref<Record<string, unknown> | null>} */
const onChainSubject = ref(null)
/** @type {import('vue').Ref<Record<string, unknown> | null>} */
const onChainMatch = ref(null)

const currentList = computed(() =>
  mainTab.value === 'pending' ? pendingList.value : historyList.value,
)

/** @param {Record<string, unknown>} row */
function auditRowKey(row) {
  const wid = pickWorkId(row)
  const cid = pickAuditCaseId(row)
  return wid ? `w:${wid}` : cid ? `c:${cid}` : ''
}

const selectedKey = computed(() =>
  selectedRow.value ? auditRowKey(selectedRow.value) : '',
)

const selectedIndex = computed(() => {
  if (!selectedKey.value) return -1
  return currentList.value.findIndex((r) => auditRowKey(r) === selectedKey.value)
})

const hasDetail = computed(() => Boolean(selectedRow.value))
const detailReadonly = computed(() => mainTab.value === 'history')
const hasQueueNext = computed(() => {
  if (mainTab.value !== 'pending') return false
  const i = selectedIndex.value
  return i >= 0 && i < pendingList.value.length - 1
})
const hasQueuePrev = computed(() => {
  if (mainTab.value !== 'pending') return false
  return selectedIndex.value > 0
})

const detailCompareContext = computed(() => {
  if (compareContext.value) return compareContext.value
  const row = selectedRow.value
  if (!row) return null
  const sim = pickSimilarityValue(row)
  const mid = pickMatchWorkId(row)
  return {
    similarity: sim,
    matchWorkId: mid,
    trigger: mainTab.value === 'history' ? 'history' : 'pending',
    similarityLabel: formatAuditSimilarity(sim),
  }
})

watch(mainTab, (t) => {
  listError.value = ''
  selectedRow.value = null
  clearDetailPayload()
  if (t === 'history') {
    loadHistory()
  } else {
    loadPending()
  }
})

function clearDetailPayload() {
  subjectDetail.value = null
  matchDetail.value = null
  compareContext.value = null
  onChainSubject.value = null
  onChainMatch.value = null
}

/** @param {Record<string, unknown>} row */
async function loadDetailForRow(row) {
  const workId = normalizeWorkIdParam(pickWorkId(row))
  if (!workId) {
    listError.value = '该行缺少业务作品 ID，无法加载比对详情'
    clearDetailPayload()
    return
  }
  detailLoading.value = true
  listError.value = ''
  clearDetailPayload()
  try {
    const raw = await fetchWorkDetail(workId)
    const rawObj =
      raw && typeof raw === 'object'
        ? /** @type {Record<string, unknown>} */ (raw)
        : {}
    subjectDetail.value = formatWorkDetail(rawObj)

    const fp = pickWorkFingerprint(rawObj) || subjectDetail.value.fingerprint
    if (fp) {
      try {
        const chain = await fetchWorkOnChainByFingerprint(fp)
        onChainSubject.value =
          chain && typeof chain === 'object'
            ? normalizeOnChainRecord(chain)
            : null
      } catch {
        onChainSubject.value = null
      }
    }

    let logs = []
    try {
      const logData = await auditApi.fetchWorkAuditLogs(workId)
      logs = auditApi.normalizeAuditList(logData)
    } catch {
      logs = []
    }
    compareContext.value = buildAuditCompareContext(rawObj, logs)

    const matchId = normalizeWorkIdParam(
      compareContext.value?.matchWorkId ?? pickMatchWorkId(row),
    )
    if (matchId) {
      try {
        const matchRaw = await fetchWorkDetail(matchId)
        const matchObj =
          matchRaw && typeof matchRaw === 'object'
            ? /** @type {Record<string, unknown>} */ (matchRaw)
            : {}
        matchDetail.value = formatWorkDetail(matchObj)
        const mfp = pickWorkFingerprint(matchObj) || matchDetail.value.fingerprint
        if (mfp) {
          try {
            const chainM = await fetchWorkOnChainByFingerprint(mfp)
            onChainMatch.value =
              chainM && typeof chainM === 'object'
                ? normalizeOnChainRecord(chainM)
                : null
          } catch {
            onChainMatch.value = null
          }
        }
      } catch {
        matchDetail.value = null
        onChainMatch.value = null
      }
    }
  } catch (e) {
    listError.value = e?.message || '加载作品比对资料失败'
    clearDetailPayload()
  } finally {
    detailLoading.value = false
  }
}

/** @param {Record<string, unknown>} row */
async function selectDetail(row) {
  selectedRow.value = row
  actionNote.value = ''
  await loadDetailForRow(row)
}

function closeDetail() {
  selectedRow.value = null
  actionNote.value = ''
  clearDetailPayload()
}

/** @param {number} delta */
async function stepQueue(delta) {
  const list = pendingList.value
  const i = selectedIndex.value
  const next = list[i + delta]
  if (next) await selectDetail(next)
}

async function goQueueNext() {
  await stepQueue(1)
}

async function goQueuePrev() {
  await stepQueue(-1)
}

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

/** @param {'approve' | 'reject'} type */
async function submitAudit(type) {
  const row = selectedRow.value
  if (!row || detailReadonly.value) return
  const workId = normalizeWorkIdParam(pickWorkId(row))
  if (!workId) {
    listError.value = '缺少业务作品 ID（如 work-…），无法提交审核。'
    return
  }
  actionSubmitting.value = true
  listError.value = ''
  const note = actionNote.value.trim()
  const body = note ? { remark: note } : {}
  try {
    if (type === 'approve') {
      await auditApi.approveAuditCase(workId, body)
    } else {
      await auditApi.rejectAuditCase(workId, body)
    }
    actionNote.value = ''
    const prevIdx = selectedIndex.value
    await loadPending()
    const list = pendingList.value
    if (!list.length) {
      closeDetail()
      return
    }
    const nextIdx = Math.min(Math.max(0, prevIdx), list.length - 1)
    await selectDetail(list[nextIdx])
  } catch (e) {
    listError.value = e?.message || '操作失败'
  } finally {
    actionSubmitting.value = false
  }
}

async function loadPending() {
  listLoading.value = true
  listError.value = ''
  const prevKey = selectedKey.value
  try {
    const data = await auditApi.fetchPendingAuditQueue()
    pendingList.value = auditApi.normalizeAuditList(data)
    if (mainTab.value !== 'pending') return
    if (!pendingList.value.length) {
      closeDetail()
      return
    }
    const keep = prevKey
      ? pendingList.value.find((r) => auditRowKey(r) === prevKey)
      : null
    if (keep) {
      await selectDetail(keep)
    } else if (!selectedRow.value) {
      await selectDetail(pendingList.value[0])
    }
  } catch (e) {
    listError.value = e?.message || '加载待办失败'
    pendingList.value = []
    closeDetail()
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
  const prevKey = selectedKey.value
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
      await restoreHistorySelection(prevKey)
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
    await restoreHistorySelection(prevKey)
  } catch (e) {
    listError.value = e?.message || '加载记录失败'
    historyList.value = []
    historyTotal.value = 0
    historyPages.value = 0
    closeDetail()
  } finally {
    listLoading.value = false
  }
}

/** @param {string} prevKey */
async function restoreHistorySelection(prevKey) {
  if (mainTab.value !== 'history') return
  if (!historyList.value.length) {
    closeDetail()
    return
  }
  const keep = prevKey
    ? historyList.value.find((r) => auditRowKey(r) === prevKey)
    : null
  if (keep) {
    await selectDetail(keep)
  } else if (!selectedRow.value) {
    await selectDetail(historyList.value[0])
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
          左侧选择待审作品，右侧查看双图比对、查重相似度与链上指纹；处理完成后可「下一项」继续队列，亦可在处理记录中回看详情。
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
            <span class="bccr-tab-ic-wrap" aria-hidden="true">
              <BccrIcon name="pending" size="sm" />
            </span>
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
            <span class="bccr-tab-ic-wrap" aria-hidden="true">
              <BccrIcon name="history" size="sm" />
            </span>
            处理记录
          </button>
        </div>
      </header>

      <p v-if="listError" class="banner-err">{{ listError }}</p>

      <div class="audit-workspace">
        <aside class="audit-list-pane panel" :class="{ 'panel--muted': mainTab === 'history' }">
          <div class="panel-head">
            <h2 class="h2">{{ mainTab === 'pending' ? '待审列表' : '记录列表' }}</h2>
            <button
              type="button"
              class="btn-ghost"
              :disabled="listLoading"
              @click="mainTab === 'pending' ? loadPending() : loadHistory()"
            >
              {{ listLoading ? '刷新中…' : '刷新' }}
            </button>
          </div>

          <template v-if="mainTab === 'history'">
            <div class="hist-toolbar hist-toolbar--inset">
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
                    placeholder="可选"
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
                <button type="button" class="btn-ghost btn-ghost--sm" @click="applyHistoryFilters">
                  筛选
                </button>
                <button
                  type="button"
                  class="btn-ghost btn-ghost--sm"
                  :disabled="listLoading || historyWorkFullMode"
                  @click="openWorkFullHistory"
                >
                  作品全部
                </button>
                <button
                  v-if="historyWorkFullMode"
                  type="button"
                  class="btn-ghost btn-ghost--sm"
                  @click="backToPagedHistory"
                >
                  返回分页
                </button>
              </div>
              <p v-if="historyWorkFullMode" class="hist-hint hist-hint--inset">
                作品 {{ historyWorkIdFilter }} 的全部记录（{{ historyTotal }} 条）
              </p>
            </div>
            <div v-if="!historyWorkFullMode && historyTotal > 0" class="hist-pagination hist-pagination--compact">
              <button type="button" class="btn-ghost btn-ghost--sm" :disabled="listLoading || historyPage <= 1" @click="historyPrev">
                ‹
              </button>
              <span class="hist-page-meta">{{ historyPage }}/{{ historyPages || 1 }}</span>
              <button
                type="button"
                class="btn-ghost btn-ghost--sm"
                :disabled="listLoading || historyPage >= (historyPages || 1)"
                @click="historyNext"
              >
                ›
              </button>
            </div>
          </template>

          <p v-if="listLoading && !currentList.length" class="empty empty--compact">
            正在加载…
          </p>
          <p v-else-if="!listLoading && !currentList.length" class="empty empty--compact">
            {{ mainTab === 'pending' ? '暂无待审作品' : '暂无记录' }}
          </p>
          <ul v-else class="case-list case-list--dense">
            <li
              v-for="(row, idx) in currentList"
              :key="`${auditRowKey(row)}-${idx}`"
              class="case-card case-card--flat"
              :class="{ 'case-card--active': auditRowKey(row) === selectedKey }"
              role="button"
              tabindex="0"
              @click="selectDetail(row)"
              @keydown.enter.prevent="selectDetail(row)"
            >
              <div class="case-top">
                <span
                  class="pill-status pill-status--sm"
                  :class="`tone-${mainTab === 'history' ? formatAuditHistoryBadge(row).tone : formatAuditStatus(row.status ?? row.state).tone}`"
                >
                  {{
                    mainTab === 'history'
                      ? formatAuditHistoryBadge(row).label
                      : formatAuditStatus(row.status ?? row.state).label
                  }}
                </span>
                <span v-if="pickSimilarityValue(row) != null" class="case-sim">
                  {{ formatAuditSimilarity(pickSimilarityValue(row)) }}
                </span>
              </div>
              <h3 class="case-title case-title--sm">
                {{ pickWorkTitle(row) || historyWorkDisplayTitle(row) || '未命名作品' }}
              </h3>
              <p class="case-line mono">{{ pickWorkId(row) || '—' }}</p>
              <p v-if="mainTab === 'pending'" class="case-line muted">
                {{ reasonCodeLabel(splitReasonDisplay(pickReasonRaw(row)).code) }}
              </p>
              <p v-else class="case-line muted">
                {{ formatTime(historyRowTime(row)) }}
              </p>
            </li>
          </ul>
        </aside>

        <main class="audit-detail-pane panel">
          <div v-if="!hasDetail" class="detail-empty">
            <p class="detail-empty-title">选择左侧条目</p>
            <p class="detail-empty-sub">
              将展示待审作品与对比作品预览、查重相似度、指纹与上链时间等信息。
            </p>
          </div>

          <template v-else>
            <header class="detail-head">
              <div class="detail-head-main">
                <span
                  class="pill-status"
                  :class="`tone-${detailReadonly ? formatAuditHistoryBadge(selectedRow).tone : formatAuditStatus(selectedRow?.status ?? selectedRow?.state).tone}`"
                >
                  {{
                    detailReadonly
                      ? formatAuditHistoryBadge(selectedRow).label
                      : formatAuditStatus(selectedRow?.status ?? selectedRow?.state).label
                  }}
                </span>
                <h2 class="detail-title">
                  {{ pickWorkTitle(selectedRow) || '未命名作品' }}
                </h2>
                <p class="detail-sub mono">
                  {{ pickWorkId(selectedRow) || '—' }}
                  <span v-if="pickAuditCaseId(selectedRow)">
                    · 单号 {{ pickAuditCaseId(selectedRow) }}
                  </span>
                </p>
              </div>
              <div class="detail-nav">
                <button
                  v-if="mainTab === 'pending'"
                  type="button"
                  class="btn-ghost btn-ghost--sm"
                  :disabled="!hasQueuePrev || detailLoading"
                  @click="goQueuePrev"
                >
                  上一项
                </button>
                <button
                  v-if="mainTab === 'pending'"
                  type="button"
                  class="btn-ghost btn-ghost--sm"
                  :disabled="!hasQueueNext || detailLoading"
                  @click="goQueueNext"
                >
                  下一项
                </button>
                <button type="button" class="btn-ghost btn-ghost--sm" @click="closeDetail">
                  关闭
                </button>
              </div>
            </header>

            <div class="reason-block reason-block--detail" v-if="selectedRow">
              <span class="reason-label">事由 / 备注</span>
              <div class="reason-body">
                <template v-if="mainTab === 'pending'">
                  <span class="reason-code">{{
                    reasonCodeLabel(splitReasonDisplay(pickReasonRaw(selectedRow)).code)
                  }}</span>
                  <p
                    v-if="splitReasonDisplay(pickReasonRaw(selectedRow)).detail"
                    class="reason-detail"
                  >
                    {{ splitReasonDisplay(pickReasonRaw(selectedRow)).detail }}
                  </p>
                </template>
                <p v-if="pickAuditRemark(selectedRow)" class="reason-detail">
                  {{ pickAuditRemark(selectedRow) }}
                </p>
                <p v-if="detailReadonly && historyOperatorDisplay(selectedRow)" class="reason-detail muted">
                  处理人：{{ historyOperatorDisplay(selectedRow) }}
                </p>
              </div>
            </div>

            <AuditComparePanel
              :subject-detail="subjectDetail"
              :match-detail="matchDetail"
              :compare-context="detailCompareContext"
              :on-chain-subject="onChainSubject"
              :on-chain-match="onChainMatch"
              :loading="detailLoading"
              :readonly="detailReadonly"
              @open-work="goWork"
            />

            <dl v-if="subjectDetail && !detailLoading" class="detail-extra-dl">
              <div class="dl-row">
                <dt>待审上链时间</dt>
                <dd>{{
                  formatTime(
                    pickWorkBlockTime(subjectDetail.raw ?? subjectDetail) ||
                      subjectDetail.createdAt,
                  )
                }}</dd>
              </div>
              <div v-if="matchDetail" class="dl-row">
                <dt>对比上链时间</dt>
                <dd>{{
                  formatTime(
                    pickWorkBlockTime(matchDetail.raw ?? matchDetail) || matchDetail.createdAt,
                  )
                }}</dd>
              </div>
            </dl>

            <footer v-if="!detailReadonly" class="detail-foot">
              <label class="dock-label">
                <span>审核备注（可选）</span>
                <textarea
                  v-model="actionNote"
                  class="dock-area"
                  rows="2"
                  placeholder="通过或驳回时一并提交"
                />
              </label>
              <div class="detail-foot-btns">
                <button
                  type="button"
                  class="btn-pass"
                  :disabled="actionSubmitting || detailLoading"
                  @click="submitAudit('approve')"
                >
                  {{ actionSubmitting ? '提交中…' : '通过' }}
                </button>
                <button
                  type="button"
                  class="btn-deny"
                  :disabled="actionSubmitting || detailLoading"
                  @click="submitAudit('reject')"
                >
                  驳回
                </button>
                <button
                  type="button"
                  class="btn-ghost"
                  :disabled="!hasQueueNext || actionSubmitting"
                  @click="goQueueNext"
                >
                  下一项
                </button>
              </div>
            </footer>
          </template>
        </main>
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
  max-width: 1280px;
  position: relative;
}

.audit-workspace {
  display: grid;
  grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
  gap: 1rem;
  align-items: stretch;
}

.audit-list-pane {
  display: flex;
  flex-direction: column;
  min-height: 28rem;
  max-height: calc(100vh - 12rem);
}

.audit-list-pane .case-list--dense {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  padding-right: 0.2rem;
}

.audit-detail-pane {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  min-height: 28rem;
  max-height: calc(100vh - 12rem);
  overflow-y: auto;
}

.detail-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 2rem 1.5rem;
  color: var(--bccr-muted);
}

.detail-empty-title {
  margin: 0 0 0.35rem;
  font-size: 1rem;
  font-weight: 650;
  color: var(--bccr-text-secondary);
}

.detail-empty-sub {
  margin: 0;
  font-size: 0.86rem;
  line-height: 1.55;
  max-width: 22rem;
}

.detail-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.65rem;
}

.detail-title {
  margin: 0.35rem 0 0.2rem;
  font-size: 1.15rem;
  font-weight: 700;
}

.detail-sub {
  margin: 0;
  font-size: 0.78rem;
  color: var(--bccr-muted);
}

.detail-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.reason-block--detail {
  margin: 0;
}

.detail-extra-dl {
  margin: 0;
  padding: 0.65rem 0.75rem;
  border-radius: 0.55rem;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: var(--bccr-surface-muted);
  display: grid;
  gap: 0.35rem;
}

.detail-extra-dl .dl-row {
  display: grid;
  grid-template-columns: 6.5rem 1fr;
  gap: 0.35rem;
  font-size: 0.8rem;
}

.detail-extra-dl dt {
  color: var(--bccr-muted);
  font-weight: 600;
}

.detail-extra-dl dd {
  margin: 0;
  color: var(--bccr-text);
}

.detail-foot {
  margin-top: auto;
  padding-top: 0.5rem;
  border-top: 1px solid rgba(148, 163, 184, 0.12);
}

.detail-foot-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin-top: 0.55rem;
}

.case-card--flat {
  cursor: pointer;
  transition:
    border-color 0.12s,
    background 0.12s,
    box-shadow 0.12s;
}

.case-card--flat:hover {
  border-color: rgba(244, 114, 182, 0.35);
}

.case-card--active {
  border-color: rgba(244, 114, 182, 0.55);
  background: linear-gradient(
    155deg,
    rgba(236, 72, 153, 0.1),
    var(--bccr-surface-muted)
  );
  box-shadow: 0 0 0 1px rgba(244, 114, 182, 0.2);
}

.case-title--sm {
  font-size: 0.9rem;
  margin-bottom: 0.2rem;
}

.case-line {
  margin: 0;
  font-size: 0.74rem;
  line-height: 1.4;
}

.case-line.muted {
  color: var(--bccr-muted);
}

.case-sim {
  font-size: 0.72rem;
  font-weight: 700;
  color: #be185d;
}

.empty--compact {
  padding: 1.25rem 0.5rem;
  font-size: 0.84rem;
}

.hist-toolbar--inset {
  margin-bottom: 0.65rem;
  padding: 0.5rem 0.55rem;
}

.hist-hint--inset {
  margin: 0.35rem 0 0;
  font-size: 0.75rem;
}

.hist-pagination--compact {
  margin-bottom: 0.5rem;
  padding: 0;
  background: transparent;
  border: none;
  justify-content: center;
  gap: 0.5rem;
}

@media (max-width: 960px) {
  .audit-workspace {
    grid-template-columns: 1fr;
  }

  .audit-list-pane,
  .audit-detail-pane {
    max-height: none;
    min-height: 0;
  }
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
