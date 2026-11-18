const numberFromEnv = (names: string[], defaultValue: number) => {
  for (const name of names) {
    const raw = process.env[name];
    if (raw === undefined || raw === '') continue;
    const value = Number(raw);
    if (Number.isFinite(value)) return value;
  }
  return defaultValue;
};

const integerFromEnv = (names: string[], defaultValue: number) => Math.max(1, Math.round(numberFromEnv(names, defaultValue)));

export const semanticRetrievalConfig = {
  // topK=10 gives the SQL planner enough schema evidence without flooding the prompt with weak matches.
  topK: integerFromEnv(['SEMANTIC_SEARCH_TOP_K', 'TEXT_TO_SQL_RETRIEVAL_TOP_K'], 10),
  // MMR 0.4 favors relevance while still diversifying table/column/KPI hints to reduce repeated near-duplicates.
  mmr: numberFromEnv(['SEMANTIC_SEARCH_MMR', 'TEXT_TO_SQL_RETRIEVAL_MMR'], 0.4),
  // A modest threshold filters low-similarity PgVector hits before they can bias the prompt.
  similarityThreshold: numberFromEnv(['SEMANTIC_SEARCH_SIMILARITY_THRESHOLD', 'TEXT_TO_SQL_SIMILARITY_THRESHOLD'], 0.1),
  context: {
    // Keep the LLM context narrow: the validator enforces correctness, and smaller prompts reduce hallucinated joins.
    maxTables: integerFromEnv(['TEXT_TO_SQL_MAX_CONTEXT_TABLES'], 3),
    maxColumnsPerTable: integerFromEnv(['TEXT_TO_SQL_MAX_CONTEXT_COLUMNS_PER_TABLE'], 12),
    maxKpis: integerFromEnv(['TEXT_TO_SQL_MAX_CONTEXT_KPIS'], 5),
    maxSynonyms: integerFromEnv(['TEXT_TO_SQL_MAX_CONTEXT_SYNONYMS'], 6),
    maxRelationships: integerFromEnv(['TEXT_TO_SQL_MAX_CONTEXT_RELATIONSHIPS'], 8),
    maxRetrievalHints: integerFromEnv(['TEXT_TO_SQL_MAX_CONTEXT_RETRIEVAL_HINTS'], 5),
    maxPromptContextChars: integerFromEnv(['TEXT_TO_SQL_MAX_PROMPT_CONTEXT_CHARS'], 10000)
  },
  compactContext: {
    // Emergency trimming keeps large semantic layers inside the model budget while preserving the strongest objects.
    maxTables: integerFromEnv(['TEXT_TO_SQL_COMPACT_CONTEXT_TABLES'], 1),
    maxColumnsPerTable: integerFromEnv(['TEXT_TO_SQL_COMPACT_CONTEXT_COLUMNS_PER_TABLE'], 12),
    maxKpis: integerFromEnv(['TEXT_TO_SQL_COMPACT_CONTEXT_KPIS'], 3),
    maxSynonyms: integerFromEnv(['TEXT_TO_SQL_COMPACT_CONTEXT_SYNONYMS'], 4),
    maxRelationships: integerFromEnv(['TEXT_TO_SQL_COMPACT_CONTEXT_RELATIONSHIPS'], 4),
    maxRetrievalHints: integerFromEnv(['TEXT_TO_SQL_COMPACT_CONTEXT_RETRIEVAL_HINTS'], 3)
  }
};
