<template>
  <v-card class="pa-4 mb-4 query-panel" rounded="lg">
    <div class="d-flex align-center justify-space-between mb-2">
      <h3 class="text-h6">Generated Query</h3>
      <v-chip size="small" color="blue" variant="tonal">
        Confidence: {{ Math.round(copilot.confidence * 100) || 0 }}%
      </v-chip>
    </div>

    <v-alert v-if="!copilot.generatedSql" variant="tonal" type="info" density="compact" class="mb-3">
      Run a question to generate SQL preview.
    </v-alert>

    <pre v-else class="query-block">{{ copilot.generatedSql }}</pre>

    <v-alert v-if="copilot.reasoning" variant="tonal" type="success" density="compact">
      {{ copilot.reasoning }}
    </v-alert>
  </v-card>
</template>

<script setup lang="ts">
import { useCopilotStore } from '../../stores/copilot.store';

const copilot = useCopilotStore();
</script>

<style scoped>
.query-block {
  background: var(--askme-code-bg);
  border: 1px solid var(--askme-border);
  border-radius: 8px;
  padding: 12px;
  font-size: 13px;
  color: var(--askme-code-ink);
  overflow-x: auto;
  margin-bottom: 12px;
  white-space: pre-wrap;
  box-shadow: inset 0 0 28px rgba(32, 242, 182, 0.055);
}

.query-panel {
  background: var(--askme-panel-gradient) !important;
}
</style>
