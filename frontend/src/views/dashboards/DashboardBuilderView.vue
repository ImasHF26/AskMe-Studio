<template>
  <section class="dashboard-builder-studio" :class="{ 'focus-mode': focusMode }">
    <header class="builder-topbar">
      <div class="topbar-identity">
        <v-btn icon="mdi-arrow-left" size="small" variant="text" to="/dashboards" />
        <div>
          <span>{{ dashboard.current?.name || 'Tableau de bord' }}</span>
          <strong>{{ currentDashboardDatasourceLabel }}</strong>
        </div>
      </div>
      <div class="topbar-actions">
        <v-btn-toggle v-model="builderMode" class="mode-switch" mandatory divided density="compact">
          <v-btn value="edit" prepend-icon="mdi-pencil-outline">Édition</v-btn>
          <v-btn value="read" prepend-icon="mdi-eye-outline">Lecture</v-btn>
        </v-btn-toggle>
        <v-btn
          color="primary"
          size="small"
          prepend-icon="mdi-plus-box-multiple"
          :disabled="!dashboard.current || isReadMode"
          @click="openCreateWidgetModal"
        >
          Ajouter un widget
        </v-btn>
        <v-btn
          variant="tonal"
          size="small"
          prepend-icon="mdi-presentation-play"
          :disabled="!dashboard.current"
          :to="dashboard.current ? `/dashboards/${dashboard.current.id}/view` : undefined"
        >
          Visualiser
        </v-btn>
        <v-btn
          variant="tonal"
          size="small"
          :prepend-icon="focusMode ? 'mdi-fullscreen-exit' : 'mdi-fullscreen'"
          @click="focusMode = !focusMode"
        >
          Focus
        </v-btn>
        <v-btn
          variant="tonal"
          size="small"
          :loading="dashboard.saving || dashboard.loading"
          prepend-icon="mdi-content-save"
          @click="selectedWidget ? applyInspectorChanges() : reload()"
        >
          Sauvegarder
        </v-btn>
      </div>
    </header>

    <div
      class="builder-layout"
      :class="{
        'left-collapsed': leftPanelCollapsed || focusMode,
        'right-collapsed': rightPanelCollapsed || focusMode
      }"
    >
      <aside class="builder-sidebar left-sidebar" :class="{ collapsed: leftPanelCollapsed || focusMode }">
        <div class="panel-chrome">
          <v-btn
            :icon="leftPanelCollapsed ? 'mdi-chevron-right' : 'mdi-chevron-left'"
            size="small"
            variant="text"
            @click="leftPanelCollapsed = !leftPanelCollapsed"
          />
          <div>
            <span class="eyebrow">Assets</span>
            <h3>Palette</h3>
          </div>
        </div>
        <button
          v-for="item in paletteItems"
          :key="item.key"
          class="palette-item"
          :disabled="isReadMode"
          draggable="true"
          @dragstart="startPaletteDrag(item.key)"
          @click="addEmptyWidget(item.key)"
        >
          <v-icon :icon="item.icon" size="22" />
          <span v-if="!leftPanelCollapsed && !focusMode">
            <strong>{{ item.title }}</strong>
            <small>{{ item.description }}</small>
          </span>
        </button>
      </aside>

      <main
        class="builder-canvas-zone"
        :class="{ 'drop-active': isPaletteDragActive }"
        @dragover.prevent
        @dragenter="isPaletteDragActive = true"
        @dragleave="isPaletteDragActive = false"
        @drop="dropPaletteWidget"
      >
        <div class="canvas-mini-toolbar">
          <v-chip size="small" color="primary" variant="tonal" prepend-icon="mdi-grid">
            12 colonnes · 72px
          </v-chip>
          <v-spacer />
          <v-btn
            v-if="focusMode"
            size="small"
            variant="tonal"
            prepend-icon="mdi-fullscreen-exit"
            @click="focusMode = false"
          >
            Quitter Focus
          </v-btn>
          <v-btn
            size="small"
            variant="tonal"
            prepend-icon="mdi-view-dashboard-edit-outline"
            :disabled="isReadMode"
            @click="addEmptyWidget('bar')"
          >
            Widget rapide
          </v-btn>
        </div>
        <DashboardCanvas
          ref="canvasRef"
          :dashboard="dashboard.current"
          :selected-widget-id="selectedWidgetId"
          :readonly="isReadMode"
          :show-header="false"
          @select-widget="selectWidget"
          @feed-widget="openAskMeForWidget"
          @edit-widget="openEditWidgetModal"
          @delete-widget="removeWidget"
          @refresh-widget="refreshWidget"
          @update-widget-position="updateWidgetPosition"
        />
      </main>

      <aside class="builder-sidebar right-sidebar" :class="{ collapsed: rightPanelCollapsed || focusMode }">
        <div class="panel-chrome">
          <v-btn
            :icon="rightPanelCollapsed ? 'mdi-chevron-left' : 'mdi-chevron-right'"
            size="small"
            variant="text"
            @click="rightPanelCollapsed = !rightPanelCollapsed"
          />
          <div v-if="!rightPanelCollapsed && !focusMode">
            <span class="eyebrow">Inspector</span>
            <h3>Propriétés</h3>
          </div>
          <v-icon v-else icon="mdi-tune-variant" size="22" />
        </div>

        <template v-if="rightPanelCollapsed || focusMode">
          <div class="collapsed-rail">
            <v-btn icon="mdi-tune-variant" size="small" variant="tonal" @click="rightPanelCollapsed = false; focusMode = false" />
            <v-btn
              icon="mdi-creation"
              size="small"
              variant="text"
              :disabled="!selectedWidget"
              @click="selectedWidget && openAskMeForWidget(selectedWidget)"
            />
          </div>
        </template>

        <div v-else-if="isReadMode" class="readonly-inspector">
          <v-icon icon="mdi-eye-outline" size="42" />
          <p>Mode lecture actif. Passez en édition pour déplacer, redimensionner ou modifier les widgets.</p>
        </div>

        <div v-else-if="selectedWidget" class="inspector-content">
          <v-text-field v-model="inspectorTitle" label="Titre" variant="outlined" density="comfortable" />
          <v-select
            v-model="inspectorChartType"
            :items="chartTypeItems"
            label="Type de graphique"
            variant="outlined"
            density="comfortable"
            :disabled="selectedWidget.type === 'kpi' || selectedWidget.type === 'text'"
          />
          <div class="inspector-metrics">
            <div>
              <span>Type</span>
              <strong>{{ selectedWidget.type }}</strong>
            </div>
            <div>
              <span>Lignes</span>
              <strong>{{ selectedRowsCount }}</strong>
            </div>
            <div>
              <span>Exécution</span>
              <strong>{{ selectedExecutionMs }} ms</strong>
            </div>
          </div>

          <div class="layout-tools">
            <div class="tool-title">
              <span>Layout grid</span>
              <strong>Position & dimensions</strong>
            </div>
            <div class="position-grid">
              <v-text-field v-model.number="positionDraft.x" type="number" label="X" min="0" max="11" variant="outlined" density="compact" hide-details />
              <v-text-field v-model.number="positionDraft.y" type="number" label="Y" min="0" variant="outlined" density="compact" hide-details />
              <v-text-field v-model.number="positionDraft.w" type="number" label="W" min="2" max="12" variant="outlined" density="compact" hide-details />
              <v-text-field v-model.number="positionDraft.h" type="number" label="H" min="3" variant="outlined" density="compact" hide-details />
            </div>
            <v-btn block size="small" variant="tonal" prepend-icon="mdi-axis-arrow" @click="applyPositionDraft">
              Appliquer la position
            </v-btn>
            <div class="align-grid">
              <v-btn size="small" variant="text" prepend-icon="mdi-align-horizontal-left" @click="alignSelected('left')">Gauche</v-btn>
              <v-btn size="small" variant="text" prepend-icon="mdi-align-horizontal-center" @click="alignSelected('center')">Centre</v-btn>
              <v-btn size="small" variant="text" prepend-icon="mdi-align-horizontal-right" @click="alignSelected('right')">Droite</v-btn>
              <v-btn size="small" variant="text" prepend-icon="mdi-align-vertical-top" @click="alignSelected('top')">Haut</v-btn>
              <v-btn size="small" variant="text" prepend-icon="mdi-arrow-expand-horizontal" @click="alignSelected('full')">Pleine largeur</v-btn>
              <v-btn size="small" variant="text" prepend-icon="mdi-arrow-expand-vertical" @click="alignSelected('tall')">Plus haut</v-btn>
            </div>
          </div>

          <v-alert v-if="selectedIsEmpty" type="info" variant="tonal" density="compact">
            Ce widget est vide. Cliquez sur “Alimenter avec AskMe” pour générer le SQL et sauvegarder les données.
          </v-alert>
          <div v-if="selectedWidget.type === 'kpi'" class="kpi-color-tools">
            <span>Couleur KPI</span>
            <v-btn-toggle v-model="inspectorKpiColor" mandatory divided density="compact">
              <v-btn
                v-for="item in kpiColorItems"
                :key="item.value"
                :value="item.value"
                size="small"
                variant="text"
                :title="item.title"
              >
                <span class="kpi-color-swatch" :style="{ backgroundColor: item.hex }" />
              </v-btn>
            </v-btn-toggle>
          </div>
          <v-btn block color="primary" prepend-icon="mdi-creation" @click="openAskMeForWidget(selectedWidget)">
            Alimenter avec AskMe
          </v-btn>
          <v-btn block variant="tonal" prepend-icon="mdi-arrow-expand-horizontal" @click="alignSelected('full')">
            Pleine largeur
          </v-btn>
          <v-btn block variant="tonal" prepend-icon="mdi-content-duplicate" @click="duplicateSelectedWidget">
            Dupliquer
          </v-btn>
          <v-btn block variant="tonal" prepend-icon="mdi-content-save" @click="applyInspectorChanges">
            Appliquer les options
          </v-btn>
          <v-btn block variant="tonal" prepend-icon="mdi-refresh" @click="refreshWidget(selectedWidget)">
            Rafraîchir les données
          </v-btn>
          <v-btn block variant="tonal" prepend-icon="mdi-code-json" @click="openEditWidgetModal(selectedWidget)">
            Configuration avancée
          </v-btn>
          <v-btn block color="red-lighten-1" variant="tonal" prepend-icon="mdi-delete" @click="removeWidget(selectedWidget.id)">
            Supprimer
          </v-btn>
        </div>

        <div v-else class="empty-inspector">
          <v-icon icon="mdi-cursor-default-click-outline" size="42" />
          <p>Sélectionnez un widget sur le canvas pour modifier ses options.</p>
        </div>
      </aside>
    </div>

    <v-dialog v-model="askMeDialogOpen" max-width="1440" :height="'90vh'" scrollable>
      <v-card class="askme-widget-dialog" style="display:flex;flex-direction:column;height:100%;max-height:90vh;">
        <!-- Header fixe -->
        <v-card-title class="dialog-head pa-0">
          <div class="dialog-head-inner">
            <div class="dialog-head-info">
              <span class="eyebrow">AskMe Widget Copilot</span>
              <h3>Alimenter le widget</h3>
              <p>{{ feedTargetWidget?.title || 'Nouveau widget' }}</p>
            </div>
            <v-btn icon="mdi-close" variant="text" size="small" @click="askMeDialogOpen = false" />
          </div>
        </v-card-title>

        <!-- Corps scrollable -->
        <v-card-text class="dialog-body pa-0 flex-grow-1 overflow-y-auto">
          <DashboardStudioComposer
            class="dialog-composer"
            :disabled="!dashboard.current || !dashboard.current.datasourceId"
            :datasource-id="dashboard.current?.datasourceId || ''"
            :datasource-label="currentDashboardDatasourceLabel"
            :saving="dashboard.saving"
            :widget-count="dashboard.current?.widgets.length || 0"
            @save="saveStudioWidget"
          />
        </v-card-text>
      </v-card>
    </v-dialog>

    <WidgetEditorModal
      v-model="widgetModalOpen"
      :mode="editingWidget ? 'edit' : 'create'"
      :widget="editingWidget"
      :loading="dashboard.saving"
      @save="saveWidget"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { apiClient } from '../../services/api/client';
import DashboardCanvas from '../../components/dashboard/DashboardCanvas.vue';
import DashboardStudioComposer from '../../components/dashboard/DashboardStudioComposer.vue';
import WidgetEditorModal from '../../components/dashboard/WidgetEditorModal.vue';
import { useDashboardStore } from '../../stores/dashboard.store';
import { useDatasourceStore } from '../../stores/datasource.store';
import type { DashboardChartType, DashboardWidget, DashboardWidgetPosition, DashboardWidgetType, QueryExecuteResponse } from '../../types';
import { getAskMeSessionId } from '../../utils/askmeSession';

// Référence au composant DashboardCanvas pour accéder à getDropPosition()
const canvasRef = ref<InstanceType<typeof DashboardCanvas> | null>(null);

type PaletteKey = 'kpi' | 'bar' | 'line' | 'pie' | 'table' | 'text';

const route = useRoute();
const router = useRouter();
const dashboard = useDashboardStore();
const datasource = useDatasourceStore();

const selectedWidgetId = ref('');
const draggedPaletteKey = ref<PaletteKey | ''>('');
const leftPanelCollapsed = ref(false);
const rightPanelCollapsed = ref(false);
const focusMode = ref(false);
const isPaletteDragActive = ref(false);
const widgetModalOpen = ref(false);
const askMeDialogOpen = ref(false);
const editingWidget = ref<DashboardWidget | null>(null);
const feedTargetWidget = ref<DashboardWidget | null>(null);
const inspectorTitle = ref('');
const inspectorChartType = ref<DashboardChartType>('table');
const inspectorKpiColor = ref('sky');
const positionDraft = reactive<DashboardWidgetPosition>({
  x: 0,
  y: 0,
  w: 6,
  h: 6
});
const builderMode = ref<'edit' | 'read'>('edit');
const isReadMode = computed(() => builderMode.value === 'read');

const paletteItems: Array<{
  key: PaletteKey;
  title: string;
  description: string;
  icon: string;
  chartType: DashboardChartType;
  type: DashboardWidgetType;
}> = [
  { key: 'kpi', title: 'KPI', description: 'Indicateur synthétique', icon: 'mdi-counter', chartType: 'table', type: 'kpi' },
  { key: 'bar', title: 'Bar chart', description: 'Comparaison par catégorie', icon: 'mdi-chart-bar', chartType: 'bar', type: 'chart' },
  { key: 'line', title: 'Line chart', description: 'Évolution temporelle', icon: 'mdi-chart-line', chartType: 'line', type: 'chart' },
  { key: 'pie', title: 'Donut / Pie', description: 'Répartition et parts', icon: 'mdi-chart-donut', chartType: 'pie', type: 'chart' },
  { key: 'table', title: 'Tableau', description: 'Liste détaillée', icon: 'mdi-table', chartType: 'table', type: 'table' },
  { key: 'text', title: 'Narratif', description: 'Insight ou commentaire', icon: 'mdi-text-box-outline', chartType: 'table', type: 'text' }
];

const chartTypeItems = [
  { title: 'Tableau', value: 'table' },
  { title: 'Barres', value: 'bar' },
  { title: 'Donut / Pie', value: 'pie' },
  { title: 'Courbe', value: 'line' }
];

const kpiColorItems = [
  { title: 'Rouge', value: 'red', hex: '#dc2626' },
  { title: 'Orange', value: 'orange', hex: '#ea580c' },
  { title: 'Jaune', value: 'yellow', hex: '#ca8a04' },
  { title: 'Vert', value: 'green', hex: '#16a34a' },
  { title: 'Sky', value: 'sky', hex: '#0284c7' },
  { title: 'Bleu', value: 'blue', hex: '#2563eb' },
  { title: 'Marron', value: 'brown', hex: '#92400e' },
  { title: 'Noir', value: 'black', hex: '#111827' }
];

const routeDashboardId = computed(() => {
  const raw = route.params.dashboardId;
  return typeof raw === 'string' ? raw : '';
});

const selectedWidget = computed(() =>
  dashboard.current?.widgets.find((widget) => widget.id === selectedWidgetId.value) || null
);

const selectedRowsCount = computed(() => {
  const rows = selectedWidget.value?.config.rows;
  return Array.isArray(rows) ? rows.length : 0;
});

const selectedExecutionMs = computed(() => Number(selectedWidget.value?.config.executionMs || 0));
const selectedIsEmpty = computed(() => !selectedRowsCount.value && !selectedWidget.value?.query);

const datasourceName = (datasourceId: string) => {
  const item = datasource.items.find((candidate) => candidate.id === datasourceId);
  return item ? `${item.name}${item.schema ? ` (${item.schema})` : ''}` : datasourceId || 'Datasource inconnue';
};

const currentDashboardDatasourceLabel = computed(() =>
  dashboard.current?.datasourceId ? datasourceName(dashboard.current.datasourceId) : 'Aucune datasource liée'
);

let loadSequence = 0;

const ensureDashboardLoaded = async (targetId = routeDashboardId.value) => {
  const sequence = ++loadSequence;
  await datasource.fetchAll();
  await dashboard.fetchAll();

  if (!targetId || targetId === 'main') {
    await router.replace('/dashboards');
    return;
  }

  try {
    await dashboard.open(targetId);
    if (sequence !== loadSequence) return;
    selectedWidgetId.value = dashboard.current?.widgets[0]?.id || '';
  } catch (error) {
    await router.replace('/dashboards');
  }
};

watch(
  routeDashboardId,
  async (targetId) => {
    await ensureDashboardLoaded(targetId);
  },
  { immediate: true }
);

watch(selectedWidget, (widget) => {
  inspectorTitle.value = widget?.title || '';
  inspectorChartType.value = widget?.chartType || 'table';
  inspectorKpiColor.value = String(widget?.config.color || widget?.config.kpiColor || 'sky');
  positionDraft.x = widget?.position.x || 0;
  positionDraft.y = widget?.position.y || 0;
  positionDraft.w = widget?.position.w || 6;
  positionDraft.h = widget?.position.h || 6;
});

const reload = async () => {
  if (!dashboard.current?.id) return;
  await dashboard.open(dashboard.current.id);
};

const openCreateWidgetModal = () => {
  editingWidget.value = null;
  widgetModalOpen.value = true;
};

const startPaletteDrag = (key: PaletteKey) => {
  draggedPaletteKey.value = key;
  isPaletteDragActive.value = true;
};

const dropPaletteWidget = async (event: DragEvent) => {
  isPaletteDragActive.value = false;
  if (!draggedPaletteKey.value) return;
  const asset = paletteItems.find((item) => item.key === draggedPaletteKey.value);
  const size = getDefaultWidgetSize(asset?.key || draggedPaletteKey.value);
  // Utilise getDropPosition() exposée par DashboardCanvas pour un calcul
  // depuis le rect DOM réel du <GridLayout>, sans décalage toolbar/padding.
  const rawPosition = canvasRef.value?.getDropPosition(event, size);
  const dropPosition = rawPosition ? normalizeBuilderPosition(rawPosition) : undefined;
  await addEmptyWidget(draggedPaletteKey.value, dropPosition);
  draggedPaletteKey.value = '';
};

const addEmptyWidget = async (key: PaletteKey, preferredPosition?: DashboardWidgetPosition) => {
  if (!dashboard.current) return;
  const asset = paletteItems.find((item) => item.key === key);
  if (!asset) return;
  const position = nextWidgetPosition(key, preferredPosition);
  await dashboard.createWidget({
    title: `${asset.title} vide`,
    type: asset.type,
    chartType: asset.chartType,
    query: '',
    position,
    config: {
      datasourceId: dashboard.current.datasourceId,
      prompt: '',
      generatedSql: '',
      columns: [],
      rows: [],
      narrative: 'Widget vide. Alimentez-le avec AskMe pour générer les données.',
      chartConfig: {
        chartType: asset.chartType,
        recommendedChartType: asset.chartType,
        visualTheme: 'askme-premium'
      },
      color: asset.type === 'kpi' ? 'sky' : undefined,
      semanticContext: {
        confidence: 0,
        usedEntities: [],
        warnings: ['Widget non alimenté.']
      },
      isEmpty: true
    }
  });
  selectedWidgetId.value = dashboard.current?.widgets.at(-1)?.id || selectedWidgetId.value;
  rightPanelCollapsed.value = false;
};

const getDefaultWidgetSize = (key: PaletteKey): Pick<DashboardWidgetPosition, 'w' | 'h'> => {
  const sizes: Record<PaletteKey, Pick<DashboardWidgetPosition, 'w' | 'h'>> = {
    kpi: { w: 3, h: 3 },
    bar: { w: 6, h: 5 },
    line: { w: 6, h: 5 },
    pie: { w: 4, h: 5 },
    table: { w: 12, h: 6 },
    text: { w: 4, h: 3 }
  };
  return sizes[key];
};

const nextWidgetPosition = (key: PaletteKey, preferredPosition?: DashboardWidgetPosition): DashboardWidgetPosition => {
  const size = getDefaultWidgetSize(key);
  const start = normalizeBuilderPosition({
    x: preferredPosition?.x ?? 0,
    y: preferredPosition?.y ?? 0,
    w: preferredPosition?.w ?? size.w,
    h: preferredPosition?.h ?? size.h
  });

  return findAvailablePosition(start);
};

const findAvailablePosition = (start: DashboardWidgetPosition): DashboardWidgetPosition => {
  const widgets = dashboard.current?.widgets || [];
  const candidate = { ...start };

  for (let y = candidate.y; y < candidate.y + 120; y += 1) {
    for (let x = y === candidate.y ? candidate.x : 0; x <= 12 - candidate.w; x += 1) {
      const next = { ...candidate, x, y };
      if (!widgets.some((widget) => positionsOverlap(widget.position, next))) return next;
    }
  }

  const maxBottom = widgets.reduce((bottom, widget) => Math.max(bottom, widget.position.y + widget.position.h), 0);
  return { ...candidate, x: 0, y: maxBottom };
};

const positionsOverlap = (a: DashboardWidgetPosition, b: DashboardWidgetPosition) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

const selectWidget = (widget: DashboardWidget) => {
  selectedWidgetId.value = widget.id;
  rightPanelCollapsed.value = false;
};

const openAskMeForWidget = (widget: DashboardWidget) => {
  feedTargetWidget.value = widget;
  selectedWidgetId.value = widget.id;
  askMeDialogOpen.value = true;
};

const openEditWidgetModal = (widget: DashboardWidget) => {
  editingWidget.value = widget;
  selectedWidgetId.value = widget.id;
  widgetModalOpen.value = true;
};

const withDashboardDatasource = (config: Record<string, unknown>) => ({
  ...config,
  datasourceId: dashboard.current?.datasourceId || String(config.datasourceId || '')
});

const saveWidget = async (payload: {
  title: string;
  type: DashboardWidgetType;
  position: DashboardWidgetPosition;
  query: string;
  chartType: DashboardChartType;
  config: Record<string, unknown>;
}) => {
  if (!dashboard.current) return;
  const safePayload = {
    ...payload,
    config: withDashboardDatasource(payload.config)
  };

  if (editingWidget.value) {
    await dashboard.updateWidget(editingWidget.value.id, safePayload);
  } else {
    await dashboard.createWidget(safePayload);
  }

  widgetModalOpen.value = false;
  editingWidget.value = null;
};

const saveStudioWidget = async (payload: {
  title: string;
  type: DashboardWidgetType;
  position: DashboardWidgetPosition;
  query: string;
  chartType: DashboardChartType;
  config: Record<string, unknown>;
}) => {
  if (!dashboard.current) return;
  const safePayload = {
    ...payload,
    position: feedTargetWidget.value?.position || payload.position,
    type: feedTargetWidget.value?.type === 'kpi' ? 'kpi' : payload.type,
    chartType: feedTargetWidget.value?.type === 'kpi' ? 'table' : payload.chartType,
    config: {
      ...withDashboardDatasource(payload.config),
      ...(feedTargetWidget.value?.type === 'kpi'
        ? {
            color: String(feedTargetWidget.value.config.color || feedTargetWidget.value.config.kpiColor || 'sky'),
            value: resolveKpiValueFromRows(payload.config),
            caption: resolveKpiCaptionFromPayload(payload.config)
          }
        : {}),
      isEmpty: false
    }
  };

  if (feedTargetWidget.value) {
    await dashboard.updateWidget(feedTargetWidget.value.id, safePayload);
    selectedWidgetId.value = feedTargetWidget.value.id;
  } else {
    await dashboard.createWidget(safePayload);
  }
  askMeDialogOpen.value = false;
  feedTargetWidget.value = null;
};

const applyInspectorChanges = async () => {
  if (!selectedWidget.value) return;
  await dashboard.updateWidget(selectedWidget.value.id, {
    title: inspectorTitle.value.trim() || selectedWidget.value.title,
    chartType: inspectorChartType.value,
    type: inspectorChartType.value === 'table' ? 'table' : selectedWidget.value.type === 'kpi' ? 'kpi' : 'chart',
    config: {
      ...selectedWidget.value.config,
      chartConfig: {
        ...(typeof selectedWidget.value.config.chartConfig === 'object' && selectedWidget.value.config.chartConfig
          ? selectedWidget.value.config.chartConfig
          : {}),
        chartType: inspectorChartType.value
      },
      ...(selectedWidget.value.type === 'kpi' ? { color: inspectorKpiColor.value } : {})
    }
  });
};

const resolveKpiValueFromRows = (config: Record<string, unknown>) => {
  if (typeof config.value === 'number' || typeof config.value === 'string') return config.value;
  const rows = Array.isArray(config.rows) ? (config.rows as Array<Record<string, unknown>>) : [];
  const columns = Array.isArray(config.columns) ? config.columns.map(String) : [];
  const numericColumn = columns.find((column) => rows.some((row) => Number.isFinite(Number(row[column]))));
  const raw = rows[0]?.[numericColumn || columns[1] || columns[0] || ''];
  return typeof raw === 'number' || typeof raw === 'string' ? raw : rows.length;
};

const resolveKpiCaptionFromPayload = (config: Record<string, unknown>) => {
  if (typeof config.caption === 'string' && config.caption) return config.caption;
  const executionMs = Number(config.executionMs || 0);
  if (executionMs > 0) return `${executionMs} ms`;
  const rows = Array.isArray(config.rows) ? config.rows.length : 0;
  return rows > 0 ? `${rows} lignes` : 'KPI';
};

const removeWidget = async (widgetId: string) => {
  await dashboard.deleteWidget(widgetId);
  if (selectedWidgetId.value === widgetId) selectedWidgetId.value = dashboard.current?.widgets[0]?.id || '';
};

const duplicateSelectedWidget = async () => {
  if (!selectedWidget.value || !dashboard.current) return;
  const source = selectedWidget.value;
  const position = findAvailablePosition({
    ...source.position,
    x: Math.min(11, source.position.x + 1),
    y: source.position.y + 1
  });

  await dashboard.createWidget({
    title: `${source.title} copie`,
    type: source.type,
    chartType: source.chartType,
    query: source.query,
    position,
    config: {
      ...source.config,
      duplicatedFrom: source.id
    }
  });

  selectedWidgetId.value = dashboard.current.widgets.at(-1)?.id || selectedWidgetId.value;
};

const updateWidgetPosition = async (widgetId: string, position: DashboardWidgetPosition) => {
  const widget = dashboard.current?.widgets.find((candidate) => candidate.id === widgetId);
  await dashboard.updateWidget(widgetId, {
    position: normalizeBuilderPosition(position),
    config: widget
      ? {
          ...widget.config,
          layout: {
            ...(typeof widget.config.layout === 'object' && widget.config.layout ? widget.config.layout : {}),
            grid: {
              columns: 12,
              rowHeight: 72,
              margin: [16, 16]
            },
            updatedAt: new Date().toISOString()
          }
        }
      : undefined
  });
};

const normalizeBuilderPosition = (position: DashboardWidgetPosition): DashboardWidgetPosition => {
  const w = Math.min(12, Math.max(2, Number(position.w) || 6));
  const h = Math.max(3, Number(position.h) || 6);
  const x = Math.min(12 - w, Math.max(0, Number(position.x) || 0));
  const y = Math.max(0, Number(position.y) || 0);
  return { x, y, w, h };
};

const applyWidgetPosition = async (position: DashboardWidgetPosition) => {
  if (!selectedWidget.value) return;
  const normalized = normalizeBuilderPosition(position);
  positionDraft.x = normalized.x;
  positionDraft.y = normalized.y;
  positionDraft.w = normalized.w;
  positionDraft.h = normalized.h;
  await updateWidgetPosition(selectedWidget.value.id, normalized);
};

const applyPositionDraft = async () => {
  await applyWidgetPosition({ ...positionDraft });
};

const alignSelected = async (mode: 'left' | 'center' | 'right' | 'top' | 'full' | 'tall') => {
  if (!selectedWidget.value) return;
  const next = { ...selectedWidget.value.position };
  if (mode === 'left') next.x = 0;
  if (mode === 'center') next.x = Math.round((12 - next.w) / 2);
  if (mode === 'right') next.x = 12 - next.w;
  if (mode === 'top') next.y = 0;
  if (mode === 'full') {
    next.x = 0;
    next.w = 12;
  }
  if (mode === 'tall') next.h = Math.max(next.h + 2, 5);
  await applyWidgetPosition(next);
};

const refreshWidget = async (widget: DashboardWidget) => {
  const datasourceId = String(widget.config.datasourceId || dashboard.current?.datasourceId || '');
  const prompt = String(widget.config.prompt || widget.title || '');
  if (!widget.query || !datasourceId) {
    dashboard.error = 'Impossible de rafraîchir le widget : SQL ou datasource manquant.';
    return;
  }

  try {
    const response = await apiClient.post<QueryExecuteResponse>('/copilot/query/execute', {
      question: prompt,
      sql: widget.query,
      datasourceId,
      sessionId: getAskMeSessionId()
    });

    await dashboard.updateWidget(widget.id, {
      config: {
        ...widget.config,
        datasourceId,
        columns: response.data.columns,
        rows: response.data.rows,
        narrative: response.data.narrative,
        executionMs: response.data.executionMs,
        refreshedAt: new Date().toISOString(),
        isEmpty: false,
        semanticContext: {
          ...(typeof widget.config.semanticContext === 'object' && widget.config.semanticContext
            ? widget.config.semanticContext
            : {}),
          confidence: response.data.confidence,
          usedEntities: response.data.usedEntities || [],
          provenance: response.data.provenance,
          warnings: response.data.warnings || []
        }
      }
    });
  } catch (error) {
    dashboard.error = 'Le rafraîchissement du widget a échoué.';
  }
};
</script>

<style scoped>
.dashboard-builder-studio {
  min-height: calc(100vh - 116px);
  display: grid;
  grid-template-rows: 62px minmax(0, 1fr);
  gap: 10px;
  color: var(--askme-ink);
}

.dashboard-builder-studio.focus-mode {
  position: fixed;
  inset: 0;
  z-index: 2000;
  min-height: 100vh;
  padding: 10px;
  background:
    linear-gradient(135deg, rgba(240, 253, 250, 0.98), rgba(236, 254, 255, 0.96)),
    var(--askme-bg);
}

.builder-topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 62px;
  padding: 8px 12px;
  border: 1px solid var(--askme-border);
  border-radius: 16px;
  background: color-mix(in srgb, var(--askme-panel-strong) 90%, transparent);
  box-shadow: 0 16px 44px rgba(15, 23, 42, 0.08);
}

.topbar-identity {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 8px;
}

.topbar-identity div {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.topbar-identity span {
  overflow: hidden;
  color: var(--askme-ink);
  font-size: 15px;
  font-weight: 900;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.topbar-identity strong {
  overflow: hidden;
  color: var(--askme-muted);
  font-size: 11px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: flex-end;
  min-width: 0;
}

.mode-switch {
  flex: 0 0 auto;
}

.builder-layout {
  min-height: 0;
  display: grid;
  grid-template-columns: 240px minmax(620px, 1fr) 300px;
  gap: 10px;
  transition: grid-template-columns 180ms ease;
}

.builder-layout.left-collapsed {
  grid-template-columns: 52px minmax(720px, 1fr) 300px;
}

.builder-layout.right-collapsed {
  grid-template-columns: 240px minmax(720px, 1fr) 52px;
}

.builder-layout.left-collapsed.right-collapsed,
.focus-mode .builder-layout {
  grid-template-columns: 0 minmax(0, 1fr) 0;
  gap: 0;
}

.builder-sidebar {
  min-height: 0;
  overflow: auto;
  padding: 12px;
  border: 1px solid var(--askme-border);
  border-radius: 16px;
  background: color-mix(in srgb, var(--askme-panel-strong) 88%, transparent);
  box-shadow: 0 16px 44px rgba(15, 23, 42, 0.08);
}

.builder-sidebar.collapsed {
  overflow: hidden;
  padding: 8px 6px;
}

.focus-mode .builder-sidebar {
  opacity: 0;
  pointer-events: none;
}

.panel-chrome {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  margin-bottom: 10px;
}

.panel-chrome div {
  display: grid;
  gap: 1px;
}

.panel-chrome h3 {
  margin: 0;
  color: var(--askme-ink);
  font-size: 15px;
}

.builder-sidebar.collapsed .panel-chrome {
  justify-content: center;
}

.builder-sidebar.collapsed .panel-chrome div {
  display: none;
}

.builder-canvas-zone {
  position: relative;
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 8px;
  border-radius: 18px;
}

.builder-canvas-zone.drop-active::after {
  position: absolute;
  inset: 48px 10px 10px;
  z-index: 5;
  display: grid;
  place-items: center;
  border: 2px dashed rgba(6, 182, 212, 0.58);
  border-radius: 22px;
  color: #0891b2;
  font-weight: 900;
  content: "Déposez le widget sur la grille";
  background: rgba(236, 254, 255, 0.64);
  pointer-events: none;
}

.canvas-mini-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  padding: 0 2px;
}

.palette-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  margin-bottom: 8px;
  padding: 9px 10px;
  border: 1px solid var(--askme-border);
  border-radius: 12px;
  color: var(--askme-ink);
  background: color-mix(in srgb, var(--askme-subtle-surface) 90%, white);
  cursor: grab;
  text-align: left;
  transition: transform 180ms ease, border-color 180ms ease, background 180ms ease;
}

.palette-item:hover {
  transform: translateX(2px);
  border-color: color-mix(in srgb, var(--askme-primary) 44%, var(--askme-border));
  background: color-mix(in srgb, var(--askme-hover-surface) 88%, white);
}

.builder-sidebar.collapsed .palette-item {
  justify-content: center;
  width: 40px;
  min-height: 40px;
  padding: 0;
}

.palette-item span {
  display: grid;
  gap: 2px;
}

.palette-item small,
.empty-inspector p,
.inspector-metrics span {
  color: var(--askme-muted);
  font-size: 12px;
}

.inspector-content {
  display: grid;
  gap: 10px;
}

.inspector-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.inspector-metrics div {
  display: grid;
  gap: 2px;
  min-width: 0;
  padding: 9px;
  border: 1px solid var(--askme-border);
  border-radius: 12px;
  background: var(--askme-subtle-surface);
}

.inspector-metrics strong {
  overflow: hidden;
  color: var(--askme-ink);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kpi-color-tools {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--askme-border);
  border-radius: 14px;
  background: var(--askme-subtle-surface);
}

.kpi-color-tools > span {
  color: var(--askme-secondary);
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
}

.kpi-color-swatch {
  display: block;
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.74);
  border-radius: 999px;
  box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.18);
}

.layout-tools {
  display: grid;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--askme-border);
  border-radius: 14px;
  background:
    linear-gradient(135deg, rgba(32, 242, 182, 0.08), transparent),
    var(--askme-subtle-surface);
}

.tool-title {
  display: grid;
  gap: 2px;
}

.tool-title span {
  color: var(--askme-secondary);
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
}

.tool-title strong {
  color: var(--askme-ink);
  font-size: 13px;
}

.position-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.align-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.align-grid :deep(.v-btn) {
  justify-content: flex-start;
}

.empty-inspector {
  min-height: 260px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  text-align: center;
}

.readonly-inspector {
  min-height: 260px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  color: var(--askme-muted);
  text-align: center;
}

.collapsed-rail {
  display: grid;
  justify-items: center;
  gap: 10px;
}

.askme-widget-dialog {
  border: 1px solid var(--askme-border);
  border-radius: 24px !important;
  background: var(--askme-panel-gradient) !important;
  overflow: hidden;
}

/* Header fixe du dialog */
.dialog-head {
  border-bottom: 1px solid var(--askme-border);
  background: color-mix(in srgb, var(--askme-panel-strong) 92%, transparent);
}

.dialog-head-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 20px;
}

.dialog-head-info {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
  flex-wrap: wrap;
}

.dialog-head-info .eyebrow {
  color: var(--askme-secondary);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  flex-shrink: 0;
}

.dialog-head-info h3 {
  margin: 0;
  color: var(--askme-ink);
  font-size: 17px;
  font-weight: 800;
  white-space: nowrap;
}

.dialog-head-info p {
  margin: 0;
  overflow: hidden;
  color: var(--askme-muted);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Corps scrollable */
.dialog-body {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
}

.dialog-composer {
  /* Pas de margin externe, le composer gère son propre padding */
}

@media (max-width: 1180px) {
  .builder-layout {
    grid-template-columns: 52px minmax(0, 1fr);
  }

  .right-sidebar {
    display: none;
  }

  .topbar-actions {
    overflow-x: auto;
  }
}
</style>
