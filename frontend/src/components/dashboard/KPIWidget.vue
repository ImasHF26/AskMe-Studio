<template>
  <div class="kpi-widget" :style="colorStyle">
    <div class="kpi-label">{{ title || 'KPI' }}</div>
    <div class="kpi-value">{{ formattedValue }}</div>
    <div class="kpi-caption">{{ caption || 'Aucune donnée' }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  title?: string;
  value: number;
  caption?: string | number;
  color?: string;
}>();

const colorTokens: Record<string, { base: string; soft: string; ink: string }> = {
  red: { base: '#dc2626', soft: '#fee2e2', ink: '#7f1d1d' },
  orange: { base: '#ea580c', soft: '#ffedd5', ink: '#7c2d12' },
  yellow: { base: '#ca8a04', soft: '#fef9c3', ink: '#713f12' },
  green: { base: '#16a34a', soft: '#dcfce7', ink: '#14532d' },
  sky: { base: '#0284c7', soft: '#e0f2fe', ink: '#075985' },
  blue: { base: '#2563eb', soft: '#dbeafe', ink: '#1e3a8a' },
  brown: { base: '#92400e', soft: '#fef3c7', ink: '#451a03' },
  black: { base: '#111827', soft: '#e5e7eb', ink: '#030712' }
};

const activeColor = computed(() => colorTokens[props.color || 'sky'] || colorTokens.sky);

const colorStyle = computed(() => ({
  '--kpi-base': activeColor.value.base,
  '--kpi-soft': activeColor.value.soft,
  '--kpi-ink': activeColor.value.ink
}));

const formattedValue = computed(() => {
  const n = props.value;
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString('fr-FR');
});
</script>

<style scoped>
.kpi-widget {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 6px;
  height: 100%;
  min-height: 0;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--kpi-base) 38%, transparent);
  border-radius: 8px;
  color: var(--kpi-ink);
  background: linear-gradient(180deg, color-mix(in srgb, var(--kpi-soft) 92%, white), white);
  text-align: center;
}

.kpi-label {
  max-width: 100%;
  overflow: hidden;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
  color: var(--kpi-base);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kpi-value {
  max-width: 100%;
  overflow: hidden;
  color: var(--kpi-ink);
  font-size: 42px;
  font-weight: 900;
  line-height: 1;
  letter-spacing: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kpi-caption {
  max-width: 100%;
  overflow: hidden;
  font-size: 12px;
  color: color-mix(in srgb, var(--kpi-ink) 68%, white);
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
