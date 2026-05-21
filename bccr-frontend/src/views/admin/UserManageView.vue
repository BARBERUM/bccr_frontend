<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { normalizeMediaSrc } from '@/api/client'
import * as adminUsersApi from '@/api/adminUsers'
import {
  formatAdminListDateTime,
  formatUserEnabled,
  isSameUser,
  pickAdminUserIdDisplay,
  pickAdminUserKey,
  pickLoginIp,
  pickLastLoginAtRaw,
  pickNickname,
  pickRegisterAtRaw,
  pickRegisterIp,
  pickUserEmail,
  pickUsername,
  userRowRoleCodes,
} from '@/lib/adminUserDisplay'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

const MANAGEABLE_ROLES = [
  { code: 'admin', label: '超级管理员' },
  { code: 'auditor', label: '审核员' },
  { code: 'user', label: '普通用户' },
  { code: 'agent', label: '版权代理' },
]

const filterUserIdInput = ref('')
const filterUsernameInput = ref('')
const filterStartDateInput = ref('')
const filterEndDateInput = ref('')

const filterUserIdActive = ref('')
const filterUsernameActive = ref('')
const filterStartTimeActive = ref('')
const filterEndTimeActive = ref('')

const page = ref(1)
const size = ref(10)

const listLoading = ref(false)
const listError = ref('')
/** @type {import('vue').Ref<Record<string, unknown>[]>} */
const records = ref([])
const total = ref(0)
const pages = ref(0)

/** @type {import('vue').Ref<Record<string, unknown> | null>} */
const selected = ref(null)
const detailLoading = ref(false)

const pending = ref('')

/** 居中二次确认弹窗（停用/启用/删除/收回角色） */
const confirmOpen = ref(false)
const confirmTitle = ref('')
const confirmBody = ref('')
/** @type {import('vue').Ref<'neutral' | 'warning' | 'danger'>} */
const confirmVariant = ref('neutral')
/** @type {import('vue').Ref<'status' | 'delete' | 'revoke' | null>} */
const confirmKind = ref(null)
/** @type {import('vue').Ref<Record<string, unknown> | null>} */
const confirmRow = ref(null)
const confirmRole = ref('')

/**
 * @param {{
 *   kind: 'status' | 'delete' | 'revoke',
 *   row: Record<string, unknown>,
 *   title: string,
 *   body: string,
 *   variant?: 'neutral' | 'warning' | 'danger',
 *   role?: string,
 * }} opts
 */
function openConfirmDialog(opts) {
  confirmKind.value = opts.kind
  confirmRow.value = opts.row
  confirmTitle.value = opts.title
  confirmBody.value = opts.body
  confirmVariant.value = opts.variant ?? 'neutral'
  confirmRole.value = opts.role ?? ''
  confirmOpen.value = true
}

function closeConfirmDialog() {
  confirmOpen.value = false
  confirmKind.value = null
  confirmRow.value = null
  confirmRole.value = ''
  confirmTitle.value = ''
  confirmBody.value = ''
}

async function executeConfirm() {
  const row = confirmRow.value
  const kind = confirmKind.value
  const role = confirmRole.value
  if (!row || !kind) {
    closeConfirmDialog()
    return
  }
  confirmOpen.value = false
  const k = kind
  const r = row
  const rl = role
  confirmKind.value = null
  confirmRow.value = null
  confirmRole.value = ''
  confirmTitle.value = ''
  confirmBody.value = ''
  if (k === 'status') await doToggleEnabled(r)
  else if (k === 'delete') await doRemoveUser(r)
  else if (k === 'revoke') await doRevokeRole(r, rl)
}

const pageTotalLabel = computed(() => {
  if (!total.value) return '暂无数据'
  return `共 ${total.value} 人 · 第 ${page.value}/${Math.max(1, pages.value)} 页`
})

/** @param {string} userKey */
/** @param {string} part */
function setPending(userKey, part) {
  pending.value = `${userKey}:${part}`
}

/** @param {string} userKey */
/** @param {string} part */
function isPending(userKey, part) {
  return pending.value === `${userKey}:${part}`
}

function clearPending() {
  pending.value = ''
}

/** @param {Record<string, unknown>} row */
function rowAvatarUrl(row) {
  const raw = row.avatar ?? row.avatarUrl ?? row.headImg
  if (typeof raw === 'string' && raw.trim()) return normalizeMediaSrc(raw.trim())
  return ''
}

/** @param {Record<string, unknown>} row */
function rowInitial(row) {
  const n = pickNickname(row)
  if (n) return n.charAt(0).toUpperCase()
  const u = pickUsername(row)
  return u ? u.charAt(0).toUpperCase() : '?'
}

function isSelf(row) {
  return isSameUser(auth.user, row)
}

/** 对列表中未带回角色字段的行并行拉取 GET …/roles，保证列表可就地分配 */
async function hydrateListRoles(rows) {
  const need = rows.filter((row) => {
    const key = pickAdminUserKey(row)
    if (!key) return false
    return userRowRoleCodes(row).length === 0
  })
  if (!need.length) return rows
  const fetched = await Promise.all(
    need.map(async (row) => {
      const key = pickAdminUserKey(row)
      try {
        const data = await adminUsersApi.fetchUserRoles(key)
        return { key, roles: adminUsersApi.normalizeRolesList(data) }
      } catch {
        return { key, roles: row.roles }
      }
    }),
  )
  const byKey = new Map(fetched.map((x) => [x.key, x.roles]))
  return rows.map((row) => {
    const key = pickAdminUserKey(row)
    if (!key || !byKey.has(key)) return row
    return { ...row, roles: byKey.get(key) }
  })
}

/**
 * 后端若忽略 userId / username 查询仍返回整页用户时，在本页收窄：用户 ID 精确匹配，用户名模糊（包含子串）。
 * @param {{ records: Record<string, unknown>[], total: number, page: number, size: number, pages: number }} norm
 */
function applyClientQueryGuards(norm) {
  const uid = filterUserIdActive.value.trim()
  const uname = filterUsernameActive.value.trim().toLowerCase()
  if (!uid && !uname) return norm

  const raw = norm.records
  let records = raw
  if (uid) {
    records = records.filter((r) => {
      const id = String(pickAdminUserIdDisplay(r) ?? r.id ?? r.userId ?? r.uid ?? '').trim()
      return id === uid
    })
  }
  if (uname) {
    records = records.filter((r) => pickUsername(r).toLowerCase().includes(uname))
  }

  if (records.length === raw.length) return norm

  const t = records.length
  if (t === 0 && raw.length > 0) {
    listError.value =
      '未找到符合条件的用户（用户名为包含匹配、用户 ID 为精确匹配）。服务端返回了未过滤列表时，已在本页收窄；请核对 /api/user/list 的 userId、username。'
  } else {
    listError.value =
      '提示：服务端返回的列表未完全按筛选过滤，已在本页按用户名模糊、用户 ID 精确校正；仍建议修复后端 list 接口。'
  }

  return {
    ...norm,
    records,
    total: t,
    page: 1,
    pages: t > 0 ? 1 : 0,
    size: norm.size,
  }
}

async function loadList() {
  listLoading.value = true
  listError.value = ''
  try {
    const data = await adminUsersApi.fetchAdminUserList({
      pageNum: page.value,
      pageSize: size.value,
      userId: filterUserIdActive.value || undefined,
      username: filterUsernameActive.value || undefined,
      startTime: filterStartTimeActive.value || undefined,
      endTime: filterEndTimeActive.value || undefined,
    })
    const norm = applyClientQueryGuards(adminUsersApi.normalizeAdminUserPage(data))
    records.value = await hydrateListRoles(norm.records)
    total.value = norm.total
    pages.value = norm.pages
    size.value = norm.size
    page.value = norm.page

    if (selected.value) {
      const k = pickAdminUserKey(selected.value)
      const again = records.value.find((r) => pickAdminUserKey(r) === k)
      if (again) {
        selected.value = again
        await refreshDetail(again)
      } else {
        selected.value = null
      }
    }
  } catch (e) {
    listError.value = e?.message || '加载用户列表失败，请确认已使用管理员账号登录。'
    records.value = []
    total.value = 0
    pages.value = 0
  } finally {
    listLoading.value = false
  }
}

async function applySearch() {
  const s = filterStartDateInput.value.trim()
  const e = filterEndDateInput.value.trim()
  if (s && e && s > e) {
    listError.value = '注册起始日期不能晚于结束日期'
    return
  }
  listError.value = ''
  filterUserIdActive.value = filterUserIdInput.value.trim()
  filterUsernameActive.value = filterUsernameInput.value.trim()
  filterStartTimeActive.value = s
  filterEndTimeActive.value = e
  page.value = 1
  await nextTick()
  await loadList()
}

function resetFilters() {
  filterUserIdInput.value = ''
  filterUsernameInput.value = ''
  filterStartDateInput.value = ''
  filterEndDateInput.value = ''
  filterUserIdActive.value = ''
  filterUsernameActive.value = ''
  filterStartTimeActive.value = ''
  filterEndTimeActive.value = ''
  listError.value = ''
  page.value = 1
  loadList()
}

function onPageSizeChange() {
  page.value = 1
  loadList()
}

function goPrev() {
  if (page.value <= 1) return
  page.value -= 1
  loadList()
}

function goNext() {
  if (page.value >= pages.value) return
  page.value += 1
  loadList()
}

/** @param {Record<string, unknown>} row */
function selectRow(row) {
  selected.value = row
  refreshDetail(row)
}

async function refreshDetail(row) {
  const key = pickAdminUserKey(row)
  if (!key) return
  detailLoading.value = true
  try {
    const data = await adminUsersApi.fetchUserRoles(key)
    const roles = adminUsersApi.normalizeRolesList(data)
    const merged = { ...row, roles }
    selected.value = merged
    const idx = records.value.findIndex((r) => pickAdminUserKey(r) === key)
    if (idx >= 0) records.value.splice(idx, 1, merged)
  } catch {
    selected.value = { ...row }
  } finally {
    detailLoading.value = false
  }
}

/** @param {Record<string, unknown>} row */
async function doToggleEnabled(row) {
  const key = pickAdminUserKey(row)
  if (!key) return
  const st = formatUserEnabled(row)
  const next = !st.enabled
  setPending(key, 'status')
  listError.value = ''
  try {
    if (next) await adminUsersApi.putUserEnable(key)
    else await adminUsersApi.putUserDisable(key)
    await loadList()
  } catch (e) {
    listError.value = e?.message || '更新账号状态失败'
  } finally {
    clearPending()
  }
}

/** @param {Record<string, unknown>} row */
async function toggleEnabled(row) {
  const key = pickAdminUserKey(row)
  if (!key) return
  const st = formatUserEnabled(row)
  const next = !st.enabled
  let title = ''
  let body = ''
  /** @type {'neutral' | 'warning'} */
  let variant = 'neutral'
  if (isSelf(row) && !next) {
    title = '停用当前账号'
    body = '即将停用当前登录账号，之后将无法以此账号登录，确定继续？'
    variant = 'warning'
  } else if (!next) {
    title = '停用账号'
    body = `确定停用用户「${pickUsername(row) || key}」？`
    variant = 'warning'
  } else {
    title = '启用账号'
    body = `确定重新启用用户「${pickUsername(row) || key}」？`
    variant = 'neutral'
  }
  openConfirmDialog({ kind: 'status', row, title, body, variant })
}

/** @param {Record<string, unknown>} row */
/** @param {string} role */
async function grantRole(row, role) {
  const key = pickAdminUserKey(row)
  if (!key) return
  const codes = userRowRoleCodes(row)
  if (codes.includes(role.toLowerCase())) return
  setPending(key, `grant:${role}`)
  listError.value = ''
  try {
    await adminUsersApi.putUserRole(key, role)
    await loadList()
  } catch (e) {
    listError.value = e?.message || '授予角色失败'
  } finally {
    clearPending()
  }
}

/** @param {Record<string, unknown>} row */
/** @param {string} role */
async function doRevokeRole(row, role) {
  const key = pickAdminUserKey(row)
  if (!key) return
  setPending(key, `revoke:${role}`)
  listError.value = ''
  try {
    await adminUsersApi.deleteUserRole(key, role)
    await loadList()
  } catch (e) {
    listError.value = e?.message || '收回角色失败'
  } finally {
    clearPending()
  }
}

/** @param {Record<string, unknown>} row */
/** @param {string} role */
async function revokeRole(row, role) {
  const key = pickAdminUserKey(row)
  if (!key) return
  const rl = role.toLowerCase()
  if (isSelf(row) && rl === 'admin') {
    listError.value = '不能收回自己的超级管理员角色'
    return
  }
  openConfirmDialog({
    kind: 'revoke',
    row,
    role,
    title: '收回角色',
    body: `确定收回角色「${roleLabel(rl)}」？`,
    variant: 'warning',
  })
}

/** @param {string} code */
function roleLabel(code) {
  const m = MANAGEABLE_ROLES.find((x) => x.code === code.toLowerCase())
  return m?.label ?? code
}

/** @param {Record<string, unknown>} row */
/** @param {string} code */
function rowHasRole(row, code) {
  return userRowRoleCodes(row).includes(code.toLowerCase())
}

/** @param {Record<string, unknown>} row */
async function doRemoveUser(row) {
  const key = pickAdminUserKey(row)
  if (!key) return
  setPending(key, 'delete')
  listError.value = ''
  try {
    await adminUsersApi.deleteUser(key)
    if (selected.value && pickAdminUserKey(selected.value) === key) {
      selected.value = null
    }
    await loadList()
  } catch (e) {
    listError.value = e?.message || '删除用户失败'
  } finally {
    clearPending()
  }
}

/** @param {Record<string, unknown>} row */
async function removeUser(row) {
  const key = pickAdminUserKey(row)
  if (!key) return
  if (isSelf(row)) {
    listError.value = '不能删除当前登录账号'
    return
  }
  const name = pickUsername(row) || key
  openConfirmDialog({
    kind: 'delete',
    row,
    title: '删除用户',
    body: `确定永久删除用户「${name}」？该操作不可撤销。`,
    variant: 'danger',
  })
}

function onConfirmEscape(e) {
  if (e.key === 'Escape' && confirmOpen.value) closeConfirmDialog()
}

onMounted(() => {
  window.addEventListener('keydown', onConfirmEscape)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onConfirmEscape)
})

loadList()
</script>

<template>
  <div class="um-shell">
    <div class="um-page">
      <header class="hero hero-compact">
        <h1 class="title">用户管理</h1>
        <p class="lead">
          支持按用户 ID、用户名（模糊）、注册日期区间筛选；与接口 pageNum、pageSize 对齐。行内改角色，点选后在侧栏启停或删除。
        </p>
      </header>

      <p v-if="listError" class="banner-err">{{ listError }}</p>

      <div class="um-layout">
        <section class="panel list-panel">
          <div class="toolbar toolbar-compact filter-toolbar">
            <div class="filter-grid">
              <label class="ff">
                <span class="ff-l">用户 ID</span>
                <input
                  v-model.trim="filterUserIdInput"
                  type="text"
                  class="ff-inp"
                  placeholder="精确匹配"
                  autocomplete="off"
                  @keydown.enter.prevent="applySearch"
                />
              </label>
              <label class="ff">
                <span class="ff-l">用户名</span>
                <input
                  v-model.trim="filterUsernameInput"
                  type="search"
                  class="ff-inp"
                  placeholder="模糊匹配"
                  autocomplete="off"
                  @keydown.enter.prevent="applySearch"
                />
              </label>
              <label class="ff">
                <span class="ff-l">注册 ≥</span>
                <input v-model="filterStartDateInput" type="date" class="ff-inp" />
              </label>
              <label class="ff">
                <span class="ff-l">注册 ≤</span>
                <input v-model="filterEndDateInput" type="date" class="ff-inp" />
              </label>
              <label class="ff ff-size">
                <span class="ff-l">每页条数</span>
                <select v-model.number="size" class="ff-inp ff-select" @change="onPageSizeChange">
                  <option :value="10">10</option>
                  <option :value="20">20</option>
                  <option :value="50">50</option>
                </select>
              </label>
              <div class="filter-actions">
                <button type="button" class="btn-accent" :disabled="listLoading" @click="applySearch">
                  {{ listLoading ? '…' : '查询' }}
                </button>
                <button type="button" class="btn-ghost" :disabled="listLoading" @click="resetFilters">
                  重置
                </button>
                <button type="button" class="btn-ghost" :disabled="listLoading" @click="loadList">
                  刷新
                </button>
                <span class="toolbar-meta-inline">{{ pageTotalLabel }}</span>
              </div>
            </div>
          </div>

          <div v-if="listLoading && !records.length" class="empty">
            <span class="spin" aria-hidden="true">⟳</span>
            加载用户列表…
          </div>
          <div v-else-if="!records.length" class="empty muted">
            暂无用户数据，请调整筛选条件或点击重置后重试。
          </div>
          <ul v-else class="user-list">
            <li
              v-for="row in records"
              :key="pickAdminUserKey(row)"
              class="user-card"
              :class="{ active: selected && pickAdminUserKey(selected) === pickAdminUserKey(row) }"
              @click="selectRow(row)"
            >
              <div class="uc-av">
                <img v-if="rowAvatarUrl(row)" :src="rowAvatarUrl(row)" alt="" class="uc-img" />
                <span v-else class="uc-ph">{{ rowInitial(row) }}</span>
              </div>
              <div class="uc-row-wrap">
                <div class="uc-row">
                  <div class="uc-core">
                    <span class="uc-name">{{ pickUsername(row) || '—' }}</span>
                    <span
                      class="uc-status"
                      :class="`tone-${formatUserEnabled(row).tone}`"
                    >
                      {{ formatUserEnabled(row).label }}
                    </span>
                    <span class="uc-nick uc-clip" :title="pickNickname(row) || undefined">{{
                      pickNickname(row) || '—'
                    }}</span>
                  </div>
                  <div
                    class="uc-cell"
                    :title="pickAdminUserIdDisplay(row) || pickAdminUserKey(row) || undefined"
                  >
                    <span class="uc-l">用户 ID</span>
                    <span class="uc-v mono uc-clip">{{
                      pickAdminUserIdDisplay(row) || pickAdminUserKey(row) || '—'
                    }}</span>
                  </div>
                  <div class="uc-cell" :title="pickUserEmail(row) || undefined">
                    <span class="uc-l">邮箱</span>
                    <span class="uc-v uc-clip">{{ pickUserEmail(row) || '—' }}</span>
                  </div>
                  <div class="uc-cell" :title="pickRegisterIp(row) || undefined">
                    <span class="uc-l">注册 IP</span>
                    <span class="uc-v mono uc-clip">{{ pickRegisterIp(row) || '—' }}</span>
                  </div>
                  <div class="uc-cell" :title="pickLoginIp(row) || undefined">
                    <span class="uc-l">登录 IP</span>
                    <span class="uc-v mono uc-clip">{{ pickLoginIp(row) || '—' }}</span>
                  </div>
                  <div
                    class="uc-cell"
                    :title="formatAdminListDateTime(pickRegisterAtRaw(row))"
                  >
                    <span class="uc-l">注册时间</span>
                    <span class="uc-v mono uc-clip">{{
                      formatAdminListDateTime(pickRegisterAtRaw(row))
                    }}</span>
                  </div>
                  <div
                    class="uc-cell"
                    :title="formatAdminListDateTime(pickLastLoginAtRaw(row))"
                  >
                    <span class="uc-l">上次登录</span>
                    <span class="uc-v mono uc-clip">{{
                      formatAdminListDateTime(pickLastLoginAtRaw(row))
                    }}</span>
                  </div>
                  <div class="uc-roles" @click.stop>
                    <button
                      v-for="r in MANAGEABLE_ROLES"
                      :key="r.code"
                      type="button"
                      class="rt-pill"
                      :class="{ on: rowHasRole(row, r.code) }"
                      :title="
                        rowHasRole(row, r.code)
                          ? `收回「${r.label}」`
                          : `授予「${r.label}」`
                      "
                      :disabled="
                        listLoading ||
                        isPending(pickAdminUserKey(row), `grant:${r.code}`) ||
                        isPending(pickAdminUserKey(row), `revoke:${r.code}`)
                      "
                      @click="
                        rowHasRole(row, r.code) ? revokeRole(row, r.code) : grantRole(row, r.code)
                      "
                    >
                      {{
                        isPending(pickAdminUserKey(row), `grant:${r.code}`) ||
                        isPending(pickAdminUserKey(row), `revoke:${r.code}`)
                          ? '…'
                          : r.label
                      }}
                    </button>
                  </div>
                </div>
              </div>
            </li>
          </ul>

          <div v-if="pages > 1" class="pager">
            <button type="button" class="btn-page" :disabled="page <= 1 || listLoading" @click="goPrev">
              上一页
            </button>
            <span class="pager-info">{{ page }} / {{ pages }}</span>
            <button
              type="button"
              class="btn-page"
              :disabled="page >= pages || listLoading"
              @click="goNext"
            >
              下一页
            </button>
          </div>
        </section>

        <aside class="panel detail-panel">
          <template v-if="!selected">
            <div class="detail-placeholder">
              <span class="ph-ic" aria-hidden="true">◇</span>
              <p class="ph-title">选择用户</p>
              <p class="ph-sub">点选用户可启停账号或删除用户；角色请在列表行内直接切换。</p>
            </div>
          </template>

          <template v-else>
            <div class="detail-head">
              <div class="dh-av">
                <img
                  v-if="rowAvatarUrl(selected)"
                  :src="rowAvatarUrl(selected)"
                  alt=""
                  class="dh-img"
                />
                <span v-else class="dh-ph">{{ rowInitial(selected) }}</span>
              </div>
              <div class="dh-text">
                <h2 class="dh-title">{{ pickUsername(selected) || pickAdminUserKey(selected) }}</h2>
                <p class="dh-sub">{{ pickNickname(selected) || '未设置昵称' }}</p>
                <p v-if="isSelf(selected)" class="dh-tag">当前登录用户</p>
              </div>
            </div>

            <div v-if="detailLoading" class="detail-loading">同步详情…</div>

            <section class="detail-section">
              <h3 class="ds-h">账号状态</h3>
              <p class="ds-desc">停用后用户通常无法登录；启用即恢复访问（以后端策略为准）。</p>
              <div class="status-row">
                <span
                  class="pill-lg"
                  :class="`tone-${formatUserEnabled(selected).tone}`"
                >
                  {{ formatUserEnabled(selected).label }}
                </span>
                <button
                  v-if="formatUserEnabled(selected).enabled"
                  type="button"
                  class="btn-warn"
                  :disabled="isPending(pickAdminUserKey(selected), 'status')"
                  @click.stop="toggleEnabled(selected)"
                >
                  {{
                    isPending(pickAdminUserKey(selected), 'status')
                      ? '处理中…'
                      : '停用账号'
                  }}
                </button>
                <button
                  v-else
                  type="button"
                  class="btn-ok"
                  :disabled="isPending(pickAdminUserKey(selected), 'status')"
                  @click.stop="toggleEnabled(selected)"
                >
                  {{
                    isPending(pickAdminUserKey(selected), 'status')
                      ? '处理中…'
                      : '启用账号'
                  }}
                </button>
              </div>
            </section>

            <section class="detail-section danger-zone">
              <h3 class="ds-h danger-h">危险操作</h3>
              <p class="ds-desc">删除后无法恢复，请谨慎操作。</p>
              <button
                type="button"
                class="btn-delete"
                :disabled="isSelf(selected) || isPending(pickAdminUserKey(selected), 'delete')"
                @click.stop="removeUser(selected)"
              >
                {{
                  isPending(pickAdminUserKey(selected), 'delete')
                    ? '删除中…'
                    : '删除该用户'
                }}
              </button>
            </section>

          </template>
        </aside>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="confirmOpen"
        class="um-confirm-backdrop"
        role="presentation"
        @click.self="closeConfirmDialog"
      >
        <div
          class="um-confirm-dialog"
          :class="`um-confirm--${confirmVariant}`"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="um-confirm-title"
          @click.stop
        >
          <h3 id="um-confirm-title" class="um-confirm-title">{{ confirmTitle }}</h3>
          <p class="um-confirm-body">{{ confirmBody }}</p>
          <div class="um-confirm-actions">
            <button type="button" class="um-confirm-btn um-confirm-cancel" @click="closeConfirmDialog">
              取消
            </button>
            <button
              type="button"
              class="um-confirm-btn um-confirm-ok"
              :class="{
                'um-confirm-ok--danger': confirmVariant === 'danger',
                'um-confirm-ok--warning': confirmVariant === 'warning',
              }"
              @click="executeConfirm"
            >
              确定
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.um-shell {
  width: 100%;
  display: flex;
  justify-content: center;
  padding: 0.75rem 0 2.75rem;
  box-sizing: border-box;
  min-height: min(82vh, calc(100dvh - 8rem));
}

.um-page {
  width: 100%;
  max-width: none;
}

.hero-compact {
  margin-bottom: 0.85rem;
}

.hero-compact .title {
  font-size: 1.28rem;
  margin-bottom: 0.25rem;
}

.hero-compact .lead {
  font-size: 0.82rem;
  line-height: 1.5;
  max-width: 52rem;
}

.title {
  margin: 0 0 0.35rem;
  font-weight: 780;
  letter-spacing: -0.03em;
  background: linear-gradient(118deg, #ede9fe 0%, #a78bfa 36%, #818cf8 68%, #cbd5e1 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.lead {
  margin: 0;
  color: var(--bccr-muted);
}

.banner-err {
  margin: 0 0 1rem;
  padding: 0.65rem 0.85rem;
  border-radius: 0.55rem;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(248, 113, 113, 0.28);
  color: var(--bccr-danger);
  font-size: 0.88rem;
}

.um-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(260px, 320px);
  gap: 1rem;
  align-items: start;
}

@media (max-width: 900px) {
  .um-layout {
    grid-template-columns: 1fr;
  }
}

.panel {
  border-radius: 1.05rem;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: var(--bccr-card);
  box-shadow: 0 18px 48px var(--bccr-hover);
}

.list-panel {
  padding: 1rem 1.1rem;
  border-color: rgba(139, 92, 246, 0.14);
}

.detail-panel {
  padding: 1.1rem 1.15rem;
  position: sticky;
  top: 0.75rem;
  border-color: rgba(129, 140, 248, 0.18);
}

@media (max-width: 900px) {
  .detail-panel {
    position: static;
  }
}

.toolbar {
  margin-bottom: 1rem;
}

.toolbar-compact {
  margin-bottom: 0.7rem;
}

.filter-toolbar {
  padding: 0.85rem 0.95rem 0.95rem;
}

.filter-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(10.5rem, 1fr));
  gap: 0.55rem 0.75rem;
  align-items: end;
  width: 100%;
}

.ff {
  display: flex;
  flex-direction: column;
  gap: 0.22rem;
  min-width: 0;
}

.ff-l {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--bccr-muted);
}

.ff-inp {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 0.48rem 0.55rem;
  border-radius: 0.5rem;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: var(--bccr-card);
  color: var(--bccr-text);
  font-size: 0.86rem;
  outline: none;
}

.ff-inp:focus {
  border-color: rgba(167, 139, 250, 0.45);
  box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.12);
}

.ff-select {
  cursor: pointer;
}

.ff-size {
  max-width: 9rem;
}

.filter-actions {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
  padding-top: 0.15rem;
  border-top: 1px solid rgba(148, 163, 184, 0.1);
  margin-top: 0.15rem;
}

.filter-actions .toolbar-meta-inline {
  margin-left: auto;
}

@media (max-width: 520px) {
  .filter-actions .toolbar-meta-inline {
    width: 100%;
    margin-left: 0;
    margin-top: 0.35rem;
    text-align: center;
  }
}

.toolbar-meta-inline {
  margin-left: auto;
  font-size: 0.76rem;
  color: var(--bccr-muted);
  white-space: nowrap;
}

@media (max-width: 640px) {
  .toolbar-meta-inline {
    width: 100%;
    margin-left: 0;
    margin-top: 0.35rem;
  }
}

.empty {
  text-align: center;
  padding: 2rem 1rem;
  font-size: 0.9rem;
  color: var(--bccr-text);
}

.empty.muted {
  color: var(--bccr-muted);
}

.spin {
  display: inline-block;
  margin-right: 0.35rem;
  animation: spin 0.85s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.user-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.user-card {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.5rem;
  border-radius: 0.55rem;
  border: 1px solid var(--bccr-choice-surface-border);
  background: #ffffff;
  cursor: pointer;
  transition:
    border-color 0.15s,
    background 0.15s,
    box-shadow 0.15s;
}

.user-card:hover {
  border-color: var(--bccr-option-hover-border);
  background: var(--bccr-option-hover-bg);
  box-shadow: var(--bccr-shadow-sm);
}

.user-card.active {
  border-color: var(--bccr-option-active-border);
  box-shadow: 0 0 0 1px rgba(37, 99, 235, 0.08);
  background: var(--bccr-option-active-bg);
}

.uc-av {
  flex-shrink: 0;
  width: 2.15rem;
  height: 2.15rem;
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid rgba(167, 139, 250, 0.35);
  background: var(--bccr-surface-muted);
}

.uc-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.uc-ph {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 0.85rem;
  font-weight: 750;
  color: #6d28d9;
}

.uc-row-wrap {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.uc-row {
  display: grid;
  width: 100%;
  align-items: center;
  column-gap: 0.28rem;
  row-gap: 0.2rem;
  grid-template-columns:
    minmax(0, 1.05fr)
    minmax(0, 0.48fr)
    minmax(0, 1.05fr)
    minmax(0, 0.52fr)
    minmax(0, 0.52fr)
    minmax(0, 0.72fr)
    minmax(0, 0.72fr)
    minmax(0, 1.15fr);
}

.uc-core {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.28rem;
  min-width: 0;
  padding: 0.12rem 0.2rem;
  text-align: center;
  border-right: 1px solid var(--bccr-choice-surface-border);
}

.uc-name {
  font-weight: 700;
  font-size: 0.84rem;
  color: var(--bccr-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.uc-status {
  font-size: 0.6rem;
  font-weight: 650;
  padding: 0.1rem 0.35rem;
  border-radius: 999px;
  white-space: nowrap;
  flex-shrink: 0;
}

.uc-status.tone-ok {
  background: rgba(34, 197, 94, 0.15);
  color: var(--bccr-success-text);
}

.uc-status.tone-bad {
  background: rgba(248, 113, 113, 0.14);
  color: var(--bccr-danger);
}

.uc-status.tone-muted {
  background: rgba(148, 163, 184, 0.12);
  color: var(--bccr-muted);
}

.uc-nick {
  margin: 0;
  font-size: 0.66rem;
  color: var(--bccr-muted);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.uc-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 0.1rem;
  min-width: 0;
  padding: 0.12rem 0.18rem;
  border-right: 1px solid var(--bccr-choice-surface-border);
}

.uc-l {
  font-size: 0.54rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  color: var(--bccr-muted);
  white-space: nowrap;
  width: 100%;
  text-align: center;
}

.uc-v {
  font-size: 0.66rem;
  color: var(--bccr-text);
  line-height: 1.25;
  min-width: 0;
  width: 100%;
  text-align: center;
}

.uc-v.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.62rem;
  letter-spacing: -0.02em;
}

.uc-clip {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
  max-width: 100%;
}

.uc-roles {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-content: center;
  align-items: center;
  gap: 0.2rem;
  min-width: 0;
  padding: 0.12rem 0.15rem;
  margin-left: 0;
  border-left: none;
  border-right: none;
}

.rt-pill {
  padding: 0.12rem 0.32rem;
  border-radius: 999px;
  border: 1px solid var(--bccr-option-border);
  background: var(--bccr-choice-surface-bg);
  color: var(--bccr-option-text);
  font-size: 0.58rem;
  font-weight: 650;
  cursor: pointer;
  line-height: 1.25;
  white-space: nowrap;
  max-width: 100%;
  transition:
    border-color 0.12s,
    background 0.12s,
    color 0.12s;
}

.rt-pill:hover:not(:disabled) {
  border-color: var(--bccr-option-hover-border);
  background: var(--bccr-option-hover-bg);
  color: var(--bccr-text);
}

.rt-pill.on {
  border-color: rgba(22, 163, 74, 0.38);
  background: var(--bccr-success-soft);
  color: var(--bccr-success-text);
}

.rt-pill.on:hover:not(:disabled) {
  border-color: rgba(220, 38, 38, 0.35);
  background: var(--bccr-danger-soft);
  color: var(--bccr-danger);
}

.rt-pill:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.85rem;
  margin-top: 1.1rem;
  padding-top: 0.85rem;
  border-top: 1px solid rgba(148, 163, 184, 0.1);
}

.pager-info {
  font-size: 0.82rem;
  color: var(--bccr-muted);
}

.detail-placeholder {
  text-align: center;
  padding: 2.5rem 1rem;
  color: var(--bccr-muted);
}

.ph-ic {
  display: block;
  font-size: 1.75rem;
  margin-bottom: 0.5rem;
  opacity: 0.35;
}

.ph-title {
  margin: 0 0 0.35rem;
  font-size: 1rem;
  font-weight: 650;
  color: var(--bccr-muted);
}

.ph-sub {
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.55;
}

.detail-head {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
  margin-bottom: 1.25rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
}

.dh-av {
  flex-shrink: 0;
  width: 4rem;
  height: 4rem;
  border-radius: 50%;
  overflow: hidden;
  border: 3px solid rgba(167, 139, 250, 0.45);
  background: var(--bccr-surface-muted);
}

.dh-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.dh-ph {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 1.45rem;
  font-weight: 780;
  color: #6d28d9;
}

.dh-title {
  margin: 0 0 0.25rem;
  font-size: 1.12rem;
  font-weight: 720;
  color: var(--bccr-text);
  word-break: break-all;
}

.dh-sub {
  margin: 0;
  font-size: 0.84rem;
  color: var(--bccr-muted);
}

.dh-tag {
  margin: 0.45rem 0 0;
  display: inline-block;
  font-size: 0.68rem;
  font-weight: 650;
  padding: 0.18rem 0.5rem;
  border-radius: 999px;
  background: rgba(52, 211, 153, 0.15);
  color: var(--bccr-success-text);
}

.detail-loading {
  font-size: 0.8rem;
  color: var(--bccr-muted);
  margin-bottom: 0.75rem;
}

.detail-section {
  margin-bottom: 1.35rem;
}

.ds-h {
  margin: 0 0 0.35rem;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(196, 181, 253, 0.95);
}

.ds-desc {
  margin: 0 0 0.75rem;
  font-size: 0.78rem;
  line-height: 1.5;
  color: var(--bccr-muted);
}

.status-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.65rem;
}

.pill-lg {
  font-size: 0.78rem;
  font-weight: 650;
  padding: 0.35rem 0.65rem;
  border-radius: 0.45rem;
}

.pill-lg.tone-ok {
  background: rgba(34, 197, 94, 0.14);
  color: var(--bccr-success-text);
}

.pill-lg.tone-bad {
  background: rgba(248, 113, 113, 0.12);
  color: var(--bccr-danger);
}

.pill-lg.tone-muted {
  background: rgba(148, 163, 184, 0.12);
  color: var(--bccr-muted);
}

.btn-warn {
  padding: 0.45rem 0.85rem;
  border-radius: 0.45rem;
  border: 1px solid rgba(248, 113, 113, 0.4);
  background: rgba(248, 113, 113, 0.1);
  color: var(--bccr-danger);
  font-size: 0.82rem;
  font-weight: 650;
  cursor: pointer;
}

.btn-warn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn-ok {
  padding: 0.45rem 0.85rem;
  border-radius: 0.45rem;
  border: 1px solid rgba(74, 222, 128, 0.38);
  background: rgba(34, 197, 94, 0.12);
  color: var(--bccr-success-text);
  font-size: 0.82rem;
  font-weight: 650;
  cursor: pointer;
}

.btn-ok:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.danger-zone {
  padding-top: 0.25rem;
  border-top: 1px dashed rgba(220, 38, 38, 0.22);
  background: linear-gradient(180deg, transparent, rgba(254, 242, 242, 0.5));
  border-radius: 0 0 0.5rem 0.5rem;
  margin-top: 0.35rem;
  padding-bottom: 0.15rem;
}

.danger-h {
  color: var(--bccr-danger) !important;
}

.btn-delete {
  margin-top: 0.35rem;
  width: 100%;
  padding: 0.52rem 0.85rem;
  border-radius: 0.5rem;
  border: 1px solid var(--bccr-btn-danger-border);
  background: rgba(244, 63, 94, 0.12);
  color: var(--bccr-danger);
  font-size: 0.84rem;
  font-weight: 650;
  cursor: pointer;
}

.btn-delete:hover:not(:disabled) {
  background: rgba(244, 63, 94, 0.18);
}

.btn-delete:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 居中确认弹窗（Teleport 至 body，仍受 scoped 属性作用） */
.um-confirm-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10050;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.25rem;
  box-sizing: border-box;
  background: var(--bccr-overlay);
  backdrop-filter: blur(6px);
}

.um-confirm-dialog {
  width: 100%;
  max-width: 400px;
  border-radius: 1rem;
  border: 1px solid var(--bccr-choice-surface-border);
  background: #ffffff;
  box-shadow: var(--bccr-shadow-lg);
  padding: 1.35rem 1.4rem 1.2rem;
  animation: um-confirm-in 0.22s cubic-bezier(0.22, 1, 0.36, 1);
}

@keyframes um-confirm-in {
  from {
    opacity: 0;
    transform: scale(0.94) translateY(12px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.um-confirm--danger {
  border-color: rgba(220, 38, 38, 0.32);
  background: linear-gradient(165deg, #ffffff 0%, #fef2f2 55%, #fff1f2 100%);
}

.um-confirm--warning {
  border-color: var(--bccr-warning-border);
  background: linear-gradient(165deg, #ffffff 0%, #fffbeb 55%, #fff7ed 100%);
}

.um-confirm-title {
  margin: 0 0 0.65rem;
  font-size: 1.08rem;
  font-weight: 750;
  letter-spacing: -0.02em;
  color: var(--bccr-text);
  line-height: 1.35;
}

.um-confirm--danger .um-confirm-title {
  color: var(--bccr-danger);
}

.um-confirm--warning .um-confirm-title {
  color: var(--bccr-warning-text);
}

.um-confirm-body {
  margin: 0 0 1.25rem;
  font-size: 0.88rem;
  line-height: 1.58;
  color: var(--bccr-text-secondary);
}

.um-confirm-actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.um-confirm-btn {
  padding: 0.48rem 1.05rem;
  border-radius: 0.5rem;
  font-size: 0.86rem;
  font-weight: 650;
  cursor: pointer;
  border: none;
  transition:
    background 0.15s,
    transform 0.12s;
}

.um-confirm-btn:active:not(:disabled) {
  transform: scale(0.98);
}

.um-confirm-cancel {
  background: var(--bccr-btn-ghost-bg);
  color: var(--bccr-btn-ghost-text);
  border: 1px solid var(--bccr-btn-ghost-border);
}

.um-confirm-cancel:hover {
  background: var(--bccr-btn-ghost-hover-bg);
  border-color: var(--bccr-btn-ghost-hover-border);
  color: var(--bccr-btn-ghost-hover-text);
}

.um-confirm-ok {
  background: var(--bccr-btn-primary-bg);
  color: var(--bccr-on-accent);
  box-shadow: var(--bccr-shadow-sm);
}

.um-confirm-ok:hover {
  background: var(--bccr-btn-primary-hover);
}

.um-confirm-ok--warning {
  background: linear-gradient(135deg, #d97706, #ea580c);
  color: #ffffff;
  box-shadow: 0 4px 16px rgba(234, 88, 12, 0.22);
}

.um-confirm-ok--danger {
  background: linear-gradient(135deg, #dc2626, #b91c1c);
  color: #ffffff;
  box-shadow: 0 4px 16px rgba(220, 38, 38, 0.22);
}

</style>
