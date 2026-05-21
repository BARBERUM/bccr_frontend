<script setup>
import { computed } from 'vue'

/**
 * @typedef {{ key?: string, label: string, count: number, color?: string }} Slice
 */

const props = defineProps({
  /** @type {import('vue').PropType<Slice[]>} */
  slices: { type: Array, default: () => [] },
  title: { type: String, default: '' },
  emptyText: { type: String, default: '暂无分布数据' },
  /** emerald | cyan */
  tone: { type: String, default: 'emerald' },
})

const DEFAULT_COLORS = {
  emerald: ['#34d399', '#22d3ee', '#a78bfa', '#fbbf24', '#fb7185', '#60a5fa', '#c084fc'],
  cyan: ['#22d3ee', '#38bdf8', '#818cf8', '#34d399', '#fbbf24', '#fb7185', '#a78bfa'],
}

const total = computed(() =>
  props.slices.reduce((sum, s) => sum + (Number.isFinite(s.count) ? s.count : 0), 0),
)

const normalized = computed(() => {
  const palette = DEFAULT_COLORS[props.tone] ?? DEFAULT_COLORS.emerald
  return props.slices.map((s, i) => ({
    ...s,
    count: Number.isFinite(s.count) ? s.count : 0,
    color: s.color ?? palette[i % palette.length],
  }))
})

const gradient = computed(() => {
  if (total.value <= 0) return 'conic-gradient(#e2e8f0 0deg 360deg)'
  let acc = 0
  const stops = normalized.value.map((s) => {
    const start = acc
    acc += (s.count / total.value) * 100
    return `${s.color} ${start}% ${acc}%`
  })
  return `conic-gradient(${stops.join(', ')})`
})

const legend = computed(() =>
  normalized.value.map((s) => ({
    ...s,
    pct: total.value > 0 ? Math.round((s.count / total.value) * 1000) / 10 : 0,
  })),
)
</script>

<template>
  <div class="pie-card" :class="`pie-card-${tone}`">
    <h4 v-if="title" class="pie-title">{{ title }}</h4>

    <div v-if="total > 0" class="pie-layout">
      <div
        class="pie-ring"
        :style="{ background: gradient }"
        role="img"
        :aria-label="`${title || '分布'}饼图，共 ${total} 项`"
      >
        <div class="pie-hole">
          <span class="pie-hole-k">合计</span>
          <strong class="pie-hole-v">{{ total }}</strong>
        </div>
      </div>

      <ul class="pie-legend">
        <li v-for="item in legend" :key="item.key ?? item.label" class="pie-legend-row">
          <span class="pie-swatch" :style="{ background: item.color }" aria-hidden="true" />
          <span class="pie-legend-label">{{ item.label }}</span>
          <span class="pie-legend-meta">
            <strong>{{ item.count }}</strong>
            <span class="pie-legend-pct">{{ item.pct }}%</span>
          </span>
        </li>
      </ul>
    </div>

    <p v-else class="pie-empty">{{ emptyText }}</p>
  </div>
</template>

<style scoped>
.pie-card {
  padding: 0.82rem 0.92rem;
  border-radius: 0.82rem;
  border: 1px solid var(--bccr-choice-surface-border);
  background: var(--bccr-choice-surface-bg);
  box-shadow: var(--bccr-shadow-sm);
}

.pie-card-emerald {
  border-color: rgba(22, 163, 74, 0.22);
  background: linear-gradient(165deg, #ffffff 0%, #f0fdf4 55%, #f8fafc 100%);
}

.pie-card-cyan {
  border-color: rgba(37, 99, 235, 0.2);
  background: linear-gradient(165deg, #ffffff 0%, #eff6ff 55%, #f8fafc 100%);
}

.pie-title {
  margin: 0 0 0.72rem;
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--bccr-text);
}

.pie-layout {
  display: flex;
  align-items: center;
  gap: 1rem;
}

@media (max-width: 520px) {
  .pie-layout {
    flex-direction: column;
    align-items: stretch;
  }
}

.pie-ring {
  flex-shrink: 0;
  width: 9.5rem;
  height: 9.5rem;
  margin: 0 auto;
  border-radius: 50%;
  display: grid;
  place-items: center;
  box-shadow:
    0 0 0 1px var(--bccr-choice-surface-border),
    var(--bccr-shadow-sm);
}

.pie-hole {
  width: 5.6rem;
  height: 5.6rem;
  border-radius: 50%;
  background: #ffffff;
  border: 1px solid var(--bccr-choice-surface-border);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.1rem;
}

.pie-hole-k {
  font-size: 0.62rem;
  font-weight: 650;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--bccr-muted);
}

.pie-hole-v {
  font-size: 1.28rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--bccr-text);
  line-height: 1;
}

.pie-legend {
  margin: 0;
  padding: 0;
  list-style: none;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.48rem;
}

.pie-legend-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 0.45rem 0.55rem;
  align-items: center;
}

.pie-swatch {
  width: 0.62rem;
  height: 0.62rem;
  border-radius: 999px;
  box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.08);
}

.pie-legend-label {
  font-size: 0.78rem;
  color: var(--bccr-text);
  min-width: 0;
}

.pie-legend-meta {
  display: flex;
  align-items: baseline;
  gap: 0.38rem;
  font-size: 0.76rem;
}

.pie-legend-meta strong {
  font-weight: 760;
  color: var(--bccr-success-text);
}

.pie-card-cyan .pie-legend-meta strong {
  color: var(--bccr-accent-text);
}

.pie-legend-pct {
  color: var(--bccr-muted);
  font-size: 0.7rem;
}

.pie-empty {
  margin: 0;
  padding: 1.2rem 0.5rem;
  text-align: center;
  font-size: 0.8rem;
  color: var(--bccr-muted);
  background: rgba(255, 255, 255, 0.65);
  border-radius: 0.55rem;
}
</style>
