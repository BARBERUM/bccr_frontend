import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { hasAnyRole } from '@/lib/roles'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: () => (useAuthStore().isLoggedIn ? '/app/dashboard' : '/login'),
    },
    { path: '/home', redirect: '/app/dashboard' },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/Login.vue'),
      meta: { guestOnly: true },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('@/views/Register.vue'),
      meta: { guestOnly: true },
    },
    {
      path: '/app',
      component: () => import('@/layouts/MainLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        { path: '', redirect: { name: 'dashboard' } },
        {
          path: 'dashboard',
          name: 'dashboard',
          component: () => import('@/views/dashboard/DashboardView.vue'),
        },
        {
          path: 'profile',
          name: 'profile',
          component: () => import('@/views/ProfileView.vue'),
        },
        {
          path: 'works',
          name: 'works-square',
          component: () => import('@/views/works/WorksPlazaView.vue'),
        },
        {
          path: 'works/my',
          name: 'works-my',
          component: () => import('@/views/ComingSoon.vue'),
          meta: { roles: ['user', 'agent'] },
          props: {
            title: '我的作品',
            subtitle: '按作者地址过滤的本人作品列表（GET /api/work/my）。',
          },
        },
        {
          path: 'works/register',
          name: 'works-register',
          component: () => import('@/views/works/WorkRegisterView.vue'),
          meta: { roles: ['admin', 'user', 'agent'] },
        },
        {
          path: 'works/:workId',
          name: 'work-detail',
          component: () => import('@/views/works/WorkDetailView.vue'),
          props: true,
        },
        {
          path: 'check',
          name: 'check',
          component: () => import('@/views/check/CheckView.vue'),
        },
        {
          path: 'auth',
          name: 'auth',
          component: () => import('@/views/auth/AuthorizationView.vue'),
        },
        {
          path: 'audit',
          name: 'audit',
          component: () => import('@/views/audit/AuditView.vue'),
          meta: { roles: ['admin', 'auditor'] },
        },
        {
          path: 'users',
          name: 'users',
          component: () => import('@/views/admin/UserManageView.vue'),
          meta: { roles: ['admin'] },
        },
        {
          path: 'blockchain',
          name: 'blockchain',
          component: () => import('@/views/blockchain/BlockchainView.vue'),
          meta: { roles: ['admin'] },
        },
      ],
    },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  if (to.meta.requiresAuth && !auth.isLoggedIn) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  if (to.meta.guestOnly && auth.isLoggedIn) {
    return { name: 'dashboard' }
  }

  const leaf = to.matched[to.matched.length - 1]
  const roleGate = leaf?.meta?.roles
  if (Array.isArray(roleGate) && roleGate.length && to.meta.requiresAuth) {
    if (!auth.user) {
      await auth.hydrateUser()
    }
    if (!auth.isLoggedIn) {
      return { name: 'login', query: { redirect: to.fullPath } }
    }
    if (!hasAnyRole(auth.user, roleGate)) {
      return { name: 'dashboard', query: { tip: 'forbidden' } }
    }
  }

  return true
})

export default router
