<template>
  <v-slide-y-transition>
    <section v-if="relationship" class="relationship-panel">
      <div class="relationship-header">
        <span class="relation-icon"><v-icon size="18">mdi-source-branch</v-icon></span>
        <div>
          <p>Selected relationship</p>
          <h3>{{ relationship.type || 'relationship' }}</h3>
        </div>
        <v-btn icon="mdi-close" size="small" variant="text" @click="emit('close')" />
      </div>

      <div class="relation-path">
        <div>
          <small>From</small>
          <strong>{{ relationship.fromTable }}</strong>
          <code>{{ relationship.fromColumn }}</code>
        </div>
        <v-icon size="22">mdi-arrow-right-thin</v-icon>
        <div>
          <small>To</small>
          <strong>{{ relationship.toTable }}</strong>
          <code>{{ relationship.toColumn }}</code>
        </div>
      </div>
    </section>
  </v-slide-y-transition>
</template>

<script setup lang="ts">
import type { ExplorerRelationship } from '../../services/dataset/datasetExplorer.service';

defineProps<{
  relationship: ExplorerRelationship | null;
}>();

const emit = defineEmits<{
  close: [];
}>();
</script>

<style scoped>
.relationship-panel {
  position: absolute;
  right: 22px;
  bottom: 22px;
  z-index: 6;
  width: min(520px, calc(100% - 44px));
  padding: 16px;
  color: var(--askme-ink);
  border: 1px solid var(--askme-border-strong);
  border-radius: 24px;
  background: var(--askme-panel-gradient);
  box-shadow: var(--askme-shadow), var(--askme-glow);
  backdrop-filter: blur(22px);
}

.relationship-header {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
}

.relation-icon {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  color: var(--askme-primary);
  border: 1px solid var(--askme-border);
  border-radius: 16px;
  background: rgba(32, 242, 182, 0.12);
}

p,
h3 {
  margin: 0;
}

p {
  color: var(--askme-muted);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

h3 {
  margin-top: 2px;
  font-size: 18px;
  letter-spacing: -0.03em;
}

.relation-path {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  margin-top: 14px;
}

.relation-path > div {
  min-width: 0;
  padding: 12px;
  border: 1px solid rgba(151, 255, 221, 0.12);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.045);
}

small,
strong,
code {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

small {
  color: var(--askme-muted);
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
}

strong {
  margin-top: 4px;
  font-size: 13px;
}

code {
  margin-top: 7px;
  padding: 5px 8px;
  color: var(--askme-code-ink);
  border-radius: 10px;
  background: var(--askme-code-bg);
  font-size: 11px;
}
</style>
