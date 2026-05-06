<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { normalizeMediaSrc } from '@/api/client'
import * as authApi from '@/api/authorization'
import * as userApi from '@/api/user'
import { fetchMyWorkList, formatWorkSummary, normalizeListPage } from '@/api/work'
import {
  canRevokeAsGrantor,
  formatAuthStatus,
  pickAuthId,
  pickAuthStatusRaw,
  pickAuthTypeLabel,
  pickGrantee,
  pickGrantor,
  pickWorkId,
  shortAddress,
} from '@/lib/authorizationDisplay'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

/** @type {import('vue').Ref<'grant' | 'records'>} */
const mainTab = ref('grant')

/** 与后端授权类型一致：exclusive / non-exclusive / sublicense */
const AUTH_TYPE_OPTIONS = [
  { value: 'exclusive', label: '独占授权', hint: '被授权方在约定范围内独占使用该作品' },
  { value: 'non-exclusive', label: '非独占授权', hint: '您仍可自行或向他人授权，被授权方在约定范围内使用' },
  { value: 'sublicense', label: '分许可', hint: '允许被授权方在约定条件下向第三方再许可' },
]

/** 输入框：作品关键词 / ID */
const grantWorkSearchInput = ref('')
/** 从列表选定后提交用的作品 ID */
const grantWorkId = ref('')
const grantWorkConfirmed = ref(false)
/** 已选作品展示（formatWorkSummary） */
/** @type {import('vue').Ref<ReturnType<typeof formatWorkSummary> | null>} */
const grantWorkPick = ref(null)

const workSearchLoading = ref(false)
const workSearchError = ref('')
/** @type {import('vue').Ref<ReturnType<typeof formatWorkSummary>[]>} */
const workSuggestions = ref([])
const workSuggestOpen = ref(false)
let workSuggestTimer = null
let workBlurTimer = null

/** 解析并确认后的被授权方链上地址（由用户名检索得到） */
const granteeAddress = ref('')
/** 输入框内容（输入时实时请求建议列表） */
const granteeSearchInput = ref('')
/** 选中用户的 username，用于判断用户是否正在修改已选项 */
const selectedUsername = ref('')
const searchUserLoading = ref(false)
const searchUserError = ref('')
/** @type {import('vue').Ref<Record<string, unknown> | null>} */
const granteeLookup = ref(null)
const granteeConfirmed = ref(false)
/** @type {import('vue').Ref<Record<string, unknown>[]>} */
const suggestions = ref([])
const suggestOpen = ref(false)

let granteeSuggestTimer = null
let granteeBlurTimer = null

onBeforeUnmount(() => {
  if (granteeSuggestTimer) clearTimeout(granteeSuggestTimer)
  if (granteeBlurTimer) clearTimeout(granteeBlurTimer)
  if (workSuggestTimer) clearTimeout(workSuggestTimer)
  if (workBlurTimer) clearTimeout(workBlurTimer)
})
const authType = ref('non-exclusive')
const validUntil = ref('')
const remark = ref('')
const grantLoading = ref(false)
const grantError = ref('')
/** @type {import('vue').Ref<Record<string, unknown> | null>} */
const grantSuccess = ref(null)

/** @type {import('vue').Ref<'out' | 'in' | 'work' | 'id'>} */
const recordTab = ref('out')
const workIdQuery = ref('')
const authIdQuery = ref('')
const recordsLoading = ref(false)
const recordsError = ref('')
/** @type {import('vue').Ref<Record<string, unknown>[]>} */
const recordList = ref([])
/** @type {import('vue').Ref<Record<string, unknown> | null>} */
const singleRecord = ref(null)
const revokingId = ref('')
/** 当前子标签下是否已完成一次查询（用于空态文案） */
const recordsFetched = ref(false)

watch(recordTab, () => {
  recordList.value = []
  singleRecord.value = null
  recordsError.value = ''
  recordsFetched.value = false
})

watch(grantWorkSearchInput, (v) => {
  if (workSuggestTimer) clearTimeout(workSuggestTimer)
  workSearchError.value = ''
  const t = v.trim()
  if (grantWorkConfirmed.value && grantWorkId.value && t === grantWorkId.value) {
    return
  }
  if (grantWorkConfirmed.value && grantWorkId.value && t !== grantWorkId.value) {
    clearWorkSelectionFull()
  }
  const q = v.trim()
  if (q.length < 1) {
    workSuggestions.value = []
    workSuggestOpen.value = false
    return
  }
  workSuggestTimer = setTimeout(() => {
    workSuggestTimer = null
    fetchWorkSuggestions(q)
  }, 260)
})

watch(granteeSearchInput, (v) => {
  if (granteeSuggestTimer) clearTimeout(granteeSuggestTimer)
  searchUserError.value = ''
  const t = v.trim()
  if (granteeConfirmed.value && selectedUsername.value && t === selectedUsername.value) {
    return
  }
  if (granteeConfirmed.value && selectedUsername.value && t !== selectedUsername.value) {
    clearGranteeSelectionFull()
  }
  const q = v.trim()
  if (q.length < 1) {
    suggestions.value = []
    suggestOpen.value = false
    return
  }
  granteeSuggestTimer = setTimeout(() => {
    granteeSuggestTimer = null
    fetchSuggestions(q)
  }, 260)
})

const blockchainFromUser = computed(() => {
  const u = /** @type {Record<string, unknown>} */ (authStore.user || {})
  return String(u.blockchainAddress ?? u.blockChainAddress ?? '').trim()
})

const canSubmitGrant = computed(() => {
  if (grantLoading.value) return false
  return (
    grantWorkConfirmed.value &&
    grantWorkId.value.trim() !== '' &&
    granteeConfirmed.value &&
    granteeAddress.value.trim() !== ''
  )
})

const grantWorkCoverUrl = computed(() => {
  const p = grantWorkPick.value
  if (!p?.cover) return ''
  return typeof p.cover === 'string' ? p.cover : ''
})

const granteeDisplayName = computed(() => {
  const L = granteeLookup.value
  if (!L) return ''
  const nick = String(L.nickname ?? '').trim()
  const user = String(L.username ?? '').trim()
  return nick || user || '用户'
})

const granteeAvatarUrl = computed(() => {
  const L = granteeLookup.value
  if (!L) return ''
  const raw = L.avatar
  if (typeof raw !== 'string' || !raw.trim()) return ''
  return normalizeMediaSrc(raw.trim())
})

function formatTime(v) {
  if (v == null || v === '') return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return String(v)
  return d.toLocaleString('zh-CN')
}

/** 将 datetime-local 转为后端易解析的字符串（无值则空） */
function toExpireTimePayload(v) {
  const s = String(v ?? '').trim()
  if (!s) return ''
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return `${s}:00`
  return s
}

/** @param {unknown} id */
function goWorkDetail(id) {
  if (id == null || String(id).trim() === '') return
  router.push({ name: 'work-detail', params: { workId: String(id) } })
}

function resetGrantForm() {
  grantError.value = ''
  grantSuccess.value = null
}

function dedupeByUsername(list) {
  const seen = new Set()
  const out = []
  for (const row of list) {
    if (!row || typeof row !== 'object') continue
    const u = String(/** @type {Record<string, unknown>} */ (row).username ?? '').trim()
    if (!u || seen.has(u)) continue
    seen.add(u)
    out.push(/** @type {Record<string, unknown>} */ (row))
  }
  return out
}

/** @param {Record<string, unknown>} u */
function userRowAvatar(u) {
  const raw = u.avatar
  if (typeof raw === 'string' && raw.trim()) return normalizeMediaSrc(raw.trim())
  return ''
}

/** @param {Record<string, unknown>} u */
function userRowNick(u) {
  const nick = String(u.nickname ?? '').trim()
  const un = String(u.username ?? '').trim()
  return nick || un || '用户'
}

/** @param {Record<string, unknown>} u */
function userRowUn(u) {
  return String(u.username ?? '').trim() || '—'
}

function clearGranteeSelectionFull() {
  granteeLookup.value = null
  granteeConfirmed.value = false
  granteeAddress.value = ''
  selectedUsername.value = ''
}

function clearGranteeChip() {
  granteeSearchInput.value = ''
  suggestions.value = []
  suggestOpen.value = false
  clearGranteeSelectionFull()
}

function clearWorkSelectionFull() {
  grantWorkId.value = ''
  grantWorkConfirmed.value = false
  grantWorkPick.value = null
}

function clearWorkChip() {
  grantWorkSearchInput.value = ''
  workSuggestions.value = []
  workSuggestOpen.value = false
  clearWorkSelectionFull()
}

async function fetchWorkSuggestions(keyword) {
  const kw = keyword.trim()
  if (!kw) return
  workSearchLoading.value = true
  workSuggestOpen.value = true
  workSuggestions.value = []
  workSearchError.value = ''
  try {
    const data = await fetchMyWorkList({
      keyword: kw,
      workName: kw,
      page: 1,
      size: 24,
    })
    const page = normalizeListPage(data)
    workSuggestions.value = page.items.map((row) =>
      formatWorkSummary(/** @type {Record<string, unknown>} */ (row)),
    )
  } catch (e) {
    workSearchError.value = e?.message || '作品搜索失败'
    workSuggestions.value = []
  } finally {
    workSearchLoading.value = false
  }
}

/** @param {ReturnType<typeof formatWorkSummary>} s */
function selectWorkFromList(s) {
  workSearchError.value = ''
  const id = String(s.id ?? '').trim()
  if (!id) {
    workSearchError.value = '无效作品'
    return
  }
  grantWorkPick.value = s
  grantWorkId.value = id
  grantWorkConfirmed.value = true
  grantWorkSearchInput.value = id
  workSuggestions.value = []
  workSuggestOpen.value = false
}

function onWorkComboFocus() {
  resetGrantForm()
  if (workBlurTimer) {
    clearTimeout(workBlurTimer)
    workBlurTimer = null
  }
  const q = grantWorkSearchInput.value.trim()
  if (grantWorkConfirmed.value && grantWorkId.value && q === grantWorkId.value) {
    workSuggestOpen.value = false
    return
  }
  if (q) {
    workSuggestOpen.value = true
    if (!workSearchLoading.value && workSuggestions.value.length === 0) {
      fetchWorkSuggestions(q)
    }
  }
}

function onWorkComboBlur() {
  if (workBlurTimer) clearTimeout(workBlurTimer)
  workBlurTimer = setTimeout(() => {
    workBlurTimer = null
    workSuggestOpen.value = false
  }, 200)
}

async function fetchSuggestions(keyword) {
  if (!keyword.trim()) return
  searchUserLoading.value = true
  suggestOpen.value = true
  suggestions.value = []
  searchUserError.value = ''
  try {
    let list = []
    try {
      const data = await userApi.searchUsersByKeyword(keyword)
      list = dedupeByUsername(userApi.normalizeUserSearchList(data))
    } catch {
      /* 无 /api/user/search 或未部署 */
    }
    if (list.length === 0) {
      try {
        const one = await userApi.fetchUserAddressByUsername(keyword)
        if (one && typeof one === 'object') {
          list = dedupeByUsername([/** @type {Record<string, unknown>} */ (one)])
        }
      } catch {
        /* 精确匹配也无结果 */
      }
    }
    suggestions.value = list
  } finally {
    searchUserLoading.value = false
  }
}

/** @param {Record<string, unknown>} u */
function selectGranteeFromList(u) {
  searchUserError.value = ''
  const addr = String(u.blockchainAddress ?? u.blockChainAddress ?? '').trim()
  if (!addr) {
    searchUserError.value = '该用户未绑定链上地址，无法作为被授权方'
    return
  }
  granteeLookup.value = u
  granteeAddress.value = addr
  granteeConfirmed.value = true
  const un = userRowUn(u)
  selectedUsername.value = un !== '—' ? un : ''
  granteeSearchInput.value = selectedUsername.value
  suggestions.value = []
  suggestOpen.value = false
}

function onGranteeComboFocus() {
  resetGrantForm()
  if (granteeBlurTimer) {
    clearTimeout(granteeBlurTimer)
    granteeBlurTimer = null
  }
  const q = granteeSearchInput.value.trim()
  if (granteeConfirmed.value && selectedUsername.value && q === selectedUsername.value) {
    suggestOpen.value = false
    return
  }
  if (q) {
    suggestOpen.value = true
    if (!searchUserLoading.value && suggestions.value.length === 0) {
      fetchSuggestions(q)
    }
  }
}

function onGranteeComboBlur() {
  if (granteeBlurTimer) clearTimeout(granteeBlurTimer)
  granteeBlurTimer = setTimeout(() => {
    granteeBlurTimer = null
    suggestOpen.value = false
  }, 200)
}

/** 在建议列表上按下鼠标时阻止默认行为，避免输入框先失焦导致无法选中行 */
function onSuggestListMouseDown(ev) {
  ev.preventDefault()
}

async function submitGrant() {
  grantError.value = ''
  grantSuccess.value = null
  if (!grantWorkConfirmed.value || !grantWorkId.value.trim()) {
    grantError.value = '请从列表中选择要授权的作品'
    return
  }
  if (!granteeConfirmed.value || !granteeAddress.value.trim()) {
    grantError.value = '请从列表中选择被授权方用户'
    return
  }
  grantLoading.value = true
  try {
    const body = {
      workId: grantWorkId.value,
      toAddress: granteeAddress.value,
      authType: authType.value,
    }
    const exp = toExpireTimePayload(validUntil.value)
    if (exp) body.expireTime = exp
    const data = await authApi.grantAuthorization(body)
    grantSuccess.value =
      data && typeof data === 'object'
        ? /** @type {Record<string, unknown>} */ (data)
        : { message: '授权已提交' }
    granteeSearchInput.value = ''
    clearGranteeSelectionFull()
    suggestions.value = []
    suggestOpen.value = false
    clearWorkChip()
  } catch (e) {
    grantError.value = e?.message || '提交失败'
  } finally {
    grantLoading.value = false
  }
}

function setRecordsList(data) {
  recordList.value = authApi.normalizeAuthorizationList(data)
}

async function loadOutgoing() {
  recordsLoading.value = true
  recordsError.value = ''
  singleRecord.value = null
  try {
    const data = await authApi.fetchAuthorizationFromMe({ page: 1, size: 20 })
    setRecordsList(data)
  } catch (e) {
    recordsError.value = e?.message || '加载失败'
    recordList.value = []
  } finally {
    recordsLoading.value = false
    recordsFetched.value = true
  }
}

async function loadIncoming() {
  recordsLoading.value = true
  recordsError.value = ''
  singleRecord.value = null
  try {
    const data = await authApi.fetchAuthorizationToMe({ page: 1, size: 20 })
    setRecordsList(data)
  } catch (e) {
    recordsError.value = e?.message || '加载失败'
    recordList.value = []
  } finally {
    recordsLoading.value = false
    recordsFetched.value = true
  }
}

async function loadByWorkId() {
  const id = workIdQuery.value.trim()
  if (!id) {
    recordsError.value = '请输入作品 ID'
    return
  }
  recordsLoading.value = true
  recordsError.value = ''
  singleRecord.value = null
  try {
    const data = await authApi.fetchAuthorizationByWorkId(id, {
      page: 1,
      size: 20,
    })
    setRecordsList(data)
  } catch (e) {
    recordsError.value = e?.message || '查询失败'
    recordList.value = []
  } finally {
    recordsLoading.value = false
    recordsFetched.value = true
  }
}

async function loadByAuthId() {
  const id = authIdQuery.value.trim()
  if (!id) {
    recordsError.value = '请输入授权记录 ID'
    return
  }
  recordsLoading.value = true
  recordsError.value = ''
  recordList.value = []
  try {
    const data = await authApi.fetchAuthorizationById(id)
    singleRecord.value =
      data && typeof data === 'object'
        ? /** @type {Record<string, unknown>} */ (data)
        : null
  } catch (e) {
    recordsError.value = e?.message || '记录不存在或查询失败'
    singleRecord.value = null
  } finally {
    recordsLoading.value = false
    recordsFetched.value = true
  }
}

/** @param {Record<string, unknown>} rec */
async function tryRevoke(rec) {
  const id = pickAuthId(rec)
  if (!id) return
  if (!canRevokeAsGrantor(blockchainFromUser.value, rec)) return
  if (!window.confirm(`确定撤销授权记录「${shortAddress(id, 8, 6)}」？`)) return
  const reasonRaw = window.prompt('撤销原因（可选，留空则不传）', remark.value.trim())
  const reason =
    reasonRaw != null && String(reasonRaw).trim() !== ''
      ? String(reasonRaw).trim()
      : ''
  revokingId.value = id
  recordsError.value = ''
  try {
    await authApi.revokeAuthorization(id, reason ? { reason } : {})
    if (recordTab.value === 'out') await loadOutgoing()
    else if (recordTab.value === 'in') await loadIncoming()
    else if (recordTab.value === 'work') await loadByWorkId()
    else if (singleRecord.value && pickAuthId(singleRecord.value) === id) {
      await loadByAuthId()
    }
  } catch (e) {
    recordsError.value = e?.message || '撤销失败'
  } finally {
    revokingId.value = ''
  }
}
</script>

<template>
  <div class="auth-shell">
    <div class="auth-page">
      <header class="hero">
        <div class="hero-glow" aria-hidden="true" />
        <h1 class="title">授权中心</h1>
        <p class="lead">
          按用户名检索被授权人并核对资料后发放许可，并支持授权记录查询与撤销。
        </p>
        <div class="main-tabs" role="tablist" aria-label="授权功能">
          <button
            type="button"
            role="tab"
            class="main-tab"
            :class="{ active: mainTab === 'grant' }"
            :aria-selected="mainTab === 'grant'"
            @click="mainTab = 'grant'"
          >
            <span class="main-tab-ic" aria-hidden="true">✦</span>
            发起授权
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
            授权记录
          </button>
        </div>
      </header>

      <!-- 发起授权 -->
      <section v-show="mainTab === 'grant'" class="card card-grant">
        <div class="card-head">
          <h2 class="h2">新建授权</h2>
          <p class="card-desc">
            先选本人作品再选被授权方：作品待选仅来自「我的作品」接口；被授权方需已绑定链上地址。
          </p>
        </div>

        <div class="form-grid">
          <div class="field span-2 grantee-field auth-work-field">
            <span class="lbl">授权作品 <em class="req">*</em></span>
            <p class="field-hint">
              输入<strong>作品名称关键字</strong>后，请求本人作品列表并按关键字筛选，在下拉结果中点选一条；也可输入作品 ID（若后端支持按 ID 匹配）。
            </p>
            <div class="combo-wrap">
              <div class="combo-input-row">
                <input
                  v-model="grantWorkSearchInput"
                  type="text"
                  class="inp combo-inp"
                  placeholder="输入作品名称关键字…"
                  autocomplete="off"
                  role="combobox"
                  :aria-expanded="workSuggestOpen"
                  aria-autocomplete="list"
                  @focus="onWorkComboFocus"
                  @blur="onWorkComboBlur"
                  @keydown.escape.prevent="workSuggestOpen = false"
                />
                <span
                  v-if="workSearchLoading"
                  class="combo-loading"
                  aria-hidden="true"
                  title="搜索中"
                >
                  <span class="combo-loading-spin">⟳</span>
                </span>
              </div>
              <ul
                v-if="workSuggestOpen && grantWorkSearchInput.trim()"
                class="suggest-dd"
                role="listbox"
                @mousedown="onSuggestListMouseDown"
              >
                <li
                  v-if="workSearchLoading"
                  key="w-loading"
                  class="suggest-row suggest-row--status"
                >
                  正在搜索作品…
                </li>
                <li
                  v-else-if="!workSuggestions.length"
                  key="w-empty"
                  class="suggest-row suggest-row--status"
                >
                  无匹配作品
                </li>
                <template v-else>
                  <li
                    v-for="(s, idx) in workSuggestions"
                    :key="`${s.id}-${idx}`"
                    role="option"
                    class="suggest-row suggest-row--pick"
                    @mousedown.prevent.stop="() => selectWorkFromList(s)"
                  >
                    <div class="suggest-av">
                      <img
                        v-if="s.cover"
                        :src="s.cover"
                        alt=""
                        class="suggest-av-img"
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
            <p v-if="workSearchError" class="err-inline">{{ workSearchError }}</p>
            <div v-if="grantWorkConfirmed && grantWorkPick" class="selected-strip selected-strip--work">
              <div class="selected-av">
                <img
                  v-if="grantWorkCoverUrl"
                  :src="grantWorkCoverUrl"
                  alt=""
                  class="selected-av-img"
                />
                <span v-else class="selected-av-ph" aria-hidden="true">{{
                  (grantWorkPick.title || '作').slice(0, 1).toUpperCase()
                }}</span>
              </div>
              <div class="selected-txt">
                <span class="selected-nick">{{ grantWorkPick.title || '未命名作品' }}</span>
                <span class="selected-un mono">{{ grantWorkPick.id }}</span>
                <span v-if="grantWorkPick.type" class="selected-meta">{{ grantWorkPick.type }}</span>
              </div>
              <button type="button" class="btn-strip-change" @click="clearWorkChip">更换</button>
            </div>
            <p class="api-hint">
              本人作品列表
              <code class="mono">GET /api/work/my</code>
              ：搜索时携带您输入的关键字（<code class="mono">keyword</code> 与可选 <code class="mono">workName</code>，便于后端按作品名过滤）；提交授权为
              <code class="mono">POST /api/auth/authorize</code>
              ，其中
              <code class="mono">authType</code>
              为
              <code class="mono">exclusive</code> /
              <code class="mono">non-exclusive</code> /
              <code class="mono">sublicense</code>
              之一。
            </p>
          </div>

          <div class="field span-2 grantee-field auth-grantee-field">
            <span class="lbl">被授权方 <em class="req">*</em></span>
            <p class="field-hint">输入时自动搜索，在列表中点击一行完成选择。</p>
            <div class="combo-wrap">
              <div class="combo-input-row">
                <input
                  v-model="granteeSearchInput"
                  type="text"
                  class="inp combo-inp"
                  placeholder="输入用户名…"
                  autocomplete="off"
                  role="combobox"
                  :aria-expanded="suggestOpen"
                  aria-autocomplete="list"
                  @focus="onGranteeComboFocus"
                  @blur="onGranteeComboBlur"
                  @keydown.escape.prevent="suggestOpen = false"
                />
                <span
                  v-if="searchUserLoading"
                  class="combo-loading"
                  aria-hidden="true"
                  title="搜索中"
                >
                  <span class="combo-loading-spin">⟳</span>
                </span>
              </div>
              <ul
                v-if="suggestOpen && granteeSearchInput.trim()"
                class="suggest-dd"
                role="listbox"
                @mousedown="onSuggestListMouseDown"
              >
                <li
                  v-if="searchUserLoading"
                  key="s-loading"
                  class="suggest-row suggest-row--status"
                >
                  正在搜索…
                </li>
                <li
                  v-else-if="!suggestions.length"
                  key="s-empty"
                  class="suggest-row suggest-row--status"
                >
                  无匹配用户
                </li>
                <template v-else>
                  <li
                    v-for="(u, idx) in suggestions"
                    :key="`${userRowUn(u)}-${idx}`"
                    role="option"
                    class="suggest-row suggest-row--pick"
                    @mousedown.prevent.stop="() => selectGranteeFromList(u)"
                  >
                    <div class="suggest-av">
                      <img
                        v-if="userRowAvatar(u)"
                        :src="userRowAvatar(u)"
                        alt=""
                        class="suggest-av-img"
                      />
                      <span v-else class="suggest-av-ph" aria-hidden="true">{{
                        userRowNick(u).slice(0, 1).toUpperCase()
                      }}</span>
                    </div>
                    <div class="suggest-txt">
                      <span class="suggest-nick">{{ userRowNick(u) }}</span>
                      <span class="suggest-un mono">@{{ userRowUn(u) }}</span>
                    </div>
                  </li>
                </template>
              </ul>
            </div>
            <p v-if="searchUserError" class="err-inline">{{ searchUserError }}</p>
            <div v-if="granteeConfirmed && granteeLookup" class="selected-strip">
              <div class="selected-av">
                <img
                  v-if="granteeAvatarUrl"
                  :src="granteeAvatarUrl"
                  alt=""
                  class="selected-av-img"
                />
                <span v-else class="selected-av-ph" aria-hidden="true">{{
                  granteeDisplayName.slice(0, 1).toUpperCase()
                }}</span>
              </div>
              <div class="selected-txt">
                <span class="selected-nick">{{ granteeDisplayName }}</span>
                <span class="selected-un mono">@{{ String(granteeLookup.username ?? '').trim() || '—' }}</span>
                <span class="selected-addr mono" :title="String(granteeLookup.blockchainAddress ?? '')">{{
                  shortAddress(String(granteeLookup.blockchainAddress ?? ''), 10, 8)
                }}</span>
              </div>
              <button type="button" class="btn-strip-change" @click="clearGranteeChip">更换</button>
            </div>
            <p class="api-hint">
              实时列表来自
              <code class="mono">GET /api/user/search?keyword=</code>
              ；若接口不可用，会回退尝试
              <code class="mono">GET /api/user/address?username=</code>
              （需输入与用户名完全一致）。
            </p>
          </div>

          <div class="field span-2">
            <span class="lbl">授权类型</span>
            <div class="type-grid">
              <label
                v-for="o in AUTH_TYPE_OPTIONS"
                :key="o.value"
                class="type-card"
                :class="{ on: authType === o.value }"
              >
                <input
                  v-model="authType"
                  type="radio"
                  class="sr-only"
                  :value="o.value"
                />
                <span class="type-title">{{ o.label }}</span>
                <span class="type-hint">{{ o.hint }}</span>
              </label>
            </div>
          </div>

          <label class="field">
            <span class="lbl">有效期至 <span class="opt">（可选）</span></span>
            <input v-model="validUntil" type="datetime-local" class="inp" />
          </label>

          <label class="field">
            <span class="lbl">备注 <span class="opt">（可选）</span></span>
            <input
              v-model.trim="remark"
              type="text"
              class="inp"
              placeholder="仅本地备忘；发起授权接口无此字段。撤销时可作默认撤销原因提示"
            />
          </label>

          <label class="field span-2">
            <span class="lbl">您的链上地址</span>
            <div class="addr-pill">
              <code class="mono">{{ blockchainFromUser || '未绑定 · 请在个人资料中维护' }}</code>
            </div>
          </label>
        </div>

        <p v-if="grantError" class="err">{{ grantError }}</p>

        <div v-if="grantSuccess" class="success-panel">
          <div class="success-ic" aria-hidden="true">✓</div>
          <div>
            <p class="success-title">授权请求已受理</p>
            <p class="success-meta mono">
              {{
                pickAuthId(
                  /** @type {Record<string, unknown>} */ (grantSuccess),
                ) || '请在后端返回体中查看 authId / txHash'
              }}
            </p>
          </div>
        </div>

        <button
          type="button"
          class="btn-primary"
          :disabled="!canSubmitGrant"
          @click="submitGrant"
        >
          <span class="btn-primary-inner">
            {{ grantLoading ? '正在提交…' : '确认发起授权' }}
          </span>
        </button>
      </section>

      <!-- 授权记录 -->
      <section v-show="mainTab === 'records'" class="card card-records">
        <div class="card-head">
          <h2 class="h2">记录查询</h2>
          <p class="card-desc">
            「我发出 / 我收到」由登录态经
            <code class="mono">GET /api/auth/my/out</code>、
            <code class="mono">GET /api/auth/my/in</code>
            分页查询；亦可按作品 ID 或授权记录 ID 精确检索。
          </p>
        </div>

        <div class="sub-tabs" role="tablist">
          <button
            type="button"
            class="sub-tab"
            :class="{ active: recordTab === 'out' }"
            @click="recordTab = 'out'"
          >
            我发出的
          </button>
          <button
            type="button"
            class="sub-tab"
            :class="{ active: recordTab === 'in' }"
            @click="recordTab = 'in'"
          >
            我收到的
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
            :class="{ active: recordTab === 'id' }"
            @click="recordTab = 'id'"
          >
            按记录 ID
          </button>
        </div>

        <div v-show="recordTab === 'out'" class="query-panel">
          <div class="addr-chip">
            <span class="addr-label">授权方（当前用户）</span>
            <code class="addr-val mono">{{ blockchainFromUser || '未绑定' }}</code>
          </div>
          <button
            type="button"
            class="btn-query"
            :disabled="recordsLoading"
            @click="loadOutgoing"
          >
            {{ recordsLoading ? '加载中…' : '加载我发出的授权' }}
          </button>
        </div>

        <div v-show="recordTab === 'in'" class="query-panel">
          <div class="addr-chip">
            <span class="addr-label">被授权方（当前用户）</span>
            <code class="addr-val mono">{{ blockchainFromUser || '未绑定' }}</code>
          </div>
          <button
            type="button"
            class="btn-query"
            :disabled="recordsLoading"
            @click="loadIncoming"
          >
            {{ recordsLoading ? '加载中…' : '加载我收到的授权' }}
          </button>
        </div>

        <div v-show="recordTab === 'work'" class="query-panel">
          <label class="field">
            <span class="lbl">作品 ID</span>
            <input
              v-model.trim="workIdQuery"
              type="text"
              class="inp"
              placeholder="work-xxx"
              @keydown.enter="loadByWorkId"
            />
          </label>
          <button
            type="button"
            class="btn-query"
            :disabled="recordsLoading"
            @click="loadByWorkId"
          >
            {{ recordsLoading ? '查询中…' : '检索该作品的授权' }}
          </button>
        </div>

        <div v-show="recordTab === 'id'" class="query-panel">
          <label class="field">
            <span class="lbl">授权记录 ID</span>
            <input
              v-model.trim="authIdQuery"
              type="text"
              class="inp mono"
              placeholder="精确匹配一条记录"
              @keydown.enter="loadByAuthId"
            />
          </label>
          <button
            type="button"
            class="btn-query"
            :disabled="recordsLoading"
            @click="loadByAuthId"
          >
            {{ recordsLoading ? '查询中…' : '检索记录' }}
          </button>
        </div>

        <p v-if="recordsError" class="err">{{ recordsError }}</p>

        <article v-if="singleRecord" class="detail-card">
          <header class="detail-head">
            <span class="detail-badge">单条记录</span>
            <span
              class="st-pill"
              :class="`tone-${formatAuthStatus(pickAuthStatusRaw(singleRecord)).tone}`"
            >
              {{ formatAuthStatus(pickAuthStatusRaw(singleRecord)).label }}
            </span>
          </header>
          <p class="detail-id mono">{{ pickAuthId(singleRecord) || '—' }}</p>
          <div class="detail-grid">
            <div class="cell">
              <span class="ck">作品</span>
              <button
                v-if="pickWorkId(singleRecord)"
                type="button"
                class="link-work"
                @click="goWorkDetail(pickWorkId(singleRecord))"
              >
                {{ pickWorkId(singleRecord) }}
              </button>
              <span v-else class="cv muted">—</span>
            </div>
            <div class="cell">
              <span class="ck">授权类型</span>
              <span class="cv">{{ pickAuthTypeLabel(singleRecord) }}</span>
            </div>
            <div class="cell span-2">
              <span class="ck">授权方</span>
              <span class="cv mono small">{{ pickGrantor(singleRecord) || '—' }}</span>
            </div>
            <div class="cell span-2">
              <span class="ck">被授权方</span>
              <span class="cv mono small">{{ pickGrantee(singleRecord) || '—' }}</span>
            </div>
            <div class="cell">
              <span class="ck">创建 / 生效时间</span>
              <span class="cv">{{
                formatTime(
                  singleRecord.authTime ??
                    singleRecord.createdAt ??
                    singleRecord.grantTime ??
                    singleRecord.startTime,
                )
              }}</span>
            </div>
            <div class="cell">
              <span class="ck">失效时间</span>
              <span class="cv">{{
                formatTime(singleRecord.validUntil ?? singleRecord.endTime ?? singleRecord.expireTime)
              }}</span>
            </div>
            <div class="cell span-2">
              <span class="ck">链上 txHash</span>
              <span class="cv mono small">{{ singleRecord.txHash ?? '—' }}</span>
            </div>
            <div v-if="singleRecord.remark" class="cell span-2">
              <span class="ck">备注</span>
              <span class="cv">{{ String(singleRecord.remark) }}</span>
            </div>
          </div>
          <div
            v-if="canRevokeAsGrantor(blockchainFromUser, singleRecord)"
            class="detail-actions"
          >
            <button
              type="button"
              class="btn-danger-ghost"
              :disabled="revokingId === pickAuthId(singleRecord)"
              @click="tryRevoke(singleRecord)"
            >
              {{ revokingId === pickAuthId(singleRecord) ? '撤销中…' : '撤销此授权' }}
            </button>
          </div>
        </article>

        <div v-else-if="recordList.length" class="record-list">
          <article
            v-for="rec in recordList"
            :key="pickAuthId(rec) || String(rec.workId)"
            class="record-card"
          >
            <div class="rc-top">
              <span
                class="st-pill"
                :class="`tone-${formatAuthStatus(pickAuthStatusRaw(rec)).tone}`"
              >
                {{ formatAuthStatus(pickAuthStatusRaw(rec)).label }}
              </span>
              <span class="rc-type">{{ pickAuthTypeLabel(rec) }}</span>
            </div>
            <p class="rc-id mono">{{ pickAuthId(rec) || '—' }}</p>
            <div class="rc-grid">
              <div class="rc-row">
                <span class="rck">作品</span>
                <button
                  v-if="pickWorkId(rec)"
                  type="button"
                  class="link-mini"
                  @click="goWorkDetail(pickWorkId(rec))"
                >
                  {{ pickWorkId(rec) }}
                </button>
                <span v-else class="rcv muted">—</span>
              </div>
              <div class="rc-row">
                <span class="rck">授权方</span>
                <span class="rcv mono" :title="pickGrantor(rec)">{{
                  shortAddress(pickGrantor(rec), 8, 6)
                }}</span>
              </div>
              <div class="rc-row">
                <span class="rck">被授权方</span>
                <span class="rcv mono" :title="pickGrantee(rec)">{{
                  shortAddress(pickGrantee(rec), 8, 6)
                }}</span>
              </div>
              <div class="rc-row">
                <span class="rck">时间</span>
                <span class="rcv">{{
                  formatTime(
                    rec.authTime ?? rec.createdAt ?? rec.grantTime ?? rec.startTime,
                  )
                }}</span>
              </div>
            </div>
            <div class="rc-foot">
              <button
                v-if="canRevokeAsGrantor(blockchainFromUser, rec)"
                type="button"
                class="btn-danger-ghost sm"
                :disabled="revokingId === pickAuthId(rec)"
                @click="tryRevoke(rec)"
              >
                {{ revokingId === pickAuthId(rec) ? '…' : '撤销' }}
              </button>
            </div>
          </article>
        </div>

        <div
          v-else-if="
            !recordsLoading &&
            !recordsError &&
            !singleRecord &&
            recordTab !== 'id' &&
            !recordsFetched
          "
          class="empty-hint"
        >
          <span class="empty-ic" aria-hidden="true">◇</span>
          <p>暂无列表数据</p>
          <p class="empty-sub">选择查询方式并点击加载。</p>
        </div>
        <div
          v-else-if="
            !recordsLoading &&
            !recordsError &&
            !singleRecord &&
            recordTab !== 'id' &&
            recordsFetched
          "
          class="empty-hint"
        >
          <span class="empty-ic" aria-hidden="true">◇</span>
          <p>未查询到授权记录</p>
          <p class="empty-sub">可更换条件或确认后端已写入链上/库内数据。</p>
        </div>
        <div
          v-else-if="
            !recordsLoading && !recordsError && recordTab === 'id' && !singleRecord && !recordsFetched
          "
          class="empty-hint"
        >
          <span class="empty-ic" aria-hidden="true">◇</span>
          <p>输入记录 ID 后检索</p>
        </div>
        <div
          v-else-if="
            !recordsLoading && !recordsError && recordTab === 'id' && !singleRecord && recordsFetched
          "
          class="empty-hint"
        >
          <span class="empty-ic" aria-hidden="true">◇</span>
          <p>未找到该授权记录</p>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.auth-shell {
  width: 100%;
  display: flex;
  justify-content: center;
  padding: 0.75rem 0 2.75rem;
  box-sizing: border-box;
}

.auth-page {
  width: 100%;
  max-width: 800px;
}

.hero {
  position: relative;
  margin-bottom: 1.5rem;
  padding-bottom: 0.25rem;
}

.hero-glow {
  position: absolute;
  width: 220px;
  height: 220px;
  right: -40px;
  top: -60px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgba(251, 191, 36, 0.22) 0%,
    rgba(245, 158, 11, 0.06) 45%,
    transparent 70%
  );
  pointer-events: none;
  z-index: 0;
}

.title {
  position: relative;
  z-index: 1;
  margin: 0 0 0.4rem;
  font-size: 1.58rem;
  font-weight: 780;
  letter-spacing: -0.03em;
  background: linear-gradient(115deg, #fef3c7 0%, #fbbf24 35%, #f59e0b 65%, #e2e8f0 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.lead {
  position: relative;
  z-index: 1;
  margin: 0 0 1.05rem;
  font-size: 0.91rem;
  line-height: 1.6;
  color: var(--bccr-muted);
  max-width: 36rem;
}

.main-tabs {
  position: relative;
  z-index: 1;
  display: flex;
  gap: 0.5rem;
  padding: 0.35rem;
  border-radius: 0.9rem;
  border: 1px solid rgba(251, 191, 36, 0.2);
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(8px);
}

.main-tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  padding: 0.68rem 0.85rem;
  border: none;
  border-radius: 0.6rem;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--bccr-muted);
  background: transparent;
  cursor: pointer;
  transition:
    background 0.18s,
    color 0.18s,
    box-shadow 0.18s;
}

.main-tab:hover {
  color: #fde68a;
}

.main-tab.active {
  color: #fffbeb;
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.45), rgba(217, 119, 6, 0.32));
  box-shadow: 0 4px 22px rgba(245, 158, 11, 0.22);
}

.main-tab-ic {
  opacity: 0.88;
  font-size: 0.85rem;
}

.card {
  padding: 1.4rem 1.45rem;
  border-radius: 1.05rem;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(15, 23, 42, 0.48);
  margin-bottom: 1rem;
}

.card-grant {
  border-color: rgba(251, 191, 36, 0.14);
  box-shadow: 0 0 0 1px rgba(245, 158, 11, 0.05), 0 20px 50px rgba(0, 0, 0, 0.22);
}

.card-records {
  border-color: rgba(52, 211, 153, 0.12);
  box-shadow: 0 0 0 1px rgba(16, 185, 129, 0.04), 0 20px 50px rgba(0, 0, 0, 0.2);
}

.card-head {
  margin-bottom: 1.2rem;
}

.h2 {
  margin: 0 0 0.35rem;
  font-size: 1.06rem;
  font-weight: 650;
}

.card-desc {
  margin: 0;
  font-size: 0.82rem;
  color: var(--bccr-muted);
  line-height: 1.5;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem 1.1rem;
}

@media (max-width: 640px) {
  .form-grid {
    grid-template-columns: 1fr;
  }

  .span-2 {
    grid-column: auto !important;
  }
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.42rem;
}

.span-2 {
  grid-column: 1 / -1;
}

.lbl {
  font-size: 0.74rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.92);
}

.opt {
  font-weight: 500;
  text-transform: none;
  letter-spacing: 0;
  color: var(--bccr-muted);
  font-size: 0.7rem;
}

.req {
  color: #fb923c;
  font-style: normal;
}

.inp {
  padding: 0.58rem 0.75rem;
  border-radius: 0.55rem;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(15, 23, 42, 0.72);
  color: var(--bccr-text);
  font-size: 0.9rem;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}

.inp:focus {
  outline: none;
  border-color: rgba(251, 191, 36, 0.45);
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.12);
}

.err-inline {
  margin: 0.35rem 0 0;
  font-size: 0.82rem;
  color: #fecaca;
  line-height: 1.45;
}

.grantee-field .field-hint {
  margin: 0 0 0.45rem;
  font-size: 0.78rem;
  color: var(--bccr-muted);
  line-height: 1.45;
}

/* 作品下拉盖住下方被授权方输入区，避免点选穿透到用户名框 */
.auth-work-field {
  position: relative;
  z-index: 12;
}

.auth-grantee-field {
  position: relative;
  z-index: 1;
}

.combo-wrap {
  position: relative;
  z-index: 2;
}

.combo-input-row {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.combo-inp {
  flex: 1;
  min-width: 0;
}

.combo-loading {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.85rem;
  color: rgba(251, 191, 36, 0.88);
  pointer-events: none;
}

.combo-loading-spin {
  display: inline-block;
  font-size: 1.1rem;
  line-height: 1;
  animation: spin-slow 0.85s linear infinite;
}

@keyframes spin-slow {
  to {
    transform: rotate(360deg);
  }
}

.suggest-dd {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 0.35rem);
  z-index: 5;
  margin: 0;
  padding: 0.35rem;
  list-style: none;
  max-height: 15.5rem;
  overflow-y: auto;
  border-radius: 0.65rem;
  border: 1px solid rgba(251, 191, 36, 0.22);
  background: rgba(15, 23, 42, 0.94);
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.2),
    0 16px 40px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(12px);
}

.suggest-row {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.55rem 0.6rem;
  border-radius: 0.45rem;
  font-size: 0.86rem;
}

.suggest-row--status {
  color: var(--bccr-muted);
  justify-content: center;
  font-size: 0.82rem;
}

.suggest-row--pick {
  cursor: pointer;
  transition:
    background 0.12s,
    box-shadow 0.12s;
}

.suggest-row--pick:hover {
  background: rgba(245, 158, 11, 0.12);
  box-shadow: inset 0 0 0 1px rgba(251, 191, 36, 0.15);
}

.suggest-av {
  flex-shrink: 0;
  width: 2.35rem;
  height: 2.35rem;
  border-radius: 50%;
  overflow: hidden;
  border: 1px solid rgba(251, 191, 36, 0.28);
  background: rgba(30, 41, 59, 0.8);
}

.suggest-av-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.suggest-av-ph {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 0.95rem;
  font-weight: 750;
  color: #fde68a;
}

.suggest-txt {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
}

.suggest-nick {
  font-weight: 650;
  color: #fffbeb;
}

.suggest-un {
  font-size: 0.76rem;
  color: rgba(253, 230, 138, 0.75);
}

.suggest-type {
  font-size: 0.7rem;
  color: rgba(203, 213, 225, 0.88);
}

.selected-strip {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 0.75rem;
  padding: 0.65rem 0.85rem;
  border-radius: 0.6rem;
  border: 1px solid rgba(52, 211, 153, 0.28);
  background: linear-gradient(120deg, rgba(16, 185, 129, 0.1), rgba(15, 23, 42, 0.45));
}

.selected-strip--work {
  border-color: rgba(251, 191, 36, 0.32);
  background: linear-gradient(120deg, rgba(245, 158, 11, 0.12), rgba(15, 23, 42, 0.45));
}

.selected-strip--work .selected-nick {
  color: #fffbeb;
}

.selected-strip--work .selected-un {
  color: rgba(253, 230, 138, 0.88);
}

.selected-av {
  flex-shrink: 0;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid rgba(52, 211, 153, 0.35);
}

.selected-av-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.selected-av-ph {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 1rem;
  font-weight: 750;
  color: #a7f3d0;
  background: rgba(6, 78, 59, 0.35);
}

.selected-txt {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.08rem;
}

.selected-nick {
  font-size: 0.9rem;
  font-weight: 700;
  color: #d1fae5;
}

.selected-un {
  font-size: 0.76rem;
  color: rgba(167, 243, 208, 0.85);
}

.selected-meta {
  font-size: 0.72rem;
  color: var(--bccr-muted);
}

.selected-addr {
  font-size: 0.72rem;
  color: var(--bccr-muted);
}

.btn-strip-change {
  flex-shrink: 0;
  padding: 0.35rem 0.65rem;
  border-radius: 0.4rem;
  border: 1px solid rgba(253, 224, 71, 0.35);
  background: rgba(245, 158, 11, 0.1);
  color: #fde68a;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    background 0.12s,
    border-color 0.12s;
}

.btn-strip-change:hover {
  background: rgba(245, 158, 11, 0.18);
  border-color: rgba(253, 224, 71, 0.5);
}

.api-hint {
  margin: 0.65rem 0 0;
  font-size: 0.72rem;
  line-height: 1.55;
  color: rgba(148, 163, 184, 0.92);
}

.api-hint .mono {
  font-size: 0.7rem;
  color: rgba(253, 230, 138, 0.75);
}

.mono {
  font-family: ui-monospace, monospace;
  font-size: 0.86rem;
}

.type-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.55rem;
}

@media (max-width: 540px) {
  .type-grid {
    grid-template-columns: 1fr;
  }
}

.type-card {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.65rem 0.75rem;
  border-radius: 0.65rem;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(30, 41, 59, 0.35);
  cursor: pointer;
  transition:
    border-color 0.15s,
    background 0.15s,
    box-shadow 0.15s;
}

.type-card:hover {
  border-color: rgba(251, 191, 36, 0.35);
}

.type-card.on {
  border-color: rgba(245, 158, 11, 0.55);
  background: linear-gradient(145deg, rgba(245, 158, 11, 0.12), rgba(15, 23, 42, 0.5));
  box-shadow: 0 0 0 1px rgba(251, 191, 36, 0.08);
}

.type-title {
  font-size: 0.88rem;
  font-weight: 650;
  color: #fef3c7;
}

.type-hint {
  font-size: 0.72rem;
  line-height: 1.4;
  color: var(--bccr-muted);
}

.type-card.on .type-hint {
  color: rgba(253, 230, 138, 0.85);
}

.addr-pill {
  padding: 0.55rem 0.7rem;
  border-radius: 0.5rem;
  background: rgba(0, 0, 0, 0.22);
  border: 1px solid rgba(148, 163, 184, 0.12);
  font-size: 0.8rem;
  color: #cbd5e1;
  word-break: break-all;
}

.err {
  margin: 0.85rem 0 0;
  padding: 0.55rem 0.75rem;
  border-radius: 0.45rem;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(248, 113, 113, 0.25);
  color: #fecaca;
  font-size: 0.86rem;
}

.success-panel {
  display: flex;
  align-items: flex-start;
  gap: 0.85rem;
  margin-top: 1rem;
  padding: 1rem 1.1rem;
  border-radius: 0.75rem;
  border: 1px solid rgba(74, 222, 128, 0.25);
  background: linear-gradient(125deg, rgba(34, 197, 94, 0.1), rgba(15, 23, 42, 0.4));
}

.success-ic {
  flex-shrink: 0;
  width: 2.1rem;
  height: 2.1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 1rem;
  font-weight: 800;
  color: #052e16;
  background: linear-gradient(135deg, #4ade80, #22c55e);
}

.success-title {
  margin: 0 0 0.2rem;
  font-size: 0.95rem;
  font-weight: 650;
  color: #bbf7d0;
}

.success-meta {
  margin: 0;
  font-size: 0.78rem;
  color: var(--bccr-muted);
  word-break: break-all;
}

.btn-primary {
  width: 100%;
  margin-top: 1.2rem;
  padding: 0;
  border: none;
  border-radius: 0.7rem;
  cursor: pointer;
  background: linear-gradient(135deg, #d97706, #ea580c, #c2410c);
  box-shadow: 0 10px 32px rgba(234, 88, 12, 0.28);
  transition:
    transform 0.12s,
    filter 0.12s,
    opacity 0.12s;
}

.btn-primary:hover:not(:disabled) {
  filter: brightness(1.06);
  transform: translateY(-1px);
}

.btn-primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
}

.btn-primary-inner {
  display: block;
  padding: 0.8rem 1rem;
  font-size: 0.95rem;
  font-weight: 700;
  color: #fffbeb;
}

.sub-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 1rem;
}

.sub-tab {
  padding: 0.42rem 0.82rem;
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
  color: #d1fae5;
}

.sub-tab.active {
  border-color: rgba(52, 211, 153, 0.45);
  background: rgba(16, 185, 129, 0.14);
  color: #a7f3d0;
}

.query-panel {
  padding: 1rem 1.05rem;
  margin-bottom: 1rem;
  border-radius: 0.8rem;
  background: rgba(0, 0, 0, 0.2);
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
  color: #e2e8f0;
  padding: 0.45rem 0.55rem;
  border-radius: 0.4rem;
  background: rgba(15, 23, 42, 0.65);
}

.btn-query {
  margin-top: 0.2rem;
  width: 100%;
  padding: 0.55rem 1rem;
  border-radius: 0.5rem;
  border: none;
  font-weight: 650;
  font-size: 0.88rem;
  color: #ecfdf5;
  cursor: pointer;
  background: linear-gradient(135deg, rgba(5, 150, 105, 0.95), rgba(13, 148, 136, 0.88));
  box-shadow: 0 6px 22px rgba(13, 148, 136, 0.22);
}

.btn-query:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.detail-card {
  margin-top: 0.35rem;
  padding: 1.15rem 1.2rem;
  border-radius: 0.85rem;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(0, 0, 0, 0.22);
  border-left: 4px solid rgba(52, 211, 153, 0.5);
}

.detail-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.45rem;
}

.detail-badge {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: #6ee7b7;
}

.st-pill {
  font-size: 0.72rem;
  font-weight: 650;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  border: 1px solid transparent;
}

.st-pill.tone-ok {
  background: rgba(34, 197, 94, 0.15);
  border-color: rgba(74, 222, 128, 0.35);
  color: #bbf7d0;
}

.st-pill.tone-warn {
  background: rgba(251, 191, 36, 0.12);
  border-color: rgba(251, 191, 36, 0.35);
  color: #fde68a;
}

.st-pill.tone-bad {
  background: rgba(248, 113, 113, 0.12);
  border-color: rgba(248, 113, 113, 0.3);
  color: #fecaca;
}

.st-pill.tone-muted {
  background: rgba(148, 163, 184, 0.12);
  border-color: rgba(148, 163, 184, 0.22);
  color: #cbd5e1;
}

.detail-id {
  margin: 0 0 1rem;
  font-size: 0.8rem;
  color: var(--bccr-muted);
}

.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.65rem 1rem;
}

.cell {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.cell.span-2 {
  grid-column: 1 / -1;
}

.ck {
  font-size: 0.72rem;
  color: var(--bccr-muted);
}

.cv {
  font-size: 0.86rem;
  color: #e2e8f0;
}

.cv.small {
  font-size: 0.78rem;
  word-break: break-all;
}

.cv.muted {
  color: var(--bccr-muted);
}

.link-work {
  align-self: flex-start;
  margin-top: 0.05rem;
  padding: 0.28rem 0.55rem;
  border-radius: 0.35rem;
  border: 1px solid rgba(52, 211, 153, 0.35);
  background: rgba(16, 185, 129, 0.1);
  color: #6ee7b7;
  font-size: 0.82rem;
  font-family: ui-monospace, monospace;
  cursor: pointer;
}

.link-work:hover {
  border-color: rgba(110, 231, 183, 0.55);
}

.detail-actions {
  margin-top: 1rem;
  padding-top: 0.85rem;
  border-top: 1px solid rgba(148, 163, 184, 0.1);
}

.btn-danger-ghost {
  padding: 0.45rem 0.85rem;
  border-radius: 0.45rem;
  border: 1px solid rgba(248, 113, 113, 0.4);
  background: rgba(248, 113, 113, 0.08);
  color: #fecaca;
  font-size: 0.84rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    background 0.12s,
    border-color 0.12s;
}

.btn-danger-ghost:hover:not(:disabled) {
  background: rgba(248, 113, 113, 0.14);
}

.btn-danger-ghost:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-danger-ghost.sm {
  padding: 0.32rem 0.65rem;
  font-size: 0.78rem;
}

.record-list {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.record-card {
  padding: 1rem 1.1rem;
  border-radius: 0.8rem;
  border: 1px solid rgba(148, 163, 184, 0.12);
  background: linear-gradient(145deg, rgba(30, 41, 59, 0.55), rgba(15, 23, 42, 0.38));
  border-left: 4px solid rgba(16, 185, 129, 0.45);
}

.rc-top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.4rem;
}

.rc-type {
  font-size: 0.78rem;
  color: rgba(253, 230, 138, 0.9);
  font-weight: 600;
}

.rc-id {
  margin: 0 0 0.65rem;
  font-size: 0.76rem;
  color: rgba(148, 163, 184, 0.95);
}

.rc-grid {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.rc-row {
  display: grid;
  grid-template-columns: 4.5rem 1fr;
  gap: 0.4rem;
  font-size: 0.82rem;
  align-items: baseline;
}

.rck {
  color: var(--bccr-muted);
}

.rcv {
  color: #e2e8f0;
  word-break: break-all;
}

.rcv.muted {
  color: var(--bccr-muted);
}

.link-mini {
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  font-family: ui-monospace, monospace;
  font-size: 0.8rem;
  color: #6ee7b7;
  cursor: pointer;
  text-align: left;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.rc-foot {
  margin-top: 0.75rem;
  padding-top: 0.65rem;
  border-top: 1px solid rgba(148, 163, 184, 0.1);
}

.empty-hint {
  text-align: center;
  padding: 2rem 1rem;
  color: var(--bccr-muted);
}

.empty-hint p {
  margin: 0.25rem 0;
  font-size: 0.9rem;
}

.empty-sub {
  font-size: 0.8rem !important;
  opacity: 0.85;
}

.empty-ic {
  display: block;
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
  opacity: 0.35;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}
</style>
