import type {
  SemanticColumn,
  SemanticKpi,
  SemanticRelationship,
  SemanticSearchEntityType,
  SemanticTable,
  SemanticType
} from '../semantic-layer/semantic.types';

export type TextToSqlProvider = 'static' | 'ollama' | 'groq' | 'openrouter' | 'auto';
export type LlmTextToSqlProvider = Exclude<TextToSqlProvider, 'static' | 'auto'>;

export type IntentCategory =
  | 'IN_SCOPE_BI'
  | 'OUT_OF_SCOPE'
  | 'INSUFFICIENT_CONTEXT'
  | 'DESTRUCTIVE_REQUEST'
  | 'UNSUPPORTED_ANALYSIS';

export interface IntentClassificationResult {
  category: IntentCategory;
  reason: string;
  reformulation: string;
}

export interface ScopeValidationResult extends IntentClassificationResult {
  ok: boolean;
}

export interface QueryEntity {
  type: 'table' | 'column' | 'kpi';
  name: string;
  technicalName?: string;
}

export interface QueryProvenance {
  datasourceId?: string;
  retrieval?: Array<{
    entityType: SemanticSearchEntityType;
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

export interface GenerateQueryResult {
  status: 'ok' | 'cannot_answer';
  sql: string;
  language: 'sql';
  canExecute: boolean;
  confidence: number;
  reasoning: string;
  usedEntities: QueryEntity[];
  provenance: QueryProvenance;
  warnings: string[];
}

export interface ExecuteQueryResult {
  status: 'ok' | 'cannot_answer' | 'validation_error' | 'execution_error';
  columns: string[];
  rows: Array<Record<string, string | number>>;
  chartType: 'line' | 'bar' | 'pie' | 'table';
  narrative: string;
  executionMs: number;
  confidence: number;
  usedEntities: QueryEntity[];
  provenance: QueryProvenance;
  warnings: string[];
}

export interface SemanticQueryFilter {
  table?: SemanticTable;
  column: SemanticColumn;
  value: string;
}

export interface SemanticQueryPlan {
  intent: 'metric' | 'time_series' | 'breakdown' | 'list_records';
  sql: string;
  confidence: number;
  reasoning: string;
  table: SemanticTable;
  metricAlias: string;
  metricFormula: string;
  matchedKpi?: SemanticKpi;
  measureColumn?: SemanticColumn;
  selectedColumns?: SemanticColumn[];
  dimensionTable?: SemanticTable;
  dimensionColumn?: SemanticColumn;
  dateColumn?: SemanticColumn;
  dateGranularity?: 'day' | 'month' | 'year';
  filters?: SemanticQueryFilter[];
  joinRelationship?: SemanticRelationship;
  chartType: ExecuteQueryResult['chartType'];
}

export interface BusinessIntent {
  entity?: string;
  metric?: string;
  aggregation?: 'sum' | 'avg' | 'count';
  ranking?: boolean;
  sort?: 'asc' | 'desc';
  topN?: number;
}

export interface SemanticJoinSelection {
  table: SemanticTable;
  labelColumn: SemanticColumn;
  sourceColumn: SemanticColumn;
  targetColumn: SemanticColumn;
  relationship?: SemanticRelationship;
}

export interface BusinessIntentDimensionSelection {
  table: SemanticTable;
  labelColumn: SemanticColumn;
  sourceColumn: SemanticColumn;
  targetColumn: SemanticColumn;
  relationship?: SemanticRelationship;
}

export interface LlmSqlCandidate {
  provider: LlmTextToSqlProvider;
  model: string;
  sql: string;
  intent?: SemanticQueryPlan['intent'];
  confidence: number;
  reasoning: string;
  chartType?: ExecuteQueryResult['chartType'];
  warnings: string[];
}

export interface LlmSqlPlanResult {
  plan?: SemanticQueryPlan;
  validation?: any;
  warnings: string[];
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
  messages: Array<Record<string, unknown>>;
}
