<template>
  <v-card class="pa-4 datasource-manager" rounded="lg">
    <div class="d-flex align-center justify-space-between mb-3">
      <h3 class="text-h6">Data Sources</h3>
      <div class="d-flex align-center ga-2">
        <v-btn
          icon="mdi-database-import-outline"
          size="small"
          variant="tonal"
          :disabled="!canManage"
          aria-label="Remplir avec le datawarehouse de test"
          title="Remplir avec le datawarehouse de test"
          @click="fillTestWarehouse"
        />
        <v-btn size="small" variant="tonal" prepend-icon="mdi-refresh" @click="store.fetchAll" :loading="store.loading">
          Refresh
        </v-btn>
      </div>
    </div>

    <v-row class="mb-2">
      <v-col cols="12" md="6">
        <v-text-field v-model="name" label="Connection name" variant="outlined" density="comfortable" hide-details />
      </v-col>
      <v-col cols="12" md="2">
        <v-select
          v-model="type"
          :items="types"
          label="Type"
          variant="outlined"
          density="comfortable"
          hide-details
        />
      </v-col>
      <v-col cols="12" md="2">
        <v-text-field
          v-model="port"
          label="Port"
          type="number"
          variant="outlined"
          density="comfortable"
          hide-details
          placeholder="5432"
        />
      </v-col>
      <v-col cols="12" md="2">
        <v-text-field
          v-model="host"
          label="Host / URL"
          variant="outlined"
          density="comfortable"
          hide-details
          placeholder="localhost"
        />
      </v-col>
    </v-row>

    <v-row class="mb-3">
      <v-col cols="12" md="3">
        <v-text-field v-model="database" label="Database" variant="outlined" density="comfortable" hide-details />
      </v-col>
      <v-col cols="12" md="3">
        <v-text-field v-model="username" label="Username" variant="outlined" density="comfortable" hide-details />
      </v-col>
      <v-col cols="12" md="3">
        <v-text-field
          v-model="password"
          label="Password"
          type="password"
          variant="outlined"
          density="comfortable"
          hide-details
        />
      </v-col>
      <v-col cols="12" md="3" class="d-flex">
        <v-btn
          block
          variant="tonal"
          prepend-icon="mdi-database-search-outline"
          :loading="loadingSchemas"
          :disabled="!canLoadSchemas"
          @click="loadSchemas"
        >
          Charger les schemas
        </v-btn>
      </v-col>
    </v-row>

    <v-row class="mb-3">
      <v-col cols="12" md="8">
        <v-combobox
          v-model="schema"
          :items="availableSchemas"
          label="Schema PostgreSQL"
          placeholder="Choisir ou saisir un schema"
          variant="outlined"
          density="comfortable"
          hide-details
          :disabled="type !== 'postgresql'"
          :error="type === 'postgresql' && !schema.trim()"
        />
      </v-col>
      <v-col cols="12" md="4" class="d-flex ga-2">
        <v-btn
          v-if="editingId"
          variant="tonal"
          prepend-icon="mdi-close"
          @click="cancelEdit"
        >
          Annuler
        </v-btn>
        <v-btn
          block
          :color="editingId ? 'primary' : 'teal'"
          :loading="store.creating"
          :disabled="!canCreate"
          :prepend-icon="editingId ? 'mdi-check' : 'mdi-plus'"
          @click="saveDatasource"
        >
          {{ editingId ? 'Enregistrer' : 'Add' }}
        </v-btn>
      </v-col>
    </v-row>

    <v-alert v-if="schemaError" type="warning" variant="tonal" density="compact" class="mb-3">
      {{ schemaError }}
    </v-alert>

    <v-alert
      v-if="type !== 'postgresql'"
      type="warning"
      variant="tonal"
      density="compact"
      class="mb-3"
    >
      <v-icon icon="mdi-information-outline" size="small" class="mr-1" />
      Mode <strong>Profilage uniquement</strong> : l'exploration et la modélisation sémantique sont supportées. L'exécution des requêtes conversationnelles Text-to-SQL est actuellement réservée à PostgreSQL.
    </v-alert>

    <div class="d-flex align-center ga-2 mb-3">
      <v-btn
        size="small"
        variant="outlined"
        prepend-icon="mdi-connection"
        :loading="store.testing"
        :disabled="!canManage"
        @click="testConnection"
      >
        Test Connection
      </v-btn>
      <v-chip v-if="testMessage" :color="testOk ? 'green' : 'red'" size="small" variant="tonal">
        {{ testMessage }}
      </v-chip>
    </div>

    <v-alert v-if="!canManage" type="info" variant="tonal" class="mb-3">
      Viewer role has read-only access.
    </v-alert>

    <v-alert v-if="store.error" type="error" variant="tonal" class="mb-3">{{ store.error }}</v-alert>

    <v-list lines="two" border rounded="lg">
      <v-list-item
        v-for="item in store.items"
        :key="item.id"
        :title="item.name"
        :subtitle="`${item.type.toUpperCase()} • ${item.schema ? 'Schéma: ' + item.schema + ' • ' : ''}${formatDate(item.createdAt)}`"
        :active="store.selectedId === item.id"
        @click="selectDatasource(item.id)"
      >
        <template #append>
          <div class="d-flex align-center ga-2">
            <v-chip
              size="x-small"
              :color="item.type === 'postgresql' ? 'teal' : 'amber'"
              variant="tonal"
              class="font-weight-medium"
            >
              {{ item.type === 'postgresql' ? 'Requêtage interactif' : 'Profilage seul' }}
            </v-chip>
            <v-btn
              v-if="canManage"
              icon="mdi-pencil-outline"
              size="x-small"
              variant="text"
              color="primary"
              title="Modifier cette source"
              @click.stop="startEdit(item)"
            />
            <v-btn
              v-if="canManage"
              icon="mdi-delete-outline"
              size="x-small"
              variant="text"
              color="error"
              title="Supprimer cette source"
              @click.stop="promptDelete(item)"
            />
          </div>
        </template>
      </v-list-item>
    </v-list>

    <!-- Modal de confirmation de suppression en cascade -->
    <v-dialog v-model="deleteConfirmOpen" max-width="480">
      <v-card class="pa-4">
        <v-card-title class="d-flex align-center ga-2 text-h6 text-error">
          <v-icon icon="mdi-alert-octagon-outline" color="error" />
          Supprimer la source de données ?
        </v-card-title>
        <v-card-text>
          <p class="mb-2">
            Êtes-vous sûr de vouloir supprimer la source <strong>{{ sourceToDelete?.name }}</strong> ?
          </p>
          <v-alert type="warning" variant="tonal" density="compact" class="text-caption">
            <strong>Impact en cascade :</strong> cette action supprimera définitivement la source, sa couche sémantique associée, ses métriques (KPIs), synonymes et index vectoriels.
          </v-alert>
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="tonal" @click="deleteConfirmOpen = false">Annuler</v-btn>
          <v-btn color="error" variant="flat" :loading="deleting" @click="confirmDelete">
            Supprimer définitivement
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useAuthStore } from '../../stores/auth.store';
import { useDatasourceStore } from '../../stores/datasource.store';
import type { DatasourceType } from '../../types';

const store = useDatasourceStore();
const auth = useAuthStore();
const emit = defineEmits<{
  created: [id: string];
  tested: [ok: boolean];
  selected: [id: string];
}>();

const name = ref('');
const type = ref<DatasourceType>('postgresql');
const host = ref('');
const port = ref('');
const database = ref('');
const schema = ref('');
const username = ref('');
const password = ref('');
const testMessage = ref('');
const testOk = ref(false);
const availableSchemas = ref<string[]>([]);
const loadingSchemas = ref(false);
const schemaError = ref('');
const editingId = ref<string | null>(null);
const deleteConfirmOpen = ref(false);
const sourceToDelete = ref<any>(null);
const deleting = ref(false);
const types: DatasourceType[] = ['postgresql', 'mongodb', 'csv', 'excel'];
const testWarehouseConfig = {
  name: 'Datamart Vente',
  host: 'postgres-dwh',
  port: '5432',
  database: 'datawarehouse',
  username: 'dwadmin',
  password: 'dwpassword123',
  schema: 'dw'
};

const canManage = computed(() => auth.user?.role !== 'Viewer');
const canLoadSchemas = computed(
  () => canManage.value && type.value === 'postgresql' && Boolean(host.value.trim() && database.value.trim() && username.value.trim())
);
const canCreate = computed(() => canManage.value && Boolean(name.value.trim()) && (type.value !== 'postgresql' || Boolean(schema.value.trim())));

onMounted(() => {
  void store.fetchAll();
});

const resetForm = () => {
  editingId.value = null;
  name.value = '';
  host.value = '';
  port.value = '';
  database.value = '';
  username.value = '';
  password.value = '';
  schema.value = '';
  availableSchemas.value = [];
  schemaError.value = '';
  testMessage.value = '';
  testOk.value = false;
};

const startEdit = (item: any) => {
  editingId.value = item.id;
  name.value = item.name;
  type.value = item.type;
  schema.value = item.schema || '';
  if (item.schema) {
    availableSchemas.value = [item.schema];
  }
  // Faire défiler vers le haut pour afficher le formulaire
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

const cancelEdit = () => {
  resetForm();
};

const saveDatasource = async () => {
  const safeName = name.value.trim();
  if (!safeName || !canManage.value) return;
  const payload = buildPayload(safeName);
  if (!payload) return;

  if (editingId.value) {
    const updated = await store.update(editingId.value, payload);
    if (updated) {
      resetForm();
    }
    return;
  }

  const created = await store.create(payload);
  if (created) {
    emit('created', created.id);
    resetForm();
  }
};

const promptDelete = (item: any) => {
  sourceToDelete.value = item;
  deleteConfirmOpen.value = true;
};

const confirmDelete = async () => {
  if (!sourceToDelete.value) return;
  deleting.value = true;
  try {
    const id = sourceToDelete.value.id;
    await store.delete(id);
    deleteConfirmOpen.value = false;
    sourceToDelete.value = null;
    if (editingId.value === id) {
      resetForm();
    }
  } finally {
    deleting.value = false;
  }
};

const buildPayload = (fallbackName = 'Datasource Test') => {
  const parsedPort = port.value.trim() ? Number(port.value.trim()) : undefined;
  if (parsedPort !== undefined && (!Number.isInteger(parsedPort) || parsedPort <= 0 || parsedPort > 65535)) {
    testOk.value = false;
    testMessage.value = 'Port must be a valid number between 1 and 65535.';
    return null;
  }

  const credentials: Record<string, unknown> = {};
  if (username.value.trim()) credentials.username = username.value.trim();
  if (password.value.trim()) credentials.password = password.value.trim();

  const connectionConfig: Record<string, unknown> = {};
  if (host.value.trim()) connectionConfig.host = host.value.trim();
  if (parsedPort !== undefined) connectionConfig.port = parsedPort;
  if (database.value.trim()) connectionConfig.database = database.value.trim();
  if (type.value === 'postgresql' && schema.value.trim()) connectionConfig.schema = schema.value.trim();

  if ((type.value === 'csv' || type.value === 'excel') && name.value.trim()) {
    connectionConfig.fileName = name.value.trim();
  }

  return {
    name: name.value.trim() || fallbackName,
    type: type.value,
    credentials,
    connectionConfig
  };
};

const fillTestWarehouse = () => {
  if (!canManage.value) return;

  type.value = 'postgresql';
  name.value = testWarehouseConfig.name;
  host.value = testWarehouseConfig.host;
  port.value = testWarehouseConfig.port;
  database.value = testWarehouseConfig.database;
  username.value = testWarehouseConfig.username;
  password.value = testWarehouseConfig.password;
  schema.value = testWarehouseConfig.schema;
  availableSchemas.value = [testWarehouseConfig.schema];
  schemaError.value = '';
  testMessage.value = '';
  testOk.value = false;
};

const testConnection = async () => {
  if (!canManage.value) return;
  const payload = buildPayload();
  if (!payload) return;
  const result = await store.testConnection(payload);
  testOk.value = result.ok;
  testMessage.value = result.message;
  emit('tested', result.ok);
};

const loadSchemas = async () => {
  if (!canLoadSchemas.value) return;
  loadingSchemas.value = true;
  schemaError.value = '';
  const payload = buildPayload();
  if (!payload) {
    loadingSchemas.value = false;
    return;
  }

  try {
    const result = await store.fetchSchemas(payload);
    availableSchemas.value = result.schemas;
    schema.value = result.defaultSchema || result.schemas[0] || schema.value;
    if (!result.schemas.length) {
      schemaError.value = 'Aucun schema utilisateur trouve pour cette connexion.';
    }
  } finally {
    loadingSchemas.value = false;
  }
};

const formatDate = (value: string) => new Date(value).toLocaleString();

const selectDatasource = (id: string) => {
  store.setSelected(id);
  emit('selected', id);
};
</script>

<style scoped>
.datasource-manager {
  background: var(--askme-panel-gradient) !important;
  border: 1px solid var(--askme-border);
  box-shadow: var(--askme-shadow);
}

.datasource-manager :deep(.v-list-item) {
  border-radius: 8px !important;
  margin-bottom: 6px;
  transition: transform 180ms ease, background 180ms ease;
}

.datasource-manager :deep(.v-list-item:hover) {
  transform: translateX(3px);
  background: var(--askme-hover-surface);
}

.datasource-manager :deep(.v-list-item--active) {
  background: var(--askme-active-surface);
  border: 1px solid var(--askme-border-strong);
}
</style>
