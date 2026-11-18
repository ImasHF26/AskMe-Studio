# Prompt Engineering and Text-to-SQL Pipeline

## 1) Pipeline
```txt
User Question
  -> Intent Analysis
  -> Semantic Layer Retrieval
  -> PgVector Semantic Search (tables, columns, KPIs, synonyms)
  -> Prompt Construction
  -> Optional Text-to-SQL LLM Generation (Ollama/Groq)
  -> Deterministic Semantic Planner Fallback
  -> SQL/Mongo Validation
  -> Secure Execution
  -> Results + Provenance + Optional Groq Narrative + Chart Recommendation
```

## 2) Text-to-SQL Provider Configuration
AskMe can run with the deterministic planner only, or ask a model to generate the SQL candidate first.

```env
# static = deterministic planner only
# ollama = local Ollama model
# groq = Groq API
# auto = try Ollama first, then Groq
TEXT_TO_SQL_PROVIDER=groq

# Optional provider-level switches.
TEXT_TO_SQL_OLLAMA_ENABLED=true
TEXT_TO_SQL_GROQ_ENABLED=true

# Recommended local model for Ollama.
OLLAMA_BASE_URL=http://host.docker.internal:11434
OLLAMA_SQL_MODEL=qwen2.5-coder:7b

# Groq model for Text-to-SQL.
GROQ_API_KEY=change-me
GROQ_SQL_MODEL=llama-3.1-8b-instant

TEXT_TO_SQL_TIMEOUT_MS=15000
TEXT_TO_SQL_MAX_TOKENS=700
TEXT_TO_SQL_TEMPERATURE=0
TEXT_TO_SQL_MAX_CONTEXT_TABLES=3
TEXT_TO_SQL_MAX_CONTEXT_COLUMNS_PER_TABLE=18
TEXT_TO_SQL_MAX_CONTEXT_KPIS=8
TEXT_TO_SQL_MAX_CONTEXT_SYNONYMS=12
TEXT_TO_SQL_MAX_PROMPT_CONTEXT_CHARS=12000
```

Every LLM output is treated as an untrusted SQL candidate. It must pass the same semantic validation as deterministic SQL before execution. If all enabled LLM providers fail, AskMe falls back to the deterministic semantic planner. The prompt context is deliberately compacted before Groq/Ollama calls to avoid oversized requests and to keep the model focused on relevant semantic objects.

## 3) Prompt Template (SQL)
```txt
System:
You are an analytics query generator.
Rules:
1) Use only tables/columns listed in semantic context.
2) Generate read-only SQL.
3) Always include LIMIT <= 500.
4) Never use blocked keywords: DELETE, UPDATE, DROP, ALTER, INSERT, TRUNCATE.
5) If question cannot be answered, output: CANNOT_ANSWER.
6) Never return synthetic rows as a fallback for failed execution.
7) PgVector hits are hints only; SQL may reference only validated semantic objects.
8) Semantic layer language changes business labels/descriptions/synonyms only; technical names and SQL formulas stay unchanged.
9) Return JSON only.
10) Do not use table aliases, subqueries, comments, CTEs, DDL, mutations, or multiple statements.
11) Never use SELECT *; list explicit semantic columns.

Semantic Context:
- Tables: ...
- Columns: ...
- Relationships: ...
- KPIs: ...
- Synonyms: ...

User Question:
{{question}}

Output JSON:
{
  "sql": "...",
  "explanation": "...",
  "confidence": 0.0,
  "used_entities": [],
  "provenance": {
    "table": "...",
    "columns": [],
    "sql_validated": true
  },
  "warnings": []
}
```

## 4) Validation Steps
- SQL parser validation.
- Entity whitelist check against semantic model.
- Read-only keyword enforcement.
- Automatic LIMIT injection if missing.
- Timeout and estimated cost checks.
- Empty result with explicit `cannot_answer`, `validation_error`, or `execution_error` status when validation/execution fails.
- LLM narrative can run only after secure execution and must use only returned rows.

## 5) Retry and Repair Strategy
1. Parse/execute fails.
2. Return bounded error context to LLM.
3. Retry once with stricter instruction.
4. If still invalid, return:
   - `This question cannot be answered with available data.`
5. Do not fabricate chart rows, trend values, top segments, or KPI totals.

## 6) Chart Recommendation Rules
- Time series + continuous date: line/area chart.
- Categorical aggregation: bar chart.
- Part-to-whole: pie chart.
- Multi-metric comparison: grouped bar/scatter.
- Record listing requests: table result with selected non-identifier columns.
- Simple dimension filters: same-table `WHERE` predicates only; relationship joins require explicit semantic relationships.

## 7) Narrative Template
```txt
Summary: <one-line trend>
Key drivers: <top dimensions and values>
Anomalies: <spike/drop + date>
Recommendation: <next action>
```
