<template>
  <aside
    class="sidebar"
    :class="{ collapsed, compact: isCompact, 'hover-expanded': isHoverExpanded }"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <div class="brand">
      <img class="brand-logo" :class="{ 'brand-logo-icon': isCompact }" :src="brandSrc" alt="AskMe Studio" />
      <v-btn
        class="collapse-toggle"
        :icon="pinned ? 'mdi-radiobox-marked' : 'mdi-radiobox-blank'"
        size="small"
        variant="tonal"
        :aria-label="pinned ? 'Désépingler la barre latérale' : 'Épingler la barre latérale'"
        :title="pinned ? 'Sidebar fixe' : 'Sidebar auto au survol'"
        @click.stop="togglePinned"
      />
    </div>

    <div class="orbit-card" :title="isCompact ? t('sidebar.copilotReady') : undefined">
      <div class="orbit-core" />
      <div v-if="!isCompact">
        <strong>{{ t('sidebar.copilotReady') }}</strong>
        <span>{{ t('sidebar.semanticOnline') }}</span>
      </div>
    </div>

    <v-list nav class="nav-list">
      <v-list-item :title="navTitle(t('sidebar.workspace'))" to="/workspace" prepend-icon="mdi-view-dashboard-outline" @click="handleNavClick" />
      <v-list-item :title="navTitle(t('sidebar.dataSources'))" to="/datasources" prepend-icon="mdi-database-outline" @click="handleNavClick" />
      <v-list-item :to="datasetPath" :title="navTitle(t('sidebar.datasetExplorer'))" prepend-icon="mdi-table-search" @click="handleNavClick" />
      <v-list-item :to="semanticPath" :title="navTitle(t('sidebar.semanticLayer'))" prepend-icon="mdi-shape-outline" @click="handleNavClick" />
      <v-list-item to="/dashboards" :title="navTitle(t('sidebar.dashboards'))" prepend-icon="mdi-chart-box-outline" @click="handleNavClick" />
      <v-list-item
        v-for="item in dashboard.items.slice(0, 5)"
        :key="item.id"
        :title="navTitle(item.name)"
        :to="`/dashboards/${item.id}/edit`"
        prepend-icon="mdi-view-dashboard"
        @click="handleNavClick"
      />
      <v-list-item :title="navTitle(t('sidebar.playground'))" to="/playground" prepend-icon="mdi-flask-outline" @click="handleNavClick" />
    </v-list>

    <div class="sidebar-footer">
      <div v-if="!isCompact" class="user-email">{{ auth.user?.email || t('app.notAuthenticated') }}</div>
      <v-btn
        :block="!isCompact"
        size="small"
        color="red-lighten-1"
        variant="tonal"
        :icon="isCompact ? 'mdi-logout' : undefined"
        :prepend-icon="isCompact ? undefined : 'mdi-logout'"
        @click="logout"
      >
        <span v-if="!isCompact">{{ t('sidebar.logout') }}</span>
      </v-btn>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useTheme } from 'vuetify';
import { useAuthStore } from '../../stores/auth.store';
import { useDashboardStore } from '../../stores/dashboard.store';
import { useDatasourceStore } from '../../stores/datasource.store';

const router = useRouter();
const theme = useTheme();
const { t } = useI18n();
const auth = useAuthStore();
const dashboard = useDashboardStore();
const datasource = useDatasourceStore();

const props = defineProps<{
  pinned: boolean;
}>();

const emit = defineEmits<{
  'update:pinned': [value: boolean];
}>();

const hoverExpanded = ref(false);
const collapsed = computed(() => !props.pinned);
const isHoverExpanded = computed(() => collapsed.value && hoverExpanded.value);
const isCompact = computed(() => collapsed.value && !hoverExpanded.value);

const logoSrc = computed(() =>
  theme.global.name.value === 'light'
    ? '/assets/images/logo_charte_graphique_light.png'
    : '/assets/images/logo_charte_graphique_dark.png'
);
const iconSrc = '/assets/images/icon_charte_graphique_light.png';
const brandSrc = computed(() => (isCompact.value ? iconSrc : logoSrc.value));
const activeDatasourceId = computed(() => datasource.selectedId || 'default');
const datasetPath = computed(() => `/datasets/${activeDatasourceId.value}`);
const semanticPath = computed(() => `/semantic/${activeDatasourceId.value}`);
const navTitle = (title: string) => (isCompact.value ? undefined : title);
const togglePinned = () => {
  hoverExpanded.value = false;
  emit('update:pinned', !props.pinned);
};
const handleMouseEnter = () => {
  if (collapsed.value) hoverExpanded.value = true;
};
const handleMouseLeave = () => {
  hoverExpanded.value = false;
};
const handleNavClick = () => {
  hoverExpanded.value = false;
};
const logout = async () => {
  hoverExpanded.value = false;
  auth.logout();
  await router.push('/auth/login');
};
</script>

<style scoped>
.sidebar {
  position: sticky;
  top: 0;
  z-index: 20;
  width: 280px;
  height: 100vh;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 18px 14px;
  background: var(--askme-sidebar-bg);
  border-right: 1px solid var(--askme-border);
  box-shadow: var(--askme-shadow);
  backdrop-filter: blur(24px);
  transition: width 180ms ease, padding 180ms ease, box-shadow 180ms ease;
}

.sidebar.collapsed {
  width: 76px;
  align-items: center;
  gap: 14px;
  padding: 16px 10px;
}

.sidebar.collapsed.hover-expanded {
  width: 280px;
  align-items: stretch;
  gap: 16px;
  padding: 18px 14px;
  box-shadow: 22px 0 72px rgba(0, 0, 0, 0.26), var(--askme-shadow);
}

.brand {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 0 12px;
}

.compact .brand {
  justify-content: center;
  flex-direction: column;
  padding-bottom: 8px;
}

.brand-logo {
  flex: 1 1 100%;
  width: 100% !important;
  inline-size: 100%;
  max-width: calc(100% - 46px);
  height: auto;
  display: block;
  object-fit: contain;
  filter: drop-shadow(0 12px 28px rgba(32, 242, 182, 0.12));
}

.brand-logo-icon {
  flex: 0 0 auto;
  width: 42px !important;
  inline-size: 42px;
  height: 42px;
}

.collapse-toggle {
  flex: 0 0 auto;
  align-self: center;
}

.orbit-card {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 6px;
  padding: 12px;
  border: 1px solid rgba(32, 242, 182, 0.2);
  border-radius: 8px;
  background: rgba(32, 242, 182, 0.055);
}

.orbit-card strong,
.orbit-card span {
  display: block;
}

.orbit-card strong {
  font-size: 13px;
  color: var(--askme-ink);
}

.orbit-card span {
  font-size: 11px;
  color: var(--askme-muted);
}

.orbit-core {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: radial-gradient(circle, #20f2b6 0 28%, rgba(32, 242, 182, 0.2) 31% 100%);
  box-shadow: 0 0 28px rgba(32, 242, 182, 0.45);
  animation: askme-pulse 2.8s ease-in-out infinite;
}

.nav-list {
  width: 100%;
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  background: transparent;
}

.nav-list :deep(.v-list-item) {
  margin-bottom: 4px;
  border-radius: 8px !important;
  color: var(--askme-muted);
  transition: transform 180ms ease, background 180ms ease, color 180ms ease;
}

.nav-list :deep(.v-list-item:hover) {
  transform: translateX(4px);
  background: var(--askme-hover-surface);
  color: var(--askme-ink);
}

.nav-list :deep(.v-list-item--active) {
  background: var(--askme-active-surface);
  color: var(--askme-active-ink);
  border: 1px solid var(--askme-border-strong);
  box-shadow: 0 0 28px rgba(32, 242, 182, 0.11);
}

.compact .orbit-card {
  justify-content: center;
  margin: 0;
  padding: 10px;
}

.compact .nav-list :deep(.v-list-item) {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding-inline: 0 !important;
}

.compact .nav-list :deep(.v-list-item__prepend) {
  width: 100%;
  display: flex;
  justify-content: center;
  margin-inline-end: 0 !important;
}

.compact .nav-list :deep(.v-list-item__prepend > .v-icon) {
  margin-inline-end: 0 !important;
}

.compact .nav-list :deep(.v-list-item__spacer),
.compact .nav-list :deep(.v-list-item__content),
.compact .nav-list :deep(.v-list-item-title) {
  display: none;
}

.compact .nav-list :deep(.v-list-item:hover) {
  transform: translateX(0);
}

.sidebar-footer {
  padding: 12px 8px;
  border-top: 1px solid var(--askme-border);
}

.compact .sidebar-footer {
  width: 100%;
  display: grid;
  justify-items: center;
  padding: 10px 0 0;
}

.user-email {
  margin-bottom: 10px;
  font-size: 12px;
  color: var(--askme-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 960px) {
  .sidebar {
    position: static;
    height: auto;
    border-right: 0;
    border-bottom: 1px solid rgba(15, 23, 42, 0.1);
  }
}
</style>
