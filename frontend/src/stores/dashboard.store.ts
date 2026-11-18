import { defineStore } from 'pinia';
import axios from 'axios';
import { apiClient } from '../services/api/client';
import type { Dashboard, DashboardChartType, DashboardWidgetPosition, DashboardWidgetType } from '../types';

interface CreateWidgetInput {
  title: string;
  type: DashboardWidgetType;
  position?: DashboardWidgetPosition;
  query?: string;
  chartType?: DashboardChartType;
  config?: Record<string, unknown>;
}

interface UpdateWidgetInput {
  title?: string;
  type?: DashboardWidgetType;
  position?: DashboardWidgetPosition;
  query?: string;
  chartType?: DashboardChartType;
  config?: Record<string, unknown>;
}

interface CreateDashboardInput {
  name: string;
  datasourceId: string;
  description?: string;
  config?: Record<string, unknown>;
}

interface UpdateDashboardInput {
  name?: string;
  description?: string;
  datasourceId?: string;
  config?: Record<string, unknown>;
}

const getApiErrorMessage = (error: unknown, fallback: string) => {
  if (!axios.isAxiosError(error)) return fallback;
  if (error.response?.status === 401) return 'Votre session a expiré. Veuillez vous reconnecter.';

  const data = error.response?.data as { message?: string | string[]; error?: string } | undefined;
  if (Array.isArray(data?.message)) return data.message.join(', ');
  if (typeof data?.message === 'string' && data.message.trim()) return data.message;
  if (typeof data?.error === 'string' && data.error.trim()) return data.error;
  return fallback;
};

export const useDashboardStore = defineStore('dashboard', {
  state: () => ({
    items: [] as Dashboard[],
    current: null as Dashboard | null,
    loading: false,
    saving: false,
    error: '' as string
  }),
  getters: {
    currentId(state): string {
      return state.current?.id || '';
    }
  },
  actions: {
    async fetchAll() {
      this.loading = true;
      this.error = '';
      try {
        const response = await apiClient.get<Dashboard[]>('/dashboards');
        this.items = response.data;
      } catch (error) {
        this.error = 'Failed to load dashboards.';
      } finally {
        this.loading = false;
      }
    },

    async open(dashboardId: string) {
      if (!dashboardId) return;
      this.loading = true;
      this.error = '';
      try {
        const response = await apiClient.get<Dashboard>(`/dashboards/${dashboardId}`);
        this.current = response.data;
        this.upsertDashboard(response.data);
      } catch (error) {
        this.error = 'Failed to load dashboard.';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async create(payload: CreateDashboardInput) {
      this.saving = true;
      this.error = '';
      try {
        const response = await apiClient.post<Dashboard>('/dashboards', payload);
        this.current = response.data;
        this.upsertDashboard(response.data, true);
        return response.data;
      } catch (error) {
        this.error = getApiErrorMessage(error, 'Failed to create dashboard.');
        throw error;
      } finally {
        this.saving = false;
      }
    },

    async updateCurrent(payload: UpdateDashboardInput) {
      if (!this.current) return;
      await this.updateDashboard(this.current.id, payload);
    },

    async updateDashboard(dashboardId: string, payload: UpdateDashboardInput) {
      if (!dashboardId) return;
      this.saving = true;
      this.error = '';
      try {
        const response = await apiClient.put<Dashboard>(`/dashboards/${dashboardId}`, payload);
        if (this.current?.id === dashboardId) {
          this.current = response.data;
        }
        this.upsertDashboard(response.data);
      } catch (error) {
        this.error = 'Failed to update dashboard.';
      } finally {
        this.saving = false;
      }
    },

    async deleteDashboard(dashboardId: string) {
      this.saving = true;
      this.error = '';
      try {
        await apiClient.delete<{ ok: boolean }>(`/dashboards/${dashboardId}`);
        this.items = this.items.filter((item) => item.id !== dashboardId);
        if (this.current?.id === dashboardId) {
          this.current = this.items[0] || null;
        }
      } catch (error) {
        this.error = 'Failed to delete dashboard.';
      } finally {
        this.saving = false;
      }
    },

    async createWidget(payload: CreateWidgetInput) {
      if (!this.current) return;
      this.saving = true;
      this.error = '';
      try {
        const response = await apiClient.post<Dashboard>(`/dashboards/${this.current.id}/widgets`, payload);
        this.current = response.data;
        this.upsertDashboard(response.data);
      } catch (error) {
        this.error = 'Failed to create widget.';
      } finally {
        this.saving = false;
      }
    },

    async updateWidget(widgetId: string, payload: UpdateWidgetInput) {
      if (!this.current || !widgetId) return;
      this.saving = true;
      this.error = '';
      try {
        const response = await apiClient.put<Dashboard>(`/dashboards/${this.current.id}/widgets/${widgetId}`, payload);
        this.current = response.data;
        this.upsertDashboard(response.data);
      } catch (error) {
        this.error = 'Failed to update widget.';
      } finally {
        this.saving = false;
      }
    },

    async deleteWidget(widgetId: string) {
      if (!this.current || !widgetId) return;
      this.saving = true;
      this.error = '';
      try {
        const response = await apiClient.delete<Dashboard>(`/dashboards/${this.current.id}/widgets/${widgetId}`);
        this.current = response.data;
        this.upsertDashboard(response.data);
      } catch (error) {
        this.error = 'Failed to delete widget.';
      } finally {
        this.saving = false;
      }
    },

    upsertDashboard(dashboard: Dashboard, prepend = false) {
      const index = this.items.findIndex((item) => item.id === dashboard.id);
      if (index >= 0) {
        this.items = this.items.map((item) => (item.id === dashboard.id ? dashboard : item));
        return;
      }
      if (prepend) {
        this.items = [dashboard, ...this.items];
      } else {
        this.items = [...this.items, dashboard];
      }
    }
  }
});
