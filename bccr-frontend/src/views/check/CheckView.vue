<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BccrIcon from '@/components/icons/BccrIcon.vue'
import FileDropZone from '@/components/work/FileDropZone.vue'
import SimilarityMatchList from '@/components/work/SimilarityMatchList.vue'
import WorkTypePills from '@/components/work/WorkTypePills.vue'
import {
  buildManualCheckSourcePreview,
  formatResultLevel,
  formatSimilarity,
  levelToneClass,
  pickSourceFileUrl,
  sourceThumbFromPlagiarismRecord,
} from '@/lib/plagiarismDisplay'
import { useAuthStore } from '@/stores/auth'
import * as plagiarismApi from '@/api/plagiarism'
import {
  fetchWorkDetail,
  formatWorkDetail,
  formatWorkSummary,
  normalizeWorkIdParam,
  recheckWork,
} from '@/api/work'
import { fetchMyWorkPickSuggestions } from '@/lib/workPick'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

/** @type {'check' | 'recheck' | 'records'} */
const mainTab = ref('check')

const file = ref(/** @type {File | null} */ (null))
const workType = ref('IMAGE')
const checkLoading = ref(false)
const checkError = ref('')
/** @type {import('vue').Ref<Record<string, unknown>[]>} */
const checkResults = ref([])
const manualCompleted = ref(false)

/** 链上作品再查重：作品列表与授权页一致，使用 GET /api/work/my + 关键字；选定后 POST /api/work/{workId}/recheck */
const recheckWorkSearchInput = ref('')
const recheckWorkSuggestOpen = ref(false)
/** @type {import('vue').Ref<ReturnType<typeof formatWorkSummary>[]>} */
const recheckWorkSuggestions = ref([])
const recheckWorkSearchLoading = ref(false)
const recheckWorkSearchError = ref('')
const recheckWorkId = ref('')
const recheckWorkConfirmed = ref(false)
/** @type {import('vue').Ref<ReturnType<typeof formatWorkSummary> | null>} */
const recheckWorkPick = ref(null)
const recheckLoading = ref(false)
const recheckError = ref('')
/** @type {import('vue').Ref<Record<string, unknown>[]>} */
const recheckResults = ref([])
const recheckCompleted = ref(false)
let recheckWorkSuggestTimer = null
let recheckWorkBlurTimer = null

const recordTab = ref('mine')
const workIdQuery = ref('')
const checkIdQuery = ref('')

const recordsLoading = ref(false)
const recordsError = ref('')
/** @type {import('vue').Ref<Record<string, unknown>[]>} */
const recordList = ref([])
const detailModalOpen = ref(false)
/** @type {import('vue').Ref<Record<string, unknown> | null>} */
const detailModalRecord = ref(null)
const workSummaryById = ref(
  /** @type {Record<string, ReturnType<typeof formatWorkSummary> & { unavailable?: boolean }>} */ ({}),
)
const listWorksPrefetching = ref(false)
/** @type {import('vue').Ref<ReturnType<typeof formatWorkDetail> | null>} */
const modalSourceWork = ref(null)
/** @type {import('vue').Ref<ReturnType<typeof formatWorkDetail> | null>} */
const modalTargetWork = ref(null)
const modalWorksLoading = ref(false)
let modalLoadSeq = 0

const blockchainFromUser = computed(() => {
  const u = /** @type {Record<string, unknown>} */ (auth.user || {})
  return String(u.blockchainAddress ?? u.blockChainAddress ?? '').trim()
})

const recheckWorkCoverUrl = computed(() => String(recheckWorkPick.value?.cover ?? '').trim())

watch(recheckWorkSearchInput, (v) => {
  if (recheckWorkSuggestTimer) clearTimeout(recheckWorkSuggestTimer)
  recheckWorkSearchError.value = ''
  const t = v.trim()
  if (recheckWorkConfirmed.value && recheckWorkId.value && t === recheckWorkId.value) {
    return
  }
  if (recheckWorkConfirmed.value && recheckWorkId.value && t !== recheckWorkId.value) {
    clearRecheckWorkSelectionFull()
  }
  const q = v.trim()
  if (q.length < 1) {
    recheckWorkSuggestions.value = []
    recheckWorkSuggestOpen.value = false
    return
  }
  recheckWorkSuggestTimer = setTimeout(() => {
    recheckWorkSuggestTimer = null
    void fetchRecheckWorkSuggestions(q)
  }, 260)
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
  const sourceFromRecord = buildManualCheckSourcePreview(rec)
  if (sourceFromRecord) {
    modalSourceWork.value = sourceFromRecord
  }
  const tasks = []
  if (pair.sourceId) {
    tasks.push(
      fetchWorkDetail(pair.sourceId)
        .then((raw) => {
          if (seq !== modalLoadSeq) return
          const o = /** @type {Record<string, unknown>} */ (
            typeof raw === 'object' && raw ? raw : {}
          )
          const detail = formatWorkDetail(o)
          const keepManualImage =
            sourceFromRecord?.kind === 'image' &&
            Boolean(sourceFromRecord.cover || sourceFromRecord.displayImageUrl)
          modalSourceWork.value = keepManualImage
            ? {
                ...detail,
                kind: 'image',
                cover: sourceFromRecord.cover,
                displayImageUrl: sourceFromRecord.displayImageUrl,
              }
            : detail
          workSummaryById.value = {
            ...workSummaryById.value,
            [pair.sourceId]: formatWorkSummary(o),
          }
        })
        .catch(() => {
          if (seq !== modalLoadSeq) return
          if (sourceFromRecord) {
            modalSourceWork.value = sourceFromRecord
          } else {
            modalSourceWork.value = null
          }
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

function recordWorkLine(rec, side) {
  const id =
    side === 'source'
      ? String(rec.sourceWorkId ?? '').trim()
      : String(rec.targetWorkId ?? '').trim()
  if (!id) {
    if (side === 'source') {
      const title = pickRecStr(rec, [
        'sourceWorkName',
        'sourceTitle',
        'sourceName',
        'sourceWorkTitle',
      ])
      const author = pickRecStr(rec, [
        'sourceAuthor',
        'sourceAuthorName',
        'sourceAuthorAddress',
        'checkerAddress',
        'checkerName',
      ])
      if (title) return author ? `${title} · ${author}` : title
      if (pickSourceFileUrl(rec)) return '手动上传文件'
    }
    return '—'
  }

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

function workThumbForRecord(rec, side) {
  if (side === 'source') {
    const manualThumb = sourceThumbFromPlagiarismRecord(rec)
    if (manualThumb) return manualThumb
  }
  const id =
    side === 'source'
      ? String(rec.sourceWorkId ?? '').trim()
      : String(rec.targetWorkId ?? '').trim()
  if (!id) return ''
  const sum = workSummaryById.value[id]
  if (!sum || sum.unavailable) return ''
  return String(sum.cover || '').trim()
}

function workModalPreviewImage(d) {
  if (!d) return ''
  if (d.kind === 'image')
    return String(d.displayImageUrl || d.cover || '').trim()
  return String(d.cover || d.displayImageUrl || '').trim()
}

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
  if (recheckWorkSuggestTimer) clearTimeout(recheckWorkSuggestTimer)
  if (recheckWorkBlurTimer) clearTimeout(recheckWorkBlurTimer)
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

/** 将后端 CheckResult 规范为 SimilarityMatchList 所需字段 */
/** @param {Record<string, unknown>} raw */
function normalizeCheckResultRow(raw) {
  if (!raw || typeof raw !== 'object') return /** @type {Record<string, unknown>} */ ({})
  const o = /** @type {Record<string, unknown>} */ (raw)
  return {
    checkId: o.checkId ?? o.id ?? '',
    similarity: o.similarity ?? o.similarityScore ?? o.score,
    resultLevel: o.resultLevel ?? o.level ?? o.result,
    matchWorkName: o.matchWorkName ?? o.targetWorkName ?? o.comparedWorkName ?? o.workName,
    matchWorkId: o.matchWorkId ?? o.targetWorkId ?? o.comparedWorkId ?? o.workId,
    matchAuthorAddress: o.matchAuthorAddress ?? o.targetAuthorAddress ?? o.authorAddress,
  }
}

async function fetchRecheckWorkSuggestions(keyword) {
  const kw = keyword.trim()
  if (!kw) return
  if (!auth.isLoggedIn) {
    recheckWorkSearchError.value = '请先登录'
    recheckWorkSuggestions.value = []
    return
  }
  recheckWorkSearchLoading.value = true
  recheckWorkSuggestOpen.value = true
  recheckWorkSuggestions.value = []
  recheckWorkSearchError.value = ''
  try {
    recheckWorkSuggestions.value = await fetchMyWorkPickSuggestions({
      query: kw,
      myAddress: blockchainFromUser.value,
      pageSize: 50,
    })
  } catch (e) {
    recheckWorkSearchError.value = e?.message || '作品搜索失败'
    recheckWorkSuggestions.value = []
  } finally {
    recheckWorkSearchLoading.value = false
  }
}

function clearRecheckWorkSelectionFull() {
  recheckWorkId.value = ''
  recheckWorkConfirmed.value = false
  recheckWorkPick.value = null
}

function clearRecheckWorkChip() {
  recheckWorkSearchInput.value = ''
  recheckWorkSuggestions.value = []
  recheckWorkSuggestOpen.value = false
  clearRecheckWorkSelectionFull()
}

/** @param {ReturnType<typeof formatWorkSummary>} s */
function selectRecheckWorkFromList(s) {
  recheckWorkSearchError.value = ''
  const id = String(s.id ?? '').trim()
  if (!id) {
    recheckWorkSearchError.value = '无效作品'
    return
  }
  recheckWorkPick.value = s
  recheckWorkId.value = id
  recheckWorkConfirmed.value = true
  recheckWorkSearchInput.value = id
  recheckWorkSuggestions.value = []
  recheckWorkSuggestOpen.value = false
}

function onRecheckWorkComboFocus() {
  recheckError.value = ''
  if (recheckWorkBlurTimer) {
    clearTimeout(recheckWorkBlurTimer)
    recheckWorkBlurTimer = null
  }
  const q = recheckWorkSearchInput.value.trim()
  if (recheckWorkConfirmed.value && recheckWorkId.value && q === recheckWorkId.value) {
    recheckWorkSuggestOpen.value = false
    return
  }
  if (q) {
    recheckWorkSuggestOpen.value = true
    if (!recheckWorkSearchLoading.value && recheckWorkSuggestions.value.length === 0) {
      void fetchRecheckWorkSuggestions(q)
    }
  }
}

function onRecheckWorkComboBlur() {
  if (recheckWorkBlurTimer) clearTimeout(recheckWorkBlurTimer)
  recheckWorkBlurTimer = setTimeout(() => {
    recheckWorkBlurTimer = null
    recheckWorkSuggestOpen.value = false
  }, 200)
}

/** @param {MouseEvent} ev */
function onRecheckSuggestListMouseDown(ev) {
  ev.preventDefault()
}

async function runRecheckChain() {
  recheckError.value = ''
  recheckResults.value = []
  recheckCompleted.value = false
  const id = normalizeWorkIdParam(recheckWorkId.value)
  if (!id || !recheckWorkConfirmed.value) {
    recheckError.value = '请通过搜索并从下拉列表中选择要再查重的作品'
    return
  }
  if (!auth.isLoggedIn) {
    recheckError.value = '请先登录'
    return
  }
  recheckLoading.value = true
  try {
    const data = await recheckWork(id)
    const arr = Array.isArray(data) ? data : []
    recheckResults.value = arr.map((row) =>
      normalizeCheckResultRow(
        /** @type {Record<string, unknown>} */ (typeof row === 'object' && row ? row : {}),
      ),
    )
    recheckCompleted.value = true
  } catch (e) {
    recheckError.value = e?.message || '再查重失败'
  } finally {
    recheckLoading.value = false
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
  const id = normalizeWorkIdParam(workIdQuery.value.trim())
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

/** 从路由 query 进入时（如审核页「查看相似度对比记录」）：打开查重记录并按作品 ID 拉取列表 */
function pickQueryWorkId() {
  const raw = route.query.workId
  const s = Array.isArray(raw) ? raw[0] : raw
  return normalizeWorkIdParam(String(s ?? ''))
}

watch(
  () => pickQueryWorkId(),
  async (wid) => {
    if (!wid) return
    mainTab.value = 'records'
    recordTab.value = 'work'
    if (workIdQuery.value !== wid) workIdQuery.value = wid
    await loadByWorkId()
  },
  { immediate: true },
)
</script>

<template>
  <div class="check-shell">
    <div class="check-page">
      <header class="hero">
        <h1 class="title">查重中心</h1>
        <p class="lead">上传作品与全库比对；对已登记链上作品再查重；或检索历史查重记录。</p>
        <div class="main-tabs" role="tablist" aria-label="查重子功能">
          <button
            type="button"
            role="tab"
            class="main-tab"
            :class="{ active: mainTab === 'check' }"
            :aria-selected="mainTab === 'check'"
            @click="mainTab = 'check'"
          >
            <span class="bccr-tab-ic-wrap" aria-hidden="true">
              <BccrIcon name="manual-check" size="sm" />
            </span>
            手动查重
          </button>
          <button
            type="button"
            role="tab"
            class="main-tab"
            :class="{ active: mainTab === 'recheck' }"
            :aria-selected="mainTab === 'recheck'"
            @click="mainTab = 'recheck'"
          >
            <span class="bccr-tab-ic-wrap" aria-hidden="true">
              <BccrIcon name="recheck" size="sm" />
            </span>
            链上作品再查重
          </button>
          <button
            type="button"
            role="tab"
            class="main-tab"
            :class="{ active: mainTab === 'records' }"
            :aria-selected="mainTab === 'records'"
            @click="mainTab = 'records'"
          >
            <span class="bccr-tab-ic-wrap" aria-hidden="true">
              <BccrIcon name="records" size="sm" />
            </span>
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
          <h3 class="results-title">上传比对结果</h3>
          <SimilarityMatchList :items="checkResults" @open-work="goWorkDetail" />
        </div>
        <p
          v-if="manualCompleted && !checkLoading && !checkError && !checkResults.length"
          class="empty-ok"
        >
          库内未发现达到阈值的相似作品。
        </p>
      </section>

      <!-- 链上作品再查重 -->
      <section v-show="mainTab === 'recheck'" class="card card-glow recheck-card">
        <div class="card-head">
          <h2 class="h2">链上作品再查重</h2>
          <p class="card-desc">
            对<strong>本人已登记</strong>的作品再次与全库比对。作品列表与「授权」页相同：输入名称关键字后从下拉中点选。
          </p>
        </div>

        <div class="recheck-pick-shell">
          <div class="field bccr-work-pick-combo recheck-work-pick-host">
            <span class="lbl">待查重作品 <em class="req">*</em></span>
            <p class="field-hint recheck-pick-hint">
              输入<strong>作品名称关键字</strong>后自动请求本人作品列表；也可输入作品 ID 触发检索。在结果中点击一行完成选择。
            </p>
            <div class="combo-wrap">
              <div class="combo-input-row">
                <input
                  v-model="recheckWorkSearchInput"
                  type="text"
                  class="inp combo-inp"
                  placeholder="作品名称关键字或作品 ID…"
                  autocomplete="off"
                  role="combobox"
                  :aria-expanded="recheckWorkSuggestOpen"
                  aria-autocomplete="list"
                  @focus="onRecheckWorkComboFocus"
                  @blur="onRecheckWorkComboBlur"
                  @keydown.escape.prevent="recheckWorkSuggestOpen = false"
                />
                <span
                  v-if="recheckWorkSearchLoading"
                  class="combo-loading"
                  aria-hidden="true"
                  title="搜索中"
                >
                  <span class="combo-loading-spin">⟳</span>
                </span>
              </div>
              <ul
                v-if="recheckWorkSuggestOpen && recheckWorkSearchInput.trim()"
                class="suggest-dd bccr-scroll-slim"
                role="listbox"
                @mousedown="onRecheckSuggestListMouseDown"
              >
                <li
                  v-if="recheckWorkSearchLoading"
                  key="rw-loading"
                  class="suggest-row suggest-row--status"
                >
                  正在搜索作品…
                </li>
                <li
                  v-else-if="!recheckWorkSuggestions.length"
                  key="rw-empty"
                  class="suggest-row suggest-row--status"
                >
                  无匹配作品
                </li>
                <template v-else>
                  <li
                    v-for="(s, idx) in recheckWorkSuggestions"
                    :key="`${s.id}-${idx}`"
                    role="option"
                    class="suggest-row suggest-row--pick"
                    @mousedown.prevent.stop="() => selectRecheckWorkFromList(s)"
                  >
                    <div class="suggest-av">
                      <img
                        v-if="s.cover"
                        :src="s.cover"
                        alt=""
                        class="suggest-av-img"
                        loading="lazy"
                      />
                      <span v-else class="suggest-av-ph" aria-hidden="true">{{
                        (s.title || '作').slice(0, 1).toUpperCase()
                      }}</span>
                    </div>
                    <div class="suggest-txt">
                      <span class="suggest-nick">{{ s.title || '未命名作品' }}</span>
                      <span class="suggest-un mono">{{ s.id }}</span>
                      <span v-if="s.type" class="suggest-type">{{ s.type }}</span>
                    </div>
                  </li>
                </template>
              </ul>
            </div>
            <p v-if="recheckWorkSearchError" class="err-inline">{{ recheckWorkSearchError }}</p>
            <div v-if="recheckWorkConfirmed && recheckWorkPick" class="selected-strip selected-strip--work">
              <div class="selected-av">
                <img
                  v-if="recheckWorkCoverUrl"
                  :src="recheckWorkCoverUrl"
                  alt=""
                  class="selected-av-img"
                />
                <span v-else class="selected-av-ph" aria-hidden="true">{{
                  (recheckWorkPick.title || '作').slice(0, 1).toUpperCase()
                }}</span>
              </div>
              <div class="selected-txt">
                <span class="selected-nick">{{ recheckWorkPick.title || '未命名作品' }}</span>
                <span class="selected-un mono">{{ recheckWorkPick.id }}</span>
                <span v-if="recheckWorkPick.type" class="selected-meta">{{ recheckWorkPick.type }}</span>
              </div>
              <button type="button" class="btn-strip-change" @click="clearRecheckWorkChip">更换</button>
            </div>
          </div>
        </div>

        <p v-if="recheckError" class="err">{{ recheckError }}</p>

        <button
          type="button"
          class="btn-run btn-run--secondary"
          :disabled="recheckLoading || !recheckWorkConfirmed || !recheckWorkId || !auth.isLoggedIn"
          @click="runRecheckChain"
        >
          <span class="btn-run-inner">
            {{ recheckLoading ? '正在再查重…' : '对选中作品再查重' }}
          </span>
        </button>

        <div v-if="recheckResults.length" class="results-block results-block--recheck">
          <h3 class="results-title">再查重结果</h3>
          <SimilarityMatchList :items="recheckResults" @open-work="goWorkDetail" />
        </div>
        <p
          v-if="recheckCompleted && !recheckLoading && !recheckError && !recheckResults.length"
          class="empty-ok"
        >
          再查重完成：库内未发现相似作品。
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
            <span class="bccr-tab-ic-wrap" aria-hidden="true">
              <BccrIcon name="mine" size="sm" />
            </span>
            我的记录
          </button>
          <button
            type="button"
            class="sub-tab"
            :class="{ active: recordTab === 'work' }"
            @click="recordTab = 'work'"
          >
            <span class="bccr-tab-ic-wrap" aria-hidden="true">
              <BccrIcon name="work-id" size="sm" />
            </span>
            按作品 ID
          </button>
          <button
            type="button"
            class="sub-tab"
            :class="{ active: recordTab === 'check' }"
            @click="recordTab = 'check'"
          >
            <span class="bccr-tab-ic-wrap" aria-hidden="true">
              <BccrIcon name="id-card" size="sm" />
            </span>
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

        <div v-if="recordList.length" class="records-panel">
          <div class="records-toolbar">
            <span class="records-count">共 {{ recordList.length }} 条</span>
            <span class="records-hint">点击一行打开详情 · 对比双方作品</span>
          </div>
          <div class="records-scroll bccr-scroll-slim" role="region" aria-label="查重记录列表">
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
                <div
                  class="rec-wpreview"
                  :aria-busy="(modalWorksLoading && !modalSourceWork) || undefined"
                >
                  <div
                    v-if="modalWorksLoading && !modalSourceWork"
                    class="rec-preview-skel"
                  >
                    加载作品与预览…
                  </div>
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
                <code class="rec-wid mono">{{
                  comparePair.sourceId ||
                  (modalSourceWork?.fromManualUpload ? '手动上传' : '—')
                }}</code>
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
  background: var(--bccr-panel-bg);
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
  color: var(--bccr-text);
}

.main-tab.active {
  color: var(--bccr-text);
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.35), rgba(99, 102, 241, 0.28));
  box-shadow: 0 4px 18px rgba(59, 130, 246, 0.18);
}

.card {
  padding: 1.35rem 1.4rem;
  border-radius: 1rem;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: var(--bccr-card);
  margin-bottom: 1rem;
}

.card-glow {
  box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.06), 0 18px 48px var(--bccr-code-bg);
}

.records-card {
  border-color: var(--bccr-choice-surface-border);
  box-shadow: var(--bccr-shadow-sm);
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
  color: var(--bccr-muted);
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
  color: var(--bccr-danger);
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

.recheck-section {
  margin-top: 1.35rem;
  padding-top: 1.25rem;
  border-top: 1px solid rgba(148, 163, 184, 0.16);
}

.sub-h3 {
  margin: 0 0 0.5rem;
  font-size: 1rem;
  font-weight: 650;
  color: var(--bccr-text);
}

.recheck-lead {
  margin: 0 0 0.9rem;
  font-size: 0.84rem;
  line-height: 1.55;
  color: var(--bccr-muted);
}

.recheck-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.65rem;
  margin-bottom: 0.75rem;
}

.recheck-field {
  flex: 1 1 12rem;
  min-width: 10rem;
}

.btn-recheck-search {
  padding: 0.48rem 0.95rem;
  border-radius: 0.5rem;
  border: 1px solid var(--bccr-btn-info-border);
  background: var(--bccr-btn-info-bg);
  color: var(--bccr-btn-info-text);
  font-size: 0.86rem;
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
}

.btn-recheck-search:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn-recheck-search:hover:not(:disabled) {
  background: var(--bccr-btn-info-hover);
}

.hint {
  margin: 0 0 0.65rem;
  font-size: 0.82rem;
  color: var(--bccr-muted);
}

.select-recheck {
  min-width: 0;
  width: 100%;
  cursor: pointer;
}

.recheck-section .btn-run {
  margin-top: 0.65rem;
}

.recheck-section .btn-run--secondary {
  background: linear-gradient(135deg, #0e7490, #2563eb);
  box-shadow: 0 8px 24px rgba(14, 116, 144, 0.28);
}

.results-block--recheck {
  margin-top: 1.1rem;
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
  color: var(--bccr-muted);
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
  color: var(--bccr-success-text);
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
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.42rem 0.85rem;
  border-radius: 0.5rem;
  border: 1px solid var(--bccr-option-border);
  background: var(--bccr-option-bg);
  color: var(--bccr-option-text);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    background 0.12s,
    border-color 0.12s,
    color 0.12s;
}

.sub-tab:hover {
  border-color: var(--bccr-option-hover-border);
  background: var(--bccr-option-hover-bg);
  color: var(--bccr-text);
}

.sub-tab.active {
  border-color: var(--bccr-option-active-border);
  background: var(--bccr-option-active-bg);
  color: var(--bccr-option-active-text);
}

.query-panel {
  padding: 1rem;
  margin-bottom: 1rem;
  border-radius: 0.75rem;
  background: var(--bccr-choice-surface-bg);
  border: 1px solid var(--bccr-choice-surface-border);
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
  color: var(--bccr-muted);
  padding: 0.45rem 0.55rem;
  border-radius: 0.4rem;
  background: var(--bccr-card);
}

.inp {
  padding: 0.55rem 0.7rem;
  border-radius: 0.5rem;
  border: 1px solid var(--bccr-border);
  background: var(--bccr-card);
  color: var(--bccr-text);
  font-size: 0.9rem;
}

.inp:focus {
  outline: none;
  border-color: rgba(167, 139, 250, 0.45);
  box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.15);
}

/* 再查重：作品选择区与授权页共用 work-pick-combo.css；此处为查重页容器与输入焦点琥珀色 */
.recheck-pick-shell {
  padding: 1rem 1.1rem 1.05rem;
  border-radius: 0.85rem;
  border: 1px solid rgba(251, 191, 36, 0.18);
  background: linear-gradient(
    155deg,
    rgba(245, 158, 11, 0.07) 0%,
    var(--bccr-card) 48%,
    rgba(99, 102, 241, 0.06) 100%
  );
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.recheck-pick-hint {
  margin: 0 0 0.5rem;
  font-size: 0.8rem;
  line-height: 1.55;
  color: var(--bccr-muted);
}

.bccr-work-pick-combo.recheck-work-pick-host .inp:focus {
  outline: none;
  border-color: rgba(251, 191, 36, 0.45);
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.12);
}

.err-inline {
  margin: 0.35rem 0 0;
  font-size: 0.78rem;
  color: var(--bccr-danger);
}

.btn-query {
  margin-top: 0.75rem;
  width: 100%;
  padding: 0.55rem 1rem;
  border-radius: 0.5rem;
  border: none;
  font-weight: 650;
  font-size: 0.88rem;
  color: var(--bccr-text);
  cursor: pointer;
  background: linear-gradient(135deg, rgba(124, 58, 237, 0.9), rgba(59, 130, 246, 0.85));
  box-shadow: 0 6px 22px rgba(91, 33, 182, 0.25);
}

.btn-query:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.records-panel {
  margin-top: 0.5rem;
  border-radius: 0.9rem;
  border: 1px solid var(--bccr-choice-surface-border);
  background: var(--bccr-choice-surface-bg);
  overflow: hidden;
}

.records-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.35rem 0.75rem;
  padding: 0.55rem 0.8rem;
  border-bottom: 1px solid var(--bccr-choice-surface-border);
  background: rgba(255, 255, 255, 0.72);
}

.records-count {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--bccr-text);
}

.records-hint {
  font-size: 0.72rem;
  color: var(--bccr-muted);
}

.records-scroll {
  max-height: min(52vh, 480px);
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 0.2rem;
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
  border-bottom: 1px solid var(--bccr-choice-surface-border);
  border-left: 3px solid var(--bccr-accent-border);
  background: #ffffff;
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
  background: var(--bccr-option-hover-bg);
}

.records-row.tone-high {
  border-left-color: var(--bccr-danger);
}

.records-row.tone-mid {
  border-left-color: #fbbf24;
}

.records-row.tone-low {
  border-left-color: #34d399;
}

.records-row.tone-none {
  border-left-color: var(--bccr-text-hint);
}

.records-row.tone-default {
  border-left-color: var(--bccr-accent-border);
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
  color: var(--bccr-warning-text);
}

.lvl-chip {
  display: inline-block;
  padding: 0.12rem 0.38rem;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 650;
  background: var(--bccr-option-active-bg);
  color: var(--bccr-option-active-text);
}

.records-row-id {
  font-size: 0.72rem;
  color: var(--bccr-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.col-time {
  flex-shrink: 0;
  font-size: 0.7rem;
  color: var(--bccr-label);
  white-space: nowrap;
}

.col-go {
  flex-shrink: 0;
  color: var(--bccr-placeholder);
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
  background: var(--bccr-card);
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
  color: var(--bccr-muted);
}

.rw-main {
  flex: 1;
  min-width: 0;
  color: var(--bccr-text);
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

.rec-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: var(--bccr-overlay);
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
  background: var(--bccr-surface-overlay);
  box-shadow: 0 28px 80px var(--bccr-overlay);
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
  border-bottom-color: var(--bccr-danger);
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
  color: var(--bccr-text);
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
  color: var(--bccr-muted);
  font-size: 1.35rem;
  line-height: 1;
  cursor: pointer;
}

.rec-modal-close:hover {
  background: rgba(248, 113, 113, 0.15);
  color: var(--bccr-danger);
}

.rec-modal-metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.55rem;
  padding: 0.85rem 1.1rem;
  border-bottom: 1px solid var(--bccr-choice-surface-border);
  background: #ffffff;
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
  color: var(--bccr-warning-text);
}

.rec-metric-v.lvl {
  font-size: 1rem;
  color: var(--bccr-option-active-text);
}

.rec-metric-v.norm {
  font-size: 0.86rem;
  font-weight: 600;
  color: var(--bccr-text);
}

.rec-compare {
  padding: 0.9rem 1.1rem 0.4rem;
  overflow-y: auto;
  background: var(--bccr-panel-muted);
  border-top: 1px solid var(--bccr-choice-surface-border);
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
  border: 1px solid var(--bccr-choice-surface-border);
  background: var(--bccr-choice-surface-bg);
  box-shadow: var(--bccr-shadow-sm);
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.rec-wcard--src {
  border-left: 3px solid var(--bccr-accent);
}

.rec-wcard--tgt {
  border-left: 3px solid #7c3aed;
}

.rec-wtag {
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--bccr-accent-text);
}

.rec-wcard--tgt .rec-wtag {
  color: #6d28d9;
}

.rec-wtitle {
  margin: 0;
  font-size: 0.88rem;
  font-weight: 650;
  color: var(--bccr-text);
  line-height: 1.45;
}

.rec-wauthor {
  margin: 0;
  font-size: 0.74rem;
  color: var(--bccr-text-secondary);
  word-break: break-all;
}

.rec-wcard--tgt .rec-wauthor {
  color: var(--bccr-muted);
}

.rec-wpreview {
  position: relative;
  border-radius: 0.55rem;
  overflow: hidden;
  border: 1px solid var(--bccr-choice-surface-border);
  background: #ffffff;
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
  color: var(--bccr-muted);
  max-height: 120px;
  overflow: hidden;
  text-align: left;
  align-self: stretch;
}

.rec-preview-fallback,
.rec-preview-skel {
  padding: 0.65rem 0.75rem;
  font-size: 0.72rem;
  color: var(--bccr-muted);
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
  padding: 0.35rem 0.45rem;
  border-radius: 0.4rem;
  color: var(--bccr-text-secondary);
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid var(--bccr-choice-surface-border);
  word-break: break-all;
}

.rec-wbtn {
  margin-top: 0.25rem;
  padding: 0.48rem 0.65rem;
  border-radius: 0.5rem;
  border: 1px solid var(--bccr-btn-info-border);
  background: var(--bccr-btn-info-bg);
  color: var(--bccr-btn-info-text);
  font-size: 0.8rem;
  font-weight: 650;
  cursor: pointer;
  transition:
    background 0.12s,
    border-color 0.12s;
}

.rec-wbtn:hover:not(:disabled) {
  background: var(--bccr-btn-info-hover);
}

.rec-wbtn:disabled {
  opacity: 0.38;
  cursor: not-allowed;
}

.rec-wbtn--tgt {
  border-color: rgba(124, 58, 237, 0.32);
  background: rgba(124, 58, 237, 0.08);
  color: #6d28d9;
}

.rec-wbtn--tgt:hover:not(:disabled) {
  background: rgba(124, 58, 237, 0.14);
}

.rec-vs {
  align-self: center;
  flex-shrink: 0;
  width: 2.1rem;
  height: 2.1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: var(--bccr-muted);
  background: #ffffff;
  border: 1px solid var(--bccr-choice-surface-border);
  box-shadow: var(--bccr-shadow-sm);
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
  color: var(--bccr-muted);
  word-break: break-all;
  font-size: 0.72rem;
}

.rec-modal-tip {
  margin: 0.55rem 0 0;
  font-size: 0.68rem;
  color: var(--bccr-muted);
}

.records-empty {
  text-align: center;
  padding: 2rem 1rem;
  margin-top: 0.5rem;
  border-radius: 0.75rem;
  border: 1px dashed var(--bccr-choice-surface-border);
  background: var(--bccr-choice-surface-bg);
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
