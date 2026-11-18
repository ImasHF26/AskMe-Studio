-- AskMe Studio PostgreSQL Schema (V1)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TYPE role_type AS ENUM ('Admin', 'Analyst', 'Viewer');
CREATE TYPE datasource_type AS ENUM ('postgresql', 'mongodb', 'csv', 'excel');
CREATE TYPE datasource_status AS ENUM ('active', 'inactive', 'error');
CREATE TYPE semantic_table_type AS ENUM ('fact', 'dimension');
CREATE TYPE semantic_column_type AS ENUM ('measure', 'dimension', 'date', 'identifier');
CREATE TYPE query_language AS ENUM ('sql', 'mongo');
CREATE TYPE widget_type AS ENUM ('kpi', 'line', 'bar', 'pie', 'table', 'heatmap', 'area', 'scatter');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role role_type NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE TABLE datasources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  type datasource_type NOT NULL,
  encrypted_credentials JSONB,
  connection_config JSONB,
  status datasource_status NOT NULL DEFAULT 'active',
  last_tested_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_datasources_owner ON datasources(owner_user_id);

CREATE TABLE dataset_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  datasource_id UUID NOT NULL REFERENCES datasources(id) ON DELETE CASCADE,
  dataset_name TEXT NOT NULL,
  dataset_kind TEXT NOT NULL,
  row_estimate BIGINT,
  profiled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (datasource_id, dataset_name)
);

CREATE TABLE semantic_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  datasource_id UUID NOT NULL REFERENCES datasources(id) ON DELETE CASCADE,
  dataset_catalog_id UUID REFERENCES dataset_catalog(id) ON DELETE SET NULL,
  technical_name TEXT NOT NULL,
  business_name TEXT NOT NULL,
  description TEXT,
  table_type semantic_table_type NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (datasource_id, technical_name)
);

CREATE TABLE semantic_columns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  semantic_table_id UUID NOT NULL REFERENCES semantic_tables(id) ON DELETE CASCADE,
  technical_name TEXT NOT NULL,
  business_name TEXT NOT NULL,
  semantic_type semantic_column_type NOT NULL,
  data_type TEXT NOT NULL,
  is_nullable BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (semantic_table_id, technical_name)
);

CREATE TABLE semantic_search_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  datasource_id UUID NOT NULL REFERENCES datasources(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  entity_name TEXT NOT NULL,
  mapped_value TEXT,
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  embedding vector(384) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (datasource_id, owner_user_id, entity_type, entity_id)
);

CREATE INDEX idx_semantic_search_owner
  ON semantic_search_entries(owner_user_id, datasource_id, entity_type);

CREATE INDEX idx_semantic_search_embedding
  ON semantic_search_entries USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 64);

CREATE TABLE semantic_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  datasource_id UUID NOT NULL REFERENCES datasources(id) ON DELETE CASCADE,
  from_table_id UUID NOT NULL REFERENCES semantic_tables(id) ON DELETE CASCADE,
  from_column_id UUID NOT NULL REFERENCES semantic_columns(id) ON DELETE CASCADE,
  to_table_id UUID NOT NULL REFERENCES semantic_tables(id) ON DELETE CASCADE,
  to_column_id UUID NOT NULL REFERENCES semantic_columns(id) ON DELETE CASCADE,
  join_type TEXT NOT NULL DEFAULT 'inner',
  cardinality TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE semantic_kpis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  datasource_id UUID NOT NULL REFERENCES datasources(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sql_formula TEXT NOT NULL,
  description TEXT,
  formatting JSONB,
  grain TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (datasource_id, name)
);

CREATE TABLE semantic_synonyms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  datasource_id UUID NOT NULL REFERENCES datasources(id) ON DELETE CASCADE,
  term TEXT NOT NULL,
  normalized_term TEXT NOT NULL,
  mapped_entity_type TEXT NOT NULL,
  mapped_entity_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (datasource_id, normalized_term, mapped_entity_type, mapped_entity_id)
);

CREATE TABLE query_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  datasource_id UUID NOT NULL REFERENCES datasources(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  generated_query TEXT NOT NULL,
  language query_language NOT NULL,
  status TEXT NOT NULL,
  execution_ms INTEGER,
  returned_rows INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_query_history_user_created ON query_history(user_id, created_at DESC);

CREATE TABLE dashboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  layout_version INTEGER NOT NULL DEFAULT 1,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE dashboard_widgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id UUID NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
  datasource_id UUID NOT NULL REFERENCES datasources(id) ON DELETE RESTRICT,
  widget_type widget_type NOT NULL,
  title TEXT NOT NULL,
  query_text TEXT NOT NULL,
  chart_config JSONB NOT NULL,
  filters JSONB,
  axes JSONB,
  grid_position JSONB NOT NULL,
  prompt TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);
