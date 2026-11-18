<template>
  <v-card class="pa-4 mb-4" rounded="xl">
    <h3 class="text-h6 mb-2">Narrative Insight</h3>

    <v-alert v-if="!copilot.result?.narrative" variant="tonal" type="info" density="compact">
      Run a query to generate narrative BI insights.
    </v-alert>

    <p v-else class="text-body-1">{{ copilot.result.narrative }}</p>
  </v-card>
</template>

<script setup lang="ts">
import { useCopilotStore } from '../../stores/copilot.store';

const copilot = useCopilotStore();
</script>
