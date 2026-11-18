import { BadRequestException, Injectable } from '@nestjs/common';
import { MongoClient } from 'mongodb';
import { Pool } from 'pg';
import { promises as dnsPromises } from 'dns';

type DatasourceType = 'postgresql' | 'mongodb' | 'csv' | 'excel';

interface TestDatasourcePayload {
  type: DatasourceType;
  name?: string;
  credentials?: Record<string, unknown>;
  connectionConfig?: Record<string, unknown>;
}

@Injectable()
export class AppService {
  getHealth() {
    return {
      service: 'datasource-service',
      status: 'ok'
    };
  }

  async testConnection(payload: TestDatasourcePayload) {
    const type = payload.type;
    if (!type) {
      throw new BadRequestException('Datasource type is required.');
    }

    if (type === 'postgresql') {
      return this.testPostgres(payload);
    }

    if (type === 'mongodb') {
      return this.testMongo(payload);
    }

    if (type === 'csv') {
      return this.testCsv(payload);
    }

    if (type === 'excel') {
      return this.testExcel(payload);
    }

    throw new BadRequestException('Unsupported datasource type.');
  }

  private async testPostgres(payload: TestDatasourcePayload) {
    const cfg = payload.connectionConfig || {};
    const creds = payload.credentials || {};

    const host = String(cfg.host || '').trim();
    const database = String(cfg.database || '').trim();
    const user = String(creds.username || '').trim();
    const password = String(creds.password || '').trim();
    const port = Number(cfg.port || 5432);
    const schema = String(cfg.schema || '').trim();

    if (!host || !database || !user) {
      throw new BadRequestException('PostgreSQL requires host, database, and username.');
    }

    const connectionOptions = {
      host,
      port,
      database,
      user,
      password,
      ssl: cfg.ssl ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 4000,
      statement_timeout: 4000
    };

    let lastError: unknown;
    const tryConnection = async (targetHost: string) => {
      const pool = new Pool({ ...connectionOptions, host: targetHost });
      try {
        await pool.query('SELECT 1');
        if (schema) {
          this.assertSafeSchema(schema);
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
            throw new BadRequestException(`PostgreSQL schema "${schema}" was not found.`);
          }
        }
        return { ok: true, host: targetHost };
      } finally {
        await pool.end().catch(() => undefined);
      }
    };

    try {
      const result = await tryConnection(host);
      if (result.ok) {
        return {
          ok: true,
          message: 'PostgreSQL connection successful.',
          details: {
              type: 'postgresql',
              host: result.host,
              database,
              schema: schema || undefined
            }
          };
      }
    } catch (error) {
      lastError = error;
    }

    if (['localhost', '127.0.0.1'].includes(host)) {
      const fallbackHost = await this.getDockerHostFallback();
      if (fallbackHost) {
        try {
          const result = await tryConnection(fallbackHost);
          if (result.ok) {
            return {
              ok: true,
              message: 'PostgreSQL connection successful.',
              details: {
                type: 'postgresql',
                host: result.host,
                database,
                schema: schema || undefined
              }
            };
          }
        } catch (error) {
          lastError = error;
        }
      }
    }

    return {
      ok: false,
      message: 'PostgreSQL connection failed.',
      details: {
        type: 'postgresql',
        host,
        database,
        reason: this.formatErrorReason(lastError)
      }
    };
  }

  private async testMongo(payload: TestDatasourcePayload) {
    const cfg = payload.connectionConfig || {};
    const creds = payload.credentials || {};

    const uri = String(cfg.uri || '').trim();
    const host = String(cfg.host || '').trim();
    const database = String(cfg.database || '').trim();
    const user = String(creds.username || '').trim();
    const password = String(creds.password || '').trim();

    const connectionUri = uri || this.buildMongoUri(host, database, user, password);
    if (!connectionUri) {
      throw new BadRequestException('MongoDB requires uri, or host/database credentials.');
    }

    const client = new MongoClient(connectionUri, { serverSelectionTimeoutMS: 4000 });

    try {
      await client.connect();
      await client.db(database || undefined).command({ ping: 1 });
      return {
        ok: true,
        message: 'MongoDB connection successful.',
        details: {
          type: 'mongodb',
          database: database || 'default'
        }
      };
    } catch (error) {
      return {
        ok: false,
        message: 'MongoDB connection failed.',
        details: {
          type: 'mongodb',
          reason: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    } finally {
      await client.close().catch(() => undefined);
    }
  }

  private testCsv(payload: TestDatasourcePayload) {
    const cfg = payload.connectionConfig || {};
    const fileName = String(cfg.fileName || payload.name || '').trim();

    if (!fileName) {
      return {
        ok: true,
        message: 'CSV source created without file yet (validation deferred).',
        details: { type: 'csv' }
      };
    }

    const valid = fileName.toLowerCase().endsWith('.csv');
    return {
      ok: valid,
      message: valid ? 'CSV configuration accepted.' : 'Invalid CSV file name.',
      details: {
        type: 'csv',
        fileName
      }
    };
  }

  private testExcel(payload: TestDatasourcePayload) {
    const cfg = payload.connectionConfig || {};
    const fileName = String(cfg.fileName || payload.name || '').trim();

    if (!fileName) {
      return {
        ok: true,
        message: 'Excel source created without file yet (validation deferred).',
        details: { type: 'excel' }
      };
    }

    const lower = fileName.toLowerCase();
    const valid = lower.endsWith('.xlsx') || lower.endsWith('.xls');

    return {
      ok: valid,
      message: valid ? 'Excel configuration accepted.' : 'Invalid Excel file name.',
      details: {
        type: 'excel',
        fileName
      }
    };
  }

  private async getDockerHostFallback(): Promise<string | undefined> {
    if (process.env.HOST_DOCKER_INTERNAL) {
      return process.env.HOST_DOCKER_INTERNAL;
    }

    try {
      await dnsPromises.lookup('host.docker.internal');
      return 'host.docker.internal';
    } catch {
      return undefined;
    }
  }

  private formatErrorReason(error: unknown): string {
    if (!error) return 'Unknown error';
    if (error instanceof Error) return error.message || String(error);
    if (typeof error === 'string') return error;
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  private buildMongoUri(host: string, database: string, user: string, password: string) {
    if (!host) return '';

    if (user) {
      return `mongodb://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}/${database || 'admin'}`;
    }

    return `mongodb://${host}/${database || 'admin'}`;
  }

  private assertSafeSchema(schema: string) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) {
      throw new BadRequestException('Invalid PostgreSQL schema name.');
    }
  }
}
