<template>
  <aside class="schema-panel" aria-label="Schema explorer">
    <div class="panel-heading">
      <div>
        <p class="eyebrow">Schema Explorer</p>
        <h2>Database Map</h2>
      </div>
      <v-chip size="small" class="count-chip">{{ tables.length }} tables</v-chip>
    </div>

    <v-text-field
      :model-value="searchTerm"
      class="schema-search"
      density="comfortable"
      variant="outlined"
      placeholder="Search tables, columns, PK/FK..."
      prepend-inner-icon="mdi-magnify"
      hide-details
      clearable
      @update:model-value="emit('update:searchTerm', String($event || ''))"
    />

    <div class="schema-list">
      <button
        v-for="table in tables"
        :key="table.name"
        class="schema-table"
        :class="{ active: table.name === selectedTableName }"
        type="button"
        @click="emit('select-table', table.name)"
      >
        <div class="table-row">
          <span class="table-icon" :class="table.type">
            <v-icon size="18">{{ table.type === 'fact' ? 'mdi-chart-box-outline' : 'mdi-table' }}</v-icon>
          </span>
          <span class="table-main">
            <strong>{{ table.name }}</strong>
            <small>{{ table.schema || 'public' }} / {{ table.columns.length }} columns</small>
          </span>
          <v-chip size="x-small" class="type-chip" :class="table.type">{{ table.type }}</v-chip>
          <v-icon
            class="expand-icon"
            size="18"
            @click.stop="emit('toggle-table', table.name)"
          >
            {{ isExpanded(table.name) ? 'mdi-chevron-up' : 'mdi-chevron-down' }}
          </v-icon>
        </div>

        <v-expand-transition>
          <div v-if="isExpanded(table.name)" class="column-list">
            <div v-for="column in table.columns" :key="`${table.name}.${column.name}`" class="column-row">
              <span class="column-name">{{ column.name }}</span>
              <span class="column-type">{{ column.type }}</span>
              <span class="column-badges">
                <b v-if="column.isPrimaryKey" class="badge pk">PK</b>
                <b v-if="column.isForeignKey" class="badge fk">FK</b>
                <b v-if="column.semanticType" class="badge semantic">{{ column.semanticType }}</b>
                <b class="badge nullable" :class="{ strict: !column.nullable }">
                  {{ column.nullable ? 'NULL' : 'REQ' }}
                </b>
              </span>
            </div>
          </div>
        </v-expand-transition>
      </button>
    </div>
  </aside>
</template>

<script setup lang="ts">
import type { ExplorerTable } from '../../services/dataset/datasetExplorer.service';

const props = defineProps<{
  tables: ExplorerTable[];
  selectedTableName: string;
  expandedTables: string[];
  searchTerm: string;
}>();

const emit = defineEmits<{
  'update:searchTerm': [value: string];
  'select-table': [tableName: string];
  'toggle-table': [tableName: string];
}>();

const isExpanded = (tableName: string) => props.expandedTables.includes(tableName);
</script>

<style scoped>
.schema-panel {
  position: relative;
  display: flex;
  min-width: 0;
  height: 100%;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  overflow: hidden;
  border: 1px solid var(--askme-border);
  border-radius: 30px;
  background: var(--askme-panel-gradient);
  box-shadow: var(--askme-shadow);
  backdrop-filter: blur(22px);
}

.schema-panel::before {
  position: absolute;
  inset: -60px auto auto -80px;
  width: 180px;
  height: 180px;
  content: '';
  border-radius: 999px;
  background: radial-gradient(circle, rgba(32, 242, 182, 0.22), transparent 68%);
  pointer-events: none;
}

.panel-heading {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.eyebrow {
  margin: 0 0 5px;
  color: var(--askme-primary);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

h2 {
  margin: 0;
  color: var(--askme-ink);
  font-size: 24px;
  letter-spacing: -0.04em;
}

.count-chip,
.type-chip {
  border: 1px solid var(--askme-border) !important;
  background: var(--askme-subtle-surface) !important;
  color: var(--askme-ink) !important;
}

.schema-search :deep(.v-field) {
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.045);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.schema-list {
  display: grid;
  gap: 11px;
  min-height: 0;
  overflow: auto;
  padding-right: 4px;
}

.schema-table {
  width: 100%;
  padding: 12px;
  color: var(--askme-ink);
  text-align: left;
  border: 1px solid rgba(151, 255, 221, 0.11);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.045);
  transition: border-color 180ms ease, background 180ms ease, transform 180ms ease, box-shadow 180ms ease;
}

.schema-table:hover,
.schema-table.active {
  border-color: var(--askme-border-strong);
  background: rgba(32, 242, 182, 0.075);
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.18), var(--askme-glow);
  transform: translateY(-1px);
}

.table-row {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto 20px;
  gap: 10px;
  align-items: center;
}

.table-icon {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border: 1px solid var(--askme-border);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--askme-secondary);
}

.table-icon.fact {
  color: var(--askme-primary);
  background: rgba(32, 242, 182, 0.12);
}

.table-main {
  min-width: 0;
}

.table-main strong,
.table-main small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.table-main strong {
  font-size: 13px;
  letter-spacing: -0.01em;
}

.table-main small {
  margin-top: 3px;
  color: var(--askme-muted);
  font-size: 11px;
}

.type-chip.fact {
  color: #052e24 !important;
  background: linear-gradient(135deg, #20f2b6, #6ee7d8) !important;
}

.type-chip.dimension {
  color: #032330 !important;
  background: linear-gradient(135deg, #67e8f9, #a7f3d0) !important;
}

.expand-icon {
  color: var(--askme-muted);
}

.column-list {
  display: grid;
  gap: 7px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(151, 255, 221, 0.1);
}

.column-row {
  display: grid;
  grid-template-columns: minmax(90px, 1fr) minmax(62px, auto);
  gap: 6px;
  align-items: center;
  padding: 8px;
  border-radius: 14px;
  background: rgba(0, 0, 0, 0.11);
}

.column-name,
.column-type {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.column-name {
  font-size: 12px;
  font-weight: 700;
}

.column-type {
  color: var(--askme-muted);
  font-size: 11px;
  text-align: right;
}

.column-badges {
  display: flex;
  grid-column: 1 / -1;
  flex-wrap: wrap;
  gap: 5px;
}

.badge {
  padding: 3px 7px;
  color: var(--askme-muted);
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.08em;
  border: 1px solid var(--askme-border);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.05);
}

.badge.pk {
  color: #061f19;
  background: #20f2b6;
}

.badge.fk {
  color: #041e28;
  background: #67e8f9;
}

.badge.strict {
  color: #fed7aa;
  border-color: rgba(251, 146, 60, 0.42);
}

@media (max-width: 1180px) {
  .schema-panel {
    min-height: 420px;
  }
}
</style>
