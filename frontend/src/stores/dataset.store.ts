import { defineStore } from 'pinia';
import { apiClient } from '../services/api/client';

interface DatasetColumn {
  name: string;
  dataType: string;
  isNullable: boolean;
}

interface DatasetStats {
  rowCount: number;
  columnCount: number;
  summary: string;
}

interface DatasetTableRef {
  name?: string;
  schema?: string;
  tableName?: string;
}

const normalizeTableName = (table: string | DatasetTableRef) => {
  if (typeof table === 'string') return table;
  const rawName = table.name || table.tableName || '';
  if (table.schema && !rawName.includes('.')) return `${table.schema}.${rawName}`;
  return rawName;
};

export const useDatasetStore = defineStore('dataset', {
  state: () => ({
    tables: [] as string[],
    selectedTable: '' as string,
    columns: [] as DatasetColumn[],
    previewRows: [] as Array<Record<string, unknown>>,
    stats: null as DatasetStats | null,
    loadingTables: false,
    loadingDetails: false,
    error: '' as string
  }),
  actions: {
    async fetchTables(datasourceId: string) {
      if (!datasourceId) return;
      this.loadingTables = true;
      this.error = '';

      try {
        const response = await apiClient.get<{ tables: Array<string | DatasetTableRef> }>(`/datasets/${datasourceId}/tables`);
        this.tables = (response.data.tables || []).map(normalizeTableName).filter(Boolean);
        if (!this.selectedTable && this.tables.length > 0) {
          this.selectedTable = this.tables[0];
        }
      } catch (error) {
        this.error = 'Failed to load dataset tables.';
      } finally {
        this.loadingTables = false;
      }
    },

    async fetchDetails(datasourceId: string, tableName: string) {
      if (!datasourceId || !tableName) return;
      this.loadingDetails = true;
      this.error = '';

      try {
        const encodedName = encodeURIComponent(tableName);
        const [columnsRes, previewRes, statsRes] = await Promise.all([
          apiClient.get<{ columns: DatasetColumn[] }>(`/datasets/${datasourceId}/tables/${encodedName}/columns`),
          apiClient.get<{ rows: Array<Record<string, unknown>> }>(`/datasets/${datasourceId}/tables/${encodedName}/preview`),
          apiClient.get<DatasetStats>(`/datasets/${datasourceId}/tables/${encodedName}/profile`)
        ]);

        this.columns = columnsRes.data.columns || [];
        this.previewRows = previewRes.data.rows || [];
        this.stats = statsRes.data;
      } catch (error) {
        this.error = 'Failed to load table details.';
      } finally {
        this.loadingDetails = false;
      }
    },

    setSelectedTable(tableName: string) {
      this.selectedTable = tableName;
    }
  }
});
