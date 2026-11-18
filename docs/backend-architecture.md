# Backend Architecture (NestJS Microservices)

## 1) Service Catalog

### auth-service
Responsibilities:
- user registration/login
- JWT issuance and refresh
- role management (`Admin`, `Analyst`, `Viewer`)

### datasource-service
Responsibilities:
- datasource CRUD
- encrypted credential storage
- connection tests
- CSV/Excel ingestion metadata records

### metadata-service
Responsibilities:
- schema extraction
- datatype detection
- statistics and profiling
- dimensions/measures suggestions

### semantic-layer-service
Responsibilities:
- semantic entities and columns
- relationships and joins
- KPI definitions
- synonyms and business glossary
- PgVector search entries derived from validated semantic objects

### ai-copilot-service
Responsibilities:
- prompt construction
- semantic retrieval and answerability checks
- constrained text-to-SQL and text-to-Mongo query generation
- chart recommendation
- dashboard suggestion
- conversation memory snapshot integration

### query-executor-service
Responsibilities:
- query lint/validation
- blocked keyword detection
- auto `LIMIT`
- timeout and cancellation
- execution adapter routing
- normalized results format

### dashboard-service
Responsibilities:
- dashboard CRUD
- widget config persistence
- layout versioning
- saved query references

### analytics-service
Responsibilities:
- anomaly detection
- trend scoring
- forecasting jobs (moving avg, linear regression, optional Prophet)

### narrative-service
Responsibilities:
- result explanations grounded only in executed rows
- dashboard summaries
- recommendations and alerts text

## 2) Semantic Retrieval and LLM Boundaries
- Relational semantic tables/columns/KPIs/synonyms are the source of truth.
- PgVector stores derived search entries for semantic matching of business language to validated objects.
- Full semantic-layer saves rebuild the datasource search index; single-object edits upsert only the affected table/columns/KPI/synonym entries.
- Initial semantic layer generation supports a business-label language option (`en`, `fr`, `ar`) while preserving technical names and SQL formulas.
- Query plans may use vector hits as hints, but generated SQL must still pass entity whitelist and read-only validation.
- Groq can generate a concise narrative after execution, using only validated rows and provenance.
- Failed validation/execution returns empty rows with explicit status; no synthetic fallback data is allowed.

## 3) API Gateway Responsibilities
- Validate JWT signatures.
- Enforce RBAC policy per route.
- Route requests to internal services.
- Apply request tracing IDs.
- Standardize errors and response envelope.

## 4) Standard Service Structure

```txt
services/
  <service-name>/
    src/
      modules/
      controllers/
      services/
      repositories/
      dto/
      entities/
      guards/
      interceptors/
      config/
      main.ts
    test/
    Dockerfile
```

## 4) Inter-Service Contracts
- Synchronous REST for request/response workflows.
- Shared internal headers:
  - `x-request-id`
  - `x-user-id`
  - `x-tenant-id`
  - `x-user-role`

## 5) Query Security Rules
Blocked operations:
- `DELETE`
- `UPDATE`
- `DROP`
- `ALTER`
- `INSERT`
- `TRUNCATE`

Enforced policies:
- read-only SQL and read-only Mongo pipelines
- statement timeout
- max rows (`LIMIT` default 500)
- max scanned tables per query for V1 safety

## 6) Backend Monorepo Layout

```txt
backend/
  api-gateway/
  services/
    auth-service/
    datasource-service/
    metadata-service/
    semantic-layer-service/
    ai-copilot-service/
    query-executor-service/
    dashboard-service/
    analytics-service/
    narrative-service/
  libs/
    common/
      auth/
      logging/
      http/
      errors/
      contracts/
```
