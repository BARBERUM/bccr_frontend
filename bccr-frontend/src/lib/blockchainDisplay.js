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

/** @param {Record<string, unknown>} o */
export function pickNum(o, keys) {
  for (const k of keys) {
    const v = o[k]
    if (v != null && Number.isFinite(Number(v))) return Number(v)
  }
  return null
}

/** 后端常见字段 → 可读中文标签 */
const FIELD_LABELS = {
  // 节点 / 链
  blockNumber: '区块高度',
  latestBlock: '最新区块',
  blockHeight: '块高',
  latestBlockNumber: '最新区块高度',
  chainId: '链 ID',
  networkId: '网络 ID',
  chainName: '网络名称',
  networkName: '网络名称',
  clientVersion: '客户端版本',
  nodeVersion: '节点版本',
  fiscoVersion: 'FISCO 版本',
  protocolVersion: '协议版本',
  nodeUrl: '节点地址',
  rpcUrl: 'RPC 地址',
  channelUrl: 'Channel 地址',
  syncStatus: '同步状态',
  syncing: '是否同步中',
  isSyncing: '是否同步中',
  synced: '是否已同步',
  peers: '节点数',
  peerCount: '对等节点数',
  groupId: '群组 ID',
  groupID: '群组 ID',
  gasPrice: 'Gas 价格',
  pendingTxCount: '待处理交易数',
  pendingTransactions: '待处理交易数',
  transactionCount: '交易总数',
  blockLimit: '区块限制',
  consensusNode: '共识节点',
  sealerList: '共识节点列表',
  observerList: '观察节点列表',
  nodeId: '节点 ID',
  nodeID: '节点 ID',
  listening: '监听状态',
  isListening: '监听状态',
  uptime: '运行时长',
  latency: '响应延迟',
  responseTime: '响应耗时',
  errorMessage: '错误说明',
  error: '错误说明',
  message: '提示',
  // 合约
  contractName: '合约名称',
  name: '名称',
  version: '版本',
  abiVersion: 'ABI 版本',
  currentAccount: '当前部署账户地址',
  deployAccount: '部署账户地址',
  accountAddress: '账户地址',
  account: '账户地址',
  from: '发起账户',
  owner: '合约所有者',
  deployer: '部署者地址',
  deployBlock: '部署区块高度',
  deployBlockNumber: '部署区块高度',
  deployTime: '部署时间',
  deployTxHash: '部署交易哈希',
  transactionHash: '交易哈希',
  txHash: '交易哈希',
  implementationAddress: '实现合约地址',
  proxyAddress: '代理合约地址',
  contractAddress: '合约地址',
  address: '合约地址',
  channelConnected: 'Channel 已连接',
  cryptoType: '加密类型',
  ssl: 'SSL 状态',
  useSmCrypto: '国密算法',
  loaded: '合约载入情况',
  isLoaded: '合约载入情况',
}

/**
 * @param {string} key
 */
export function humanizeFieldLabel(key) {
  if (!key) return ''
  if (FIELD_LABELS[key]) return FIELD_LABELS[key]
  const lower = String(key).trim()
  const lowerKey = lower.charAt(0).toLowerCase() + lower.slice(1)
  if (FIELD_LABELS[lowerKey]) return FIELD_LABELS[lowerKey]
  const spaced = lower
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/** @param {string} key @param {unknown} value */
export function formatFieldValue(key, value) {
  const s = String(value ?? '').trim()
  if (!s) return '—'
  const k = String(key ?? '').toLowerCase()

  if (s === 'true' || s === 'false') {
    if (k === 'loaded' || k === 'isloaded') {
      return s.toLowerCase() === 'true' ? '已载入' : '未载入'
    }
    return humanizeStatusValue(s)
  }

  if (
    (k.includes('sync') || k.includes('listen') || k.includes('connect') || k.includes('available')) &&
    /^(true|false|0|1)$/i.test(s)
  ) {
    return humanizeStatusValue(s)
  }

  if (k.includes('gas') && /^\d+$/.test(s)) {
    const n = Number(s)
    if (n >= 1_000_000_000) return `${(n / 1e9).toFixed(2)} Gwei`
    if (n >= 1_000_000) return `${(n / 1e6).toFixed(2)} Mwei`
    return `${n.toLocaleString('zh-CN')} Wei`
  }

  if ((k.includes('block') || k.includes('height') || k.includes('count') || k.includes('peer')) && /^\d+$/.test(s)) {
    return Number(s).toLocaleString('zh-CN')
  }

  if ((k.includes('latency') || k.includes('time') || k.includes('uptime')) && /^\d+$/.test(s)) {
    const n = Number(s)
    if (k.includes('uptime') && n > 3600) {
      const h = Math.floor(n / 3600)
      const m = Math.floor((n % 3600) / 60)
      return `${h} 小时 ${m} 分`
    }
    return `${n.toLocaleString('zh-CN')} ms`
  }

  if (/^0x[0-9a-fA-F]{6,}$/.test(s)) {
    return shortHex(s, 10, 8)
  }

  return humanizeStatusValue(s)
}

/** @param {string} value */
export function isCopyableValue(value) {
  const s = String(value ?? '').trim()
  return s.length >= 16 || /^0x[0-9a-fA-F]+$/.test(s) || /^https?:\/\//i.test(s)
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
      value: formatFieldValue(k, v),
      rawValue: String(v),
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

const STATUS_VALUE_LABELS = {
  synced: '已同步',
  syncing: '同步中',
  not_synced: '未同步',
  pending: '待处理',
  true: '是',
  false: '否',
}

/** @param {string} raw */
export function humanizeStatusValue(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return '—'
  const lower = s.toLowerCase()
  if (STATUS_VALUE_LABELS[lower]) return STATUS_VALUE_LABELS[lower]
  return s
}

/**
 * @param {Record<string, unknown>} raw
 * @param {{ key: string, label: string, pick: string[], icon?: string, format?: (v: string) => string }} spec
 */
function pickNodeField(raw, spec) {
  const rawVal = pickStr(raw, spec.pick)
  if (!rawVal) return null
  const value = spec.format ? spec.format(rawVal) : formatFieldValue(spec.key, rawVal)
  if (!value || value === '—') return null
  return {
    key: spec.key,
    label: spec.label,
    value,
    rawValue: rawVal,
    icon: spec.icon ?? '•',
  }
}

/**
 * 节点面板顶部快速指标（最多 4 项）
 * @param {Record<string, unknown>} raw
 */
export function extractNodeQuickStats(raw) {
  if (!raw || typeof raw !== 'object') return []
  const specs = [
    { key: 'block', label: '区块高度', pick: ['blockNumber', 'latestBlock', 'blockHeight', 'latestBlockNumber'], icon: '⬡' },
    { key: 'chain', label: '链 ID', pick: ['chainId', 'networkId'], icon: '◎' },
    { key: 'sync', label: '同步状态', pick: ['syncStatus', 'syncing', 'isSyncing', 'synced'], icon: '↻' },
    { key: 'peers', label: '对等节点', pick: ['peers', 'peerCount'], icon: '⬢', format: (v) => formatFieldValue('peerCount', v) },
  ]
  return specs.map((s) => pickNodeField(raw, s)).filter(Boolean)
}

/**
 * 分组展示节点详情
 * @param {Record<string, unknown>} raw
 */
export function extractNodeGroups(raw) {
  if (!raw || typeof raw !== 'object') return []

  /** @type {{ id: string, title: string, desc: string, items: NonNullable<ReturnType<typeof pickNodeField>>[] }[]} */
  const groups = [
    {
      id: 'chain',
      title: '链与区块',
      desc: '当前链上区块与交易概况',
      specs: [
        { key: 'block', label: '最新区块高度', pick: ['blockNumber', 'latestBlock', 'blockHeight', 'latestBlockNumber'], icon: '⬡' },
        { key: 'pending', label: '待处理交易', pick: ['pendingTxCount', 'pendingTransactions'], icon: '◷' },
        { key: 'txTotal', label: '累计交易数', pick: ['transactionCount'], icon: '⇄' },
        { key: 'blockLimit', label: '区块限制', pick: ['blockLimit'], icon: '▣' },
        { key: 'group', label: '群组 ID', pick: ['groupId', 'groupID'], icon: '◎' },
      ],
    },
    {
      id: 'network',
      title: '网络与连接',
      desc: 'RPC、节点与网络标识',
      specs: [
        { key: 'network', label: '网络名称', pick: ['chainName', 'networkName'], icon: '◈' },
        { key: 'chain', label: '链 ID', pick: ['chainId', 'networkId'], icon: '◎' },
        { key: 'rpc', label: 'RPC 地址', pick: ['nodeUrl', 'rpcUrl', 'channelUrl'], icon: '⇄' },
        { key: 'nodeId', label: '节点 ID', pick: ['nodeId', 'nodeID'], icon: '⬢' },
        { key: 'peers', label: '对等节点数', pick: ['peers', 'peerCount'], icon: '⬢' },
        { key: 'listen', label: '监听状态', pick: ['listening', 'isListening'], icon: '◉' },
      ],
    },
    {
      id: 'runtime',
      title: '客户端与运行',
      desc: '版本、同步与性能信息',
      specs: [
        { key: 'sync', label: '同步状态', pick: ['syncStatus', 'syncing', 'isSyncing', 'synced'], icon: '↻' },
        { key: 'client', label: '客户端版本', pick: ['clientVersion', 'nodeVersion'], icon: '⌘' },
        { key: 'fisco', label: 'FISCO 版本', pick: ['fiscoVersion'], icon: '⌘' },
        { key: 'protocol', label: '协议版本', pick: ['protocolVersion'], icon: '⌁' },
        { key: 'gas', label: 'Gas 价格', pick: ['gasPrice'], icon: '⚡' },
        { key: 'latency', label: '响应延迟', pick: ['latency', 'responseTime'], icon: '◷' },
        { key: 'uptime', label: '运行时长', pick: ['uptime'], icon: '◔' },
        { key: 'consensus', label: '共识节点', pick: ['consensusNode', 'sealerList'], icon: '⬡' },
      ],
    },
  ]

  return groups
    .map((g) => ({
      id: g.id,
      title: g.title,
      desc: g.desc,
      items: g.specs.map((s) => pickNodeField(raw, s)).filter(Boolean),
    }))
    .filter((g) => g.items.length > 0)
}

/**
 * 从节点状态对象提取重点指标，用于卡片展示（扁平列表，兼容旧用法）
 * @param {Record<string, unknown>} raw
 */
export function extractNodeHighlights(raw) {
  if (!raw || typeof raw !== 'object') return []
  const fromGroups = extractNodeGroups(raw).flatMap((g) => g.items)
  if (fromGroups.length) return fromGroups

  const used = new Set()
  /** @type {{ key: string, label: string, value: string, rawValue?: string, icon: string }[]} */
  const extras = []
  for (const row of flattenStatusRows(raw)) {
    if (used.has(row.key)) continue
    used.add(row.key)
    extras.push({
      key: row.key,
      label: row.label,
      value: row.value,
      rawValue: row.rawValue,
      icon: '•',
    })
  }
  return extras.slice(0, 12)
}

/**
 * 从合约信息对象提取重点指标
 * @param {Record<string, unknown>} raw
 */
export function extractContractHighlights(raw) {
  if (!raw || typeof raw !== 'object') return []
  const skip = new Set([
    'contractAddress',
    'address',
    'proxyAddress',
    'implementationAddress',
    'available',
    'isAvailable',
    'errorMessage',
    'error',
    'message',
    'class',
    'testResult',
    'testresult',
    'test_result',
    'testResults',
  ])
  /** @type {{ key: string, label: string, value: string, rawValue: string, copyable: boolean }[]} */
  const items = []
  const pushItem = (key, label, rawVal) => {
    if (!rawVal || items.some((it) => it.key === key)) return
    items.push({
      key,
      label,
      value: formatFieldValue(key, rawVal),
      rawValue: rawVal,
      copyable: isCopyableValue(rawVal),
    })
  }

  pushItem('name', '合约名称', pickStr(raw, ['contractName', 'name']))
  pushItem('version', '合约版本', pickStr(raw, ['version', 'abiVersion']))
  pushItem('currentAccount', '当前部署账户地址', pickStr(raw, ['currentAccount', 'deployAccount', 'accountAddress', 'account', 'from', 'owner', 'deployer']))
  pushItem('deployBlock', '部署区块高度', pickStr(raw, ['deployBlock', 'deployBlockNumber']))
  pushItem('deployTx', '部署交易哈希', pickStr(raw, ['deployTxHash', 'transactionHash', 'txHash']))
  pushItem('deployTime', '部署时间', pickStr(raw, ['deployTime']))
  pushItem('loaded', '合约载入情况', pickStr(raw, ['loaded', 'isLoaded']))
  pushItem('cryptoType', '加密类型', pickStr(raw, ['cryptoType', 'useSmCrypto']))
  pushItem('channelConnected', 'Channel 连接', pickStr(raw, ['channelConnected']))

  for (const row of flattenStatusRows(raw)) {
    if (skip.has(row.key) || /^testresult/i.test(row.key.replace(/_/g, ''))) continue
    if (items.some((it) => it.key === row.key)) continue
    items.push({
      key: row.key,
      label: row.label,
      value: row.value,
      rawValue: row.rawValue ?? row.value,
      copyable: isCopyableValue(row.rawValue ?? row.value),
    })
  }
  return items.filter((it) => it.value && it.value !== '—')
}

/** @param {string} key */
export function humanizeWorkStatusKey(key) {
  const map = {
    PENDING: '待审核',
    APPROVED: '已通过',
    REJECTED: '已驳回',
    ON_CHAIN: '已上链',
    DRAFT: '草稿',
    AUDITING: '审核中',
  }
  const u = String(key ?? '').trim().toUpperCase()
  return map[u] ?? humanizeFieldLabel(key)
}

/** @param {string} key */
export function humanizeWorkTypeKey(key) {
  const map = {
    IMAGE: '图片',
    TEXT: '文本',
    VIDEO: '视频',
    AUDIO: '音频',
  }
  const u = String(key ?? '').trim().toUpperCase()
  return map[u] ?? humanizeFieldLabel(key)
}
