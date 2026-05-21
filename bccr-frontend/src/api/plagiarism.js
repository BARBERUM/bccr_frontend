import { request, requestMultipart } from './client'
import { normalizeWorkIdParam } from './work'

/**
 * 手动上传查重（POST /api/work/check，multipart）
 * @param {File} file
 * @param {string} workType 如 IMAGE / TEXT
 */
export function manualCheckWork(file, workType) {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('workType', String(workType).trim())
  return requestMultipart('/api/work/check', {
    method: 'POST',
    body: fd,
  })
}

/**
 * 某作品维度的查重记录（GET /api/plagiarism/work/{workId}）
 * @param {string} workId
 */
export function fetchPlagiarismRecordsByWorkId(workId) {
  const id = encodeURIComponent(normalizeWorkIdParam(workId))
  return request(`/api/plagiarism/work/${id}`, { method: 'GET' })
}

/**
 * 单条查重记录（GET /api/plagiarism/{checkId}）
 * @param {string} checkId
 */
export function fetchPlagiarismRecordById(checkId) {
  const id = encodeURIComponent(String(checkId).trim())
  return request(`/api/plagiarism/${id}`, { method: 'GET' })
}

/**
 * 某查重者地址下的手动查重记录（GET /api/plagiarism/checker/{checkerAddress}）
 * @param {string} checkerAddress
 */
export function fetchPlagiarismRecordsByChecker(checkerAddress) {
  const a = encodeURIComponent(String(checkerAddress).trim())
  return request(`/api/plagiarism/checker/${a}`, { method: 'GET' })
}
