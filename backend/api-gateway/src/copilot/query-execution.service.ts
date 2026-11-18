import { BadRequestException, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import type { DatasourceResolvedContext } from '../datasources/datasource-manager.service';
import { SqlSecurityGuardService } from './sql-security-guard.service';

export interface SqlExecutionRawResult {
  columns: string[];
  rows: Array<Record<string, string | number>>;
  executionMs: number;
}

@Injectable()
export class QueryExecutionService {
  constructor(private readonly sqlGuard: SqlSecurityGuardService) {}

  async executePostgresQuery(
    context: DatasourceResolvedContext,
    sql: string
  ): Promise<SqlExecutionRawResult> {
    const startedAt = Date.now();
    const pool = this.newDatasourcePostgresPool(context);
    const client = await pool.connect();

    try {
      const schema = String(context.connectionConfig?.schema || '').trim();
      if (schema) {
        this.sqlGuard.assertSafeDatasourceSchema(schema);
        await client.query(`SET search_path TO ${this.sqlGuard.quoteSqlIdentifier(schema)}, public`);
      }

      const result = await client.query(sql);
      const columns = result.fields.map((field) => field.name);
      const rows = result.rows.map((row) => this.normalizeResultRow(row));

      return {
        columns,
        rows,
        executionMs: Date.now() - startedAt
      };
    } finally {
      client.release();
      await pool.end().catch(() => undefined);
    }
  }

  newDatasourcePostgresPool(context: DatasourceResolvedContext): Pool {
    const cfg = context.connectionConfig || {};
    const creds = context.credentials || {};
    const host = this.normalizeDatasourceRuntimeHost(String(cfg.host || '').trim());
    const database = String(cfg.database || '').trim();
    const user = String(creds.username || '').trim();
    const password = String(creds.password || '').trim();
    const port = Number(cfg.port || 5432);

    if (!host || !database || !user) {
      throw new BadRequestException('PostgreSQL execution requires host, database, and username.');
    }

    return new Pool({
      host,
      port,
      database,
      user,
      password,
      ssl: cfg.ssl ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 5000,
      statement_timeout: Number(process.env.QUERY_TIMEOUT_MS || 30000)
    });
  }

  normalizeDatasourceRuntimeHost(host: string): string {
    if (!['localhost', '127.0.0.1', '::1'].includes(host.toLowerCase())) return host;
    if (!String(process.env.POSTGRES_URL || '').includes('@postgres:')) return host;
    return process.env.HOST_DOCKER_INTERNAL || 'host.docker.internal';
  }

  normalizeResultRow(row: Record<string, unknown>): Record<string, string | number> {
    return Object.fromEntries(
      Object.entries(row).map(([key, value]) => {
        if (value instanceof Date) return [key, value.toISOString()];
        if (typeof value === 'number' || typeof value === 'string') return [key, value];
        if (typeof value === 'bigint') return [key, Number(value)];
        if (value === null || value === undefined) return [key, ''];
        return [key, String(value)];
      })
    );
  }
}
