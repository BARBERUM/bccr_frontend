<script setup>
import WorkCardThumb from '@/components/work/WorkCardThumb.vue'
import {
  auditTriggerLabel,
  formatOnChainBlockTime,
  pickOnChainFingerprint,
  pickWorkFingerprint,
  pickWorkTxHash,
  shortAddr,
} from '@/lib/auditDisplay'

defineProps({
  subjectDetail: { type: Object, default: null },
  matchDetail: { type: Object, default: null },
  compareContext: { type: Object, default: null },
  onChainSubject: { type: Object, default: null },
  onChainMatch: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  readonly: { type: Boolean, default: false },
})

const emit = defineEmits(['open-work'])

/** @param {unknown} d */
function previewUrl(d) {
  if (!d || typeof d !== 'object') return ''
  const o = /** @type {Record<string, unknown>} */ (d)
  if (o.kind === 'image') {
    return String(o.displayImageUrl || o.cover || '').trim()
  }
  return String(o.cover || o.displayImageUrl || o.mediaUrl || '').trim()
}

/** @param {unknown} d */
function mediaUrl(d) {
  if (!d || typeof d !== 'object') return ''
  const o = /** @type {Record<string, unknown>} */ (d)
  return String(o.mediaUrl || o.fileUrl || o.filePath || '').trim()
}

</script>

<template>
  <div class="audit-compare" :class="{ 'is-loading': loading }">
    <div v-if="loading" class="audit-compare-loading muted">正在加载比对资料…</div>

    <template v-else>
      <div class="audit-metrics">
        <div class="metric-card metric-card--sim">
          <span class="metric-k">查重相似度</span>
          <strong class="metric-v sim">{{
            compareContext?.similarityLabel ?? '—'
          }}</strong>
        </div>
        <div class="metric-card">
          <span class="metric-k">待审原因</span>
          <strong class="metric-v">{{
            auditTriggerLabel(compareContext?.trigger)
          }}</strong>
        </div>
        <div v-if="compareContext?.matchWorkId" class="metric-card span">
          <span class="metric-k">对比作品 ID</span>
          <button
            type="button"
            class="link-mono"
            @click="emit('open-work', compareContext.matchWorkId)"
          >
            {{ compareContext.matchWorkId }}
          </button>
        </div>
      </div>

      <div class="compare-grid">
        <article class="compare-card compare-card--subject">
          <header class="compare-head">
            <span class="compare-tag">待审作品</span>
            <button
              v-if="subjectDetail?.id"
              type="button"
              class="link-mini"
              @click="emit('open-work', subjectDetail.id)"
            >
              打开详情
            </button>
          </header>
          <div class="compare-preview">
            <WorkCardThumb
              v-if="subjectDetail"
              :kind="subjectDetail.kind || 'other'"
              :cover="previewUrl(subjectDetail)"
              :media-url="mediaUrl(subjectDetail)"
              :title="subjectDetail.title"
              type-label="作品"
            />
            <div v-else class="compare-ph muted">无预览</div>
          </div>
          <dl class="compare-dl">
            <div class="dl-row">
              <dt>作品 ID</dt>
              <dd class="mono">{{ subjectDetail?.id || '—' }}</dd>
            </div>
            <div class="dl-row">
              <dt>名称</dt>
              <dd>{{ subjectDetail?.title || '—' }}</dd>
            </div>
            <div class="dl-row">
              <dt>作者</dt>
              <dd>{{ subjectDetail?.authorName || shortAddr(subjectDetail?.author) || '—' }}</dd>
            </div>
            <div class="dl-row">
              <dt>指纹</dt>
              <dd class="mono wrap">{{ pickWorkFingerprint(subjectDetail?.raw ?? subjectDetail) || subjectDetail?.fingerprint || '—' }}</dd>
            </div>
            <div class="dl-row">
              <dt>上链 tx</dt>
              <dd class="mono wrap">{{ pickWorkTxHash(subjectDetail?.raw ?? subjectDetail) || '—' }}</dd>
            </div>
          </dl>
        </article>

        <div class="compare-vs" aria-hidden="true">VS</div>

        <article class="compare-card compare-card--match">
          <header class="compare-head">
            <span class="compare-tag">对比作品</span>
            <button
              v-if="matchDetail?.id"
              type="button"
              class="link-mini"
              @click="emit('open-work', matchDetail.id)"
            >
              打开详情
            </button>
          </header>
          <div class="compare-preview">
            <WorkCardThumb
              v-if="matchDetail"
              :kind="matchDetail.kind || 'other'"
              :cover="previewUrl(matchDetail)"
              :media-url="mediaUrl(matchDetail)"
              :title="matchDetail.title"
              type-label="作品"
            />
            <p v-else-if="compareContext?.matchWorkId" class="compare-ph muted">
              对比作品加载失败或不存在
            </p>
            <div v-else class="compare-ph muted">未解析到对比作品</div>
          </div>
          <dl v-if="matchDetail" class="compare-dl">
            <div class="dl-row">
              <dt>作品 ID</dt>
              <dd class="mono">{{ matchDetail.id || '—' }}</dd>
            </div>
            <div class="dl-row">
              <dt>名称</dt>
              <dd>{{ matchDetail.title || '—' }}</dd>
            </div>
            <div class="dl-row">
              <dt>作者</dt>
              <dd>{{ matchDetail.authorName || shortAddr(matchDetail.author) || '—' }}</dd>
            </div>
            <div class="dl-row">
              <dt>指纹</dt>
              <dd class="mono wrap">{{ pickWorkFingerprint(matchDetail.raw ?? matchDetail) || matchDetail.fingerprint || '—' }}</dd>
            </div>
            <div class="dl-row">
              <dt>上链 tx</dt>
              <dd class="mono wrap">{{ pickWorkTxHash(matchDetail.raw ?? matchDetail) || '—' }}</dd>
            </div>
          </dl>
        </article>
      </div>

      <section v-if="onChainSubject || onChainMatch" class="onchain-sec">
        <h3 class="onchain-title">链上凭证摘要</h3>
        <div class="onchain-grid">
          <div v-if="onChainSubject" class="onchain-box">
            <span class="onchain-lab">待审作品链上</span>
            <dl class="compare-dl compact">
              <div class="dl-row">
                <dt>指纹</dt>
                <dd class="mono wrap">{{
                  pickOnChainFingerprint(onChainSubject, subjectDetail) || '—'
                }}</dd>
              </div>
              <div class="dl-row">
                <dt>上链时间</dt>
                <dd>{{ formatOnChainBlockTime(onChainSubject, subjectDetail) }}</dd>
              </div>
            </dl>
          </div>
          <div v-if="onChainMatch" class="onchain-box">
            <span class="onchain-lab">对比作品链上</span>
            <dl class="compare-dl compact">
              <div class="dl-row">
                <dt>指纹</dt>
                <dd class="mono wrap">{{
                  pickOnChainFingerprint(onChainMatch, matchDetail) || '—'
                }}</dd>
              </div>
              <div class="dl-row">
                <dt>上链时间</dt>
                <dd>{{ formatOnChainBlockTime(onChainMatch, matchDetail) }}</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.audit-compare {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.audit-compare.is-loading {
  min-height: 12rem;
  align-items: center;
  justify-content: center;
}

.audit-compare-loading {
  font-size: 0.9rem;
}

.audit-metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.55rem;
}

.metric-card {
  padding: 0.65rem 0.75rem;
  border-radius: 0.55rem;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: var(--bccr-surface-muted);
}

.metric-card.span {
  grid-column: 1 / -1;
}

.metric-card--sim {
  border-color: rgba(236, 72, 153, 0.28);
  background: linear-gradient(135deg, rgba(236, 72, 153, 0.08), rgba(139, 92, 246, 0.06));
}

.metric-k {
  display: block;
  font-size: 0.72rem;
  color: var(--bccr-muted);
  margin-bottom: 0.2rem;
}

.metric-v {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--bccr-text);
}

.metric-v.sim {
  font-size: 1.35rem;
  color: #be185d;
}

.compare-grid {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 0.65rem;
  align-items: stretch;
}

.compare-card {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  padding: 0.65rem;
  border-radius: 0.65rem;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: var(--bccr-card);
  min-width: 0;
}

.compare-card--subject {
  border-color: rgba(59, 130, 246, 0.28);
}

.compare-card--match {
  border-color: rgba(236, 72, 153, 0.22);
}

.compare-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.compare-tag {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--bccr-accent-text);
}

.compare-preview {
  aspect-ratio: 4 / 3;
  border-radius: 0.45rem;
  overflow: hidden;
  background: var(--bccr-surface-muted);
}

.compare-ph {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.82rem;
  padding: 0.5rem;
  text-align: center;
}

.compare-vs {
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 0.85rem;
  color: var(--bccr-muted);
}

.compare-dl {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.compare-dl.compact {
  gap: 0.25rem;
}

.dl-row {
  display: grid;
  grid-template-columns: 4.25rem 1fr;
  gap: 0.35rem;
  font-size: 0.78rem;
}

.dl-row dt {
  color: var(--bccr-muted);
  font-weight: 600;
}

.dl-row dd {
  margin: 0;
  color: var(--bccr-text);
  word-break: break-word;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.74rem;
}

.wrap {
  word-break: break-all;
}

.link-mini,
.link-mono {
  border: none;
  background: none;
  padding: 0;
  color: var(--bccr-accent);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
}

.onchain-sec {
  padding: 0.75rem 0.85rem;
  border-radius: 0.55rem;
  border: 1px dashed rgba(148, 163, 184, 0.25);
  background: rgba(148, 163, 184, 0.06);
}

.onchain-title {
  margin: 0 0 0.55rem;
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--bccr-text-secondary);
}

.onchain-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.65rem;
}

.onchain-box {
  padding: 0.5rem 0.55rem;
  border-radius: 0.45rem;
  background: var(--bccr-panel-bg);
}

.onchain-lab {
  display: block;
  font-size: 0.7rem;
  font-weight: 650;
  color: var(--bccr-muted);
  margin-bottom: 0.35rem;
}

.muted {
  color: var(--bccr-muted);
}

@media (max-width: 820px) {
  .compare-grid {
    grid-template-columns: 1fr;
  }

  .compare-vs {
    padding: 0.25rem 0;
  }

  .onchain-grid {
    grid-template-columns: 1fr;
  }
}
</style>
