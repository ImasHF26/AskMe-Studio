<template>
  <div
    class="flow-table-node"
    :class="[data.type, { selected, compact: data.compact }]"
    @contextmenu.prevent.stop="openContextMenu"
  >
    <Handle type="target" :position="Position.Left" class="node-handle" />
    <div class="node-header">
      <span class="node-icon">
        <v-icon size="17">{{ data.type === 'fact' ? 'mdi-chart-timeline-variant' : 'mdi-table-large' }}</v-icon>
      </span>
      <span class="node-title">
        <strong>{{ data.name }}</strong>
        <small>{{ data.type }} table</small>
      </span>
      <span class="node-count">{{ data.columns.length }}</span>
    </div>

    <div v-if="!data.compact" class="node-columns">
      <div v-for="column in visibleColumns" :key="column.name" class="node-column">
        <span class="column-left">
          <v-icon v-if="column.isPrimaryKey" size="13" color="#20f2b6">mdi-key-variant</v-icon>
          <v-icon v-else-if="column.isForeignKey" size="13" color="#67e8f9">mdi-link-variant</v-icon>
          <span>{{ column.name }}</span>
        </span>
        <small>{{ column.type }}</small>
      </div>
      <div v-if="data.columns.length > visibleColumns.length" class="more-columns">
        + {{ data.columns.length - visibleColumns.length }} more columns
      </div>
    </div>
    <Handle type="source" :position="Position.Right" class="node-handle" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import type { TableNodeData } from '../../stores/datasetExplorer.store';

const props = defineProps<{
  id: string;
  data: TableNodeData;
  selected?: boolean;
}>();

const visibleColumns = computed(() => props.data.columns.slice(0, props.data.type === 'fact' ? 7 : 5));

const openContextMenu = (event: MouseEvent) => {
  window.dispatchEvent(
    new CustomEvent('askme:schema-node-context', {
      detail: {
        tableName: props.id,
        x: event.clientX,
        y: event.clientY
      }
    })
  );
};
</script>

<style scoped>
.flow-table-node {
  width: 270px;
  overflow: hidden;
  color: var(--askme-ink);
  border: 1px solid rgba(151, 255, 221, 0.2);
  border-radius: 24px;
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.11), rgba(255, 255, 255, 0.035)),
    var(--askme-panel-strong);
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(18px);
  transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
}

.flow-table-node:hover,
.flow-table-node.selected {
  border-color: var(--askme-border-strong);
  box-shadow: 0 26px 90px rgba(0, 0, 0, 0.42), 0 0 44px rgba(32, 242, 182, 0.18);
  transform: translateY(-3px);
}

.flow-table-node.fact {
  border-color: rgba(32, 242, 182, 0.32);
}

.flow-table-node.dimension {
  border-color: rgba(103, 232, 249, 0.28);
}

.flow-table-node.compact {
  width: 230px;
}

.node-header {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 13px;
  background:
    radial-gradient(circle at 10% 0%, rgba(32, 242, 182, 0.18), transparent 40%),
    rgba(255, 255, 255, 0.045);
}

.node-icon {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border: 1px solid var(--askme-border);
  border-radius: 14px;
  background: rgba(32, 242, 182, 0.1);
  color: var(--askme-primary);
}

.node-title {
  min-width: 0;
}

.node-title strong,
.node-title small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-title strong {
  font-size: 14px;
  letter-spacing: -0.02em;
}

.node-title small {
  margin-top: 2px;
  color: var(--askme-muted);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.node-count {
  display: grid;
  min-width: 30px;
  height: 30px;
  place-items: center;
  color: #041a15;
  font-size: 12px;
  font-weight: 900;
  border-radius: 999px;
  background: linear-gradient(135deg, #20f2b6, #67e8f9);
}

.node-columns {
  display: grid;
  gap: 6px;
  padding: 10px;
}

.node-column {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  padding: 8px 9px;
  border: 1px solid rgba(151, 255, 221, 0.08);
  border-radius: 13px;
  background: rgba(255, 255, 255, 0.038);
}

.column-left {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 800;
}

.column-left span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-column small {
  color: var(--askme-muted);
  font-size: 10px;
}

.more-columns {
  padding: 7px;
  color: var(--askme-primary);
  font-size: 11px;
  font-weight: 800;
  text-align: center;
}

.node-handle {
  width: 9px;
  height: 9px;
  border: 2px solid rgba(3, 7, 13, 0.92);
  background: var(--askme-primary);
}
</style>
