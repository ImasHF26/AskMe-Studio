<template>
  <section class="dashboard-viewer">
    <header class="viewer-hero premium-panel">
      <div>
        <span class="eyebrow">Dashboard Live View</span>
        <h2>{{ dashboard.current?.name || 'Tableau de bord' }}</h2>
        <p>{{ dashboard.current?.description || 'Visualisation du tableau de bord sauvegardé.' }}</p>
      </div>
      <div class="viewer-actions">
        <v-chip color="primary" variant="tonal" prepend-icon="mdi-database">
          {{ currentDashboardDatasourceLabel }}
        </v-chip>
        <v-btn
          variant="tonal"
          prepend-icon="mdi-pencil-ruler"
          :disabled="!dashboard.current"
          :to="dashboard.current ? `/dashboards/${dashboard.current.id}/edit` : undefined"
        >
          Modifier
        </v-btn>
        <v-btn variant="tonal" prepend-icon="mdi-table" to="/dashboards">Liste dashboards</v-btn>
        <v-btn variant="tonal" :loading="dashboard.loading" prepend-icon="mdi-refresh" @click="reload">
          Rafraîchir
        </v-btn>
      </div>
    </header>

    <DashboardCanvas
      :dashboard="dashboard.current"
      readonly
      kicker="Dashboard Live View"
      :title="dashboard.current?.name || 'Tableau de bord'"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import DashboardCanvas from '../../components/dashboard/DashboardCanvas.vue';
import { useDashboardStore } from '../../stores/dashboard.store';
import { useDatasourceStore } from '../../stores/datasource.store';

const route = useRoute();
const router = useRouter();
const dashboard = useDashboardStore();
const datasource = useDatasourceStore();

const routeDashboardId = computed(() => {
  const raw = route.params.dashboardId;
  return typeof raw === 'string' ? raw : '';
});

const datasourceName = (datasourceId: string) => {
  const item = datasource.items.find((candidate) => candidate.id === datasourceId);
  return item ? `${item.name}${item.schema ? ` (${item.schema})` : ''}` : datasourceId || 'Datasource inconnue';
};

const currentDashboardDatasourceLabel = computed(() =>
  dashboard.current?.datasourceId ? datasourceName(dashboard.current.datasourceId) : 'Aucune datasource liée'
);

let loadSequence = 0;

const loadDashboard = async (targetId = routeDashboardId.value) => {
  const sequence = ++loadSequence;
  await datasource.fetchAll();
  if (!targetId) {
    await router.replace('/dashboards');
    return;
  }

  try {
    await dashboard.open(targetId);
    if (sequence !== loadSequence) return;
  } catch (error) {
    await router.replace('/dashboards');
  }
};

const reload = async () => {
  if (!dashboard.current?.id) return;
  await dashboard.open(dashboard.current.id);
};

watch(
  routeDashboardId,
  async (targetId) => {
    await loadDashboard(targetId);
  },
  { immediate: true }
);
</script>

<style scoped>
.dashboard-viewer {
  min-height: calc(100vh - 100px);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 14px;
}

.viewer-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 20px 22px;
  border-radius: 28px;
}

.viewer-hero h2,
.viewer-hero p {
  margin: 0;
}

.viewer-hero h2 {
  color: var(--askme-ink);
  font-size: clamp(28px, 4vw, 46px);
  line-height: 1;
  letter-spacing: -0.06em;
}

.viewer-hero p {
  max-width: 760px;
  margin-top: 8px;
  color: var(--askme-muted);
}

.viewer-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

@media (max-width: 900px) {
  .viewer-hero {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
