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
