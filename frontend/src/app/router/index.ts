import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/workspace' },
  { path: '/auth/login', component: () => import('../../views/auth/LoginView.vue'), meta: { public: true } },
  {
    path: '/auth/register',
    component: () => import('../../views/auth/RegisterView.vue'),
    meta: { public: true }
  },
  { path: '/workspace', component: () => import('../../views/workspace/WorkspaceView.vue') },
  { path: '/datasources', component: () => import('../../views/datasources/DataSourcesView.vue') },
  { path: '/datasets/:sourceId/:datasetId?', component: () => import('../../views/datasets/DatasetExplorerView.vue') },
  { path: '/semantic/:sourceId', component: () => import('../../views/semantic/SemanticLayerView.vue') },
  { path: '/dashboards', component: () => import('../../views/dashboards/DashboardManagerView.vue') },
  { path: '/dashboards/:dashboardId/edit', component: () => import('../../views/dashboards/DashboardBuilderView.vue') },
  { path: '/dashboards/:dashboardId/view', component: () => import('../../views/dashboards/DashboardViewerView.vue') },
  { path: '/playground', component: () => import('../../views/playground/QueryPlaygroundView.vue') }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

router.beforeEach((to) => {
  const isPublic = Boolean(to.meta.public);
  const token = localStorage.getItem('askme_access_token');

  if (!isPublic && !token) {
    return '/auth/login';
  }

  if (isPublic && token) {
    return '/workspace';
  }

  return true;
});

export default router;
