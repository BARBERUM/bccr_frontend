<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import * as auditApi from '@/api/audit'
import {
  formatAuditStatus,
  pickAuditCaseId,
  pickReasonRaw,
  pickReporter,
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
const historyLoaded = ref(false)

/** @type {import('vue').Ref<{ type: 'approve' | 'reject'; row: Record<string, unknown> } | null>} */
const pendingAction = ref(null)
const actionNote = ref('')
const actionSubmitting = ref(false)

const hasPendingAction = computed(() => pendingAction.value != null)

watch(mainTab, (t) => {
  listError.value = ''
  if (t === 'history' && !historyLoaded.value) {
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
  const w = String(id ?? '').trim()
  if (!w) return
  router.push({ name: 'work-detail', params: { workId: w } })
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
  const id = pickAuditCaseId(ctx.row)
  if (!id) {
    listError.value = '缺少审核单 ID'
    return
  }
  actionSubmitting.value = true
  listError.value = ''
  try {
    const note = actionNote.value.trim()
    if (ctx.type === 'approve') {
      await auditApi.approveAuditCase(id, note ? { remark: note } : {})
    } else {
      await auditApi.rejectAuditCase(id, note ? { remark: note } : {})
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

async function loadHistory() {
  listLoading.value = true
  listError.value = ''
  try {
    const data = await auditApi.fetchAuditHistory({ page: historyPage.value })
    historyList.value = auditApi.normalizeAuditList(data)
    historyLoaded.value = true
  } catch (e) {
    listError.value = e?.message || '加载记录失败（若后端未实现 history 接口可忽略）'
    historyList.value = []
    historyLoaded.value = true
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
        <div class="panel-head">
          <h2 class="h2">最近处理</h2>
          <button type="button" class="btn-ghost" :disabled="listLoading" @click="loadHistory">
            {{ listLoading ? '加载中…' : '重新加载' }}
          </button>
        </div>
        <p v-if="listLoading && !historyList.length" class="empty empty--soft">
          正在加载记录…
        </p>
        <p v-else-if="!listLoading && !historyList.length" class="empty empty--soft">
          暂无记录，或接口 <code class="mono">GET /api/audit/history</code> 尚未开放。
        </p>
        <ul v-else class="case-list case-list--dense">
          <li
            v-for="row in historyList"
            :key="pickAuditCaseId(row) + String(row.updatedAt ?? row.resolvedAt ?? '')"
            class="case-card case-card--flat"
          >
            <div class="case-top">
              <span
                class="pill-status"
                :class="`tone-${formatAuditStatus(row.status ?? row.state).tone}`"
              >
                {{ formatAuditStatus(row.status ?? row.state).label }}
              </span>
              <span class="case-time">{{ formatTime(row.updatedAt ?? row.resolvedAt ?? row.createdAt) }}</span>
            </div>
            <p class="hist-line">
              <span class="mono">{{ pickAuditCaseId(row) }}</span>
              ·
              <button v-if="pickWorkId(row)" type="button" class="link-inline mono" @click="goWork(pickWorkId(row))">
                {{ pickWorkId(row) }}
              </button>
              <span v-else class="muted">—</span>
            </p>
          </li>
        </ul>
      </section>

      <div v-if="hasPendingAction" class="action-dock" role="dialog" aria-modal="true" aria-labelledby="dock-title">
        <div class="dock-inner">
          <h3 id="dock-title" class="dock-title">
            {{ pendingAction?.type === 'approve' ? '确认通过' : '确认驳回' }}
          </h3>
          <p class="dock-sub mono">
            单号 {{ pickAuditCaseId(pendingAction?.row ?? {}) }} · 作品
            {{ pickWorkId(pendingAction?.row ?? {}) || '—' }}
          </p>
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
  background: rgba(15, 23, 42, 0.55);
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
  color: #fbcfe8;
}

.tab.active {
  color: #fdf2f8;
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
  color: #fecaca;
  font-size: 0.86rem;
}

.panel {
  padding: 1.25rem 1.35rem;
  border-radius: 1rem;
  border: 1px solid rgba(244, 114, 182, 0.14);
  background: rgba(15, 23, 42, 0.48);
  box-shadow: 0 0 0 1px rgba(167, 139, 250, 0.05), 0 18px 48px rgba(0, 0, 0, 0.2);
}

.panel--muted {
  border-color: rgba(148, 163, 184, 0.14);
  box-shadow: 0 0 0 1px rgba(148, 163, 184, 0.06), 0 14px 40px rgba(0, 0, 0, 0.18);
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.h2 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 650;
}

.btn-ghost {
  padding: 0.38rem 0.75rem;
  border-radius: 0.45rem;
  border: 1px solid rgba(244, 114, 182, 0.35);
  background: rgba(236, 72, 153, 0.08);
  color: #fbcfe8;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    background 0.12s,
    border-color 0.12s;
}

.btn-ghost:hover:not(:disabled) {
  background: rgba(236, 72, 153, 0.14);
}

.btn-ghost:disabled {
  opacity: 0.45;
  cursor: not-allowed;
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
  background: linear-gradient(155deg, rgba(30, 41, 59, 0.55), rgba(15, 23, 42, 0.38));
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
  color: #fde68a;
}

.pill-status.tone-info {
  background: rgba(59, 130, 246, 0.12);
  border-color: rgba(96, 165, 250, 0.3);
  color: #bfdbfe;
}

.pill-status.tone-ok {
  background: rgba(34, 197, 94, 0.12);
  border-color: rgba(74, 222, 128, 0.32);
  color: #bbf7d0;
}

.pill-status.tone-bad {
  background: rgba(248, 113, 113, 0.1);
  border-color: rgba(248, 113, 113, 0.28);
  color: #fecaca;
}

.pill-status.tone-muted {
  background: rgba(148, 163, 184, 0.1);
  border-color: rgba(148, 163, 184, 0.22);
  color: #cbd5e1;
}

.case-id {
  font-size: 0.74rem;
  color: rgba(148, 163, 184, 0.95);
}

.case-title {
  margin: 0 0 0.65rem;
  font-size: 1.02rem;
  font-weight: 700;
  color: #fdf2f8;
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
  color: #e2e8f0;
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
  color: #fce7f3;
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
  color: #fbcfe8;
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
  border: 1px solid rgba(248, 113, 113, 0.45);
  font-size: 0.86rem;
  font-weight: 700;
  color: #fecaca;
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
  color: #e2e8f0;
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
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 50;
  display: flex;
  justify-content: center;
  padding: 0.75rem 1rem calc(0.75rem + env(safe-area-inset-bottom, 0));
  background: linear-gradient(180deg, transparent, rgba(12, 18, 34, 0.92) 20%);
  pointer-events: none;
}

.dock-inner {
  pointer-events: auto;
  width: 100%;
  max-width: 520px;
  padding: 1rem 1.15rem;
  border-radius: 0.85rem 0.85rem 0 0;
  border: 1px solid rgba(244, 114, 182, 0.25);
  border-bottom: none;
  background: rgba(15, 23, 42, 0.96);
  box-shadow: 0 -12px 40px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(14px);
}

.dock-title {
  margin: 0 0 0.25rem;
  font-size: 1rem;
  font-weight: 700;
  color: #fce7f3;
}

.dock-sub {
  margin: 0 0 0.75rem;
  font-size: 0.76rem;
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
