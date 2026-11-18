import { defineStore } from 'pinia';
import axios from 'axios';
import { apiClient } from '../services/api/client';
import type { Datasource, DatasourceType } from '../types';

interface CreateDatasourceInput {
  name: string;
  type: DatasourceType;
  credentials?: Record<string, unknown>;
  connectionConfig?: Record<string, unknown>;
}

const getApiErrorMessage = (error: unknown, fallback: string) => {
  if (!axios.isAxiosError(error)) return fallback;

  const data = error.response?.data as { message?: string | string[]; error?: string } | undefined;
  if (Array.isArray(data?.message)) return data.message.join(', ');
  if (typeof data?.message === 'string' && data.message.trim()) return data.message;
  if (typeof data?.error === 'string' && data.error.trim()) return data.error;
  return fallback;
};

export const useDatasourceStore = defineStore('datasource', {
  state: () => ({
    items: [] as Datasource[],
    selectedId: '' as string,
    loading: false,
    creating: false,
    testing: false,
    error: '' as string
  }),
  getters: {
    selected(state): Datasource | undefined {
      return state.items.find((item) => item.id === state.selectedId);
    }
  },
  actions: {
    async fetchAll() {
      this.loading = true;
      this.error = '';
      try {
        const response = await apiClient.get<Datasource[]>('/datasources');
        this.items = response.data;
        if (this.items.length === 0) {
          this.selectedId = '';
          return;
        }

        const selectedStillExists = this.items.some((item) => item.id === this.selectedId);
        if (!selectedStillExists) {
          this.selectedId = this.items[0].id;
        }
      } catch (error) {
        this.error = 'Failed to load datasources.';
      } finally {
        this.loading = false;
      }
    },
    async create(payload: CreateDatasourceInput) {
      this.creating = true;
      this.error = '';
      try {
        const response = await apiClient.post<Datasource>('/datasources', payload);
        this.items.unshift(response.data);
        this.selectedId = response.data.id;
        return response.data;
      } catch (error) {
        this.error = getApiErrorMessage(error, 'Failed to create datasource.');
        throw error;
      } finally {
        this.creating = false;
      }
    },
    async update(id: string, payload: Partial<CreateDatasourceInput>) {
      this.creating = true;
      this.error = '';
      try {
        const response = await apiClient.put<Datasource>(`/datasources/${id}`, payload);
        const index = this.items.findIndex((item) => item.id === id);
        if (index !== -1) {
          this.items[index] = response.data;
        }
        return response.data;
      } catch (error) {
        this.error = getApiErrorMessage(error, 'Failed to update datasource.');
        throw error;
      } finally {
        this.creating = false;
      }
    },
    async delete(id: string) {
      this.loading = true;
      this.error = '';
      try {
        await apiClient.delete(`/datasources/${id}`);
        this.items = this.items.filter((item) => item.id !== id);
        if (this.selectedId === id) {
          this.selectedId = this.items[0]?.id || '';
        }
        return true;
      } catch (error) {
        this.error = getApiErrorMessage(error, 'Failed to delete datasource.');
        throw error;
      } finally {
        this.loading = false;
      }
    },
    async testConnection(payload: CreateDatasourceInput) {
      this.testing = true;
      this.error = '';
      try {
        const response = await apiClient.post<{ ok: boolean; message: string }>('/datasources/test', payload);
        return response.data;
      } catch (error) {
        this.error = getApiErrorMessage(error, 'Failed to test datasource connection.');
        return { ok: false, message: this.error };
      } finally {
        this.testing = false;
      }
    },
    async fetchSchemas(payload: CreateDatasourceInput) {
      this.testing = true;
      this.error = '';
      try {
        const response = await apiClient.post<{ schemas: string[]; defaultSchema?: string }>('/datasources/schemas', payload);
        return response.data;
      } catch (error) {
        this.error = getApiErrorMessage(error, 'Failed to load datasource schemas.');
        return { schemas: [], defaultSchema: undefined };
      } finally {
        this.testing = false;
      }
    },
    setSelected(id: string) {
      this.selectedId = id;
    }
  }
});
