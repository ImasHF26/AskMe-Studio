// Types pour l'enrichissement sémantique MCP

export interface McpEnrichColumnResult {
  technicalName: string;
  tableTechnicalName: string;
  suggestedBusinessName: string;
  description: string;
  exampleQuestions: string[];
}

export interface McpEnrichKpiResult {
  name: string;
  sqlFormula: string;
  description: string;
  formatting: 'currency' | 'number' | 'percent' | 'integer';
  insight: string;
}

export interface McpEnrichSynonymResult {
  term: string;
  mappedValue: string;
  rationale: string;
}

export interface McpEnrichmentResponse {
  columns: McpEnrichColumnResult[];
  kpis: McpEnrichKpiResult[];
  synonyms: McpEnrichSynonymResult[];
  sectorInsights: string[];
  provider: string;
  model: string;
}

export interface McpEnrichRequest {
  datasourceId: string;
  businessSector: string;
  language: 'fr' | 'en' | 'ar';
  columns: unknown[];
  kpis: unknown[];
  synonyms: unknown[];
  provider?: string;
}
