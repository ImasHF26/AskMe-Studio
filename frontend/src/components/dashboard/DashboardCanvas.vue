<template>
  <section
    class="dashboard-canvas premium-panel"
    :class="{ 'readonly-canvas': isReadonly }"
    :style="canvasStyle"
  >
    <div v-if="showHeader" class="canvas-head">
      <div>
        <p>{{ canvasKicker }}</p>
        <h3>{{ canvasTitle }}</h3>
      </div>
      <v-chip size="small" color="teal" variant="tonal">
        {{ dashboard?.widgets.length || 0 }} widgets
      </v-chip>
    </div>

    <!-- Cas : aucun dashboard chargé -->
    <v-alert v-if="!dashboard" type="info" variant="tonal" density="compact">
      Sélectionnez ou créez un dashboard pour commencer.
    </v-alert>

    <template v-else>
      <!-- Empty state — affiché en overlay quand aucun widget. La grille reste rendue dessous. -->
      <div v-if="!dashboard.widgets.length" class="empty-canvas">
        <v-icon icon="mdi-view-dashboard-edit-outline" size="52" />
        <h4>Glissez un widget ici pour commencer</h4>
        <p>KPI, graphiques, tableaux ou zones de texte.</p>
        <div class="empty-grid-hint">
          <span>Grille 12 colonnes · rowHeight {{ gridSettings.rowHeight }}px · margin {{ gridSettings.margin[0] }}px</span>
        </div>
      </div>

      <!-- Grille TOUJOURS rendue (même à vide) pour le drag & drop -->
      <grid-layout
        ref="gridLayoutRef"
        v-model:layout="localLayout"
        :col-num="gridSettings.columns"
        :row-height="gridSettings.rowHeight"
        :is-draggable="!isReadonly"
        :is-resizable="!isReadonly"
        :drag-allow-from="'.widget-drag-handle'"
        :drag-ignore-from="'.widget-actions, .widget-body, .widget-foot, .chart-shell, .text-widget, .metric, button, input, textarea, .v-btn, .v-field'"
        :vertical-compact="false"
        :use-css-transforms="true"
        :prevent-collision="false"
        :auto-size="true"
        :margin="gridSettings.margin"
        @layout-updated="handleLayoutUpdated"
      >
        <grid-item
          v-for="widget in dashboard.widgets"
          :key="widget.id"
          :i="widget.id"
          :x="getWidgetX(widget.id)"
          :y="getWidgetY(widget.id)"
          :w="getWidgetW(widget.id)"
          :h="getWidgetH(widget.id)"
          :min-w="2"
          :min-h="2"
        >
          <article
            class="studio-widget"
            :class="{
              selected: !isReadonly && selectedWidgetId === widget.id,
              empty: isWidgetEmpty(widget)
            }"
            @click="selectWidget(widget)"
          >
            <header class="widget-head">
              <div class="widget-drag-handle" :title="isReadonly ? '' : 'Déplacer le widget'">
                <v-icon v-if="!isReadonly" icon="mdi-drag" size="16" class="drag-icon" />
                <div>
                  <span>{{ widget.type }} · {{ widget.chartType }}</span>
                  <strong>{{ widget.title }}</strong>
                </div>
              </div>
              <div v-if="!isReadonly" class="widget-actions">
                <v-btn
                  size="x-small"
                  variant="text"
                  icon="mdi-creation"
                  title="Alimenter avec AskMe"
                  @click.stop="emit('feed-widget', widget)"
                />
                <v-btn
                  size="x-small"
                  variant="text"
                  icon="mdi-refresh"
                  title="Rafraîchir"
                  @click.stop="emit('refresh-widget', widget)"
                />
                <v-btn
                  size="x-small"
                  variant="text"
                  icon="mdi-pencil-outline"
                  title="Modifier"
                  @click.stop="emit('edit-widget', widget)"
                />
                <v-btn
                  size="x-small"
                  variant="text"
                  icon="mdi-delete-outline"
                  color="red-lighten-1"
                  title="Supprimer"
                  @click.stop="emit('delete-widget', widget.id)"
                />
              </div>
            </header>

            <!-- KPI non vide -->
            <KPIWidget
              v-if="!isWidgetEmpty(widget) && widget.type === 'kpi'"
              :title="widget.title"
              :value="resolveKpiValue(widget)"
              :caption="resolveKpiCaption(widget)"
              :color="resolveKpiColor(widget)"
              class="widget-body"
            />

            <!-- État vide -->
            <div v-else-if="isWidgetEmpty(widget)" class="empty-widget-state widget-body">
              <v-icon :icon="widgetIcon(widget)" size="30" />
              <strong>Ce widget n'a pas encore de données</strong>
              <span>Alimentez-le avec AskMe pour générer la requête et le rendu.</span>
              <v-btn
                v-if="!isReadonly"
                size="small"
                color="primary"
                variant="tonal"
                prepend-icon="mdi-creation"
                @click.stop="emit('feed-widget', widget)"
              >
                Alimenter avec AskMe
              </v-btn>
            </div>

            <!-- Texte / narratif -->
            <v-sheet v-else-if="widget.type === 'text'" class="text-widget widget-body" rounded="lg" border>
              <div class="text-body-2">
                {{ String(widget.config.text || widget.config.narrative || 'Aucun texte') }}
              </div>
            </v-sheet>

            <!-- Chart / Table -->
            <ChartWidget
              v-else
              class="widget-body"
              :columns="resolveColumns(widget)"
              :rows="resolveRows(widget)"
              :chart-type="widget.type === 'table' ? 'table' : widget.chartType"
            />

            <footer class="widget-foot">
              <span>{{ widget.config.prompt || (isWidgetEmpty(widget) ? 'Widget vide à alimenter' : 'Widget manuel') }}</span>
              <v-chip v-if="widget.config.datasourceId" size="x-small" color="primary" variant="tonal">
                datasource
              </v-chip>
            </footer>
          </article>
        </grid-item>
      </grid-layout>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Dashboard, DashboardWidget, DashboardWidgetPosition } from '../../types';
import ChartWidget from './ChartWidget.vue';
import KPIWidget from './KPIWidget.vue';

interface LayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const props = defineProps<{
  dashboard: Dashboard | null;
  selectedWidgetId?: string;
  readonly?: boolean;
  title?: string;
  kicker?: string;
  showHeader?: boolean;
}>();

const emit = defineEmits<{
  'select-widget': [widget: DashboardWidget];
  'feed-widget': [widget: DashboardWidget];
  'edit-widget': [widget: DashboardWidget];
  'delete-widget': [widgetId: string];
  'refresh-widget': [widget: DashboardWidget];
  'update-widget-position': [widgetId: string, position: DashboardWidgetPosition];
}>();

// ─── Refs ─────────────────────────────────────────────────────────────────────

/** Référence sur l'instance GridLayout pour mesurer son rect DOM réel */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const gridLayoutRef = ref<any>(null);

const localLayout = ref<LayoutItem[]>([]);

/**
 * Protège les positions locales pendant un drag/resize sans bloquer les widgets
 * ajoutés ou rechargés depuis le store.
 */
let isDragging = false;
let dragEndTimer = 0;

// ─── Grid settings ─────────────────────────────────────────────────────────────

const defaultGridSettings = {
  columns: 12,
  rowHeight: 72,
  margin: [16, 16] as [number, number]
};

const gridSettings = computed(() => {
  const builder = extractBuilderConfig(props.dashboard?.config);
  const layout = builder.layout || {};
  const columns = Math.max(4, Number(layout.columns) || defaultGridSettings.columns);
  const rowHeight = Math.max(48, Number(layout.rowHeight) || defaultGridSettings.rowHeight);
  return {
    columns,
    rowHeight,
    margin: normalizeMargin(layout.margin)
  };
});

const canvasStyle = computed(() => ({
  '--dashboard-grid-columns': String(gridSettings.value.columns),
  '--dashboard-grid-row-height': `${gridSettings.value.rowHeight}px`
}));

// ─── Computed display ─────────────────────────────────────────────────────────

const isReadonly = computed(() => props.readonly === true);
const showHeader = computed(() => props.showHeader !== false);
const canvasKicker = computed(() =>
  props.kicker || (isReadonly.value ? 'Dashboard Viewer' : 'Dashboard Studio Canvas')
);
const canvasTitle = computed(() =>
  props.title || (isReadonly.value ? 'Mode présentation' : 'Studio visuel interactif')
);

// ─── Layout sync ──────────────────────────────────────────────────────────────

/**
 * Reconstruit localLayout depuis les widgets du store.
 * Pendant un drag/resize, les items existants gardent leur position locale,
 * mais les widgets ajoutés ou rechargés restent synchronisés.
 */
const syncLayout = () => {
  const widgets = props.dashboard?.widgets || [];
  localLayout.value = widgets.map((widget) => {
    const current = localLayout.value.find((item) => item.i === widget.id);
    if (current && isDragging) return { ...current };
    return {
      i: widget.id,
      x: widget.position.x,
      y: widget.position.y,
      w: widget.position.w,
      h: widget.position.h
    };
  });
};

watch(
  () =>
    (props.dashboard?.widgets ?? [])
      .map((w) => `${w.id}:${w.position.x}:${w.position.y}:${w.position.w}:${w.position.h}`)
      .join('|'),
  syncLayout,
  { immediate: true }
);

watch(
  () => props.dashboard?.id,
  () => {
    isDragging = false;
    window.clearTimeout(dragEndTimer);
    syncLayout();
  }
);

// ─── Accesseurs localLayout ────────────────────────────────────────────────────

/**
 * Lire la position depuis localLayout (qui reflète le drag en cours)
 * plutôt que depuis widget.position (qui ne change qu'après updateWidget).
 */
const getLocalItem = (id: string): LayoutItem | undefined =>
  localLayout.value.find((item) => item.i === id);

const getWidgetX = (id: string) => getLocalItem(id)?.x ?? 0;
const getWidgetY = (id: string) => getLocalItem(id)?.y ?? 0;
const getWidgetW = (id: string) => getLocalItem(id)?.w ?? 3;
const getWidgetH = (id: string) => getLocalItem(id)?.h ?? 3;

// ─── Layout updated handler ────────────────────────────────────────────────────

/**
 * Appelé par vue-grid-layout après chaque déplacement ou redimensionnement.
 * On n'émet update-widget-position que pour les items réellement modifiés.
 */
const handleLayoutUpdated = (layout: LayoutItem[]) => {
  if (isReadonly.value) return;
  let hasChanged = false;

  for (const item of layout) {
    const widget = props.dashboard?.widgets.find((w) => w.id === item.i);
    if (!widget) continue;
    const changed =
      widget.position.x !== item.x ||
      widget.position.y !== item.y ||
      widget.position.w !== item.w ||
      widget.position.h !== item.h;
    if (!changed) continue;

    hasChanged = true;
    emit('update-widget-position', widget.id, {
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h
    });
  }

  if (hasChanged) {
    isDragging = true;
    window.clearTimeout(dragEndTimer);
    dragEndTimer = window.setTimeout(() => {
      isDragging = false;
    }, 400);
  }
};

// ─── Widget helpers ────────────────────────────────────────────────────────────

const selectWidget = (widget: DashboardWidget) => {
  if (isReadonly.value) return;
  emit('select-widget', widget);
};

type WidgetRow = Record<string, string | number>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const getRecord = (source: Record<string, unknown>, key: string) => {
  const value = source[key];
  return isRecord(value) ? value : null;
};

const getArray = (source: Record<string, unknown>, key: string) => {
  const value = source[key];
  return Array.isArray(value) ? value : null;
};

const widgetPayloads = (widget: DashboardWidget) => {
  const config = isRecord(widget.config) ? widget.config : {};
  const payloads: Array<Record<string, unknown>> = [config];

  for (const key of ['data', 'result', 'executed', 'queryResult', 'preview']) {
    const payload = getRecord(config, key);
    if (payload) payloads.push(payload);
  }

  return payloads;
};

const toDisplayValue = (value: unknown): string | number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value === null || typeof value === 'undefined') return '';
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value);
};

const normalizeRows = (rows: unknown[]): WidgetRow[] =>
  rows.filter(isRecord).map((row) =>
    Object.fromEntries(Object.entries(row).map(([key, value]) => [key, toDisplayValue(value)]))
  );

const normalizeColumns = (columns: unknown[] | null, rows: WidgetRow[]) => {
  const explicitColumns = (columns || [])
    .map((item) => {
      if (typeof item === 'string') return item;
      if (isRecord(item)) return String(item.field || item.key || item.name || item.column || '');
      return '';
    })
    .filter(Boolean);

  if (explicitColumns.length) return explicitColumns;
  return Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
};

const resolveRows = (widget: DashboardWidget): WidgetRow[] => {
  for (const payload of widgetPayloads(widget)) {
    const rows = getArray(payload, 'rows') || getArray(payload, 'data');
    if (rows?.length) return normalizeRows(rows);
  }
  return [];
};

const resolveColumns = (widget: DashboardWidget) => {
  const rows = resolveRows(widget);
  for (const payload of widgetPayloads(widget)) {
    const columns = normalizeColumns(getArray(payload, 'columns'), rows);
    if (columns.length) return columns;
  }
  return normalizeColumns(null, rows);
};

const hasTextContent = (widget: DashboardWidget) =>
  ['text', 'narrative', 'markdown', 'content'].some((key) => {
    const value = widget.config[key];
    return typeof value === 'string' && value.trim().length > 0;
  });

const isWidgetEmpty = (widget: DashboardWidget) => {
  const rows = resolveRows(widget);
  if (rows.length || hasTextContent(widget)) return false;
  return Boolean(widget.config.isEmpty || !widget.query);
};

const widgetIcon = (widget: DashboardWidget) => {
  if (widget.type === 'kpi') return 'mdi-counter';
  if (widget.type === 'table') return 'mdi-table';
  if (widget.type === 'text') return 'mdi-text-box-outline';
  if (widget.chartType === 'line') return 'mdi-chart-line';
  if (widget.chartType === 'pie') return 'mdi-chart-donut';
  return 'mdi-chart-bar';
};

const resolveKpiValue = (widget: DashboardWidget): number => {
  const rows = resolveRows(widget);
  const columns = resolveColumns(widget);
  const numericColumn = columns.find((column) => rows.some((row) => Number.isFinite(Number(row[column]))));
  const raw = widget.config.value ?? rows[0]?.[numericColumn || columns[1] || columns[0] || ''];
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : rows.length;
  }
  return rows.length;
};

const resolveKpiCaption = (widget: DashboardWidget): string => {
  const ms = widget.config.executionMs;
  if (typeof ms === 'number' && ms > 0) return `${ms} ms`;
  if (typeof ms === 'string' && ms) return `${ms} ms`;
  const caption = widget.config.caption;
  if (typeof caption === 'string' && caption) return caption;
  const rowCount = resolveRows(widget).length;
  return rowCount > 0 ? `${rowCount} lignes` : 'Aucune donnée';
};

const resolveKpiColor = (widget: DashboardWidget) => {
  const raw = widget.config.color || widget.config.kpiColor || widget.config.paletteColor;
  return typeof raw === 'string' ? raw : 'sky';
};

// ─── getDropPosition — exposée au parent pour un calcul précis ─────────────────

/**
 * Calcule la position (x, y) dans la grille à partir d'un DragEvent.
 * Utilise le rect DOM réel du <GridLayout> pour éviter tout décalage
 * dû aux toolbars ou paddings des composants parents.
 *
 * @param event  Le DragEvent natif du @drop
 * @param size   { w, h } — taille par défaut du widget à déposer
 */
const getDropPosition = (
  event: DragEvent,
  size: { w: number; h: number }
): DashboardWidgetPosition => {
  const gridEl = gridLayoutRef.value?.$el as HTMLElement | null;
  if (!gridEl) {
    return { x: 0, y: 0, ...size };
  }

  const rect = gridEl.getBoundingClientRect();
  const { columns, rowHeight, margin } = gridSettings.value;
  const [marginX, marginY] = margin;

  // Largeur effective d'une cellule (px) : (containerW - margins) / columns
  const usableW = rect.width - marginX * (columns + 1);
  const cellW = usableW / columns;
  const cellH = rowHeight + marginY;

  const relX = event.clientX - rect.left - marginX;
  const relY = event.clientY - rect.top - marginY;

  const x = Math.max(0, Math.min(columns - size.w, Math.floor(relX / (cellW + marginX))));
  const y = Math.max(0, Math.floor(relY / cellH));

  return { x, y, ...size };
};

defineExpose({ getDropPosition });

// ─── Config helpers ────────────────────────────────────────────────────────────

const extractBuilderConfig = (config: Dashboard['config'] | undefined) => {
  const safeConfig = config && typeof config === 'object' ? config : {};
  const builder = (safeConfig as Record<string, unknown>).builder;
  if (!builder || typeof builder !== 'object') return {};
  return builder as {
    layout?: {
      columns?: number;
      rowHeight?: number;
      margin?: [number, number] | number[];
    };
  };
};

const normalizeMargin = (value: unknown): [number, number] => {
  if (Array.isArray(value) && value.length >= 2) {
    const first = Number(value[0]);
    const second = Number(value[1]);
    if (Number.isFinite(first) && Number.isFinite(second)) {
      return [Math.max(0, first), Math.max(0, second)];
    }
  }
  return defaultGridSettings.margin;
};
</script>

<style scoped>
/* ── Section wrapper ─────────────────────────────────────────────────────── */
.dashboard-canvas {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0;
  min-height: calc(100vh - 180px);
  padding: 0;
  border: 1px solid rgba(8, 145, 178, 0.16);
  border-radius: 18px;
  background:
    linear-gradient(90deg, rgba(8, 145, 178, 0.14) 1px, transparent 1px),
    linear-gradient(0deg, rgba(15, 118, 110, 0.10) 1px, transparent 1px),
    linear-gradient(135deg, rgba(255, 255, 255, 0.97), rgba(236, 254, 255, 0.82));
  background-size:
    calc(100% / var(--dashboard-grid-columns, 12)) 100%,
    100% var(--dashboard-grid-row-height, 72px),
    auto;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.82), 0 18px 52px rgba(15, 23, 42, 0.08);
  overflow: hidden;
}

.readonly-canvas {
  background:
    radial-gradient(circle at 12% 8%, rgba(32, 242, 182, 0.1), transparent 34%),
    var(--askme-panel-gradient) !important;
}

/* ── Canvas header ───────────────────────────────────────────────────────── */
.canvas-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px 10px;
  border-bottom: 1px solid rgba(8, 145, 178, 0.10);
}

.canvas-head p,
.canvas-head h3 {
  margin: 0;
}

.canvas-head p {
  color: var(--askme-secondary);
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
}

.canvas-head h3 {
  color: var(--askme-ink);
  font-size: 22px;
  letter-spacing: -0.03em;
}

/* ── Empty state ────────────────────────────────────────────────────────── */
.empty-canvas {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  pointer-events: none;
  color: var(--askme-muted);
  text-align: center;
}

.empty-canvas h4 {
  margin: 0;
  color: var(--askme-ink);
  font-size: 18px;
}

.empty-canvas p {
  margin: 0;
  font-size: 14px;
}

.empty-grid-hint {
  margin-top: 6px;
  padding: 6px 14px;
  border: 1px solid rgba(6, 182, 212, 0.24);
  border-radius: 20px;
  background: rgba(207, 250, 254, 0.48);
}

.empty-grid-hint span {
  font-size: 11px;
  font-weight: 700;
  color: #0891b2;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

/* ── vue-grid-layout overrides ──────────────────────────────────────────── */
.dashboard-canvas :deep(.vue-grid-layout) {
  min-height: calc(100vh - 224px);
  width: 100% !important;
}

.dashboard-canvas :deep(.vue-grid-item.vue-grid-placeholder) {
  border: 2px dashed rgba(6, 182, 212, 0.72);
  border-radius: 14px;
  background: rgba(207, 250, 254, 0.46) !important;
  box-shadow: 0 0 44px rgba(6, 182, 212, 0.2);
  opacity: 1;
}

.dashboard-canvas :deep(.vue-grid-item.vue-grid-item-dragging .studio-widget),
.dashboard-canvas :deep(.vue-grid-item.vue-grid-item-resizing .studio-widget) {
  border-color: rgba(32, 242, 182, 0.5);
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.34), 0 0 0 1px rgba(32, 242, 182, 0.22);
  transform: scale(1.01);
}

/* ── Widget card ────────────────────────────────────────────────────────── */
.studio-widget {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  height: 100%;
  overflow: hidden;
  padding: 10px;
  border: 1px solid rgba(15, 118, 110, 0.13);
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.97), rgba(240, 253, 250, 0.86));
  box-shadow: 0 14px 36px rgba(15, 23, 42, 0.1);
  transition: transform 180ms ease, box-shadow 180ms ease;
  cursor: default;
}

.studio-widget:hover {
  transform: translateY(-1px);
  box-shadow: 0 22px 58px rgba(15, 23, 42, 0.16), 0 0 0 1px rgba(6, 182, 212, 0.14);
}

.studio-widget.selected {
  border-color: #06b6d4;
  box-shadow: 0 24px 64px rgba(15, 23, 42, 0.18), 0 0 0 2px rgba(6, 182, 212, 0.42);
}

.studio-widget.empty {
  border-style: dashed;
  border-color: rgba(6, 182, 212, 0.42);
}

/* ── Widget head ────────────────────────────────────────────────────────── */
.widget-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 34px;
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(15, 118, 110, 0.1);
}

.readonly-canvas .widget-head {
  cursor: default;
}

.widget-drag-handle {
  display: grid;
  min-width: 0;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 8px;
  align-items: start;
  cursor: move;
  user-select: none;
  flex: 1;
}

.readonly-canvas .widget-drag-handle {
  cursor: default;
}

.drag-icon {
  margin-top: 2px;
  color: var(--askme-muted);
}

.widget-drag-handle div {
  display: grid;
  gap: 2px;
}

.widget-head span,
.widget-foot span {
  overflow: hidden;
  color: var(--askme-muted);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.widget-head strong {
  overflow: hidden;
  color: var(--askme-ink);
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.widget-actions {
  display: flex;
  gap: 2px;
  opacity: 0.72;
  transition: opacity 160ms ease;
  flex-shrink: 0;
}

.studio-widget:hover .widget-actions,
.studio-widget.selected .widget-actions {
  opacity: 1;
}

/* ── Widget body ────────────────────────────────────────────────────────── */
.widget-body {
  min-height: 0;
  overflow: hidden;
}

.empty-widget-state {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  min-height: 0;
  padding: 12px;
  border: 1px dashed rgba(6, 182, 212, 0.38);
  border-radius: 12px;
  color: var(--askme-muted);
  background: linear-gradient(135deg, rgba(207, 250, 254, 0.48), rgba(240, 253, 250, 0.72));
  text-align: center;
}

.empty-widget-state strong {
  color: var(--askme-ink);
  font-size: 13px;
}

.empty-widget-state span {
  max-width: 240px;
  font-size: 12px;
  line-height: 1.35;
}

/* ── Text widget ────────────────────────────────────────────────────────── */
.text-widget {
  min-height: 100%;
  padding: 14px;
  color: var(--askme-ink);
  background: var(--askme-panel-soft) !important;
  overflow-y: auto;
}

/* ── Widget foot ────────────────────────────────────────────────────────── */
.widget-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--askme-border);
}

/* ── Chart / KPI deep overrides ─────────────────────────────────────────── */
.studio-widget :deep(.chart-shell) {
  height: 100%;
  min-height: 0;
}

.studio-widget :deep(.apex-chart) {
  min-height: 120px;
}

/* ── Resize handle ──────────────────────────────────────────────────────── */
.dashboard-canvas :deep(.vue-resizable-handle) {
  right: 6px;
  bottom: 6px;
  width: 20px;
  height: 20px;
  border-right: 2px solid #06b6d4;
  border-bottom: 2px solid #06b6d4;
  border-radius: 0 0 12px 0;
  background:
    linear-gradient(135deg, transparent 0 44%, rgba(6, 182, 212, 0.9) 44% 56%, transparent 56%),
    linear-gradient(45deg, transparent 0 44%, rgba(6, 182, 212, 0.9) 44% 56%, transparent 56%);
  box-shadow: 0 0 18px rgba(6, 182, 212, 0.22);
  opacity: 0.85;
  cursor: nwse-resize;
}

.dashboard-canvas :deep(.vue-grid-item.vue-grid-item-resizable) {
  transition: box-shadow 160ms ease, border-color 160ms ease;
}

.dashboard-canvas :deep(.vue-grid-item.vue-grid-item-resizable:hover) .studio-widget {
  border-color: rgba(32, 242, 182, 0.32);
}
</style>
