const numberFromEnv = (names: string[], defaultValue: number) => {
  for (const name of names) {
    const raw = process.env[name];
    if (raw === undefined || raw === '') continue;
    const value = Number(raw);
    if (Number.isFinite(value)) return value;
  }
  return defaultValue;
};

const optionalListFromEnv = (name: string) => {
  const raw = process.env[name];
  if (!raw) return undefined;
  const values = raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return values.length ? values : undefined;
};

export interface AiGenerationProfile {
  temperature: number;
  topP: number;
  maxCompletionTokens: number;
  frequencyPenalty: number;
  presencePenalty: number;
  stop?: string[];
}

export const aiGenerationConfig = {
  sql: {
    // SQL generation must be deterministic and schema-bound; low entropy reduces creative joins and invented columns.
    temperature: numberFromEnv(['SQL_GENERATION_TEMPERATURE', 'TEXT_TO_SQL_TEMPERATURE'], 0),
    topP: numberFromEnv(['SQL_GENERATION_TOP_P', 'TEXT_TO_SQL_TOP_P'], 0.85),
    maxCompletionTokens: numberFromEnv(['SQL_GENERATION_MAX_COMPLETION_TOKENS', 'TEXT_TO_SQL_MAX_TOKENS'], 512),
    frequencyPenalty: numberFromEnv(['SQL_GENERATION_FREQUENCY_PENALTY', 'TEXT_TO_SQL_FREQUENCY_PENALTY'], 0),
    presencePenalty: numberFromEnv(['SQL_GENERATION_PRESENCE_PENALTY', 'TEXT_TO_SQL_PRESENCE_PENALTY'], 0),
    stop: optionalListFromEnv('SQL_GENERATION_STOP')
  },
  narrative: {
    // Narration can be slightly more fluent, but still grounded in executed rows only.
    temperature: numberFromEnv(['NARRATIVE_TEMPERATURE'], 0.3),
    topP: numberFromEnv(['NARRATIVE_TOP_P'], 0.9),
    maxCompletionTokens: numberFromEnv(['NARRATIVE_MAX_COMPLETION_TOKENS'], 1000),
    frequencyPenalty: numberFromEnv(['NARRATIVE_FREQUENCY_PENALTY'], 0),
    presencePenalty: numberFromEnv(['NARRATIVE_PRESENCE_PENALTY'], 0),
    stop: optionalListFromEnv('NARRATIVE_STOP')
  },
  fallback: {
    // Fallback/debug calls stay short so failures do not consume the whole request budget.
    timeoutMs: numberFromEnv(['TEXT_TO_SQL_TIMEOUT_MS'], 15000)
  }
} satisfies Record<string, AiGenerationProfile | { timeoutMs: number }>;
