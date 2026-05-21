import { hasAnyRole } from '@/lib/roles'

/**
 * @typedef {{ to: string, label: string, roles: string[] | null }} NavItem
 */

/** @type {NavItem[]} */
export const NAV_ITEMS = [
  { to: '/app/dashboard', label: '概览', roles: null },
  { to: '/app/profile', label: '个人信息', roles: null },
  { to: '/app/works', label: '作品广场', roles: null },
  { to: '/app/works/my', label: '我的作品', roles: ['admin', 'user', 'agent'] },
  { to: '/app/works/register', label: '登记作品', roles: ['admin', 'user', 'agent'] },
  { to: '/app/check', label: '查重', roles: null },
  { to: '/app/auth', label: '授权', roles: null },
  { to: '/app/audit', label: '审核', roles: ['admin', 'auditor'] },
  { to: '/app/users', label: '用户管理', roles: ['admin'] },
  { to: '/app/blockchain', label: '区块链', roles: ['admin'] },
]

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
