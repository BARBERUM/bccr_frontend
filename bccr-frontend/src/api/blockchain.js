import { request } from './client'

/**
 * 区块链 — {@code BlockChainController}，前缀 {@code /api/blockchain}
 *
 * - GET /api/blockchain/status — 节点连接状态（{@code BlockChainStatus}；未连接时多为 Result.error，{@link request} 抛错，页面用 Safe 方法承接）
 * - GET /api/blockchain/contract — 合约状态信息（{@code ContractInfo}）
 */

export function fetchBlockchainStatus() {
  return request('/api/blockchain/status', { method: 'GET' })
}

export function fetchContractInfo() {
  return request('/api/blockchain/contract', { method: 'GET' })
}

/**
 * @returns {Promise<{ ok: true, data: Record<string, unknown> } | { ok: false, message: string, code?: number }>}
 */
export async function fetchBlockchainStatusSafe() {
  try {
    const data = await fetchBlockchainStatus()
    const d =
      data && typeof data === 'object'
        ? /** @type {Record<string, unknown>} */ (data)
        : {}
    return { ok: true, data: d }
  } catch (e) {
    const err = /** @type {Error & { code?: number }} */ (e)
    return {
      ok: false,
      message: err?.message || '节点状态不可用',
      code: err?.code,
    }
  }
}

/**
 * @returns {Promise<{ ok: true, data: Record<string, unknown> } | { ok: false, message: string, code?: number }>}
 */
export async function fetchContractInfoSafe() {
  try {
    const data = await fetchContractInfo()
    const d =
      data && typeof data === 'object'
        ? /** @type {Record<string, unknown>} */ (data)
        : {}
    return { ok: true, data: d }
  } catch (e) {
    const err = /** @type {Error & { code?: number }} */ (e)
    return {
      ok: false,
      message: err?.message || '合约信息不可用',
      code: err?.code,
    }
  }
}
