<template>
  <aside class="insight-panel" :class="{ 'insight-panel--open': open }">
    <!-- Toggle handle -->
    <button class="panel-toggle" :title="open ? 'Fermer le panneau' : 'Ouvrir les insights'" @click="$emit('toggle')">
      <v-icon size="18">{{ open ? 'mdi-chevron-right' : 'mdi-chevron-left' }}</v-icon>
    </button>

    <template v-if="open">
      <!-- Header -->
      <div class="panel-header">
        <div class="panel-header-left">
          <v-icon size="20" color="teal">mdi-brain</v-icon>
          <div>
            <p class="panel-eyebrow">Intelligence Sémantique</p>
            <h3 class="panel-title">{{ sectorLabel }}</h3>
          </div>
        </div>
        <v-chip v-if="enriching" size="x-small" color="teal" variant="tonal">
          <v-progress-circular indeterminate size="10" width="2" class="mr-1" />
          Enrichissement…
        </v-chip>
        <v-chip v-else-if="lastProvider" size="x-small" :color="lastProvider.includes('fallback') ? 'amber' : 'teal'" variant="tonal">
          {{ lastProvider.replace('-fallback', '') }}
        </v-chip>
      </div>

      <!-- Tab selector -->
      <div class="panel-tabs">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="panel-tab"
          :class="{ active: activeTab === tab.key }"
          @click="activeTab = tab.key"
        >
          <v-icon size="14">{{ tab.icon }}</v-icon>
          {{ tab.label }}
          <span v-if="tab.count" class="tab-badge">{{ tab.count }}</span>
        </button>
      </div>

      <!-- Tab: Sector insights -->
      <div v-if="activeTab === 'insights'" class="panel-body">
        <template v-if="sectorInsights.length">
          <p class="panel-section-label">Questions analytiques recommandées</p>
          <ul class="insight-list">
            <li
              v-for="(insight, idx) in sectorInsights"
              :key="idx"
              class="insight-item"
              @click="$emit('use-insight', insight)"
            >
              <v-icon size="14" color="teal">mdi-lightbulb-outline</v-icon>
              <span>{{ insight }}</span>
            </li>
          </ul>
        </template>
        <div v-else-if="!enriching" class="panel-empty">
          <v-icon size="36" color="var(--askme-muted)">mdi-lightbulb-outline</v-icon>
          <p>Cliquez sur <strong>Enrichir avec le LLM</strong> pour obtenir des insights sectoriels.</p>
        </div>
      </div>

      <!-- Tab: Column suggestions -->
      <div v-else-if="activeTab === 'columns'" class="panel-body">
        <template v-if="columnSuggestions.length">
          <p class="panel-section-label">{{ columnSuggestions.length }} suggestions de colonnes</p>
          <div class="suggestion-list">
            <article
              v-for="col in columnSuggestions"
              :key="`${col.tableTechnicalName}.${col.technicalName}`"
              class="suggestion-card"
            >
              <div class="suggestion-card-top">
                <div class="suggestion-meta">
                  <code class="suggestion-technical">{{ col.tableTechnicalName }}.{{ col.technicalName }}</code>
                  <strong class="suggestion-name">{{ col.suggestedBusinessName }}</strong>
                </div>
                <v-btn
                  size="x-small"
                  color="teal"
                  variant="tonal"
                  icon="mdi-check"
                  title="Appliquer cette suggestion"
                  @click="$emit('apply-column', col)"
                />
              </div>
              <p v-if="col.description" class="suggestion-desc">{{ col.description }}</p>
              <div v-if="col.exampleQuestions?.length" class="suggestion-examples">
                <v-icon size="12">mdi-comment-question-outline</v-icon>
                <span v-for="(q, qi) in col.exampleQuestions.slice(0, 2)" :key="qi" class="example-question" @click="$emit('use-insight', q)">
                  {{ q }}
                </span>
              </div>
            </article>
          </div>
        </template>
        <div v-else-if="!enriching" class="panel-empty">
          <v-icon size="36" color="var(--askme-muted)">mdi-view-column-outline</v-icon>
          <p>Aucune suggestion de colonne. Lancez l'enrichissement LLM.</p>
        </div>
      </div>

      <!-- Tab: KPI suggestions -->
      <div v-else-if="activeTab === 'kpis'" class="panel-body">
        <template v-if="kpiSuggestions.length">
          <p class="panel-section-label">{{ kpiSuggestions.length }} KPIs suggérés</p>
          <div class="suggestion-list">
            <article v-for="kpi in kpiSuggestions" :key="kpi.name" class="suggestion-card kpi-suggestion-card">
              <div class="suggestion-card-top">
                <div class="suggestion-meta">
                  <strong class="suggestion-name">{{ kpi.name }}</strong>
                  <v-chip size="x-small" :color="formattingColor(kpi.formatting)" variant="tonal">{{ kpi.formatting }}</v-chip>
                </div>
                <v-btn
                  size="x-small"
                  color="teal"
                  variant="tonal"
                  icon="mdi-plus"
                  title="Ajouter ce KPI"
                  @click="$emit('apply-kpi', kpi)"
                />
              </div>
              <code class="kpi-formula">{{ kpi.sqlFormula }}</code>
              <p v-if="kpi.description" class="suggestion-desc">{{ kpi.description }}</p>
              <div v-if="kpi.insight" class="kpi-insight">
                <v-icon size="12" color="amber">mdi-star-four-points-outline</v-icon>
                <span>{{ kpi.insight }}</span>
              </div>
            </article>
          </div>
        </template>
        <div v-else-if="!enriching" class="panel-empty">
          <v-icon size="36" color="var(--askme-muted)">mdi-chart-line</v-icon>
          <p>Aucun KPI suggéré. Lancez l'enrichissement LLM.</p>
        </div>
      </div>

      <!-- Tab: Synonym suggestions -->
      <div v-else-if="activeTab === 'synonyms'" class="panel-body">
        <template v-if="synonymSuggestions.length">
          <p class="panel-section-label">{{ synonymSuggestions.length }} synonymes suggérés</p>
          <div class="suggestion-list">
            <article v-for="syn in synonymSuggestions" :key="`${syn.term}:${syn.mappedValue}`" class="suggestion-card synonym-suggestion-card">
              <div class="suggestion-card-top">
                <div class="synonym-pair">
                  <v-chip size="x-small" color="teal" variant="tonal">{{ syn.term }}</v-chip>
                  <v-icon size="14">mdi-arrow-right-thin</v-icon>
                  <code class="synonym-target">{{ syn.mappedValue }}</code>
                </div>
                <v-btn
                  size="x-small"
                  color="teal"
                  variant="tonal"
                  icon="mdi-plus"
                  title="Ajouter ce synonyme"
                  @click="$emit('apply-synonym', syn)"
                />
              </div>
              <p v-if="syn.rationale" class="suggestion-desc">{{ syn.rationale }}</p>
            </article>
          </div>
        </template>
        <div v-else-if="!enriching" class="panel-empty">
          <v-icon size="36" color="var(--askme-muted)">mdi-link-variant</v-icon>
          <p>Aucun synonyme suggéré. Lancez l'enrichissement LLM.</p>
        </div>
      </div>

      <!-- Enrich button -->
      <div class="panel-footer">
        <v-btn
          block
          color="teal"
          variant="tonal"
          prepend-icon="mdi-auto-fix"
          :loading="enriching"
          :disabled="enriching || !canEnrich"
          @click="$emit('enrich')"
        >
          Enrichir avec le LLM
        </v-btn>
        <p v-if="!canEnrich" class="panel-hint">Générez d'abord une proposition sémantique.</p>
        <p v-else class="panel-hint">Analyse le schéma et suggère des améliorations avec {{ providerLabel }}.</p>
      </div>
    </template>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { McpEnrichColumnResult, McpEnrichKpiResult, McpEnrichSynonymResult } from '../../types/semantic-mcp.types';

const props = defineProps<{
  open: boolean;
  enriching: boolean;
  canEnrich: boolean;
  sectorLabel: string;
  columnSuggestions: McpEnrichColumnResult[];
  kpiSuggestions: McpEnrichKpiResult[];
  synonymSuggestions: McpEnrichSynonymResult[];
  sectorInsights: string[];
  lastProvider: string;
  llmProvider: string;
}>();

defineEmits<{
  toggle: [];
  enrich: [];
  'apply-column': [col: McpEnrichColumnResult];
  'apply-kpi': [kpi: McpEnrichKpiResult];
  'apply-synonym': [syn: McpEnrichSynonymResult];
  'use-insight': [text: string];
}>();

const activeTab = ref<'insights' | 'columns' | 'kpis' | 'synonyms'>('insights');

const tabs = computed(() => [
  { key: 'insights', icon: 'mdi-lightbulb-outline', label: 'Insights', count: props.sectorInsights.length || 0 },
  { key: 'columns', icon: 'mdi-view-column-outline', label: 'Colonnes', count: props.columnSuggestions.length || 0 },
  { key: 'kpis', icon: 'mdi-chart-line', label: 'KPIs', count: props.kpiSuggestions.length || 0 },
  { key: 'synonyms', icon: 'mdi-link-variant', label: 'Synonymes', count: props.synonymSuggestions.length || 0 }
]);

const providerLabel = computed(() => {
  if (props.llmProvider === 'groq') return 'Groq';
  if (props.llmProvider === 'ollama') return 'Ollama local';
  if (props.llmProvider === 'openrouter') return 'OpenRouter';
  return 'le LLM configuré';
});

const formattingColor = (f: string) => {
  if (f === 'currency') return 'green';
  if (f === 'percent') return 'orange';
  if (f === 'integer') return 'blue';
  return 'teal';
};
</script>

<style scoped>
.insight-panel {
  position: relative;
  width: 44px;
  min-height: 100%;
  border-left: 1px solid var(--askme-border);
  background: var(--askme-panel-gradient);
  backdrop-filter: blur(14px);
  border-radius: 0 8px 8px 0;
  transition: width 0.28s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
  flex-shrink: 0;
}

.insight-panel--open {
  width: 340px;
}

.panel-toggle {
  position: absolute;
  top: 50%;
  left: 0;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 48px;
  background: var(--askme-panel);
  border: 1px solid var(--askme-border);
  border-left: none;
  border-radius: 0 8px 8px 0;
  cursor: pointer;
  color: var(--askme-muted);
  z-index: 2;
  transition: color 0.15s, background 0.15s;
}

.panel-toggle:hover {
  color: var(--askme-primary);
  background: var(--askme-subtle-surface);
}

.insight-panel--open .panel-toggle {
  left: auto;
  right: -25px;
}

.panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 16px 14px 10px;
  border-bottom: 1px solid var(--askme-border);
}

.panel-header-left {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.panel-eyebrow {
  margin: 0 0 2px;
  color: var(--askme-primary);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.panel-title {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--askme-ink);
  max-width: 200px;
  line-height: 1.3;
}

.panel-tabs {
  display: flex;
  border-bottom: 1px solid var(--askme-border);
  overflow-x: auto;
  scrollbar-width: none;
}

.panel-tabs::-webkit-scrollbar { display: none; }

.panel-tab {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 10px;
  font-size: 0.73rem;
  font-weight: 600;
  color: var(--askme-muted);
  white-space: nowrap;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  background: none;
  transition: color 0.15s, border-color 0.15s;
}

.panel-tab.active {
  color: var(--askme-primary);
  border-bottom-color: var(--askme-primary);
}

.tab-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  border-radius: 999px;
  background: rgba(32, 242, 182, 0.18);
  color: var(--askme-primary);
  font-size: 0.65rem;
  padding: 0 4px;
}

.panel-body {
  overflow-y: auto;
  max-height: calc(100vh - 280px);
  padding: 10px 12px;
}

.panel-section-label {
  margin: 0 0 8px;
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--askme-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.insight-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 6px;
}

.insight-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--askme-border);
  border-radius: 6px;
  background: var(--askme-subtle-surface);
  font-size: 0.8rem;
  color: var(--askme-ink);
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
}

.insight-item:hover {
  background: rgba(32, 242, 182, 0.06);
  border-color: var(--askme-primary);
}

.suggestion-list {
  display: grid;
  gap: 8px;
}

.suggestion-card {
  padding: 10px 12px;
  border: 1px solid var(--askme-border);
  border-radius: 8px;
  background: var(--askme-subtle-surface);
  transition: border-color 0.12s;
}

.suggestion-card:hover {
  border-color: rgba(32, 242, 182, 0.4);
}

.suggestion-card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.suggestion-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.suggestion-technical {
  font-size: 0.7rem;
  color: var(--askme-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.suggestion-name {
  font-size: 0.82rem;
  color: var(--askme-ink);
}

.suggestion-desc {
  margin: 0 0 6px;
  font-size: 0.76rem;
  color: var(--askme-muted);
  line-height: 1.4;
}

.suggestion-examples {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
}

.example-question {
  font-size: 0.7rem;
  color: var(--askme-primary);
  cursor: pointer;
  text-decoration: underline dotted;
}

.example-question:hover { text-decoration: underline; }

.kpi-formula {
  display: block;
  font-size: 0.75rem;
  color: var(--askme-code-ink);
  background: var(--askme-code-bg);
  border-radius: 5px;
  padding: 4px 7px;
  margin-bottom: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kpi-insight {
  display: flex;
  align-items: flex-start;
  gap: 5px;
  font-size: 0.73rem;
  color: var(--askme-muted);
  font-style: italic;
  margin-top: 4px;
}

.synonym-pair {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.synonym-target {
  font-size: 0.72rem;
  color: var(--askme-code-ink);
  background: var(--askme-code-bg);
  border-radius: 4px;
  padding: 2px 6px;
}

.panel-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 32px 16px;
  text-align: center;
}

.panel-empty p {
  margin: 0;
  font-size: 0.8rem;
  color: var(--askme-muted);
  line-height: 1.5;
}

.panel-footer {
  padding: 10px 12px;
  border-top: 1px solid var(--askme-border);
}

.panel-hint {
  margin: 6px 0 0;
  font-size: 0.7rem;
  color: var(--askme-muted);
  text-align: center;
}
</style>
