<template>
  <section class="chatgpt-workspace">
    <header class="chat-header-bar">
      <div class="chat-header-left">
        <v-btn
          v-if="fromWorkflow"
          size="small"
          variant="tonal"
          prepend-icon="mdi-arrow-left"
          class="mr-2"
          to="/datasources?step=ask"
        >
          Retour workflow
        </v-btn>
        <v-btn
          size="small"
          variant="tonal"
          color="primary"
          prepend-icon="mdi-plus"
          class="new-chat-btn"
          @click="startNewConversation"
        >
          Nouvelle discussion
        </v-btn>
        <v-btn
          size="small"
          variant="text"
          prepend-icon="mdi-history"
          class="history-btn"
          @click="openSessionsDialog"
        >
          Historique
          <v-chip v-if="copilot.sessions.length" size="x-small" color="primary" variant="flat" class="ml-1">
            {{ copilot.sessions.length }}
          </v-chip>
        </v-btn>
      </div>

      <div class="chat-header-right">
        <span class="session-label text-truncate d-none d-md-inline" :title="currentSessionTitle">
          <v-icon icon="mdi-chat-processing-outline" size="14" class="mr-1 opacity-70" />
          {{ currentSessionTitle }}
        </span>

        <v-select
          v-model="selectedTextToSqlProvider"
          :items="textToSqlProviderItems"
          item-title="label"
          item-value="value"
          density="compact"
          variant="solo-filled"
          hide-details
          menu-icon="mdi-chevron-down"
          prepend-inner-icon="mdi-brain"
          aria-label="Choix LLM"
          class="provider-combo ml-2"
        />
      </div>
    </header>

    <nav
      v-if="promptNavigationItems.length"
      class="message-toc"
      aria-label="Navigation des messages"
    >
      <button
        v-for="(item, index) in promptNavigationItems"
        :key="item.id"
        type="button"
        class="message-toc-dot"
        :class="{ active: activeMessageId === item.id }"
        :aria-label="`Message ${index + 1}`"
        :title="item.label"
        @click="scrollToMessage(item.id)"
      />
    </nav>

    <div
      ref="threadRef"
      class="chat-thread"
      :class="{ empty: !displayedMessages.length }"
      @scroll.passive="handleThreadScroll"
    >
      <div v-if="!displayedMessages.length" class="welcome-state">
        <img class="ai-orb" :src="logoSrc" alt="AskMe Studio" />
        <div class="copilot-context">
          <p class="eyebrow">{{ t('chat.copilot') }}</p>
          <v-chip size="small" color="primary" variant="tonal">{{ t('chat.workspaceActive') }}</v-chip>
        </div>
        <h2>{{ t('chat.welcomeTitle') }}</h2>
        <span class="welcome-copy">
          {{ t('chat.welcomeCopy') }}
        </span>

      </div>

      <div v-else class="message-list">
        <article
          v-for="message in displayedMessages"
          :key="message.id"
          :ref="(el) => setMessageRef(message.id, el)"
          class="chat-message"
          :class="message.role"
        >
          <div class="avatar">
            <v-icon :icon="message.role === 'user' ? 'mdi-account' : 'mdi-creation'" size="18" />
          </div>
          <div class="bubble">
            <div class="message-meta">
              <span>{{ message.role === 'user' ? t('chat.user') : t('chat.copilot') }}</span>
              <v-chip v-if="message.role === 'assistant'" size="x-small" color="primary" variant="tonal">
                {{ t('chat.workspaceActive') }}
              </v-chip>
              <v-btn
                v-if="message.answerInfo"
                class="answer-info-trigger"
                icon="mdi-information-outline"
                size="x-small"
                variant="text"
                :aria-label="`Afficher les informations de la réponse AskMe`"
                @click="openAnswerInfo(message)"
              />
            </div>
            <p>{{ message.text }}</p>

            <div v-if="shouldShowResult(message)" class="answer-visual">
              <div class="visual-header">
                <div>
                  <strong>{{ getVisualTitle(message) }}</strong>
                  <span>{{ getVisualReasoning(message) }}</span>
                </div>
                <v-chip size="x-small" color="primary" variant="tonal">
                  {{ getConfidencePercent(message) }}
                </v-chip>
              </div>

              <v-alert
                v-if="getMessageWarnings(message).length"
                type="info"
                variant="tonal"
                density="compact"
                class="result-warning"
              >
                {{ getMessageWarnings(message)[0] }}
              </v-alert>

              <ChartWidget
                v-if="getMessageRows(message).length"
                :key="`chart_${message.id}`"
                :columns="getMessageColumns(message)"
                :rows="getMessageRows(message)"
                :chart-type="getMessageChartType(message)"
              />
            </div>
          </div>
        </article>
      </div>

      <div v-if="copilot.loading" class="thinking-row">
        <div class="avatar">
          <v-icon icon="mdi-creation" size="18" />
        </div>
        <div class="thinking-bubble">
          <span />
          <span />
          <span />
          <strong>{{ t('chat.thinking') }}</strong>
        </div>
      </div>

      <div ref="bottomRef" class="thread-bottom-anchor" aria-hidden="true" />
    </div>

    <v-btn
      v-if="showScrollToBottom"
      class="scroll-bottom-btn"
      color="primary"
      variant="flat"
      size="small"
      prepend-icon="mdi-arrow-down"
      @click="scrollToBottom"
    >
      Revenir en bas
    </v-btn>

    <v-alert v-if="copilot.error" type="error" variant="tonal" density="comfortable" class="chat-alert">
      {{ copilot.error }}
    </v-alert>

    <AskMeChatComposer
      v-model="question"
      class="composer-shell"
      :loading="copilot.loading"
      :datasource-label="datasourceLabel"
      :suggestions="presets"
      :placeholder="t('chat.placeholder')"
      @submit="submit"
      @open-datasource="emit('open-datasource')"
      @attach="handleAttach"
    />

    <v-dialog v-model="infoDialogOpen" max-width="940" scrollable>
      <v-card v-if="selectedAnswerInfo" class="answer-info-card">
        <div class="answer-info-hero">
          <div>
            <span class="eyebrow">AskMe Response Inspector</span>
            <h3>Informations sur la réponse</h3>
            <p>{{ selectedAnswerInfo.question }}</p>
          </div>
          <v-btn icon="mdi-close" variant="text" @click="infoDialogOpen = false" />
        </div>

        <v-card-text class="answer-info-body">
          <div class="info-metrics">
            <div class="info-metric">
              <span>Statut</span>
              <strong>{{ selectedAnswerInfo.status || 'ok' }}</strong>
            </div>
            <div class="info-metric">
              <span>Confiance</span>
              <strong>{{ formatPercent(selectedAnswerInfo.confidence) }}</strong>
            </div>
            <div class="info-metric">
              <span>Affichage</span>
              <strong>{{ selectedAnswerInfo.chartType || 'table' }}</strong>
            </div>
            <div class="info-metric">
              <span>Exécution</span>
              <strong>{{ selectedAnswerInfo.executionMs ?? 0 }} ms</strong>
            </div>
            <div class="info-metric">
              <span>Lignes</span>
              <strong>{{ selectedAnswerInfo.rowsCount ?? 0 }}</strong>
            </div>
          </div>

          <section class="info-section">
            <div class="section-title">
              <v-icon icon="mdi-brain" size="18" />
              <strong>Raisonnement</strong>
            </div>
            <p>{{ selectedAnswerInfo.reasoning || 'Aucun raisonnement détaillé fourni.' }}</p>
          </section>

          <section class="info-section">
            <div class="section-title">
              <v-icon icon="mdi-database-search" size="18" />
              <strong>Entités utilisées</strong>
            </div>
            <div v-if="selectedAnswerInfo.usedEntities?.length" class="entity-list">
              <v-chip
                v-for="entity in selectedAnswerInfo.usedEntities"
                :key="`${entity.type}-${entity.name}-${entity.technicalName || ''}`"
                size="small"
                color="primary"
                variant="tonal"
              >
                {{ entity.type }} · {{ entity.name }}
              </v-chip>
            </div>
            <p v-else>Aucune entité sémantique détaillée n’a été retournée.</p>
          </section>

          <section class="info-section sql-section">
            <div class="section-title">
              <v-icon icon="mdi-code-braces" size="18" />
              <strong>Requête SQL générée</strong>
              <v-spacer />
              <v-btn
                size="small"
                variant="tonal"
                color="primary"
                :prepend-icon="sqlCopied ? 'mdi-check' : 'mdi-content-copy'"
                @click="copySql"
              >
                {{ sqlCopied ? 'Copié' : 'Copier SQL' }}
              </v-btn>
            </div>
            <pre><code>{{ selectedAnswerInfo.sql || '-- Aucun SQL généré.' }}</code></pre>
          </section>

          <section v-if="selectedAnswerInfo.warnings?.length" class="info-section">
            <div class="section-title">
              <v-icon icon="mdi-alert-circle-outline" size="18" />
              <strong>Avertissements</strong>
            </div>
            <div class="warning-list">
              <v-alert
                v-for="warning in selectedAnswerInfo.warnings"
                :key="warning"
                type="info"
                variant="tonal"
                density="compact"
              >
                {{ warning }}
              </v-alert>
            </div>
          </section>

          <section class="info-section">
            <div class="section-title">
              <v-icon icon="mdi-source-branch" size="18" />
              <strong>Provenance</strong>
            </div>
            <div class="provenance-grid">
              <span>Datasource</span>
              <strong>{{ selectedAnswerInfo.datasourceId || selectedAnswerInfo.provenance?.datasourceId || 'N/A' }}</strong>
              <span>Table</span>
              <strong>{{ selectedAnswerInfo.provenance?.table?.businessName || 'N/A' }}</strong>
              <span>SQL validé</span>
              <strong>{{ selectedAnswerInfo.provenance?.sqlValidated ? 'Oui' : 'Non' }}</strong>
              <span>Colonnes</span>
              <strong>{{ selectedAnswerInfo.columns?.join(', ') || 'N/A' }}</strong>
            </div>
          </section>
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-dialog v-model="sessionsDialogOpen" max-width="600" scrollable>
      <v-card class="sessions-dialog-card" rounded="xl">
        <v-card-title class="d-flex align-center justify-space-between pa-4">
          <div class="d-flex align-center ga-2">
            <v-icon icon="mdi-history" color="primary" />
            <span class="text-h6 font-weight-bold">Historique des sessions</span>
          </div>
          <v-btn icon="mdi-close" variant="text" size="small" @click="sessionsDialogOpen = false" />
        </v-card-title>
        <v-divider />
        <v-card-text class="pa-4" style="max-height: 440px;">
          <div v-if="copilot.loadingSessions" class="text-center py-6 text-muted">
            <v-progress-circular indeterminate color="primary" size="32" class="mb-2" />
            <p>Chargement des sessions...</p>
          </div>
          <div v-else-if="!copilot.sessions.length" class="text-center py-8 text-muted">
            <v-icon icon="mdi-chat-outline" size="48" class="mb-2 opacity-50" />
            <p class="text-body-1 font-weight-medium">Aucune session enregistrée</p>
            <p class="text-caption">Vos conversations s'enregistreront automatiquement au fil de vos questions.</p>
          </div>
          <v-list v-else lines="two" class="sessions-list pa-0" bg-color="transparent">
            <v-list-item
              v-for="session in copilot.sessions"
              :key="session.id"
              :active="session.id === copilot.currentSessionId"
              rounded="lg"
              class="mb-2 session-item"
              @click="selectSession(session.id)"
            >
              <template #prepend>
                <v-icon
                  :icon="session.id === copilot.currentSessionId ? 'mdi-chat-processing' : 'mdi-chat-outline'"
                  :color="session.id === copilot.currentSessionId ? 'primary' : undefined"
                />
              </template>
              <v-list-item-title class="font-weight-medium text-truncate">
                {{ session.title }}
              </v-list-item-title>
              <v-list-item-subtitle class="d-flex align-center ga-2 mt-1 text-caption">
                <span>{{ formatDate(session.updatedAt) }}</span>
                <span>•</span>
                <span>{{ session.messageCount }} message(s)</span>
              </v-list-item-subtitle>
              <template #append>
                <v-btn
                  icon="mdi-trash-can-outline"
                  size="small"
                  variant="text"
                  color="error"
                  title="Supprimer cette discussion"
                  @click.stop="confirmDeleteSession(session.id)"
                />
              </template>
            </v-list-item>
          </v-list>
        </v-card-text>
        <v-divider />
        <v-card-actions class="pa-4">
          <v-btn
            prepend-icon="mdi-plus"
            color="primary"
            variant="flat"
            block
            rounded="lg"
            @click="startNewConversationFromDialog"
          >
            Démarrer une nouvelle discussion
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { useTheme } from 'vuetify';
import { useCopilotStore } from '../../stores/copilot.store';
import { useDatasourceStore } from '../../stores/datasource.store';
import type { ChatMessage, QueryExecuteResponse, TextToSqlProvider } from '../../types';
import ChartWidget from '../dashboard/ChartWidget.vue';
import AskMeChatComposer from './AskMeChatComposer.vue';

const props = withDefaults(
  defineProps<{
    hasHistoryDrawer?: boolean;
  }>(),
  {
    hasHistoryDrawer: false
  }
);

const route = useRoute();
const fromWorkflow = computed(() => route?.query?.from === 'workflow');
const theme = useTheme();
const { t, tm } = useI18n();
const copilot = useCopilotStore();
const datasource = useDatasourceStore();

const textToSqlProviderItems: Array<{ label: string; value: TextToSqlProvider }> = [
  { label: 'Auto (Ollama/Groq)', value: 'auto' },
  { label: 'Groq (Llama-3.3)', value: 'groq' },
  { label: 'OpenRouter (Gemma/GPT)', value: 'openrouter' },
  { label: 'Ollama local', value: 'ollama' },
  { label: 'Statique (Deterministic)', value: 'static' }
];

const selectedTextToSqlProvider = computed<TextToSqlProvider>({
  get: () => copilot.textToSqlProvider,
  set: (provider) => copilot.setTextToSqlProvider(provider)
});
const emit = defineEmits<{
  'open-datasource': [];
  'open-history': [];
  attach: [files: File[]];
}>();

const question = ref('');
const threadRef = ref<HTMLElement | null>(null);
const bottomRef = ref<HTMLElement | null>(null);
const infoDialogOpen = ref(false);
const selectedInfoMessage = ref<ChatMessage | null>(null);
const sqlCopied = ref(false);
const activeMessageId = ref('');
const showScrollToBottom = ref(false);
const shouldStickToBottom = ref(true);
const messageElements = new Map<string, HTMLElement>();

const logoSrc = computed(() =>
  theme.global.name.value === 'light'
    ? '/assets/images/icon_charte_graphique_light.png'
    : '/assets/images/icon_charte_graphique_light.png'
);

const presets = computed(() => tm('chat.suggestions') as string[]);

const displayedMessages = computed(() => copilot.messages);
const datasourceLabel = computed(() => datasource.selected?.name || t('chat.selectDatasource'));
const resultColumns = computed(() => copilot.result?.columns || []);
const resultRows = computed(() => copilot.result?.rows || []);
const resultWarnings = computed(() => copilot.result?.warnings || []);
const visualTitle = computed(() => (copilot.result?.chartType === 'table' ? 'Tableau de résultats' : 'Visualisation générée'));
const selectedAnswerInfo = computed(() => selectedInfoMessage.value?.answerInfo);
const promptNavigationItems = computed(() =>
  displayedMessages.value
    .filter((message) => message.role === 'user')
    .map((message, index) => ({
      id: message.id,
      label: `Message ${index + 1}: ${message.text.slice(0, 72)}`
    }))
);

const setMessageRef = (id: string, element: unknown) => {
  if (element instanceof HTMLElement) {
    messageElements.set(id, element);
    return;
  }
  messageElements.delete(id);
};

const isNearThreadBottom = () => {
  const thread = threadRef.value;
  if (!thread) return true;
  return thread.scrollHeight - thread.scrollTop - thread.clientHeight < 140;
};

const updateActiveMessage = () => {
  const thread = threadRef.value;
  if (!thread || !promptNavigationItems.value.length) {
    activeMessageId.value = '';
    return;
  }

  const threadTop = thread.getBoundingClientRect().top;
  let current = promptNavigationItems.value[0]?.id || '';
  for (const item of promptNavigationItems.value) {
    const element = messageElements.get(item.id);
    if (!element) continue;
    if (element.getBoundingClientRect().top - threadTop <= 120) {
      current = item.id;
    }
  }
  activeMessageId.value = current;
};

const syncScrollState = () => {
  const nearBottom = isNearThreadBottom();
  shouldStickToBottom.value = nearBottom;
  showScrollToBottom.value = displayedMessages.value.length > 0 && !nearBottom;
  updateActiveMessage();
};

const scrollToBottom = async () => {
  await nextTick();
  const elements = Array.from(messageElements.values());
  const target = bottomRef.value || elements[elements.length - 1];
  target?.scrollIntoView({
    behavior: 'smooth',
    block: 'end'
  });
  window.setTimeout(syncScrollState, 280);
};

const scrollToMessage = async (messageId: string) => {
  await nextTick();
  const target = messageElements.get(messageId);
  if (!target) return;
  target.scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
  activeMessageId.value = messageId;
  window.setTimeout(syncScrollState, 280);
};

const handleThreadScroll = () => {
  syncScrollState();
};

const submit = async (value?: string) => {
  const text = (value || question.value).trim();
  if (!text || copilot.loading) return;
  question.value = '';
  shouldStickToBottom.value = true;
  await copilot.runQuestion(text, datasource.selectedId || undefined);
};

const sessionsDialogOpen = ref(false);

const openSessionsDialog = async () => {
  await copilot.loadSessions();
  if (props.hasHistoryDrawer) {
    emit('open-history');
  } else {
    sessionsDialogOpen.value = true;
  }
};

const startNewConversation = () => {
  copilot.createNewSession(datasource.selectedId || undefined);
};

const startNewConversationFromDialog = () => {
  startNewConversation();
  sessionsDialogOpen.value = false;
};

const selectSession = async (sessionId: string) => {
  await copilot.switchSession(sessionId);
  sessionsDialogOpen.value = false;
  await scrollToBottom();
};

const confirmDeleteSession = async (sessionId: string) => {
  await copilot.deleteSession(sessionId);
};

const currentSessionTitle = computed(() => {
  const current = copilot.sessions.find((s) => s.id === copilot.currentSessionId);
  if (current) return current.title;
  const firstUser = displayedMessages.value.find((m) => m.role === 'user');
  return firstUser?.text ? firstUser.text.slice(0, 36) : 'Nouvelle session';
});

const formatDate = (isoString?: string) => {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return isoString;
  }
};

onMounted(async () => {
  await copilot.loadCurrentSession();
  await copilot.loadSessions();
});

const handleAttach = (files: File[]) => {
  emit('attach', files);
};

const openAnswerInfo = (message: ChatMessage) => {
  selectedInfoMessage.value = message;
  sqlCopied.value = false;
  infoDialogOpen.value = true;
};

const copySql = async () => {
  const sql = selectedAnswerInfo.value?.sql || '';
  if (!sql) return;
  await navigator.clipboard?.writeText(sql);
  sqlCopied.value = true;
  window.setTimeout(() => {
    sqlCopied.value = false;
  }, 1600);
};

const formatPercent = (value?: number) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'N/A';
  return `${Math.round(value * 100)}%`;
};

const getMessageResult = (message: ChatMessage): QueryExecuteResponse | null => {
  if (message.result) return message.result;
  const lastAssistant = [...displayedMessages.value].reverse().find((item) => item.role === 'assistant');
  if (copilot.result && lastAssistant?.id === message.id) return copilot.result;
  return null;
};

const shouldShowResult = (message: ChatMessage) => {
  if (message.role !== 'assistant') return false;
  const res = getMessageResult(message);
  return Boolean(res && res.rows && res.rows.length > 0);
};

const getVisualTitle = (message: ChatMessage) => {
  const res = getMessageResult(message);
  return res?.chartType === 'table' ? 'Tableau de résultats' : 'Visualisation générée';
};

const getVisualReasoning = (message: ChatMessage) => {
  return message.answerInfo?.reasoning || copilot.reasoning;
};

const getConfidencePercent = (message: ChatMessage) => {
  const res = getMessageResult(message);
  const conf = res?.confidence ?? message.answerInfo?.confidence ?? copilot.confidence ?? 1;
  return `${Math.round(conf * 100)}%`;
};

const getMessageWarnings = (message: ChatMessage) => {
  const res = getMessageResult(message);
  return res?.warnings || message.answerInfo?.warnings || [];
};

const getMessageRows = (message: ChatMessage) => {
  const res = getMessageResult(message);
  return (res?.rows as Array<Record<string, string | number>>) || message.answerInfo?.rows || [];
};

const getMessageColumns = (message: ChatMessage) => {
  const res = getMessageResult(message);
  return res?.columns || message.answerInfo?.columns || [];
};

const getMessageChartType = (message: ChatMessage) => {
  const res = getMessageResult(message);
  return (res?.chartType || message.answerInfo?.chartType || 'table') as 'line' | 'bar' | 'pie' | 'table';
};

watch(
  () => [copilot.messages.length, copilot.loading],
  async () => {
    await nextTick();
    const lastMessage = displayedMessages.value[displayedMessages.value.length - 1];
    const mustRevealBottom = copilot.loading || lastMessage?.role === 'assistant';
    if (mustRevealBottom || shouldStickToBottom.value || isNearThreadBottom()) {
      await scrollToBottom();
    } else {
      syncScrollState();
    }
  },
  { flush: 'post' }
);

watch(
  displayedMessages,
  async () => {
    await nextTick();
    for (const id of Array.from(messageElements.keys())) {
      if (!displayedMessages.value.some((message) => message.id === id)) {
        messageElements.delete(id);
      }
    }
    syncScrollState();
  }
);
</script>

<style scoped>
.chat-header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--askme-border);
  background: var(--askme-surface);
  min-height: 48px;
  z-index: 2;
}

.chat-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chat-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.provider-combo {
  width: 175px;
  max-width: 185px;
  flex: 0 0 175px;
}

.provider-combo :deep(.v-field) {
  border: 1px solid var(--askme-border);
  border-radius: 8px;
  background: var(--askme-subtle-surface);
  box-shadow: none;
  min-height: 32px;
}

.provider-combo :deep(.v-field__input) {
  min-height: 32px;
  padding-top: 0;
  padding-bottom: 0;
  font-size: 11px;
  font-weight: 700;
  color: var(--askme-ink);
}

.session-label {
  font-size: 12px;
  color: var(--askme-muted);
  font-weight: 500;
  max-width: 260px;
}

.session-item {
  cursor: pointer;
  border: 1px solid var(--askme-border);
  transition: all 0.2s ease;
}

.session-item:hover {
  background: rgba(var(--v-theme-primary), 0.08);
  border-color: rgba(var(--v-theme-primary), 0.3);
}

.sessions-dialog-card {
  background: var(--askme-surface) !important;
  border: 1px solid var(--askme-border);
}

.chatgpt-workspace {
  --chat-composer-clearance: 15rem;
  position: relative;
  height: calc(100vh - 116px);
  max-width: 980px;
  width: 100%;
  margin: 0 auto;
  overflow: hidden;
  padding-bottom: var(--chat-composer-clearance);
}

.chat-thread {
  height: calc(100vh - 116px - var(--chat-composer-clearance));
  min-height: 0;
  max-height: calc(100vh - 116px - var(--chat-composer-clearance));
  overflow-y: auto;
  padding: 3.375rem 0.625rem 1.5rem;
  border: 0;
  background: transparent;
  box-shadow: none;
  scroll-behavior: smooth;
  scroll-padding-bottom: 1.5rem;
}

.message-toc {
  position: fixed;
  top: 50%;
  right: 10vw;
  z-index: 18;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  width: 2.25rem;
  max-height: 50lvh;
  overflow-y: auto;
  padding: 0.25rem 0;
  transform: translateY(-50%);
  scrollbar-width: none;
}

.message-toc::-webkit-scrollbar {
  display: none;
}

.message-toc-dot {
  width: 1.125rem;
  height: 0.1875rem;
  flex: 0 0 auto;
  border: 0;
  border-radius: 999px;
  background: rgba(30, 41, 59, 0.28);
  cursor: pointer;
  transition: width 160ms ease, height 160ms ease, background 160ms ease, transform 160ms ease;
}

.message-toc-dot:hover {
  width: 1.5rem;
  background: rgba(32, 96, 160, 0.58);
}

.message-toc-dot.active {
  width: 1.75rem;
  height: 0.25rem;
  background: #2060a0;
  box-shadow: 0 0 0 0.1875rem rgba(6, 182, 212, 0.12);
}

.chat-thread.empty {
  display: grid;
  place-items: center;
}

.welcome-state {
  max-width: 740px;
  display: grid;
  justify-items: center;
  gap: 14px;
  text-align: center;
  animation: askme-rise 420ms ease both;
}

.eyebrow,
.welcome-state h2,
.welcome-copy {
  margin: 0;
}

.copilot-context {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
}

.eyebrow {
  color: var(--askme-secondary);
  font-size: 0.75rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.welcome-state h2 {
  color: var(--askme-ink);
  font-size: clamp(1.875rem, 5vw, 3.375rem);
  line-height: 1.04;
  letter-spacing: 0;
}

.welcome-copy {
  max-width: 620px;
  color: var(--askme-muted);
  font-size: 1rem;
  line-height: 1.65;
}

.ai-orb {
  width: 72px;
  height: 72px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: radial-gradient(circle, rgba(32, 242, 182, 0.22), rgba(103, 232, 249, 0.055));
  box-shadow: 0 0 60px rgba(32, 242, 182, 0.28);
}

.ai-orb span {
  width: 24px;
  height: 24px;
  border-radius: 999px;
  background: var(--askme-primary);
  animation: askme-pulse 2.2s ease-in-out infinite;
}

.message-list {
  display: grid;
  gap: 26px;
}

.chat-message,
.thinking-row {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  gap: 12px;
  align-items: flex-start;
  min-width: 0;
}

.chat-message.user {
  max-width: 74%;
  margin-left: auto;
  grid-template-columns: minmax(0, 1fr) 36px;
}

.chat-message.user .avatar {
  grid-column: 2;
  grid-row: 1;
}

.chat-message.user .bubble {
  grid-column: 1;
  grid-row: 1;
  background: linear-gradient(135deg, rgba(32, 96, 160, 0.12), rgba(6, 182, 212, 0.06));
  border-color: rgba(32, 96, 160, 0.24);
}

.chat-message.assistant {
  max-width: min(96%, 1200px);
  width: 100%;
}

.chat-message.assistant .bubble {
  border-color: rgba(15, 23, 42, 0.08);
  background: rgba(248, 250, 252, 0.68);
  backdrop-filter: blur(12px);
}

.avatar {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border: 1px solid var(--askme-border);
  border-radius: 999px;
  color: var(--askme-primary);
  background: var(--askme-subtle-surface);
}

.bubble,
.thinking-bubble {
  box-sizing: border-box;
  min-width: 0;
  max-width: 100%;
  padding: 13px 15px;
  overflow: hidden;
  border: 1px solid var(--askme-border);
  border-radius: 8px;
  color: var(--askme-ink);
  background: var(--askme-subtle-surface);
  backdrop-filter: blur(18px);
}

.message-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 5px;
  color: #1e293b;
  font-size: 0.875rem;
  font-weight: 800;
}

.answer-info-trigger {
  margin-inline-start: auto;
  color: var(--askme-muted);
}

.answer-info-trigger:hover {
  color: var(--askme-primary);
  background: rgba(32, 242, 182, 0.1);
}

.bubble p {
  max-height: min(42vh, 24rem);
  margin: 0;
  overflow-y: auto;
  overflow-wrap: anywhere;
  color: #0f172a;
  font-size: 1.0625rem;
  line-height: 1.72;
  white-space: pre-wrap;
  word-break: break-word;
  scrollbar-width: thin;
}

.bubble p::-webkit-scrollbar,
.answer-visual::-webkit-scrollbar {
  width: 0.375rem;
}

.bubble p::-webkit-scrollbar-thumb,
.answer-visual::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(32, 96, 160, 0.28);
}

.answer-visual {
  display: grid;
  gap: 14px;
  width: 100%;
  max-width: 100%;
  margin-top: 14px;
  padding: 14px;
  box-sizing: border-box;
  overflow: visible;
  border: 1px solid var(--askme-border);
  border-radius: 8px;
  background: var(--askme-panel-gradient);
  box-shadow: var(--askme-shadow);
}

.visual-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.visual-header div {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.visual-header strong {
  color: var(--askme-ink);
  font-size: 1.125rem;
}

.visual-header span {
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--askme-muted);
  font-size: 0.875rem;
  line-height: 1.45;
}

.thinking-bubble {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--askme-muted);
  font-size: 0.9375rem;
}

.thinking-bubble span {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--askme-primary);
  animation: askme-pulse 1.4s ease-in-out infinite;
}

.thinking-bubble span:nth-child(2) {
  animation-delay: 160ms;
}

.thinking-bubble span:nth-child(3) {
  animation-delay: 320ms;
}

.chat-alert {
  position: fixed;
  left: calc(280px + (100vw - 280px) / 2);
  bottom: 145px;
  z-index: 25;
  width: min(860px, calc(100vw - 360px));
  transform: translateX(-50%);
}

.thread-bottom-anchor {
  width: 100%;
  height: 1.5rem;
}

.scroll-bottom-btn {
  position: fixed;
  left: calc(280px + (100vw - 280px) / 2);
  bottom: calc(25px + var(--chat-composer-clearance));
  z-index: 26;
  transform: translateX(-50%);
  border-radius: 999px !important;
  background: #2060a0 !important;
  box-shadow: 0 1rem 2.5rem rgba(15, 23, 42, 0.18) !important;
}

.composer-shell {
  position: fixed;
  left: calc(280px + (100vw - 280px) / 2);
  bottom: 25px;
  z-index: 24;
  width: min(60%, calc(100vw - 420px));
  max-width: calc(100vw - 420px);
  transform: translateX(-50%);
}

.answer-info-card {
  overflow: hidden;
  border: 1px solid var(--askme-border);
  border-radius: 28px !important;
  color: var(--askme-ink);
  background:
    radial-gradient(circle at 12% 0%, rgba(32, 242, 182, 0.18), transparent 34%),
    radial-gradient(circle at 90% 12%, rgba(103, 232, 249, 0.16), transparent 32%),
    var(--askme-surface);
  box-shadow: 0 34px 90px rgba(0, 0, 0, 0.4);
}

.answer-info-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 24px 26px;
  border-bottom: 1px solid var(--askme-border);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.07), rgba(32, 242, 182, 0.06));
}

.answer-info-hero h3,
.answer-info-hero p {
  margin: 0;
}

.answer-info-hero h3 {
  color: var(--askme-ink);
  font-size: 1.5rem;
  letter-spacing: 0;
}

.answer-info-hero p {
  max-width: 720px;
  margin-top: 8px;
  color: var(--askme-muted);
  font-size: 0.875rem;
  line-height: 1.55;
}

.answer-info-body {
  display: grid;
  gap: 16px;
  padding: 20px 26px 26px !important;
}

.info-metrics {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
}

.info-metric,
.info-section {
  border: 1px solid var(--askme-border);
  background: var(--askme-subtle-surface);
  backdrop-filter: blur(18px);
}

.info-metric {
  display: grid;
  gap: 4px;
  min-height: 76px;
  padding: 13px;
  border-radius: 18px;
}

.info-metric span,
.provenance-grid span {
  color: var(--askme-muted);
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.info-metric strong,
.provenance-grid strong {
  min-width: 0;
  overflow: hidden;
  color: var(--askme-ink);
  font-size: 1rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.info-section {
  display: grid;
  gap: 12px;
  padding: 16px;
  border-radius: 20px;
}

.info-section p {
  margin: 0;
  color: var(--askme-muted);
  font-size: 0.9375rem;
  line-height: 1.65;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--askme-primary);
}

.section-title strong {
  color: var(--askme-ink);
  font-size: 1rem;
}

.entity-list,
.warning-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.warning-list {
  display: grid;
}

.sql-section pre {
  max-height: 260px;
  margin: 0;
  overflow: auto;
  padding: 16px;
  border: 1px solid rgba(32, 242, 182, 0.16);
  border-radius: 16px;
  color: #c9ffee;
  background: rgba(2, 8, 14, 0.72);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.sql-section code {
  font-family: "JetBrains Mono", "Fira Code", monospace;
  font-size: 0.9375rem;
  line-height: 1.65;
  white-space: pre-wrap;
}

.provenance-grid {
  display: grid;
  grid-template-columns: 150px minmax(0, 1fr);
  gap: 9px 14px;
  align-items: center;
}

@media (max-width: 760px) {
  .chatgpt-workspace {
    --chat-composer-clearance: 16rem;
    height: calc(100vh - 120px);
    padding-bottom: var(--chat-composer-clearance);
  }

  .chat-thread {
    height: calc(100vh - 120px - var(--chat-composer-clearance));
    min-height: 0;
    max-height: calc(100vh - 120px - var(--chat-composer-clearance));
    padding: 4rem 0 1.5rem;
  }

  .chat-message.user {
    max-width: 100%;
  }

  .chat-alert,
  .composer-shell,
  .scroll-bottom-btn {
    left: 50%;
    width: calc(100vw - 32px);
  }

  .message-toc {
    right: 0.375rem;
    width: 1.75rem;
  }

  .info-metrics {
    grid-template-columns: 1fr 1fr;
  }

  .provenance-grid {
    grid-template-columns: 1fr;
  }
}
</style>
