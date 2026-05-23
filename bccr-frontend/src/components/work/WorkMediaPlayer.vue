<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'
import { fetchMediaBlobUrl, normalizeMediaSrc } from '@/api/client'
import BccrIcon from '@/components/icons/BccrIcon.vue'

const props = defineProps({
  /** video | audio */
  kind: { type: String, required: true },
  /** 作品文件地址（filePath / fileUrl） */
  src: { type: String, default: '' },
  title: { type: String, default: '' },
})

const playUrl = ref('')
const loading = ref(false)
const error = ref('')
const usedBlob = ref(false)
/** @type {string | null} */
let blobUrlToRevoke = null

function revokeBlob() {
  if (blobUrlToRevoke) {
    URL.revokeObjectURL(blobUrlToRevoke)
    blobUrlToRevoke = null
  }
}

function resetState() {
  revokeBlob()
  playUrl.value = ''
  error.value = ''
  usedBlob.value = false
  loading.value = false
}

async function loadWithBlob() {
  const raw = String(props.src ?? '').trim()
  if (!raw) return
  loading.value = true
  error.value = ''
  try {
    revokeBlob()
    const blob = await fetchMediaBlobUrl(raw)
    blobUrlToRevoke = blob
    usedBlob.value = true
    playUrl.value = blob
  } catch (e) {
    error.value = e?.message || '无法加载媒体'
    playUrl.value = ''
  } finally {
    loading.value = false
  }
}

function loadDirect() {
  resetState()
  const raw = String(props.src ?? '').trim()
  if (!raw) return
  const direct = normalizeMediaSrc(raw)
  if (!direct) {
    error.value = '无效的文件地址'
    return
  }
  playUrl.value = direct
}

async function onMediaError() {
  if (usedBlob.value || !props.src?.trim()) {
    if (!error.value) error.value = '无法播放媒体文件，请尝试在新标签页打开'
    return
  }
  await loadWithBlob()
}

watch(
  () => [props.src, props.kind],
  () => {
    loadDirect()
  },
  { immediate: true },
)

onBeforeUnmount(revokeBlob)
</script>

<template>
  <div class="work-media-player" :class="`work-media-player--${kind}`">
    <p v-if="loading" class="media-player-hint muted">正在加载媒体…</p>
    <p v-else-if="!src?.trim()" class="warn-banner soft">
      未返回可访问的文件地址，无法播放。
    </p>
    <p v-else-if="error && !playUrl" class="err media-player-err">{{ error }}</p>

    <div v-else-if="playUrl" class="media-player-frame">
      <video
        v-if="kind === 'video'"
        class="media-player-el media-player-video"
        controls
        playsinline
        preload="metadata"
        :src="playUrl"
        :title="title"
        @error="onMediaError"
      >
        您的浏览器不支持视频播放。
      </video>
      <div v-else class="media-player-audio-wrap">
        <div class="media-player-audio-head" aria-hidden="true">
          <span class="media-player-audio-ic">
            <BccrIcon name="audio" size="md" />
          </span>
          <span class="media-player-audio-lbl">音频作品</span>
        </div>
        <audio
          class="media-player-el media-player-audio"
          controls
          preload="metadata"
          :src="playUrl"
          :title="title"
          @error="onMediaError"
        >
          您的浏览器不支持音频播放。
        </audio>
      </div>
      <p v-if="error" class="media-player-warn">{{ error }}</p>
    </div>

    <p v-if="src?.trim()" class="media-player-foot">
      <a
        :href="normalizeMediaSrc(src)"
        target="_blank"
        rel="noopener noreferrer"
        class="link-open"
      >
        在新标签页打开原文件
      </a>
      <span v-if="usedBlob" class="media-player-note">已通过鉴权加载</span>
    </p>
  </div>
</template>

<style scoped>
.work-media-player {
  display: flex;
  flex-direction: column;
  flex: 1 1 0;
  min-height: 0;
  width: 100%;
}

.work-media-player--video .media-player-frame {
  flex: 1 1 0;
  min-height: 0;
}

.media-player-frame {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
  flex: 1 1 0;
  min-height: 0;
  border-radius: 0.45rem;
  overflow: hidden;
  background: var(--bccr-media-bg, #0f172a);
}

.media-player-el {
  display: block;
  width: 100%;
  max-height: min(72vh, 640px);
}

.media-player-video {
  object-fit: contain;
  background: #000;
  aspect-ratio: 16 / 9;
  max-height: min(72vh, 640px);
  height: auto;
}

.media-player-audio-wrap {
  padding: 1.25rem 1.1rem 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  background: linear-gradient(
    165deg,
    rgba(59, 130, 246, 0.08),
    rgba(148, 163, 184, 0.06)
  );
}

.media-player-audio-head {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.media-player-audio-ic {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 0.55rem;
  background: rgba(59, 130, 246, 0.14);
  color: var(--bccr-accent-text, var(--bccr-accent));
}

.media-player-audio-lbl {
  font-size: 0.88rem;
  font-weight: 650;
  color: var(--bccr-text-secondary, var(--bccr-text));
}

.media-player-audio {
  width: 100%;
}

.media-player-hint,
.media-player-err {
  margin: 0 0 0.5rem;
  font-size: 0.88rem;
}

.media-player-warn {
  margin: 0.35rem 0.5rem 0;
  padding: 0.35rem 0.5rem;
  font-size: 0.78rem;
  color: var(--bccr-warning-text);
}

.media-player-foot {
  margin: 0.5rem 0 0;
  font-size: 0.82rem;
  text-align: center;
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.5rem 0.75rem;
}

.link-open {
  color: var(--bccr-accent);
}

.media-player-note {
  font-size: 0.72rem;
  color: var(--bccr-muted);
}

.warn-banner.soft {
  padding: 0.75rem 0.85rem;
  border-radius: 0.5rem;
  border: 1px solid var(--bccr-warning-border);
  background: var(--bccr-warning-soft);
  color: var(--bccr-warning-text);
  font-size: 0.85rem;
}

.muted {
  color: var(--bccr-muted);
}

.err {
  color: var(--bccr-danger);
}
</style>
