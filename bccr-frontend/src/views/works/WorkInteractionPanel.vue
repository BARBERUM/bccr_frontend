<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import * as interactionApi from '@/api/interaction'
import * as userApi from '@/api/user'
import { useAuthStore } from '@/stores/auth'

const props = defineProps({
  /** 与路由、作品详情一致的作品 ID */
  workId: { type: String, required: true },
  /** 嵌入侧栏时弱化外框，贴近 Instagram 式右栏 */
  embed: { type: Boolean, default: false },
  /** 作品作者管理模式：可删任意评论，点赞区改为只读统计 */
  ownerMode: { type: Boolean, default: false },
  /** 作者管理页展示的点赞数（接口无点赞列表时使用） */
  likeCount: { type: Number, default: null },
})

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const liked = ref(false)
const likeLoading = ref(false)
const likeErr = ref('')

const commentPage = ref(1)
const commentPageSize = ref(10)
/** @type {import('vue').Ref<ReturnType<typeof interactionApi.normalizeComment>[]>} */
const comments = ref([])
const commentTotal = ref(0)
const commentPages = ref(0)
const commentLoading = ref(false)
const commentErr = ref('')

const draft = ref('')
const submitBusy = ref(false)
const submitErr = ref('')

/** 回复哪条评论（parentId = 该条 id；replyToUserId 可选；fromComment 用于展示 @用户名） */
const replyTarget = ref(
  /** @type {{ parentId: string; replyToUserId: number | null; fromComment: ReturnType<typeof interactionApi.normalizeComment> } | null} */ (
    null
  ),
)

/** 当前展开查看回复的顶级评论 id */
const expandedRootId = ref('')
/** @type {import('vue').Ref<ReturnType<typeof interactionApi.normalizeComment>[]>} */
const expandedReplies = ref([])
const replyPage = ref(1)
const replyPages = ref(0)
const replyLoading = ref(false)
const replyErr = ref('')

/** userId（字符串）→ 接口返回的 username；空字符串表示已请求但无用户名 */
const usernameByUserId = reactive(/** @type {Record<string, string>} */ ({}))

const isLoggedIn = computed(() => auth.isLoggedIn)

/** @param {unknown} u */
function pickUserId(u) {
  if (!u || typeof u !== 'object') return null
  const o = /** @type {Record<string, unknown>} */ (u)
  const v = o.id ?? o.userId ?? o.uid
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const myUserId = computed(() => pickUserId(auth.user))

function goLogin() {
  router.push({ name: 'login', query: { redirect: route.fullPath } })
}

/** @param {ReturnType<typeof interactionApi.normalizeComment>} c */
function userIdKey(c) {
  if (!Number.isFinite(c.userId)) return ''
  return String(Math.trunc(c.userId))
}

/** @param {ReturnType<typeof interactionApi.normalizeComment>} c */
function commentAuthorLabel(c) {
  const key = userIdKey(c)
  if (!key) return c.nickname || '用户'
  const u = usernameByUserId[key]
  if (u) return u
  return c.nickname || '用户'
}

/**
 * 根据评论里的 userId 调用用户接口（GET /api/user/userId），批量补全登录名。
 * @param {ReturnType<typeof interactionApi.normalizeComment>[]} list
 */
async function hydrateCommentUsernames(list) {
  const keys = [
    ...new Set(
      list
        .map((c) => userIdKey(c))
        .filter((k) => k && !(k in usernameByUserId)),
    ),
  ]
  if (!keys.length) return
  await Promise.all(
    keys.map(async (uid) => {
      try {
        const data = await userApi.fetchUserById(uid)
        if (data && typeof data === 'object') {
          const o = /** @type {Record<string, unknown>} */ (data)
          const un = String(o.username ?? '').trim()
          usernameByUserId[uid] = un
        } else {
          usernameByUserId[uid] = ''
        }
      } catch {
        usernameByUserId[uid] = ''
      }
    }),
  )
}

async function refreshLike() {
  likeErr.value = ''
  if (!props.workId || !isLoggedIn.value) {
    liked.value = false
    return
  }
  try {
    const data = await interactionApi.fetchLikeStatus(props.workId)
    liked.value = interactionApi.normalizeLikeMap(data)
  } catch {
    liked.value = false
  }
}

async function onToggleLike() {
  if (!props.workId) return
  if (!isLoggedIn.value) {
    goLogin()
    return
  }
  likeLoading.value = true
  likeErr.value = ''
  try {
    const data = await interactionApi.postToggleLike(props.workId)
    liked.value = interactionApi.normalizeLikeMap(data)
  } catch (e) {
    likeErr.value = e?.message || '操作失败'
  } finally {
    likeLoading.value = false
  }
}

async function loadComments() {
  if (!props.workId) return
  commentLoading.value = true
  commentErr.value = ''
  try {
    const raw = await interactionApi.fetchCommentPage(
      props.workId,
      commentPage.value,
      commentPageSize.value,
    )
    const norm = interactionApi.normalizeInteractionPage(raw)
    const rows = norm.records.map((r) =>
      interactionApi.normalizeComment(
        /** @type {Record<string, unknown>} */ (r),
      ),
    )
    commentTotal.value = norm.total
    commentPages.value = norm.pages
    // 先并行拉齐本页作者 username，再写入列表，避免先昵称后闪成用户名
    await hydrateCommentUsernames(rows)
    comments.value = rows
  } catch (e) {
    commentErr.value = e?.message || '加载评论失败'
    comments.value = []
    commentTotal.value = 0
    commentPages.value = 0
  } finally {
    commentLoading.value = false
  }
}

async function loadRepliesPage(page = 1) {
  const rootId = expandedRootId.value
  if (!props.workId || !rootId) return
  replyLoading.value = true
  replyErr.value = ''
  replyPage.value = page
  try {
    const raw = await interactionApi.fetchReplyPage(props.workId, rootId, page, 8)
    const norm = interactionApi.normalizeInteractionPage(raw)
    const rows = norm.records.map((r) =>
      interactionApi.normalizeComment(
        /** @type {Record<string, unknown>} */ (r),
      ),
    )
    replyPages.value = norm.pages
    await hydrateCommentUsernames(rows)
    expandedReplies.value = rows
  } catch (e) {
    replyErr.value = e?.message || '加载回复失败'
    expandedReplies.value = []
    replyPages.value = 0
  } finally {
    replyLoading.value = false
  }
}

async function toggleExpand(c) {
  const id = c.id
  if (!id) return
  if (expandedRootId.value === id) {
    expandedRootId.value = ''
    expandedReplies.value = []
    replyErr.value = ''
    return
  }
  expandedRootId.value = id
  await loadRepliesPage(1)
}

function formatTime(v) {
  if (v == null || v === '') return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return String(v)
  return d.toLocaleString('zh-CN')
}

/** @param {unknown} v */
function toTimeIso(v) {
  const d = new Date(/** @type {string | number | Date} */ (v))
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString()
}

/** 评论行内：日期 + 时分，悬停可看完整本地化时间 */
function formatCommentTime(v) {
  if (v == null || v === '') return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return String(v)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${day} ${h}:${min}`
}

function startReply(c) {
  if (!isLoggedIn.value) {
    goLogin()
    return
  }
  replyTarget.value = {
    parentId: c.id,
    replyToUserId: Number.isFinite(c.userId) ? c.userId : null,
    fromComment: c,
  }
}

function cancelReply() {
  replyTarget.value = null
}

async function submitComment() {
  const text = draft.value.trim()
  if (!props.workId || !text) {
    submitErr.value = '请输入评论内容'
    return
  }
  if (!isLoggedIn.value) {
    goLogin()
    return
  }
  submitBusy.value = true
  submitErr.value = ''
  try {
    const rt = replyTarget.value
    let parentId = 0
    let replyToUserId = undefined
    if (rt) {
      const pid = Number(rt.parentId)
      if (!Number.isFinite(pid) || pid <= 0) {
        submitErr.value = '回复目标无效'
        submitBusy.value = false
        return
      }
      parentId = pid
      if (rt.replyToUserId != null && Number.isFinite(rt.replyToUserId)) {
        replyToUserId = rt.replyToUserId
      }
    }
    await interactionApi.postComment(props.workId, {
      content: text,
      parentId,
      replyToUserId,
    })
    draft.value = ''
    replyTarget.value = null
    commentPage.value = 1
    await loadComments()
    if (expandedRootId.value) {
      await loadRepliesPage(replyPage.value)
    }
  } catch (e) {
    submitErr.value = e?.message || '发送失败'
  } finally {
    submitBusy.value = false
  }
}

async function removeComment(c) {
  if (!c?.id || !isLoggedIn.value) return
  const msg = props.ownerMode
    ? '确定以作者身份删除这条评论？删除后不可恢复。'
    : '确定删除这条评论？'
  if (!window.confirm(msg)) return
  submitErr.value = ''
  try {
    await interactionApi.deleteComment(c.id)
    if (expandedRootId.value === c.id) {
      expandedRootId.value = ''
      expandedReplies.value = []
    }
    await loadComments()
    if (expandedRootId.value) await loadRepliesPage(replyPage.value)
  } catch (e) {
    submitErr.value = e?.message || '删除失败'
  }
}

function canDelete(c) {
  if (props.ownerMode) return Boolean(c?.id)
  const mine = myUserId.value
  if (mine == null || !Number.isFinite(c.userId)) return false
  return c.userId === mine
}

const displayLikeCount = computed(() => {
  const n = Number(props.likeCount)
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null
})

function goPrevPage() {
  if (commentPage.value <= 1) return
  commentPage.value -= 1
  loadComments()
}

function goNextPage() {
  if (commentPage.value >= commentPages.value) return
  commentPage.value += 1
  loadComments()
}

function goPrevReply() {
  if (replyPage.value <= 1) return
  loadRepliesPage(replyPage.value - 1)
}

function goNextReply() {
  if (replyPage.value >= replyPages.value) return
  loadRepliesPage(replyPage.value + 1)
}

watch(
  () => props.workId,
  (id) => {
    commentPage.value = 1
    expandedRootId.value = ''
    expandedReplies.value = []
    replyTarget.value = null
    draft.value = ''
    for (const k of Object.keys(usernameByUserId)) delete usernameByUserId[k]
    if (id) {
      refreshLike()
      loadComments()
    } else {
      comments.value = []
      liked.value = false
    }
  },
  { immediate: true },
)

watch(isLoggedIn, () => {
  refreshLike()
})
</script>

<template>
  <section class="ix panel" :class="{ 'ix--embed': embed, 'ix--owner': ownerMode }">
    <h2 class="h2">{{ ownerMode ? '评论管理' : '互动' }}</h2>

    <div v-if="ownerMode" class="owner-metrics" aria-label="互动数据">
      <span class="metric-pill">
        <span class="metric-ic" aria-hidden="true">♥</span>
        {{ displayLikeCount != null ? displayLikeCount : '—' }} 次点赞
      </span>
      <span class="metric-pill">
        <span class="metric-ic" aria-hidden="true">💬</span>
        {{ commentTotal }} 条评论
      </span>
    </div>
    <p v-if="ownerMode" class="owner-hint">作为作品作者，可查看、回复或删除任意评论。</p>

    <div v-else class="like-row">
      <button
        type="button"
        class="like-btn"
        :class="{ 'like-btn--on': liked }"
        :disabled="likeLoading || !workId"
        @click="onToggleLike"
      >
        <span class="like-ico" aria-hidden="true">{{ liked ? '♥' : '♡' }}</span>
        {{ likeLoading ? '…' : liked ? '已点赞' : '点赞' }}
      </button>
      <span v-if="!isLoggedIn" class="like-hint">
        <button type="button" class="linkish" @click="goLogin">登录</button>
        后可点赞、评论
      </span>
      <p v-if="likeErr" class="ix-err">{{ likeErr }}</p>
    </div>

    <div v-if="!ownerMode || isLoggedIn" class="comment-compose">
      <p v-if="replyTarget" class="reply-bar">
        正在回复 <strong>@{{ commentAuthorLabel(replyTarget.fromComment) }}</strong>
        <button type="button" class="linkish" @click="cancelReply">取消</button>
      </p>
      <textarea
        v-model="draft"
        class="ix-textarea"
        rows="3"
        maxlength="500"
        :placeholder="ownerMode ? '以作者身份回复访客（500 字内）' : '写下你的看法（500 字内）'"
        :disabled="submitBusy"
      />
      <div class="compose-actions">
        <span class="char-hint">{{ draft.length }}/500</span>
        <button
          type="button"
          class="ix-primary"
          :disabled="submitBusy || !draft.trim()"
          @click="submitComment"
        >
          {{ submitBusy ? '发送中…' : replyTarget ? '发表回复' : '发表评论' }}
        </button>
      </div>
      <p v-if="submitErr" class="ix-err">{{ submitErr }}</p>
    </div>

    <p v-if="commentLoading && !comments.length" class="muted">评论加载中…</p>
    <p v-else-if="commentErr" class="ix-err">{{ commentErr }}</p>
    <ul v-else class="comment-list">
      <li v-for="c in comments" :key="c.id || c.content" class="comment-li">
        <div class="comment-head">
          <span class="nick">{{ commentAuthorLabel(c) }}</span>
          <time
            class="time"
            :datetime="toTimeIso(c.createdAt)"
            :title="formatTime(c.createdAt)"
          >
            {{ formatCommentTime(c.createdAt) }}
          </time>
        </div>
        <p class="comment-body">{{ c.content }}</p>
        <div class="comment-actions">
          <button type="button" class="linkish" @click="startReply(c)">回复</button>
          <button v-if="canDelete(c)" type="button" class="linkish danger" @click="removeComment(c)">
            删除
          </button>
          <button
            v-if="c.replyCount > 0 || expandedRootId === c.id"
            type="button"
            class="linkish"
            @click="toggleExpand(c)"
          >
            {{
              expandedRootId === c.id
                ? '收起回复'
                : `查看回复${c.replyCount ? ` (${c.replyCount})` : ''}`
            }}
          </button>
        </div>

        <div v-if="expandedRootId === c.id" class="reply-block">
          <p v-if="replyLoading" class="muted sm">回复加载中…</p>
          <p v-else-if="replyErr" class="ix-err sm">{{ replyErr }}</p>
          <ul v-else-if="expandedReplies.length" class="reply-list">
            <li v-for="r in expandedReplies" :key="r.id || r.content" class="reply-li">
              <div class="comment-head">
                <span class="nick">{{ commentAuthorLabel(r) }}</span>
                <time
                  class="time"
                  :datetime="toTimeIso(r.createdAt)"
                  :title="formatTime(r.createdAt)"
                >
                  {{ formatCommentTime(r.createdAt) }}
                </time>
              </div>
              <p class="comment-body">{{ r.content }}</p>
              <div class="comment-actions">
                <button type="button" class="linkish" @click="startReply(r)">回复</button>
                <button
                  v-if="canDelete(r)"
                  type="button"
                  class="linkish danger"
                  @click="removeComment(r)"
                >
                  删除
                </button>
              </div>
            </li>
          </ul>
          <p v-else class="muted sm">暂无回复</p>
          <div v-if="replyPages > 1" class="pager-mini">
            <button
              type="button"
              class="linkish"
              :disabled="replyPage <= 1 || replyLoading"
              @click="goPrevReply"
            >
              上一页
            </button>
            <span class="muted sm">{{ replyPage }} / {{ Math.max(1, replyPages) }}</span>
            <button
              type="button"
              class="linkish"
              :disabled="replyPage >= replyPages || replyLoading"
              @click="goNextReply"
            >
              下一页
            </button>
          </div>
        </div>
      </li>
    </ul>

    <p v-if="!commentLoading && !comments.length && !commentErr" class="muted">暂无评论，来抢沙发吧</p>

    <div v-if="commentPages > 1" class="pager-comments">
      <button
        type="button"
        class="ix-ghost"
        :disabled="commentPage <= 1 || commentLoading"
        @click="goPrevPage"
      >
        上一页
      </button>
      <span class="muted sm"
        >第 {{ commentPage }} / {{ Math.max(1, commentPages) }} 页 · 共 {{ commentTotal }} 条</span
      >
      <button
        type="button"
        class="ix-ghost"
        :disabled="commentPage >= commentPages || commentLoading"
        @click="goNextPage"
      >
        下一页
      </button>
    </div>
  </section>
</template>

<style scoped>
.panel {
  padding: 1.15rem 1.25rem;
  border-radius: 0.85rem;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: var(--bccr-card);
  margin: 0 auto 1rem;
  max-width: 880px;
  box-shadow: 0 10px 28px var(--bccr-hover);
}

.ix--embed.panel {
  margin: 0;
  max-width: none;
  border-radius: 0;
  border: none;
  box-shadow: none;
  background: transparent;
  padding: 0.35rem 0 0;
}

.ix--embed .pager-comments {
  margin-bottom: 0;
  padding-bottom: 0;
}

.ix--owner .h2 {
  margin-bottom: 0.65rem;
}

.owner-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin-bottom: 0.55rem;
}

.metric-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.65rem;
  border-radius: 999px;
  border: 1px solid var(--bccr-choice-surface-border);
  background: var(--bccr-choice-surface-bg);
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--bccr-text-secondary);
}

.metric-ic {
  font-size: 0.9rem;
  line-height: 1;
}

.owner-hint {
  margin: 0 0 0.85rem;
  font-size: 0.8rem;
  line-height: 1.5;
  color: var(--bccr-muted);
}

.h2 {
  margin: 0 0 1rem;
  font-size: 1rem;
  font-weight: 650;
}

.like-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.65rem 1rem;
  margin-bottom: 1.1rem;
}

.like-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 1rem;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: var(--bccr-surface-muted);
  color: var(--bccr-text);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.like-btn:hover:not(:disabled) {
  border-color: rgba(244, 114, 182, 0.45);
  background: rgba(244, 114, 182, 0.08);
}

.like-btn--on {
  border-color: rgba(244, 114, 182, 0.55);
  background: rgba(244, 114, 182, 0.14);
  color: #db2777;
}

.like-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.like-ico {
  font-size: 1.1rem;
  line-height: 1;
}

.like-hint {
  font-size: 0.82rem;
  color: var(--bccr-muted);
}

.comment-compose {
  margin-bottom: 1.15rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
}

.reply-bar {
  margin: 0 0 0.5rem;
  font-size: 0.86rem;
  color: var(--bccr-muted);
}

.ix-textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 0.55rem 0.65rem;
  border-radius: 0.55rem;
  border: 1px solid var(--bccr-border);
  background: var(--bccr-card);
  color: var(--bccr-text);
  font-size: 0.9rem;
  line-height: 1.5;
  resize: vertical;
  min-height: 4.5rem;
}

.ix-textarea:focus {
  outline: none;
  border-color: rgba(99, 102, 241, 0.45);
}

.compose-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 0.45rem;
  gap: 0.75rem;
}

.char-hint {
  font-size: 0.78rem;
  color: var(--bccr-muted);
}

.ix-primary {
  padding: 0.4rem 1rem;
  border-radius: 0.5rem;
  border: none;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  background: linear-gradient(135deg, var(--bccr-accent), #6366f1);
  color: #fff;
}

.ix-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ix-ghost {
  padding: 0.35rem 0.75rem;
  border-radius: 0.45rem;
  border: 1px solid var(--bccr-border);
  background: transparent;
  color: var(--bccr-muted);
  font-size: 0.82rem;
  cursor: pointer;
}

.ix-ghost:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.linkish {
  border: none;
  background: none;
  padding: 0;
  font: inherit;
  color: var(--bccr-accent);
  cursor: pointer;
  text-decoration: none;
}

.linkish:hover {
  text-decoration: underline;
}

.linkish.danger {
  color: var(--bccr-danger);
}

.ix-err {
  margin: 0.35rem 0 0;
  font-size: 0.84rem;
  color: var(--bccr-danger);
}

.muted {
  color: var(--bccr-muted);
}

.muted.sm {
  font-size: 0.8rem;
}

.comment-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.comment-li {
  padding: 0.85rem 0;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
}

.comment-li:last-child {
  border-bottom: none;
}

.comment-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.5rem 0.75rem;
  margin-bottom: 0.35rem;
}

.nick {
  font-weight: 650;
  color: var(--bccr-text);
}

.time {
  font-size: 0.76rem;
  color: var(--bccr-muted);
  font-variant-numeric: tabular-nums;
  padding: 0.1rem 0.45rem;
  border-radius: 0.35rem;
  background: var(--bccr-hover);
  border: 1px solid rgba(148, 163, 184, 0.14);
}

.comment-body {
  margin: 0 0 0.45rem;
  font-size: 0.9rem;
  line-height: 1.55;
  color: var(--bccr-muted);
  white-space: pre-wrap;
  word-break: break-word;
}

.comment-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  font-size: 0.82rem;
}

.reply-block {
  margin-top: 0.65rem;
  padding: 0.65rem 0.75rem;
  border-radius: 0.55rem;
  background: var(--bccr-hover);
  border: 1px solid rgba(148, 163, 184, 0.1);
}

.reply-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.reply-li {
  padding: 0.55rem 0;
  border-bottom: 1px solid rgba(148, 163, 184, 0.08);
}

.reply-li:last-child {
  border-bottom: none;
}

.pager-mini {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  margin-top: 0.5rem;
  flex-wrap: wrap;
}

.pager-comments {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.85rem;
  flex-wrap: wrap;
  margin-top: 0.85rem;
  padding-top: 0.75rem;
  border-top: 1px solid rgba(148, 163, 184, 0.1);
}
</style>
