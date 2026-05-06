import { computed, ref } from 'vue'

/**
 * 单文件选择与拖拽
 * @param {{ onAfterPick?: () => void, onAfterClear?: () => void }} [hooks]
 */
export function useFileDropzone(hooks = {}) {
  const file = ref(/** @type {File | null} */ (null))
  const fileInputRef = ref(/** @type {HTMLInputElement | null} */ (null))
  const isDragging = ref(false)

  const fileLabel = computed(() => {
    const f = file.value
    if (!f) return ''
    const kb = f.size / 1024
    const size =
      kb >= 1024 ? `${(kb / 1024).toFixed(2)} MB` : `${kb.toFixed(1)} KB`
    return `${f.name} · ${size}`
  })

  function triggerPickFile() {
    fileInputRef.value?.click()
  }

  function onFilePick(ev) {
    const input = /** @type {HTMLInputElement} */ (ev.target)
    const picked = input.files?.[0] ?? null
    if (picked) {
      file.value = picked
      hooks.onAfterPick?.()
    }
  }

  function onDragOver(ev) {
    ev.preventDefault()
    isDragging.value = true
  }

  function onDragLeave() {
    isDragging.value = false
  }

  function onDrop(ev) {
    ev.preventDefault()
    isDragging.value = false
    const picked = ev.dataTransfer?.files?.[0]
    if (picked) {
      file.value = picked
      hooks.onAfterPick?.()
    }
  }

  function clearFile() {
    file.value = null
    hooks.onAfterClear?.()
    if (fileInputRef.value) fileInputRef.value.value = ''
  }

  return {
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
  }
}
