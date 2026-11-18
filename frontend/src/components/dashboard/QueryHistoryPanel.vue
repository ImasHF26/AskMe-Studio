<template>
  <v-card class="pa-3 mb-2 history-card" rounded="xl" border elevation="0">
    <div class="d-flex align-center justify-space-between mb-2">
      <h3 class="text-subtitle-1 font-weight-bold d-flex align-center ga-2">
        <v-icon icon="mdi-history" color="primary" size="20" />
        Historique & Sessions
      </h3>
      <v-btn
        size="x-small"
        variant="text"
        icon="mdi-refresh"
        :loading="copilot.loadingSessions || copilot.loadingHistory"
        title="Rafraîchir"
        @click="refreshAll"
      />
    </div>

    <v-tabs v-model="activeTab" density="compact" color="primary" class="mb-3 history-tabs">
      <v-tab value="sessions" class="text-caption font-weight-bold">
        <v-icon icon="mdi-chat-processing-outline" size="16" class="mr-1" />
        Conversations
        <v-chip size="x-small" color="primary" variant="flat" class="ml-1">
          {{ copilot.sessions.length }}
        </v-chip>
      </v-tab>
      <v-tab value="queries" class="text-caption font-weight-bold">
        <v-icon icon="mdi-code-braces" size="16" class="mr-1" />
        Requêtes SQL
        <v-chip v-if="copilot.history.length" size="x-small" variant="tonal" class="ml-1">
          {{ copilot.history.length }}
        </v-chip>
      </v-tab>
    </v-tabs>

    <v-window v-model="activeTab">
      <!-- Onglet Sessions -->
      <v-window-item value="sessions">
        <div class="d-flex align-center justify-space-between mb-3">
          <v-btn
            size="small"
            variant="tonal"
            color="primary"
            prepend-icon="mdi-plus"
            block
            rounded="lg"
            @click="handleNewSession"
          >
            Nouvelle discussion
          </v-btn>
        </div>

        <v-alert v-if="copilot.sessionsError" type="error" variant="tonal" density="compact" class="mb-3">
          {{ copilot.sessionsError }}
        </v-alert>

        <div v-if="copilot.loadingSessions && !copilot.sessions.length" class="text-center py-6">
          <v-progress-circular indeterminate color="primary" size="28" class="mb-2" />
          <p class="text-caption text-muted">Chargement des sessions...</p>
        </div>

        <div v-else-if="!copilot.sessions.length" class="text-center py-6 text-muted">
          <v-icon icon="mdi-chat-outline" size="40" class="mb-2 opacity-50" />
          <p class="text-body-2 font-weight-medium">Aucune session enregistrée</p>
          <p class="text-caption">Vos conversations s'afficheront ici automatiquement.</p>
        </div>

        <v-list v-else lines="two" class="sessions-list pa-0" bg-color="transparent">
          <v-list-item
            v-for="session in copilot.sessions"
            :key="session.id"
            :active="session.id === copilot.currentSessionId"
            rounded="lg"
            class="mb-2 session-item"
            :class="{ 'session-active': session.id === copilot.currentSessionId }"
            @click="handleSelectSession(session.id)"
          >
            <template #prepend>
              <v-icon
                :icon="session.id === copilot.currentSessionId ? 'mdi-chat-processing' : 'mdi-chat-outline'"
                :color="session.id === copilot.currentSessionId ? 'primary' : undefined"
                size="20"
              />
            </template>

            <v-list-item-title class="font-weight-medium text-truncate session-title">
              {{ session.title || 'Discussion sans titre' }}
            </v-list-item-title>

            <v-list-item-subtitle class="d-flex align-center ga-1 mt-1 text-caption">
              <span>{{ formatDate(session.updatedAt) }}</span>
              <span>•</span>
              <span>{{ session.messageCount }} msg</span>
              <v-chip
                v-if="session.id === copilot.currentSessionId"
                size="x-small"
                color="primary"
                variant="flat"
                class="ml-auto"
              >
                En cours
              </v-chip>
            </v-list-item-subtitle>

            <template #append>
              <v-btn
                icon="mdi-trash-can-outline"
                size="x-small"
                variant="text"
                color="error"
                title="Supprimer cette discussion"
                @click.stop="copilot.deleteSession(session.id)"
              />
            </template>
          </v-list-item>
        </v-list>
      </v-window-item>

      <!-- Onglet Requêtes SQL -->
      <v-window-item value="queries">
        <v-alert v-if="copilot.historyError" type="error" variant="tonal" density="compact" class="mb-3">
          {{ copilot.historyError }}
        </v-alert>

        <div v-if="copilot.loadingHistory && !copilot.history.length" class="text-center py-6">
          <v-progress-circular indeterminate color="primary" size="28" class="mb-2" />
          <p class="text-caption text-muted">Chargement des requêtes...</p>
        </div>

        <v-list v-else-if="copilot.history.length" lines="three" border rounded="lg" class="pa-0">
          <v-list-item
            v-for="item in copilot.history"
            :key="item.id"
            :title="item.question"
            :subtitle="formatDate(item.createdAt)"
            class="query-item"
          >
            <template #append>
              <v-chip size="x-small" variant="tonal">{{ t('history.sql') }}</v-chip>
            </template>
            <div class="text-caption mt-1 sql-preview">{{ item.sql }}</div>
          </v-list-item>
        </v-list>

        <v-alert v-else type="info" variant="tonal" density="compact">
          {{ t('history.empty') }}
        </v-alert>
      </v-window-item>
    </v-window>
  </v-card>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useCopilotStore } from '../../stores/copilot.store';

const emit = defineEmits<{
  'session-selected': [sessionId: string];
}>();

const copilot = useCopilotStore();
const { t } = useI18n();
const activeTab = ref<'sessions' | 'queries'>('sessions');

onMounted(() => {
  void copilot.loadSessions();
  void copilot.fetchHistory();
});

const refreshAll = () => {
  void copilot.loadSessions();
  void copilot.fetchHistory();
};

const handleNewSession = async () => {
  await copilot.createNewSession();
};

const handleSelectSession = async (sessionId: string) => {
  await copilot.switchSession(sessionId);
  emit('session-selected', sessionId);
};

const formatDate = (value: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (isNaN(date.getTime())) return value;
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { day: '2-digit', month: '2-digit' }) + ' ' +
    date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};
</script>

<style scoped>
.history-card {
  background: var(--askme-sidebar-bg) !important;
  border-color: var(--askme-border) !important;
}

.history-tabs :deep(.v-slide-group__content) {
  gap: 4px;
}

.session-item {
  border: 1px solid var(--askme-border);
  transition: all 0.18s ease;
  cursor: pointer;
}

.session-item:hover {
  background: rgba(37, 99, 235, 0.08) !important;
  border-color: rgba(37, 99, 235, 0.3);
}

.session-item.session-active {
  border-color: var(--askme-primary) !important;
  background: rgba(37, 99, 235, 0.12) !important;
}

.session-title {
  font-size: 13px;
  color: var(--askme-ink);
}

.sql-preview {
  opacity: 0.8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 340px;
  font-family: monospace;
}

.text-muted {
  color: var(--askme-muted);
}
</style>
