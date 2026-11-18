# AskMe Studio System Architecture

## 1) High-Level Architecture

```txt
Vue 3 + Vuetify Frontend
        |
        v
NestJS API Gateway (JWT verification, RBAC, request routing)
        |
        v
NestJS Microservices (REST internal contracts)
  |- auth-service
  |- datasource-service
  |- metadata-service
  |- semantic-layer-service
  |- ai-copilot-service
  |- query-executor-service
  |- dashboard-service
  |- analytics-service
  |- narrative-service
        |
        +--> PostgreSQL + PgVector (platform state + semantic index + metadata + dashboards + history)
        +--> MongoDB (document data, profiling snapshots, flexible analytics artifacts)
        +--> Redis (cache, rate limits, query/session short-term memory)
        +--> External DBs (customer PostgreSQL / MongoDB)
        +--> File inputs (CSV / Excel)
        +--> LLM providers (Groq primary, Ollama fallback)
```

## 2) Core Runtime Principles
- Read-only query execution on user data sources.
- Strict anti-hallucination: LLM context comes only from semantic layer + verified schema metadata + executed result rows.
- Semantic layer source of truth remains relational; PgVector is a retrieval index for business matching only.
- Lightweight local-first: all services are containerized and tuned for 8GB RAM.
- No Kubernetes and no heavy distributed engines.

## 3) Main Runtime Flow
1. User signs in and receives JWT.
2. User adds datasource or uploads CSV/Excel.
3. Metadata service profiles schema and statistics.
4. Semantic layer service generates initial business model.
5. Semantic objects are indexed into PgVector for semantic retrieval.
6. User asks a question in natural language.
7. AI copilot retrieves candidate semantic objects and generates a constrained query plan.
8. Query executor validates, secures, executes, normalizes result.
9. LLM narrative is optional and can use only validated executed rows.
10. Analytics service optionally runs anomaly/forecast logic.

## 4) Service Boundaries (Single Responsibility)
- `auth-service`: identity and authorization.
- `datasource-service`: connector lifecycle and credential management.
- `metadata-service`: schema introspection and dataset profiling.
- `semantic-layer-service`: business model entities and KPI definitions.
- `ai-copilot-service`: prompt orchestration and query generation.
- `query-executor-service`: secure execution and result normalization.
- `dashboard-service`: widget/layout persistence and retrieval.
- `analytics-service`: anomaly and forecasting jobs.
- `narrative-service`: natural language explanations and recommendations.

## 5) Microservice Communication
- External client -> API Gateway via HTTPS REST.
- API Gateway -> services via private HTTP REST.
- Event-driven optional hooks (future): Redis pub/sub for async notifications.

## 6) Resource Targets (Local Dev)
- Frontend: 300MB to 500MB
- API Gateway: 200MB
- Average microservice: 150MB to 250MB each
- PostgreSQL + MongoDB + Redis combined: 1.5GB to 2.5GB
- Total target: under 7GB with conservative limits

## 7) V1 Out-of-Scope
- Oracle and SQL Server connectors
- Kubernetes deployment
- Spark/Flink data processing clusters
