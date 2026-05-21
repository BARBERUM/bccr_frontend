<script setup>
defineProps({
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  /** 注册等较宽表单 */
  wide: { type: Boolean, default: false },
  /** 压缩顶部品牌区高度（注册页等） */
  compact: { type: Boolean, default: false },
})
</script>

<template>
  <div class="shell" :class="{ 'shell--compact': compact }">
    <div class="brand">
      <div class="logo">BCCR</div>
      <h1 class="sys-name">AIGC 作品指纹版权保护系统</h1>
      <p class="sys-desc">联盟链存证 · 指纹查重 · 授权溯源</p>
    </div>

    <div class="panel" :class="{ 'panel--wide': wide }">
      <header class="panel-head">
        <h2>{{ title }}</h2>
        <p v-if="subtitle" class="sub">{{ subtitle }}</p>
      </header>
      <slot />
    </div>

    <footer class="foot">请妥善保管账号密码，勿在公共设备上保存登录状态。</footer>
  </div>
</template>

<style scoped>
.shell {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem 1rem 3rem;
  gap: 1.75rem;
}

.brand {
  text-align: center;
  max-width: 28rem;
}

.logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 3.25rem;
  height: 3.25rem;
  border-radius: 0.9rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  font-size: 0.95rem;
  color: #fff;
  background: linear-gradient(135deg, var(--bccr-accent), #8b5cf6);
  box-shadow: 0 12px 40px rgba(59, 130, 246, 0.35);
  margin-bottom: 1rem;
}

.sys-name {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 700;
  line-height: 1.35;
}

.sys-desc {
  margin: 0.5rem 0 0;
  color: var(--bccr-muted);
  font-size: 0.9rem;
}

.panel {
  width: 100%;
  max-width: 420px;
  padding: 1.75rem 1.75rem 1.5rem;
  border-radius: 1rem;
  background: var(--bccr-card);
  border: 1px solid var(--bccr-border);
  backdrop-filter: blur(12px);
  box-shadow: var(--bccr-shadow-lg);
}

.panel--wide {
  max-width: 640px;
}

.shell--compact {
  padding-top: 1rem;
  padding-bottom: 1.25rem;
  gap: 1rem;
}

.shell--compact .logo {
  width: 2.75rem;
  height: 2.75rem;
  font-size: 0.85rem;
  margin-bottom: 0.5rem;
}

.shell--compact .sys-name {
  font-size: 1.1rem;
}

.shell--compact .sys-desc {
  font-size: 0.8rem;
  margin-top: 0.25rem;
}

.shell--compact .panel-head {
  margin-bottom: 0.85rem;
}

.shell--compact .panel-head h2 {
  font-size: 1.12rem;
}

.shell--compact .panel-head .sub {
  font-size: 0.8rem;
  line-height: 1.4;
}

.shell--compact .panel {
  padding: 1.1rem 1.2rem 1.15rem;
}

.panel-head {
  margin-bottom: 1.25rem;
}

.panel-head h2 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 650;
}

.panel-head .sub {
  margin: 0.35rem 0 0;
  font-size: 0.875rem;
  color: var(--bccr-muted);
}

.foot {
  font-size: 0.75rem;
  color: var(--bccr-muted);
  text-align: center;
  max-width: 36rem;
  line-height: 1.5;
}
</style>
