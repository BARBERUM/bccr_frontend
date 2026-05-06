<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import FileDropZone from '@/components/work/FileDropZone.vue'
import SimilarityMatchList from '@/components/work/SimilarityMatchList.vue'
import WorkTypePills from '@/components/work/WorkTypePills.vue'
import {
  formatResultLevel,
  formatSimilarity,
  levelToneClass,
} from '@/lib/plagiarismDisplay'
import { useAuthStore } from '@/stores/auth'
import * as plagiarismApi from '@/api/plagiarism'
import {
  fetchWorkDetail,
  formatWorkDetail,
  formatWorkSummary,
} from '@/api/work'

const router = useRouter()
const auth = useAuthStore()

/** @type {'check' | 'records'} */
const mainTab = ref('check')

const file = ref(/** @type {File | null} */ (null))
const workType = ref('IMAGE')
const checkLoading = ref(false)
const checkError = ref('')
/** @type {import('vue').Ref<Record<string, unknown>[]>} */
const checkResults = ref([])
const manualCompleted = ref(false)

const recordTab = ref('mine')
const workIdQuery = ref('')
const checkIdQuery = ref('')

const recordsLoading = ref(false)
const recordsError = ref('')
/** @type {import('vue').Ref<Record<string, unknown>[]>} */
const recordList = ref([])
/** 详情弹层 */
const detailModalOpen = ref(false)
/** @type {import('vue').Ref<Record<string, unknown> | null>} */
const detailModalRecord = ref(null)
/** 列表行展示：workId → 作品摘要（接口拉取） */
const workSummaryById = ref(
  /** @type {Record<string, ReturnType<typeof formatWorkSummary> & { unavailable?: boolean }>} */ ({}),
)
const listWorksPrefetching = ref(false)
/** @type {import('vue').Ref<ReturnType<typeof formatWorkDetail> | null>} */
const modalSourceWork = ref(null)
/** @type {import('vue').Ref<ReturnType<typeof formatWorkDetail> | null>} */
const modalTargetWork = ref(null)
const modalWorksLoading = ref(false)
/** 防止连续打开弹层时异步回调覆盖较新的记录 */
let modalLoadSeq = 0

const blockchainFromUser = computed(() => {
  const u = /** @type {Record<string, unknown>} */ (auth.user || {})
  return String(u.blockchainAddress ?? u.blockChainAddress ?? '').trim()
})

watch(file, () => {
  checkError.value = ''
  manualCompleted.value = false
})

watch(recordTab, () => {
  closeRecordModal()
})

/** @param {Record<string, unknown>} rec */
/** @param {string[]} keys */
function pickRecStr(rec, keys) {
  for (const k of keys) {
    const v = rec[k]
    if (v != null && String(v).trim() !== '') return String(v).trim()
  }
  return ''
}

/** @param {unknown} id */
/** @param {number} [max] */
function ellipId(id, max = 18) {
  const s = String(id ?? '').trim()
  if (!s) return '—'
  if (s.length <= max) return s
  return `${s.slice(0, max)}…`
}

async function openRecordModal(rec) {
  if (!rec || typeof rec !== 'object') return
  const seq = ++modalLoadSeq
  detailModalRecord.value = rec
  detailModalOpen.value = true
  modalSourceWork.value = null
  modalTargetWork.value = null
  modalWorksLoading.value = true
  const pair = comparePairFromRecord(rec)
  const tasks = []
  if (pair.sourceId) {
    tasks.push(
      fetchWorkDetail(pair.sourceId)
        .then((raw) => {
          if (seq !== modalLoadSeq) return
          const o = /** @type {Record<string, unknown>} */ (
            typeof raw === 'object' && raw ? raw : {}
          )
          modalSourceWork.value = formatWorkDetail(o)
          workSummaryById.value = {
            ...workSummaryById.value,
            [pair.sourceId]: formatWorkSummary(o),
          }
        })
        .catch(() => {
          if (seq !== modalLoadSeq) return
          modalSourceWork.value = null
          workSummaryById.value = {
            ...workSummaryById.value,
            [pair.sourceId]: {
              ...formatWorkSummary({ workId: pair.sourceId }),
              title: '',
              author: '',
              unavailable: true,
            },
          }
        }),
    )
  }
  if (pair.targetId) {
    tasks.push(
      fetchWorkDetail(pair.targetId)
        .then((raw) => {
          if (seq !== modalLoadSeq) return
          const o = /** @type {Record<string, unknown>} */ (
            typeof raw === 'object' && raw ? raw : {}
          )
          modalTargetWork.value = formatWorkDetail(o)
          workSummaryById.value = {
            ...workSummaryById.value,
            [pair.targetId]: formatWorkSummary(o),
          }
        })
        .catch(() => {
          if (seq !== modalLoadSeq) return
          modalTargetWork.value = null
          workSummaryById.value = {
            ...workSummaryById.value,
            [pair.targetId]: {
              ...formatWorkSummary({ workId: pair.targetId }),
              title: '',
              author: '',
              unavailable: true,
            },
          }
        }),
    )
  }
  try {
    await Promise.all(tasks)
  } finally {
    if (seq === modalLoadSeq) modalWorksLoading.value = false
  }
}

function closeRecordModal() {
  modalLoadSeq += 1
  detailModalOpen.value = false
  detailModalRecord.value = null
  modalSourceWork.value = null
  modalTargetWork.value = null
  modalWorksLoading.value = false
}

/** @param {unknown} id */
function goWorkDetailFromModal(id) {
  closeRecordModal()
  goWorkDetail(id)
}

/** @param {Record<string, unknown> | null} rec */
function comparePairFromRecord(rec) {
  if (!rec) {
    return {
      sourceId: '',
      targetId: '',
      sourceTitle: '',
      targetTitle: '',
    }
  }
  return {
    sourceId: String(rec.sourceWorkId ?? '').trim(),
    targetId: String(rec.targetWorkId ?? '').trim(),
    sourceTitle: pickRecStr(rec, ['sourceWorkName', 'sourceTitle', 'sourceName']),
    targetTitle: pickRecStr(rec, ['targetWorkName', 'targetTitle', 'comparedWorkName', 'matchWorkName']),
  }
}

const comparePair = computed(() => comparePairFromRecord(detailModalRecord.value))

/**
 * 列表行：作品标题 · 作者（优先接口缓存，其次记录内嵌字段，最后 workId）
 * @param {Record<string, unknown>} rec
 * @param {'source' | 'target'} side
 */
function recordWorkLine(rec, side) {
  const id =
    side === 'source'
      ? String(rec.sourceWorkId ?? '').trim()
      : String(rec.targetWorkId ?? '').trim()
  if (!id) return '—'

  if (listWorksPrefetching.value && workSummaryById.value[id] == null) {
    return '作品信息加载中…'
  }

  const sum = workSummaryById.value[id]
  if (sum && !sum.unavailable) {
    const title = (sum.title || '').trim()
    const a = (sum.author || '').trim()
    const isDefaultName = !title || title === '未命名作品'
    if (!isDefaultName && a) return `${title} · ${a}`
    if (!isDefaultName) return title
    if (a) return `未命名作品 · ${a}`
    if (title) return title
  }

  const title =
    side === 'source'
      ? pickRecStr(rec, [
          'sourceWorkName',
          'sourceTitle',
          'sourceName',
          'sourceWorkTitle',
        ])
      : pickRecStr(rec, [
          'targetWorkName',
          'targetTitle',
          'comparedWorkName',
          'matchWorkName',
          'targetWorkTitle',
        ])
  const author =
    side === 'source'
      ? pickRecStr(rec, [
          'sourceAuthor',
          'sourceAuthorName',
          'sourceAuthorAddress',
          'sourceOwner',
        ])
      : pickRecStr(rec, [
          'targetAuthor',
          'targetAuthorName',
          'targetAuthorAddress',
          'comparedAuthor',
          'targetOwner',
        ])
  if (title) return author ? `${title} · ${author}` : title
  if (sum?.unavailable) return id
  return id
}

/**
 * @param {Record<string, unknown>} rec
 * @param {'source' | 'target'} side
 */
function workThumbForRecord(rec, side) {
  const id =
    side === 'source'
      ? String(rec.sourceWorkId ?? '').trim()
      : String(rec.targetWorkId ?? '').trim()
  if (!id) return ''
  const sum = workSummaryById.value[id]
  if (!sum || sum.unavailable) return ''
  return String(sum.cover || '').trim()
}

/** @param {ReturnType<typeof formatWorkDetail> | null | undefined} d */
function workModalPreviewImage(d) {
  if (!d) return ''
  if (d.kind === 'image')
    return String(d.displayImageUrl || d.cover || '').trim()
  return String(d.cover || d.displayImageUrl || '').trim()
}

/** @param {ReturnType<typeof formatWorkDetail> | null | undefined} d */
function workModalTextPreview(d) {
  if (!d || d.kind !== 'text') return ''
  return String(d.textPreview || '').trim()
}

watch(
  recordList,
  async (list) => {
    const ids = new Set()
    for (const rec of list) {
      const s = String(rec.sourceWorkId ?? '').trim()
      const t = String(rec.targetWorkId ?? '').trim()
      if (s) ids.add(s)
      if (t) ids.add(t)
    }
    const toFetch = [...ids].filter((id) => workSummaryById.value[id] == null)
    if (!toFetch.length) return
    listWorksPrefetching.value = true
    try {
      const chunk = 8
      for (let i = 0; i < toFetch.length; i += chunk) {
        const part = toFetch.slice(i, i + chunk)
        await Promise.all(
          part.map(async (id) => {
            try {
              const raw = await fetchWorkDetail(id)
              const o = /** @type {Record<string, unknown>} */ (
                typeof raw === 'object' && raw ? raw : {}
              )
              workSummaryById.value = {
                ...workSummaryById.value,
                [id]: formatWorkSummary(o),
              }
            } catch {
              workSummaryById.value = {
                ...workSummaryById.value,
                [id]: {
                  ...formatWorkSummary({ workId: id }),
                  title: '',
                  author: '',
                  unavailable: true,
                },
              }
            }
          }),
        )
      }
    } finally {
      listWorksPrefetching.value = false
    }
  },
  { deep: true },
)

const recordsEmptyVisible = computed(() => {
  if (recordsLoading.value || recordsError.value) return false
  if (recordList.value.length > 0) return false
  return true
})

function onDocKeydown(ev) {
  if (ev.key === 'Escape' && detailModalOpen.value) {
    ev.preventDefault()
    closeRecordModal()
  }
}

onMounted(() => {
  document.addEventListener('keydown', onDocKeydown)
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onDocKeydown)
})

function formatTime(v) {
  if (v == null || v === '') return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return String(v)
  return d.toLocaleString('zh-CN')
}

/** @param {unknown} id */
function goWorkDetail(id) {
  if (id == null || String(id).trim() === '') return
  router.push({ name: 'work-detail', params: { workId: String(id) } })
}

async function runManualCheck() {
  checkError.value = ''
  checkResults.value = []
  manualCompleted.value = false
  if (!file.value) {
    checkError.value = '请先选择要比对的文件'
    return
  }
  checkLoading.value = true
  try {
    const data = await plagiarismApi.manualCheckWork(file.value, workType.value)
    checkResults.value = Array.isArray(data)
      ? /** @type {Record<string, unknown>[]} */ (data)
      : []
    manualCompleted.value = true
  } catch (e) {
    checkError.value = e?.message || '查重失败'
  } finally {
    checkLoading.value = false
  }
}

async function loadMyRecords() {
  const addr = blockchainFromUser.value
  if (!addr) {
    recordsError.value = '当前登录用户无链上地址，无法按查重者检索'
    recordList.value = []
    return
  }
  closeRecordModal()
  recordsLoading.value = true
  recordsError.value = ''
  try {
    const data = await plagiarismApi.fetchPlagiarismRecordsByChecker(addr)
    recordList.value = Array.isArray(data)
      ? /** @type {Record<string, unknown>[]} */ (data)
      : []
  } catch (e) {
    recordsError.value = e?.message || '加载失败'
    recordList.value = []
  } finally {
    recordsLoading.value = false
  }
}

async function loadByWorkId() {
  const id = workIdQuery.value.trim()
  if (!id) {
    recordsError.value = '请输入作品 ID'
    return
  }
  closeRecordModal()
  recordsLoading.value = true
  recordsError.value = ''
  try {
    const data = await plagiarismApi.fetchPlagiarismRecordsByWorkId(id)
    recordList.value = Array.isArray(data)
      ? /** @type {Record<string, unknown>[]} */ (data)
      : []
  } catch (e) {
    recordsError.value = e?.message || '查询失败'
    recordList.value = []
  } finally {
    recordsLoading.value = false
  }
}

async function loadByCheckId() {
  const id = checkIdQuery.value.trim()
  if (!id) {
    recordsError.value = '请输入查重记录 ID'
    return
  }
  closeRecordModal()
  recordsLoading.value = true
  recordsError.value = ''
  recordList.value = []
  try {
    const data = await plagiarismApi.fetchPlagiarismRecordById(id)
    const row =
      data && typeof data === 'object'
        ? /** @type {Record<string, unknown>} */ (data)
        : null
    if (row) await openRecordModal(row)
    else recordsError.value = '记录数据为空'
  } catch (e) {
    recordsError.value = e?.message || '记录不存在或查询失败'
  } finally {
    recordsLoading.value = false
  }
}
</script>

<template>
  <div class="check-shell">
    <div class="check-page">
      <header class="hero">
        <h1 class="title">查重中心</h1>
        <p class="lead">上传作品与全库比对，或检索历史查重链上记录。</p>
        <div class="main-tabs" role="tablist" aria-label="查重子功能">
          <button
            type="button"
            role="tab"
            class="main-tab"
            :class="{ active: mainTab === 'check' }"
            :aria-selected="mainTab === 'check'"
            @click="mainTab = 'check'"
          >
            <span class="main-tab-ic" aria-hidden="true">◈</span>
            手动查重
          </button>
          <button
            type="button"
            role="tab"
            class="main-tab"
            :class="{ active: mainTab === 'records' }"
            :aria-selected="mainTab === 'records'"
            @click="mainTab = 'records'"
          >
            <span class="main-tab-ic" aria-hidden="true">☰</span>
            查重记录
          </button>
        </div>
      </header>

      <!-- 手动查重 -->
      <section v-show="mainTab === 'check'" class="card card-glow">
        <div class="card-head">
          <h2 class="h2">上传比对</h2>
          <p class="card-desc">选择类型后上传文件，系统将返回相似作品列表。</p>
        </div>

        <label class="field type-field">
          <span class="lbl">作品类型</span>
          <WorkTypePills v-model="workType" />
        </label>

        <div class="upload-block">
          <span class="lbl">比对文件</span>
          <FileDropZone
            v-model="file"
            empty-title="点击选择文件"
            empty-subtitle="或将文件拖拽到此处 · 支持浏览器可读的单文件"
            has-title="已选择文件"
          />
        </div>

        <p v-if="checkError" class="err">{{ checkError }}</p>

        <button
          type="button"
          class="btn-run"
          :disabled="checkLoading || !file"
          @click="runManualCheck"
        >
          <span class="btn-run-inner">
            {{ checkLoading ? '正在比对库内作品…' : '开始查重' }}
          </span>
        </button>

        <div v-if="checkResults.length" class="results-block">
          <h3 class="results-title">比对结果</h3>
          <SimilarityMatchList :items="checkResults" @open-work="goWorkDetail" />
        </div>
        <p
          v-else-if="manualCompleted && !checkLoading && !checkError"
          class="empty-ok"
        >
          库内未发现达到阈值的相似作品。
        </p>
      </section>

      <!-- 查重记录（子功能） -->
      <section v-show="mainTab === 'records'" class="card records-card">
        <div class="card-head">
          <h2 class="h2">查重记录</h2>
          <p class="card-desc">按查重者、源作品或记录 ID 检索历史存证。</p>
        </div>

        <div class="sub-tabs" role="tablist">
          <button
            type="button"
            class="sub-tab"
            :class="{ active: recordTab === 'mine' }"
            @click="recordTab = 'mine'"
          >
            我的记录
          </button>
          <button
            type="button"
            class="sub-tab"
            :class="{ active: recordTab === 'work' }"
            @click="recordTab = 'work'"
          >
            按作品 ID
          </button>
          <button
            type="button"
            class="sub-tab"
            :class="{ active: recordTab === 'check' }"
            @click="recordTab = 'check'"
          >
            按记录 ID
          </button>
        </div>

        <div v-show="recordTab === 'mine'" class="query-panel">
          <div class="addr-chip">
            <span class="addr-label">链上地址</span>
            <code class="addr-val">{{ blockchainFromUser || '未绑定' }}</code>
          </div>
          <button
            type="button"
            class="btn-query"
            :disabled="recordsLoading"
            @click="loadMyRecords"
          >
            {{ recordsLoading ? '加载中…' : '加载我的查重记录' }}
          </button>
        </div>

        <div v-show="recordTab === 'work'" class="query-panel">
          <label class="field">
            <span class="lbl">源作品 ID</span>
            <input
              v-model.trim="workIdQuery"
              type="text"
              class="inp"
              placeholder="例如 work-xxx"
              @keydown.enter="loadByWorkId"
            />
          </label>
          <button
            type="button"
            class="btn-query"
            :disabled="recordsLoading"
            @click="loadByWorkId"
          >
            {{ recordsLoading ? '查询中…' : '检索记录' }}
          </button>
        </div>

        <div v-show="recordTab === 'check'" class="query-panel">
          <label class="field">
            <span class="lbl">查重记录 ID（checkId）</span>
            <input
              v-model.trim="checkIdQuery"
              type="text"
              class="inp"
              placeholder="精确匹配一条记录"
              @keydown.enter="loadByCheckId"
            />
          </label>
          <button
            type="button"
            class="btn-query"
            :disabled="recordsLoading"
            @click="loadByCheckId"
          >
            {{ recordsLoading ? '查询中…' : '检索记录' }}
          </button>
        </div>

        <p v-if="recordsError" class="err">{{ recordsError }}</p>

        <!-- 紧凑列表：固定高度滚动，避免记录多时页面过长 -->
        <div v-if="recordList.length" class="records-panel">
          <div class="records-toolbar">
            <span class="records-count">共 {{ recordList.length }} 条</span>
            <span class="records-hint">点击一行打开详情 · 对比双方作品</span>
          </div>
          <div class="records-scroll" role="region" aria-label="查重记录列表">
            <div class="records-inner">
              <button
                v-for="rec in recordList"
                :key="String(rec.checkId ?? rec.id)"
                type="button"
                class="records-row"
                :class="levelToneClass(rec.result)"
                @click="openRecordModal(rec)"
              >
                <div class="records-row-top">
                  <div class="records-row-metrics">
                    <span class="col-sim">{{ formatSimilarity(rec.similarity) }}</span>
                    <span class="col-lvl"><span class="lvl-chip">{{ formatResultLevel(rec.result) }}</span></span>
                  </div>
                  <span class="col-time">{{ formatTime(rec.checkTime) }}</span>
                  <span class="col-go" aria-hidden="true">›</span>
                </div>
                <div class="records-row-id mono" :title="String(rec.checkId ?? rec.id ?? '')">
                  记录 {{ ellipId(rec.checkId ?? rec.id, 28) }}
                </div>
                <div class="records-pair">
                  <div class="rw-line">
                    <img
                      v-if="workThumbForRecord(rec, 'source')"
                      :src="workThumbForRecord(rec, 'source')"
                      alt=""
                      class="rw-thumb"
                    />
                    <div class="rw-line-body">
                      <span class="rw-lab">源</span>
                      <span class="rw-main">{{ recordWorkLine(rec, 'source') }}</span>
                    </div>
                  </div>
                  <div class="rw-line">
                    <img
                      v-if="workThumbForRecord(rec, 'target')"
                      :src="workThumbForRecord(rec, 'target')"
                      alt=""
                      class="rw-thumb"
                    />
                    <div class="rw-line-body">
                      <span class="rw-lab">比</span>
                      <span class="rw-main">{{ recordWorkLine(rec, 'target') }}</span>
                    </div>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>

        <div v-else-if="recordsEmptyVisible" class="records-empty">
          <span class="records-empty-ic" aria-hidden="true">◇</span>
          <p>{{ recordTab === 'check' ? '输入记录 ID 并检索，或切换其他方式加载列表' : '暂无列表数据' }}</p>
          <p class="records-empty-hint">请选择检索方式并点击加载。</p>
        </div>
      </section>
    </div>

    <Teleport to="body">
      <div
        v-if="detailModalOpen && detailModalRecord"
        class="rec-modal-backdrop"
        role="presentation"
        @click.self="closeRecordModal"
      >
        <div
          class="rec-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rec-modal-title"
        >
          <header class="rec-modal-head" :class="levelToneClass(detailModalRecord.result)">
            <div class="rec-modal-head-text">
              <h2 id="rec-modal-title" class="rec-modal-title">查重记录详情</h2>
              <p class="rec-modal-sub mono">{{ detailModalRecord.checkId ?? '—' }}</p>
            </div>
            <button type="button" class="rec-modal-close" aria-label="关闭" @click="closeRecordModal">
              ×
            </button>
          </header>

          <div class="rec-modal-metrics">
            <div class="rec-metric">
              <span class="rec-metric-k">相似度</span>
              <strong class="rec-metric-v">{{ formatSimilarity(detailModalRecord.similarity) }}</strong>
            </div>
            <div class="rec-metric">
              <span class="rec-metric-k">结果等级</span>
              <strong class="rec-metric-v lvl">{{ formatResultLevel(detailModalRecord.result) }}</strong>
            </div>
            <div class="rec-metric span">
              <span class="rec-metric-k">查重时间</span>
              <span class="rec-metric-v norm">{{ formatTime(detailModalRecord.checkTime) }}</span>
            </div>
          </div>

          <section class="rec-compare" aria-label="作品对比">
            <p class="rec-compare-lead">以下为本次存证比对的两端作品，可直接跳转详情页核对内容。</p>
            <div class="rec-compare-grid">
              <div class="rec-wcard rec-wcard--src">
                <span class="rec-wtag">源作品</span>
                <div class="rec-wpreview" :aria-busy="modalWorksLoading || undefined">
                  <div v-if="modalWorksLoading" class="rec-preview-skel">加载作品与预览…</div>
                  <template v-else-if="modalSourceWork">
                    <img
                      v-if="workModalPreviewImage(modalSourceWork)"
                      class="rec-preview-img"
                      :src="workModalPreviewImage(modalSourceWork)"
                      alt=""
                    />
                    <p v-else-if="workModalTextPreview(modalSourceWork)" class="rec-text-prev">
                      {{ workModalTextPreview(modalSourceWork) }}
                    </p>
                    <div v-else class="rec-preview-fallback">暂无预览图</div>
                  </template>
                  <div v-else class="rec-preview-fallback">未能加载作品（可能无权限或已下架）</div>
                </div>
                <p class="rec-wtitle">
                  {{
                    modalSourceWork?.title ||
                    comparePair.sourceTitle ||
                    '（未提供名称）'
                  }}
                </p>
                <p v-if="(modalSourceWork?.author || '').trim()" class="rec-wauthor">
                  {{ modalSourceWork.author }}
                </p>
                <code class="rec-wid mono">{{ comparePair.sourceId || '—' }}</code>
                <button
                  type="button"
                  class="rec-wbtn"
                  :disabled="!comparePair.sourceId"
                  @click.stop="goWorkDetailFromModal(comparePair.sourceId)"
                >
                  跳转作品详情
                </button>
              </div>
              <div class="rec-vs" aria-hidden="true">VS</div>
              <div class="rec-wcard rec-wcard--tgt">
                <span class="rec-wtag">对比作品</span>
                <div class="rec-wpreview" :aria-busy="modalWorksLoading || undefined">
                  <div v-if="modalWorksLoading" class="rec-preview-skel">加载作品与预览…</div>
                  <template v-else-if="modalTargetWork">
                    <img
                      v-if="workModalPreviewImage(modalTargetWork)"
                      class="rec-preview-img"
                      :src="workModalPreviewImage(modalTargetWork)"
                      alt=""
                    />
                    <p v-else-if="workModalTextPreview(modalTargetWork)" class="rec-text-prev">
                      {{ workModalTextPreview(modalTargetWork) }}
                    </p>
                    <div v-else class="rec-preview-fallback">暂无预览图</div>
                  </template>
                  <div v-else class="rec-preview-fallback">未能加载作品（可能无权限或已下架）</div>
                </div>
                <p class="rec-wtitle">
                  {{
                    modalTargetWork?.title ||
                    comparePair.targetTitle ||
                    '（未提供名称）'
                  }}
                </p>
                <p v-if="(modalTargetWork?.author || '').trim()" class="rec-wauthor">
                  {{ modalTargetWork.author }}
                </p>
                <code class="rec-wid mono">{{ comparePair.targetId || '—' }}</code>
                <button
                  type="button"
                  class="rec-wbtn rec-wbtn--tgt"
                  :disabled="!comparePair.targetId"
                  @click.stop="goWorkDetailFromModal(comparePair.targetId)"
                >
                  跳转作品详情
                </button>
              </div>
            </div>
          </section>

          <footer class="rec-modal-foot">
            <div class="rec-meta-row">
              <span class="rec-meta-k">查重者</span>
              <code class="rec-meta-v mono">{{ detailModalRecord.checkerAddress ?? '—' }}</code>
            </div>
            <div class="rec-meta-row">
              <span class="rec-meta-k">链上 txHash</span>
              <code class="rec-meta-v mono">{{ detailModalRecord.txHash ?? '—' }}</code>
            </div>
            <p class="rec-modal-tip">按 Esc 或点击遮罩关闭</p>
          </footer>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.check-shell {
  width: 100%;
  display: flex;
  justify-content: center;
  padding: 0.75rem 0 2.5rem;
  box-sizing: border-box;
}

.check-page {
  width: 100%;
  max-width: 820px;
}

.hero {
  margin-bottom: 1.35rem;
}

.title {
  margin: 0 0 0.35rem;
  font-size: 1.55rem;
  font-weight: 750;
  letter-spacing: -0.02em;
  background: linear-gradient(120deg, #e2e8f0 0%, #93c5fd 55%, #c4b5fd 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.lead {
  margin: 0 0 1rem;
  font-size: 0.9rem;
  line-height: 1.55;
  color: var(--bccr-muted);
}

.main-tabs {
  display: flex;
  gap: 0.5rem;
  padding: 0.35rem;
  border-radius: 0.85rem;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(15, 23, 42, 0.55);
}

.main-tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  padding: 0.65rem 0.85rem;
  border: none;
  border-radius: 0.55rem;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--bccr-muted);
  background: transparent;
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s,
    box-shadow 0.15s;
}

.main-tab:hover {
  color: #e2e8f0;
}

.main-tab.active {
  color: #f8fafc;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.35), rgba(99, 102, 241, 0.28));
  box-shadow: 0 4px 18px rgba(59, 130, 246, 0.18);
}

.main-tab-ic {
  opacity: 0.85;
  font-size: 0.85rem;
}

.card {
  padding: 1.35rem 1.4rem;
  border-radius: 1rem;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(15, 23, 42, 0.42);
  margin-bottom: 1rem;
}

.card-glow {
  box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.06), 0 18px 48px rgba(0, 0, 0, 0.22);
}

.records-card {
  border-color: rgba(167, 139, 250, 0.12);
  box-shadow: 0 0 0 1px rgba(167, 139, 250, 0.05), 0 18px 48px rgba(0, 0, 0, 0.2);
}

.card-head {
  margin-bottom: 1.15rem;
}

.h2 {
  margin: 0 0 0.35rem;
  font-size: 1.08rem;
  font-weight: 650;
}

.card-desc {
  margin: 0;
  font-size: 0.82rem;
  color: var(--bccr-muted);
  line-height: 1.45;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.type-field {
  margin-bottom: 1.1rem;
}

.lbl {
  font-size: 0.76rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.88);
}

.upload-block {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  margin-bottom: 1.15rem;
}

.err {
  margin: 0 0 0.85rem;
  padding: 0.55rem 0.75rem;
  border-radius: 0.45rem;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(248, 113, 113, 0.25);
  color: #fecaca;
  font-size: 0.86rem;
}

.btn-run {
  width: 100%;
  padding: 0;
  border: none;
  border-radius: 0.65rem;
  cursor: pointer;
  background: linear-gradient(135deg, #2563eb, #6366f1, #7c3aed);
  box-shadow: 0 8px 28px rgba(79, 70, 229, 0.35);
  transition:
    transform 0.12s,
    filter 0.12s,
    opacity 0.12s;
}

.btn-run:hover:not(:disabled) {
  filter: brightness(1.06);
  transform: translateY(-1px);
}

.btn-run:disabled {
  opacity: 0.42;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.btn-run-inner {
  display: block;
  padding: 0.75rem 1rem;
  font-size: 0.95rem;
  font-weight: 700;
  color: #fff;
}

.results-block {
  margin-top: 1.35rem;
  padding-top: 1.15rem;
  border-top: 1px solid rgba(148, 163, 184, 0.12);
}

.results-title {
  margin: 0 0 0.75rem;
  font-size: 0.88rem;
  font-weight: 650;
  color: #cbd5e1;
}

.btn-ghost-line {
  padding: 0.35rem 0;
  border: none;
  background: none;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--bccr-accent);
  cursor: pointer;
}

.btn-ghost-line.sm {
  font-size: 0.78rem;
}

.btn-ghost-line:hover {
  text-decoration: underline;
}

.empty-ok {
  margin: 1rem 0 0;
  padding: 0.85rem 1rem;
  border-radius: 0.55rem;
  font-size: 0.86rem;
  color: #86efac;
  background: rgba(34, 197, 94, 0.08);
  border: 1px solid rgba(74, 222, 128, 0.2);
}

.sub-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 1rem;
}

.sub-tab {
  padding: 0.42rem 0.85rem;
  border-radius: 0.5rem;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(30, 41, 59, 0.35);
  color: var(--bccr-muted);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    background 0.12s,
    border-color 0.12s,
    color 0.12s;
}

.sub-tab:hover {
  color: #e2e8f0;
}

.sub-tab.active {
  border-color: rgba(167, 139, 250, 0.45);
  background: rgba(139, 92, 246, 0.14);
  color: #ddd6fe;
}

.query-panel {
  padding: 1rem;
  margin-bottom: 1rem;
  border-radius: 0.75rem;
  background: rgba(0, 0, 0, 0.18);
  border: 1px solid rgba(148, 163, 184, 0.1);
}

.addr-chip {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-bottom: 0.85rem;
}

.addr-label {
  font-size: 0.72rem;
  color: var(--bccr-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.addr-val {
  font-size: 0.78rem;
  word-break: break-all;
  color: #cbd5e1;
  padding: 0.45rem 0.55rem;
  border-radius: 0.4rem;
  background: rgba(15, 23, 42, 0.65);
}

.inp {
  padding: 0.55rem 0.7rem;
  border-radius: 0.5rem;
  border: 1px solid var(--bccr-border);
  background: rgba(15, 23, 42, 0.65);
  color: var(--bccr-text);
  font-size: 0.9rem;
}

.inp:focus {
  outline: none;
  border-color: rgba(167, 139, 250, 0.45);
  box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.15);
}

.btn-query {
  margin-top: 0.75rem;
  width: 100%;
  padding: 0.55rem 1rem;
  border-radius: 0.5rem;
  border: none;
  font-weight: 650;
  font-size: 0.88rem;
  color: #f5f3ff;
  cursor: pointer;
  background: linear-gradient(135deg, rgba(124, 58, 237, 0.9), rgba(59, 130, 246, 0.85));
  box-shadow: 0 6px 22px rgba(91, 33, 182, 0.25);
}

.btn-query:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* —— 查重记录：紧凑表格式 + 限高滚动 —— */
.records-panel {
  margin-top: 0.5rem;
  border-radius: 0.9rem;
  border: 1px solid rgba(167, 139, 250, 0.14);
  background: rgba(15, 23, 42, 0.4);
  overflow: hidden;
}

.records-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.35rem 0.75rem;
  padding: 0.55rem 0.8rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  background: rgba(0, 0, 0, 0.12);
}

.records-count {
  font-size: 0.8rem;
  font-weight: 700;
  color: #e2e8f0;
}

.records-hint {
  font-size: 0.72rem;
  color: var(--bccr-muted);
}

.records-scroll {
  max-height: min(52vh, 440px);
  overflow: auto;
  overscroll-behavior: contain;
}

.records-inner {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.records-row {
  width: 100%;
  margin: 0;
  padding: 0.65rem 0.75rem;
  border: none;
  border-bottom: 1px solid rgba(148, 163, 184, 0.06);
  border-left: 3px solid rgba(167, 139, 250, 0.45);
  background: rgba(30, 41, 59, 0.25);
  font: inherit;
  color: inherit;
  cursor: pointer;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 0.38rem;
  align-items: stretch;
  transition:
    background 0.12s,
    border-color 0.12s;
}

.records-row:hover {
  background: rgba(59, 130, 246, 0.08);
}

.records-row.tone-high {
  border-left-color: #f87171;
}

.records-row.tone-mid {
  border-left-color: #fbbf24;
}

.records-row.tone-low {
  border-left-color: #34d399;
}

.records-row.tone-none {
  border-left-color: rgba(148, 163, 184, 0.45);
}

.records-row.tone-default {
  border-left-color: rgba(167, 139, 250, 0.45);
}

.records-row-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.records-row-metrics {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.35rem 0.65rem;
}

.col-sim {
  font-size: 0.82rem;
  font-weight: 800;
  color: #fcd34d;
}

.lvl-chip {
  display: inline-block;
  padding: 0.12rem 0.38rem;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 650;
  background: rgba(139, 92, 246, 0.18);
  color: #ddd6fe;
}

.records-row-id {
  font-size: 0.72rem;
  color: rgba(148, 163, 184, 0.92);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.col-time {
  flex-shrink: 0;
  font-size: 0.7rem;
  color: rgba(148, 163, 184, 0.95);
  white-space: nowrap;
}

.col-go {
  flex-shrink: 0;
  color: rgba(148, 163, 184, 0.55);
  font-size: 1.1rem;
  font-weight: 300;
  line-height: 1;
}

.records-pair {
  display: flex;
  flex-direction: column;
  gap: 0.28rem;
}

.rw-line {
  display: flex;
  align-items: flex-start;
  gap: 0.45rem;
  min-width: 0;
}

.rw-thumb {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 0.35rem;
  object-fit: cover;
  background: rgba(15, 23, 42, 0.65);
  border: 1px solid rgba(148, 163, 184, 0.12);
}

.rw-line-body {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 0.35rem;
  font-size: 0.78rem;
  line-height: 1.4;
}

.rw-lab {
  flex-shrink: 0;
  font-size: 0.65rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: rgba(148, 163, 184, 0.75);
}

.rw-main {
  flex: 1;
  min-width: 0;
  color: #e2e8f0;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

@media (max-width: 640px) {
  .records-hint {
    width: 100%;
  }
}

/* —— 详情弹层 —— */
.rec-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(2, 6, 23, 0.72);
  backdrop-filter: blur(6px);
}

.rec-modal {
  width: 100%;
  max-width: 560px;
  max-height: min(92vh, 720px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border-radius: 1rem;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(15, 23, 42, 0.96);
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.45);
}

.rec-modal-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 1rem 1.1rem;
  border-bottom: 3px solid rgba(167, 139, 250, 0.55);
}

.rec-modal-head.tone-high {
  border-bottom-color: #f87171;
}

.rec-modal-head.tone-mid {
  border-bottom-color: #fbbf24;
}

.rec-modal-head.tone-low {
  border-bottom-color: #34d399;
}

.rec-modal-head.tone-none,
.rec-modal-head.tone-default {
  border-bottom-color: rgba(148, 163, 184, 0.35);
}

.rec-modal-title {
  margin: 0 0 0.25rem;
  font-size: 1.08rem;
  font-weight: 750;
  color: #f8fafc;
}

.rec-modal-sub {
  margin: 0;
  font-size: 0.74rem;
  color: var(--bccr-muted);
  word-break: break-all;
}

.rec-modal-close {
  flex-shrink: 0;
  width: 2rem;
  height: 2rem;
  border: none;
  border-radius: 0.45rem;
  background: rgba(148, 163, 184, 0.12);
  color: #cbd5e1;
  font-size: 1.35rem;
  line-height: 1;
  cursor: pointer;
}

.rec-modal-close:hover {
  background: rgba(248, 113, 113, 0.15);
  color: #fecaca;
}

.rec-modal-metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.55rem;
  padding: 0.85rem 1.1rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.08);
}

.rec-metric.span {
  grid-column: 1 / -1;
}

.rec-metric-k {
  display: block;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--bccr-muted);
  margin-bottom: 0.2rem;
}

.rec-metric-v {
  font-size: 1.35rem;
  font-weight: 800;
  color: #fcd34d;
}

.rec-metric-v.lvl {
  font-size: 1rem;
  color: #ddd6fe;
}

.rec-metric-v.norm {
  font-size: 0.86rem;
  font-weight: 600;
  color: #e2e8f0;
}

.rec-compare {
  padding: 0.9rem 1.1rem 0.4rem;
  overflow-y: auto;
}

.rec-compare-lead {
  margin: 0 0 0.85rem;
  font-size: 0.8rem;
  line-height: 1.55;
  color: var(--bccr-muted);
}

.rec-compare-grid {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 0.45rem 0.35rem;
  align-items: stretch;
}

@media (max-width: 480px) {
  .rec-compare-grid {
    grid-template-columns: 1fr;
  }

  .rec-vs {
    display: none;
  }
}

.rec-wcard {
  padding: 0.85rem 0.9rem;
  border-radius: 0.75rem;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.rec-wcard--src {
  border-color: rgba(59, 130, 246, 0.28);
  background: linear-gradient(160deg, rgba(59, 130, 246, 0.1), rgba(15, 23, 42, 0.3));
}

.rec-wcard--tgt {
  border-color: rgba(244, 114, 182, 0.28);
  background: linear-gradient(160deg, rgba(244, 114, 182, 0.08), rgba(15, 23, 42, 0.3));
}

.rec-wtag {
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(186, 230, 253, 0.85);
}

.rec-wcard--tgt .rec-wtag {
  color: rgba(251, 207, 232, 0.9);
}

.rec-wtitle {
  margin: 0;
  font-size: 0.88rem;
  font-weight: 650;
  color: #f1f5f9;
  line-height: 1.45;
}

.rec-wauthor {
  margin: 0;
  font-size: 0.74rem;
  color: rgba(186, 230, 253, 0.75);
  word-break: break-all;
}

.rec-wcard--tgt .rec-wauthor {
  color: rgba(251, 207, 232, 0.75);
}

.rec-wpreview {
  position: relative;
  border-radius: 0.55rem;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.12);
  background: rgba(0, 0, 0, 0.22);
  min-height: 4.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.rec-preview-img {
  width: 100%;
  max-height: 140px;
  object-fit: contain;
  display: block;
}

.rec-text-prev {
  margin: 0;
  padding: 0.55rem 0.65rem;
  font-size: 0.72rem;
  line-height: 1.45;
  color: #cbd5e1;
  max-height: 120px;
  overflow: hidden;
  text-align: left;
  align-self: stretch;
}

.rec-preview-fallback,
.rec-preview-skel {
  padding: 0.65rem 0.75rem;
  font-size: 0.72rem;
  color: rgba(148, 163, 184, 0.75);
}

.rec-preview-skel {
  animation: rec-pulse 1.1s ease-in-out infinite;
}

@keyframes rec-pulse {
  50% {
    opacity: 0.55;
  }
}

.rec-wid {
  font-size: 0.74rem;
  color: rgba(148, 163, 184, 0.95);
  word-break: break-all;
}

.rec-wbtn {
  margin-top: 0.25rem;
  padding: 0.48rem 0.65rem;
  border-radius: 0.5rem;
  border: 1px solid rgba(96, 165, 250, 0.45);
  background: rgba(59, 130, 246, 0.15);
  color: #bfdbfe;
  font-size: 0.8rem;
  font-weight: 650;
  cursor: pointer;
}

.rec-wbtn:hover:not(:disabled) {
  background: rgba(59, 130, 246, 0.25);
}

.rec-wbtn:disabled {
  opacity: 0.38;
  cursor: not-allowed;
}

.rec-wbtn--tgt {
  border-color: rgba(244, 114, 182, 0.45);
  background: rgba(219, 39, 119, 0.12);
  color: #fbcfe8;
}

.rec-wbtn--tgt:hover:not(:disabled) {
  background: rgba(219, 39, 119, 0.18);
}

.rec-vs {
  align-self: center;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  color: rgba(148, 163, 184, 0.55);
}

.rec-modal-foot {
  padding: 0.85rem 1.1rem 1rem;
  border-top: 1px solid rgba(148, 163, 184, 0.08);
  margin-top: auto;
}

.rec-meta-row {
  display: grid;
  grid-template-columns: 5rem 1fr;
  gap: 0.35rem;
  margin-bottom: 0.45rem;
  font-size: 0.74rem;
}

.rec-meta-k {
  color: var(--bccr-muted);
}

.rec-meta-v {
  margin: 0;
  color: #cbd5e1;
  word-break: break-all;
  font-size: 0.72rem;
}

.rec-modal-tip {
  margin: 0.55rem 0 0;
  font-size: 0.68rem;
  color: rgba(148, 163, 184, 0.65);
}

.records-empty {
  text-align: center;
  padding: 2rem 1rem;
  color: var(--bccr-muted);
}

.records-empty p {
  margin: 0.25rem 0;
  font-size: 0.9rem;
}

.records-empty-hint {
  font-size: 0.8rem !important;
  opacity: 0.85;
}

.records-empty-ic {
  display: block;
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
  opacity: 0.35;
}

.mono {
  font-family: ui-monospace, monospace;
}
</style>
