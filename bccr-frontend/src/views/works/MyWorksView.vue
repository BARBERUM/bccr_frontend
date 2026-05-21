<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import * as workApi from '@/api/work'
import { useAuthStore } from '@/stores/auth'
import WorkInteractionPanel from '@/views/works/WorkInteractionPanel.vue'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const loading = ref(false)
const errorMsg = ref('')
const items = ref(/** @type {ReturnType<typeof workApi.formatWorkSummary>[]} */ ([]))
const total = ref(0)
const totalPages = ref(0)

const page = ref(1)
const pageSize = ref(15)

const workName = ref('')
const workId = ref('')
const authorName = ref('')
const createStart = ref('')
const createEnd = ref('')
const fileMinMb = ref('')
const fileMaxMb = ref('')
const likeMin = ref('')
const sortBy = ref('createdAt')
const sortDir = ref('desc')
const typeFilter = ref('')

const SORT_OPTIONS = [
  { value: 'createdAt', label: '登记时间' },
  { value: 'likeCount', label: '点赞数' },
  { value: 'viewCount', label: '浏览量' },
  { value: 'commentCount', label: '评论数' },
  { value: 'averageRating', label: '评分' },
]

const TYPE_OPTIONS = [
  { value: '', label: '全部类型' },
  { value: 'IMAGE', label: '图片' },
  { value: 'TEXT', label: '文本' },
  { value: 'VIDEO', label: '视频' },
  { value: 'AUDIO', label: '音频' },
]

const pageInput = ref(1)

/** @type {import('vue').Ref<ReturnType<typeof workApi.formatWorkSummary> | null>} */
const selectedWork = ref(null)
const deleteBusy = ref(false)
const deleteErr = ref('')

const hasPrev = computed(() => page.value > 1)
const manageOpen = computed(() => Boolean(selectedWork.value))
const hasNext = computed(() => totalPages.value > 0 && page.value < totalPages.value)

const myChainAddress = computed(() => {
  const u = auth.user
  if (!u || typeof u !== 'object') return ''
  const o = /** @type {Record<string, unknown>} */ (u)
  const a = o.blockchainAddress ?? o.blockChainAddress
  return typeof a === 'string' ? a.trim() : ''
})

/** @param {unknown} v */
function strFromQuery(v) {
  return typeof v === 'string' ? v : ''
}

function numStrFromQuery(v) {
  if (v == null || v === '') return ''
  const n = Number(v)
  return Number.isFinite(n) ? String(n) : ''
}

function mbToBytes(s) {
  const n = Number(String(s ?? '').trim())
  if (!Number.isFinite(n) || n <= 0) return undefined
  return Math.round(n * 1024 * 1024)
}

function intOrUndef(s) {
  const n = Number(String(s ?? '').trim())
  return Number.isFinite(n) ? Math.trunc(n) : undefined
}

function syncFiltersFromRoute() {
  const q = route.query
  page.value = Math.max(1, parseInt(String(q.page || '1'), 10) || 1)
  pageSize.value = Math.min(50, Math.max(1, parseInt(String(q.size || '12'), 10) || 12))
  workName.value = strFromQuery(q.workName) || strFromQuery(q.keyword)
  workId.value = strFromQuery(q.workId)
  authorName.value = strFromQuery(q.authorName)
  createStart.value = strFromQuery(q.createStart)
  createEnd.value = strFromQuery(q.createEnd)
  fileMinMb.value = numStrFromQuery(q.fsMin)
  fileMaxMb.value = numStrFromQuery(q.fsMax)
  likeMin.value = numStrFromQuery(q.likeMin)
  sortBy.value = strFromQuery(q.sortBy) || 'createdAt'
  sortDir.value = String(q.sortDir || '').toLowerCase() === 'asc' ? 'asc' : 'desc'
  typeFilter.value = typeof q.type === 'string' ? q.type : ''
  pageInput.value = page.value
}

function pushRouteQuery() {
  const q = /** @type {Record<string, string>} */ ({})
  q.page = String(page.value)
  q.size = String(pageSize.value)
  const set = (k, v) => {
    const s = String(v ?? '').trim()
    if (s) q[k] = s
  }
  set('workName', workName.value)
  set('workId', workId.value)
  set('authorName', authorName.value)
  set('createStart', createStart.value)
  set('createEnd', createEnd.value)
  set('fsMin', fileMinMb.value)
  set('fsMax', fileMaxMb.value)
  set('likeMin', likeMin.value)
  if (sortBy.value && sortBy.value !== 'createdAt') q.sortBy = sortBy.value
  if (sortDir.value !== 'desc') q.sortDir = sortDir.value
  if (typeFilter.value) q.type = typeFilter.value
  router.replace({ query: q })
}

function buildSearchParams() {
  return {
    pageNum: page.value,
    pageSize: pageSize.value,
    workId: workId.value.trim() || undefined,
    workName: workName.value.trim() || undefined,
    workType: typeFilter.value || undefined,
    authorName: authorName.value.trim() || undefined,
    createStart: createStart.value || undefined,
    createEnd: createEnd.value || undefined,
    fileSizeMin: mbToBytes(fileMinMb.value),
    fileSizeMax: mbToBytes(fileMaxMb.value),
    likeMin: intOrUndef(likeMin.value),
    sortBy: sortBy.value || 'createdAt',
    sortDir: sortDir.value || 'desc',
  }
}

async function loadList() {
  loading.value = true
  errorMsg.value = ''
  try {
    const addr = myChainAddress.value
    let norm
    if (addr) {
      const data = await workApi.fetchWorkSearch({
        ...buildSearchParams(),
        authorAddress: addr,
      })
      norm = workApi.normalizeListPage(data)
      items.value = norm.items.map((row) =>
        workApi.formatWorkSummary(
          /** @type {Record<string, unknown>} */ (typeof row === 'object' && row ? row : {}),
        ),
      )
    } else {
      const kw = workName.value.trim()
      const data = await workApi.fetchMyWorkList({
        page: page.value,
        size: pageSize.value,
        type: typeFilter.value || undefined,
        keyword: kw || undefined,
        workName: kw || undefined,
      })
      norm = workApi.normalizeListPage(data)
      const mapped = norm.items.map((row) =>
        workApi.formatWorkSummary(
          /** @type {Record<string, unknown>} */ (typeof row === 'object' && row ? row : {}),
        ),
      )
      items.value = typeFilter.value
        ? mapped.filter((w) =>
            workApi.matchesWorkTypeFilter(
              /** @type {Record<string, unknown>} */ (w.raw || {}),
              typeFilter.value,
            ),
          )
        : mapped
    }
    total.value = norm.total
    const computedPages =
      norm.pages ||
      (norm.total === 0 ? 0 : Math.max(1, Math.ceil(norm.total / norm.size)))
    totalPages.value = computedPages
    if (norm.total > 0 && computedPages > 0 && page.value > computedPages) {
      page.value = computedPages
      pageInput.value = page.value
    } else {
      pageInput.value = page.value
    }
  } catch (e) {
    errorMsg.value = e?.message || '加载失败'
    items.value = []
    total.value = 0
    totalPages.value = 0
  } finally {
    loading.value = false
  }
}

function formatTime(v) {
  if (v == null || v === '') return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return String(v)
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatType(t) {
  if (!t) return '—'
  const m = TYPE_OPTIONS.find((o) => o.value === t)
  return m ? m.label : t
}

/** @param {MouseEvent} [ev] */
function goDetail(id, ev) {
  ev?.stopPropagation?.()
  if (!id) return
  router.push({ name: 'work-detail', params: { workId: id } })
}

/** @param {ReturnType<typeof workApi.formatWorkSummary>} w */
function openManage(w) {
  if (!w?.id) return
  selectedWork.value = w
  deleteErr.value = ''
}

function closeManage() {
  selectedWork.value = null
  deleteErr.value = ''
}

async function deleteSelectedWork() {
  const w = selectedWork.value
  if (!w?.id) return
  if (
    !window.confirm(
      `确定永久删除作品「${w.title || w.id}」？\n删除后无法恢复，链上记录是否保留取决于后端策略。`,
    )
  ) {
    return
  }
  deleteBusy.value = true
  deleteErr.value = ''
  try {
    await workApi.deleteWork(w.id)
    closeManage()
    await loadList()
  } catch (e) {
    deleteErr.value = e?.message || '删除作品失败'
  } finally {
    deleteBusy.value = false
  }
}

function applySearch() {
  page.value = 1
  pushRouteQuery()
}

function clearSearch() {
  workName.value = ''
  workId.value = ''
  authorName.value = ''
  createStart.value = ''
  createEnd.value = ''
  fileMinMb.value = ''
  fileMaxMb.value = ''
  likeMin.value = ''
  sortBy.value = 'createdAt'
  sortDir.value = 'desc'
  typeFilter.value = ''
  page.value = 1
  pushRouteQuery()
}

function goPrev() {
  if (!hasPrev.value) return
  page.value -= 1
  pushRouteQuery()
}

function goNext() {
  if (!hasNext.value) return
  page.value += 1
  pushRouteQuery()
}

function changePageSize() {
  page.value = 1
  pushRouteQuery()
}

function jumpPage() {
  let p = parseInt(String(pageInput.value), 10)
  if (Number.isNaN(p)) p = 1
  p = Math.min(Math.max(1, p), Math.max(1, totalPages.value))
  page.value = p
  pageInput.value = p
  pushRouteQuery()
}

onMounted(() => {
  syncFiltersFromRoute()
  loadList()
})

watch(
  () => JSON.stringify(route.query),
  () => {
    syncFiltersFromRoute()
    loadList()
  },
)

watch(myChainAddress, () => {
  loadList()
})
</script>

<template>
  <div class="page-shell">
    <div class="my-works my-works-page" :class="{ 'my-works--manage': manageOpen }">
      <header class="hero">
        <div class="hero-bloom" aria-hidden="true" />
        <div class="hero-text">
          <h1 class="title hero-title">个人作品管理</h1>
          <p class="hero-lead">
            管理已登记作品：删除作品、查看点赞与评论，回复或删除评论。
          </p>
        </div>
        <router-link :to="{ name: 'works-register' }" class="btn-reg">登记新作品</router-link>
      </header>

      <p v-if="!myChainAddress" class="hint-banner">
        当前账号未返回链上地址：列表使用「我的作品」接口；完善链上地址后可使用登记时间、文件大小等高级筛选。
      </p>
      <section class="toolbar">
        <div class="filters filters-main">
          <label class="field grow">
            <span class="lbl">作品名称</span>
            <input
              v-model.trim="workName"
              type="search"
              placeholder="模糊匹配作品名"
              class="inp"
              @keydown.enter.prevent="applySearch"
            />
          </label>
          <label class="field">
            <span class="lbl">类型</span>
            <select v-model="typeFilter" class="inp select" @change="applySearch">
              <option v-for="opt in TYPE_OPTIONS" :key="opt.label + opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </label>
          <label class="field">
            <span class="lbl">排序</span>
            <select v-model="sortBy" class="inp select" @change="applySearch">
              <option v-for="opt in SORT_OPTIONS" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </label>
          <label class="field">
            <span class="lbl">方向</span>
            <select v-model="sortDir" class="inp select" @change="applySearch">
              <option value="desc">降序</option>
              <option value="asc">升序</option>
            </select>
          </label>
          <button type="button" class="btn primary" :disabled="loading" @click="applySearch">搜索</button>
          <button type="button" class="btn ghost" :disabled="loading" @click="clearSearch">重置</button>
        </div>

        <details class="adv-details">
          <summary class="adv-sum">更多条件</summary>
          <div class="filters filters-adv" :class="{ 'filters-adv--dim': !myChainAddress }">
            <label class="field">
              <span class="lbl">作品 ID</span>
              <input v-model.trim="workId" type="text" class="inp" placeholder="精确" :disabled="!myChainAddress" />
            </label>
            <label class="field">
              <span class="lbl">作者名</span>
              <input
                v-model.trim="authorName"
                type="text"
                class="inp"
                placeholder="模糊（可选）"
                :disabled="!myChainAddress"
              />
            </label>
            <label class="field">
              <span class="lbl">登记 ≥</span>
              <input v-model="createStart" type="date" class="inp" :disabled="!myChainAddress" />
            </label>
            <label class="field">
              <span class="lbl">登记 ≤</span>
              <input v-model="createEnd" type="date" class="inp" :disabled="!myChainAddress" />
            </label>
            <label class="field">
              <span class="lbl">文件 ≥ MB</span>
              <input
                v-model.trim="fileMinMb"
                type="number"
                min="0"
                step="0.01"
                class="inp num"
                :disabled="!myChainAddress"
              />
            </label>
            <label class="field">
              <span class="lbl">文件 ≤ MB</span>
              <input
                v-model.trim="fileMaxMb"
                type="number"
                min="0"
                step="0.01"
                class="inp num"
                :disabled="!myChainAddress"
              />
            </label>
            <label class="field">
              <span class="lbl">点赞 ≥</span>
              <input v-model.trim="likeMin" type="number" min="0" class="inp num" :disabled="!myChainAddress" />
            </label>
          </div>
        </details>
      <p class="meta">
        共 <strong>{{ total }}</strong> 条 · 第 {{ page }} / {{ Math.max(1, totalPages) }} 页
      </p>
    </section>

    <p v-if="errorMsg" class="err">{{ errorMsg }}</p>

    <div class="content-layout" :class="{ 'content-layout--manage': manageOpen }">
      <div class="list-pane">
        <p v-if="loading && !items.length" class="muted center">加载中…</p>

        <div v-else-if="items.length" class="work-table">
          <div class="work-table-head" aria-hidden="true">
            <span class="col-type">类型</span>
            <span class="col-main">作品</span>
            <span class="col-stats">互动</span>
            <span class="col-time">登记时间</span>
            <span class="col-actions">操作</span>
          </div>
          <ul class="work-rows">
            <li
              v-for="w in items"
              :key="w.id || w.title"
              class="work-row"
              :class="{ 'work-row--active': selectedWork?.id === w.id }"
            >
              <span class="col-type">
                <span class="type-pill" :data-kind="w.kind || 'other'">{{ formatType(w.type) }}</span>
              </span>
              <div class="col-main">
                <p class="row-title">{{ w.title || '未命名作品' }}</p>
                <p class="row-meta">
                  <span class="row-id" :title="w.id">ID {{ w.id || '—' }}</span>
                  <span v-if="w.fingerprint" class="row-fp" :title="String(w.fingerprint)">
                    {{ String(w.fingerprint).slice(0, 10) }}…
                  </span>
                </p>
              </div>
              <div class="col-stats" aria-label="点赞与评论">
                <span class="mini-stat" title="点赞">
                  <span class="mini-ic" aria-hidden="true">♥</span>
                  {{ w.likeCount ?? 0 }}
                </span>
                <span class="mini-stat" title="评论">
                  <span class="mini-ic" aria-hidden="true">💬</span>
                  {{ w.commentCount ?? 0 }}
                </span>
              </div>
              <time class="col-time" :datetime="w.createdAt ? String(w.createdAt) : undefined">
                {{ formatTime(w.createdAt) }}
              </time>
              <div class="col-actions">
                <button type="button" class="btn primary sm" @click="openManage(w)">管理</button>
                <button type="button" class="btn ghost sm" @click="goDetail(w.id, $event)">详情</button>
              </div>
            </li>
          </ul>
        </div>

        <p v-else-if="!loading && !errorMsg" class="muted center empty-box">
          暂无登记作品。
          <router-link :to="{ name: 'works-register' }" class="inline-link">去登记作品</router-link>
        </p>

        <footer v-if="total > 0" class="pager">
      <button type="button" class="btn ghost sm" :disabled="loading || !hasPrev" @click="goPrev">
        上一页
      </button>
      <span class="pager-mid">
        <label>
          每页
          <select v-model.number="pageSize" class="inp sm" @change="changePageSize">
            <option :value="10">10</option>
            <option :value="12">12</option>
            <option :value="20">20</option>
            <option :value="50">50</option>
          </select>
        </label>
        <label>
          跳转
          <input v-model.number="pageInput" type="number" min="1" class="inp sm num" @keydown.enter="jumpPage" />
          <button type="button" class="btn ghost sm" @click="jumpPage">Go</button>
        </label>
      </span>
      <button type="button" class="btn ghost sm" :disabled="loading || !hasNext" @click="goNext">
        下一页
      </button>
        </footer>
      </div>

      <aside v-if="selectedWork" class="manage-panel" aria-label="作品管理">
        <header class="manage-head">
          <div class="manage-head-text">
            <h2 class="manage-title">{{ selectedWork.title }}</h2>
            <p class="manage-meta">
              <span class="tag">{{ formatType(selectedWork.type) }}</span>
              <span>ID {{ selectedWork.id }}</span>
            </p>
          </div>
          <button type="button" class="manage-close" aria-label="关闭" @click="closeManage">×</button>
        </header>

        <div class="manage-body bccr-scroll-slim">
          <WorkInteractionPanel
            :key="selectedWork.id"
            :work-id="selectedWork.id"
            owner-mode
            :like-count="selectedWork.likeCount ?? 0"
            embed
          />
        </div>

        <footer class="manage-foot">
          <p v-if="deleteErr" class="err manage-err">{{ deleteErr }}</p>
          <div class="manage-foot-actions">
            <button type="button" class="btn ghost" @click="goDetail(selectedWork.id)">作品详情</button>
            <button type="button" class="btn danger" :disabled="deleteBusy" @click="deleteSelectedWork">
              {{ deleteBusy ? '删除中…' : '删除该作品' }}
            </button>
          </div>
        </footer>
      </aside>
    </div>
    </div>
  </div>
</template>

<style scoped>
.page-shell {
  width: 100%;
  display: flex;
  justify-content: center;
  padding: 0.35rem 0 2.75rem;
  box-sizing: border-box;
}

.my-works {
  width: 100%;
  max-width: 1160px;
  margin: 0 auto;
  padding: 0 1.1rem;
  box-sizing: border-box;
}

.my-works--manage {
  max-width: 1320px;
}

.content-layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.25rem;
  align-items: start;
}

.content-layout--manage {
  grid-template-columns: minmax(0, 1fr) minmax(300px, 380px);
}

.list-pane {
  min-width: 0;
}

.manage-panel {
  position: sticky;
  top: 1rem;
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 2rem);
  border-radius: 1rem;
  border: 1px solid var(--bccr-border);
  background: var(--bccr-card);
  box-shadow: 0 16px 40px var(--bccr-hover);
  overflow: hidden;
}

.manage-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.85rem 1rem;
  border-bottom: 1px solid var(--bccr-border);
  background: var(--bccr-surface-muted);
}

.manage-head-text {
  min-width: 0;
}

.manage-title {
  margin: 0 0 0.35rem;
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.manage-meta {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.78rem;
  color: var(--bccr-muted);
}

.manage-close {
  flex-shrink: 0;
  width: 2rem;
  height: 2rem;
  border: none;
  border-radius: 0.45rem;
  background: transparent;
  color: var(--bccr-muted);
  font-size: 1.35rem;
  line-height: 1;
  cursor: pointer;
}

.manage-close:hover {
  background: var(--bccr-hover);
  color: var(--bccr-text);
}

.manage-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0.65rem 0.75rem 0.85rem;
}

.manage-foot {
  padding: 0.75rem 1rem 1rem;
  border-top: 1px solid var(--bccr-border);
  background: var(--bccr-surface-muted);
}

.manage-err {
  margin: 0 0 0.5rem;
  padding: 0;
  text-align: left;
  font-size: 0.82rem;
}

.manage-foot-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.manage-foot-actions .btn {
  flex: 1 1 auto;
  min-width: 7rem;
}

.btn.danger {
  background: var(--bccr-danger);
  color: #fff;
  border: none;
}

.btn.danger:hover:not(:disabled) {
  filter: brightness(1.05);
}

.hero {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 1.15rem;
  margin-bottom: 1.35rem;
  padding: 1.35rem 1.25rem 1.5rem;
  border-radius: 1.05rem;
  border: 1px solid rgba(139, 92, 246, 0.16);
  background: var(--bccr-card);
  box-shadow: 0 16px 40px var(--bccr-hover);
  overflow: hidden;
}

.hero-bloom {
  position: absolute;
  width: 260px;
  height: 260px;
  left: -60px;
  top: -90px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgba(99, 102, 241, 0.2) 0%,
    rgba(167, 139, 250, 0.08) 50%,
    transparent 70%
  );
  pointer-events: none;
}

.hero-text {
  position: relative;
  min-width: 0;
  max-width: 38rem;
}

.hero-title {
  margin: 0 0 0.5rem;
  font-size: 1.55rem;
  font-weight: 800;
  letter-spacing: -0.03em;
}

.hero-lead {
  margin: 0;
  font-size: 0.88rem;
  line-height: 1.62;
  color: var(--bccr-muted);
}

.btn-reg {
  position: relative;
  flex-shrink: 0;
  padding: 0.52rem 1.15rem;
  border-radius: 0.55rem;
  font-size: 0.88rem;
  font-weight: 650;
  text-decoration: none;
  color: var(--bccr-text);
  background: linear-gradient(135deg, var(--bccr-accent), #6366f1);
  border: none;
  box-shadow: 0 8px 24px rgba(99, 102, 241, 0.28);
  cursor: pointer;
  transition:
    filter 0.12s,
    transform 0.12s;
}

.btn-reg:hover {
  filter: brightness(1.06);
  transform: translateY(-1px);
}

.toolbar {
  margin-bottom: 1.35rem;
  padding: 1.05rem 1.2rem 1.15rem;
  border-radius: 1rem;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: var(--bccr-media-bg);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.14);
}

.hint-banner {
  margin: 0 0 1rem;
  padding: 0.65rem 1rem;
  border-radius: 0.65rem;
  font-size: 0.84rem;
  line-height: 1.55;
  border: 1px solid var(--bccr-warning-border);
  background: var(--bccr-warning-soft);
  color: var(--bccr-warning-text);
}

.hint-banner--ok {
  border-color: rgba(52, 211, 153, 0.35);
  background: rgba(16, 185, 129, 0.1);
  color: var(--bccr-success-text);
}

.filters-main {
  margin-bottom: 0.35rem;
}

.field.grow {
  flex: 1 1 14rem;
  min-width: 12rem;
}

.field.grow .inp {
  min-width: 0;
  width: 100%;
}

.adv-details {
  margin-top: 0.35rem;
  border-radius: 0.65rem;
  border: 1px dashed rgba(148, 163, 184, 0.22);
  padding: 0.35rem 0.75rem 0.75rem;
  background: var(--bccr-hover);
}

.adv-sum {
  cursor: pointer;
  font-size: 0.82rem;
  color: var(--bccr-accent);
  font-weight: 600;
  list-style: none;
}

.adv-sum::-webkit-details-marker {
  display: none;
}

.filters-adv {
  margin-top: 0.65rem;
  justify-content: flex-start;
}

.filters-adv--dim {
  opacity: 0.45;
  pointer-events: none;
}

.filters-adv .inp.num {
  width: 5.25rem;
  min-width: 4.5rem;
}

.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: center;
  gap: 0.65rem 1rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.lbl {
  font-size: 0.75rem;
  color: var(--bccr-muted);
}

.inp {
  min-width: 12rem;
  padding: 0.45rem 0.6rem;
  border-radius: 0.45rem;
  border: 1px solid var(--bccr-border);
  background: var(--bccr-card);
  color: var(--bccr-text);
  font-size: 0.9rem;
}

.inp:focus {
  outline: none;
  border-color: rgba(59, 130, 246, 0.45);
}

.select {
  min-width: 8rem;
  cursor: pointer;
}

.inp.sm {
  min-width: 0;
  width: 4.5rem;
}

.inp.num {
  width: 3.5rem;
}

.meta {
  margin: 1rem 0 0;
  font-size: 0.82rem;
  color: var(--bccr-muted);
  text-align: center;
}

.meta strong {
  color: var(--bccr-text);
}

.btn {
  padding: 0.45rem 0.85rem;
  border-radius: 0.45rem;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  border: none;
}

.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn.primary {
  background: linear-gradient(135deg, var(--bccr-accent), #6366f1);
  color: #fff;
}

.btn.ghost {
  background: transparent;
  border: 1px solid var(--bccr-border);
  color: var(--bccr-muted);
}

.btn.ghost:hover:not(:disabled) {
  color: var(--bccr-text);
  border-color: rgba(148, 163, 184, 0.35);
}

.btn.sm {
  padding: 0.3rem 0.55rem;
  font-size: 0.8rem;
}

.err {
  color: var(--bccr-danger);
  font-size: 0.9rem;
  text-align: center;
  padding: 0.5rem 0 1rem;
}

.muted {
  color: var(--bccr-muted);
  font-size: 0.9rem;
}

.center {
  text-align: center;
  padding: 2rem;
}

.empty-box {
  padding: 2.5rem 1rem;
  text-align: center;
}

.inline-link {
  margin-left: 0.35rem;
  color: var(--bccr-accent);
  font-weight: 600;
}

.work-table {
  border-radius: 0.85rem;
  border: 1px solid var(--bccr-border);
  background: var(--bccr-card);
  overflow: hidden;
  box-shadow: 0 10px 28px var(--bccr-hover);
}

.work-table-head,
.work-row {
  display: grid;
  grid-template-columns: 4.5rem minmax(0, 1fr) 4.75rem 9.25rem auto;
  align-items: center;
  gap: 0.5rem 0.85rem;
  padding: 0.7rem 1rem;
}

.work-table-head {
  font-size: 0.7rem;
  font-weight: 650;
  letter-spacing: 0.05em;
  color: var(--bccr-muted);
  background: var(--bccr-surface-muted);
  border-bottom: 1px solid var(--bccr-border);
}

.work-rows {
  list-style: none;
  margin: 0;
  padding: 0;
}

.work-row {
  border-bottom: 1px solid var(--bccr-border);
  transition: background 0.12s ease;
}

.work-row:last-child {
  border-bottom: none;
}

.work-row:hover {
  background: var(--bccr-hover);
}

.work-row--active {
  background: var(--bccr-accent-soft);
  box-shadow: inset 3px 0 0 var(--bccr-accent);
}

.type-pill {
  display: inline-block;
  padding: 0.18rem 0.5rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 600;
  line-height: 1.3;
  background: var(--bccr-surface-muted);
  color: var(--bccr-muted);
  white-space: nowrap;
}

.type-pill[data-kind='image'] {
  background: rgba(99, 102, 241, 0.12);
  color: var(--bccr-accent-text);
}

.type-pill[data-kind='text'] {
  background: rgba(16, 185, 129, 0.12);
  color: var(--bccr-success-text);
}

.type-pill[data-kind='video'] {
  background: rgba(236, 72, 153, 0.1);
  color: #be185d;
}

.type-pill[data-kind='audio'] {
  background: rgba(245, 158, 11, 0.12);
  color: #b45309;
}

.col-main {
  min-width: 0;
}

.row-title {
  margin: 0;
  font-size: 0.92rem;
  font-weight: 650;
  line-height: 1.38;
  color: var(--bccr-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-meta {
  margin: 0.22rem 0 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem 0.75rem;
  font-size: 0.74rem;
  color: var(--bccr-muted);
}

.row-id,
.row-fp {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.72rem;
}

.row-fp {
  opacity: 0.85;
}

.col-stats {
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
  font-size: 0.78rem;
  color: var(--bccr-muted);
}

.mini-stat {
  display: inline-flex;
  align-items: center;
  gap: 0.28rem;
  white-space: nowrap;
}

.mini-ic {
  font-size: 0.68rem;
  opacity: 0.75;
}

.col-time {
  font-size: 0.76rem;
  color: var(--bccr-muted);
  white-space: nowrap;
}

.col-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.35rem;
}

.tag {
  padding: 0.12rem 0.4rem;
  border-radius: 0.25rem;
  background: var(--bccr-accent-soft);
  color: var(--bccr-accent-text);
}

.pager {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.75rem 1rem;
  margin-top: 1.75rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(148, 163, 184, 0.12);
}

.pager-mid {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.85rem;
  color: var(--bccr-muted);
}

.pager-mid label {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

@media (max-width: 820px) {
  .work-table-head {
    display: none;
  }

  .work-row {
    grid-template-columns: 1fr auto;
    grid-template-areas:
      'type actions'
      'main main'
      'stats time';
    gap: 0.45rem 0.65rem;
    padding: 0.85rem 1rem;
  }

  .work-row .col-type {
    grid-area: type;
  }

  .work-row .col-main {
    grid-area: main;
  }

  .work-row .col-stats {
    grid-area: stats;
    flex-direction: row;
    gap: 0.75rem;
  }

  .work-row .col-time {
    grid-area: time;
    justify-self: end;
    align-self: center;
  }

  .work-row .col-actions {
    grid-area: actions;
  }

  .row-title {
    white-space: normal;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
}

@media (max-width: 960px) {
  .content-layout--manage {
    grid-template-columns: 1fr;
  }

  .manage-panel {
    position: static;
    max-height: none;
  }
}

@media (min-width: 720px) {
  .hero {
    flex-direction: row;
    justify-content: space-between;
    text-align: left;
    align-items: center;
  }

  .hero-text {
    text-align: left;
  }
}
</style>
