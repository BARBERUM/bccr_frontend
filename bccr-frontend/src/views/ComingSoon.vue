<script setup>
defineProps({
  title: { type: String, required: true },
  subtitle: {
    type: String,
    default: '页面开发中，接口调用时请携带 JWT；后端已按角色做权限校验。',
  },
})
</script>

<template>
  <div class="wrap">
    <header class="head">
      <h1>{{ title }}</h1>
      <p class="sub">{{ subtitle }}</p>
    </header>
    <div class="card">
      <p class="muted">此处将接入列表、表单与链上核验等能力。</p>
    </div>
  </div>
</template>

<style scoped>
.wrap {
  max-width: 960px;
}

.head h1 {
  margin: 0 0 0.35rem;
  font-size: 1.35rem;
  font-weight: 650;
}

.sub {
  margin: 0 0 1.25rem;
  color: var(--bccr-muted);
  font-size: 0.9rem;
  line-height: 1.5;
}

.card {
  padding: 1.25rem 1.35rem;
  border-radius: 0.75rem;
  border: 1px solid var(--bccr-border);
  background: var(--bccr-card);
}

.muted {
  margin: 0;
  color: var(--bccr-muted);
  font-size: 0.9rem;
}
</style>
