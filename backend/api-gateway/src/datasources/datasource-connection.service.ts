import { BadRequestException, Injectable } from '@nestjs/common';
import { Pool } from 'pg';

type DatasourceType = 'postgresql' | 'mongodb' | 'csv' | 'excel';

interface DatasourceCreateInput {
  name: string;
  type: DatasourceType;
  credentials?: Record<string, unknown>;
  connectionConfig?: Record<string, unknown>;
}

interface DatasourceConnectionTestResult {
  ok: boolean;
  message: string;
  details?: Record<string, unknown>;
}

interface DatasourceSchemasResult {
  schemas: string[];
  defaultSchema?: string;
}

@Injectable()
export class DatasourceConnectionService {
  async testDatasourceConnection(payload: DatasourceCreateInput): Promise<DatasourceConnectionTestResult> {
    try {
      return await this.callDatasourceService('/connections/test', payload);
    } catch (error) {
      return this.testDatasourceConnectionLocally(payload);
    }
  }

  async listDatasourceSchemas(payload: DatasourceCreateInput): Promise<DatasourceSchemasResult> {
    if (payload.type !== 'postgresql') {
      return { schemas: [], defaultSchema: undefined };
    }

    return this.listPostgresSchemasLocally(payload);
  }

  assertSafeDatasourceSchema(schema: string) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) {
      throw new BadRequestException('Invalid PostgreSQL schema name.');
    }
  }

  normalizeDatasourceRuntimeHost(host: string) {
    if (host === 'localhost' || host === '127.0.0.1') {
      return process.env.DATASOURCE_LOCALHOST_ALIAS || 'host.docker.internal';
    }
    return host;
  }

  private async callDatasourceService(
    path: string,
    payload: unknown
  ): Promise<DatasourceConnectionTestResult> {
    return this.callJsonService<DatasourceConnectionTestResult>(
      [process.env.DATASOURCE_SERVICE_URL || 'http://datasource-service:3002', 'http://localhost:3002'],
      path,
      {
        method: 'POST',
        payload,
        unavailableMessage: 'Datasource service unavailable.'
      }
    );
  }

  private async testDatasourceConnectionLocally(
    payload: DatasourceCreateInput
  ): Promise<DatasourceConnectionTestResult> {
    const type = payload.type;

    if (!type) {
      return {
        ok: false,
        message: 'Datasource type is required.'
      };
    }

    if (type === 'postgresql') {
      return this.testPostgresDatasourceLocally(payload);
    }

    if (type === 'mongodb') {
      return this.testMongoDatasourceLocally(payload);
    }

    if (type === 'csv') {
      return this.testFileDatasourceLocally(payload, 'csv');
    }

    if (type === 'excel') {
      return this.testFileDatasourceLocally(payload, 'excel');
    }

    return {
      ok: false,
      message: 'Unsupported datasource type.'
    };
  }

  private async testPostgresDatasourceLocally(
    payload: DatasourceCreateInput
  ): Promise<DatasourceConnectionTestResult> {
    const cfg = payload.connectionConfig || {};
    const creds = payload.credentials || {};

    const host = this.normalizeDatasourceRuntimeHost(String(cfg.host || '').trim());
    const database = String(cfg.database || '').trim();
    const user = String(creds.username || '').trim();
    const password = String(creds.password || '').trim();
    const port = Number(cfg.port || 5432);
    const schema = String(cfg.schema || '').trim();

    if (!host || !database || !user) {
      return {
        ok: false,
        message: 'PostgreSQL requires host, database, and username.'
      };
    }

    const pool = new Pool({
      host,
      port,
      database,
      user,
      password,
      ssl: cfg.ssl ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 4000,
      statement_timeout: 4000
    });

    try {
      await pool.query('SELECT 1');
      if (schema) {
        this.assertSafeDatasourceSchema(schema);
        const schemaResult = await pool.query(
          `SELECT schema_name
           FROM information_schema.schemata
           WHERE schema_name = $1
             AND schema_name NOT IN ('information_schema', 'pg_catalog')
             AND schema_name NOT LIKE 'pg_%'
           LIMIT 1`,
          [schema]
        );
        if (!schemaResult.rowCount) {
          return {
            ok: false,
            message: `PostgreSQL schema "${schema}" was not found.`,
            details: {
              type: 'postgresql',
              host,
              port,
              database,
              schema
            }
          };
        }
      }
      return {
        ok: true,
        message: 'PostgreSQL connection successful.',
        details: {
          type: 'postgresql',
          host,
          port,
          database,
          schema: schema || undefined
        }
      };
    } catch (error) {
      return {
        ok: false,
        message: 'PostgreSQL connection failed.',
        details: {
          type: 'postgresql',
          host,
          port,
          database,
          reason: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    } finally {
      await pool.end().catch(() => undefined);
    }
  }

  private async listPostgresSchemasLocally(payload: DatasourceCreateInput): Promise<DatasourceSchemasResult> {
    const cfg = payload.connectionConfig || {};
    const creds = payload.credentials || {};

    const host = this.normalizeDatasourceRuntimeHost(String(cfg.host || '').trim());
    const database = String(cfg.database || '').trim();
    const user = String(creds.username || '').trim();
    const password = String(creds.password || '').trim();
    const port = Number(cfg.port || 5432);

    if (!host || !database || !user) {
      throw new BadRequestException('PostgreSQL schema loading requires host, database, and username.');
    }

    const pool = new Pool({
      host,
      port,
      database,
      user,
      password,
      ssl: cfg.ssl ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 5000,
      statement_timeout: 5000
    });

    try {
      const result = await pool.query<{ schema_name: string }>(
        `SELECT schema_name
         FROM information_schema.schemata
         WHERE schema_name NOT IN ('information_schema', 'pg_catalog')
           AND schema_name NOT LIKE 'pg_%'
         ORDER BY schema_name ASC`
      );
      const schemas = result.rows.map((row) => row.schema_name);
      return {
        schemas,
        defaultSchema: schemas.includes('public') ? 'public' : schemas[0]
      };
    } finally {
      await pool.end().catch(() => undefined);
    }
  }

  private testMongoDatasourceLocally(payload: DatasourceCreateInput): DatasourceConnectionTestResult {
    const cfg = payload.connectionConfig || {};
    const host = String(cfg.host || '').trim();
    const uri = String(cfg.uri || '').trim();
    const database = String(cfg.database || '').trim();

    if (!uri && (!host || !database)) {
      return {
        ok: false,
        message: 'MongoDB requires uri, or host and database.'
      };
    }

    return {
      ok: true,
      message: 'MongoDB configuration accepted. Runtime validation is deferred.',
      details: {
        type: 'mongodb',
        database: database || 'default'
      }
    };
  }

  private testFileDatasourceLocally(
    payload: DatasourceCreateInput,
    type: 'csv' | 'excel'
  ): DatasourceConnectionTestResult {
    const cfg = payload.connectionConfig || {};
    const fileName = String(cfg.fileName || payload.name || '').trim();

    if (!fileName) {
      return {
        ok: true,
        message: `${type.toUpperCase()} source created without file yet (validation deferred).`,
        details: { type }
      };
    }

    const lower = fileName.toLowerCase();
    const valid = type === 'csv' ? lower.endsWith('.csv') : lower.endsWith('.xlsx') || lower.endsWith('.xls');

    return {
      ok: valid,
      message: valid ? `${type.toUpperCase()} configuration accepted.` : `Invalid ${type.toUpperCase()} file name.`,
      details: {
        type,
        fileName
      }
    };
  }

  private async callJsonService<T>(
    bases: string[],
    path: string,
    options: {
      method: 'GET' | 'POST' | 'PUT' | 'DELETE';
      payload?: unknown;
      query?: Record<string, string>;
      unavailableMessage: string;
    }
  ): Promise<T> {
    let lastError = options.unavailableMessage;

    for (const base of bases) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      try {
        const queryString = options.query ? `?${new URLSearchParams(options.query).toString()}` : '';

        const response = await fetch(`${base}${path}${queryString}`, {
          method: options.method,
          headers: { 'content-type': 'application/json' },
          body:
            options.method === 'GET' || options.method === 'DELETE'
              ? undefined
              : JSON.stringify(options.payload ?? {}),
          signal: controller.signal
        });

        if (!response.ok) {
          const details = await response.text();
          lastError = details || `Service error (${response.status}).`;
          continue;
        }

        if (response.status === 204) {
          return {} as T;
        }

        const text = await response.text();
        if (!text) {
          return {} as T;
        }

        return JSON.parse(text) as T;
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Service request failed.';
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new BadRequestException(lastError);
  }
}
