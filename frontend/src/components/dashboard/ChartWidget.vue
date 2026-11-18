<template>
  <v-sheet
    class="pa-4 chart-shell"
    :class="{ 'chart-fullscreen': isFullscreen }"
    rounded="xl"
    border
  >
    <div v-if="isFullscreen" class="chart-backdrop" @click="toggleFullscreen" />

    <div class="chart-header">
      <div>
        <span class="eyebrow">AskMe Visual</span>
        <strong>{{ chartTypeLabel }}</strong>
      </div>
      <div class="d-flex align-center ga-2">
        <v-chip v-if="hasForecast" size="x-small" color="purple" variant="flat" prepend-icon="mdi-chart-timeline-variant">
          Prévision
        </v-chip>
        <v-chip size="x-small" color="primary" variant="tonal">{{ rows.length }} lignes</v-chip>
        <v-btn
          :icon="isFullscreen ? 'mdi-fullscreen-exit' : 'mdi-fullscreen'"
          size="x-small"
          variant="text"
          :title="isFullscreen ? 'Réduire' : 'Plein écran'"
          @click="toggleFullscreen"
        />
      </div>
    </div>

    <div class="chart-body" :class="{ 'chart-body-fullscreen': isFullscreen }">
      <div v-if="!rows.length" class="empty-state">Aucune donnée à afficher.</div>

      <div v-else-if="isTable" class="table-wrap">
        <table>
          <thead>
            <tr>
              <th v-for="column in columns" :key="column">{{ column }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, idx) in rows" :key="idx">
              <td v-for="column in columns" :key="column">{{ row[column] }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div
        v-else
        ref="chartEl"
        class="apex-chart"
        :style="{ height: `${chartHeight}px`, minHeight: '260px' }"
      />
    </div>
  </v-sheet>
</template>

<script setup lang="ts">
import ApexCharts, { type ApexOptions } from 'apexcharts';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

type ChartType = 'line' | 'bar' | 'pie' | 'table';

const props = defineProps<{
  columns: string[];
  rows: Array<Record<string, string | number>>;
  chartType: ChartType;
}>();

const chartEl = ref<HTMLElement | null>(null);
const chartInstanceId = `chart_${Math.random().toString(36).slice(2, 9)}`;
let chart: ApexCharts | null = null;
const chartHeight = ref(320);
const isFullscreen = ref(false);

const DEFAULT_PALETTE = ['#2563eb', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#14b8a6', '#f97316'];

const toggleFullscreen = () => {
  isFullscreen.value = !isFullscreen.value;
  if (isFullscreen.value && typeof window !== 'undefined') {
    chartHeight.value = Math.max(460, window.innerHeight - 160);
  } else {
    chartHeight.value = 320;
  }
  void renderChart();
};

const handleWindowResize = () => {
  if (isFullscreen.value && typeof window !== 'undefined') {
    const nextH = Math.max(460, window.innerHeight - 160);
    if (Math.abs(nextH - chartHeight.value) > 10) {
      chartHeight.value = nextH;
      void renderChart();
    }
  }
};

const isTable = computed(() => props.chartType === 'table' || props.columns.length < 2);

const chartTypeLabel = computed(() => {
  const labels: Record<ChartType, string> = {
    line: 'Courbe chronologique',
    bar: 'Comparaison',
    pie: 'Répartition',
    table: 'Tableau'
  };
  return labels[props.chartType] || labels.table;
});

const labelColumn = computed(() => {
  if (props.columns.length <= 1) return props.columns[0] || 'label';
  return props.columns[0];
});

const valueColumn = computed(() => {
  if (props.columns.length <= 1) return props.columns[0] || 'value';
  const otherCols = props.columns.filter((c) => c !== labelColumn.value && c !== 'Type' && c !== 'type');

  // Prefer metric-named numeric columns
  const metricKeywords = ['nombre', 'count', 'total', 'ca', 'montant', 'chiffre', 'ventes', 'quantite', 'profit', 'marge', 'valeur', 'sum', 'avg'];
  const preferred = otherCols.find((col) => {
    const lower = col.toLowerCase();
    const isMetricNamed = metricKeywords.some((k) => lower.includes(k));
    const hasNum = props.rows.some((row) => {
      const v = row[col];
      return typeof v === 'number' || (typeof v === 'string' && !isNaN(Number(v)) && v.trim() !== '');
    });
    return isMetricNamed && hasNum;
  });
  if (preferred) return preferred;

  // Otherwise, first non-label column that has numbers
  const anyNumeric = otherCols.find((col) =>
    props.rows.some((row) => {
      const v = row[col];
      return typeof v === 'number' || (typeof v === 'string' && !isNaN(Number(v)) && v.trim() !== '');
    })
  );
  if (anyNumeric) return anyNumeric;

  return otherCols[0] || props.columns[1] || props.columns[0];
});

const parseNumericValue = (val: unknown): number => {
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  if (val === null || val === undefined || val === '') return 0;
  const num = Number(String(val).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(num) ? num : 0;
};

const formatRowLabel = (row: Record<string, any>, fallbackKey: string): string => {
  if (row.periode !== undefined && row.periode !== null) return String(row.periode);
  if (row.period !== undefined && row.period !== null) return String(row.period);

  const monthKeys = ['mois', 'month', 'nom_mois', 'month_name'];
  const yearKeys = ['annee', 'year', 'an'];

  const foundMonthKey = Object.keys(row).find((k) => monthKeys.includes(k.toLowerCase()));
  const foundYearKey = Object.keys(row).find((k) => yearKeys.includes(k.toLowerCase()));

  if (foundMonthKey && foundYearKey) {
    const rawMonth = row[foundMonthKey];
    const rawYear = row[foundYearKey];
    const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
    const monthNum = Number(rawMonth);
    if (Number.isInteger(monthNum) && monthNum >= 1 && monthNum <= 12) {
      return `${monthNames[monthNum - 1]} ${rawYear}`;
    }
    return `${rawMonth} ${rawYear}`;
  }

  if (foundMonthKey && !foundYearKey) {
    const rawMonth = row[foundMonthKey];
    const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
    const monthNum = Number(rawMonth);
    if (Number.isInteger(monthNum) && monthNum >= 1 && monthNum <= 12) {
      return monthNames[monthNum - 1];
    }
  }

  return String(row[fallbackKey] ?? 'N/A');
};

const chartRows = computed(() =>
  props.rows.slice(0, 60).map((row) => ({
    label: formatRowLabel(row, labelColumn.value),
    value: parseNumericValue(row[valueColumn.value]),
    isForecast:
      String(row[labelColumn.value] ?? '').includes('Prévision') ||
      String(row.Type ?? '').includes('Prévision') ||
      String(row.type ?? '').includes('Prévision')
  }))
);

const hasForecast = computed(() => chartRows.value.some((row) => row.isForecast));

const buildOptions = (): ApexOptions => {
  const categories = chartRows.value.map((row) => row.label);
  const values = chartRows.value.map((row) => row.value);
  const isBar = props.chartType === 'bar';
  const isLine = props.chartType === 'line';
  const isPie = props.chartType === 'pie';

  // Determine colors based on forecast or default palette
  let colors: string[];
  if (hasForecast.value) {
    colors = chartRows.value.map((r) => (r.isForecast ? '#8b5cf6' : '#2563eb'));
  } else if (isPie) {
    colors = DEFAULT_PALETTE;
  } else {
    colors = ['#2563eb'];
  }

  const common: ApexOptions = {
    chart: {
      id: chartInstanceId,
      background: 'transparent',
      foreColor: '#64748b',
      height: chartHeight.value,
      width: '100%',
      redrawOnParentResize: false,
      redrawOnWindowResize: false,
      toolbar: { show: false },
      animations: {
        enabled: true,
        easing: 'easeinout',
        speed: 400
      }
    },
    dataLabels: { enabled: isPie || isFullscreen.value },
    grid: {
      borderColor: 'rgba(148, 163, 184, 0.15)',
      strokeDashArray: 4
    },
    legend: {
      labels: { colors: '#64748b' }
    },
    stroke: {
      curve: 'smooth',
      width: isBar ? 0 : 3
    },
    colors,
    tooltip: {
      theme: 'dark',
      style: { fontSize: '12px' }
    }
  };

  if (isPie) {
    return {
      ...common,
      chart: { ...common.chart, type: 'donut' },
      labels: categories,
      plotOptions: {
        pie: {
          donut: {
            size: '64%',
            labels: {
              show: true,
              total: {
                show: true,
                label: 'Total',
                color: '#64748b'
              }
            }
          }
        }
      },
      series: values
    };
  }

  const xyType = isLine ? 'line' : 'bar';
  return {
    ...common,
    chart: { ...common.chart, type: xyType },
    fill: {
      opacity: xyType === 'bar' ? 0.95 : 0.22,
      type: xyType === 'bar' ? 'solid' : 'gradient',
      gradient: {
        shade: 'dark',
        opacityFrom: 0.72,
        opacityTo: 0.08,
        stops: [0, 90, 100]
      }
    },
    plotOptions: {
      bar: {
        borderRadius: 4,
        distributed: hasForecast.value,
        columnWidth: chartRows.value.length > 8 ? '58%' : '44%'
      }
    },
    series: [
      {
        name: valueColumn.value || 'Valeur',
        data: values
      }
    ],
    xaxis: {
      categories,
      labels: {
        rotate: -20,
        trim: true,
        style: { colors: '#64748b', fontSize: '11px' }
      },
      axisBorder: { show: false },
      axisTicks: { show: false }
    },
    yaxis: {
      labels: {
        style: { colors: '#64748b', fontSize: '11px' }
      }
    }
  };
};

const renderChart = async () => {
  await nextTick();
  if (!chartEl.value || isTable.value || !chartRows.value.length) {
    if (chart) {
      chart.destroy();
      chart = null;
    }
    return;
  }

  // Always destroy cleanly before rendering to eliminate ApexCharts SVG wipe-out bugs
  if (chart) {
    chart.destroy();
    chart = null;
  }
  chartEl.value.innerHTML = '';

  const options = buildOptions();
  try {
    chart = new ApexCharts(chartEl.value, options);
    await chart.render();
  } catch (err) {
    console.warn('[ChartWidget] Erreur lors du rendu ApexCharts :', err);
  }
};

onMounted(async () => {
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', handleWindowResize);
  }
  await nextTick();
  void renderChart();
});

watch(
  [() => props.chartType, () => props.columns.join('|'), () => JSON.stringify(props.rows.slice(0, 60))],
  async () => {
    await nextTick();
    void renderChart();
  }
);

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', handleWindowResize);
  }
  if (chart) {
    chart.destroy();
    chart = null;
  }
});
</script>

<style scoped>
.chart-shell {
  display: flex;
  flex-direction: column;
  min-height: 0;
  width: 100%;
  max-width: 100%;
  overflow: hidden;
  border-color: var(--askme-border) !important;
  background: var(--askme-panel-gradient) !important;
  box-shadow: var(--askme-shadow);
  position: relative;
}

.chart-backdrop {
  position: fixed;
  inset: 0;
  z-index: -1;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(8px);
}

.chart-shell.chart-fullscreen {
  position: fixed;
  top: 20px;
  left: 20px;
  right: 20px;
  bottom: 20px;
  z-index: 99999;
  width: auto;
  max-width: none;
  height: auto;
  max-height: none;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.55);
}

.chart-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.chart-header div {
  display: grid;
  gap: 3px;
}

.eyebrow {
  color: var(--askme-secondary);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.chart-header strong {
  color: var(--askme-ink);
  font-size: 14px;
}

.empty-state {
  display: grid;
  min-height: 100%;
  place-items: center;
  color: var(--askme-muted);
  font-size: 13px;
}

.chart-body {
  display: flex;
  flex: 1;
  min-height: 260px;
  width: 100%;
}

.chart-body-fullscreen {
  height: calc(100% - 48px);
}

.apex-chart {
  width: 100%;
  min-height: 260px;
}

.table-wrap {
  width: 100%;
  height: 100%;
  overflow-x: auto;
  max-height: min(55vh, 460px);
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  padding: 10px 12px;
  border-bottom: 1px solid rgba(151, 255, 221, 0.12);
  color: var(--askme-ink);
  font-size: 13px;
  text-align: left;
}

th {
  color: var(--askme-muted);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
</style>
