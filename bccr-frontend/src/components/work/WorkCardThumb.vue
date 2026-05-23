<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'
import { fetchMediaBlobUrl, normalizeMediaSrc } from '@/api/client'
import BccrIcon from '@/components/icons/BccrIcon.vue'

const props = defineProps({
  kind: { type: String, default: 'other' },
  cover: { type: String, default: '' },
  mediaUrl: { type: String, default: '' },
  title: { type: String, default: '' },
  textPreview: { type: String, default: '' },
  typeLabel: { type: String, default: '' },
})

const hovering = ref(false)
const posterSrc = ref('')
const videoSrc = ref('')
const videoReady = ref(false)
const loadError = ref(false)
const useVideoFrame = ref(false)
/** @type {import('vue').Ref<HTMLVideoElement | null>} */
const videoRef = ref(null)
/** @type {string | null} */
let blobRevoke = null

function revokeBlob() {
  if (blobRevoke) {
    URL.revokeObjectURL(blobRevoke)
    blobRevoke = null
  }
}

function resetVideoState() {
  revokeBlob()
  posterSrc.value = ''
  videoSrc.value = ''
  videoReady.value = false
  loadError.value = false
  useVideoFrame.value = false
  hovering.value = false
}

function capturePosterFrame() {
  const el = videoRef.value
  if (!el || el.readyState < 2) return
  const vw = el.videoWidth
  const vh = el.videoHeight
  if (!vw || !vh) {
    useVideoFrame.value = true
    return
  }
  try {
    const canvas = document.createElement('canvas')
    canvas.width = vw
    canvas.height = vh
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      useVideoFrame.value = true
      return
    }
    ctx.drawImage(el, 0, 0, vw, vh)
    posterSrc.value = canvas.toDataURL('image/jpeg', 0.82)
  } catch {
    useVideoFrame.value = true
  }
}

function onVideoLoadedMeta() {
  const el = videoRef.value
  if (!el) return
  const t = Number.isFinite(el.duration) && el.duration > 0.2 ? 0.1 : 0
  el.currentTime = t
}

function onVideoSeeked() {
  if (!hovering.value) capturePosterFrame()
  videoReady.value = true
}

async function tryBlobFallback() {
  const raw = String(props.mediaUrl ?? '').trim()
  if (!raw || blobRevoke) return
  try {
    const blob = await fetchMediaBlobUrl(raw)
    revokeBlob()
    blobRevoke = blob
    videoSrc.value = blob
  } catch {
    loadError.value = true
  }
}

function onVideoError() {
  if (!blobRevoke) {
    void tryBlobFallback()
    return
  }
  loadError.value = true
}

function setupVideoSrc() {
  resetVideoState()
  const cover = String(props.cover ?? '').trim()
  if (cover) posterSrc.value = cover
  const raw = String(props.mediaUrl ?? '').trim()
  if (!raw) return
  videoSrc.value = normalizeMediaSrc(raw)
}

function onEnter() {
  if (props.kind !== 'video' || !videoSrc.value || loadError.value) return
  hovering.value = true
  const el = videoRef.value
  if (!el) return
  void el.play().catch(() => {})
}

function onLeave() {
  if (props.kind !== 'video') return
  hovering.value = false
  const el = videoRef.value
  if (!el) return
  el.pause()
  try {
    el.currentTime = Number.isFinite(el.duration) && el.duration > 0.2 ? 0.1 : 0
  } catch {
    /* ignore */
  }
}

watch(
  () => [props.kind, props.mediaUrl, props.cover],
  () => {
    if (props.kind === 'video') setupVideoSrc()
    else resetVideoState()
  },
  { immediate: true },
)

onBeforeUnmount(revokeBlob)
</script>

<template>
  <div
    class="work-card-thumb"
    :class="[
      `work-card-thumb--${kind}`,
      { 'is-hovering': hovering, 'is-video-ready': videoReady },
    ]"
    @mouseenter="onEnter"
    @mouseleave="onLeave"
  >
    <img
      v-if="kind === 'image' && cover"
      class="thumb-img"
      :src="cover"
      :alt="title"
      loading="lazy"
    />

    <div v-else-if="kind === 'text'" class="thumb-text-wrap">
      <span class="thumb-text-label">文本摘要</span>
      <p class="thumb-text">{{ textPreview || '（列表未返回正文摘要，可进入详情查看）' }}</p>
    </div>

    <template v-else-if="kind === 'video'">
      <div v-if="videoSrc && !loadError" class="thumb-video-wrap">
        <img
          v-if="(posterSrc || cover) && !hovering"
          class="thumb-img thumb-poster"
          :src="posterSrc || cover"
          :alt="title"
        />
        <video
          ref="videoRef"
          class="thumb-video"
          :class="{
            'thumb-video--live': hovering || (useVideoFrame && !posterSrc && !cover),
            'thumb-video--hidden':
              (posterSrc || cover) && !hovering && !useVideoFrame,
          }"
          :src="videoSrc"
          muted
          playsinline
          loop
          preload="metadata"
          :title="title"
          @loadedmetadata="onVideoLoadedMeta"
          @seeked="onVideoSeeked"
          @error="onVideoError"
        />
        <span v-if="!hovering" class="thumb-play-badge" aria-hidden="true">
          <BccrIcon name="video" size="sm" />
        </span>
        <span v-if="hovering" class="thumb-preview-hint">预览中</span>
      </div>
      <img v-else-if="cover" class="thumb-img" :src="cover" :alt="title" loading="lazy" />
      <div v-else class="thumb-ph-wrap">
        <span class="thumb-ph">{{ typeLabel.charAt(0) || '视' }}</span>
        <p class="thumb-ph-sub">{{ typeLabel || '视频' }}</p>
      </div>
    </template>

    <template v-else-if="kind === 'audio'">
      <div v-if="mediaUrl" class="thumb-audio-wrap">
        <span class="thumb-audio-ic" aria-hidden="true">
          <BccrIcon name="audio" size="md" />
        </span>
        <p class="thumb-audio-lbl">音频作品</p>
        <p class="thumb-audio-hint">进入详情播放</p>
      </div>
      <img v-else-if="cover" class="thumb-img" :src="cover" :alt="title" loading="lazy" />
      <div v-else class="thumb-ph-wrap">
        <span class="thumb-ph">{{ typeLabel.charAt(0) || '音' }}</span>
        <p class="thumb-ph-sub">{{ typeLabel || '音频' }}</p>
      </div>
    </template>

    <img v-else-if="cover" class="thumb-img" :src="cover" :alt="title" loading="lazy" />
    <div v-else class="thumb-ph-wrap">
      <span class="thumb-ph">{{ typeLabel.charAt(0) || '作' }}</span>
      <p class="thumb-ph-sub">{{ typeLabel || '作品' }}</p>
    </div>
  </div>
</template>

<style scoped>
.work-card-thumb {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: var(--bccr-surface-muted);
}

.thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.thumb-poster {
  position: absolute;
  inset: 0;
  z-index: 1;
}

.thumb-video-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  background: #0f172a;
}

.thumb-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  background: #000;
}

.thumb-video--hidden {
  position: absolute;
  inset: 0;
  opacity: 0;
  pointer-events: none;
}

.thumb-video--live {
  position: relative;
  z-index: 2;
  opacity: 1;
}

.thumb-play-badge {
  position: absolute;
  right: 0.45rem;
  bottom: 0.45rem;
  z-index: 3;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.72);
  color: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.work-card-thumb.is-hovering .thumb-play-badge {
  opacity: 0;
  transform: scale(0.9);
}

.thumb-preview-hint {
  position: absolute;
  left: 0.45rem;
  top: 0.45rem;
  z-index: 3;
  padding: 0.15rem 0.45rem;
  border-radius: 0.35rem;
  font-size: 0.65rem;
  font-weight: 650;
  letter-spacing: 0.04em;
  color: #fff;
  background: rgba(37, 99, 235, 0.85);
}

.work-card-thumb--text {
  align-items: stretch;
  background: linear-gradient(145deg, var(--bccr-surface), rgba(6, 78, 59, 0.35));
}

.thumb-text-wrap {
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 0.55rem 0.75rem 0.6rem;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  box-sizing: border-box;
}

.thumb-text-label {
  flex-shrink: 0;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--bccr-success-text);
}

.thumb-text {
  margin: 0;
  flex: 1;
  min-height: 0;
  font-size: 0.8rem;
  line-height: 1.5;
  color: var(--bccr-text);
  text-align: left;
  display: -webkit-box;
  -webkit-line-clamp: 5;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}

.thumb-audio-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  width: 100%;
  height: 100%;
  padding: 0.75rem;
  box-sizing: border-box;
  background: linear-gradient(160deg, rgba(59, 130, 246, 0.12), rgba(148, 163, 184, 0.08));
}

.thumb-audio-ic {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 0.65rem;
  background: rgba(59, 130, 246, 0.16);
  color: var(--bccr-accent-text, var(--bccr-accent));
}

.thumb-audio-lbl {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 650;
  color: var(--bccr-text);
}

.thumb-audio-hint {
  margin: 0;
  font-size: 0.72rem;
  color: var(--bccr-muted);
}

.thumb-ph-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  width: 100%;
  height: 100%;
  padding: 0.75rem;
  box-sizing: border-box;
}

.thumb-ph {
  font-size: 2rem;
  font-weight: 700;
  color: var(--bccr-text-hint);
}

.thumb-ph-sub {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--bccr-muted);
}
</style>
