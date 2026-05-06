<script setup>
import { WORK_TYPE_OPTIONS } from '@/constants/workTypes'

defineProps({
  modelValue: { type: String, required: true },
})

defineEmits(['update:modelValue'])
</script>

<template>
  <div class="type-pills">
    <button
      v-for="o in WORK_TYPE_OPTIONS"
      :key="o.value"
      type="button"
      class="type-pill"
      :class="{ on: modelValue === o.value }"
      @click="$emit('update:modelValue', o.value)"
    >
      {{ o.label }}
    </button>
  </div>
</template>

<style scoped>
.type-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.type-pill {
  padding: 0.42rem 0.8rem;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(30, 41, 59, 0.45);
  color: var(--bccr-muted, #94a3b8);
  font-size: 0.82rem;
  cursor: pointer;
  transition:
    border-color 0.12s,
    background 0.12s,
    color 0.12s;
}

.type-pill:hover {
  border-color: rgba(56, 189, 248, 0.35);
  color: #e2e8f0;
}

.type-pill.on {
  border-color: rgba(34, 211, 238, 0.5);
  background: rgba(6, 182, 212, 0.12);
  color: #a5f3fc;
}
</style>
