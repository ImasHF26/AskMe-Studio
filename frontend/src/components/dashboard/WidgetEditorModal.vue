<template>
  <v-dialog :model-value="modelValue" max-width="720" @update:model-value="emit('update:modelValue', $event)">
    <v-card class="pa-4">
      <div class="d-flex align-center justify-space-between mb-3">
        <h3 class="text-h6">{{ mode === 'edit' ? 'Edit Widget' : 'New Widget' }}</h3>
        <v-btn icon="mdi-close" size="small" variant="text" @click="emit('update:modelValue', false)" />
      </div>

      <v-text-field v-model="title" label="Title" variant="outlined" density="comfortable" class="mb-3" />

      <v-row>
        <v-col cols="12" md="6">
          <v-select
            v-model="type"
            :items="widgetTypeItems"
            label="Type"
            variant="outlined"
            density="comfortable"
          />
        </v-col>
        <v-col cols="12" md="6">
          <v-select
            v-model="chartType"
            :items="chartTypeItems"
            label="Chart Type"
            variant="outlined"
            density="comfortable"
            :disabled="type !== 'chart' && type !== 'table'"
          />
        </v-col>
      </v-row>

      <v-textarea
        v-model="query"
        label="SQL Query (optional)"
        variant="outlined"
        density="comfortable"
        rows="3"
        class="mb-3"
      />

      <v-row>
        <v-col cols="6" md="3">
          <v-text-field v-model.number="x" type="number" label="X" variant="outlined" density="compact" />
        </v-col>
        <v-col cols="6" md="3">
          <v-text-field v-model.number="y" type="number" label="Y" variant="outlined" density="compact" />
        </v-col>
        <v-col cols="6" md="3">
          <v-text-field v-model.number="w" type="number" label="W" variant="outlined" density="compact" />
        </v-col>
        <v-col cols="6" md="3">
          <v-text-field v-model.number="h" type="number" label="H" variant="outlined" density="compact" />
        </v-col>
      </v-row>

      <v-textarea
        v-if="type === 'text'"
        v-model="textContent"
        label="Text Content"
        variant="outlined"
        density="comfortable"
        rows="3"
        class="mb-3"
      />

      <v-row v-if="type === 'kpi'">
        <v-col cols="12" md="6">
          <v-text-field v-model="kpiValue" label="KPI Value" variant="outlined" density="comfortable" />
        </v-col>
        <v-col cols="12" md="6">
          <v-text-field v-model="kpiCaption" label="KPI Caption" variant="outlined" density="comfortable" />
        </v-col>
        <v-col cols="12">
          <div class="kpi-color-field">
            <span>Couleur KPI</span>
            <v-btn-toggle v-model="kpiColor" mandatory divided class="kpi-color-toggle">
              <v-btn
                v-for="item in kpiColorItems"
                :key="item.value"
                :value="item.value"
                size="small"
                variant="text"
                :title="item.title"
                class="kpi-color-button"
              >
                <span class="kpi-swatch" :style="{ backgroundColor: item.hex }" />
              </v-btn>
            </v-btn-toggle>
          </div>
        </v-col>
      </v-row>

      <v-expansion-panels variant="accordion" class="mb-3">
        <v-expansion-panel>
          <v-expansion-panel-title>Configuration avancée JSON</v-expansion-panel-title>
          <v-expansion-panel-text>
            <v-textarea
              v-model="configJson"
              label="Widget config"
              variant="outlined"
              density="comfortable"
              rows="8"
              class="config-json"
            />
            <v-alert v-if="configError" type="warning" variant="tonal" density="compact">{{ configError }}</v-alert>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>

      <div class="d-flex justify-end ga-2 mt-2">
        <v-btn variant="text" @click="emit('update:modelValue', false)">Cancel</v-btn>
        <v-btn color="teal" :loading="loading" @click="save">Save</v-btn>
      </div>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import type { DashboardChartType, DashboardWidget, DashboardWidgetType } from '../../types';

const props = defineProps<{
  modelValue: boolean;
  mode: 'create' | 'edit';
  widget: DashboardWidget | null;
  loading?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  save: [
    payload: {
      title: string;
      type: DashboardWidgetType;
      position: { x: number; y: number; w: number; h: number };
      query: string;
      chartType: DashboardChartType;
      config: Record<string, unknown>;
    }
  ];
}>();

const title = ref('');
const type = ref<DashboardWidgetType>('chart');
const query = ref('');
const chartType = ref<DashboardChartType>('table');
const x = ref(0);
const y = ref(0);
const w = ref(6);
const h = ref(4);
const textContent = ref('');
const kpiValue = ref('');
const kpiCaption = ref('');
const kpiColor = ref('sky');
const configJson = ref('{}');
const configError = ref('');

const widgetTypeItems = [
  { title: 'Chart', value: 'chart' },
  { title: 'Table', value: 'table' },
  { title: 'KPI', value: 'kpi' },
  { title: 'Text', value: 'text' }
];

const chartTypeItems = [
  { title: 'Table', value: 'table' },
  { title: 'Bar', value: 'bar' },
  { title: 'Pie', value: 'pie' },
  { title: 'Line', value: 'line' }
];

const kpiColorItems = [
  { title: 'Rouge', value: 'red', hex: '#dc2626' },
  { title: 'Orange', value: 'orange', hex: '#ea580c' },
  { title: 'Jaune', value: 'yellow', hex: '#ca8a04' },
  { title: 'Vert', value: 'green', hex: '#16a34a' },
  { title: 'Sky', value: 'sky', hex: '#0284c7' },
  { title: 'Bleu', value: 'blue', hex: '#2563eb' },
  { title: 'Marron', value: 'brown', hex: '#92400e' },
  { title: 'Noir', value: 'black', hex: '#111827' }
];

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    hydrateForm();
  }
);

const hydrateForm = () => {
  if (!props.widget) {
    title.value = '';
    type.value = 'chart';
    query.value = '';
    chartType.value = 'table';
    x.value = 0;
    y.value = 0;
    w.value = 6;
    h.value = 4;
    textContent.value = '';
    kpiValue.value = '';
    kpiCaption.value = '';
    kpiColor.value = 'sky';
    configJson.value = '{}';
    configError.value = '';
    return;
  }

  title.value = props.widget.title;
  type.value = props.widget.type;
  query.value = props.widget.query || '';
  chartType.value = props.widget.chartType || 'table';
  x.value = props.widget.position.x;
  y.value = props.widget.position.y;
  w.value = props.widget.position.w;
  h.value = props.widget.position.h;
  textContent.value = String(props.widget.config.text || '');
  kpiValue.value = String(props.widget.config.value || '');
  kpiCaption.value = String(props.widget.config.caption || '');
  kpiColor.value = String(props.widget.config.color || props.widget.config.kpiColor || 'sky');
  configJson.value = JSON.stringify(props.widget.config || {}, null, 2);
  configError.value = '';
};

const save = () => {
  const safeTitle = title.value.trim();
  if (!safeTitle) return;

  let config: Record<string, unknown>;
  try {
    config = JSON.parse(configJson.value || '{}') as Record<string, unknown>;
    configError.value = '';
  } catch (error) {
    configError.value = 'La configuration JSON est invalide.';
    return;
  }

  if (type.value === 'text') {
    config.text = textContent.value;
  } else if (type.value === 'kpi') {
    config.value = kpiValue.value;
    config.caption = kpiCaption.value;
    config.color = kpiColor.value;
  }

  emit('save', {
    title: safeTitle,
    type: type.value,
    position: {
      x: Math.max(0, Math.floor(x.value || 0)),
      y: Math.max(0, Math.floor(y.value || 0)),
      w: Math.max(1, Math.floor(w.value || 1)),
      h: Math.max(1, Math.floor(h.value || 1))
    },
    query: query.value.trim(),
    chartType: chartType.value,
    config
  });
};
</script>

<style scoped>
.kpi-color-field {
  display: grid;
  gap: 8px;
  margin-bottom: 12px;
}

.kpi-color-field > span {
  color: rgba(var(--v-theme-on-surface), 0.72);
  font-size: 12px;
  font-weight: 700;
}

.kpi-color-toggle {
  width: max-content;
  max-width: 100%;
  overflow-x: auto;
}

.kpi-color-button {
  min-width: 38px;
}

.kpi-swatch {
  display: block;
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.72);
  border-radius: 999px;
  box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.18);
}
</style>
