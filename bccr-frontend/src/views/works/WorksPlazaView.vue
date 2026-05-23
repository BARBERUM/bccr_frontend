<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import WorkCardThumb from '@/components/work/WorkCardThumb.vue'
import * as workApi from '@/api/work'

const router = useRouter()
const route = useRoute()

const loading = ref(false)
const errorMsg = ref('')
const items = ref(/** @type {ReturnType<typeof workApi.formatWorkSummary>[]} */ ([]))
const total = ref(0)
const totalPages = ref(0)

const page = ref(1)
const pageSize = ref(10)

/** 兼容旧路由 ?keyword= */
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

const hasPrev = computed(() => page.value > 1)
const hasNext = computed(() => totalPages.value > 0 && page.value < totalPages.value)

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
  pageSize.value = Math.min(50, Math.max(1, parseInt(String(q.size || '10'), 10) || 10))
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
    const data = await workApi.fetchWorkSearch(buildSearchParams())
    const norm = workApi.normalizeListPage(data)
    items.value = norm.items.map((row) =>
      workApi.formatWorkSummary(
        /** @type {Record<string, unknown>} */ (typeof row === 'object' && row ? row : {}),
      ),
    )
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

function goDetail(id) {
  if (!id) return
  router.push({ name: 'work-detail', params: { workId: id } })
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
</script>

<template>
  <div class="page-shell">
    <div class="plaza">

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
          <div class="filters filters-adv">
            <label class="field">
              <span class="lbl">作品 ID</span>
              <input v-model.trim="workId" type="text" class="inp" placeholder="精确" />
            </label>
            <label class="field">
              <span class="lbl">作者名</span>
              <input v-model.trim="authorName" type="text" class="inp" placeholder="模糊" />
            </label>
            <label class="field">
              <span class="lbl">登记 ≥</span>
              <input v-model="createStart" type="date" class="inp" />
            </label>
            <label class="field">
              <span class="lbl">登记 ≤</span>
              <input v-model="createEnd" type="date" class="inp" />
            </label>
            <label class="field">
              <span class="lbl">文件 ≥ MB</span>
              <input v-model.trim="fileMinMb" type="number" min="0" step="0.01" class="inp num" />
            </label>
            <label class="field">
              <span class="lbl">文件 ≤ MB</span>
              <input v-model.trim="fileMaxMb" type="number" min="0" step="0.01" class="inp num" />
            </label>
            <label class="field">
              <span class="lbl">点赞 ≥</span>
              <input v-model.trim="likeMin" type="number" min="0" class="inp num" />
            </label>
          </div>
        </details>
        <p class="meta">
          共 <strong>{{ total }}</strong> 条 · 第 {{ page }} / {{ Math.max(1, totalPages) }} 页
        </p>
      </section>

      <p v-if="errorMsg" class="err">{{ errorMsg }}</p>

    <div v-if="loading && !items.length" class="muted center">加载中…</div>

    <ul v-else class="grid">
      <li
        v-for="w in items"
        :key="w.id || w.title"
        class="card"
        :class="{ 'card--text': w.kind === 'text' }"
        role="button"
        tabindex="0"
        @click="goDetail(w.id)"
        @keydown.enter.prevent="goDetail(w.id)"
      >
        <div class="thumb" :class="{ 'thumb--text': w.kind === 'text' }">
          <WorkCardThumb
            :kind="w.kind"
            :cover="w.cover"
            :media-url="w.mediaUrl"
            :title="w.title"
            :text-preview="w.textPreview"
            :type-label="formatType(w.type)"
          />
        </div>
        <div class="body">
          <h3 class="title">{{ w.title }}</h3>
          <p class="sub">
            <span v-if="w.type" class="tag">{{ formatType(w.type) }}</span>
            <span class="fp" :title="w.fingerprint || ''">{{
              w.fingerprint ? `${String(w.fingerprint).slice(0, 12)}…` : '指纹 —'
            }}</span>
          </p>
          <p class="card-stats" aria-label="点赞与评论">
            <span class="stat">赞 {{ w.likeCount ?? '—' }}</span>
            <span class="stat">评 {{ w.commentCount ?? '—' }}</span>
          </p>
          <p class="author">作者地址 · {{ w.author || '—' }}</p>
          <time class="time">{{ formatTime(w.createdAt) }}</time>
        </div>
      </li>
    </ul>

    <p v-if="!loading && !items.length && !errorMsg" class="muted center">暂无作品</p>

    <footer v-if="total > 0" class="pager">
      <button type="button" class="btn ghost sm" :disabled="loading || !hasPrev" @click="goPrev">
        上一页
      </button>
      <span class="pager-mid">
        <label>
          每页
          <select v-model.number="pageSize" class="inp sm" @change="changePageSize">
            <option :value="10">10</option>
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

.plaza {
  width: 100%;
  max-width: 1160px;
  margin: 0 auto;
  padding: 0 1.1rem;
  box-sizing: border-box;
}

.hero {
  position: relative;
  text-align: center;
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
  right: -50px;
  top: -100px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgba(167, 139, 250, 0.22) 0%,
    rgba(99, 102, 241, 0.08) 50%,
    transparent 72%
  );
  pointer-events: none;
}

.hero-title {
  position: relative;
  margin: 0 0 0.5rem;
  font-size: 1.55rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  background: linear-gradient(118deg, #ede9fe 0%, #a78bfa 40%, #818cf8 72%, #cbd5e1 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.hero-lead {
  position: relative;
  margin: 0 auto;
  max-width: 36rem;
  font-size: 0.88rem;
  line-height: 1.62;
  color: var(--bccr-muted);
}

.toolbar {
  margin-bottom: 1.35rem;
  padding: 1.05rem 1.2rem 1.15rem;
  border-radius: 1rem;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: var(--bccr-media-bg);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.14);
}

.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: center;
  gap: 0.65rem 1rem;
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

.inp.mono {
  font-family: ui-monospace, 'Cascadia Code', monospace;
  font-size: 0.78rem;
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

.filters-adv .inp.num {
  width: 5.25rem;
  min-width: 4.5rem;
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

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(232px, 1fr));
  gap: 1.05rem;
  justify-content: center;
  align-items: start;
  margin: 0 auto;
  padding: 0;
  list-style: none;
  max-width: 1120px;
}

.card {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 300px;
  justify-self: center;
  min-height: 0;
  border-radius: 0.85rem;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: var(--bccr-card);
  overflow: hidden;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    border-color 0.18s,
    box-shadow 0.18s;
}

.card--text {
  border-color: rgba(52, 211, 153, 0.22);
  box-shadow: inset 0 1px 0 rgba(52, 211, 153, 0.06);
}

.card:hover {
  transform: translateY(-2px);
  border-color: rgba(59, 130, 246, 0.35);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.25);
}

.card:focus-visible {
  outline: 2px solid var(--bccr-accent);
  outline-offset: 2px;
}

/* 与图片作品同一宽高比，避免文本卡在网格里被邻列图像「拉高」 */
.thumb {
  position: relative;
  flex-shrink: 0;
  aspect-ratio: 16 / 10;
  background: var(--bccr-surface-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.thumb--text {
  align-items: stretch;
}

.body {
  padding: 0.72rem 0.78rem 0.85rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 0.4rem;
}

.title {
  margin: 0;
  font-size: 0.94rem;
  font-weight: 650;
  line-height: 1.38;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  width: 100%;
}

.sub {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  font-size: 0.78rem;
  color: var(--bccr-muted);
}

.tag {
  padding: 0.12rem 0.4rem;
  border-radius: 0.25rem;
  background: var(--bccr-accent-soft);
  color: var(--bccr-accent-text);
}

.fp {
  font-family: ui-monospace, monospace;
  font-size: 0.72rem;
}

.card-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem 1rem;
  margin: 0.35rem 0 0.25rem;
  font-size: 0.78rem;
  color: var(--bccr-muted);
}

.stat {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
}

.author {
  margin: 0;
  font-size: 0.78rem;
  color: var(--bccr-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.time {
  font-size: 0.75rem;
  color: var(--bccr-muted);
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
</style>
