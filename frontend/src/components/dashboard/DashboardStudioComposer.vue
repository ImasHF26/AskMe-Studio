<template>
  <section class="studio-composer premium-panel">
    <!-- En-tête compact : sur une ligne, tout horizontal -->
    <div class="studio-copy">
      <div class="studio-copy-left">
        <span class="eyebrow">Dashboard Studio</span>
        <h2>Créez un widget à partir du langage naturel</h2>
      </div>
      <p class="studio-copy-desc">
        Décrivez le besoin, AskMe génère le SQL et prépare le widget.
      </p>
    </div>

    <div class="studio-input">
      <v-textarea
        v-model="prompt"
        label="Besoin métier"
        placeholder="Ex. Afficher la répartition des ventes par client"
        variant="outlined"
        density="comfortable"
        rows="2"
        auto-grow
        max-rows="5"
        :disabled="disabled || generating"
      />
      <div class="studio-actions">
        <v-chip size="small" color="primary" variant="tonal">
          {{ datasourceLabel }}
        </v-chip>
        <v-spacer />
        <v-btn
          color="primary"
          :disabled="!canGenerate"
          :loading="generating"
          prepend-icon="mdi-auto-fix"
          @click="generatePreview"
        >
          Générer l’aperçu
        </v-btn>
      </div>
    </div>

    <v-alert v-if="error" type="error" variant="tonal" density="compact">{{ error }}</v-alert>

    <div v-if="preview" class="studio-preview">
      <div class="preview-controls">
        <v-text-field
          v-model="title"
          label="Titre du widget"
          variant="outlined"
          density="comfortable"
        />
        <v-select
          v-model="chartType"
          :items="chartTypeItems"
          label="Type de graphique"
          variant="outlined"
          density="comfortable"
        />
      </div>

      <div class="recommendation-strip">
        <v-chip color="primary" variant="tonal" prepend-icon="mdi-chart-areaspline" size="small">
          Recommandé : {{ preview.executed.chartType }}
        </v-chip>
        <v-chip color="primary" variant="tonal" prepend-icon="mdi-timer-outline" size="small">
          {{ preview.executed.executionMs }} ms
        </v-chip>
        <v-chip color="primary" variant="tonal" prepend-icon="mdi-table-row" size="small">
          {{ preview.executed.rows.length }} lignes
        </v-chip>
        <v-chip color="primary" variant="tonal" prepend-icon="mdi-shield-check-outline" size="small">
          {{ Math.round((preview.executed.confidence || preview.generated.confidence || 0) * 100) }}%
        </v-chip>
      </div>

      <v-tabs v-model="activeTab" class="studio-tabs" color="primary">
        <v-tab value="visual">Aperçu graphique</v-tab>
        <v-tab value="table">Aperçu tabulaire</v-tab>
        <v-tab value="sql">SQL & contexte</v-tab>
        <v-tab value="config">Configuration</v-tab>
      </v-tabs>

      <v-window v-model="activeTab">
        <v-window-item value="visual">
          <ChartWidget :columns="preview.executed.columns" :rows="preview.executed.rows" :chart-type="chartType" />
        </v-window-item>

        <v-window-item value="table">
          <ChartWidget :columns="preview.executed.columns" :rows="preview.executed.rows" chart-type="table" />
        </v-window-item>

        <v-window-item value="sql">
          <div class="sql-context">
            <div>
              <span class="eyebrow">SQL généré</span>
              <pre><code>{{ preview.generated.sql }}</code></pre>
            </div>
            <div class="context-panel">
              <span class="eyebrow">Contexte sémantique</span>
              <p>{{ preview.generated.reasoning }}</p>
              <div class="entity-list">
                <v-chip
                  v-for="entity in preview.generated.usedEntities || []"
                  :key="`${entity.type}-${entity.name}-${entity.technicalName || ''}`"
                  size="small"
                  color="primary"
                  variant="tonal"
                >
                  {{ entity.type }} · {{ entity.name }}
                </v-chip>
              </div>
            </div>
          </div>
        </v-window-item>

        <v-window-item value="config">
          <v-textarea
            v-model="configJson"
            label="Configuration JSON du widget"
            variant="outlined"
            density="comfortable"
            rows="12"
            class="config-editor"
          />
          <v-alert v-if="configError" type="warning" variant="tonal" density="compact">{{ configError }}</v-alert>
        </v-window-item>
      </v-window>

      <div class="confirm-row">
        <v-btn variant="tonal" :disabled="generating" prepend-icon="mdi-refresh" @click="generatePreview">
          Régénérer
        </v-btn>
        <v-spacer />
        <v-btn color="primary" :loading="saving" :disabled="!canConfirm" prepend-icon="mdi-plus-box" @click="confirmWidget">
          Valider et ajouter au dashboard
        </v-btn>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { apiClient } from '../../services/api/client';
import { useCopilotStore } from '../../stores/copilot.store';
import { getAskMeSessionId } from '../../utils/askmeSession';
import type {
  DashboardChartType,
  DashboardWidgetPosition,
  DashboardWidgetType,
  QueryExecuteResponse,
  QueryGenerateResponse
} from '../../types';
import ChartWidget from './ChartWidget.vue';

interface StudioPreview {
  generated: QueryGenerateResponse;
  executed: QueryExecuteResponse;
}

const props = defineProps<{
  disabled?: boolean;
  datasourceId: string;
  datasourceLabel: string;
  saving?: boolean;
  widgetCount: number;
}>();

const emit = defineEmits<{
  save: [
    payload: {
      title: string;
      type: DashboardWidgetType;
      position: DashboardWidgetPosition;
      query: string;
      chartType: DashboardChartType;
      config: Record<string, unknown>;
    }
  ];
}>();

const copilot = useCopilotStore();

const prompt = ref('');
const title = ref('');
const chartType = ref<DashboardChartType>('table');
const activeTab = ref('visual');
const generating = ref(false);
const error = ref('');
const configError = ref('');
const configJson = ref('');
const preview = ref<StudioPreview | null>(null);

const chartTypeItems = [
  { title: 'Tableau', value: 'table' },
  { title: 'Barres', value: 'bar' },
  { title: 'Donut / Pie', value: 'pie' },
  { title: 'Courbe', value: 'line' }
];

const datasourceLabel = computed(() => props.datasourceLabel || 'Aucune datasource sélectionnée');
const canGenerate = computed(() => Boolean(prompt.value.trim() && props.datasourceId && !props.disabled && !generating.value));
const canConfirm = computed(() => Boolean(preview.value && title.value.trim() && !configError.value));

const buildDefaultTitle = (value: string) => {
  const compact = value.trim().replace(/\s+/g, ' ');
  if (!compact) return `Widget ${props.widgetCount + 1}`;
  return compact.length > 72 ? `${compact.slice(0, 69)}...` : compact;
};

const buildWidgetConfig = () => {
  if (!preview.value) return {};
  return {
    datasourceId: props.datasourceId,
    prompt: prompt.value.trim(),
    generatedSql: preview.value.generated.sql,
    chartConfig: {
      chartType: chartType.value,
      recommendedChartType: preview.value.executed.chartType,
      visualTheme: 'askme-premium'
    },
    columns: preview.value.executed.columns,
    rows: preview.value.executed.rows,
    narrative: preview.value.executed.narrative,
    executionMs: preview.value.executed.executionMs,
    semanticContext: {
      confidence: preview.value.executed.confidence ?? preview.value.generated.confidence,
      reasoning: preview.value.generated.reasoning,
      usedEntities: preview.value.executed.usedEntities || preview.value.generated.usedEntities || [],
      provenance: preview.value.executed.provenance || preview.value.generated.provenance,
      warnings: Array.from(new Set([...(preview.value.generated.warnings || []), ...(preview.value.executed.warnings || [])]))
    }
  };
};

const syncConfigJson = () => {
  configJson.value = JSON.stringify(buildWidgetConfig(), null, 2);
  configError.value = '';
};

const generatePreview = async () => {
  if (!canGenerate.value) return;
  generating.value = true;
  error.value = '';
  configError.value = '';

  try {
    const sessionId = getAskMeSessionId();
    const generated = await apiClient.post<QueryGenerateResponse>('/copilot/query/generate', {
      question: prompt.value.trim(),
      datasourceId: props.datasourceId,
      sessionId,
      textToSqlProvider: copilot.textToSqlProvider
    });

    if (generated.data.status !== 'ok' || !generated.data.canExecute) {
      error.value = generated.data.reasoning || 'AskMe ne peut pas générer un widget fiable avec ce contexte.';
      preview.value = null;
      return;
    }

    const executed = await apiClient.post<QueryExecuteResponse>('/copilot/query/execute', {
      question: prompt.value.trim(),
      sql: generated.data.sql,
      datasourceId: props.datasourceId,
      sessionId
    });

    preview.value = {
      generated: generated.data,
      executed: {
        ...executed.data,
        warnings: Array.from(new Set([...(generated.data.warnings || []), ...(executed.data.warnings || [])]))
      }
    };
    chartType.value = executed.data.chartType;
    title.value = title.value.trim() || buildDefaultTitle(prompt.value);
    activeTab.value = executed.data.chartType === 'table' ? 'table' : 'visual';
    syncConfigJson();
  } catch (requestError) {
    error.value = 'Impossible de générer l’aperçu du widget. Vérifiez la datasource et la couche sémantique.';
  } finally {
    generating.value = false;
  }
};

const parseConfig = () => {
  try {
    const parsed = JSON.parse(configJson.value || '{}') as Record<string, unknown>;
    configError.value = '';
    return parsed;
  } catch (parseError) {
    configError.value = 'La configuration JSON est invalide.';
    return null;
  }
};

const confirmWidget = () => {
  if (!preview.value || !canConfirm.value) return;
  const config = parseConfig();
  if (!config) return;

  emit('save', {
    title: title.value.trim(),
    type: chartType.value === 'table' ? 'table' : 'chart',
    position: {
      x: 0,
      y: props.widgetCount * 4,
      w: chartType.value === 'table' ? 12 : 6,
      h: chartType.value === 'table' ? 5 : 6
    },
    query: preview.value.generated.sql,
    chartType: chartType.value,
    config
  });
};

watch(chartType, () => {
  if (!preview.value) return;
  const next = buildWidgetConfig();
  try {
    const current = JSON.parse(configJson.value || '{}') as Record<string, unknown>;
    configJson.value = JSON.stringify({ ...current, chartConfig: next.chartConfig }, null, 2);
  } catch (parseError) {
    syncConfigJson();
  }
});
</script>

<style scoped>
.studio-composer {
  display: grid;
  gap: 12px;
  padding: 16px 20px;
  border-radius: 0;
  background:
    radial-gradient(circle at 0% 0%, rgba(32, 242, 182, 0.14), transparent 34%),
    radial-gradient(circle at 100% 12%, rgba(103, 232, 249, 0.10), transparent 28%),
    var(--askme-panel-gradient);
}

/* En-tête compact horizontal */
.studio-copy {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--askme-border);
}

.studio-copy-left {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex-shrink: 0;
}

.studio-copy-desc {
  margin: 0;
  flex: 1;
  min-width: 200px;
  color: var(--askme-muted);
  font-size: 12px;
  line-height: 1.5;
}

.studio-copy h2 {
  margin: 0;
  color: var(--askme-ink);
  font-size: 16px;
  font-weight: 800;
  line-height: 1.2;
  letter-spacing: -0.02em;
}

.eyebrow {
  color: var(--askme-secondary);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.studio-input,
.studio-preview {
  display: grid;
  gap: 10px;
}

.studio-actions,
.confirm-row,
.recommendation-strip {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.confirm-row {
  position: sticky;
  bottom: 0;
  padding: 10px 0 2px;
  background: var(--askme-panel-gradient);
  border-top: 1px solid var(--askme-border);
  z-index: 1;
}

.preview-controls {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(220px, 0.6fr);
  gap: 12px;
}

.studio-tabs {
  border: 1px solid var(--askme-border);
  border-radius: 999px;
  background: var(--askme-subtle-surface);
}

.sql-context {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(260px, 0.8fr);
  gap: 14px;
}

.sql-context pre {
  max-height: 320px;
  margin: 0;
  overflow: auto;
  padding: 16px;
  border: 1px solid rgba(32, 242, 182, 0.18);
  border-radius: 18px;
  color: #c9ffee;
  background: rgba(2, 8, 14, 0.72);
}

.sql-context code,
.config-editor :deep(textarea) {
  font-family: "JetBrains Mono", "Fira Code", monospace;
  font-size: 12px;
  line-height: 1.65;
}

.context-panel {
  display: grid;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--askme-border);
  border-radius: 20px;
  background: var(--askme-subtle-surface);
}

.context-panel p {
  margin: 0;
  color: var(--askme-muted);
  font-size: 13px;
  line-height: 1.65;
}

.entity-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

@media (max-width: 900px) {
  .preview-controls,
  .sql-context {
    grid-template-columns: 1fr;
  }
}
</style>
