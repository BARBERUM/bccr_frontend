<script setup>
import { watch } from 'vue'
import { useFileDropzone } from '@/composables/useFileDropzone'

const props = defineProps({
  modelValue: {
    type: /** @type {import('vue').PropType<File | null>} */ (Object),
    default: null,
  },
  emptyTitle: { type: String, default: '点击或拖拽上传' },
  emptySubtitle: { type: String, default: '' },
  hasTitle: { type: String, default: '已选择文件' },
})

const emit = defineEmits(['update:modelValue'])

const {
  file,
  fileInputRef,
  isDragging,
  fileLabel,
  triggerPickFile,
  onFilePick,
  onDragOver,
  onDragLeave,
  onDrop,
  clearFile,
} = useFileDropzone()

watch(
  () => props.modelValue,
  (v) => {
    if (v !== file.value) {
      file.value = v
      if (!v && fileInputRef.value) fileInputRef.value.value = ''
    }
  },
  { immediate: true },
)

watch(file, (v) => {
  emit('update:modelValue', v)
})
</script>

<template>
  <div class="fdz">
    <input ref="fileInputRef" type="file" class="sr-only" @change="onFilePick" />
    <button
      type="button"
      class="upload-zone"
      :class="{ drag: isDragging, has: !!file }"
      @click="triggerPickFile"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
    >
      <span class="upload-ic" aria-hidden="true">
        <svg viewBox="0 0 48 48" width="36" height="36" fill="none">
          <path
            d="M14 32V20a10 10 0 1 1 20 0v12m-6-8l-4-4-4 4m4-4v16"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </span>
      <span class="upload-title">{{ file ? hasTitle : emptyTitle }}</span>
      <span v-if="emptySubtitle || file" class="upload-sub">{{
        file ? fileLabel : emptySubtitle
      }}</span>
    </button>
    <div v-if="file" class="upload-actions">
      <button type="button" class="btn-text" @click.stop="triggerPickFile">重新选择</button>
      <button type="button" class="btn-text danger" @click.stop="clearFile">移除</button>
    </div>
  </div>
</template>

<style scoped>
.fdz {
  width: 100%;
}

.upload-zone {
  width: 100%;
  padding: 1.35rem 1rem;
  border-radius: 0.85rem;
  border: 2px dashed var(--bccr-upload-border);
  background: var(--bccr-upload-bg);
  color: inherit;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
  transition:
    border-color 0.18s,
    box-shadow 0.18s,
    background 0.18s;
}

.upload-zone:hover {
  border-color: var(--bccr-upload-hover-border);
  background: var(--bccr-upload-hover-bg);
  box-shadow: var(--bccr-shadow-sm);
}

.upload-zone.drag {
  border-color: var(--bccr-option-active-border);
  background: var(--bccr-upload-drag-bg);
}

.upload-zone.has {
  border-style: solid;
  border-color: var(--bccr-upload-has-border);
  background: var(--bccr-upload-has-bg);
}

.upload-ic {
  color: var(--bccr-accent);
  opacity: 0.85;
}

.upload-title {
  font-size: 0.95rem;
  font-weight: 650;
  color: var(--bccr-text);
}

.upload-sub {
  font-size: 0.78rem;
  color: var(--bccr-muted);
  text-align: center;
  max-width: 22rem;
  line-height: 1.45;
}

.upload-actions {
  display: flex;
  justify-content: center;
  gap: 1rem;
  margin-top: 0.55rem;
}

.btn-text {
  border: none;
  background: none;
  padding: 0;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--bccr-accent);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.btn-text.danger {
  color: var(--bccr-danger);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}
</style>
