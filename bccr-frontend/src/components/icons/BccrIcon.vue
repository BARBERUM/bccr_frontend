<script setup>
import { computed } from 'vue'

const props = defineProps({
  /** @type {import('vue').PropType<string>} */
  name: { type: String, required: true },
  /** sm | md | lg */
  size: { type: String, default: 'md' },
})

const sizeClass = computed(() => `bccr-ic--${props.size}`)
</script>

<template>
  <svg
    class="bccr-ic"
    :class="sizeClass"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <!-- 主导航 -->
    <g v-if="name === 'dashboard'">
      <rect x="3" y="3" width="7" height="9" rx="1.25" />
      <rect x="14" y="3" width="7" height="5" rx="1.25" />
      <rect x="14" y="12" width="7" height="9" rx="1.25" />
      <rect x="3" y="16" width="7" height="5" rx="1.25" />
    </g>
    <g v-else-if="name === 'profile'">
      <circle cx="12" cy="8" r="4" />
      <path d="M5 20v-1.2c0-3.1 2.9-5.6 7-5.6s7 2.5 7 5.6V20" />
    </g>
    <g v-else-if="name === 'plaza'">
      <rect x="3" y="3" width="18" height="18" rx="2.25" />
      <circle cx="8.5" cy="8.5" r="1.75" />
      <path d="M21 15l-5.5-5.5L9 16l-3-3-4.5 4.5" />
    </g>
    <g v-else-if="name === 'folder'">
      <path d="M4 7h5l2 3h9a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V9a2 2 0 012-2z" />
      <path d="M10 13h4M12 11v4" />
    </g>
    <g v-else-if="name === 'register'">
      <path d="M14 2H7a2 2 0 00-2 2v16a2 2 0 002 2h10a2 2 0 002-2V8z" />
      <path d="M14 2v6h6M12 11v6M9.5 14.5L12 12l2.5 2.5" />
    </g>
    <g v-else-if="name === 'check'">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M21 21l-4.2-4.2M10.5 7.5v6M7.5 10.5h6" />
    </g>
    <g v-else-if="name === 'auth'">
      <circle cx="7" cy="17" r="3" />
      <path d="M10 14L20 4M17 4h3v3" />
      <path d="M14 8l2 2" />
    </g>
    <g v-else-if="name === 'audit'">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path d="M9 12l2 2 4-4" />
    </g>
    <g v-else-if="name === 'users'">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3 20v-1.5a5 5 0 015-5h2a5 5 0 015 5V20" />
      <circle cx="18" cy="9" r="2.5" />
      <path d="M21 20v-1a4 4 0 00-2.8-3.8" />
    </g>
    <g v-else-if="name === 'chain'">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.6 13.5l6.8 3.9M15.4 6.5L8.6 10.5" />
    </g>

    <!-- 查重 / 授权 主标签 -->
    <g v-else-if="name === 'manual-check'">
      <path d="M12 3v12M8 7l4-4 4 4" />
      <path d="M5 15h14a2 2 0 012 2v2H3v-2a2 2 0 012-2z" />
    </g>
    <g v-else-if="name === 'recheck'">
      <path d="M4 12a8 8 0 0113.5-5.5M20 12a8 8 0 01-13.5 5.5" />
      <path d="M20 4v5h-5M4 20v-5h5" />
      <circle cx="12" cy="12" r="2.5" />
    </g>
    <g v-else-if="name === 'records'">
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </g>
    <g v-else-if="name === 'grant'">
      <path d="M12 3l7 4v6c0 4.5-3.5 7.5-7 8-3.5-.5-7-3.5-7-8V7l7-4z" />
      <path d="M9 12l2 2 4-4" />
    </g>
    <g v-else-if="name === 'auth-records'">
      <path d="M14 2H8a2 2 0 00-2 2v16a2 2 0 002 2h8a2 2 0 002-2V8z" />
      <path d="M14 2v6h6M10 13h4M10 17h2" />
    </g>

    <!-- 审核主标签 -->
    <g v-else-if="name === 'pending'">
      <path d="M4 4h16v14H8l-4 4V4z" />
      <path d="M8 9h8M8 13h5" />
      <circle cx="18" cy="6" r="3.5" fill="currentColor" stroke="none" opacity="0.9" />
    </g>
    <g v-else-if="name === 'history'">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7v5l3.5 2" />
      <path d="M7 3H5M19 3h-2" />
    </g>

    <!-- 子标签 -->
    <g v-else-if="name === 'send'">
      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
    </g>
    <g v-else-if="name === 'receive'">
      <path d="M4 4h16v14H9l-5 5V4z" />
      <path d="M8 10h8M8 14h5" />
    </g>
    <g v-else-if="name === 'work-id'">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10.5" r="1.5" />
      <path d="M21 15l-4-4-3 3-2-2-3 3" />
    </g>
    <g v-else-if="name === 'id-card'">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 9h4M7 13h6M15 9h2M15 13h2" />
    </g>
    <g v-else-if="name === 'mine'">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M6 20v-1a6 6 0 0112 0v1" />
      <path d="M4 4h16v4H4z" opacity="0.35" stroke-width="1.25" />
    </g>

    <!-- 作品类型 -->
    <g v-else-if="name === 'image'">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10" r="1.5" />
      <path d="M21 16l-5-5-4 4-2-2-4 4" />
    </g>
    <g v-else-if="name === 'text'">
      <path d="M14 2H8a2 2 0 00-2 2v16a2 2 0 002 2h8a2 2 0 002-2V8z" />
      <path d="M14 2v6h6M10 13h4M10 17h6" />
    </g>
    <g v-else-if="name === 'video'">
      <rect x="2" y="6" width="15" height="12" rx="2" />
      <path d="M17 10l5-3v10l-5-3z" />
    </g>
    <g v-else-if="name === 'audio'">
      <path d="M9 18V6l10-2v14" />
      <circle cx="7" cy="18" r="3" />
      <circle cx="17" cy="16" r="3" />
    </g>

    <g v-else>
      <rect x="4" y="4" width="7" height="7" rx="1.25" />
      <rect x="13" y="4" width="7" height="7" rx="1.25" />
      <rect x="4" y="13" width="7" height="7" rx="1.25" />
      <rect x="13" y="13" width="7" height="7" rx="1.25" />
    </g>
  </svg>
</template>

<style scoped>
.bccr-ic {
  display: block;
  flex-shrink: 0;
}

.bccr-ic--sm {
  width: 1rem;
  height: 1rem;
}

.bccr-ic--md {
  width: 1.25rem;
  height: 1.25rem;
}

.bccr-ic--lg {
  width: 1.4rem;
  height: 1.4rem;
}
</style>
