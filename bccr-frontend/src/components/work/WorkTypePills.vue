<script setup>
import { WORK_TYPE_OPTIONS } from '@/constants/workTypes'

defineProps({
  modelValue: { type: String, required: true },
})

defineEmits(['update:modelValue'])
</script>

<template>
  <div class="bccr-choice-surface type-pills-wrap">
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
  </div>
</template>

<style scoped>
.type-pills-wrap {
  width: 100%;
}

.type-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.type-pill {
  padding: 0.42rem 0.8rem;
  border-radius: 999px;
  border: 1px solid var(--bccr-option-border);
  background: var(--bccr-option-bg);
  color: var(--bccr-option-text);
  font-size: 0.82rem;
  cursor: pointer;
  transition:
    border-color 0.12s,
    background 0.12s,
    color 0.12s,
    box-shadow 0.12s;
}

.type-pill:hover {
  border-color: var(--bccr-option-hover-border);
  background: var(--bccr-option-hover-bg);
  color: var(--bccr-text);
}

.type-pill.on {
  border-color: var(--bccr-option-active-border);
  background: var(--bccr-option-active-bg);
  color: var(--bccr-option-active-text);
  box-shadow: 0 0 0 1px rgba(37, 99, 235, 0.08);
}
</style>
