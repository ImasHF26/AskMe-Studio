export type UserRole = 'Admin' | 'Analyst' | 'Viewer';

export type DatasourceType = 'postgresql' | 'mongodb' | 'csv' | 'excel';
export type TextToSqlProvider = 'static' | 'ollama' | 'groq' | 'openrouter' | 'auto';

export interface Datasource {
  id: string;
  name: string;
  type: DatasourceType;
  createdAt: string;
  schema?: string;
}

export interface QueryGenerateResponse {
  status: 'ok' | 'cannot_answer';
  sql: string;
  language: 'sql';
  canExecute: boolean;
  confidence: number;
  reasoning: string;
  usedEntities?: QueryEntity[];
  provenance?: QueryProvenance;
  warnings?: string[];
}

export interface QueryExecuteResponse {
  status?: 'ok' | 'cannot_answer' | 'validation_error' | 'execution_error';
  columns: string[];
  rows: Array<Record<string, string | number>>;
  chartType: 'line' | 'bar' | 'pie' | 'table';
  narrative: string;
  executionMs: number;
  confidence?: number;
  usedEntities?: QueryEntity[];
  provenance?: QueryProvenance;
  warnings?: string[];
}

export interface QueryEntity {
  type: 'table' | 'column' | 'kpi';
  name: string;
  technicalName?: string;
}

export interface QueryProvenance {
  datasourceId?: string;
  retrieval?: Array<{
    entityType: string;
    entityName: string;
    score: number;
  }>;
  table?: {
    businessName: string;
    technicalName: string;
  };
  metric?: string;
  kpi?: string;
  columns: Array<{
    businessName: string;
    technicalName: string;
    semanticType: SemanticType;
  }>;
  sqlValidated: boolean;
  validationReason?: string;
}

export interface ChatAnswerInfo {
  question: string;
  sql: string;
  status?: QueryExecuteResponse['status'] | QueryGenerateResponse['status'];
  chartType?: QueryExecuteResponse['chartType'];
  confidence?: number;
  reasoning?: string;
  executionMs?: number;
  rowsCount?: number;
  columns?: string[];
  rows?: Array<Record<string, string | number>>;
  datasourceId?: string;
  warnings?: string[];
  usedEntities?: QueryEntity[];
  provenance?: QueryProvenance;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
  answerInfo?: ChatAnswerInfo;
  result?: QueryExecuteResponse;
}

export interface ChatSessionSummary {
  id: string;
  datasourceId?: string;
  title: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChatSessionDetail extends ChatSessionSummary {
  messages: ChatMessage[];
}

export type SemanticType = 'measure' | 'dimension' | 'date' | 'identifier' | 'unknown';
export type SemanticTableType = 'fact' | 'dimension' | 'unknown';
export type SemanticProposalSource = 'metadata' | 'heuristic' | 'ai' | 'user';
export type SemanticKpiFormatting = 'currency' | 'number' | 'percent' | 'integer';
export type SemanticLayerLanguage = 'en' | 'fr' | 'ar' | 'auto';
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
}

export interface SemanticTable {
  id: string;
  technicalName: string;
  businessName: string;
  description: string;
  tableType: SemanticTableType;
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

export interface SemanticLayer {
  tables: SemanticTable[];
  kpis: SemanticKpi[];
  synonyms: SemanticSynonym[];
  relationships: SemanticRelationship[];
}

export interface SemanticTableProposal {
  technicalName: string;
  businessName: string;
  description: string;
  tableType: SemanticTableType;
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
  confidence: number;
  source: SemanticProposalSource;
  warnings?: string[];
}

export interface SemanticKpiProposal {
  id?: string;
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

export interface SemanticProposal {
  datasourceId: string;
  confidence: number;
  tables: SemanticTableProposal[];
  columns: SemanticColumnProposal[];
  kpis: SemanticKpiProposal[];
  synonyms: SemanticSynonymProposal[];
  relationships: SemanticRelationship[];
  warnings: string[];
}

export type DashboardWidgetType = 'kpi' | 'chart' | 'table' | 'text';
export type DashboardChartType = 'line' | 'bar' | 'pie' | 'table';

export interface DashboardWidgetPosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DashboardWidget {
  id: string;
  dashboardId: string;
  title: string;
  type: DashboardWidgetType;
  position: DashboardWidgetPosition;
  query: string;
  chartType: DashboardChartType;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Dashboard {
  id: string;
  datasourceId: string;
  name: string;
  description: string;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  widgets: DashboardWidget[];
}
