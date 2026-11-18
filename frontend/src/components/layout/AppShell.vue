<template>
  <div class="app-shell" :class="{ 'builder-shell': isDashboardBuilder, 'sidebar-collapsed': !sidebarPinned }">
    <DashboardSidebar v-model:pinned="sidebarPinned" />

    <div class="shell-main">
      <header class="shell-header">
        <div>
          <div class="eyebrow">{{ t('app.tagline') }}</div>
          <h1>{{ pageTitle }}</h1>
        </div>

        <div class="shell-actions">
          <div class="signal">
            <span />
            {{ t('app.liveWorkspace') }}
          </div>
          <v-chip v-if="datasource.selected" color="teal" variant="tonal" size="small">
            {{ datasource.selected.name }}
          </v-chip>
          <v-menu offset="10" location="bottom end" transition="scale-transition">
            <template #activator="{ props }">
              <v-btn
                v-bind="props"
                class="theme-trigger"
                size="small"
                variant="tonal"
                prepend-icon="mdi-theme-light-dark"
                append-icon="mdi-chevron-down"
              >
                {{ activeThemeLabel }}
              </v-btn>
            </template>

            <v-card class="theme-menu" min-width="220">
              <v-list density="comfortable" nav>
                <v-list-item
                  v-for="option in themeOptions"
                  :key="option.value"
                  :active="theme.global.name.value === option.value"
                  :prepend-icon="option.icon"
                  :title="t(option.labelKey)"
                  :subtitle="t(option.subtitleKey)"
                  @click="setTheme(option.value)"
                >
                  <template #append>
                    <v-icon
                      v-if="theme.global.name.value === option.value"
                      icon="mdi-check"
                      size="18"
                      color="primary"
                    />
                  </template>
                </v-list-item>
              </v-list>
            </v-card>
          </v-menu>
          <v-menu offset="10" location="bottom end" transition="scale-transition">
            <template #activator="{ props }">
              <v-btn
                v-bind="props"
                class="language-trigger"
                size="small"
                variant="tonal"
                prepend-icon="mdi-translate"
                append-icon="mdi-chevron-down"
              >
                {{ activeLocaleLabel }}
              </v-btn>
            </template>

            <v-card class="language-menu" min-width="190">
              <v-list density="comfortable" nav>
                <v-list-item
                  v-for="option in localeOptions"
                  :key="option.value"
                  :active="locale === option.value"
                  :title="option.label"
                  @click="changeLocale(option.value)"
                >
                  <template #prepend>
                    <span class="locale-code">{{ option.shortLabel }}</span>
                  </template>
                  <template #append>
                    <v-icon v-if="locale === option.value" icon="mdi-check" size="18" color="primary" />
                  </template>
                </v-list-item>
              </v-list>
            </v-card>
          </v-menu>
          <v-btn size="small" color="primary" variant="flat" prepend-icon="mdi-database-plus" to="/datasources">
            {{ t('app.newSource') }}
          </v-btn>
        </div>
      </header>

      <main class="shell-content">
        <slot />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { useTheme } from 'vuetify';
import { localeOptions, setLocale, type AppLocale } from '../../app/i18n';
import DashboardSidebar from '../dashboard/DashboardSidebar.vue';
import { useDatasourceStore } from '../../stores/datasource.store';
import { useDashboardStore } from '../../stores/dashboard.store';

const route = useRoute();
const theme = useTheme();
const { locale, t } = useI18n();
const datasource = useDatasourceStore();
const dashboard = useDashboardStore();
const THEME_KEY = 'askme_theme';
const SIDEBAR_COLLAPSED_KEY = 'askme_sidebar_collapsed';
const SIDEBAR_PINNED_KEY = 'askme_sidebar_pinned';
type AskMeTheme = 'askmeDark' | 'light';
const savedSidebarPinned = localStorage.getItem(SIDEBAR_PINNED_KEY);
const legacySidebarCollapsed = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
const sidebarPinned = ref(
  savedSidebarPinned === null ? legacySidebarCollapsed !== 'true' : savedSidebarPinned === 'true'
);

const themeOptions: Array<{ value: AskMeTheme; labelKey: string; subtitleKey: string; icon: string }> = [
  {
    value: 'askmeDark',
    labelKey: 'theme.dark',
    subtitleKey: 'theme.darkSubtitle',
    icon: 'mdi-weather-night'
  },
  {
    value: 'light',
    labelKey: 'theme.light',
    subtitleKey: 'theme.lightSubtitle',
    icon: 'mdi-white-balance-sunny'
  }
];

const pageTitle = computed(() => {
  if (route.path.startsWith('/datasources')) return t('pages.datasources');
  if (route.path.startsWith('/datasets')) return t('pages.datasets');
  if (route.path.startsWith('/semantic')) return t('pages.semantic');
  if (route.path.startsWith('/dashboards')) return t('pages.dashboards');
  if (route.path.startsWith('/playground')) return t('pages.playground');
  return t('pages.workspace');
});

const isDashboardBuilder = computed(() => /^\/dashboards\/[^/]+\/(edit|view)$/.test(route.path));

onMounted(async () => {
  const savedTheme = localStorage.getItem(THEME_KEY);
  if (savedTheme === 'light' || savedTheme === 'askmeDark') {
    setTheme(savedTheme);
  } else {
    syncDocumentTheme(theme.global.name.value as AskMeTheme);
  }

  if (!datasource.items.length) {
    await datasource.fetchAll();
  }
  if (!dashboard.items.length) {
    await dashboard.fetchAll();
  }
});

watch(sidebarPinned, (value) => {
  localStorage.setItem(SIDEBAR_PINNED_KEY, String(value));
});

const activeThemeLabel = computed(() => {
  const option = themeOptions.find((item) => item.value === theme.global.name.value);
  return option ? t(option.labelKey) : t('theme.label');
});

const activeLocaleLabel = computed(() => {
  return localeOptions.find((option) => option.value === locale.value)?.shortLabel || 'FR';
});

const syncDocumentTheme = (value: AskMeTheme) => {
  document.documentElement.dataset.askmeTheme = value === 'light' ? 'light' : 'dark';
};

const setTheme = (nextTheme: AskMeTheme) => {
  theme.global.name.value = nextTheme;
  localStorage.setItem(THEME_KEY, nextTheme);
  syncDocumentTheme(nextTheme);
};

const changeLocale = (nextLocale: AppLocale) => {
  setLocale(nextLocale);
};
</script>

<style scoped>
.app-shell {
  height: 100vh;
  min-height: 100vh;
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  overflow: hidden;
  background: var(--askme-app-bg);
  transition: grid-template-columns 180ms ease;
}

.app-shell.sidebar-collapsed {
  grid-template-columns: 76px minmax(0, 1fr);
}

.shell-main {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
}

.shell-header {
  position: relative;
  top: 0;
  z-index: 8;
  min-height: 76px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 28px;
  background: var(--askme-header-bg);
  border-bottom: 1px solid var(--askme-border);
  backdrop-filter: blur(22px);
}

.eyebrow {
  font-size: 12px;
  font-weight: 700;
  color: var(--askme-secondary);
  text-transform: uppercase;
}

h1 {
  margin: 0;
  font-size: 22px;
  line-height: 1.2;
  color: var(--askme-ink);
}

.shell-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.theme-trigger,
.language-trigger {
  min-width: 132px;
}

.language-trigger {
  min-width: 94px;
}

.theme-menu :deep(.v-list-item--active),
.language-menu :deep(.v-list-item--active) {
  background: var(--askme-active-surface);
  border: 1px solid var(--askme-border-strong);
  color: var(--askme-active-ink);
}

.locale-code {
  min-width: 28px;
  color: var(--askme-secondary);
  font-size: 12px;
  font-weight: 900;
}

.signal {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--askme-muted);
  font-size: 12px;
  font-weight: 700;
}

.signal span {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--askme-primary);
  box-shadow: 0 0 20px rgba(32, 242, 182, 0.8);
  animation: askme-pulse 2.4s ease-in-out infinite;
}

.shell-content {
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 24px 28px 40px;
  overscroll-behavior: contain;
}

.builder-shell .shell-content {
  padding: 12px;
}

@media (max-width: 960px) {
  .app-shell {
    height: 100vh;
    grid-template-columns: 1fr;
  }

  .shell-header {
    padding: 16px;
    align-items: flex-start;
    flex-direction: column;
  }

  .shell-content {
    padding: 16px;
  }
}
</style>
