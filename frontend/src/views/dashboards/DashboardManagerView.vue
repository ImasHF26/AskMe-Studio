<template>
  <section class="dashboard-manager">
    <div class="manager-header premium-panel">
      <div class="header-copy">
        <h2>Tableaux de bord</h2>
        <p>Créez, gérez et ouvrez vos dashboards.</p>
      </div>
      <div class="header-actions">
        <v-text-field
          v-model="quickFilter"
          prepend-inner-icon="mdi-magnify"
          label="Rechercher"
          variant="outlined"
          density="compact"
          hide-details
        />
        <v-btn color="primary" size="small" prepend-icon="mdi-plus" @click="openCreateDialog">Nouveau dashboard</v-btn>
      </div>
    </div>

    <div class="manager-toolbar premium-panel">
      <div class="selection-summary">
        <v-chip v-if="selectedDashboard" size="small" color="primary" variant="tonal" prepend-icon="mdi-view-dashboard">
        {{ selectedDashboard.name }}
        </v-chip>
        <v-chip v-if="selectedDashboard" size="small" color="primary" variant="tonal" prepend-icon="mdi-database">
          {{ datasourceName(selectedDashboard.datasourceId) }}
        </v-chip>
        <span v-else>Sélectionnez un dashboard pour agir dessus.</span>
      </div>
      <v-spacer />
      <v-btn color="primary" size="small" :disabled="!selectedDashboard" prepend-icon="mdi-open-in-new" @click="openBuilder">
        Ouvrir Builder
      </v-btn>
      <v-btn size="small" variant="tonal" :disabled="!selectedDashboard" prepend-icon="mdi-presentation-play" @click="openViewer">
        Visualiser
      </v-btn>
      <v-btn size="small" variant="text" :disabled="!selectedDashboard" prepend-icon="mdi-pencil" @click="openEditDialog">
        Modifier
      </v-btn>
      <v-btn size="small" variant="text" :loading="dashboard.loading" prepend-icon="mdi-refresh" @click="reload">Rafraîchir</v-btn>
      <v-btn size="small" color="red-lighten-1" variant="text" :disabled="!selectedDashboard" prepend-icon="mdi-delete" @click="deleteSelected">
        Supprimer
      </v-btn>
    </div>

    <div class="grid-shell ag-theme-quartz premium-panel" :class="{ 'dark-grid': isDark }">
      <AgGridVue
        class="ag-grid"
        :column-defs="columnDefs"
        :row-data="dashboard.items"
        :default-col-def="defaultColDef"
        :animate-rows="true"
        :quick-filter-text="quickFilter"
        :suppress-cell-focus="true"
        :loading="dashboard.loading"
        overlay-loading-template="<span class='ag-overlay-loading-center'>Chargement des dashboards...</span>"
        overlay-no-rows-template="<span class='ag-overlay-loading-center'>Aucun dashboard. Créez-en un pour commencer.</span>"
        @row-clicked="selectRow"
        @row-double-clicked="openBuilder"
        @cell-clicked="handleCellAction"
      />
    </div>

    <v-dialog v-model="dialogOpen" max-width="720">
      <v-card class="dashboard-dialog">
        <div class="dialog-head">
          <div>
            <span class="eyebrow">{{ dialogMode === 'create' ? 'Nouveau tableau de bord' : 'Modifier tableau de bord' }}</span>
            <h3>{{ dialogMode === 'create' ? 'Créer un tableau de bord' : 'Modifier le tableau de bord' }}</h3>
          </div>
          <v-btn icon="mdi-close" variant="text" @click="dialogOpen = false" />
        </div>

        <v-card-text class="dialog-body">
          <v-alert v-if="dashboard.error" type="error" variant="tonal" density="compact">
            {{ dashboard.error }}
          </v-alert>
          <v-text-field v-model="form.name" label="Nom du tableau de bord" variant="outlined" density="comfortable" />
          <v-textarea v-model="form.description" label="Description" variant="outlined" density="comfortable" rows="3" />
          <v-select
            v-model="form.datasourceId"
            :items="datasourceOptions"
            label="Datasource"
            variant="outlined"
            density="comfortable"
            :disabled="dialogMode === 'edit'"
            :loading="datasource.loading"
          />
          <v-alert type="info" variant="tonal" density="compact">
            Le dashboard est créé vide. Les widgets et leurs données seront sauvegardés après validation dans le builder.
          </v-alert>
        </v-card-text>

        <v-card-actions class="px-5 pb-5">
          <v-spacer />
          <v-btn variant="text" @click="dialogOpen = false">Annuler</v-btn>
          <v-btn color="primary" :loading="dashboard.saving" :disabled="!canSave" @click="saveDashboard">
            {{ dialogMode === 'create' ? 'Créer' : 'Enregistrer' }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useTheme } from 'vuetify';
import { AgGridVue } from 'ag-grid-vue3';
import type { CellClickedEvent, ColDef, ICellRendererParams, RowClickedEvent } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';
import { useDashboardStore } from '../../stores/dashboard.store';
import { useDatasourceStore } from '../../stores/datasource.store';
import type { Dashboard } from '../../types';

const router = useRouter();
const theme = useTheme();
const dashboard = useDashboardStore();
const datasource = useDatasourceStore();

const quickFilter = ref('');
const selectedDashboard = ref<Dashboard | null>(null);
const dialogOpen = ref(false);
const dialogMode = ref<'create' | 'edit'>('create');
const form = reactive({
  id: '',
  name: '',
  description: '',
  datasourceId: ''
});

const isDark = computed(() => theme.global.current.value.dark);
const canSave = computed(() => Boolean(form.name.trim() && form.datasourceId));

const datasourceOptions = computed(() =>
  datasource.items.map((item) => ({
    title: `${item.name}${item.schema ? ` · ${item.schema}` : ''}`,
    value: item.id
  }))
);

const datasourceName = (datasourceId: string) => {
  const item = datasource.items.find((candidate) => candidate.id === datasourceId);
  return item ? `${item.name}${item.schema ? ` (${item.schema})` : ''}` : datasourceId || 'N/A';
};

type DashboardAction = 'builder' | 'view' | 'edit' | 'delete';

const renderActionButtons = (params: ICellRendererParams<Dashboard>) => {
  const actions: Array<{ action: DashboardAction; icon: string; label: string; danger?: boolean }> = [
    { action: 'builder', icon: 'mdi-open-in-new', label: 'Ouvrir Builder' },
    { action: 'view', icon: 'mdi-presentation-play', label: 'Visualiser' },
    { action: 'edit', icon: 'mdi-pencil', label: 'Modifier' },
    { action: 'delete', icon: 'mdi-delete', label: 'Supprimer', danger: true }
  ];

  const container = document.createElement('div');
  container.className = 'dashboard-row-actions';

  actions.forEach(({ action, icon, label, danger }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `dashboard-row-action${danger ? ' danger' : ''}`;
    button.dataset.dashboardAction = action;
    button.title = label;
    button.setAttribute('aria-label', `${label} ${params.data?.name || ''}`.trim());
    button.innerHTML = `<i class="mdi ${icon}" aria-hidden="true"></i>`;
    container.appendChild(button);
  });

  return container;
};

const columnDefs = computed<ColDef<Dashboard>[]>(() => [
  { field: 'name', headerName: 'Dashboard', minWidth: 220, checkboxSelection: true },
  {
    field: 'datasourceId',
    headerName: 'Datasource',
    minWidth: 220,
    valueFormatter: ({ value }) => datasourceName(String(value || ''))
  },
  { field: 'description', headerName: 'Description', flex: 1, minWidth: 260 },
  {
    headerName: 'Widgets',
    minWidth: 120,
    valueGetter: ({ data }) => data?.widgets.length || 0
  },
  {
    field: 'updatedAt',
    headerName: 'Dernière modification',
    minWidth: 190,
    valueFormatter: ({ value }) => (value ? new Date(String(value)).toLocaleString() : '')
  },
  {
    colId: 'actions',
    headerName: 'Actions',
    minWidth: 190,
    maxWidth: 210,
    pinned: 'right',
    sortable: false,
    filter: false,
    resizable: false,
    cellRenderer: renderActionButtons
  }
]);

const defaultColDef: ColDef = {
  flex: 1,
  sortable: true,
  filter: true,
  resizable: true
};

const reload = async () => {
  await Promise.all([datasource.fetchAll(), dashboard.fetchAll()]);
  if (selectedDashboard.value) {
    selectedDashboard.value = dashboard.items.find((item) => item.id === selectedDashboard.value?.id) || null;
  }
};

onMounted(async () => {
  await reload();
});

const selectRow = (event: RowClickedEvent<Dashboard>) => {
  selectedDashboard.value = event.data || null;
};

const handleCellAction = async (event: CellClickedEvent<Dashboard>) => {
  if (event.column.getColId() !== 'actions' || !event.data) return;

  const target = event.event?.target;
  if (!(target instanceof HTMLElement)) return;

  const button = target.closest<HTMLButtonElement>('[data-dashboard-action]');
  const action = button?.dataset.dashboardAction as DashboardAction | undefined;
  if (!action) return;

  selectedDashboard.value = event.data;

  if (action === 'builder') {
    await openBuilder();
    return;
  }

  if (action === 'view') {
    await openViewer();
    return;
  }

  if (action === 'edit') {
    openEditDialog();
    return;
  }

  await deleteSelected();
};

const resetForm = () => {
  form.id = '';
  form.name = 'Tableau de bord';
  form.description = '';
  form.datasourceId = datasource.selectedId || datasource.items[0]?.id || '';
};

const openCreateDialog = () => {
  dialogMode.value = 'create';
  dashboard.error = '';
  resetForm();
  dialogOpen.value = true;
};

const openEditDialog = () => {
  if (!selectedDashboard.value) return;
  dialogMode.value = 'edit';
  dashboard.error = '';
  form.id = selectedDashboard.value.id;
  form.name = selectedDashboard.value.name;
  form.description = selectedDashboard.value.description;
  form.datasourceId = selectedDashboard.value.datasourceId;
  dialogOpen.value = true;
};

const saveDashboard = async () => {
  if (!canSave.value) return;
  try {
    if (dialogMode.value === 'create') {
      const created = await dashboard.create({
        name: form.name.trim(),
        description: form.description.trim(),
        datasourceId: form.datasourceId
      });
      await dashboard.fetchAll();
      selectedDashboard.value = dashboard.items.find((item) => item.id === created.id) || created;
    } else if (form.id) {
      await dashboard.updateDashboard(form.id, {
        name: form.name.trim(),
        description: form.description.trim(),
        datasourceId: form.datasourceId
      });
      selectedDashboard.value = dashboard.items.find((item) => item.id === form.id) || selectedDashboard.value;
    }
    dialogOpen.value = false;
  } catch (error) {
    // Store error is shown in the dialog.
  }
};

const deleteSelected = async () => {
  if (!selectedDashboard.value) return;
  const id = selectedDashboard.value.id;
  await dashboard.deleteDashboard(id);
  selectedDashboard.value = null;
};

const openBuilder = async () => {
  if (!selectedDashboard.value) return;
  await router.push(`/dashboards/${selectedDashboard.value.id}/edit`);
};

const openViewer = async () => {
  if (!selectedDashboard.value) return;
  await router.push(`/dashboards/${selectedDashboard.value.id}/view`);
};
</script>

<style scoped>
.dashboard-manager {
  display: grid;
  gap: 10px;
}

.manager-header,
.manager-toolbar,
.grid-shell {
  border-radius: 16px;
}

.manager-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 72px;
  max-height: 80px;
  padding: 10px 14px 10px 18px;
}

.header-copy {
  min-width: 0;
}

.header-copy h2,
.header-copy p {
  margin: 0;
}

.header-copy h2 {
  color: var(--askme-ink);
  font-size: 22px;
  letter-spacing: -0.03em;
  line-height: 1.15;
}

.header-copy p {
  margin-top: 3px;
  color: var(--askme-muted);
  font-size: 13px;
  line-height: 1.35;
}

.header-actions {
  width: min(460px, 48%);
  display: grid;
  grid-template-columns: minmax(180px, 1fr) auto;
  align-items: center;
  gap: 8px;
}

.manager-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 48px;
  padding: 8px 10px;
  flex-wrap: wrap;
}

.selection-summary {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 6px;
}

.selection-summary span {
  color: var(--askme-muted);
  font-size: 12px;
}

.grid-shell {
  height: calc(100vh - 210px);
  min-height: 520px;
  padding: 10px;
}

.ag-grid {
  width: 100%;
  height: 100%;
}

:deep(.dashboard-row-actions) {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 100%;
}

:deep(.dashboard-row-action) {
  display: inline-grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 1px solid rgba(32, 242, 182, 0.22);
  border-radius: 8px;
  background: rgba(32, 242, 182, 0.08);
  color: var(--askme-ink);
  cursor: pointer;
  transition:
    background 0.16s ease,
    border-color 0.16s ease,
    transform 0.16s ease;
}

:deep(.dashboard-row-action:hover) {
  border-color: rgba(32, 242, 182, 0.46);
  background: rgba(32, 242, 182, 0.16);
  transform: translateY(-1px);
}

:deep(.dashboard-row-action.danger) {
  border-color: rgba(255, 107, 107, 0.24);
  background: rgba(255, 107, 107, 0.08);
  color: #ff6b6b;
}

:deep(.dashboard-row-action.danger:hover) {
  border-color: rgba(255, 107, 107, 0.5);
  background: rgba(255, 107, 107, 0.16);
}

:deep(.dashboard-row-action .mdi) {
  font-size: 17px;
  line-height: 1;
}

.dark-grid {
  --ag-background-color: rgba(8, 14, 22, 0.72);
  --ag-foreground-color: var(--askme-ink);
  --ag-header-background-color: rgba(32, 242, 182, 0.08);
  --ag-border-color: rgba(151, 255, 221, 0.14);
  --ag-row-hover-color: rgba(32, 242, 182, 0.08);
}

.dashboard-dialog {
  border: 1px solid var(--askme-border);
  border-radius: 26px !important;
  background: var(--askme-panel-gradient) !important;
}

.dialog-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 22px 24px 8px;
}

.dialog-head h3 {
  margin: 0;
  color: var(--askme-ink);
}

.dialog-body {
  display: grid;
  gap: 12px;
}

@media (max-width: 900px) {
  .manager-header {
    flex-direction: column;
    align-items: stretch;
    max-height: none;
  }

  .header-actions {
    width: 100%;
    grid-template-columns: 1fr;
  }
}
</style>
