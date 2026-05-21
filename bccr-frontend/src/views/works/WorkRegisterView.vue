<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import FileDropZone from '@/components/work/FileDropZone.vue'
import SimilarityMatchList from '@/components/work/SimilarityMatchList.vue'
import WorkTypePills from '@/components/work/WorkTypePills.vue'
import * as workApi from '@/api/work'
import { normalizeMediaSrc } from '@/api/client'

const router = useRouter()

const workId = ref('')
const workName = ref('')
const workType = ref('IMAGE')
const description = ref('')
const featureCode = ref('')
const ipfsHash = ref('')
const file = ref(/** @type {File | null} */ (null))

const loading = ref(false)
const errorMsg = ref('')
const successPayload = ref(/** @type {Record<string, unknown> | null} */ (null))

const recheckResults = ref(/** @type {Record<string, unknown>[]} */ ([]))
const recheckLoading = ref(false)
const recheckError = ref('')
const recheckSkipped = ref(false)

const showAdvanced = ref(false)

const canSubmit = computed(() => {
  if (loading.value) return false
  if (!workId.value.trim()) return false
  if (!workName.value.trim()) return false
  if (!workType.value.trim()) return false
  return true
})

function genWorkId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      workId.value = `work-${crypto.randomUUID()}`
      return
    }
  } catch {
    /* fallback */
  }
  workId.value = `work-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

async function onSubmit() {
  errorMsg.value = ''
  successPayload.value = null
  recheckResults.value = []
  recheckError.value = ''
  recheckSkipped.value = false
  if (!canSubmit.value) return
  loading.value = true
  try {
    const data = await workApi.registerWork({
      workId: workId.value,
      workName: workName.value,
      workType: workType.value,
      file: file.value ?? undefined,
      featureCode: featureCode.value.trim() || undefined,
      ipfsHash: ipfsHash.value.trim() || undefined,
      description: description.value.trim() || undefined,
    })
    successPayload.value =
      data && typeof data === 'object'
        ? /** @type {Record<string, unknown>} */ (data)
        : {}
    await runRecheckAfterSuccess()
  } catch (e) {
    errorMsg.value = e?.message || '登记失败'
  } finally {
    loading.value = false
  }
}

async function runRecheckAfterSuccess() {
  recheckLoading.value = true
  recheckError.value = ''
  recheckResults.value = []
  recheckSkipped.value = false
  const payload = successPayload.value
  const id = payload?.workId != null ? String(payload.workId) : ''
  const fileUrl = payload?.fileUrl
  if (!id) {
    recheckLoading.value = false
    return
  }
  if (!fileUrl || String(fileUrl).trim() === '') {
    recheckSkipped.value = true
    recheckLoading.value = false
    return
  }
  try {
    const data = await workApi.recheckWork(id)
    recheckResults.value = Array.isArray(data)
      ? /** @type {Record<string, unknown>[]} */ (data)
      : []
  } catch (e) {
    recheckError.value = e?.message || '查重失败'
  } finally {
    recheckLoading.value = false
  }
}

function goDetail() {
  const id = successPayload.value?.workId
  if (!id) return
  router.push({ name: 'work-detail', params: { workId: String(id) } })
}

function goPlaza() {
  router.push({ name: 'works-square' })
}

function resetSuccessFlow() {
  successPayload.value = null
  errorMsg.value = ''
  recheckResults.value = []
  recheckError.value = ''
  recheckSkipped.value = false
}

/** @param {unknown} id */
function openMatchDetail(id) {
  if (id == null || String(id).trim() === '') return
  router.push({ name: 'work-detail', params: { workId: String(id) } })
}

function fileUrlDisplay(u) {
  if (typeof u !== 'string' || !u.trim()) return ''
  return normalizeMediaSrc(u.trim())
}
</script>

<template>
  <div class="register-shell">
    <div class="page">
      <header class="hero">
        <h1 class="title">登记作品</h1>
      </header>

      <form v-if="!successPayload" class="card form-card" @submit.prevent="onSubmit">
        <div class="card-head">
          <h2 class="h2">作品信息</h2>
          <p class="card-desc">标 * 为必填项。</p>
        </div>

        <div class="grid">
          <label class="field field--full">
            <span class="lbl">作品 ID <em class="req">*</em></span>
            <div class="id-row">
              <input
                v-model.trim="workId"
                type="text"
                class="inp"
                required
                placeholder="全站唯一，如 work-xxx"
                autocomplete="off"
              />
              <button type="button" class="btn-gen" @click="genWorkId">生成 ID</button>
            </div>
          </label>

          <label class="field">
            <span class="lbl">作品名称 <em class="req">*</em></span>
            <input
              v-model.trim="workName"
              type="text"
              class="inp"
              required
              placeholder="展示用标题"
            />
          </label>

          <label class="field type-col">
            <span class="lbl">作品类型 <em class="req">*</em></span>
            <WorkTypePills v-model="workType" />
          </label>

          <div class="field field--full upload-field">
            <span class="lbl">作品文件 <span class="opt">选填</span></span>
            <FileDropZone
              v-model="file"
              empty-title="点击或拖拽上传"
              empty-subtitle="不上传时将使用 ID + 名称生成占位指纹"
              has-title="已选择文件"
            />
          </div>

          <label class="field field--full">
            <span class="lbl">作品说明 <span class="opt">选填</span></span>
            <textarea
              v-model.trim="description"
              class="inp area"
              rows="3"
              placeholder="简介、创作说明等（对应 description）"
            />
          </label>
        </div>

        <div class="adv-wrap">
          <button
            type="button"
            class="adv-toggle"
            :class="{ open: showAdvanced }"
            @click="showAdvanced = !showAdvanced"
          >
            <span class="adv-chev" aria-hidden="true">›</span>
            {{ showAdvanced ? '收起' : '展开' }}高级参数（特征码 / IPFS）
          </button>
          <div v-show="showAdvanced" class="adv-panel">
            <label class="field">
              <span class="lbl">featureCode</span>
              <input v-model.trim="featureCode" type="text" class="inp" />
            </label>
            <label class="field">
              <span class="lbl">ipfsHash</span>
              <input v-model.trim="ipfsHash" type="text" class="inp" />
            </label>
          </div>
        </div>

        <p v-if="errorMsg" class="err">{{ errorMsg }}</p>

        <button type="submit" class="btn-submit" :disabled="!canSubmit || loading">
          <span class="btn-submit-inner">{{
            loading ? '正在登记并上链…' : '提交登记'
          }}</span>
        </button>
      </form>

      <section v-else class="card success-card">
        <div class="success-banner">
          <span class="success-ic" aria-hidden="true">✓</span>
          <div>
            <h2 class="success-title">登记成功</h2>
            <p class="success-sub">指纹已落库，链上交易已提交。</p>
          </div>
        </div>

        <div class="kv-grid">
          <div class="kv">
            <span class="kv-k">作品 ID</span>
            <span class="kv-v mono">{{ successPayload.workId ?? '—' }}</span>
          </div>
          <div class="kv">
            <span class="kv-k">状态</span>
            <span class="kv-v status-pill">{{ successPayload.status ?? '—' }}</span>
          </div>
          <div class="kv span-2">
            <span class="kv-k">指纹</span>
            <span class="kv-v mono wrap">{{ successPayload.fingerprint ?? '—' }}</span>
          </div>
          <div class="kv span-2">
            <span class="kv-k">交易哈希</span>
            <span class="kv-v mono wrap">{{ successPayload.txHash ?? '—' }}</span>
          </div>
          <div v-if="successPayload.fileUrl" class="kv span-2">
            <span class="kv-k">文件</span>
            <a
              v-if="typeof successPayload.fileUrl === 'string'"
              :href="fileUrlDisplay(successPayload.fileUrl)"
              target="_blank"
              rel="noopener noreferrer"
              class="file-link"
            >
              {{ fileUrlDisplay(String(successPayload.fileUrl)) }}
            </a>
          </div>
        </div>

        <div class="recheck-block">
          <h3 class="recheck-h">自动查重</h3>
          <p v-if="recheckLoading" class="hint-loading">正在获取查重结果…</p>
          <p v-else-if="recheckSkipped" class="hint-skip">
            本次未上传文件，无法自动比对。可稍后为有文件的作品使用「再次查重」。
          </p>
          <p v-else-if="recheckError" class="err-inline">{{ recheckError }}</p>
          <SimilarityMatchList
            v-else-if="recheckResults.length"
            :items="recheckResults"
            @open-work="openMatchDetail"
          />
          <p v-else class="hint-empty">未发现相似作品记录。</p>
          <p
            v-if="successPayload?.fileUrl && !recheckSkipped && !recheckLoading"
            class="recheck-again"
          >
            <button type="button" class="btn-text" @click="runRecheckAfterSuccess">
              重新查重
            </button>
          </p>
        </div>

        <div class="ok-actions">
          <button type="button" class="btn-solid" @click="goDetail">查看详情</button>
          <button type="button" class="btn-outline" @click="goPlaza">返回广场</button>
          <button type="button" class="btn-outline" @click="resetSuccessFlow">
            继续登记
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.register-shell {
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 0.75rem 0 2.5rem;
  box-sizing: border-box;
}

.page {
  width: 100%;
  max-width: 720px;
}

.hero {
  margin-bottom: 1.35rem;
}

.title {
  margin: 0 0 0.4rem;
  font-size: 1.55rem;
  font-weight: 750;
  letter-spacing: -0.02em;
}

.lead {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.55;
  color: var(--bccr-muted);
}

.code {
  font-size: 0.76rem;
  padding: 0.12rem 0.35rem;
  border-radius: 0.35rem;
  background: var(--bccr-shadow-md);
  color: var(--bccr-accent-text);
}

.card {
  padding: 1.35rem 1.4rem;
  border-radius: 1rem;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: var(--bccr-card);
  margin-bottom: 1rem;
}

.form-card {
  box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.06), 0 20px 50px var(--bccr-code-bg);
}

.card-head {
  margin-bottom: 1.1rem;
}

.h2 {
  margin: 0 0 0.3rem;
  font-size: 1.08rem;
  font-weight: 650;
}

.card-desc {
  margin: 0;
  font-size: 0.82rem;
  color: var(--bccr-muted);
  line-height: 1.45;
}

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem 1.1rem;
}

@media (max-width: 600px) {
  .grid {
    grid-template-columns: 1fr;
  }
}

.field--full {
  grid-column: 1 / -1;
}

.type-col {
  grid-column: 1 / -1;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.lbl {
  font-size: 0.74rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--bccr-muted);
}

.opt {
  font-weight: 500;
  text-transform: none;
  letter-spacing: 0;
  color: var(--bccr-muted);
  font-size: 0.72rem;
}

.req {
  color: var(--bccr-danger);
  font-style: normal;
}

.inp {
  padding: 0.55rem 0.7rem;
  border-radius: 0.5rem;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: var(--bccr-card);
  color: var(--bccr-text);
  font-size: 0.9rem;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}

.inp:focus {
  outline: none;
  border-color: rgba(56, 189, 248, 0.45);
  box-shadow: 0 0 0 3px rgba(34, 211, 238, 0.12);
}

.area {
  resize: vertical;
  min-height: 4.75rem;
  font-family: inherit;
  line-height: 1.5;
}

.id-row {
  display: flex;
  gap: 0.5rem;
  align-items: stretch;
}

.id-row .inp {
  flex: 1;
  min-width: 0;
}

.btn-gen {
  flex-shrink: 0;
  padding: 0 0.9rem;
  border-radius: 0.5rem;
  border: 1px solid var(--bccr-btn-info-border);
  background: rgba(34, 211, 238, 0.08);
  color: var(--bccr-accent-text);
  font-size: 0.82rem;
  font-weight: 650;
  cursor: pointer;
  white-space: nowrap;
  transition:
    background 0.12s,
    border-color 0.12s;
}

.btn-gen:hover {
  background: rgba(34, 211, 238, 0.15);
  border-color: rgba(103, 232, 249, 0.5);
}

.upload-field {
  margin-top: 0.15rem;
}

.adv-wrap {
  margin-top: 1.15rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(148, 163, 184, 0.1);
}

.adv-toggle {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  width: 100%;
  padding: 0.45rem 0;
  border: none;
  background: none;
  font-size: 0.84rem;
  font-weight: 600;
  color: var(--bccr-btn-info-text);
  cursor: pointer;
  text-align: left;
}

.adv-chev {
  display: inline-block;
  transition: transform 0.2s;
  font-size: 1.1rem;
  opacity: 0.8;
}

.adv-toggle.open .adv-chev {
  transform: rotate(90deg);
}

.adv-panel {
  display: grid;
  gap: 0.85rem;
  padding: 0.85rem 0 0.25rem;
}

.err {
  margin: 1rem 0 0;
  padding: 0.55rem 0.75rem;
  border-radius: 0.45rem;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(248, 113, 113, 0.25);
  color: var(--bccr-danger);
  font-size: 0.86rem;
}

.btn-submit {
  width: 100%;
  margin-top: 1.15rem;
  padding: 0;
  border: none;
  border-radius: 0.65rem;
  cursor: pointer;
  background: linear-gradient(135deg, #0891b2, #2563eb, #7c3aed);
  box-shadow: 0 10px 32px rgba(37, 99, 235, 0.32);
  transition:
    transform 0.12s,
    filter 0.12s,
    opacity 0.12s;
}

.btn-submit:hover:not(:disabled) {
  filter: brightness(1.05);
  transform: translateY(-1px);
}

.btn-submit:disabled {
  opacity: 0.42;
  cursor: not-allowed;
  transform: none;
}

.btn-submit-inner {
  display: block;
  padding: 0.78rem 1rem;
  font-size: 0.95rem;
  font-weight: 700;
  color: #fff;
}

.success-card {
  border-color: rgba(74, 222, 128, 0.2);
  box-shadow: 0 0 0 1px rgba(74, 222, 128, 0.06), 0 22px 56px rgba(0, 0, 0, 0.24);
}

.success-banner {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 1.25rem;
}

.success-ic {
  flex-shrink: 0;
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 1.15rem;
  font-weight: 800;
  color: #052e16;
  background: linear-gradient(135deg, #4ade80, #22c55e);
  box-shadow: 0 8px 24px rgba(34, 197, 94, 0.35);
}

.success-title {
  margin: 0 0 0.2rem;
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--bccr-success-text);
}

.success-sub {
  margin: 0;
  font-size: 0.84rem;
  color: var(--bccr-muted);
}

.kv-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem 1rem;
  padding: 1rem;
  border-radius: 0.75rem;
  background: var(--bccr-hover);
  border: 1px solid rgba(148, 163, 184, 0.1);
}

.kv {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.kv.span-2 {
  grid-column: 1 / -1;
}

.kv-k {
  font-size: 0.72rem;
  color: var(--bccr-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.kv-v {
  font-size: 0.88rem;
  color: var(--bccr-text);
}

.status-pill {
  display: inline-block;
  align-self: flex-start;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 600;
  background: rgba(59, 130, 246, 0.15);
  border: 1px solid rgba(96, 165, 250, 0.3);
  color: var(--bccr-pill-text);
}

.mono {
  font-family: ui-monospace, monospace;
  font-size: 0.8rem;
  word-break: break-all;
}

.mono.wrap {
  white-space: pre-wrap;
}

.file-link {
  font-size: 0.8rem;
  color: var(--bccr-btn-info-text);
  word-break: break-all;
}

.file-link:hover {
  text-decoration: underline;
}

.recheck-block {
  margin-top: 1.25rem;
  padding-top: 1.1rem;
  border-top: 1px solid rgba(148, 163, 184, 0.12);
}

.recheck-h {
  margin: 0 0 0.65rem;
  font-size: 0.95rem;
  font-weight: 650;
  color: var(--bccr-text);
}

.hint-loading,
.hint-skip,
.hint-empty {
  margin: 0 0 0.5rem;
  font-size: 0.82rem;
  line-height: 1.5;
  color: var(--bccr-muted);
}

.err-inline {
  margin: 0 0 0.5rem;
  font-size: 0.84rem;
  color: var(--bccr-danger);
}

.recheck-again {
  margin: 0.6rem 0 0;
}

.ok-actions {
  margin-top: 1.15rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.btn-solid {
  padding: 0.55rem 1.1rem;
  border: none;
  border-radius: 0.5rem;
  font-size: 0.88rem;
  font-weight: 650;
  color: #fff;
  cursor: pointer;
  background: linear-gradient(135deg, #059669, #0d9488);
  box-shadow: 0 6px 20px rgba(13, 148, 136, 0.3);
}

.btn-outline {
  padding: 0.52rem 1rem;
  border-radius: 0.5rem;
  font-size: 0.86rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: var(--bccr-surface-muted);
  color: var(--bccr-muted);
}

.btn-outline:hover {
  color: var(--bccr-text);
  border-color: rgba(148, 163, 184, 0.4);
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
