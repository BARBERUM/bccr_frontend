<script setup>
defineProps({
  label: { type: String, required: true },
})
</script>

<template>
  <svg
    class="nav-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <g v-if="label === '概览'">
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </g>

    <g v-else-if="label === '个人信息'">
      <circle cx="12" cy="8" r="4" />
      <path d="M6 20v-1.2c0-2.8 2.24-5.08 5-5.08h2c2.76 0 5 2.28 5 5.08V20" />
    </g>

    <g v-else-if="label === '作品广场'">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-6-6-5 5-3-3-4 4" />
    </g>

    <g v-else-if="label === '我的作品'">
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h6l2 3h8a2 2 0 012 2z" />
      <path d="M12 11v6M9 14h6" />
    </g>

    <g v-else-if="label === '登记作品'">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M12 11v7" />
      <path d="M9 15l3-3 3 3" />
    </g>

    <g v-else-if="label === '查重'">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35" />
    </g>

    <g v-else-if="label === '授权'">
      <circle cx="7" cy="17" r="3" />
      <path d="M10 14l11-11" />
      <path d="M18 6l3 3" />
      <path d="M14 10l2 2" />
    </g>

    <g v-else-if="label === '审核'">
      <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M9 14l2 2 4-4" />
    </g>

    <g v-else-if="label === '用户管理'">
      <circle cx="9" cy="7" r="3.5" />
      <path d="M3 21v-2a5 5 0 015-5h2a5 5 0 015 5v2" />
      <circle cx="18" cy="8" r="2.5" />
      <path d="M21 21v-1.2a4 4 0 00-2.6-3.74" />
    </g>

    <g v-else-if="label === '区块链'">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.59 13.51l6.83 3.98M15.41 6.51L8.59 10.49" />
    </g>

    <g v-else>
      <rect x="4" y="4" width="7" height="7" rx="1" />
      <rect x="13" y="4" width="7" height="7" rx="1" />
      <rect x="4" y="13" width="7" height="7" rx="1" />
      <rect x="13" y="13" width="7" height="7" rx="1" />
    </g>
  </svg>
</template>

<style scoped>
.nav-icon {
  width: 1.35rem;
  height: 1.35rem;
}
</style>
