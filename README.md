# AskMe Studio

AskMe Studio is an AI-augmented Business Intelligence copilot that combines:
- conversational analytics
- secure query execution
- semantic modeling
- dashboard generation
- narrative insights

It is designed for lightweight local development and PFE demonstration on an 8GB RAM laptop.

## Product Scope (V1)
- Data sources: PostgreSQL, MongoDB, CSV, Excel
- Frontend: Vue 3, Vuetify, Pinia, Vue Router, ApexCharts, Vue Grid Layout, Axios
- Backend: NestJS microservices + REST APIs
- Core data stores: PostgreSQL, MongoDB, Redis
- AI providers: Groq API (primary), Ollama (optional local)
- DevOps: Docker + Docker Compose (no Kubernetes)

## System Architecture
```txt
Frontend (Vue/Vuetify)
        |
API Gateway (NestJS)
        |
Microservices
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
PostgreSQL / MongoDB / CSV
        |
Groq API / Ollama
```

## Core Capabilities
- JWT authentication + RBAC (`Admin`, `Analyst`, `Viewer`)
- Datasource onboarding and testing
- Automated schema profiling + semantic layer generation
- Text-to-SQL and Text-to-MongoQuery with anti-hallucination guardrails
- Secure read-only execution with automatic `LIMIT`, timeout, and validation
- Visualization and dashboard widget generation
- Narrative BI summaries and anomaly signals

## MVP Checklist
- JWT Authentication
- PostgreSQL connection
- MongoDB connection
- CSV/Excel upload
- Dataset analysis
- Semantic layer generation
- Text-to-SQL/Text-to-Query
- Secure query execution
- Result visualization
- Dashboard builder
- Widget saving
- Narrative BI
- Query history

## Repository Structure
```txt
.
├── backend
│   ├── api-gateway
│   ├── libs/common
│   └── services
│       ├── auth-service
│       ├── datasource-service
│       ├── metadata-service
│       ├── semantic-layer-service
│       ├── ai-copilot-service
│       ├── query-executor-service
│       ├── dashboard-service
│       ├── analytics-service
│       └── narrative-service
├── docker-compose.yml
├── frontend
├── package.json
├── pnpm-workspace.yaml
├── README.md
└── docs
    ├── api-design.md
    ├── backend-architecture.md
    ├── database-schema.sql
    ├── deployment-architecture.md
    ├── folder-structure.md
    ├── frontend-architecture.md
    ├── prompt-engineering.md
    ├── security-architecture.md
    ├── semantic-layer.md
    ├── system-architecture.md
    └── ux-wireframes.md
```

## Local Run
1. Copy env files for services (template values described in `docs/deployment-architecture.md`).
2. Install dependencies:
```bash
pnpm install
```
3. Start local monorepo in development mode:
```bash
pnpm dev
```
4. Or run full docker stack:
```bash
docker compose up -d
```
5. Open app:
- Frontend: `http://localhost:15173`
- API Gateway: `http://localhost:8080`

## Authentication Flow
- Register: `POST /api/v1/auth/register`
- Login: `POST /api/v1/auth/login`
- Current user: `GET /api/v1/auth/me`
- Protected endpoints (`datasources`, `copilot`, `history`) require `Authorization: Bearer <token>`.
- Datasource connectivity test: `POST /api/v1/datasources/test`

## Dataset Profiling Endpoints
- `GET /api/v1/datasets/:datasourceId/tables`
- `GET /api/v1/datasets/:datasourceId/tables/:tableName/columns`
- `GET /api/v1/datasets/:datasourceId/tables/:tableName/profile`
- `GET /api/v1/datasets/:datasourceId/tables/:tableName/preview`

## Dashboard Builder Endpoints
- `GET /api/v1/dashboards`
- `POST /api/v1/dashboards`
- `GET /api/v1/dashboards/:dashboardId`
- `PUT /api/v1/dashboards/:dashboardId`
- `DELETE /api/v1/dashboards/:dashboardId`
- `POST /api/v1/dashboards/:dashboardId/widgets`
- `PUT /api/v1/dashboards/:dashboardId/widgets/:widgetId`
- `DELETE /api/v1/dashboards/:dashboardId/widgets/:widgetId`

## Architecture Documentation
- [System Architecture](docs/system-architecture.md)
- [Frontend Architecture](docs/frontend-architecture.md)
- [Backend Architecture](docs/backend-architecture.md)
- [Semantic Layer Design](docs/semantic-layer.md)
- [API Design](docs/api-design.md)
- [Prompt Engineering](docs/prompt-engineering.md)
- [Database Schema](docs/database-schema.sql)
- [UX Wireframes](docs/ux-wireframes.md)
- [Deployment Architecture](docs/deployment-architecture.md)
- [Security Architecture](docs/security-architecture.md)
- [Folder Structure Blueprint](docs/folder-structure.md)
