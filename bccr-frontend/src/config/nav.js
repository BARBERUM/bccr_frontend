import { hasAnyRole } from '@/lib/roles'

/**
 * @typedef {{ to: string, label: string, icon: string, roles: string[] | null }} NavItem
 */

/** @type {NavItem[]} */
export const NAV_ITEMS = [
  { to: '/app/dashboard', label: '概览', icon: 'dashboard', roles: null },
  { to: '/app/profile', label: '个人信息', icon: 'profile', roles: null },
  { to: '/app/works', label: '作品广场', icon: 'plaza', roles: null },
  { to: '/app/works/my', label: '我的作品', icon: 'folder', roles: ['admin', 'user', 'agent'] },
  { to: '/app/works/register', label: '登记作品', icon: 'register', roles: ['admin', 'user', 'agent'] },
  { to: '/app/check', label: '查重', icon: 'check', roles: null },
  { to: '/app/auth', label: '授权', icon: 'auth', roles: null },
  { to: '/app/audit', label: '审核', icon: 'audit', roles: ['admin', 'auditor'] },
  { to: '/app/users', label: '用户管理', icon: 'users', roles: ['admin'] },
  { to: '/app/blockchain', label: '区块链', icon: 'chain', roles: ['admin'] },
]

/** @param {string} label */
export function navIconFromLabel(label) {
  const item = NAV_ITEMS.find((i) => i.label === label)
  return item?.icon ?? 'dashboard'
}

/**
 * @param {Record<string, unknown>|null|undefined} user
 * @returns {NavItem[]}
 */
export function navItemsForUser(user) {
  return NAV_ITEMS.filter((item) => {
    if (!item.roles?.length) return true
    return hasAnyRole(user, item.roles)
  })
}
