<template>
  <section class="dataset-workbench">
    <div class="hero-panel">
      <div class="hero-copy">
        <p class="eyebrow">AskMe Studio / Dataset Intelligence</p>
        <h1>Explorer votre Base de Donées</h1>
        <p>Inspectez les schémas, relations et aperçus de données.</p>
      </div>

      <div class="hero-controls">
        <v-btn
          v-if="fromWorkflow"
          class="workflow-back"
          size="small"
          variant="tonal"
          prepend-icon="mdi-arrow-left"
          :to="{ path: '/datasources', query: { step: 'explore' } }"
        >
          Retour workflow
        </v-btn>
        <v-select
          :model-value="activeDatasourceId"
          :items="datasourceOptions"
          class="source-select"
          label="Datasource"
          placeholder="Choose datasource"
          variant="outlined"
          density="compact"
          hide-details
          prepend-inner-icon="mdi-database-search-outline"
          @update:model-value="changeDatasource"
        />
        <v-select
          v-if="schemaOptions.length"
          :model-value="selectedSchema"
          :items="schemaOptions"
          class="schema-select"
          label="Schéma / datasource logique"
          placeholder="Choisir un schéma"
          variant="outlined"
          density="compact"
          hide-details
          @update:model-value="changeSchema"
        />
        <v-btn class="refresh-button" size="small" variant="tonal" :loading="explorer.loadingSchema" @click="refreshSchema">
          <v-icon start>mdi-refresh</v-icon>
          Refresh
        </v-btn>
      </div>
    </div>

    <div v-if="!activeDatasourceId" class="empty-state">
      <div class="empty-orb"><v-icon size="48">mdi-database-plus-outline</v-icon></div>
      <h2>Select or connect a datasource</h2>
      <p>The schema explorer needs an active datasource before it can build the relation graph.</p>
      <v-btn color="primary" rounded="xl" prepend-icon="mdi-plus" @click="router.push('/datasources')">
        Add datasource
      </v-btn>
    </div>

    <v-alert v-else-if="explorer.error" class="workbench-alert" type="warning" variant="tonal">
      {{ explorer.error }} A demo schema is shown while the real datasource is unavailable.
    </v-alert>

    <div v-if="activeDatasourceId" class="stats-strip">
      <div>
        <small>Schéma actif</small>
        <strong>{{ selectedSchema || 'N/A' }}</strong>
      </div>
      <div>
        <small>Tables</small>
        <strong>{{ explorer.schemaStats.tables }}</strong>
      </div>
      <div>
        <small>Columns</small>
        <strong>{{ explorer.schemaStats.columns }}</strong>
      </div>
      <div>
        <small>Relationships</small>
        <strong>{{ explorer.schemaStats.relationships }}</strong>
      </div>
      <div>
        <small>Fact tables</small>
        <strong>{{ explorer.schemaStats.facts }}</strong>
      </div>
    </div>

    <div v-if="activeDatasourceId && explorer.loadingSchema" class="loading-layout">
      <v-skeleton-loader type="card, list-item-three-line, list-item-three-line" />
      <v-skeleton-loader type="image, article" />
      <v-skeleton-loader type="card, table" />
    </div>

    <div
      v-else-if="activeDatasourceId"
      ref="explorerLayoutRef"
      class="explorer-layout"
      :class="{ 'explorer-layout--fullscreen': isFullscreen }"
    >
      <SchemaExplorerPanel
        v-model:search-term="explorer.searchTerm"
        :tables="explorer.filteredTables"
        :selected-table-name="explorer.selectedTableName"
        :expanded-tables="explorer.expandedTables"
        @select-table="selectTable"
        @toggle-table="explorer.toggleExpanded"
      />

      <main class="graph-stage">
        <div class="graph-toolbar">
          <div>
            <p class="eyebrow">Relation Graph</p>
            <h2>{{ explorer.selectedTableName || 'Schema graph' }}</h2>
            <span class="graph-subtitle">
              {{ explorer.schemaStats.relationships }} relations detectees / layout schema en etoile
            </span>
          </div>
          <div class="toolbar-actions">
            <v-text-field
              v-model="explorer.searchTerm"
              class="graph-search"
              density="compact"
              variant="outlined"
              placeholder="Search graph"
              prepend-inner-icon="mdi-magnify"
              hide-details
              clearable
            />
            <v-btn icon="mdi-fit-to-page-outline" variant="text" :title="'Fit graph'" @click="fitGraph" />
            <v-btn
              :icon="explorer.compactNodes ? 'mdi-view-comfy-outline' : 'mdi-view-compact-outline'"
              variant="text"
              :title="'Toggle compact nodes'"
              @click="toggleCompact"
            />
            <v-btn
              :icon="isFullscreen ? 'mdi-fullscreen-exit' : 'mdi-fullscreen'"
              variant="text"
              :aria-label="isFullscreen ? 'Quitter le plein ecran' : 'Afficher en plein ecran'"
              :title="isFullscreen ? 'Quitter le plein ecran' : 'Afficher en plein ecran'"
              @click="toggleFullscreen"
            />
          </div>
        </div>

        <div ref="flowShellRef" class="flow-shell">
          <VueFlow
            :nodes="explorer.graphNodes"
            :edges="explorer.graphEdges"
            :node-types="nodeTypes"
            :default-viewport="{ x: 40, y: 40, zoom: 0.86 }"
            :min-zoom="0.25"
            :max-zoom="1.6"
            fit-view-on-init
            class="schema-flow"
            @node-click="handleNodeClick"
            @edge-click="handleEdgeClick"
            @pane-ready="fitGraph"
          >
            <Background :gap="28" :size="1.2" :color="flowBackgroundColor" />
            <MiniMap
              pannable
              zoomable
              class="schema-minimap"
              :node-color="miniMapNodeColor"
              :mask-color="miniMapMaskColor"
            />
            <Controls class="schema-controls" />
          </VueFlow>

          <v-alert
            v-if="!explorer.schemaStats.relationships"
            class="no-relations-alert"
            type="info"
            variant="tonal"
            density="compact"
          >
            Aucune relation FK detectee. Ajoutez des contraintes FOREIGN KEY ou utilisez des colonnes *_id / *_key pour permettre l'inference automatique.
          </v-alert>

          <div
            v-if="contextMenu.open"
            class="node-context-menu"
            :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
            @click.stop
          >
            <p>{{ contextMenu.tableName }}</p>
            <button type="button" @click="openPreviewPopup(contextMenu.tableName)">
              <v-icon size="17">mdi-table-eye</v-icon>
              Afficher les donnees
            </button>
            <button type="button" @click="askAiFromContext">
              <v-icon size="17">mdi-creation</v-icon>
              Demander a AskMe Copilot
            </button>
          </div>

          <RelationshipDetailsPanel
            :relationship="explorer.selectedRelationship"
            @close="explorer.selectRelationship(null)"
          />
        </div>
      </main>

      <section v-if="previewDialogOpen" class="preview-floating-window" aria-label="Table data popup">
        <div class="preview-floating-bar">
          <div class="preview-floating-title">
            <v-icon icon="mdi-table-eye" size="18" />
            <strong>{{ explorer.selectedTable?.name || 'Data Preview' }}</strong>
          </div>
          <div class="preview-tags" aria-label="Table metadata">
            <v-chip
              v-for="tag in previewTags"
              :key="tag.label"
              size="small"
              variant="tonal"
              class="preview-tag"
            >
              {{ tag.label }}: {{ tag.value }}
            </v-chip>
          </div>
          <v-btn
            v-if="explorer.selectedTable"
            icon="mdi-creation"
            variant="text"
            size="small"
            aria-label="Demander a AskMe Copilot"
            title="Demander a AskMe Copilot"
            @click="askAiAboutTable(explorer.selectedTable.name)"
          />
          <v-btn icon="mdi-close" variant="text" size="small" aria-label="Fermer l'aperçu" @click="closePreviewPopup" />
        </div>
        <DataPreviewGrid
          compact
          class="preview-floating-grid"
          :table="explorer.selectedTable"
          :preview="explorer.preview"
          :loading="explorer.loadingPreview"
          @ask-ai="askAiAboutTable"
        />
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useTheme } from 'vuetify';
import { VueFlow, useVueFlow } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import { MiniMap } from '@vue-flow/minimap';
import type { EdgeMouseEvent, NodeMouseEvent } from '@vue-flow/core';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import '@vue-flow/controls/dist/style.css';
import '@vue-flow/minimap/dist/style.css';
import SchemaExplorerPanel from '../schema/SchemaExplorerPanel.vue';
import TableNode from '../schema/TableNode.vue';
import RelationshipDetailsPanel from '../schema/RelationshipDetailsPanel.vue';
import DataPreviewGrid from '../schema/DataPreviewGrid.vue';
import { useDatasourceStore } from '../../stores/datasource.store';
import { useDatasetExplorerStore } from '../../stores/datasetExplorer.store';

const route = useRoute();
const router = useRouter();
const datasource = useDatasourceStore();
const explorer = useDatasetExplorerStore();
const { fitView } = useVueFlow();
const theme = useTheme();
const previewDialogOpen = ref(false);
const flowShellRef = ref<HTMLElement | null>(null);
const explorerLayoutRef = ref<HTMLElement | null>(null);
const isFullscreen = ref(false);
const contextMenu = reactive({
  open: false,
  x: 0,
  y: 0,
  tableName: ''
});

const nodeTypes = {
  tableNode: markRaw(TableNode)
};

const activeDatasourceId = computed(() => {
  const sourceId = route.params.sourceId;
  if (typeof sourceId === 'string' && sourceId && sourceId !== 'default') return sourceId;
  return datasource.selectedId;
});

const querySchema = computed(() => {
  const value = route.query.schema;
  return typeof value === 'string' ? value : '';
});
const fromWorkflow = computed(() => route.query.from === 'workflow');

const datasourceOptions = computed(() =>
  datasource.items.map((item) => ({
    title: item.name,
    value: item.id
  }))
);

const schemaOptions = computed(() => {
  return explorer.availableSchemas.map((schema) => ({
    title: `${schema} schema`,
    value: schema
  }));
});

const selectedSchema = computed(() => explorer.schemaFilter);
const previewTags = computed(() => {
  const table = explorer.selectedTable;
  if (!table) return [];

  const primaryKey = table.columns.find((column) => column.isPrimaryKey)?.name || 'None';
  const foreignKeyCount = table.columns.filter((column) => column.isForeignKey).length;
  const rowCount = explorer.preview?.metadata.rowCount ?? table.rowCount ?? 'N/A';

  return [
    { label: 'Schema', value: table.schema || 'public' },
    { label: 'Columns', value: String(table.columns.length) },
    { label: 'Rows', value: String(rowCount) },
    { label: 'PK', value: primaryKey },
    { label: 'FK', value: String(foreignKeyCount) }
  ];
});

const isDark = computed(() => theme.global.current.value.dark);
const flowBackgroundColor = computed(() => (isDark.value ? 'rgba(151, 255, 221, 0.16)' : 'rgba(15, 23, 42, 0.14)'));
const miniMapNodeColor = computed(() => (isDark.value ? 'rgba(32, 242, 182, 0.72)' : 'rgba(14, 164, 114, 0.72)'));
const miniMapMaskColor = computed(() => (isDark.value ? 'rgba(3, 7, 13, 0.34)' : 'rgba(245, 251, 252, 0.42)'));

const loadActiveSchema = async () => {
  if (!activeDatasourceId.value) return;
  await explorer.loadSchema(activeDatasourceId.value);
  if (querySchema.value && explorer.availableSchemas.includes(querySchema.value)) {
    explorer.setSchemaFilter(querySchema.value);
  }
  if (explorer.schemaFilter && route.query.schema !== explorer.schemaFilter) {
    await router.replace({
      query: {
        ...route.query,
        schema: explorer.schemaFilter
      }
    });
  }
  await nextTick();
  fitGraph();
};

onMounted(async () => {
  window.addEventListener('askme:schema-node-context', handleNodeContextMenu as EventListener);
  window.addEventListener('click', closeContextMenu);
  window.addEventListener('keydown', handleKeydown);
  document.addEventListener('fullscreenchange', handleFullscreenChange);
  if (!datasource.items.length) {
    await datasource.fetchAll();
  }
  await loadActiveSchema();
});

onBeforeUnmount(() => {
  window.removeEventListener('askme:schema-node-context', handleNodeContextMenu as EventListener);
  window.removeEventListener('click', closeContextMenu);
  window.removeEventListener('keydown', handleKeydown);
  document.removeEventListener('fullscreenchange', handleFullscreenChange);
});

watch(
  () => activeDatasourceId.value,
  async (value, previous) => {
    if (!value || value === previous) return;
    await loadActiveSchema();
  }
);

watch(
  () => querySchema.value,
  (value) => {
    if (!value || !explorer.availableSchemas.includes(value) || value === explorer.schemaFilter) return;
    explorer.setSchemaFilter(value);
    void nextTick().then(fitGraph);
  }
);

const refreshSchema = async () => {
  await loadActiveSchema();
};

const changeDatasource = async (value: string) => {
  if (!value) return;
  datasource.setSelected(value);
  await router.push({
    path: `/datasets/${value}`,
    query: fromWorkflow.value ? { from: 'workflow' } : {}
  });
};

const changeSchema = async (schema: string | null) => {
  if (!schema) return;
  explorer.setSchemaFilter(schema);
  await router.replace({
    query: {
      ...route.query,
      schema
    }
  });
  await nextTick();
  fitGraph();
};

const selectTable = async (tableName: string) => {
  await explorer.selectTable(tableName);
  await nextTick();
  fitGraph();
};

const handleNodeClick = async (event: NodeMouseEvent) => {
  await selectTable(event.node.id);
};

const handleEdgeClick = (event: EdgeMouseEvent) => {
  explorer.selectRelationship(event.edge.data || null);
  closeContextMenu();
};

const fitGraph = () => {
  window.requestAnimationFrame(() => {
    fitView({ padding: 0.18, duration: 650, maxZoom: 1.08 });
  });
};

const toggleCompact = () => {
  explorer.toggleCompactNodes();
  fitGraph();
};

const toggleFullscreen = async () => {
  closeContextMenu();
  const layout = explorerLayoutRef.value;

  if (!isFullscreen.value) {
    if (layout?.requestFullscreen) {
      try {
        await layout.requestFullscreen();
      } catch {
        isFullscreen.value = true;
      }
    } else {
      isFullscreen.value = true;
    }
  } else if (document.fullscreenElement) {
    await document.exitFullscreen();
  } else {
    isFullscreen.value = false;
  }

  await nextTick();
  fitGraph();
};

const handleFullscreenChange = () => {
  isFullscreen.value = document.fullscreenElement === explorerLayoutRef.value;
  void nextTick().then(fitGraph);
};

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key !== 'Escape') return;
  if (previewDialogOpen.value) {
    closePreviewPopup();
    return;
  }
  if (!isFullscreen.value || document.fullscreenElement) return;
  isFullscreen.value = false;
  closeContextMenu();
  void nextTick().then(fitGraph);
};

const handleNodeContextMenu = async (event: Event) => {
  const customEvent = event as CustomEvent<{ tableName: string; x: number; y: number }>;
  const shell = flowShellRef.value;
  const rect = shell?.getBoundingClientRect();
  const margin = 14;
  const menuWidth = 286;
  const menuHeight = 132;
  const localX = rect ? customEvent.detail.x - rect.left : customEvent.detail.x;
  const localY = rect ? customEvent.detail.y - rect.top : customEvent.detail.y;
  const maxX = rect ? rect.width - menuWidth - margin : window.innerWidth - menuWidth - margin;
  const maxY = rect ? rect.height - menuHeight - margin : window.innerHeight - menuHeight - margin;

  contextMenu.tableName = customEvent.detail.tableName;
  contextMenu.x = Math.max(margin, Math.min(localX, maxX));
  contextMenu.y = Math.max(margin, Math.min(localY, maxY));
  contextMenu.open = true;
  await explorer.selectTable(customEvent.detail.tableName);
};

const closeContextMenu = () => {
  contextMenu.open = false;
};

const openPreviewPopup = async (tableName: string) => {
  closeContextMenu();
  await explorer.selectTable(tableName, true);
  previewDialogOpen.value = true;
};

const closePreviewPopup = () => {
  previewDialogOpen.value = false;
};

const askAiFromContext = async () => {
  const tableName = contextMenu.tableName;
  closeContextMenu();
  await askAiAboutTable(tableName);
};

const askAiAboutTable = async (tableName: string) => {
  const query = new URLSearchParams({
    datasourceId: activeDatasourceId.value || '',
    table: tableName,
    prompt: `Explain the table ${tableName} and suggest useful BI questions.`
  });
  if (fromWorkflow.value) query.set('from', 'workflow');
  await router.push(`/workspace?${query.toString()}`);
};
</script>

<style scoped>
.dataset-workbench {
  position: relative;
  display: grid;
  gap: 10px;
  min-height: 0;
  color: var(--askme-ink);
}

.hero-panel {
  position: relative;
  display: flex;
  min-height: 68px;
  max-height: 80px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  overflow: hidden;
  padding: 10px 14px 10px 18px;
  border: 1px solid var(--askme-border);
  border-radius: 18px;
  background:
    var(--askme-panel-gradient);
  box-shadow: var(--askme-shadow);
  backdrop-filter: blur(24px);
}

.hero-panel::after {
  display: none;
}

.hero-copy,
.hero-controls {
  position: relative;
  z-index: 1;
}

.eyebrow {
  margin: 0 0 2px;
  color: var(--askme-primary);
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.hero-copy {
  min-width: 240px;
}

.hero-copy h1 {
  overflow: hidden;
  max-width: 760px;
  margin: 0;
  font-size: 22px;
  line-height: 1.1;
  letter-spacing: -0.03em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hero-copy p:last-child {
  overflow: hidden;
  max-width: 680px;
  margin: 2px 0 0;
  color: var(--askme-muted);
  font-size: 12px;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hero-controls {
  display: flex;
  width: min(680px, 62%);
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.source-select,
.schema-select {
  min-width: 180px;
  flex: 1 1 190px;
}

.source-select :deep(.v-field) {
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.045);
}

.refresh-button {
  flex: 0 0 auto;
  justify-self: end;
  color: var(--askme-ink) !important;
  border: 1px solid var(--askme-border) !important;
  background: rgba(32, 242, 182, 0.1) !important;
}

.workflow-back {
  flex: 0 0 auto;
}

.empty-state,
.loading-layout,
.explorer-layout,
.stats-strip,
.workbench-alert {
  animation: rise-in 420ms ease both;
}

.empty-state {
  display: grid;
  min-height: 520px;
  place-content: center;
  justify-items: center;
  padding: 30px;
  color: var(--askme-muted);
  text-align: center;
  border: 1px solid var(--askme-border);
  border-radius: 34px;
  background: var(--askme-panel-gradient);
  box-shadow: var(--askme-shadow);
}

.empty-orb {
  display: grid;
  width: 92px;
  height: 92px;
  place-items: center;
  color: var(--askme-primary);
  border: 1px solid var(--askme-border-strong);
  border-radius: 32px;
  background: rgba(32, 242, 182, 0.1);
  box-shadow: var(--askme-glow);
}

.empty-state h2 {
  margin: 18px 0 8px;
  color: var(--askme-ink);
  font-size: 32px;
  letter-spacing: -0.05em;
}

.empty-state p {
  max-width: 520px;
  margin: 0 0 20px;
}

.stats-strip {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}

.stats-strip > div {
  padding: 8px 12px;
  border: 1px solid rgba(151, 255, 221, 0.12);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.045);
  backdrop-filter: blur(16px);
}

.stats-strip small,
.stats-strip strong {
  display: block;
}

.stats-strip small {
  color: var(--askme-muted);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.stats-strip strong {
  margin-top: 3px;
  color: var(--askme-ink);
  font-size: 17px;
  letter-spacing: -0.04em;
}

.loading-layout,
.explorer-layout {
  position: relative;
  display: grid;
  grid-template-columns: 330px minmax(0, 1fr);
  gap: 12px;
  height: clamp(620px, calc(100vh - 240px), 860px);
  min-height: 620px;
}

.explorer-layout--fullscreen,
.explorer-layout:fullscreen {
  position: fixed;
  inset: 0;
  z-index: 4000;
  width: 100vw;
  height: 100vh;
  min-height: 0;
  padding: 16px;
  overflow: hidden;
  background:
    radial-gradient(circle at 12% 14%, rgba(32, 242, 182, 0.16), transparent 34%),
    radial-gradient(circle at 82% 72%, rgba(103, 232, 249, 0.1), transparent 32%),
    var(--askme-bg);
}

.explorer-layout--fullscreen .graph-stage,
.explorer-layout:fullscreen .graph-stage {
  min-height: 0;
  border-radius: 28px;
}

.graph-stage {
  display: flex;
  min-width: 0;
  height: 100%;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--askme-border);
  border-radius: 34px;
  background:
    radial-gradient(circle at 20% 10%, rgba(32, 242, 182, 0.1), transparent 30%),
    radial-gradient(circle at 72% 70%, rgba(103, 232, 249, 0.08), transparent 34%),
    var(--askme-panel-gradient);
  box-shadow: var(--askme-shadow);
}

.graph-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 18px 20px;
  border-bottom: 1px solid rgba(151, 255, 221, 0.12);
}

.graph-toolbar h2 {
  margin: 0;
  font-size: 25px;
  letter-spacing: -0.04em;
}

.graph-subtitle {
  display: inline-flex;
  margin-top: 5px;
  color: var(--askme-muted);
  font-size: 12px;
  font-weight: 800;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.graph-search {
  width: 220px;
}

.graph-search :deep(.v-field) {
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.045);
}

.flow-shell {
  position: relative;
  min-height: 0;
  flex: 1;
}

.schema-flow {
  width: 100%;
  height: 100%;
}

.schema-flow :deep(.vue-flow__edge-path) {
  filter: drop-shadow(0 0 10px rgba(32, 242, 182, 0.22));
}

.schema-flow :deep(.vue-flow__edge.selected .vue-flow__edge-path) {
  stroke: var(--askme-primary);
  filter: drop-shadow(0 0 12px rgba(32, 242, 182, 0.42));
}

.schema-flow :deep(.vue-flow__edge-textbg) {
  fill: var(--askme-panel-strong);
  stroke: var(--askme-border);
}

.schema-flow :deep(.vue-flow__edge-text) {
  fill: var(--askme-ink);
  font-weight: 900;
}

.schema-minimap {
  overflow: hidden;
  border: 1px solid rgba(151, 255, 221, 0.15);
  border-radius: 18px;
  background: var(--askme-panel-strong);
}

.schema-controls {
  overflow: hidden;
  border: 1px solid rgba(151, 255, 221, 0.14);
  border-radius: 16px;
  background: var(--askme-panel-strong);
}

.schema-controls :deep(button) {
  color: var(--askme-ink);
  border-bottom-color: var(--askme-border);
  background: var(--askme-panel-strong);
}

.no-relations-alert {
  position: absolute;
  right: 20px;
  top: 20px;
  z-index: 6;
  max-width: 470px;
  border: 1px solid var(--askme-border);
  backdrop-filter: blur(18px);
}

.node-context-menu {
  position: absolute;
  z-index: 5000;
  width: 286px;
  padding: 10px;
  color: var(--askme-ink);
  border: 1px solid var(--askme-border-strong);
  border-radius: 20px;
  background: var(--askme-panel-gradient);
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.34), var(--askme-glow);
  backdrop-filter: blur(22px);
}

.node-context-menu p {
  margin: 0 0 8px;
  padding: 8px 10px;
  overflow: hidden;
  color: var(--askme-muted);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.node-context-menu button {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 9px;
  padding: 11px 12px;
  color: var(--askme-ink);
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  text-align: left;
  border: 0;
  border-radius: 14px;
  background: transparent;
  cursor: pointer;
  transition: background 160ms ease, transform 160ms ease;
}

.node-context-menu button:hover {
  background: var(--askme-hover-surface);
  transform: translateX(2px);
}

.preview-floating-window {
  position: absolute;
  right: 22px;
  bottom: 22px;
  z-index: 7000;
  display: flex;
  width: min(1120px, calc(100% - 44px));
  height: min(620px, calc(100% - 44px));
  min-height: 420px;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  overflow: hidden;
  border: 1px solid var(--askme-border);
  border-radius: 24px;
  background: var(--askme-panel-gradient);
  box-shadow: 0 30px 90px rgba(0, 0, 0, 0.36), var(--askme-shadow);
  backdrop-filter: blur(24px);
}

.explorer-layout--fullscreen .preview-floating-window,
.explorer-layout:fullscreen .preview-floating-window {
  width: min(1320px, calc(100% - 48px));
  height: min(760px, calc(100% - 48px));
}

.preview-floating-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 38px;
}

.preview-floating-title {
  display: inline-flex;
  min-width: 180px;
  max-width: 280px;
  align-items: center;
  gap: 8px;
  color: var(--askme-ink);
}

.preview-floating-title strong {
  overflow: hidden;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-tags {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-wrap: nowrap;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 1px;
}

.preview-tag {
  max-width: 230px;
  flex: 0 0 auto;
  border: 1px solid rgba(151, 255, 221, 0.12) !important;
  background: rgba(32, 242, 182, 0.08) !important;
}

.preview-floating-grid {
  min-height: 0;
  flex: 1;
}

@keyframes rise-in {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 1440px) {
  .loading-layout,
  .explorer-layout {
    grid-template-columns: 310px minmax(0, 1fr);
  }
}

@media (max-width: 1180px) {
  .loading-layout,
  .explorer-layout {
    grid-template-columns: 1fr;
  }

  .hero-panel {
    max-height: none;
    flex-wrap: wrap;
  }

  .hero-controls {
    width: 100%;
  }

  .stats-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .graph-stage {
    min-height: 680px;
  }

  .loading-layout,
  .explorer-layout {
    height: auto;
  }

  .explorer-layout--fullscreen,
  .explorer-layout:fullscreen {
    grid-template-columns: 1fr;
    height: 100vh;
    overflow: auto;
  }

  .explorer-layout--fullscreen .graph-stage,
  .explorer-layout:fullscreen .graph-stage {
    min-height: 680px;
  }

  .preview-floating-window {
    position: fixed;
    right: 16px;
    bottom: 16px;
    width: calc(100vw - 32px);
    height: min(74vh, 720px);
  }

  .preview-floating-bar {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .preview-tags {
    order: 3;
    flex-basis: 100%;
  }
}

@media (max-width: 720px) {
  .dataset-workbench {
    gap: 14px;
  }

  .hero-panel,
  .graph-toolbar {
    padding: 12px;
  }

  .graph-toolbar,
  .toolbar-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .graph-search,
  .toolbar-actions {
    width: 100%;
  }

  .stats-strip {
    grid-template-columns: 1fr;
  }
}
</style>
