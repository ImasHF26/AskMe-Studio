import { createApp } from 'vue';
import { createPinia } from 'pinia';
import VueGridLayout from 'vue-grid-layout';
import App from './App.vue';
import router from './app/router';
import { i18n } from './app/i18n';
import { vuetify } from './app/plugins/vuetify';
import './app/theme/tokens.css';
import { useAuthStore } from './stores/auth.store';
import { AUTH_UNAUTHORIZED_EVENT } from './services/api/client';

async function bootstrap() {
  const app = createApp(App);
  const pinia = createPinia();

  app.use(pinia).use(i18n).use(vuetify).use(VueGridLayout);

  const authStore = useAuthStore();
  await authStore.bootstrap();

  window.addEventListener(AUTH_UNAUTHORIZED_EVENT, () => {
    authStore.logout();

    const currentRoute = router.currentRoute.value;
    if (!currentRoute.meta.public) {
      void router.push({
        path: '/auth/login',
        query: currentRoute.fullPath === '/auth/login' ? undefined : { redirect: currentRoute.fullPath }
      });
    }
  });

  app.use(router);
  await router.isReady();

  app.mount('#app');
}

void bootstrap();
