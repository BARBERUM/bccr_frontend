<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
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
const keyword = ref('')
const typeFilter = ref('')

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

function syncFiltersFromRoute() {
  const q = route.query
  page.value = Math.max(1, parseInt(String(q.page || '1'), 10) || 1)
  pageSize.value = Math.min(50, Math.max(1, parseInt(String(q.size || '10'), 10) || 10))
  keyword.value = typeof q.keyword === 'string' ? q.keyword : ''
  typeFilter.value = typeof q.type === 'string' ? q.type : ''
  pageInput.value = page.value
}

function pushRouteQuery() {
  const q = /** @type {Record<string, string>} */ ({})
  q.page = String(page.value)
  q.size = String(pageSize.value)
  if (keyword.value.trim()) q.keyword = keyword.value.trim()
  if (typeFilter.value) q.type = typeFilter.value
  router.replace({ query: q })
}

async function loadList() {
  loading.value = true
  errorMsg.value = ''
  try {
    const data = await workApi.fetchWorkList({
      page: page.value,
      size: pageSize.value,
      type: typeFilter.value || undefined,
      keyword: keyword.value.trim() || undefined,
    })
    const norm = workApi.normalizeListPage(data)
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
  keyword.value = ''
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
  <div class="plaza">
    <header class="toolbar">
      <div class="filters">
        <label class="field">
          <span class="lbl">关键词</span>
          <input
            v-model.trim="keyword"
            type="search"
            placeholder="标题等关键词"
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
        <button type="button" class="btn primary" :disabled="loading" @click="applySearch">
          搜索
        </button>
        <button type="button" class="btn ghost" :disabled="loading" @click="clearSearch">
          重置
        </button>
      </div>
      <p class="meta">
        共 <strong>{{ total }}</strong> 条 · 第 {{ page }} / {{ Math.max(1, totalPages) }} 页
      </p>
    </header>

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
          <img
            v-if="w.kind === 'image' && w.cover"
            :src="w.cover"
            :alt="w.title"
          />
          <div v-else-if="w.kind === 'text'" class="thumb-text-wrap">
            <span class="thumb-text-label">文本摘要</span>
            <p class="thumb-text">{{ w.textPreview || '（列表未返回正文摘要，可进入详情查看）' }}</p>
          </div>
          <img v-else-if="w.cover" :src="w.cover" :alt="w.title" />
          <div v-else class="thumb-ph">{{ formatType(w.type).charAt(0) || '作' }}</div>
        </div>
        <div class="body">
          <h3 class="title">{{ w.title }}</h3>
          <p class="sub">
            <span v-if="w.type" class="tag">{{ formatType(w.type) }}</span>
            <span class="fp" :title="w.fingerprint || ''">{{
              w.fingerprint ? `${String(w.fingerprint).slice(0, 12)}…` : '指纹 —'
            }}</span>
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
</template>

<style scoped>
.plaza {
  max-width: 1120px;
}

.toolbar {
  margin-bottom: 1.25rem;
  padding: 1rem 1.15rem;
  border-radius: 0.75rem;
  border: 1px solid var(--bccr-border);
  background: rgba(15, 23, 42, 0.45);
}

.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
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
  background: rgba(15, 23, 42, 0.65);
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
  margin: 0.85rem 0 0;
  font-size: 0.82rem;
  color: var(--bccr-muted);
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
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 1rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.card {
  display: flex;
  flex-direction: column;
  border-radius: 0.75rem;
  border: 1px solid var(--bccr-border);
  background: rgba(15, 23, 42, 0.42);
  overflow: hidden;
  cursor: pointer;
  transition:
    transform 0.15s ease,
    border-color 0.15s,
    box-shadow 0.15s;
}

.card--text {
  border-color: rgba(148, 163, 184, 0.22);
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

.thumb {
  aspect-ratio: 16 / 10;
  background: rgba(30, 41, 59, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
}

.card--text .thumb {
  aspect-ratio: auto;
  min-height: 7.75rem;
  max-height: 12rem;
}

.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.thumb--text {
  align-items: stretch;
}

.thumb-text-wrap {
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 0.55rem 0.75rem 0.65rem;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  background: linear-gradient(165deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.78));
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
}

.thumb-text-label {
  flex-shrink: 0;
  font-size: 0.7rem;
  font-weight: 600;
  color: rgba(148, 163, 184, 0.85);
}

.thumb-text {
  margin: 0;
  flex: 1;
  min-height: 0;
  font-size: 0.82rem;
  line-height: 1.55;
  color: #e2e8f0;
  text-align: left;
  display: -webkit-box;
  -webkit-line-clamp: 8;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}

.thumb-ph {
  font-size: 2rem;
  font-weight: 700;
  color: rgba(148, 163, 184, 0.45);
}

.body {
  padding: 0.85rem 1rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.title {
  margin: 0;
  font-size: 1rem;
  font-weight: 650;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.sub {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.78rem;
  color: var(--bccr-muted);
}

.tag {
  padding: 0.12rem 0.4rem;
  border-radius: 0.25rem;
  background: rgba(59, 130, 246, 0.18);
  color: #93c5fd;
}

.fp {
  font-family: ui-monospace, monospace;
  font-size: 0.72rem;
}

.author {
  margin: 0;
  font-size: 0.78rem;
  color: var(--bccr-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.time {
  font-size: 0.75rem;
  color: rgba(148, 163, 184, 0.85);
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
