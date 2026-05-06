<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchTextFromUrl } from '@/api/client'
import * as reportApi from '@/api/report'
import * as workApi from '@/api/work'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const loading = ref(true)
const errorMsg = ref('')
const detail = ref(/** @type {ReturnType<typeof workApi.formatWorkDetail> | null} */ (null))

const textBodyLoading = ref(false)
const textBodyError = ref('')
const textBody = ref('')

const reportOpen = ref(false)
const reportReason = ref('SPAM')
const reportDetail = ref('')
const reportSubmitting = ref(false)
const reportErr = ref('')
const reportOk = ref('')

const REPORT_REASONS = [
  { value: 'ILLEGAL', label: '违法违规' },
  { value: 'INFRINGEMENT', label: '侵权抄袭' },
  { value: 'FAKE', label: '虚假信息' },
  { value: 'SPAM', label: '垃圾广告' },
  { value: 'OTHER', label: '其他' },
]

const workId = computed(() => String(route.params.workId || ''))

const imageMainSrc = computed(() => {
  const d = detail.value
  if (!d || d.kind !== 'image') return ''
  return d.displayImageUrl || d.cover || ''
})

const openFileHref = computed(() => {
  const d = detail.value
  if (!d) return ''
  return d.fileUrl || d.displayImageUrl || d.cover || ''
})

const textSourceUrl = computed(() => {
  const d = detail.value
  if (!d || d.kind !== 'text') return ''
  return d.filePath || d.fileUrl || ''
})

async function loadTextBody() {
  textBody.value = ''
  textBodyError.value = ''
  const url = textSourceUrl.value
  if (!url) return
  textBodyLoading.value = true
  try {
    textBody.value = await fetchTextFromUrl(url)
  } catch (e) {
    textBodyError.value = e?.message || '无法加载文本'
  } finally {
    textBodyLoading.value = false
  }
}

async function load() {
  const id = workId.value
  if (!id) {
    errorMsg.value = '无效的作品 ID'
    loading.value = false
    detail.value = null
    return
  }
  loading.value = true
  errorMsg.value = ''
  textBody.value = ''
  textBodyError.value = ''
  try {
    const raw = await workApi.fetchWorkDetail(id)
    detail.value = workApi.formatWorkDetail(
      /** @type {Record<string, unknown>} */ (typeof raw === 'object' && raw ? raw : {}),
    )
    await loadTextBody()
    try {
      await auth.refreshUser()
    } catch {
      /* 仍可用本地 auth.user 做本人作品判断 */
    }
  } catch (e) {
    errorMsg.value = e?.message || '加载失败'
    detail.value = null
  } finally {
    loading.value = false
  }
}

function formatTime(v) {
  if (v == null || v === '') return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return String(v)
  return d.toLocaleString('zh-CN')
}

function formatType(t) {
  if (!t) return '—'
  const map = { IMAGE: '图片', TEXT: '文本', VIDEO: '视频', AUDIO: '音频' }
  return map[t] ?? t
}

function goBack() {
  router.push({ name: 'works-square' })
}

function openReport() {
  if (isOwnWork.value) return
  reportErr.value = ''
  reportOk.value = ''
  reportReason.value = 'SPAM'
  reportDetail.value = ''
  reportOpen.value = true
}

function closeReport() {
  if (reportSubmitting.value) return
  reportOpen.value = false
}

async function submitReport() {
  const id = workId.value
  if (!id) return
  if (isOwnWork.value) {
    reportErr.value = '不能举报自己的作品'
    return
  }
  reportErr.value = ''
  reportOk.value = ''
  reportSubmitting.value = true
  try {
    await reportApi.submitWorkReport({
      workId: id,
      reason: reportReason.value,
      detail: reportDetail.value || undefined,
    })
    reportOk.value = '举报已提交，我们将尽快处理。'
    setTimeout(() => {
      reportOpen.value = false
      reportOk.value = ''
    }, 1600)
  } catch (e) {
    const status = /** @type {{ httpStatus?: number }} */ (e).httpStatus
    const low = String(e?.message || '').toLowerCase()
    if (status === 404 || low === 'not found') {
      try {
        await auth.refreshUser()
      } catch {
        /* ignore */
      }
      await nextTick()
      if (isOwnWork.value) {
        reportErr.value = '不能举报自己的作品'
        return
      }
      reportErr.value =
        '未找到举报接口（404）。若为本人作品请勿举报；否则请确认 POST /api/audit/{workId}/report'
      return
    }
    reportErr.value = e?.message || '提交失败'
  } finally {
    reportSubmitting.value = false
  }
}

const showImageViewer = computed(
  () => Boolean(detail.value?.kind === 'image' && imageMainSrc.value),
)

/** @param {unknown} v */
function normId(v) {
  if (v == null) return ''
  return String(v).trim().toLowerCase()
}

/** @param {Record<string, unknown>} raw */
function rawMarksCurrentUserOwn(raw) {
  if (!raw || typeof raw !== 'object') return false
  const o = /** @type {Record<string, unknown>} */ (raw)
  const keys = [
    'mine',
    'isMine',
    'selfOwned',
    'isOwner',
    'ownWork',
    'self',
    'currentUserWork',
  ]
  for (const k of keys) {
    const v = o[k]
    if (v === true) return true
    if (v === 1 || v === '1' || normId(v) === 'true') return true
  }
  return false
}

/**
 * 作品 authorAddress（或摘要里的 author）与登录用户 blockchainAddress 一致 → 本人作品，不可举报。
 * @param {Record<string, unknown>} raw
 * @param {string} authorFromSummary formatWorkSummary 的 author
 * @param {unknown} user
 */
function authorAddressMatchesBlockchain(raw, authorFromSummary, user) {
  if (!user || typeof user !== 'object') return false
  const u = /** @type {Record<string, unknown>} */ (user)
  const chain = normId(u.blockchainAddress ?? u.blockChainAddress)
  if (!chain) return false
  const workAddr = normId(
    raw.authorAddress ?? raw.author ?? authorFromSummary,
  )
  return Boolean(workAddr && workAddr === chain)
}

/** @param {Record<string, unknown>} u */
function collectUserIdentityHints(u) {
  const hints = /** @type {Set<string>} */ (new Set())
  const keys = [
    'id',
    'userId',
    'uid',
    'blockchainAddress',
    'blockChainAddress',
    'authorAddress',
    'walletAddress',
    'address',
    'chainAddress',
    'ethereumAddress',
    'username',
    'loginName',
    'account',
    'nickname',
    'nickName',
    'name',
    'wallet',
    'publicKey',
    'email',
  ]
  for (const k of keys) {
    const n = normId(u[k])
    if (n) hints.add(n)
  }
  return hints
}

/** @param {Record<string, unknown>} raw */
function collectWorkOwnerHints(raw) {
  const hints = /** @type {Set<string>} */ (new Set())
  const keys = [
    'authorAddress',
    'author',
    'authorName',
    'ownerAddress',
    'userAddress',
    'walletAddress',
    'ownerId',
    'userId',
    'creatorId',
    'authorId',
    'uid',
    'registerUserId',
    'createUserId',
    'submitterId',
    'publisherId',
    'createdBy',
    'createBy',
    'userName',
    'username',
    'creatorName',
  ]
  for (const k of keys) {
    const n = normId(raw[k])
    if (n) hints.add(n)
  }
  const nested = raw.user ?? raw.owner ?? raw.creator
  if (nested && typeof nested === 'object') {
    for (const h of collectUserIdentityHints(
      /** @type {Record<string, unknown>} */ (nested),
    )) {
      hints.add(h)
    }
  }
  return hints
}

/** 当前登录用户是否为作品登记作者（优先：authorAddress ↔ blockchainAddress） */
const isOwnWork = computed(() => {
  const d = detail.value
  const u = auth.user
  if (!d || !u || typeof u !== 'object') return false
  const raw =
    d.raw && typeof d.raw === 'object'
      ? /** @type {Record<string, unknown>} */ (d.raw)
      : {}
  if (authorAddressMatchesBlockchain(raw, d.author, u)) return true
  if (rawMarksCurrentUserOwn(raw)) return true
  const workHints = collectWorkOwnerHints(raw)
  const a = normId(d.author)
  if (a) workHints.add(a)

  const userHints = collectUserIdentityHints(
    /** @type {Record<string, unknown>} */ (u),
  )
  for (const h of workHints) {
    if (userHints.has(h)) return true
  }
  return false
})

const showHeroThumb = computed(() => {
  const d = detail.value
  if (!d) return false
  if (d.kind === 'image' && imageMainSrc.value) return false
  return Boolean(d.cover)
})

onMounted(load)

watch(workId, () => load())

watch(isOwnWork, (own) => {
  if (own) reportOpen.value = false
})
</script>

<template>
  <div class="detail">
    <header class="head">
      <div class="head-row">
        <button type="button" class="back" @click="goBack">← 返回广场</button>
        <button
          v-if="detail && !isOwnWork"
          type="button"
          class="btn-report"
          @click="openReport"
        >
          举报
        </button>
      </div>
    </header>

    <p v-if="loading" class="muted">加载中…</p>
    <p v-else-if="errorMsg" class="err">{{ errorMsg }}</p>

    <template v-else-if="detail">
      <section v-if="showImageViewer" class="viewer">
        <div class="viewer-frame">
          <img class="viewer-img" :src="imageMainSrc" :alt="detail.title" />
        </div>
        <p v-if="openFileHref" class="viewer-actions">
          <a
            :href="openFileHref"
            target="_blank"
            rel="noopener noreferrer"
            class="link-open"
          >
            在新标签页打开作品文件
          </a>
        </p>
      </section>

      <p
        v-else-if="detail.kind === 'image' && !imageMainSrc"
        class="warn-banner"
      >
        当前作品为图像类型，但接口未返回可访问的图片地址，无法预览。
      </p>

      <section v-if="detail.kind === 'text'" class="panel text-panel">
        <h2 class="h2">正文</h2>
        <p class="text-hint">
          根据详情中的文件地址请求正文；若与前端不同源请配置 CORS；需要鉴权时已自动附带 Token。
        </p>
        <p v-if="textBodyLoading" class="muted">正在加载文本…</p>
        <p v-else-if="!textSourceUrl" class="warn-banner soft">
          未返回可访问的 filePath / fileUrl，无法加载正文。
        </p>
        <p v-else-if="textBodyError" class="err">{{ textBodyError }}</p>
        <pre v-else class="text-body">{{ textBody }}</pre>
        <p v-if="textSourceUrl" class="text-foot">
          <a
            :href="textSourceUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="link"
          >
            在新标签页打开原文件
          </a>
        </p>
      </section>

      <section class="hero" :class="{ 'hero--full': showImageViewer }">
        <div v-if="showHeroThumb" class="cover">
          <img :src="detail.cover" alt="" />
        </div>
        <div v-else-if="detail.kind !== 'image' || !imageMainSrc" class="cover">
          <div class="cover-ph">{{ formatType(detail.type).charAt(0) || '作' }}</div>
        </div>
        <div class="hero-text">
          <h1 class="title">{{ detail.title }}</h1>
          <p class="line">
            <span class="pill">{{ formatType(detail.type) }}</span>
            <span v-if="detail.status" class="pill soft">{{ detail.status }}</span>
          </p>
          <p class="line muted-sm">作品 ID · {{ detail.id }}</p>
          <p v-if="detail.description" class="desc">{{ detail.description }}</p>
        </div>
      </section>

      <section class="panel">
        <h2 class="h2">链上与作者</h2>
        <dl class="dl">
          <dt>作者地址</dt>
          <dd class="mono">{{ detail.author || '—' }}</dd>
          <dt>指纹</dt>
          <dd class="mono wrap">{{ detail.fingerprint || '—' }}</dd>
          <dt>登记时间</dt>
          <dd>{{ formatTime(detail.createdAt) }}</dd>
          <dt v-if="detail.fileUrl">文件地址</dt>
          <dd v-if="detail.fileUrl">
            <a :href="detail.fileUrl" target="_blank" rel="noopener noreferrer" class="link">
              {{ detail.fileUrl }}
            </a>
          </dd>
        </dl>
      </section>
    </template>

    <Teleport to="body">
      <div
        v-if="reportOpen"
        class="modal-root"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-title"
      >
        <div class="modal-backdrop" @click.self="closeReport" />
        <div class="modal-panel">
          <h2 id="report-title" class="modal-title">举报作品</h2>
          <p class="modal-lead">
            作品 ID：<span class="mono">{{ workId }}</span>
          </p>
          <label class="modal-field">
            <span class="modal-lbl">原因</span>
            <select v-model="reportReason" class="modal-inp">
              <option v-for="r in REPORT_REASONS" :key="r.value" :value="r.value">
                {{ r.label }}
              </option>
            </select>
          </label>
          <label class="modal-field">
            <span class="modal-lbl">补充说明（选填，500 字内）</span>
            <textarea
              v-model="reportDetail"
              class="modal-inp modal-textarea"
              rows="4"
              maxlength="500"
              placeholder="请简要说明情况"
            />
          </label>
          <p v-if="reportErr" class="err modal-msg">{{ reportErr }}</p>
          <p v-if="reportOk" class="ok modal-msg">{{ reportOk }}</p>
          <div class="modal-actions">
            <button
              type="button"
              class="modal-btn ghost"
              :disabled="reportSubmitting"
              @click="closeReport"
            >
              取消
            </button>
            <button
              type="button"
              class="modal-btn primary"
              :disabled="reportSubmitting"
              @click="submitReport"
            >
              {{ reportSubmitting ? '提交中…' : '提交举报' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.detail {
  max-width: 880px;
}

.head {
  margin-bottom: 1rem;
}

.head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.btn-report {
  padding: 0.35rem 0.85rem;
  border-radius: 0.45rem;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid rgba(248, 113, 113, 0.45);
  background: rgba(239, 68, 68, 0.12);
  color: #fca5a5;
}

.btn-report:hover {
  background: rgba(239, 68, 68, 0.2);
}

.back {
  border: none;
  background: transparent;
  color: var(--bccr-accent);
  font-size: 0.9rem;
  cursor: pointer;
  padding: 0.25rem 0;
}

.back:hover {
  text-decoration: underline;
}

.muted {
  color: var(--bccr-muted);
}

.err {
  color: var(--bccr-danger);
}

.warn-banner {
  padding: 0.85rem 1rem;
  margin-bottom: 1rem;
  border-radius: 0.6rem;
  border: 1px solid rgba(251, 191, 36, 0.35);
  background: rgba(251, 191, 36, 0.08);
  color: #fcd34d;
  font-size: 0.88rem;
  line-height: 1.55;
}

.warn-banner.soft {
  margin-bottom: 0;
  font-size: 0.85rem;
}

.text-panel .text-hint {
  margin: 0 0 0.75rem;
  font-size: 0.78rem;
  color: var(--bccr-muted);
  line-height: 1.45;
}

.text-body {
  margin: 0;
  padding: 1rem 1.05rem;
  border-radius: 0.5rem;
  border: 1px solid rgba(148, 163, 184, 0.15);
  background: rgba(0, 0, 0, 0.22);
  font-size: 0.88rem;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: min(60vh, 520px);
  overflow: auto;
  font-family: ui-sans-serif, system-ui, sans-serif;
  color: #e2e8f0;
}

.text-foot {
  margin: 0.65rem 0 0;
  font-size: 0.85rem;
}

.viewer {
  margin-bottom: 1.25rem;
}

.viewer-frame {
  border-radius: 0.85rem;
  border: 1px solid var(--bccr-border);
  background: rgba(15, 23, 42, 0.85);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  max-height: min(72vh, 720px);
}

.viewer-img {
  display: block;
  max-width: 100%;
  max-height: min(72vh, 720px);
  width: auto;
  height: auto;
  object-fit: contain;
}

.viewer-actions {
  margin: 0.65rem 0 0;
  font-size: 0.88rem;
}

.link-open {
  color: var(--bccr-accent);
}

.hero {
  display: grid;
  grid-template-columns: minmax(0, 280px) 1fr;
  gap: 1.25rem;
  margin-bottom: 1.25rem;
  padding: 1.15rem;
  border-radius: 0.85rem;
  border: 1px solid var(--bccr-border);
  background: rgba(15, 23, 42, 0.45);
}

.hero--full {
  grid-template-columns: 1fr;
}

@media (max-width: 640px) {
  .hero:not(.hero--full) {
    grid-template-columns: 1fr;
  }
}

.cover {
  border-radius: 0.65rem;
  overflow: hidden;
  aspect-ratio: 4 / 3;
  background: rgba(30, 41, 59, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
}

.cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover-ph {
  font-size: 3rem;
  font-weight: 700;
  color: rgba(148, 163, 184, 0.35);
}

.title {
  margin: 0 0 0.65rem;
  font-size: 1.45rem;
  font-weight: 700;
  line-height: 1.3;
}

.line {
  margin: 0 0 0.45rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  align-items: center;
}

.muted-sm {
  font-size: 0.85rem;
  color: var(--bccr-muted);
}

.pill {
  display: inline-block;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  font-size: 0.78rem;
  background: rgba(59, 130, 246, 0.2);
  border: 1px solid rgba(96, 165, 250, 0.35);
  color: #bfdbfe;
}

.pill.soft {
  background: rgba(148, 163, 184, 0.15);
  border-color: rgba(148, 163, 184, 0.25);
  color: var(--bccr-muted);
}

.desc {
  margin: 0.75rem 0 0;
  font-size: 0.92rem;
  line-height: 1.6;
  color: #cbd5e1;
}

.panel {
  padding: 1.15rem 1.2rem;
  border-radius: 0.75rem;
  border: 1px solid var(--bccr-border);
  background: rgba(15, 23, 42, 0.35);
  margin-bottom: 1rem;
}

.h2 {
  margin: 0 0 0.85rem;
  font-size: 1rem;
  font-weight: 650;
}

.dl {
  display: grid;
  grid-template-columns: 7rem 1fr;
  gap: 0.5rem 1rem;
  margin: 0;
  font-size: 0.9rem;
}

.dl dt {
  margin: 0;
  color: var(--bccr-muted);
}

.dl dd {
  margin: 0;
}

.mono {
  font-family: ui-monospace, 'Cascadia Code', monospace;
  font-size: 0.82rem;
  word-break: break-all;
}

.mono.wrap {
  white-space: pre-wrap;
}

.link {
  color: var(--bccr-accent);
  word-break: break-all;
}

.modal-root {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.modal-backdrop {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(2px);
}

.modal-panel {
  position: relative;
  z-index: 1;
  width: min(100%, 420px);
  padding: 1.25rem 1.35rem;
  border-radius: 0.75rem;
  border: 1px solid var(--bccr-border);
  background: rgba(15, 23, 42, 0.97);
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.45);
}

.modal-title {
  margin: 0 0 0.5rem;
  font-size: 1.05rem;
  font-weight: 650;
}

.modal-lead {
  margin: 0 0 1rem;
  font-size: 0.82rem;
  color: var(--bccr-muted);
}

.modal-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-bottom: 0.9rem;
}

.modal-lbl {
  font-size: 0.78rem;
  color: var(--bccr-muted);
}

.modal-inp {
  padding: 0.45rem 0.55rem;
  border-radius: 0.45rem;
  border: 1px solid var(--bccr-border);
  background: rgba(15, 23, 42, 0.85);
  color: var(--bccr-text);
  font-size: 0.88rem;
}

.modal-inp:focus {
  outline: none;
  border-color: rgba(59, 130, 246, 0.45);
}

.modal-textarea {
  resize: vertical;
  min-height: 5rem;
  font-family: inherit;
  line-height: 1.5;
}

.modal-msg {
  margin: 0 0 0.75rem;
  font-size: 0.85rem;
}

.ok {
  color: #86efac;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
  margin-top: 0.25rem;
}

.modal-btn {
  padding: 0.45rem 0.95rem;
  border-radius: 0.45rem;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  border: none;
}

.modal-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.modal-btn.ghost {
  background: transparent;
  border: 1px solid var(--bccr-border);
  color: var(--bccr-muted);
}

.modal-btn.primary {
  background: linear-gradient(135deg, var(--bccr-accent), #6366f1);
  color: #fff;
}
</style>
