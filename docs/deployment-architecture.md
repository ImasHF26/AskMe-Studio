# Deployment Architecture (Docker Compose)

## 1) Containers
- `frontend`
- `api-gateway`
- `auth-service`
- `datasource-service`
- `metadata-service`
- `semantic-layer-service`
- `ai-copilot-service`
- `query-executor-service`
- `dashboard-service`
- `analytics-service`
- `narrative-service`
- `postgres`
- `mongodb`
- `redis`

## 2) Runtime Topology
- All application containers on a private compose network.
- API gateway is the only public backend entrypoint.
- Internal services are exposed only inside docker network.
- Host-exposed ports for local access:
  - Frontend: `15173`
  - API Gateway: `8080`
  - PostgreSQL: `15432`
  - MongoDB: `17017`
  - Redis: `163179`

## 3) Environment Variables
Global examples:
- `NODE_ENV=development`
- `JWT_SECRET=<strong-random-secret>`
- `JWT_EXPIRES_IN=15m`
- `POSTGRES_URL=postgresql://askme:askme@postgres:5432/askme`
- `MONGODB_URL=mongodb://mongodb:27017/askme`
- `REDIS_URL=redis://redis:63179`
- `GROQ_API_KEY=<key>`
- `OLLAMA_BASE_URL=http://host.docker.internal:11434`
- `QUERY_TIMEOUT_MS=30000`
- `QUERY_MAX_ROWS=500`

## 4) Resource Configuration
Recommended Docker limits for local machine:
- app services: `256m` to `512m` each
- postgres: `768m`
- mongodb: `768m`
- redis: `256m`

## 5) Security in Deployment
- Use service-specific `.env` files.
- Keep datasource credentials encrypted at rest.
- Mount no host path with secrets in plaintext.
- Terminate TLS in reverse proxy for production.

## 6) Scale Path (Post-MVP)
- Horizontal replica for query executor and ai-copilot services.
- Add worker queues for analytics/narrative async jobs.
- Split metadata heavy tasks to scheduled background processors.
