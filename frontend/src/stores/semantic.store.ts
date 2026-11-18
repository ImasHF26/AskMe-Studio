import { defineStore } from 'pinia';
import { apiClient } from '../services/api/client';
import type { SemanticBusinessSector, SemanticLayer, SemanticLayerLanguage, SemanticProposal, SemanticType } from '../types';
import axios from 'axios';

const emptyLayer = (): SemanticLayer => ({
  tables: [],
  kpis: [],
  synonyms: [],
  relationships: []
});

const emptyProposal = (): SemanticProposal | null => null;

export const useSemanticStore = defineStore('semantic', {
  state: () => ({
    layer: emptyLayer() as SemanticLayer,
    proposal: emptyProposal() as SemanticProposal | null,
    loading: false,
    generating: false,
    saving: false,
    deleting: false,
    error: '' as string
  }),
  actions: {
    toErrorMessage(error: unknown, fallback: string) {
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.message;
        if (typeof message === 'string' && message.trim()) return message;
      }
      return fallback;
    },

    async fetchLayer(datasourceId: string) {
      if (!datasourceId) return;
      this.loading = true;
      this.error = '';
      try {
        const response = await apiClient.get<SemanticLayer>(`/semantic/${datasourceId}`);
        this.layer = response.data;
      } catch (error) {
        this.error = this.toErrorMessage(error, 'Failed to load semantic layer.');
      } finally {
        this.loading = false;
      }
    },

    async generate(datasourceId: string) {
      if (!datasourceId) return;
      this.generating = true;
      this.error = '';
      try {
        const response = await apiClient.post<SemanticLayer>(`/semantic/${datasourceId}/generate`);
        this.layer = response.data;
      } catch (error) {
        this.error = this.toErrorMessage(error, 'Failed to generate semantic layer.');
      } finally {
        this.generating = false;
      }
    },

    async generateProposal(
      datasourceId: string,
      options: {
        useAI?: boolean;
        sampleSize?: number;
        overwriteExisting?: boolean;
        semanticLanguage?: SemanticLayerLanguage;
        businessSector?: SemanticBusinessSector;
      } = {}
    ) {
      if (!datasourceId) return;
      this.generating = true;
      this.error = '';
      try {
        const response = await apiClient.post<SemanticProposal>(`/semantic-layer/${datasourceId}/generate-proposal`, {
          useAI: options.useAI ?? true,
          sampleSize: options.sampleSize ?? 100,
          overwriteExisting: options.overwriteExisting ?? false,
          semanticLanguage: options.semanticLanguage ?? 'en',
          businessSector: options.businessSector ?? 'sales_distribution'
        });
        this.proposal = response.data;
      } catch (error) {
        this.error = this.toErrorMessage(error, 'Failed to generate semantic proposal.');
      } finally {
        this.generating = false;
      }
    },

    async saveProposal(datasourceId: string, overwriteExisting = true) {
      if (!datasourceId || !this.proposal) return;
      this.saving = true;
      this.error = '';
      try {
        const response = await apiClient.post<SemanticLayer>(`/semantic-layer/${datasourceId}/save`, {
          tables: this.proposal.tables,
          columns: this.proposal.columns,
          kpis: this.proposal.kpis,
          synonyms: this.proposal.synonyms,
          relationships: this.proposal.relationships,
          overwriteExisting
        });
        this.layer = response.data;
        this.proposal = null;
      } catch (error) {
        this.error = this.toErrorMessage(error, 'Failed to save semantic layer.');
      } finally {
        this.saving = false;
      }
    },

    async deleteLayer(datasourceId: string) {
      if (!datasourceId) return;
      this.deleting = true;
      this.error = '';
      try {
        await apiClient.delete(`/semantic-layer/${datasourceId}`);
        this.layer = emptyLayer();
        this.proposal = null;
      } catch (error) {
        this.error = this.toErrorMessage(error, 'Failed to delete semantic layer.');
      } finally {
        this.deleting = false;
      }
    },

    async updateTable(datasourceId: string, tableId: string, businessName: string, description: string) {
      this.saving = true;
      this.error = '';
      try {
        const response = await apiClient.put<SemanticLayer>(`/semantic/${datasourceId}/tables/${tableId}`, {
          businessName,
          description
        });
        this.layer = response.data;
      } catch (error) {
        this.error = this.toErrorMessage(error, 'Failed to update table.');
      } finally {
        this.saving = false;
      }
    },

    async updateColumn(datasourceId: string, columnId: string, businessName: string, semanticType: SemanticType) {
      this.saving = true;
      this.error = '';
      try {
        const response = await apiClient.put<SemanticLayer>(`/semantic/${datasourceId}/columns/${columnId}`, {
          businessName,
          semanticType
        });
        this.layer = response.data;
      } catch (error) {
        this.error = this.toErrorMessage(error, 'Failed to update column.');
      } finally {
        this.saving = false;
      }
    },

    async addKpi(datasourceId: string, name: string, sqlFormula: string, description: string, formatting: string) {
      this.saving = true;
      this.error = '';
      try {
        const response = await apiClient.post<SemanticLayer>(`/semantic/${datasourceId}/kpis`, {
          name,
          sqlFormula,
          description,
          formatting
        });
        this.layer = response.data;
      } catch (error) {
        this.error = this.toErrorMessage(error, 'Failed to create KPI.');
      } finally {
        this.saving = false;
      }
    },

    async addSynonym(datasourceId: string, term: string, mappedValue: string) {
      this.saving = true;
      this.error = '';
      try {
        const response = await apiClient.post<SemanticLayer>(`/semantic/${datasourceId}/synonyms`, {
          term,
          mappedValue
        });
        this.layer = response.data;
      } catch (error) {
        this.error = this.toErrorMessage(error, 'Failed to create synonym.');
      } finally {
        this.saving = false;
      }
    }
  }
});
