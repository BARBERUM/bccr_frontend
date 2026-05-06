/** @param {Record<string, unknown>} o */
export function pickBool(o, keys, fallback = false) {
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(o, k)) {
      const v = o[k]
      if (typeof v === 'boolean') return v
      if (v === 1 || v === '1') return true
      if (v === 0 || v === '0') return false
    }
  }
  return fallback
}

/** @param {Record<string, unknown>} o */
export function pickStr(o, keys) {
  for (const k of keys) {
    const v = o[k]
    if (v != null && String(v).trim() !== '') return String(v).trim()
  }
  return ''
}

/** 后端常见字段 → 可读中文标签，提升 KV 表格阅读体验 */
const FIELD_LABELS = {
  // 节点 / 链
  blockNumber: '区块高度',
  latestBlock: '最新区块',
  blockHeight: '块高',
  chainId: '链 ID',
  networkId: '网络 ID',
  chainName: '网络名称',
  networkName: '网络名称',
  clientVersion: '客户端版本',
  nodeUrl: '节点地址',
  rpcUrl: 'RPC 地址',
  syncStatus: '同步状态',
  peers: '节点数',
  peerCount: '对等节点数',
  gasPrice: 'Gas 价格',
  errorMessage: '错误说明',
  error: '错误说明',
  message: '提示',
  // 合约
  contractName: '合约名称',
  name: '名称',
  version: '版本',
  abiVersion: 'ABI 版本',
}

/**
 * @param {string} key
 */
export function humanizeFieldLabel(key) {
  if (!key) return ''
  if (FIELD_LABELS[key]) return FIELD_LABELS[key]
  const spaced = key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/**
 * 生成便于展示的键值对（过滤冗余元数据）
 * @param {Record<string, unknown>} raw
 */
export function flattenStatusRows(raw) {
  if (!raw || typeof raw !== 'object') return []
  const skip = new Set([
    'connected',
    'isConnected',
    'available',
    'isAvailable',
    'class',
  ])
  /** @type {{ key: string, value: string, label: string }[]} */
  const out = []
  for (const [k, v] of Object.entries(raw)) {
    if (skip.has(k)) continue
    if (v == null || v === '') continue
    if (typeof v === 'object') continue
    out.push({
      key: k,
      value: String(v),
      label: humanizeFieldLabel(k),
    })
  }
  return out
}

/** @param {string} addr */
export function shortHex(addr, head = 8, tail = 6) {
  const s = String(addr ?? '').trim()
  if (!s) return ''
  if (s.length <= head + tail + 1) return s
  return `${s.slice(0, head)}…${s.slice(-tail)}`
}
