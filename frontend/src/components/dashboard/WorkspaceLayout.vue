<template>
  <div class="workspace-chat-page" :class="{ 'history-open': historyOpen }">
    <aside class="history-slider" :class="{ open: historyOpen }">
      <div class="history-shell">
        <div class="slider-header">
          <div>
            <p class="eyebrow">Mémoire & Sessions</p>
            <h3>Historique des discussions</h3>
          </div>
          <v-btn icon="mdi-close" variant="text" @click="historyOpen = false" />
        </div>
        <QueryHistoryPanel @session-selected="onSessionSelected" />
      </div>
    </aside>

    <AIChatPanel
      has-history-drawer
      @open-datasource="datasourceDrawer = true"
      @open-history="historyOpen = !historyOpen"
    />

    <v-navigation-drawer
      v-model="datasourceDrawer"
      temporary
      :location="drawerLocation"
      width="520"
      class="datasource-slider"
    >
      <div class="slider-shell">
        <div class="slider-header">
          <div>
            <p class="eyebrow">{{ t('workspace.sourceContext') }}</p>
            <h3>{{ t('workspace.sourceTitle') }}</h3>
          </div>
          <v-btn icon="mdi-close" variant="text" @click="datasourceDrawer = false" />
        </div>

        <section class="source-controls">
          <div>
            <p class="control-label">{{ t('workspace.activeSource') }}</p>
            <v-select
              v-model="selectedDatasourceId"
              :items="datasourceOptions"
              :loading="datasource.loading"
              item-title="label"
              item-value="value"
              density="compact"
              variant="solo-filled"
              hide-details
              prepend-inner-icon="mdi-database-outline"
              :placeholder="t('chat.selectDatasource')"
            />
          </div>

          <div>
            <p class="control-label">{{ t('workspace.providerTitle') }}</p>
            <v-select
              v-model="selectedTextToSqlProvider"
              :items="textToSqlProviderItems"
              item-title="label"
              item-value="value"
              density="compact"
              variant="solo-filled"
              hide-details
              prepend-inner-icon="mdi-brain"
            />
          </div>
        </section>

        <div class="source-list-header">
          <strong>{{ t('workspace.availableSources') }}</strong>
          <v-btn size="small" variant="text" prepend-icon="mdi-refresh" :loading="datasource.loading" @click="refreshDatasources">
            {{ t('history.refresh') }}
          </v-btn>
        </div>

        <v-alert v-if="datasource.error" type="error" variant="tonal" density="compact">
          {{ datasource.error }}
        </v-alert>

        <v-list v-if="datasource.items.length" class="source-list" density="comfortable">
          <v-list-item
            v-for="item in datasource.items"
            :key="item.id"
            :active="item.id === datasource.selectedId"
            rounded="lg"
            @click="selectDatasource(item.id)"
          >
            <template #prepend>
              <v-avatar size="34" color="primary" variant="tonal">
                <v-icon icon="mdi-database-outline" size="18" />
              </v-avatar>
            </template>
            <v-list-item-title>{{ item.name }}</v-list-item-title>
            <v-list-item-subtitle>{{ item.type.toUpperCase() }}</v-list-item-subtitle>
          </v-list-item>
        </v-list>

        <v-alert v-else type="info" variant="tonal" density="comfortable">
          {{ t('workspace.noSources') }}
        </v-alert>

        <v-btn to="/datasources" color="primary" variant="flat" prepend-icon="mdi-database-plus">
          {{ t('workspace.manageSources') }}
        </v-btn>
      </div>
    </v-navigation-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import AIChatPanel from '../chat/AIChatPanel.vue';
import QueryHistoryPanel from './QueryHistoryPanel.vue';
import { useCopilotStore } from '../../stores/copilot.store';
import { useDatasourceStore } from '../../stores/datasource.store';
import type { TextToSqlProvider } from '../../types';

const datasource = useDatasourceStore();
const copilot = useCopilotStore();
const route = useRoute();
const { locale, t } = useI18n();
const datasourceDrawer = ref(false);
const historyOpen = ref(false);
const drawerLocation = computed(() => (locale.value === 'ar' ? 'start' : 'end'));
const fromWorkflow = computed(() => route.query.from === 'workflow');
const datasourceOptions = computed(() =>
  datasource.items.map((item) => ({
    value: item.id,
    label: `${item.name} · ${item.type.toUpperCase()}`
  }))
);
const selectedDatasourceId = computed({
  get: () => datasource.selectedId,
  set: (value: string) => {
    if (!value) return;
    datasource.setSelected(value);
  }
});
const textToSqlProviderItems: Array<{ label: string; value: TextToSqlProvider }> = [
  { label: 'Groq', value: 'groq' },
  { label: 'OpenRouter', value: 'openrouter' },
  { label: 'Ollama local', value: 'ollama' },
  { label: 'Auto', value: 'auto' },
  { label: 'Static', value: 'static' }
];
const selectedTextToSqlProvider = computed<TextToSqlProvider>({
  get: () => copilot.textToSqlProvider,
  set: (provider) => copilot.setTextToSqlProvider(provider)
});

const refreshDatasources = async () => {
  await datasource.fetchAll();
};

const selectDatasource = (id: string) => {
  datasource.setSelected(id);
  datasourceDrawer.value = false;
};

const onSessionSelected = () => {
  if (typeof window !== 'undefined' && window.innerWidth < 768) {
    historyOpen.value = false;
  }
};

onMounted(async () => {
  if (!datasource.items.length) {
    await datasource.fetchAll();
  }
});
</script>

<style scoped>
.workspace-chat-page {
  position: relative;
  min-height: calc(100vh - 116px);
  overflow: hidden;
}

.eyebrow,
.slider-header h3 {
  margin: 0;
}

.eyebrow {
  color: var(--askme-secondary);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.slider-header h3 {
  color: var(--askme-ink);
}

.history-slider {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 25;
  width: min(440px, calc(100vw - 32px));
  transform: translateX(calc(-100% - 18px));
  opacity: 0;
  pointer-events: none;
  transition: transform 260ms ease, opacity 220ms ease;
}

.history-slider.open {
  transform: translateX(0);
  opacity: 1;
  pointer-events: auto;
}

.history-shell {
  height: 100%;
  display: grid;
  align-content: start;
  gap: 14px;
  padding: 18px;
  border: 1px solid var(--askme-border);
  border-radius: 8px;
  color: var(--askme-ink);
  background: var(--askme-sidebar-bg);
  box-shadow: 28px 0 80px rgba(0, 0, 0, 0.34);
  backdrop-filter: blur(24px);
  overflow-y: auto;
}

.datasource-slider {
  color: var(--askme-ink) !important;
  background: var(--askme-sidebar-bg) !important;
  border-left: 1px solid var(--askme-border);
  box-shadow: -28px 0 80px rgba(0, 0, 0, 0.34);
  backdrop-filter: blur(24px);
}

.slider-shell {
  min-height: 100%;
  display: grid;
  align-content: start;
  gap: 16px;
  padding: 18px;
}

.slider-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--askme-border);
}

.source-controls {
  display: grid;
  gap: 14px;
}

.control-label {
  margin: 0 0 6px;
  color: var(--askme-muted);
  font-size: 12px;
  font-weight: 800;
}

.source-controls :deep(.v-field),
.source-list {
  border: 1px solid var(--askme-border);
  border-radius: 8px;
  background: var(--askme-subtle-surface);
}

.source-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.source-list-header strong {
  color: var(--askme-ink);
  font-size: 13px;
}

.source-list {
  padding: 6px;
}

.source-list :deep(.v-list-item) {
  margin: 2px 0;
}

@media (max-width: 760px) {
  .workspace-context-bar {
    position: static;
    width: 100%;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 54px;
    padding: 4px;
    transform: none;
  }

  .datasource-select,
  .provider-select {
    flex: none;
  }

  .provider-select {
    grid-column: 1 / -1;
  }

  .datasource-edge-toggle {
    top: auto;
    right: 12px;
    bottom: 112px;
    border-radius: 8px !important;
  }
}
</style>
