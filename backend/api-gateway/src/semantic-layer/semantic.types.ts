export type SemanticType =
  | 'identifier'
  | 'dimension'
  | 'measure'
  | 'attribute'
  | 'date'
  | 'technical_date'
  | 'boolean_flag'
  | 'sensitive'
  | 'unknown';

export type TableType = 'fact' | 'dimension' | 'unknown';
export type SemanticProposalSource = 'metadata' | 'heuristic' | 'ai' | 'user';
export type SemanticKpiFormatting = 'currency' | 'number' | 'percent' | 'integer';
export type SemanticLayerLanguage = 'en' | 'fr' | 'ar';
export type SemanticBusinessSector =
  | 'sales_distribution'
  | 'finance_accounting'
  | 'human_resources'
  | 'logistics_supply_chain'
  | 'manufacturing_production'
  | 'marketing_crm'
  | 'healthcare'
  | 'education_training'
  | 'banking_insurance'
  | 'real_estate_construction';

export interface SemanticColumn {
  id: string;
  technicalName: string;
  businessName: string;
  semanticType: SemanticType;
  dataType: string;
  isNullable: boolean;
  isForeignKey?: boolean;
  references?: {
    table: string;
    column: string;
  };
}

export type SemanticColumnLike = Pick<SemanticColumn, 'technicalName' | 'businessName' | 'semanticType' | 'dataType'> & {
  isForeignKey?: boolean;
  references?: {
    table: string;
    column: string;
  };
};

export interface SemanticTable {
  id: string;
  technicalName: string;
  businessName: string;
  description: string;
  tableType: TableType;
  columns: SemanticColumn[];
}

export interface SemanticKpi {
  id: string;
  name: string;
  sqlFormula: string;
  description: string;
  formatting: string;
}

export interface SemanticSynonym {
  id: string;
  term: string;
  mappedValue: string;
}

export interface SemanticRelationship {
  fromTableTechnicalName: string;
  fromColumnTechnicalName: string;
  toTableTechnicalName: string;
  toColumnTechnicalName: string;
  joinType: 'inner' | 'left';
  cardinality: '1:1' | '1:n' | 'n:1' | 'n:n';
  confidence: number;
}

export interface SemanticLayerResponse {
  tables: SemanticTable[];
  kpis: SemanticKpi[];
  synonyms: SemanticSynonym[];
  relationships?: SemanticRelationship[];
}

export type SemanticSearchEntityType = 'table' | 'column' | 'kpi' | 'synonym';

export interface SemanticSearchHit {
  entityType: SemanticSearchEntityType;
  entityId: string;
  entityName: string;
  mappedValue?: string;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface SemanticTableProposal {
  technicalName: string;
  businessName: string;
  description: string;
  tableType: TableType;
  confidence: number;
  source: SemanticProposalSource;
}

export interface SemanticColumnProposal {
  tableTechnicalName: string;
  technicalName: string;
  businessName: string;
  semanticType: SemanticType;
  dataType: string;
  isNullable: boolean;
  isForeignKey?: boolean;
  references?: {
    table: string;
    column: string;
  };
  confidence: number;
  source: SemanticProposalSource;
  warnings?: string[];
}

export interface SemanticKpiProposal {
  name: string;
  sqlFormula: string;
  description: string;
  formatting: SemanticKpiFormatting;
  confidence: number;
  source: 'heuristic' | 'ai' | 'user';
}

export interface SemanticSynonymProposal {
  term: string;
  mappedValue: string;
  confidence: number;
  source: 'heuristic' | 'ai' | 'user';
}

export interface GenerateSemanticProposalInput {
  useAI?: boolean;
  sampleSize?: number;
  overwriteExisting?: boolean;
  semanticLanguage?: SemanticLayerLanguage | 'auto';
  businessSector?: SemanticBusinessSector;
}

export interface SaveSemanticLayerInput {
  tables?: SemanticTableProposal[];
  columns?: SemanticColumnProposal[];
  kpis?: SemanticKpiProposal[];
  synonyms?: SemanticSynonymProposal[];
  relationships?: SemanticRelationship[];
  overwriteExisting?: boolean;
}

export interface SemanticProposalResponse {
  datasourceId: string;
  confidence: number;
  tables: SemanticTableProposal[];
  columns: SemanticColumnProposal[];
  kpis: SemanticKpiProposal[];
  synonyms: SemanticSynonymProposal[];
  relationships: SemanticRelationship[];
  warnings: string[];
}

export interface ColumnProfile {
  nullRatio: number;
  distinctCount: number;
  distinctRatio: number;
  min?: number | string;
  max?: number | string;
  mean?: number;
  topValues: Array<{ value: string; count: number }>;
  sampleValues: unknown[];
  averageTextLength?: number;
}

export interface MetadataColumn {
  name: string;
  dataType: string;
  isNullable: boolean;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  inferredBusinessRole: string;
  references?: {
    table: string;
    column: string;
  };
  profile: ColumnProfile;
}

export interface MetadataTable {
  name: string;
  schema: string;
  tableType: 'table' | 'view' | 'collection' | 'file';
  rowCount: number;
  primaryKeys: string[];
  foreignKeys: Array<{
    column: string;
    references?: {
      table: string;
      column: string;
    };
  }>;
  indexes: string[];
  inferredTableRole: TableType;
  columns: MetadataColumn[];
  sampleRows: Array<Record<string, unknown>>;
  warnings?: string[];
}

