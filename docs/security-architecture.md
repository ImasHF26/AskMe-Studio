# Security Architecture

## 1) Authentication and Authorization
- JWT access token and refresh token flow.
- RBAC roles:
  - `Admin`
  - `Analyst`
  - `Viewer`
- Gateway enforces route-level role policies.

## 2) Datasource Credential Protection
- Credentials are never returned in API responses.
- Credentials stored encrypted at rest (`encrypted_credentials` JSONB).
- Encryption key stored outside source code (`KMS` or env-based key for V1).

## 3) Query Safety Model
- Query executor blocks destructive operations.
- Read-only DB users are required for external PostgreSQL/Mongo sources.
- Automatic `LIMIT` and timeout prevent runaway queries.

## 4) Audit and Traceability
- All sensitive actions logged in `audit_logs`.
- Request correlation via `x-request-id`.
- Query history captures question, generated query, status, timing, row count.

## 5) Network Security
- Internal services on private docker network.
- Only frontend and gateway exposed to host ports.
- Production recommendation: TLS termination and WAF in front of gateway.

## 6) Secure Defaults
- deny-by-default for unknown roles
- sanitize and validate all query generation inputs
- structured error responses without secret leakage
