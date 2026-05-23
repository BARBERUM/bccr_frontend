<script setup>
import { computed, onBeforeUnmount, ref, watch, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BccrIcon from '@/components/icons/BccrIcon.vue'
import { normalizeMediaSrc } from '@/api/client'
import * as authApi from '@/api/authorization'
import * as userApi from '@/api/user'
import { fetchWorkDetail, formatWorkSummary } from '@/api/work'
import { fetchMyWorkPickSuggestions } from '@/lib/workPick'
import {
  canExtendAuthAsGrantor,
  canExtendOutgoingRecord,
  canReauthorizeAsGrantor,
  canReauthorizeOutgoingRecord,
  canRevokeAsGrantor,
  displayAuthStatus,
  formatAuthStatus,
  isAuthExpired,
  isExclusiveAuth,
  normalizeAuthTypeForGrant,
  pickAuthId,
  pickAuthStatusRaw,
  pickAuthTypeLabel,
  pickAuthTypeRaw,
  pickExpireTime,
  pickGrantee,
  pickGrantor,
  pickWorkId,
  shortAddress,
} from '@/lib/authorizationDisplay'
import { hasAnyRole } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

/** @type {import('vue').Ref<'grant' | 'records'>} */
const mainTab = ref('grant')

const AUTH_TYPE_OPTIONS = [
  { value: 'exclusive', label: '独占授权', hint: '被授权方在约定范围内独占使用该作品' },
  { value: 'non-exclusive', label: '普通授权', hint: '您仍可自行或向他人授权，被授权方在约定范围内使用' },
  { value: 'sublicense', label: '可再授权', hint: '允许被授权方在约定条件下向第三方再许可' },
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
  if (recordsSuccessTimer) clearTimeout(recordsSuccessTimer)
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
/** 我发出的：全部 / 仅已过期 */
const outListFilter = ref(/** @type {'all' | 'expired'} */ ('all'))
const workIdQuery = ref('')
const authIdQuery = ref('')
const recordsLoading = ref(false)
const recordsError = ref('')
/** @type {import('vue').Ref<Record<string, unknown>[]>} */
const recordList = ref([])
/** @type {import('vue').Ref<Record<string, unknown> | null>} */
const singleRecord = ref(null)
const revokingId = ref('')
const refreshingId = ref('')
const refreshAllBusy = ref(false)
const recordsSuccess = ref('')
/** 当前子标签下是否已完成一次查询（用于空态文案） */
const recordsFetched = ref(false)
let recordsSuccessTimer = null

/** 撤销授权二次确认弹窗 */
const revokeModalOpen = ref(false)
/** @type {import('vue').Ref<Record<string, unknown> | null>} */
const revokeModalRecord = ref(null)
const revokeReasonDraft = ref('')

/** 授权延续弹窗（PUT /api/auth/{authId}/extend） */
const extendModalOpen = ref(false)
/** @type {import('vue').Ref<Record<string, unknown> | null>} */
const extendModalRecord = ref(null)
const extendExpireDraft = ref('')
const extendPermanent = ref(false)
const extendBusy = ref(false)
const extendError = ref('')

const revokeModalAuthId = computed(() =>
  revokeModalRecord.value ? pickAuthId(revokeModalRecord.value) : '',
)
const revokeModalWorkId = computed(() =>
  revokeModalRecord.value ? pickWorkId(revokeModalRecord.value) : '',
)
const revokeModalGrantee = computed(() =>
  revokeModalRecord.value ? pickGrantee(revokeModalRecord.value) : '',
)
const revokeModalStatusLabel = computed(() => {
  if (!revokeModalRecord.value) return '—'
  return displayAuthStatus(revokeModalRecord.value).label
})

const extendModalAuthId = computed(() =>
  extendModalRecord.value ? pickAuthId(extendModalRecord.value) : '',
)
const extendModalWorkId = computed(() =>
  extendModalRecord.value ? pickWorkId(extendModalRecord.value) : '',
)
const extendModalGrantee = computed(() =>
  extendModalRecord.value ? pickGrantee(extendModalRecord.value) : '',
)
const extendModalAuthType = computed(() =>
  extendModalRecord.value
    ? normalizeAuthTypeForGrant(pickAuthTypeRaw(extendModalRecord.value))
    : 'non-exclusive',
)
const extendModalExclusive = computed(() =>
  extendModalRecord.value ? isExclusiveAuth(extendModalRecord.value) : false,
)

/** @param {Record<string, unknown>} rec */
function canExtendRecord(rec) {
  return recordTab.value === 'out'
    ? canExtendOutgoingRecord(rec)
    : canExtendAuthAsGrantor(blockchainFromUser.value, rec)
}

/** @param {Record<string, unknown>} rec */
function canReauthorizeRecord(rec) {
  return recordTab.value === 'out'
    ? canReauthorizeOutgoingRecord(rec)
    : canReauthorizeAsGrantor(blockchainFromUser.value, rec)
}

const expiredOutCount = computed(() =>
  recordTab.value === 'out' ? recordList.value.filter((r) => isAuthExpired(r)).length : 0,
)

const displayedRecordList = computed(() => {
  if (recordTab.value !== 'out' || outListFilter.value === 'all') {
    return recordList.value
  }
  return recordList.value.filter((r) => isAuthExpired(r))
})

const isAdmin = computed(() => hasAnyRole(authStore.user, ['admin']))

const showRecordsListToolbar = computed(
  () =>
    recordTab.value === 'out' ||
    recordTab.value === 'in' ||
    recordTab.value === 'work',
)

watchEffect((onCleanup) => {
  if (!revokeModalOpen.value) return
  const onDocKey = (ev) => {
    if (ev.key === 'Escape') {
      ev.preventDefault()
      closeRevokeModal()
    }
  }
  document.addEventListener('keydown', onDocKey)
  onCleanup(() => document.removeEventListener('keydown', onDocKey))
})

watchEffect((onCleanup) => {
  if (!extendModalOpen.value) return
  const onDocKey = (ev) => {
    if (ev.key === 'Escape') {
      ev.preventDefault()
      closeExtendModal()
    }
  }
  document.addEventListener('keydown', onDocKey)
  onCleanup(() => document.removeEventListener('keydown', onDocKey))
})

watch(recordTab, async () => {
  recordList.value = []
  singleRecord.value = null
  recordsError.value = ''
  recordsFetched.value = false
  outListFilter.value = 'all'
  if (mainTab.value !== 'records') return
  if (recordTab.value === 'out') await loadOutgoing()
  else if (recordTab.value === 'in') await loadIncoming()
})

watch(outListFilter, async (f) => {
  if (mainTab.value !== 'records' || recordTab.value !== 'out') return
  if (f === 'expired') await loadExpiredOutgoing()
  else await loadOutgoing()
})

watch(mainTab, (tab) => {
  if (tab === 'records') void refreshRecordsForCurrentTab()
})

/** 从路由 query 打开指定授权记录（如 /auth?authId=auth-7df8f61e4b） */
function pickQueryAuthId() {
  const raw = route.query.authId ?? route.query.id
  const s = Array.isArray(raw) ? raw[0] : raw
  return String(s ?? '').trim()
}

watch(
  () => pickQueryAuthId(),
  async (aid) => {
    if (!aid) return
    mainTab.value = 'records'
    recordTab.value = 'id'
    if (authIdQuery.value !== aid) authIdQuery.value = aid
    await loadByAuthId()
  },
  { immediate: true },
)

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

/** @param {number} [monthsAhead] */
function defaultExpireLocal(monthsAhead = 12) {
  const d = new Date()
  d.setMonth(d.getMonth() + monthsAhead)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
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
    workSuggestions.value = await fetchMyWorkPickSuggestions({
      query: kw,
      myAddress: blockchainFromUser.value,
      pageSize: 50,
    })
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
      /* ignore */
    }
    if (list.length === 0) {
      try {
        const one = await userApi.fetchUserAddressByUsername(keyword)
        if (one && typeof one === 'object') {
          list = dedupeByUsername([/** @type {Record<string, unknown>} */ (one)])
        }
      } catch {
        /* ignore */
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

function showRecordsSuccess(msg) {
  recordsSuccess.value = msg
  if (recordsSuccessTimer) clearTimeout(recordsSuccessTimer)
  recordsSuccessTimer = setTimeout(() => {
    recordsSuccessTimer = null
    recordsSuccess.value = ''
  }, 4000)
}

/** @param {Record<string, unknown>} updated */
function applyUpdatedAuthRecord(updated) {
  if (!updated || typeof updated !== 'object') return
  const id = pickAuthId(updated)
  if (!id) return
  const idx = recordList.value.findIndex((r) => pickAuthId(r) === id)
  if (idx >= 0) {
    recordList.value[idx] = {
      .../** @type {Record<string, unknown>} */ (recordList.value[idx]),
      ...updated,
    }
  }
  if (singleRecord.value && pickAuthId(singleRecord.value) === id) {
    singleRecord.value = {
      .../** @type {Record<string, unknown>} */ (singleRecord.value),
      ...updated,
    }
  }
}

/** @param {Record<string, unknown>} rec */
async function refreshAuthStatusForRecord(rec) {
  const id = pickAuthId(rec)
  if (!id || refreshingId.value) return
  refreshingId.value = id
  recordsError.value = ''
  try {
    const data = await authApi.refreshAuthStatus(id)
    const row =
      data && typeof data === 'object'
        ? /** @type {Record<string, unknown>} */ (data)
        : rec
    applyUpdatedAuthRecord(row)
    const label = displayAuthStatus(row).label
    showRecordsSuccess(`记录 ${id} 状态已更新为「${label}」`)
  } catch (e) {
    recordsError.value = e?.message || '刷新授权状态失败'
  } finally {
    refreshingId.value = ''
  }
}

async function refreshAllExpiredAuthStatus() {
  if (!isAdmin.value || refreshAllBusy.value) return
  if (
    !window.confirm(
      '将检查并更新系统中所有已过期的授权记录状态，是否继续？',
    )
  ) {
    return
  }
  refreshAllBusy.value = true
  recordsError.value = ''
  try {
    const data = await authApi.refreshAllExpiredAuth()
    const o =
      data && typeof data === 'object'
        ? /** @type {Record<string, unknown>} */ (data)
        : {}
    const count = Number(o.updatedCount ?? o.count ?? 0)
    showRecordsSuccess(
      Number.isFinite(count) ? `全量刷新完成，已更新 ${count} 条记录` : '全量刷新完成',
    )
    await refreshRecordsForCurrentTab()
  } catch (e) {
    recordsError.value = e?.message || '全量刷新失败'
  } finally {
    refreshAllBusy.value = false
  }
}

/** 进入授权记录页或需刷新时：「我发出 / 我收到」自动拉列表 */
function refreshRecordsForCurrentTab() {
  if (mainTab.value !== 'records') return Promise.resolve()
  if (recordTab.value === 'out') {
    return outListFilter.value === 'expired' ? loadExpiredOutgoing() : loadOutgoing()
  }
  if (recordTab.value === 'in') return loadIncoming()
  if (recordTab.value === 'work' && workIdQuery.value.trim()) return loadByWorkId()
  return Promise.resolve()
}

async function loadOutgoing() {
  recordsLoading.value = true
  recordsError.value = ''
  singleRecord.value = null
  try {
    const data = await authApi.fetchAuthorizationFromMe({ page: 1, size: 50 })
    setRecordsList(data)
  } catch (e) {
    recordsError.value = e?.message || '加载失败'
    recordList.value = []
  } finally {
    recordsLoading.value = false
    recordsFetched.value = true
  }
}

/** 优先请求 status=expired；不支持时拉全量后前端筛选 */
async function loadExpiredOutgoing() {
  recordsLoading.value = true
  recordsError.value = ''
  singleRecord.value = null
  try {
    let list = []
    try {
      const data = await authApi.fetchAuthorizationFromMe({
        page: 1,
        size: 50,
        status: 'expired',
      })
      list = authApi.normalizeAuthorizationList(data)
    } catch {
      const data = await authApi.fetchAuthorizationFromMe({ page: 1, size: 50 })
      list = authApi.normalizeAuthorizationList(data).filter((r) => isAuthExpired(r))
    }
    if (list.length && !list.some((r) => isAuthExpired(r))) {
      list = list.filter((r) => isAuthExpired(r))
    }
    recordList.value = list
  } catch (e) {
    recordsError.value = e?.message || '加载已过期授权失败'
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
function beginRevoke(rec) {
  if (!rec || typeof rec !== 'object') return
  if (!canRevokeAsGrantor(blockchainFromUser.value, rec)) return
  const id = pickAuthId(rec)
  if (!id) return
  revokeModalRecord.value = rec
  revokeReasonDraft.value = remark.value.trim()
  revokeModalOpen.value = true
}

function closeRevokeModal() {
  if (revokingId.value) return
  revokeModalOpen.value = false
  revokeModalRecord.value = null
  revokeReasonDraft.value = ''
}

/** @param {Record<string, unknown>} rec */
function beginExtendAuth(rec) {
  if (!canExtendRecord(rec)) return
  extendModalRecord.value = rec
  extendExpireDraft.value = defaultExpireLocal(12)
  extendPermanent.value = false
  extendError.value = ''
  extendModalOpen.value = true
}

function closeExtendModal() {
  if (extendBusy.value) return
  extendModalOpen.value = false
  extendModalRecord.value = null
  extendExpireDraft.value = ''
  extendPermanent.value = false
  extendError.value = ''
}

async function confirmExtendAuth() {
  const rec = extendModalRecord.value
  if (!rec) return
  const authId = pickAuthId(rec)
  if (!authId) {
    extendError.value = '记录缺少授权 ID'
    return
  }
  extendBusy.value = true
  extendError.value = ''
  try {
    /** @type {{ newExpireTime?: string }} */
    const opts = {}
    if (!extendPermanent.value) {
      const exp = toExpireTimePayload(extendExpireDraft.value)
      if (exp) opts.newExpireTime = exp
    }
    const data = await authApi.extendAuth(authId, opts)
    const row =
      data && typeof data === 'object'
        ? /** @type {Record<string, unknown>} */ (data)
        : rec
    applyUpdatedAuthRecord(row)
    extendModalOpen.value = false
    extendModalRecord.value = null
    const label = displayAuthStatus(row).label
    showRecordsSuccess(`授权 ${authId} 已延续，当前状态：${label}`)
    if (recordTab.value === 'out') {
      outListFilter.value = 'all'
      await loadOutgoing()
    }
  } catch (e) {
    extendError.value = e?.message || '授权延续失败'
  } finally {
    extendBusy.value = false
  }
}

/** 在发起授权页预填（从过期记录跳转编辑） */
async function fillGrantFormFromRecord(rec) {
  const workId = pickWorkId(rec)
  const grantee = pickGrantee(rec)
  if (!workId || !grantee) return
  mainTab.value = 'grant'
  grantWorkId.value = workId
  grantWorkConfirmed.value = true
  grantWorkSearchInput.value = workId
  granteeAddress.value = grantee
  granteeConfirmed.value = true
  granteeSearchInput.value = shortAddress(grantee, 8, 6)
  selectedUsername.value = ''
  granteeLookup.value = null
  authType.value = normalizeAuthTypeForGrant(pickAuthTypeRaw(rec))
  validUntil.value = defaultExpireLocal(12)
  grantWorkPick.value = { id: workId, title: workId, cover: '', type: '', kind: 'other' }
  try {
    const detail = await fetchWorkDetail(workId)
    if (detail && typeof detail === 'object') {
      grantWorkPick.value = formatWorkSummary(
        /** @type {Record<string, unknown>} */ (detail),
      )
    }
  } catch {
    /* 保留最小展示 */
  }
}

async function confirmRevoke() {
  const rec = revokeModalRecord.value
  if (!rec || typeof rec !== 'object') return
  const id = pickAuthId(rec)
  if (!id) return
  const reason = revokeReasonDraft.value.trim()
  revokingId.value = id
  recordsError.value = ''
  try {
    await authApi.revokeAuthorization(id, reason ? { reason } : {})
    revokeModalOpen.value = false
    revokeModalRecord.value = null
    revokeReasonDraft.value = ''
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
        <div class="main-tabs" role="tablist" aria-label="授权功能">
          <button
            type="button"
            role="tab"
            class="main-tab"
            :class="{ active: mainTab === 'grant' }"
            :aria-selected="mainTab === 'grant'"
            @click="mainTab = 'grant'"
          >
            <span class="bccr-tab-ic-wrap" aria-hidden="true">
              <BccrIcon name="grant" size="sm" />
            </span>
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
            <span class="bccr-tab-ic-wrap" aria-hidden="true">
              <BccrIcon name="auth-records" size="sm" />
            </span>
            授权记录
          </button>
        </div>
      </header>

      <!-- 发起授权 -->
      <section v-show="mainTab === 'grant'" class="card card-grant">
        <div class="card-head">
          <h2 class="h2">新建授权</h2>

        </div>

        <div class="form-grid">
          <div class="field span-2 grantee-field auth-work-field bccr-work-pick-combo">
            <span class="lbl">授权作品 <em class="req">*</em></span>
           
            <div class="combo-wrap">
              <div class="combo-input-row">
                <input
                  v-model="grantWorkSearchInput"
                  type="text"
                  class="inp combo-inp"
                  placeholder="作品名称关键字或作品 ID…"
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
                class="suggest-dd bccr-scroll-slim"
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
          </div>

          <div class="field span-2 grantee-field auth-grantee-field bccr-work-pick-combo">
            <span class="lbl">被授权方 <em class="req">*</em></span>
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
                class="suggest-dd bccr-scroll-slim"
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
              placeholder="本地备忘；不会在发起授权时提交。撤销时可作为默认原因提示"
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
                ) || '—'
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
        <div class="card-head card-head--records">
          <div class="card-head-main">
            <h2 class="h2">记录查询</h2>
            <p class="card-desc">
              「我发出 / 我收到」在进入本页或切换子标签时会自动加载；按作品 ID 或授权记录 ID
              检索请先填写再点检索。可对单条记录刷新状态以同步是否过期。
            </p>
          </div>
          <div v-if="showRecordsListToolbar || isAdmin" class="records-toolbar">
            <button
              v-if="showRecordsListToolbar"
              type="button"
              class="btn-refresh"
              :disabled="recordsLoading || refreshAllBusy"
              @click="refreshRecordsForCurrentTab"
            >
              <span
                class="btn-refresh-ic"
                :class="{ spin: recordsLoading }"
                aria-hidden="true"
              >⟳</span>
              {{ recordsLoading ? '加载中…' : '重新加载列表' }}
            </button>
            <button
              v-if="isAdmin"
              type="button"
              class="btn-refresh btn-refresh--admin"
              :disabled="refreshAllBusy || recordsLoading"
              @click="refreshAllExpiredAuthStatus"
            >
              <span
                class="btn-refresh-ic"
                :class="{ spin: refreshAllBusy }"
                aria-hidden="true"
              >⟳</span>
              {{ refreshAllBusy ? '刷新中…' : '全量刷授权状态' }}
            </button>
          </div>
        </div>

        <p v-if="recordsSuccess" class="records-success" role="status">{{ recordsSuccess }}</p>

        <div class="sub-tabs" role="tablist">
          <button
            type="button"
            class="sub-tab"
            :class="{ active: recordTab === 'out' }"
            @click="recordTab = 'out'"
          >
            <span class="bccr-tab-ic-wrap" aria-hidden="true">
              <BccrIcon name="send" size="sm" />
            </span>
            我发出的
          </button>
          <button
            type="button"
            class="sub-tab"
            :class="{ active: recordTab === 'in' }"
            @click="recordTab = 'in'"
          >
            <span class="bccr-tab-ic-wrap" aria-hidden="true">
              <BccrIcon name="receive" size="sm" />
            </span>
            我收到的
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
            :class="{ active: recordTab === 'id' }"
            @click="recordTab = 'id'"
          >
            <span class="bccr-tab-ic-wrap" aria-hidden="true">
              <BccrIcon name="id-card" size="sm" />
            </span>
            按记录 ID
          </button>
        </div>

        <div v-show="recordTab === 'out'" class="query-panel query-panel--out">
          <div class="addr-chip">
            <span class="addr-label">授权方（当前用户）</span>
            <code class="addr-val mono">{{ blockchainFromUser || '未绑定' }}</code>
          </div>
          <div class="out-filter" role="tablist" aria-label="发出记录筛选">
            <button
              type="button"
              class="out-filter-btn"
              :class="{ active: outListFilter === 'all' }"
              @click="outListFilter = 'all'"
            >
              全部
            </button>
            <button
              type="button"
              class="out-filter-btn"
              :class="{ active: outListFilter === 'expired' }"
              @click="outListFilter = 'expired'"
            >
              已过期
              <span v-if="expiredOutCount > 0 && outListFilter === 'all'" class="out-filter-badge">{{
                expiredOutCount
              }}</span>
            </button>
          </div>
          <p v-if="outListFilter === 'expired'" class="out-filter-hint">
            以下为失效时间已到或状态为已过期的授权，可在原记录上延续有效期；独占授权仅支持延续，不可重新发起授权。
          </p>
          <p v-else-if="recordTab === 'out'" class="out-filter-hint">
            已过期记录可点「授权延续」在原记录上续期；独占授权仅支持延续。可先点「刷新状态」再操作。
          </p>
        </div>

        <div v-show="recordTab === 'in'" class="query-panel">
          <div class="addr-chip">
            <span class="addr-label">被授权方（当前用户）</span>
            <code class="addr-val mono">{{ blockchainFromUser || '未绑定' }}</code>
          </div>
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

        <div
          v-if="recordsLoading && (recordTab === 'out' || recordTab === 'in')"
          class="records-loading-block"
          aria-live="polite"
        >
          <span class="records-loading-spin" aria-hidden="true">⟳</span>
          <span>{{ recordTab === 'out' ? '正在加载发出的授权…' : '正在加载收到的授权…' }}</span>
        </div>

        <article v-if="singleRecord" class="detail-card">
          <header class="detail-head">
            <span class="detail-badge">单条记录</span>
            <span
              class="st-pill"
              :class="`tone-${displayAuthStatus(singleRecord).tone}`"
            >
              {{ displayAuthStatus(singleRecord).label }}
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
            v-if="
              (singleRecord && pickAuthId(singleRecord)) ||
              canRevokeAsGrantor(blockchainFromUser, singleRecord) ||
              canExtendRecord(singleRecord)
            "
            class="detail-actions"
          >
            <button
              v-if="singleRecord && pickAuthId(singleRecord)"
              type="button"
              class="btn-refresh-status sm"
              :disabled="refreshingId === pickAuthId(singleRecord)"
              @click="refreshAuthStatusForRecord(singleRecord)"
            >
              <span
                class="btn-refresh-ic"
                :class="{ spin: refreshingId === pickAuthId(singleRecord) }"
                aria-hidden="true"
              >⟳</span>
              {{ refreshingId === pickAuthId(singleRecord) ? '刷新中…' : '刷新状态' }}
            </button>
            <button
              v-if="canExtendRecord(singleRecord)"
              type="button"
              class="btn-reauth"
              @click="beginExtendAuth(singleRecord)"
            >
              授权延续
            </button>
            <button
              v-if="canRevokeAsGrantor(blockchainFromUser, singleRecord)"
              type="button"
              class="btn-danger-ghost"
              :disabled="revokingId === pickAuthId(singleRecord)"
              @click="beginRevoke(singleRecord)"
            >
              {{ revokingId === pickAuthId(singleRecord) ? '撤销中…' : '撤销此授权' }}
            </button>
          </div>
        </article>

        <div v-else-if="displayedRecordList.length" class="record-list-scroll bccr-scroll-slim">
          <div class="record-list">
          <article
            v-for="rec in displayedRecordList"
            :key="pickAuthId(rec) || String(rec.workId)"
            class="record-card"
          >
            <div class="rc-top">
              <span
                class="st-pill"
                :class="`tone-${displayAuthStatus(rec).tone}`"
              >
                {{ displayAuthStatus(rec).label }}
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
                <span class="rck">生效</span>
                <span class="rcv">{{
                  formatTime(
                    rec.authTime ?? rec.createdAt ?? rec.grantTime ?? rec.startTime,
                  )
                }}</span>
              </div>
              <div class="rc-row">
                <span class="rck">失效</span>
                <span class="rcv" :class="{ 'rcv--expired': isAuthExpired(rec) }">{{
                  formatTime(pickExpireTime(rec))
                }}</span>
              </div>
            </div>
            <div class="rc-foot">
              <button
                v-if="pickAuthId(rec)"
                type="button"
                class="btn-refresh-status sm"
                :disabled="refreshingId === pickAuthId(rec)"
                @click="refreshAuthStatusForRecord(rec)"
              >
                <span
                  class="btn-refresh-ic"
                  :class="{ spin: refreshingId === pickAuthId(rec) }"
                  aria-hidden="true"
                >⟳</span>
                {{ refreshingId === pickAuthId(rec) ? '…' : '刷新状态' }}
              </button>
              <button
                v-if="canExtendRecord(rec)"
                type="button"
                class="btn-reauth sm"
                @click="beginExtendAuth(rec)"
              >
                授权延续
              </button>
              <button
                v-if="canRevokeAsGrantor(blockchainFromUser, rec)"
                type="button"
                class="btn-danger-ghost sm"
                :disabled="revokingId === pickAuthId(rec)"
                @click="beginRevoke(rec)"
              >
                {{ revokingId === pickAuthId(rec) ? '…' : '撤销' }}
              </button>
              <button
                v-if="canReauthorizeRecord(rec)"
                type="button"
                class="btn-edit sm"
                @click="fillGrantFormFromRecord(rec)"
              >
                <span class="btn-edit-ic" aria-hidden="true">✎</span>
                去编辑
              </button>
            </div>
          </article>
          </div>
        </div>

        <div
          v-else-if="
            !recordsLoading &&
            !recordsError &&
            !singleRecord &&
            recordTab === 'work' &&
            !recordsFetched
          "
          class="empty-hint"
        >
          <span class="empty-ic" aria-hidden="true">◇</span>
          <p>按作品查询</p>
          <p class="empty-sub">请输入作品 ID 后点击「检索该作品的授权」。</p>
        </div>
        <div
          v-else-if="
            !recordsLoading &&
            !recordsError &&
            !singleRecord &&
            recordTab !== 'id' &&
            recordTab !== 'work' &&
            !recordsFetched
          "
          class="empty-hint"
        >
          <span class="empty-ic" aria-hidden="true">◇</span>
          <p>暂无列表数据</p>
          <p class="empty-sub">正在准备加载，请稍候。</p>
        </div>
        <div
          v-else-if="
            !recordsLoading &&
            !recordsError &&
            !singleRecord &&
            recordTab === 'out' &&
            outListFilter === 'expired' &&
            recordsFetched
          "
          class="empty-hint"
        >
          <span class="empty-ic" aria-hidden="true">◇</span>
          <p>暂无已过期授权</p>
          <p class="empty-sub">当前没有可续授的过期记录，或可在「全部」中查看其它状态。</p>
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

    <Teleport to="body">
      <div
        v-if="revokeModalOpen"
        class="revoke-dlg-backdrop"
        role="presentation"
        @click.self="closeRevokeModal"
      >
        <div
          class="revoke-dlg"
          role="dialog"
          aria-modal="true"
          aria-labelledby="revoke-dlg-title"
          aria-describedby="revoke-dlg-desc"
        >
          <div class="revoke-dlg-glow" aria-hidden="true" />
          <div class="revoke-dlg-head">
            <span class="revoke-dlg-ic" aria-hidden="true">⚠</span>
            <div>
              <h2 id="revoke-dlg-title" class="revoke-dlg-title">撤销授权</h2>
              <p id="revoke-dlg-desc" class="revoke-dlg-lead">
                撤销后对方将失去本条约定的使用权；链上若已存证，请以实际合约与后端为准。
              </p>
            </div>
          </div>

          <div class="revoke-dlg-summary">
            <div class="revoke-sum-row">
              <span class="revoke-sum-k">记录 ID</span>
              <code class="revoke-sum-v mono">{{ revokeModalAuthId || '—' }}</code>
            </div>
            <div class="revoke-sum-row">
              <span class="revoke-sum-k">状态</span>
              <span class="revoke-sum-v">{{ revokeModalStatusLabel }}</span>
            </div>
            <div class="revoke-sum-row">
              <span class="revoke-sum-k">作品</span>
              <span class="revoke-sum-v mono">{{ revokeModalWorkId || '—' }}</span>
            </div>
            <div class="revoke-sum-row">
              <span class="revoke-sum-k">被授权方</span>
              <span class="revoke-sum-v mono" :title="revokeModalGrantee">{{
                revokeModalGrantee
                  ? shortAddress(revokeModalGrantee, 10, 8)
                  : '—'
              }}</span>
            </div>
          </div>

          <label class="revoke-dlg-field">
            <span class="revoke-dlg-lbl">撤销原因 <span class="opt">（可选）</span></span>
            <textarea
              v-model.trim="revokeReasonDraft"
              class="revoke-dlg-textarea inp"
              rows="3"
              maxlength="500"
              placeholder="可填写撤销说明；留空则不向接口传递 reason"
              :disabled="Boolean(revokingId)"
            />
          </label>

          <div class="revoke-dlg-foot">
            <button
              type="button"
              class="revoke-btn revoke-btn--ghost"
              :disabled="Boolean(revokingId)"
              @click="closeRevokeModal"
            >
              取消
            </button>
            <button
              type="button"
              class="revoke-btn revoke-btn--danger"
              :disabled="Boolean(revokingId)"
              @click="confirmRevoke"
            >
              {{ revokingId ? '撤销中…' : '确认撤销' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="extendModalOpen"
        class="reauth-dlg-backdrop"
        role="presentation"
        @click.self="closeExtendModal"
      >
        <div
          class="reauth-dlg"
          role="dialog"
          aria-modal="true"
          aria-labelledby="extend-dlg-title"
        >
          <div class="reauth-dlg-glow" aria-hidden="true" />
          <header class="reauth-dlg-head">
            <span class="reauth-dlg-ic" aria-hidden="true">↻</span>
            <div class="reauth-dlg-head-text">
              <h2 id="extend-dlg-title" class="reauth-dlg-title">授权延续</h2>
              <p class="reauth-dlg-lead">
                在原授权记录上延长有效期，保留作品、被授权方与授权类型不变。
                <template v-if="extendModalExclusive">
                  独占授权仅支持延续，不可重新发起授权。
                </template>
              </p>
            </div>
          </header>

          <div class="reauth-dlg-body">
            <div class="reauth-summary">
              <div class="reauth-sum-row">
                <span class="reauth-sum-k">授权 ID</span>
                <code class="reauth-sum-v mono">{{ extendModalAuthId || '—' }}</code>
              </div>
              <div class="reauth-sum-row">
                <span class="reauth-sum-k">作品 ID</span>
                <code class="reauth-sum-v mono">{{ extendModalWorkId || '—' }}</code>
              </div>
              <div class="reauth-sum-row">
                <span class="reauth-sum-k">被授权方</span>
                <code class="reauth-sum-v mono">{{ extendModalGrantee || '—' }}</code>
              </div>
              <div class="reauth-sum-row">
                <span class="reauth-sum-k">授权类型</span>
                <span class="reauth-sum-v reauth-sum-v--text">{{
                  AUTH_TYPE_OPTIONS.find((o) => o.value === extendModalAuthType)?.label ||
                  extendModalAuthType
                }}</span>
              </div>
            </div>
            <label class="reauth-expire-check">
              <input v-model="extendPermanent" type="checkbox" class="reauth-expire-chk" />
              <span>改为永久授权（不设置失效时间）</span>
            </label>
            <label class="reauth-expire-field">
              <span class="reauth-expire-lbl">新失效时间</span>
              <input
                v-model="extendExpireDraft"
                type="datetime-local"
                class="reauth-expire-inp"
                :disabled="extendPermanent"
              />
              <span class="reauth-expire-hint">格式 yyyy-MM-ddTHH:mm:ss；勾选永久则留空提交</span>
            </label>
          </div>

          <p v-if="extendError" class="reauth-err">{{ extendError }}</p>

          <footer class="reauth-dlg-foot">
            <button
              type="button"
              class="reauth-btn reauth-btn--ghost"
              :disabled="extendBusy"
              @click="closeExtendModal"
            >
              取消
            </button>
            <button
              type="button"
              class="reauth-btn reauth-btn--primary"
              :disabled="extendBusy"
              @click="confirmExtendAuth"
            >
              {{ extendBusy ? '提交中…' : '确认延续' }}
            </button>
          </footer>
        </div>
      </div>
    </Teleport>
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
  background: var(--bccr-panel-bg);
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
  color: var(--bccr-warning-text);
}

.main-tab.active {
  color: var(--bccr-warning-text);
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.45), rgba(217, 119, 6, 0.32));
  box-shadow: 0 4px 22px rgba(245, 158, 11, 0.22);
}

.card {
  padding: 1.4rem 1.45rem;
  border-radius: 1.05rem;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: var(--bccr-card);
  margin-bottom: 1rem;
}

.card-grant {
  border-color: rgba(251, 191, 36, 0.14);
  box-shadow: 0 0 0 1px rgba(245, 158, 11, 0.05), 0 20px 50px var(--bccr-code-bg);
}

.card-records {
  border-color: rgba(52, 211, 153, 0.12);
  box-shadow: 0 0 0 1px rgba(16, 185, 129, 0.04), 0 20px 50px var(--bccr-hover);
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
  color: var(--bccr-text-secondary);
}

.opt {
  font-weight: 500;
  text-transform: none;
  letter-spacing: 0;
  color: var(--bccr-muted);
  font-size: 0.7rem;
}

.req {
  color: var(--bccr-warning-text);
  font-style: normal;
}

.inp {
  padding: 0.58rem 0.75rem;
  border-radius: 0.55rem;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: var(--bccr-card);
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
  color: var(--bccr-danger);
  line-height: 1.45;
}

.grantee-field .field-hint {
  margin: 0 0 0.45rem;
  font-size: 0.78rem;
  color: var(--bccr-muted);
  line-height: 1.45;
}

/* 作品下拉盖住下方被授权方输入区：层级见 assets/work-pick-combo.css（.bccr-work-pick-combo.auth-work-field） */

/* 被授权方：层级见 work-pick-combo.css（.bccr-work-pick-combo.auth-grantee-field） */

.api-hint {
  margin: 0.65rem 0 0;
  font-size: 0.72rem;
  line-height: 1.55;
  color: var(--bccr-text-secondary);
}

.api-hint .mono {
  font-size: 0.7rem;
  color: var(--bccr-warning-text);
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
  border: 1px solid var(--bccr-option-border);
  background: var(--bccr-option-bg);
  cursor: pointer;
  transition:
    border-color 0.15s,
    background 0.15s,
    box-shadow 0.15s,
    color 0.15s;
}

.type-card:hover {
  border-color: var(--bccr-option-hover-border);
  background: var(--bccr-option-hover-bg);
}

.type-card.on {
  border-color: var(--bccr-option-active-border);
  background: var(--bccr-option-active-bg);
  box-shadow: 0 0 0 1px rgba(37, 99, 235, 0.08);
}

.type-title {
  font-size: 0.88rem;
  font-weight: 650;
  color: var(--bccr-text);
}

.type-card.on .type-title {
  color: var(--bccr-option-active-text);
}

.type-hint {
  font-size: 0.72rem;
  line-height: 1.4;
  color: var(--bccr-muted);
}

.type-card.on .type-hint {
  color: var(--bccr-text-secondary);
}

.addr-pill {
  padding: 0.55rem 0.7rem;
  border-radius: 0.5rem;
  background: var(--bccr-code-bg);
  border: 1px solid rgba(148, 163, 184, 0.12);
  font-size: 0.8rem;
  color: var(--bccr-muted);
  word-break: break-all;
}

.err {
  margin: 0.85rem 0 0;
  padding: 0.55rem 0.75rem;
  border-radius: 0.45rem;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(248, 113, 113, 0.25);
  color: var(--bccr-danger);
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
  background: linear-gradient(125deg, rgba(34, 197, 94, 0.1), var(--bccr-surface-muted));
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
  color: var(--bccr-success-text);
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
  color: var(--bccr-warning-text);
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
  color: var(--bccr-success-text);
}

.sub-tab.active {
  border-color: rgba(52, 211, 153, 0.45);
  background: rgba(16, 185, 129, 0.14);
  color: var(--bccr-success-text);
}

.query-panel {
  padding: 1rem 1.05rem;
  margin-bottom: 1rem;
  border-radius: 0.8rem;
  background: var(--bccr-hover);
  border: 1px solid rgba(148, 163, 184, 0.1);
}

.query-panel .addr-chip {
  margin-bottom: 0;
}

.records-loading-block {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.85rem 1rem;
  margin-bottom: 0.75rem;
  border-radius: 0.65rem;
  border: 1px solid rgba(251, 191, 36, 0.18);
  background: var(--bccr-card);
  font-size: 0.86rem;
  color: var(--bccr-warning-text);
}

.records-loading-spin {
  display: inline-block;
  font-size: 1.1rem;
  line-height: 1;
  animation: bccr-rec-spin 0.85s linear infinite;
}

@keyframes bccr-rec-spin {
  to {
    transform: rotate(360deg);
  }
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
  color: var(--bccr-text);
  padding: 0.45rem 0.55rem;
  border-radius: 0.4rem;
  background: var(--bccr-card);
}

.btn-query {
  margin-top: 0.2rem;
  width: 100%;
  padding: 0.55rem 1rem;
  border-radius: 0.5rem;
  border: none;
  font-weight: 650;
  font-size: 0.88rem;
  color: var(--bccr-text);
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
  background: var(--bccr-code-bg);
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
  color: var(--bccr-success-text);
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
  color: var(--bccr-success-text);
}

.st-pill.tone-warn {
  background: rgba(251, 191, 36, 0.12);
  border-color: rgba(251, 191, 36, 0.35);
  color: var(--bccr-warning-text);
}

.st-pill.tone-bad {
  background: rgba(248, 113, 113, 0.12);
  border-color: rgba(248, 113, 113, 0.3);
  color: var(--bccr-danger);
}

.st-pill.tone-muted {
  background: rgba(148, 163, 184, 0.12);
  border-color: rgba(148, 163, 184, 0.22);
  color: var(--bccr-muted);
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
  color: var(--bccr-text);
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
  color: var(--bccr-success-text);
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
  color: var(--bccr-danger);
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

.record-list-scroll {
  max-height: min(52vh, 480px);
  overflow-y: auto;
  overflow-x: hidden;
  margin-top: 0.25rem;
  padding-right: 0.2rem;
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
  background: linear-gradient(145deg, var(--bccr-surface-muted), var(--bccr-surface-muted));
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
  color: var(--bccr-warning-text);
  font-weight: 600;
}

.rc-id {
  margin: 0 0 0.65rem;
  font-size: 0.76rem;
  color: var(--bccr-label);
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
  color: var(--bccr-text);
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
  color: var(--bccr-success-text);
  cursor: pointer;
  text-align: left;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.rc-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
  margin-top: 0.75rem;
  padding-top: 0.65rem;
  border-top: 1px solid rgba(148, 163, 184, 0.1);
}

.rcv--expired {
  color: var(--bccr-warning-text);
  font-weight: 600;
}

.query-panel--out {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.out-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.out-filter-btn {
  position: relative;
  padding: 0.38rem 0.85rem;
  border-radius: 999px;
  border: 1px solid var(--bccr-border);
  background: var(--bccr-card);
  color: var(--bccr-muted);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    background 0.12s,
    border-color 0.12s,
    color 0.12s;
}

.out-filter-btn.active {
  border-color: rgba(99, 102, 241, 0.45);
  background: var(--bccr-accent-soft);
  color: var(--bccr-accent-text);
}

.out-filter-badge {
  margin-left: 0.35rem;
  padding: 0.05rem 0.35rem;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 700;
  background: rgba(251, 191, 36, 0.2);
  color: var(--bccr-warning-text);
}

.out-filter-hint {
  margin: 0;
  font-size: 0.8rem;
  line-height: 1.55;
  color: var(--bccr-muted);
}

.btn-reauth {
  padding: 0.45rem 0.85rem;
  border-radius: 0.5rem;
  border: none;
  background: var(--bccr-btn-primary-bg);
  color: var(--bccr-on-accent);
  font-size: 0.84rem;
  font-weight: 650;
  cursor: pointer;
  box-shadow: var(--bccr-shadow-sm);
  transition:
    background 0.12s,
    box-shadow 0.12s,
    transform 0.12s;
}

.btn-reauth:hover:not(:disabled) {
  background: var(--bccr-btn-primary-hover);
  box-shadow: var(--bccr-shadow-md);
  transform: translateY(-1px);
}

.btn-reauth:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.btn-reauth.sm {
  padding: 0.34rem 0.72rem;
  font-size: 0.78rem;
}

.btn-edit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.32rem;
  padding: 0.34rem 0.72rem;
  border-radius: 0.5rem;
  border: 1px solid var(--bccr-btn-info-border);
  background: var(--bccr-btn-info-bg);
  color: var(--bccr-btn-info-text);
  font-size: 0.78rem;
  font-weight: 600;
  line-height: 1.2;
  cursor: pointer;
  transition:
    background 0.12s,
    border-color 0.12s,
    color 0.12s,
    box-shadow 0.12s;
}

.btn-edit:hover:not(:disabled) {
  background: var(--bccr-btn-info-hover);
  border-color: var(--bccr-accent-border);
  box-shadow: var(--bccr-shadow-sm);
}

.btn-edit.sm {
  padding: 0.3rem 0.62rem;
  font-size: 0.76rem;
}

.btn-edit-ic {
  font-size: 0.82em;
  opacity: 0.9;
}

.detail-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.card-head--records {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.85rem 1rem;
}

.card-head-main {
  flex: 1 1 16rem;
  min-width: 0;
}

.records-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  flex-shrink: 0;
}

.records-success {
  margin: 0 0 0.85rem;
  padding: 0.55rem 0.85rem;
  border-radius: 0.55rem;
  font-size: 0.84rem;
  line-height: 1.45;
  color: var(--bccr-success-text);
  background: var(--bccr-success-soft);
  border: 1px solid rgba(22, 163, 74, 0.28);
}

.btn-refresh {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.42rem 0.85rem;
  border-radius: 0.5rem;
  border: 1px solid var(--bccr-btn-ghost-border);
  background: var(--bccr-btn-ghost-bg);
  color: var(--bccr-btn-ghost-text);
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    background 0.12s,
    border-color 0.12s,
    color 0.12s;
}

.btn-refresh:hover:not(:disabled) {
  border-color: var(--bccr-btn-ghost-hover-border);
  background: var(--bccr-btn-ghost-hover-bg);
  color: var(--bccr-btn-ghost-hover-text);
}

.btn-refresh--admin {
  border-color: var(--bccr-accent-border);
  background: var(--bccr-accent-soft);
  color: var(--bccr-accent-text);
}

.btn-refresh--admin:hover:not(:disabled) {
  background: rgba(37, 99, 235, 0.16);
  color: var(--bccr-accent-text);
}

.btn-refresh:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-refresh-ic {
  font-size: 0.95rem;
  line-height: 1;
}

.btn-refresh-ic.spin {
  display: inline-block;
  animation: auth-refresh-spin 0.75s linear infinite;
}

@keyframes auth-refresh-spin {
  to {
    transform: rotate(360deg);
  }
}

.btn-refresh-status {
  display: inline-flex;
  align-items: center;
  gap: 0.32rem;
  padding: 0.34rem 0.72rem;
  border-radius: 0.5rem;
  border: 1px solid var(--bccr-btn-info-border);
  background: var(--bccr-btn-info-bg);
  color: var(--bccr-btn-info-text);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    background 0.12s,
    border-color 0.12s,
    box-shadow 0.12s;
}

.btn-refresh-status:hover:not(:disabled) {
  background: var(--bccr-btn-info-hover);
  border-color: var(--bccr-accent-border);
  box-shadow: var(--bccr-shadow-sm);
}

.btn-refresh-status:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.btn-refresh-status.sm {
  padding: 0.3rem 0.62rem;
  font-size: 0.76rem;
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

/* —— 撤销授权二次确认（Teleport 至 body，仍带本组件 scoped） —— */
.revoke-dlg-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.25rem;
  background: rgba(2, 6, 23, 0.72);
  backdrop-filter: blur(8px);
  animation: revoke-dlg-fade-in 0.2s ease-out;
}

@keyframes revoke-dlg-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.revoke-dlg {
  position: relative;
  width: 100%;
  max-width: 420px;
  max-height: min(92vh, 560px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border-radius: 1rem;
  border: 1px solid rgba(248, 113, 113, 0.28);
  background: linear-gradient(165deg, rgba(30, 27, 45, 0.98) 0%, var(--bccr-surface) 55%, rgba(49, 10, 10, 0.35) 100%);
  box-shadow:
    0 0 0 1px var(--bccr-shadow-md),
    0 24px 64px var(--bccr-overlay),
    0 0 80px rgba(239, 68, 68, 0.08);
  animation: revoke-dlg-pop 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}

@keyframes revoke-dlg-pop {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.revoke-dlg-glow {
  position: absolute;
  width: 200px;
  height: 200px;
  right: -80px;
  top: -100px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgba(248, 113, 113, 0.22) 0%,
    rgba(239, 68, 68, 0.06) 45%,
    transparent 70%
  );
  pointer-events: none;
}

.revoke-dlg-head {
  position: relative;
  display: flex;
  gap: 0.85rem;
  padding: 1.15rem 1.2rem 0.85rem;
  border-bottom: 1px solid rgba(248, 113, 113, 0.15);
}

.revoke-dlg-ic {
  flex-shrink: 0;
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.65rem;
  font-size: 1.15rem;
  background: rgba(248, 113, 113, 0.12);
  border: 1px solid rgba(252, 165, 165, 0.25);
  color: var(--bccr-danger);
}

.revoke-dlg-title {
  margin: 0 0 0.35rem;
  font-size: 1.12rem;
  font-weight: 750;
  letter-spacing: -0.02em;
  color: #991b1b;
}

.revoke-dlg-lead {
  margin: 0;
  font-size: 0.78rem;
  line-height: 1.55;
  color: var(--bccr-muted);
}

.revoke-dlg-summary {
  position: relative;
  padding: 0.85rem 1.2rem;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  background: var(--bccr-hover);
}

.revoke-sum-row {
  display: grid;
  grid-template-columns: 5.2rem 1fr;
  gap: 0.5rem;
  align-items: baseline;
  font-size: 0.8rem;
}

.revoke-sum-k {
  color: var(--bccr-text-hint);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-size: 0.65rem;
}

.revoke-sum-v {
  margin: 0;
  color: #9d174d;
  word-break: break-all;
}

.revoke-dlg-field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.85rem 1.2rem 0.25rem;
}

.revoke-dlg-lbl {
  font-size: 0.74rem;
  font-weight: 650;
  color: var(--bccr-warning-text);
}

.revoke-dlg-lbl .opt {
  font-weight: 500;
  color: var(--bccr-muted);
}

.revoke-dlg-textarea {
  resize: vertical;
  min-height: 4.5rem;
  font-size: 0.84rem;
  line-height: 1.45;
  border-radius: 0.55rem;
  border-color: rgba(251, 191, 36, 0.22) !important;
  background: var(--bccr-card) !important;
}

.revoke-dlg-textarea:focus {
  outline: none;
  border-color: rgba(252, 165, 165, 0.45) !important;
  box-shadow: 0 0 0 3px rgba(248, 113, 113, 0.12);
}

.revoke-dlg-foot {
  display: flex;
  justify-content: flex-end;
  gap: 0.55rem;
  padding: 1rem 1.2rem 1.15rem;
  margin-top: auto;
  border-top: 1px solid rgba(148, 163, 184, 0.1);
  background: rgba(0, 0, 0, 0.15);
}

.revoke-btn {
  padding: 0.48rem 1rem;
  border-radius: 0.5rem;
  font-size: 0.86rem;
  font-weight: 650;
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s,
    transform 0.12s;
}

.revoke-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  transform: none;
}

.revoke-btn--ghost {
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: rgba(30, 41, 59, 0.5);
  color: var(--bccr-text);
}

.revoke-btn--ghost:hover:not(:disabled) {
  background: rgba(51, 65, 85, 0.55);
  border-color: rgba(203, 213, 225, 0.45);
}

.revoke-btn--danger {
  border: 1px solid rgba(248, 113, 113, 0.55);
  background: linear-gradient(135deg, rgba(220, 38, 38, 0.85), rgba(185, 28, 28, 0.92));
  color: #fff;
  box-shadow: 0 6px 20px rgba(220, 38, 38, 0.35);
}

.revoke-btn--danger:hover:not(:disabled) {
  filter: brightness(1.06);
  transform: translateY(-1px);
}

/* —— 再次授权弹窗（浅色主题，与系统变量一致） —— */
.reauth-dlg-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.25rem;
  background: var(--bccr-overlay);
  backdrop-filter: blur(6px);
  animation: revoke-dlg-fade-in 0.2s ease-out;
}

.reauth-dlg {
  position: relative;
  width: 100%;
  max-width: 440px;
  max-height: min(92vh, 580px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border-radius: 1rem;
  border: 1px solid var(--bccr-accent-border);
  background: var(--bccr-surface-overlay);
  box-shadow: var(--bccr-shadow-lg), 0 0 0 1px rgba(37, 99, 235, 0.06);
  animation: revoke-dlg-pop 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}

.reauth-dlg-glow {
  position: absolute;
  width: 220px;
  height: 220px;
  right: -70px;
  top: -90px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgba(37, 99, 235, 0.14) 0%,
    rgba(79, 70, 229, 0.06) 45%,
    transparent 70%
  );
  pointer-events: none;
}

.reauth-dlg-head {
  position: relative;
  display: flex;
  gap: 0.85rem;
  align-items: flex-start;
  padding: 1.15rem 1.25rem 1rem;
  border-bottom: 1px solid var(--bccr-border);
  background: linear-gradient(180deg, var(--bccr-accent-soft) 0%, transparent 100%);
}

.reauth-dlg-ic {
  flex-shrink: 0;
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.65rem;
  font-size: 1.2rem;
  font-weight: 700;
  background: var(--bccr-btn-info-bg);
  border: 1px solid var(--bccr-btn-info-border);
  color: var(--bccr-accent-text);
}

.reauth-dlg-title {
  margin: 0 0 0.35rem;
  font-size: 1.12rem;
  font-weight: 750;
  letter-spacing: -0.02em;
  color: var(--bccr-heading);
}

.reauth-dlg-lead {
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.55;
  color: var(--bccr-muted);
}

.reauth-dlg-body {
  position: relative;
  padding: 1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.reauth-summary {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem 0.85rem;
  border-radius: 0.65rem;
  border: 1px solid var(--bccr-border);
  background: var(--bccr-surface-muted);
}

.reauth-sum-row {
  display: grid;
  grid-template-columns: 4.75rem 1fr;
  gap: 0.5rem;
  align-items: baseline;
  font-size: 0.82rem;
}

.reauth-sum-k {
  color: var(--bccr-label);
  font-weight: 600;
  font-size: 0.72rem;
}

.reauth-sum-v {
  margin: 0;
  color: var(--bccr-text);
  word-break: break-all;
}

.reauth-sum-v.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.78rem;
  color: var(--bccr-accent-text);
}

.reauth-sum-v--text {
  font-weight: 600;
  color: var(--bccr-text-secondary);
}

.reauth-expire-check {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: var(--bccr-text-secondary, #475569);
  cursor: pointer;
}

.reauth-expire-chk {
  margin-top: 0.15rem;
  accent-color: var(--bccr-accent, #2563eb);
}

.reauth-expire-field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.reauth-expire-hint {
  font-size: 0.75rem;
  color: var(--bccr-text-muted, #64748b);
  line-height: 1.4;
}

.reauth-expire-lbl {
  font-size: 0.78rem;
  font-weight: 650;
  color: var(--bccr-label);
}

.reauth-expire-inp {
  width: 100%;
  box-sizing: border-box;
  padding: 0.5rem 0.65rem;
  border-radius: 0.5rem;
  border: 1px solid var(--bccr-border);
  background: var(--bccr-input-bg);
  color: var(--bccr-text);
  font-size: 0.88rem;
  transition:
    border-color 0.12s,
    box-shadow 0.12s;
}

.reauth-expire-inp:focus {
  outline: none;
  border-color: var(--bccr-accent-border);
  box-shadow: 0 0 0 3px var(--bccr-accent-soft);
}

.reauth-err {
  margin: 0 1.25rem;
  padding: 0.55rem 0.75rem;
  border-radius: 0.5rem;
  font-size: 0.82rem;
  text-align: left;
  color: var(--bccr-btn-danger-text);
  background: var(--bccr-btn-danger-bg);
  border: 1px solid var(--bccr-btn-danger-border);
}

.reauth-dlg-foot {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.55rem;
  padding: 0.95rem 1.25rem 1.15rem;
  margin-top: auto;
  border-top: 1px solid var(--bccr-border);
  background: var(--bccr-surface-muted);
}

.reauth-btn {
  padding: 0.5rem 1.05rem;
  border-radius: 0.5rem;
  font-size: 0.86rem;
  font-weight: 650;
  cursor: pointer;
  transition:
    background 0.12s,
    border-color 0.12s,
    box-shadow 0.12s,
    transform 0.12s;
}

.reauth-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.reauth-btn--ghost {
  border: 1px solid var(--bccr-btn-ghost-border);
  background: var(--bccr-btn-ghost-bg);
  color: var(--bccr-btn-ghost-text);
}

.reauth-btn--ghost:hover:not(:disabled) {
  border-color: var(--bccr-btn-ghost-hover-border);
  background: var(--bccr-btn-ghost-hover-bg);
  color: var(--bccr-btn-ghost-hover-text);
}

.reauth-btn--primary {
  border: none;
  background: var(--bccr-btn-primary-bg);
  color: var(--bccr-on-accent);
  box-shadow: var(--bccr-shadow-sm);
}

.reauth-btn--primary:hover:not(:disabled) {
  background: var(--bccr-btn-primary-hover);
  box-shadow: var(--bccr-shadow-md);
  transform: translateY(-1px);
}
</style>
