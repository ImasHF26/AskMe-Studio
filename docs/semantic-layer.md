# Semantic Layer Design

## 1) Purpose
The semantic layer converts raw technical schema into business context that the copilot can trust. It improves SQL quality and reduces hallucinations.

## 2) Data Model

### SemanticTable
- `id`
- `datasource_id`
- `dataset_name`
- `technical_name`
- `business_name`
- `description`
- `table_type` (`fact` or `dimension`)

### SemanticColumn
- `id`
- `semantic_table_id`
- `technical_name`
- `business_name`
- `semantic_type` (`measure`, `dimension`, `date`, `identifier`)
- `data_type`
- `is_nullable`

### SemanticRelationship
- `id`
- `from_table_id`
- `from_column_id`
- `to_table_id`
- `to_column_id`
- `join_type`
- `cardinality` (`1:1`, `1:n`, `n:1`, `n:n`)

### SemanticKPI
- `id`
- `name`
- `sql_formula`
- `description`
- `formatting`
- `grain`

### SemanticSynonym
- `id`
- `term`
- `normalized_term`
- `mapped_entity_type` (`table`, `column`, `kpi`)
- `mapped_entity_id`

## 3) Auto-Generation Workflow
1. Metadata service inspects schema and samples.
2. Heuristics assign initial fact/dimension labels.
3. Column semantic types are inferred.
4. FK patterns infer relationships.
5. KPI templates are proposed (`sum`, `avg`, `count distinct`, ratios).
6. Synonyms are generated from aliases and business terms.
7. Analyst validates and edits before production use.

## 4) Anti-Hallucination Policy
- LLM sees only semantic objects plus approved query templates.
- Query generator cannot reference undefined tables/columns.
- Any unknown field request triggers rejection message:
  - `This question cannot be answered with available data.`

## 5) Example Synonyms
- `revenue = sales = chiffre d'affaires`
- `customer = client`
