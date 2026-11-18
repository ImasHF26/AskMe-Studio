<template>
  <aside class="preview-panel" :class="{ 'preview-panel--compact': compact }">
    <div v-if="!compact" class="preview-heading">
      <div>
        <p class="eyebrow">Data Preview</p>
        <h2>{{ table?.name || 'Select a table' }}</h2>
      </div>
      <v-btn
        v-if="table"
        class="ask-button"
        prepend-icon="mdi-creation"
        rounded="xl"
        variant="tonal"
        @click="emit('ask-ai', table.name)"
      >
        Ask AI
      </v-btn>
    </div>

    <div v-if="table && !compact" class="metadata-grid">
      <div>
        <small>Columns</small>
        <strong>{{ table.columns.length }}</strong>
      </div>
      <div>
        <small>Primary key</small>
        <strong>{{ primaryKey || 'None' }}</strong>
      </div>
      <div>
        <small>Foreign keys</small>
        <strong>{{ foreignKeyCount }}</strong>
      </div>
      <div>
        <small>Rows</small>
        <strong>{{ preview?.metadata.rowCount ?? table.rowCount ?? 'N/A' }}</strong>
      </div>
    </div>

    <div v-if="!table" class="empty-preview">
      <v-icon size="42">mdi-table-search</v-icon>
      <h3>No table selected</h3>
      <p>Pick a table from the schema panel or relation graph to inspect its records.</p>
    </div>

    <div v-else class="grid-shell ag-theme-quartz" :class="{ 'dark-grid': isDark }">
      <AgGridVue
        class="ag-grid"
        :column-defs="columnDefs"
        :row-data="preview?.rows || []"
        :default-col-def="defaultColDef"
        :animate-rows="true"
        :suppress-cell-focus="true"
        :loading="loading"
        overlay-loading-template="<span class='ag-overlay-loading-center'>Loading preview...</span>"
        overlay-no-rows-template="<span class='ag-overlay-loading-center'>No preview rows available</span>"
      />
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useTheme } from 'vuetify';
import { AgGridVue } from 'ag-grid-vue3';
import type { ColDef } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';
import type { ExplorerPreviewResponse, ExplorerTable } from '../../services/dataset/datasetExplorer.service';

const props = defineProps<{
  table: ExplorerTable | null;
  preview: ExplorerPreviewResponse | null;
  loading: boolean;
  compact?: boolean;
}>();

const emit = defineEmits<{
  'ask-ai': [tableName: string];
}>();

const theme = useTheme();

const primaryKey = computed(() => props.table?.columns.find((column) => column.isPrimaryKey)?.name || '');
const foreignKeyCount = computed(() => props.table?.columns.filter((column) => column.isForeignKey).length || 0);
const isDark = computed(() => theme.global.current.value.dark);

const columnDefs = computed<ColDef[]>(() => {
  const columns = props.preview?.columns?.length ? props.preview.columns : props.table?.columns.map((column) => column.name) || [];
  return columns.map((field) => ({
    field,
    headerName: field,
    sortable: true,
    filter: true,
    resizable: true,
    minWidth: 130,
    valueFormatter: ({ value }) => {
      if (value === null || value === undefined) return '';
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
    }
  }));
});

const defaultColDef: ColDef = {
  flex: 1,
  minWidth: 120,
  sortable: true,
  filter: true,
  resizable: true
};
</script>

<style scoped>
.preview-panel {
  display: flex;
  min-width: 0;
  height: 100%;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  border: 1px solid var(--askme-border);
  border-radius: 30px;
  background: var(--askme-panel-gradient);
  box-shadow: var(--askme-shadow);
  backdrop-filter: blur(22px);
}

.preview-panel--compact {
  gap: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  backdrop-filter: none;
}

.preview-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.eyebrow {
  margin: 0 0 5px;
  color: var(--askme-primary);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

h2,
h3,
p {
  margin: 0;
}

h2 {
  font-size: 23px;
  letter-spacing: -0.04em;
}

.ask-button {
  color: var(--askme-ink) !important;
  border: 1px solid var(--askme-border) !important;
  background: rgba(32, 242, 182, 0.1) !important;
}

.metadata-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.metadata-grid > div {
  min-width: 0;
  padding: 12px;
  border: 1px solid rgba(151, 255, 221, 0.12);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.045);
}

.metadata-grid small,
.metadata-grid strong {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.metadata-grid small {
  color: var(--askme-muted);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.metadata-grid strong {
  margin-top: 5px;
  color: var(--askme-ink);
  font-size: 15px;
}

.grid-shell {
  --ag-background-color: rgba(255, 255, 255, 0.72);
  --ag-border-color: rgba(15, 23, 42, 0.1);
  --ag-foreground-color: var(--askme-ink);
  --ag-header-background-color: rgba(14, 164, 114, 0.1);
  --ag-odd-row-background-color: rgba(15, 23, 42, 0.025);
  --ag-row-hover-color: rgba(14, 164, 114, 0.08);
  min-height: 360px;
  flex: 1;
  overflow: hidden;
  border: 1px solid rgba(151, 255, 221, 0.13);
  border-radius: 22px;
}

.preview-panel--compact .grid-shell {
  min-height: 0;
  border-radius: 18px;
}

.grid-shell.dark-grid {
  --ag-background-color: rgba(3, 7, 13, 0.42);
  --ag-border-color: rgba(151, 255, 221, 0.1);
  --ag-foreground-color: var(--askme-ink);
  --ag-header-background-color: rgba(32, 242, 182, 0.08);
  --ag-odd-row-background-color: rgba(255, 255, 255, 0.025);
  --ag-row-hover-color: rgba(32, 242, 182, 0.08);
}

.ag-grid {
  width: 100%;
  height: 100%;
}

.grid-shell :deep(.ag-root-wrapper) {
  border: 0;
  background: transparent;
}

.grid-shell :deep(.ag-header) {
  border-color: rgba(151, 255, 221, 0.12);
  background: rgba(32, 242, 182, 0.07);
}

.grid-shell :deep(.ag-row) {
  border-color: rgba(151, 255, 221, 0.08);
}

.empty-preview {
  display: grid;
  flex: 1;
  place-content: center;
  gap: 10px;
  color: var(--askme-muted);
  text-align: center;
}

.empty-preview .v-icon {
  justify-self: center;
  color: var(--askme-primary);
}

.empty-preview h3 {
  color: var(--askme-ink);
}

@media (max-width: 1180px) {
  .preview-panel {
    min-height: 520px;
  }
}
</style>
