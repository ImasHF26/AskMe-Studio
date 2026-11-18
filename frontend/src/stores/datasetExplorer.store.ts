import { defineStore } from 'pinia';
import { MarkerType, type Edge, type Node } from '@vue-flow/core';
import {
  datasetExplorerService,
  mockExplorerSchema,
  type ExplorerPreviewResponse,
  type ExplorerRelationship,
  type ExplorerSchemaResponse,
  type ExplorerTable
} from '../services/dataset/datasetExplorer.service';

export interface TableNodeData extends ExplorerTable {
  compact: boolean;
}

const palette = {
  fact: '#20f2b6',
  dimension: '#67e8f9',
  view: '#f8d66d',
  table: '#9ca3af'
};

const tableDegree = (tableName: string, relationships: ExplorerRelationship[]) =>
  relationships.filter((relationship) => relationship.fromTable === tableName || relationship.toTable === tableName).length;

const layoutTables = (
  tables: ExplorerTable[],
  relationships: ExplorerRelationship[],
  compact: boolean,
  selectedTableName: string
) => {
  const visibleNames = new Set(tables.map((table) => table.name));
  const visibleRelationships = relationships.filter(
    (relationship) => visibleNames.has(relationship.fromTable) && visibleNames.has(relationship.toTable)
  );
  const selectedTable = tables.find((table) => table.name === selectedTableName);
  const factTables = tables
    .filter((table) => table.type === 'fact' || tableDegree(table.name, visibleRelationships) >= 2)
    .sort((a, b) => tableDegree(b.name, visibleRelationships) - tableDegree(a.name, visibleRelationships));
  const hub = selectedTable?.type === 'fact' ? selectedTable : factTables[0] || selectedTable || tables[0];

  if (!hub) return [];

  const relatedNames = new Set<string>();
  for (const relationship of visibleRelationships) {
    if (relationship.fromTable === hub.name) relatedNames.add(relationship.toTable);
    if (relationship.toTable === hub.name) relatedNames.add(relationship.fromTable);
  }

  const dimensions = tables
    .filter((table) => table.name !== hub.name && relatedNames.has(table.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  const secondaryFacts = factTables.filter((table) => table.name !== hub.name && !relatedNames.has(table.name));
  const rest = tables
    .filter((table) => table.name !== hub.name && !relatedNames.has(table.name) && !secondaryFacts.some((fact) => fact.name === table.name))
    .sort((a, b) => tableDegree(b.name, visibleRelationships) - tableDegree(a.name, visibleRelationships) || a.name.localeCompare(b.name));

  const nodeWidth = compact ? 240 : 290;
  const nodeHeight = compact ? 126 : 285;
  const radiusX = Math.max(compact ? 430 : 620, dimensions.length * (compact ? 38 : 54));
  const radiusY = Math.max(compact ? 300 : 430, dimensions.length * (compact ? 28 : 38));
  const result: Array<{ table: ExplorerTable; x: number; y: number }> = [{ table: hub, x: 0, y: 0 }];

  dimensions.forEach((table, index) => {
    const angle = (-Math.PI / 2) + (2 * Math.PI * index) / Math.max(1, dimensions.length);
    result.push({
      table,
      x: Math.round(Math.cos(angle) * radiusX),
      y: Math.round(Math.sin(angle) * radiusY)
    });
  });

  secondaryFacts.forEach((table, index) => {
    result.push({
      table,
      x: -radiusX - nodeWidth - 180,
      y: index * (nodeHeight + 90)
    });
  });

  rest.forEach((table, index) => {
    const columns = Math.max(1, Math.ceil(Math.sqrt(rest.length)));
    result.push({
      table,
      x: radiusX + nodeWidth + 210 + (index % columns) * (nodeWidth + 110),
      y: -radiusY + Math.floor(index / columns) * (nodeHeight + 86)
    });
  });

  return result;
};

export const useDatasetExplorerStore = defineStore('datasetExplorer', {
  state: () => ({
    datasourceId: '' as string,
    schema: null as ExplorerSchemaResponse | null,
    selectedTableName: '' as string,
    selectedRelationship: null as ExplorerRelationship | null,
    preview: null as ExplorerPreviewResponse | null,
    searchTerm: '',
    expandedTables: [] as string[],
    compactNodes: false,
    schemaFilter: '' as string,
    loadingSchema: false,
    loadingPreview: false,
    error: '' as string
  }),

  getters: {
    tables: (state) => state.schema?.tables || [],

    selectedTable: (state) => state.schema?.tables.find((table) => table.name === state.selectedTableName) || null,

    filteredTables(state): ExplorerTable[] {
      const term = state.searchTerm.trim().toLowerCase();
      let tables = state.schema?.tables || [];
      if (state.schemaFilter) {
        tables = tables.filter((table) => (table.schema || 'public') === state.schemaFilter);
      }
      if (!term) return tables;

      return tables.filter((table) => {
        const tableHit = table.name.toLowerCase().includes(term) || table.type.toLowerCase().includes(term);
        const columnHit = table.columns.some((column) =>
          `${column.name} ${column.type} ${column.semanticType || ''}`.toLowerCase().includes(term)
        );
        return tableHit || columnHit;
      });
    },

    graphNodes(state): Node<TableNodeData>[] {
      const selected = state.selectedTableName;
      const visible = this.filteredTables as ExplorerTable[];
      return layoutTables(visible, state.schema?.relationships || [], state.compactNodes, selected).map(({ table, x, y }) => ({
        id: table.name,
        type: 'tableNode',
        position: { x, y },
        selected: table.name === selected,
        data: {
          ...table,
          compact: state.compactNodes
        }
      }));
    },

    graphEdges(state): Edge<ExplorerRelationship>[] {
      const visibleNames = new Set((this.filteredTables as ExplorerTable[]).map((table) => table.name));
      return (state.schema?.relationships || [])
        .filter((relationship) => visibleNames.has(relationship.fromTable) && visibleNames.has(relationship.toTable))
        .map((relationship) => {
          const isSelected = state.selectedRelationship?.id === relationship.id;
          const isFocused =
            Boolean(state.selectedTableName) &&
            (relationship.fromTable === state.selectedTableName || relationship.toTable === state.selectedTableName);
          return {
            id: relationship.id,
            source: relationship.fromTable,
            target: relationship.toTable,
            type: 'smoothstep',
            animated: isSelected || isFocused || relationship.type === 'foreign-key',
            label: `${relationship.fromColumn} -> ${relationship.toColumn}`,
            markerEnd: MarkerType.ArrowClosed,
            data: relationship,
            style: {
              stroke: isSelected || isFocused ? palette.fact : 'rgba(103, 232, 249, 0.78)',
              strokeWidth: isSelected ? 3.8 : isFocused ? 3 : 2.4
            },
            labelStyle: {
              fill: 'var(--askme-ink)',
              fontWeight: 700,
              fontSize: 11
            },
            labelBgStyle: {
              fill: 'var(--askme-panel-strong)',
              stroke: 'var(--askme-border)',
              strokeWidth: 1
            },
            labelBgPadding: [8, 4]
          };
        });
    },

    schemaStats(state) {
      const tables = this.filteredTables as ExplorerTable[];
      const visibleNames = new Set(tables.map((table) => table.name));
      const relationships = (state.schema?.relationships || []).filter(
        (relationship) => visibleNames.has(relationship.fromTable) && visibleNames.has(relationship.toTable)
      );
      return {
        tables: tables.length,
        columns: tables.reduce((total, table) => total + table.columns.length, 0),
        relationships: relationships.length,
        facts: tables.filter((table) => table.type === 'fact').length
      };
    },

    availableSchemas(state): string[] {
      const schemas = new Set<string>();
      (state.schema?.tables || []).forEach((table) => schemas.add(table.schema || 'public'));
      return Array.from(schemas).sort();
    }
  },

  actions: {
    async loadSchema(datasourceId: string) {
      if (!datasourceId) return;
      this.datasourceId = datasourceId;
      this.loadingSchema = true;
      this.error = '';
      this.selectedRelationship = null;

      try {
        this.schema = await datasetExplorerService.fetchSchema(datasourceId);
        const schemas = this.availableSchemas;
        if (!this.schemaFilter || !schemas.includes(this.schemaFilter)) {
          this.schemaFilter = schemas[0] || '';
        }
        this.selectFirstTableForActiveSchema();
        this.preview = null;
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Failed to load datasource schema.';
        this.schema = mockExplorerSchema;
        this.schemaFilter = this.availableSchemas[0] || '';
        this.selectFirstTableForActiveSchema();
      } finally {
        this.loadingSchema = false;
      }
    },

    async loadPreview(tableName: string) {
      if (!this.datasourceId || !tableName) return;
      this.loadingPreview = true;
      this.error = '';

      try {
        this.preview = await datasetExplorerService.fetchPreview(this.datasourceId, tableName, 10);
      } catch (error) {
        this.preview = {
          columns: [],
          rows: [],
          metadata: { previewLimit: 10 }
        };
      } finally {
        this.loadingPreview = false;
      }
    },

    async selectTable(tableName: string, loadPreview = false) {
      this.selectedTableName = tableName;
      this.selectedRelationship = null;
      if (!this.expandedTables.includes(tableName)) this.expandedTables.push(tableName);
      if (loadPreview) {
        await this.loadPreview(tableName);
      }
    },

    setSchemaFilter(schema: string) {
      this.schemaFilter = schema;
      this.selectedRelationship = null;
      this.preview = null;
      const current = this.schema?.tables.find(
        (table) => table.name === this.selectedTableName && (table.schema || 'public') === this.schemaFilter
      );
      if (!current) {
        this.selectFirstTableForActiveSchema();
      }
    },

    selectFirstTableForActiveSchema() {
      const tables = this.filteredTables as ExplorerTable[];
      this.expandedTables = tables.slice(0, 4).map((table) => table.name);
      this.selectedTableName = tables[0]?.name || '';
    },

    selectRelationship(relationship: ExplorerRelationship | null) {
      this.selectedRelationship = relationship;
    },

    toggleExpanded(tableName: string) {
      if (this.expandedTables.includes(tableName)) {
        this.expandedTables = this.expandedTables.filter((name) => name !== tableName);
        return;
      }
      this.expandedTables.push(tableName);
    },

    toggleCompactNodes() {
      this.compactNodes = !this.compactNodes;
    }
  }
});
