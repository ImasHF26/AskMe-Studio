<template>
  <v-app>
    <v-main class="app-main">
      <router-view v-if="isPublicRoute" />
      <AppShell v-else>
        <router-view />
      </AppShell>
    </v-main>
  </v-app>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import AppShell from './components/layout/AppShell.vue';

const route = useRoute();
const isPublicRoute = computed(() => Boolean(route.meta.public));
</script>

<style scoped>
.app-main {
  background: transparent;
}
</style>
