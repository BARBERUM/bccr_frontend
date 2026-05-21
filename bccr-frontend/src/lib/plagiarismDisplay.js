import { normalizeMediaSrc } from '@/api/client'
import { workKind } from '@/api/work'

/** @param {Record<string, unknown>} rec @param {string[]} keys */
function pickRecField(rec, keys) {
  for (const k of keys) {
    const v = rec[k]
    if (v != null && String(v).trim() !== '') return String(v).trim()
  }
  return ''
}

/** 手动查重记录在 PlagiarismRecord.sourceFileUrl 上的原作品文件地址 */
export function pickSourceFileUrl(rec) {
  if (!rec || typeof rec !== 'object') return ''
  return pickRecField(rec, [
    'sourceFileUrl',
    'source_file_url',
    'sourceUrl',
    'sourceFilePath',
    'source_file_path',
  ])
}

/** @param {string} url */
function inferKindFromUrl(url) {
  const u = String(url ?? '').toLowerCase()
  if (/\.(jpe?g|png|gif|webp|bmp|svg)(\?|#|$)/i.test(u)) return 'image'
  if (/\.(txt|md|json|xml|html?)(\?|#|$)/i.test(u)) return 'text'
  return ''
}

/** @param {Record<string, unknown>} rec */
export function inferPlagiarismSourceKind(rec) {
  const type = pickRecField(rec, [
    'sourceWorkType',
    'sourceType',
    'workType',
    'sourceMediaType',
  ])
  const k = workKind(type)
  if (k !== 'other') return k
  return inferKindFromUrl(pickSourceFileUrl(rec)) || 'other'
}

/**
 * 由查重记录中的 sourceFileUrl 构造源作品预览（无需 fetchWorkDetail）。
 * @param {Record<string, unknown>} rec
 */
export function buildManualCheckSourcePreview(rec) {
  const url = pickSourceFileUrl(rec)
  if (!url) return null
  const media = normalizeMediaSrc(url)
  const kind = inferPlagiarismSourceKind(rec)
  const title =
    pickRecField(rec, [
      'sourceWorkName',
      'sourceTitle',
      'sourceName',
      'sourceWorkTitle',
    ]) || '本次上传（手动查重）'
  const author = pickRecField(rec, [
    'sourceAuthor',
    'sourceAuthorName',
    'sourceAuthorAddress',
    'checkerAddress',
    'checkerName',
  ])
  const id = pickRecField(rec, ['sourceWorkId'])
  return {
    id,
    title,
    type: pickRecField(rec, ['sourceWorkType', 'workType']),
    kind,
    author,
    authorName: '',
    cover: kind === 'image' ? media : '',
    displayImageUrl: kind === 'image' ? media : '',
    fileUrl: media,
    textPreview: '',
    fromManualUpload: true,
    unavailable: false,
  }
}

/** @param {Record<string, unknown>} rec */
export function sourceThumbFromPlagiarismRecord(rec) {
  const preview = buildManualCheckSourcePreview(rec)
  if (!preview || preview.kind !== 'image') return ''
  return String(preview.cover || preview.displayImageUrl || '').trim()
}

/** CheckResult.resultLevel / PlagiarismRecord.result 等 */
export function formatResultLevel(level) {
  const map = {
    high_similarity: '高度相似',
    moderate: '中度相似',
    low: '低相似',
    no_match: '无匹配',
  }
  const k = typeof level === 'string' ? level : ''
  return map[k] ?? (k || '—')
}

export function formatSimilarity(sim) {
  const n = Number(sim)
  if (Number.isNaN(n)) return '—'
  return `${n.toFixed(2)}%`
}

/** 列表项左侧强调色 */
export function levelToneClass(level) {
  const k = typeof level === 'string' ? level : ''
  if (k === 'high_similarity') return 'tone-high'
  if (k === 'moderate') return 'tone-mid'
  if (k === 'low') return 'tone-low'
  if (k === 'no_match') return 'tone-none'
  return 'tone-default'
}
