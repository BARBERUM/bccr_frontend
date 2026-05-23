<script setup>
import { computed } from 'vue'
import { navIconFromLabel } from '@/config/nav'
import BccrIcon from './BccrIcon.vue'

const props = defineProps({
  label: { type: String, default: '' },
  name: { type: String, default: '' },
})

const iconName = computed(() =>
  props.name?.trim() ? props.name.trim() : navIconFromLabel(props.label),
)
</script>

<template>
  <BccrIcon :name="iconName" size="lg" />
</template>
