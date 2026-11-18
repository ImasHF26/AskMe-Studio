import { Injectable } from '@nestjs/common';

type SemanticType = 'measure' | 'dimension' | 'date' | 'identifier' | 'unknown';

interface SemanticColumn {
  technicalName: string;
  businessName: string;
  semanticType: SemanticType;
}

interface SemanticTable {
  technicalName: string;
  businessName: string;
  columns: SemanticColumn[];
}

interface SemanticKpi {
  name: string;
  description?: string;
}

interface SemanticSynonym {
  term: string;
  mappedValue: string;
}

interface SemanticLayerInput {
  tables?: SemanticTable[];
  kpis?: SemanticKpi[];
  synonyms?: SemanticSynonym[];
}

interface AnalyzeIntentInput {
  question: string;
  semanticLayer?: SemanticLayerInput;
}

@Injectable()
export class AppService {
  health() {
    return {
      service: 'ai-copilot-service',
      status: 'ok',
      capabilities: ['intent-analysis', 'semantic-answerability', 'anti-hallucination-policy']
    };
  }

  policy() {
    return {
      rules: [
        'Use only tables, columns, KPIs, and synonyms present in the semantic layer.',
        'Reject questions that cannot be grounded in the selected datasource.',
        'Return empty rows with a clear status instead of fabricated fallback data.',
        'Require SQL validation before execution.',
        'Attach provenance to every generated and executed answer.'
      ]
    };
  }

  analyzeIntent(input: AnalyzeIntentInput) {
    const normalized = this.normalize(input.question || '');
    const layer = input.semanticLayer || {};
    const tables = layer.tables || [];
    const kpis = layer.kpis || [];
    const synonyms = layer.synonyms || [];
    const matchedSynonyms = synonyms.filter((synonym) => normalized.includes(this.normalize(synonym.term)));
    const matchedKpis = kpis.filter((kpi) =>
      [kpi.name, kpi.description || ''].some((value) => this.semanticMatch(normalized, value))
    );
    const matchedColumns = tables.flatMap((table) =>
      table.columns
        .filter((column) =>
          [column.technicalName, column.businessName, table.technicalName, table.businessName].some((value) =>
            this.semanticMatch(normalized, value)
          )
        )
        .map((column) => ({
          table: table.technicalName,
          column: column.technicalName,
          semanticType: column.semanticType
        }))
    );
    const wantsTime = this.includesAny(normalized, ['month', 'monthly', 'mois', 'annee', 'année', 'year', 'trend', 'evolution']);
    const wantsDistribution = this.includesAny(normalized, [
      'by',
      'per',
      'par',
      'top',
      'ranking',
      'distribution',
      'repartition',
      'répartition',
      'breakdown'
    ]);
    const answerable = Boolean(tables.length && (matchedKpis.length || matchedColumns.length || matchedSynonyms.length));

    return {
      intent: wantsTime ? 'time_series' : wantsDistribution ? 'breakdown' : 'metric',
      answerable,
      confidence: answerable ? Math.min(0.9, 0.55 + (matchedKpis.length + matchedColumns.length + matchedSynonyms.length) * 0.08) : 0.2,
      matched: {
        kpis: matchedKpis.map((kpi) => kpi.name),
        columns: matchedColumns,
        synonyms: matchedSynonyms.map((synonym) => ({ term: synonym.term, mappedValue: synonym.mappedValue }))
      },
      rejectionReason: answerable ? undefined : 'Question is not grounded in the provided semantic layer.'
    };
  }

  private semanticMatch(normalizedQuestion: string, value: string) {
    const normalizedValue = this.normalize(value);
    if (!normalizedValue) return false;
    if (normalizedQuestion.includes(normalizedValue)) return true;
    return normalizedValue.split(' ').some((part) => part.length > 2 && normalizedQuestion.includes(part));
  }

  private includesAny(value: string, needles: string[]) {
    return needles.some((needle) => value.includes(needle));
  }

  private normalize(value: string) {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[_-]+/g, ' ')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
