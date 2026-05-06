<script setup>
import { computed, ref } from 'vue'
import { normalizeMediaSrc } from '@/api/client'
import * as adminUsersApi from '@/api/adminUsers'
import {
  formatUserEnabled,
  isSameUser,
  pickAdminUserKey,
  pickNickname,
  pickUsername,
  userRowRoleCodes,
} from '@/lib/adminUserDisplay'
import { formatRoleLabels } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

/** 可分配的系统角色（与后端约定小写码一致） */
const MANAGEABLE_ROLES = [
  { code: 'admin', label: '超级管理员' },
  { code: 'auditor', label: '审核员' },
  { code: 'user', label: '普通用户' },
  { code: 'agent', label: '版权代理' },
]

const keywordInput = ref('')
const keywordActive = ref('')
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

/** `userKey:action` 例如 `12:status`、`jack:grant:auditor` */
const pending = ref('')

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

async function loadList() {
  listLoading.value = true
  listError.value = ''
  try {
    const data = await adminUsersApi.fetchAdminUserList({
      page: page.value,
      size: size.value,
      keyword: keywordActive.value,
    })
    const norm = adminUsersApi.normalizeAdminUserPage(data)
    records.value = norm.records
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
    listError.value = e?.message || '加载用户列表失败（请确认管理员已登录且 GET /api/user/list 可用）'
    records.value = []
    total.value = 0
    pages.value = 0
  } finally {
    listLoading.value = false
  }
}

function applySearch() {
  keywordActive.value = keywordInput.value.trim()
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
    selected.value = { ...row, roles }
  } catch {
    selected.value = { ...row }
  } finally {
    detailLoading.value = false
  }
}

/** @param {Record<string, unknown>} row */
async function toggleEnabled(row) {
  const key = pickAdminUserKey(row)
  if (!key) return
  const st = formatUserEnabled(row)
  const next = !st.enabled
  if (isSelf(row) && !next) {
    if (!window.confirm('即将停用当前登录账号，确定继续？')) return
  } else if (!next) {
    if (!window.confirm(`确定停用用户「${pickUsername(row) || key}」？`)) return
  } else if (!window.confirm(`确定重新启用用户「${pickUsername(row) || key}」？`)) return
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
async function revokeRole(row, role) {
  const key = pickAdminUserKey(row)
  if (!key) return
  const rl = role.toLowerCase()
  if (isSelf(row) && rl === 'admin') {
    listError.value = '不能收回自己的超级管理员角色'
    return
  }
  if (!window.confirm(`确定收回角色「${roleLabel(rl)}」？`)) return
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
function roleSummary(row) {
  const labels = formatRoleLabels(row)
  return labels.length ? labels.join(' · ') : '未加载或未分配角色'
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
  if (!window.confirm(`确定永久删除用户「${name}」？该操作不可撤销（DELETE /api/user/{userId}）。`)) return
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

loadList()
</script>

<template>
  <div class="um-shell">
    <div class="um-page">
      <header class="hero">
        <div class="hero-bloom" aria-hidden="true" />
        <h1 class="title">用户管理</h1>
        <p class="lead">
          对接
          <code class="mono">UserController</code>
          ：分页列表
          <code class="mono">GET /api/user/list</code>
          ，启用/禁用、角色查询与变更、删除用户等（均需管理员角色）。
        </p>
      </header>

      <p v-if="listError" class="banner-err">{{ listError }}</p>

      <div class="um-layout">
        <section class="panel list-panel">
          <div class="toolbar">
            <div class="search-row">
              <input
                v-model.trim="keywordInput"
                type="search"
                class="inp-search"
                placeholder="用户名 / 昵称关键字"
                autocomplete="off"
                @keydown.enter.prevent="applySearch"
              />
              <button type="button" class="btn-accent" :disabled="listLoading" @click="applySearch">
                {{ listLoading ? '查询中…' : '搜索' }}
              </button>
              <button type="button" class="btn-ghost" :disabled="listLoading" @click="loadList">
                刷新
              </button>
            </div>
            <p class="toolbar-meta">{{ pageTotalLabel }}</p>
          </div>

          <div v-if="listLoading && !records.length" class="empty">
            <span class="spin" aria-hidden="true">⟳</span>
            加载用户列表…
          </div>
          <div v-else-if="!records.length" class="empty muted">
            暂无用户数据；可调整关键字或检查后端分页返回字段是否为 records / list。
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
              <div class="uc-body">
                <div class="uc-top">
                  <span class="uc-name">{{ pickUsername(row) || '—' }}</span>
                  <span
                    class="uc-status"
                    :class="`tone-${formatUserEnabled(row).tone}`"
                  >
                    {{ formatUserEnabled(row).label }}
                  </span>
                </div>
                <p class="uc-nick">{{ pickNickname(row) || '未设置昵称' }}</p>
                <p class="uc-roles">{{ roleSummary(row) }}</p>
              </div>
              <span class="uc-chev" aria-hidden="true">›</span>
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
              <p class="ph-sub">在左侧列表中点选一名用户，即可启停账号并发放或收回角色。</p>
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

            <section class="detail-section">
              <h3 class="ds-h">角色权限</h3>
              <p class="ds-desc">
              角色列表来自
              <code class="mono">GET /api/user/{userId}/roles</code>
              ；发放走
              <code class="mono">PUT …/role</code>
              （Body:
              <code class="mono">RoleRequest</code>
              ）。收回走
              <code class="mono">DELETE …/role/{role}</code>
              （若接口未实现请点击收回时会报错，需在后端补充该方法）。
            </p>
              <ul class="role-grid">
                <li v-for="r in MANAGEABLE_ROLES" :key="r.code" class="role-cell">
                  <div class="role-cell-head">
                    <span class="role-name">{{ r.label }}</span>
                    <code class="role-code mono">{{ r.code }}</code>
                  </div>
                  <template v-if="rowHasRole(selected, r.code)">
                    <span class="badge-on">已授予</span>
                    <button
                      type="button"
                      class="btn-revoke"
                      :disabled="isPending(pickAdminUserKey(selected), `revoke:${r.code}`)"
                      @click.stop="revokeRole(selected, r.code)"
                    >
                      {{
                        isPending(pickAdminUserKey(selected), `revoke:${r.code}`)
                          ? '…'
                          : '收回'
                      }}
                    </button>
                  </template>
                  <template v-else>
                    <span class="badge-off">未授予</span>
                    <button
                      type="button"
                      class="btn-grant"
                      :disabled="isPending(pickAdminUserKey(selected), `grant:${r.code}`)"
                      @click.stop="grantRole(selected, r.code)"
                    >
                      {{
                        isPending(pickAdminUserKey(selected), `grant:${r.code}`)
                          ? '…'
                          : '发放'
                      }}
                    </button>
                  </template>
                </li>
              </ul>
            </section>

            <section class="detail-section danger-zone">
              <h3 class="ds-h danger-h">危险操作</h3>
              <p class="ds-desc">删除用户将调用后端 DELETE，请谨慎操作。</p>
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

            <details class="api-details">
              <summary>与当前 UserController 对齐的接口</summary>
              <ul class="api-list mono">
                <li>GET /api/user/list?keyword=&amp;page=&amp;size=</li>
                <li>PUT /api/user/{userId}/enable</li>
                <li>PUT /api/user/{userId}/disable</li>
                <li>PUT /api/user/{userId}/role — body: { "role": "auditor" }</li>
                <li>GET /api/user/{userId}/roles</li>
                <li>DELETE /api/user/{userId}</li>
                <li class="api-li-warn">DELETE /api/user/{userId}/role/{role} — 建议新增，用于收回角色</li>
              </ul>
            </details>
          </template>
        </aside>
      </div>
    </div>
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
  max-width: 1120px;
}

.hero {
  position: relative;
  margin-bottom: 1.25rem;
}

.hero-bloom {
  position: absolute;
  width: 280px;
  height: 280px;
  right: -40px;
  top: -90px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgba(167, 139, 250, 0.28) 0%,
    rgba(99, 102, 241, 0.1) 45%,
    transparent 70%
  );
  pointer-events: none;
  z-index: 0;
}

.title {
  position: relative;
  z-index: 1;
  margin: 0 0 0.45rem;
  font-size: 1.58rem;
  font-weight: 780;
  letter-spacing: -0.03em;
  background: linear-gradient(118deg, #ede9fe 0%, #a78bfa 36%, #818cf8 68%, #cbd5e1 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.lead {
  position: relative;
  z-index: 1;
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.62;
  color: var(--bccr-muted);
  max-width: 40rem;
}

.lead .mono {
  font-size: 0.82em;
  color: rgba(196, 181, 253, 0.92);
}

.banner-err {
  margin: 0 0 1rem;
  padding: 0.65rem 0.85rem;
  border-radius: 0.55rem;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(248, 113, 113, 0.28);
  color: #fecaca;
  font-size: 0.88rem;
}

.um-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(300px, 380px);
  gap: 1.15rem;
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
  background: rgba(15, 23, 42, 0.48);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.2);
}

.list-panel {
  padding: 1.15rem 1.2rem;
  border-color: rgba(139, 92, 246, 0.14);
}

.detail-panel {
  padding: 1.25rem 1.3rem;
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

.search-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  align-items: center;
}

.inp-search {
  flex: 1;
  min-width: 160px;
  padding: 0.58rem 0.78rem;
  border-radius: 0.55rem;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(15, 23, 42, 0.72);
  color: var(--bccr-text);
  font-size: 0.9rem;
  outline: none;
}

.inp-search:focus {
  border-color: rgba(167, 139, 250, 0.45);
  box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.15);
}

.btn-accent {
  padding: 0.55rem 1rem;
  border-radius: 0.55rem;
  border: none;
  font-weight: 650;
  font-size: 0.88rem;
  color: #f5f3ff;
  cursor: pointer;
  background: linear-gradient(135deg, #7c3aed, #6366f1);
  box-shadow: 0 8px 24px rgba(99, 102, 241, 0.28);
}

.btn-accent:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn-ghost {
  padding: 0.52rem 0.85rem;
  border-radius: 0.55rem;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(30, 41, 59, 0.35);
  color: var(--bccr-muted);
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}

.btn-ghost:hover:not(:disabled) {
  color: #e2e8f0;
  border-color: rgba(167, 139, 250, 0.35);
}

.toolbar-meta {
  margin: 0.55rem 0 0;
  font-size: 0.78rem;
  color: var(--bccr-muted);
}

.empty {
  text-align: center;
  padding: 2rem 1rem;
  font-size: 0.9rem;
  color: #e2e8f0;
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
  gap: 0.85rem;
  padding: 0.75rem 0.85rem;
  border-radius: 0.75rem;
  border: 1px solid rgba(148, 163, 184, 0.12);
  background: rgba(0, 0, 0, 0.15);
  cursor: pointer;
  transition:
    border-color 0.15s,
    background 0.15s,
    box-shadow 0.15s;
}

.user-card:hover {
  border-color: rgba(167, 139, 250, 0.35);
  background: rgba(76, 29, 149, 0.08);
}

.user-card.active {
  border-color: rgba(167, 139, 250, 0.55);
  box-shadow: 0 0 0 1px rgba(139, 92, 246, 0.12);
  background: linear-gradient(125deg, rgba(76, 29, 149, 0.14), rgba(15, 23, 42, 0.35));
}

.uc-av {
  flex-shrink: 0;
  width: 2.85rem;
  height: 2.85rem;
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid rgba(167, 139, 250, 0.35);
  background: rgba(30, 41, 59, 0.9);
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
  font-size: 1rem;
  font-weight: 750;
  color: #ddd6fe;
}

.uc-body {
  flex: 1;
  min-width: 0;
}

.uc-top {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  flex-wrap: wrap;
}

.uc-name {
  font-weight: 700;
  font-size: 0.92rem;
  color: #f8fafc;
}

.uc-status {
  font-size: 0.68rem;
  font-weight: 650;
  padding: 0.15rem 0.45rem;
  border-radius: 999px;
}

.uc-status.tone-ok {
  background: rgba(34, 197, 94, 0.15);
  color: #bbf7d0;
}

.uc-status.tone-bad {
  background: rgba(248, 113, 113, 0.14);
  color: #fecaca;
}

.uc-status.tone-muted {
  background: rgba(148, 163, 184, 0.12);
  color: #cbd5e1;
}

.uc-nick {
  margin: 0.2rem 0 0.1rem;
  font-size: 0.8rem;
  color: var(--bccr-muted);
}

.uc-roles {
  margin: 0;
  font-size: 0.72rem;
  color: rgba(196, 181, 253, 0.88);
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.uc-chev {
  flex-shrink: 0;
  font-size: 1.35rem;
  color: rgba(148, 163, 184, 0.45);
  font-weight: 300;
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

.btn-page {
  padding: 0.42rem 0.85rem;
  border-radius: 0.45rem;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(30, 41, 59, 0.4);
  color: #e2e8f0;
  font-size: 0.82rem;
  cursor: pointer;
}

.btn-page:disabled {
  opacity: 0.35;
  cursor: not-allowed;
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
  color: #cbd5e1;
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
  background: rgba(30, 41, 59, 0.95);
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
  color: #ddd6fe;
}

.dh-title {
  margin: 0 0 0.25rem;
  font-size: 1.12rem;
  font-weight: 720;
  color: #f8fafc;
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
  color: #a7f3d0;
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
  color: #bbf7d0;
}

.pill-lg.tone-bad {
  background: rgba(248, 113, 113, 0.12);
  color: #fecaca;
}

.pill-lg.tone-muted {
  background: rgba(148, 163, 184, 0.12);
  color: #cbd5e1;
}

.btn-warn {
  padding: 0.45rem 0.85rem;
  border-radius: 0.45rem;
  border: 1px solid rgba(248, 113, 113, 0.4);
  background: rgba(248, 113, 113, 0.1);
  color: #fecaca;
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
  color: #bbf7d0;
  font-size: 0.82rem;
  font-weight: 650;
  cursor: pointer;
}

.btn-ok:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.role-grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.role-cell {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 0.45rem 0.55rem;
  align-items: center;
  padding: 0.65rem 0.72rem;
  border-radius: 0.6rem;
  border: 1px solid rgba(148, 163, 184, 0.12);
  background: rgba(0, 0, 0, 0.14);
}

.role-cell-head {
  grid-column: 1 / -1;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
}

.role-name {
  font-size: 0.88rem;
  font-weight: 650;
  color: #f1f5f9;
}

.role-code {
  font-size: 0.68rem;
  color: rgba(167, 139, 250, 0.85);
}

.badge-on {
  font-size: 0.72rem;
  color: #a7f3d0;
}

.badge-off {
  font-size: 0.72rem;
  color: var(--bccr-muted);
}

.btn-grant {
  padding: 0.32rem 0.65rem;
  border-radius: 0.4rem;
  border: 1px solid rgba(129, 140, 248, 0.45);
  background: rgba(99, 102, 241, 0.18);
  color: #c7d2fe;
  font-size: 0.76rem;
  font-weight: 650;
  cursor: pointer;
}

.btn-grant:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn-revoke {
  padding: 0.32rem 0.65rem;
  border-radius: 0.4rem;
  border: 1px solid rgba(251, 113, 133, 0.35);
  background: rgba(244, 63, 94, 0.1);
  color: #fecdd3;
  font-size: 0.76rem;
  font-weight: 650;
  cursor: pointer;
}

.btn-revoke:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.api-details {
  margin-top: 0.5rem;
  font-size: 0.74rem;
  color: var(--bccr-muted);
}

.api-details summary {
  cursor: pointer;
  color: rgba(148, 163, 184, 0.95);
}

.api-list {
  margin: 0.5rem 0 0;
  padding-left: 1.1rem;
  line-height: 1.65;
  font-size: 0.7rem;
}

.mono {
  font-family: ui-monospace, monospace;
}

.danger-zone {
  padding-top: 0.25rem;
  border-top: 1px dashed rgba(248, 113, 113, 0.25);
}

.danger-h {
  color: rgba(252, 165, 165, 0.95) !important;
}

.btn-delete {
  margin-top: 0.35rem;
  width: 100%;
  padding: 0.52rem 0.85rem;
  border-radius: 0.5rem;
  border: 1px solid rgba(248, 113, 113, 0.45);
  background: rgba(244, 63, 94, 0.12);
  color: #fecaca;
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

.api-li-warn {
  color: rgba(251, 191, 36, 0.92);
}
</style>
