<template>
  <div>
    <AIChatPanel />
    <QueryPreviewPanel />
    <DashboardCanvas :dashboard="null" />
  </div>
</template>

<script setup lang="ts">
import AIChatPanel from '../../components/chat/AIChatPanel.vue';
import DashboardCanvas from '../../components/dashboard/DashboardCanvas.vue';
import QueryPreviewPanel from '../../components/dashboard/QueryPreviewPanel.vue';
</script>
