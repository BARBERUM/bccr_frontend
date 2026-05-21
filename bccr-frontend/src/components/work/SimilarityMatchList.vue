<script setup>
import {
  formatResultLevel,
  formatSimilarity,
  levelToneClass,
} from '@/lib/plagiarismDisplay'

defineProps({
  /** CheckResult 行：similarity, resultLevel, matchWorkName, matchWorkId, matchAuthorAddress? */
  items: {
    type: Array,
    default: () => [],
  },
})

defineEmits(['open-work'])
</script>

<template>
  <ul class="list">
    <li
      v-for="(row, idx) in items"
      :key="String(row.checkId ?? idx)"
      class="item"
      :class="levelToneClass(row.resultLevel)"
    >
      <div class="head">
        <span class="sim">{{ formatSimilarity(row.similarity) }}</span>
        <span class="pill">{{ formatResultLevel(row.resultLevel) }}</span>
      </div>
      <p class="name">
        {{ row.matchWorkName ? String(row.matchWorkName) : '未命名作品' }}
      </p>
      <p class="meta mono">相似作品 · {{ row.matchWorkId ?? '—' }}</p>
      <p v-if="row.matchAuthorAddress" class="meta mono">
        作者 · {{ String(row.matchAuthorAddress) }}
      </p>
      <button
        v-if="row.matchWorkId"
        type="button"
        class="link"
        @click="$emit('open-work', row.matchWorkId)"
      >
        查看相似作品 →
      </button>
    </li>
  </ul>
</template>

<style scoped>
.list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.item {
  padding: 0.9rem 1rem;
  border-radius: 0.7rem;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: var(--bccr-hover);
  border-left: 4px solid rgba(148, 163, 184, 0.35);
}

.item.tone-high {
  border-left-color: var(--bccr-danger);
  background: linear-gradient(90deg, rgba(248, 113, 113, 0.06), transparent);
}

.item.tone-mid {
  border-left-color: #fbbf24;
}

.item.tone-low {
  border-left-color: #34d399;
}

.head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.35rem;
}

.sim {
  font-size: 1rem;
  font-weight: 800;
  color: var(--bccr-warning-text);
}

.pill {
  font-size: 0.72rem;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.15);
  border: 1px solid rgba(96, 165, 250, 0.25);
  color: var(--bccr-pill-text);
}

.name {
  margin: 0 0 0.2rem;
  font-weight: 650;
  font-size: 0.9rem;
}

.meta {
  margin: 0 0 0.35rem;
  font-size: 0.76rem;
  color: var(--bccr-muted, #94a3b8);
}

.mono {
  font-family: ui-monospace, monospace;
}

.link {
  margin-top: 0.2rem;
  padding: 0;
  border: none;
  background: none;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--bccr-accent, #3b82f6);
  cursor: pointer;
}

.link:hover {
  text-decoration: underline;
}
</style>
