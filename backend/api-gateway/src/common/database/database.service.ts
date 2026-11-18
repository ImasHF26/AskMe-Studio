import { Injectable, OnModuleInit } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { Pool } from 'pg';
import { newId } from '../utils/id.utils';

@Injectable()
export class DatabaseService implements OnModuleInit {
  readonly pool?: Pool;
  dbReady = false;
  semanticVectorReady = false;

  constructor() {
    const connectionString = process.env.POSTGRES_URL;
    if (connectionString) {
      this.pool = new Pool({ connectionString });
    }
  }

  async onModuleInit() {
    if (!this.pool) return;

    try {
      await this.pool.query('SELECT 1;');
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS app_users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          full_name TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);

      const demoUserEmail = 'demo@askme.studio';
      const existingDemoUser = await this.pool.query('SELECT id FROM app_users WHERE email = $1 LIMIT 1', [
        demoUserEmail
      ]);
      if (!existingDemoUser.rowCount) {
        const demoPasswordHash = await bcrypt.hash('password123', 10);
        const demoId = newId('usr');
        await this.pool.query(
          `INSERT INTO app_users (id, email, full_name, password_hash, role) VALUES ($1, $2, $3, $4, $5)`,
          [demoId, demoUserEmail, 'Demo User', demoPasswordHash, 'Analyst']
        );
      }

      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS app_datasources (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          encrypted_credentials TEXT,
          connection_config JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);
      await this.pool.query('ALTER TABLE app_datasources ADD COLUMN IF NOT EXISTS encrypted_credentials TEXT;');
      await this.pool.query(
        "ALTER TABLE app_datasources ADD COLUMN IF NOT EXISTS connection_config JSONB NOT NULL DEFAULT '{}'::jsonb;"
      );

      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS app_query_history (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
          question TEXT NOT NULL,
          sql TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS app_chat_sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
          datasource_id TEXT,
          title TEXT NOT NULL,
          messages JSONB NOT NULL DEFAULT '[]'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON app_chat_sessions(user_id, updated_at DESC);
      `);

      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS app_semantic_tables (
          id TEXT PRIMARY KEY,
          datasource_id TEXT NOT NULL REFERENCES app_datasources(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
          technical_name TEXT NOT NULL,
          business_name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          table_type TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);

      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS app_semantic_columns (
          id TEXT PRIMARY KEY,
          table_id TEXT NOT NULL REFERENCES app_semantic_tables(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
          technical_name TEXT NOT NULL,
          business_name TEXT NOT NULL,
          semantic_type TEXT NOT NULL,
          data_type TEXT NOT NULL,
          is_nullable BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);

      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS app_semantic_kpis (
          id TEXT PRIMARY KEY,
          datasource_id TEXT NOT NULL REFERENCES app_datasources(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          sql_formula TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          formatting TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);

      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS app_semantic_synonyms (
          id TEXT PRIMARY KEY,
          datasource_id TEXT NOT NULL REFERENCES app_datasources(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
          term TEXT NOT NULL,
          mapped_value TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);

      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS app_semantic_relationships (
          id TEXT PRIMARY KEY,
          datasource_id TEXT NOT NULL REFERENCES app_datasources(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
          from_table_id TEXT NOT NULL REFERENCES app_semantic_tables(id) ON DELETE CASCADE,
          from_column_id TEXT NOT NULL REFERENCES app_semantic_columns(id) ON DELETE CASCADE,
          to_table_id TEXT NOT NULL REFERENCES app_semantic_tables(id) ON DELETE CASCADE,
          to_column_id TEXT NOT NULL REFERENCES app_semantic_columns(id) ON DELETE CASCADE,
          join_type TEXT NOT NULL,
          cardinality TEXT NOT NULL,
          confidence NUMERIC NOT NULL DEFAULT 0.5,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (datasource_id, user_id, from_table_id, from_column_id, to_table_id, to_column_id)
        );
      `);

      await this.initializeSemanticVectorStore();
      this.dbReady = true;
    } catch (error) {
      this.dbReady = false;
      console.error('PostgreSQL unavailable, using in-memory fallback.');
    }
  }

  getHealth() {
    return {
      service: 'api-gateway',
      status: 'ok',
      persistence: this.dbReady ? 'postgresql' : 'memory',
      semanticVectorSearch: this.semanticVectorReady ? 'pgvector' : 'disabled'
    };
  }

  private async initializeSemanticVectorStore() {
    if (!this.pool) return;

    try {
      await this.pool.query('CREATE EXTENSION IF NOT EXISTS vector;');
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS app_semantic_search_entries (
          id TEXT PRIMARY KEY,
          datasource_id TEXT NOT NULL REFERENCES app_datasources(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          entity_name TEXT NOT NULL,
          mapped_value TEXT,
          content TEXT NOT NULL,
          metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          embedding vector(384) NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (datasource_id, user_id, entity_type, entity_id)
        );
      `);
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_semantic_search_owner
        ON app_semantic_search_entries (user_id, datasource_id, entity_type);
      `);
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_semantic_search_embedding
        ON app_semantic_search_entries USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 64);
      `);
      this.semanticVectorReady = true;
    } catch (error) {
      this.semanticVectorReady = false;
      console.warn(
        `PgVector semantic search disabled: ${error instanceof Error ? error.message : 'unknown initialization error'}.`
      );
    }
  }
}
