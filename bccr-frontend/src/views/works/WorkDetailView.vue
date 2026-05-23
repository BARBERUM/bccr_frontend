<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchTextFromUrl } from '@/api/client'
import * as reportApi from '@/api/report'
import * as workApi from '@/api/work'
import { useAuthStore } from '@/stores/auth'
import WorkMediaPlayer from '@/components/work/WorkMediaPlayer.vue'
import WorkInteractionPanel from '@/views/works/WorkInteractionPanel.vue'

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

const workId = computed(() => workApi.normalizeWorkIdParam(String(route.params.workId || '')))

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

const mediaPlayUrl = computed(() => {
  const d = detail.value
  if (!d || (d.kind !== 'video' && d.kind !== 'audio')) return ''
  return d.fileUrl || d.filePath || ''
})

const showVideoPlayer = computed(
  () => detail.value?.kind === 'video' && Boolean(mediaPlayUrl.value),
)

const showAudioPlayer = computed(
  () => detail.value?.kind === 'audio' && Boolean(mediaPlayUrl.value),
)

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
  onChainData.value = null
  onChainErr.value = ''
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

const onChainLoading = ref(false)
const onChainErr = ref('')
/** @type {import('vue').Ref<Record<string, unknown> | null>} */
const onChainData = ref(null)

const ONCHAIN_LABELS = {
  fingerprint: '指纹',
  workId: '作品 ID',
  workName: '作品名称',
  title: '标题',
  authorAddress: '作者地址',
  author: '作者',
  hash: '哈希',
  txHash: '交易哈希',
  transactionHash: '交易哈希',
  blockNumber: '区块号',
  chainId: '链 ID',
  timestamp: '时间戳',
  createTime: '创建时间',
  createdAt: '创建时间',
  blockHash: '区块哈希',
  contractAddress: '合约地址',
  contentHash: '内容哈希',
  owner: '所有者',
  ownerAddress: '所有者地址',
  uri: 'URI',
  tokenId: 'Token ID',
}

/** @param {string} k */
function labelOnChainField(k) {
  return ONCHAIN_LABELS[k] ?? k
}

/** @param {Record<string, unknown>} obj */
function flattenWorkInfoForDl(obj) {
  const rows = []
  for (const [k, v] of Object.entries(obj)) {
    if (v == null || v === '') continue
    let display
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      display = JSON.stringify(v)
    } else if (Array.isArray(v)) {
      display = v
        .map((x) => (typeof x === 'object' && x !== null ? JSON.stringify(x) : String(x)))
        .join('\n')
    } else {
      display = String(v)
    }
    rows.push({ key: k, label: labelOnChainField(k), value: display })
  }
  return rows
}

const onChainRows = computed(() => {
  const d = onChainData.value
  if (!d || typeof d !== 'object') return []
  return flattenWorkInfoForDl(/** @type {Record<string, unknown>} */ (d))
})

async function refreshOnChain() {
  const fp = String(detail.value?.fingerprint ?? '').trim()
  if (!fp) {
    onChainErr.value = '暂无指纹，无法查询链上记录'
    onChainData.value = null
    return
  }
  onChainLoading.value = true
  onChainErr.value = ''
  try {
    const raw = await workApi.fetchWorkOnChainByFingerprint(fp)
    onChainData.value =
      raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : {}
  } catch (e) {
    onChainErr.value = e?.message || '链上查询失败'
    onChainData.value = null
  } finally {
    onChainLoading.value = false
  }
}

watch(
  () => detail.value?.fingerprint,
  (fp) => {
    onChainData.value = null
    onChainErr.value = ''
    const s = String(fp ?? '').trim()
    if (!s) return
    void refreshOnChain()
  },
)

function goBack() {
  // 从审核、查重等子页 push 进入时，应回到来源页，而非固定去作品广场
  if (typeof window !== 'undefined' && window.history.length > 1) {
    router.back()
    return
  }
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
      reportErr.value = '暂无法提交举报。本人作品无法举报；若确需举报请联系管理员或稍后再试。'
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
  const keys = ['mine', 'isMine', 'selfOwned', 'isOwner', 'ownWork', 'currentUserWork']
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
/** @param {unknown} v */
function normChainAddress(v) {
  const s = String(v ?? '').trim()
  if (!/^0x[0-9a-fA-F]{40}$/.test(s)) return ''
  return s.toLowerCase()
}

function authorAddressMatchesBlockchain(raw, authorFromSummary, user) {
  if (!user || typeof user !== 'object') return false
  const u = /** @type {Record<string, unknown>} */ (user)
  const chain = normChainAddress(u.blockchainAddress ?? u.blockChainAddress)
  if (!chain) return false
  const workAddr =
    normChainAddress(raw.authorAddress) ||
    normChainAddress(raw.author) ||
    normChainAddress(authorFromSummary)
  return Boolean(workAddr && workAddr === chain)
}

/** 当前登录用户是否为作品登记作者（链上地址 / 用户 ID / 接口 mine 标记） */
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

  const uid = normId(
    /** @type {Record<string, unknown>} */ (u).id ??
      /** @type {Record<string, unknown>} */ (u).userId,
  )
  if (!uid) return false

  const ownerIds = [
    raw.userId,
    raw.ownerId,
    raw.creatorId,
    raw.authorId,
    raw.registerUserId,
    raw.createUserId,
    raw.submitterId,
    raw.publisherId,
    raw.createdBy,
    raw.createBy,
  ]
  for (const id of ownerIds) {
    if (uid === normId(id)) return true
  }

  const nested = raw.user ?? raw.owner ?? raw.creator
  if (nested && typeof nested === 'object') {
    const nestedId = normId(
      /** @type {Record<string, unknown>} */ (nested).id ??
        /** @type {Record<string, unknown>} */ (nested).userId,
    )
    if (nestedId && nestedId === uid) return true
  }

  return false
})

/** 是否展示举报入口（有详情即展示；本人作品为禁用态） */
const showReportButton = computed(() => Boolean(detail.value))

const showHeroThumb = computed(() => {
  const d = detail.value
  if (!d) return false
  if (d.kind === 'image' && imageMainSrc.value) return false
  if (d.kind === 'video' || d.kind === 'audio') return false
  return Boolean(d.cover)
})

/** 作者展示名：优先 authorName，其次非链上地址形态的 author 字段 */
const displayAuthorName = computed(() => {
  const d = detail.value
  if (!d) return ''
  const n = String(d.authorName || '').trim()
  if (n) return n
  const a = String(d.author || '').trim()
  if (!a) return ''
  if (/^0x[0-9a-fA-F]{40}$/i.test(a)) return ''
  if (/^[0-9a-f]{64}$/i.test(a)) return ''
  return a
})

onMounted(load)

watch(workId, () => load())

watch(isOwnWork, (own) => {
  if (own) reportOpen.value = false
})
</script>

<template>
  <div class="page-shell bccr-scroll-slim">
    <div class="detail-page">
      <header class="head">
        <div class="head-row">
          <button type="button" class="back" @click="goBack">← 返回</button>
        </div>
      </header>

      <p v-if="loading" class="muted state-msg">加载中…</p>
      <p v-else-if="errorMsg" class="err state-msg">{{ errorMsg }}</p>

      <template v-else-if="detail">
        <div class="detail-ig">
          <aside class="ig-media">
            <div v-if="showImageViewer" class="media-shell">
              <div class="media-frame">
                <img class="media-img" :src="imageMainSrc" :alt="detail.title" />
              </div>
              <p v-if="openFileHref" class="media-foot">
                <a
                  :href="openFileHref"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="link-open"
                >
                  在新标签页打开作品文件
                </a>
              </p>
            </div>

            <p v-else-if="detail.kind === 'image' && !imageMainSrc" class="warn-banner">
              当前作品为图像类型，但接口未返回可访问的图片地址，无法预览。
            </p>

            <div v-else-if="detail.kind === 'video'" class="media-shell">
              <WorkMediaPlayer
                v-if="showVideoPlayer"
                kind="video"
                :src="mediaPlayUrl"
                :title="detail.title"
              />
              <p v-else class="warn-banner">
                当前作品为视频类型，但接口未返回可访问的文件地址，无法播放。
              </p>
            </div>

            <div v-else-if="detail.kind === 'audio'" class="media-shell">
              <WorkMediaPlayer
                v-if="showAudioPlayer"
                kind="audio"
                :src="mediaPlayUrl"
                :title="detail.title"
              />
              <p v-else class="warn-banner">
                当前作品为音频类型，但接口未返回可访问的文件地址，无法播放。
              </p>
            </div>

            <div v-else-if="detail.kind === 'text'" class="text-panel-embed">
              <h3 class="ig-text-h">正文</h3>
              <p class="text-hint">
                根据详情中的文件地址请求正文；若与前端不同源请配置 CORS；需要鉴权时已自动附带 Token。
              </p>
              <p v-if="textBodyLoading" class="muted">正在加载文本…</p>
              <p v-else-if="!textSourceUrl" class="warn-banner soft">
                未返回可访问的 filePath / fileUrl，无法加载正文。
              </p>
              <p v-else-if="textBodyError" class="err">{{ textBodyError }}</p>
              <pre
                v-else
                class="text-body text-body--embed bccr-scroll-slim"
              >{{ textBody }}</pre>
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
            </div>

            <div v-else-if="showHeroThumb" class="media-shell">
              <div class="media-frame">
                <img class="media-img" :src="detail.cover" alt="" />
              </div>
            </div>

            <div v-else class="media-ph" aria-hidden="true">
              <span class="media-ph-letter">{{ formatType(detail.type).charAt(0) || '作' }}</span>
            </div>
          </aside>

          <main class="ig-rail">
            <div class="rail-inner bccr-scroll-slim">
              <header class="rail-head">
                <div class="rail-head-top">
                  <h1 class="rail-title">{{ detail.title }}</h1>
                  <button
                    v-if="showReportButton"
                    type="button"
                    class="btn-report"
                    :class="{ 'is-disabled': isOwnWork }"
                    :disabled="isOwnWork"
                    :title="isOwnWork ? '不能举报自己的作品' : '举报该作品'"
                    @click="openReport"
                  >
                    举报
                  </button>
                </div>
                <p class="rail-author">
                  <span class="rail-author-lbl">作者</span>
                  <span class="rail-author-name">{{ displayAuthorName || '—' }}</span>
                </p>
                <div class="rail-pills">
                  <span class="pill">{{ formatType(detail.type) }}</span>
                  <span v-if="detail.status" class="pill soft">{{ detail.status }}</span>
                </div>
                <p class="rail-id muted-sm">作品 ID · {{ detail.id }}</p>
              </header>

              <section class="rail-sec panel-tight">
                <h2 class="rail-h2">登记信息</h2>
                <dl class="dl dl-compact">
                  <dt>作者名称</dt>
                  <dd>{{ displayAuthorName || '—' }}</dd>
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

              <section v-if="detail.fingerprint" class="rail-sec panel-tight onchain-sec">
                <div class="onchain-head">
                  <h2 class="rail-h2">链上原始凭证</h2>
                  <button
                    type="button"
                    class="btn-onchain"
                    :disabled="onChainLoading"
                    @click="refreshOnChain"
                  >
                    {{ onChainLoading ? '查询中…' : '刷新链上数据' }}
                  </button>
                </div>
                <p v-if="onChainErr" class="err onchain-msg">{{ onChainErr }}</p>
                <p v-else-if="onChainLoading && !onChainData" class="muted onchain-msg">
                  正在向节点查询链上记录…
                </p>
                <dl v-else-if="onChainRows.length" class="dl dl-compact onchain-dl">
                  <template v-for="row in onChainRows" :key="row.key">
                    <dt>{{ row.label }}</dt>
                    <dd class="mono wrap">{{ row.value }}</dd>
                  </template>
                </dl>
                <p v-else class="muted onchain-msg">接口未返回可展示字段</p>
              </section>

              <p v-if="detail.description" class="rail-desc">{{ detail.description }}</p>

              <WorkInteractionPanel :work-id="workId" embed />
            </div>
          </main>
        </div>
      </template>
    </div>

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
.page-shell {
  flex: 1 1 0;
  min-height: 0;
  width: 100%;
  max-height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  padding: 0.25rem 0 0.35rem;
  box-sizing: border-box;
  overscroll-behavior-y: contain;
}

.detail-page {
  flex: 1 1 0;
  min-height: 0;
  width: 100%;
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 1.1rem;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-self: center;
  overflow: hidden;
}

.state-msg {
  text-align: center;
  margin: 2rem 0;
}

.head {
  width: 100%;
  margin-bottom: 0.5rem;
  flex-shrink: 0;
}

.head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.btn-report {
  flex-shrink: 0;
  padding: 0.38rem 0.9rem;
  border-radius: 0.45rem;
  font-size: 0.84rem;
  font-weight: 650;
  cursor: pointer;
  border: 1px solid var(--bccr-btn-danger-border);
  background: var(--bccr-btn-danger-bg);
  color: var(--bccr-btn-danger-text);
  box-shadow: var(--bccr-shadow-sm);
  transition:
    background 0.12s,
    border-color 0.12s;
}

.btn-report:hover:not(:disabled) {
  background: var(--bccr-btn-danger-hover);
  border-color: rgba(220, 38, 38, 0.45);
}

.btn-report.is-disabled,
.btn-report:disabled {
  opacity: 0.42;
  cursor: not-allowed;
  box-shadow: none;
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
  border: 1px solid var(--bccr-warning-border);
  background: var(--bccr-warning-soft);
  color: var(--bccr-warning-text);
  font-size: 0.88rem;
  line-height: 1.55;
}

.warn-banner.soft {
  margin-bottom: 0;
  font-size: 0.85rem;
}

.text-panel-embed .text-hint {
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
  background: var(--bccr-code-bg);
  font-size: 0.88rem;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: min(60vh, 520px);
  overflow: auto;
  font-family: ui-sans-serif, system-ui, sans-serif;
  color: var(--bccr-text);
}

.text-body--embed {
  flex: 1 1 0;
  min-height: 0;
  max-height: none;
  overflow: auto;
}

.text-foot {
  margin: 0.65rem 0 0;
  font-size: 0.85rem;
}

.link-open {
  color: var(--bccr-accent);
}

.detail-ig {
  display: grid;
  grid-template-columns: 1fr minmax(280px, 380px);
  grid-template-rows: minmax(0, 1fr);
  align-items: stretch;
  width: 100%;
  max-width: 1040px;
  margin: 0 auto;
  flex: 1 1 0;
  min-height: 0;
  max-height: 100%;
  border-radius: 1rem;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: var(--bccr-panel-bg);
}

.detail-ig > .ig-media,
.detail-ig > .ig-rail {
  min-height: 0;
}

.ig-media {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  background: var(--bccr-card);
  border-right: 1px solid rgba(148, 163, 184, 0.12);
  padding: 0.5rem 0.65rem;
  min-height: 0;
  overflow: hidden;
  box-sizing: border-box;
}

.media-shell {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  flex: 1 1 0;
  min-height: 0;
}

.media-frame {
  flex: 1 1 0;
  min-height: 0;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.45rem;
  overflow: hidden;
  background: var(--bccr-media-bg);
}

.media-img {
  display: block;
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
  object-position: center;
}

.media-foot {
  margin: 0.45rem 0 0;
  font-size: 0.82rem;
  text-align: center;
  flex-shrink: 0;
}

.media-ph {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1 1 0;
  min-height: 0;
  width: 100%;
}

.media-ph-letter {
  font-size: 3rem;
  font-weight: 800;
  color: var(--bccr-text-hint);
}

.media-ph-hint {
  margin: 0.5rem 0 0;
  font-size: 0.85rem;
}

.ig-rail {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--bccr-surface-muted);
}

.rail-inner {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  margin-top: 0.25rem;
  padding: 0.75rem 0.2rem 0.5rem 0.95rem;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  align-content: flex-start;
  gap: 0.65rem;
  box-sizing: border-box;
  overscroll-behavior-y: contain;
  -webkit-overflow-scrolling: touch;
}

.rail-inner > * {
  flex-shrink: 0;
}

.rail-head {
  position: sticky;
  top: 0;
  z-index: 3;
  padding-bottom: 0.35rem;
  margin-bottom: 0.15rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  background: var(--bccr-surface-muted);
}

.rail-head-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.65rem;
  margin-bottom: 0.45rem;
}

.rail-title {
  margin: 0;
  flex: 1 1 auto;
  min-width: 0;
  font-size: 1.18rem;
  font-weight: 750;
  line-height: 1.3;
  color: var(--bccr-text);
  letter-spacing: -0.02em;
}

.rail-author {
  margin: 0 0 0.4rem;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.35rem 0.5rem;
  font-size: 0.92rem;
}

.rail-author-lbl {
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--bccr-muted);
}

.rail-author-name {
  font-weight: 650;
  color: var(--bccr-text);
}

.rail-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0 0 0.35rem;
}

.rail-id {
  margin: 0;
}

.panel-tight {
  padding: 0.75rem 0.85rem;
  border-radius: 0.6rem;
  border: 1px solid rgba(148, 163, 184, 0.12);
  background: var(--bccr-panel-muted);
}

.rail-h2 {
  margin: 0 0 0.5rem;
  font-size: 0.88rem;
  font-weight: 650;
  color: var(--bccr-text);
}

.dl-compact {
  grid-template-columns: 5.25rem 1fr;
  gap: 0.3rem 0.55rem;
  font-size: 0.8rem;
}

.onchain-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.4rem;
}

.onchain-head .rail-h2 {
  margin: 0;
}

.btn-onchain {
  padding: 0.3rem 0.65rem;
  border-radius: 0.4rem;
  font-size: 0.76rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid var(--bccr-btn-info-border);
  background: var(--bccr-btn-info-bg);
  color: var(--bccr-btn-info-text);
}

.btn-onchain:hover:not(:disabled) {
  background: var(--bccr-btn-info-hover);
}

.btn-onchain:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.onchain-msg {
  margin: 0 0 0.35rem;
  font-size: 0.82rem;
}

.onchain-dl dd {
  font-size: 0.78rem;
}

.rail-desc {
  margin: 0;
  font-size: 0.88rem;
  line-height: 1.58;
  color: var(--bccr-muted);
}

.text-panel-embed {
  flex: 1 1 0;
  min-height: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ig-text-h {
  margin: 0 0 0.5rem;
  font-size: 0.95rem;
  font-weight: 650;
  color: var(--bccr-text);
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
  background: var(--bccr-pill-bg);
  border: 1px solid var(--bccr-accent-border);
  color: var(--bccr-pill-text);
}

.pill.soft {
  background: var(--bccr-hover);
  border-color: rgba(148, 163, 184, 0.25);
  color: var(--bccr-muted);
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

@media (max-width: 900px) {
  .page-shell {
    flex: none;
    max-height: none;
    min-height: 100dvh;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .detail-ig {
    grid-template-columns: 1fr;
    min-height: 0;
    flex: none;
  }

  .ig-media {
    border-right: none;
    border-bottom: 1px solid rgba(148, 163, 184, 0.12);
    min-height: 0;
    max-height: min(48vh, 400px);
    height: auto;
  }

  .ig-rail {
    min-height: 0;
    max-height: none;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .rail-inner {
    max-height: min(52dvh, 480px);
    min-height: 0;
    flex: none;
    overflow-y: auto;
    padding-bottom: 0.75rem;
  }
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
  background: var(--bccr-overlay);
  backdrop-filter: blur(2px);
}

.modal-panel {
  position: relative;
  z-index: 1;
  width: min(100%, 420px);
  padding: 1.25rem 1.35rem;
  border-radius: 0.75rem;
  border: 1px solid var(--bccr-border);
  background: var(--bccr-surface-overlay);
  box-shadow: 0 24px 48px var(--bccr-overlay);
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
  background: var(--bccr-input-bg);
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
  color: var(--bccr-success-text);
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
