import { BadRequestException, Injectable } from '@nestjs/common';
import { MongoClient } from 'mongodb';
import { Pool } from 'pg';

type DatasourceType = 'postgresql' | 'mongodb' | 'csv' | 'excel';

interface ProfilePayload {
  type: DatasourceType;
  credentials?: Record<string, unknown>;
  connectionConfig?: Record<string, unknown>;
  tableName?: string;
  limit?: number;
}

interface PgTableReference {
  schema: string;
  table: string;
  qualifiedName: string;
}

@Injectable()
export class AppService {
  getHealth() {
    return {
      service: 'metadata-service',
      status: 'ok'
    };
  }

  async listTables(payload: ProfilePayload) {
    if (payload.type === 'postgresql') return this.listPostgresTables(payload);
    if (payload.type === 'mongodb') return this.listMongoCollections(payload);
    if (payload.type === 'csv') return { tables: ['csv_uploaded_dataset'] };
    if (payload.type === 'excel') return { tables: ['excel_uploaded_sheet'] };
    throw new BadRequestException('Unsupported datasource type.');
  }

  async getColumns(payload: ProfilePayload) {
    if (!payload.tableName) throw new BadRequestException('tableName is required.');
    if (payload.type === 'postgresql') return this.getPostgresColumns(payload);
    if (payload.type === 'mongodb') return this.getMongoColumns(payload);
    if (payload.type === 'csv' || payload.type === 'excel') {
      return {
        columns: [
          { name: 'column_1', dataType: 'text', isNullable: true },
          { name: 'column_2', dataType: 'text', isNullable: true }
        ]
      };
    }
    throw new BadRequestException('Unsupported datasource type.');
  }

  async getPreview(payload: ProfilePayload) {
    if (!payload.tableName) throw new BadRequestException('tableName is required.');
    if (payload.type === 'postgresql') return this.getPostgresPreview(payload);
    if (payload.type === 'mongodb') return this.getMongoPreview(payload);
    if (payload.type === 'csv' || payload.type === 'excel') {
      return {
        rows: [
          { column_1: 'sample', column_2: 1 },
          { column_1: 'sample2', column_2: 2 }
        ]
      };
    }
    throw new BadRequestException('Unsupported datasource type.');
  }

  async getStats(payload: ProfilePayload) {
    if (!payload.tableName) throw new BadRequestException('tableName is required.');
    if (payload.type === 'postgresql') return this.getPostgresStats(payload);
    if (payload.type === 'mongodb') return this.getMongoStats(payload);
    if (payload.type === 'csv' || payload.type === 'excel') {
      return {
        rowCount: 2,
        columnCount: 2,
        summary: 'Local file profiling placeholder.'
      };
    }
    throw new BadRequestException('Unsupported datasource type.');
  }

  private async listPostgresTables(payload: ProfilePayload) {
    const pool = this.newPgPool(payload);
    const activeSchema = this.getActivePostgresSchema(payload);
    try {
      const res = await pool.query(
        `SELECT table_schema, table_name, table_type
         FROM information_schema.tables
         WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
           AND table_schema NOT LIKE 'pg_%'
           AND ($1::text IS NULL OR table_schema = $1)
           AND table_type IN ('BASE TABLE', 'VIEW')
         ORDER BY table_schema ASC, table_name ASC`,
        [activeSchema || null]
      );
      return {
        tables: res.rows.map((row) => ({
          name: `${row.table_schema}.${row.table_name}`,
          schema: row.table_schema,
          tableName: row.table_name,
          type: row.table_type === 'VIEW' ? 'view' : 'table'
        }))
      };
    } finally {
      await pool.end().catch(() => undefined);
    }
  }

  private async getPostgresColumns(payload: ProfilePayload) {
    const tableRef = this.parsePostgresTableName(payload.tableName || '', payload);
    const pool = this.newPgPool(payload);
    try {
      const res = await pool.query(
        `SELECT
           c.column_name,
           c.data_type,
           c.is_nullable,
           EXISTS (
             SELECT 1
             FROM information_schema.table_constraints tc
             JOIN information_schema.key_column_usage kcu
               ON kcu.constraint_schema = tc.constraint_schema
              AND kcu.constraint_name = tc.constraint_name
              AND kcu.table_schema = tc.table_schema
              AND kcu.table_name = tc.table_name
             WHERE tc.constraint_type = 'PRIMARY KEY'
               AND tc.table_schema = c.table_schema
               AND tc.table_name = c.table_name
               AND kcu.column_name = c.column_name
           ) AS is_primary_key,
           fk_ref.foreign_table_schema,
           fk_ref.foreign_table_name,
           fk_ref.foreign_column_name
         FROM information_schema.columns c
         LEFT JOIN LATERAL (
           SELECT ccu.table_schema AS foreign_table_schema,
                  ccu.table_name AS foreign_table_name,
                  ccu.column_name AS foreign_column_name
           FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu
             ON kcu.constraint_schema = tc.constraint_schema
            AND kcu.constraint_name = tc.constraint_name
            AND kcu.table_schema = tc.table_schema
            AND kcu.table_name = tc.table_name
           JOIN information_schema.constraint_column_usage ccu
             ON ccu.constraint_schema = tc.constraint_schema
            AND ccu.constraint_name = tc.constraint_name
           WHERE tc.constraint_type = 'FOREIGN KEY'
             AND tc.table_schema = c.table_schema
             AND tc.table_name = c.table_name
             AND kcu.column_name = c.column_name
           LIMIT 1
         ) fk_ref ON true
         WHERE c.table_schema = $1 AND c.table_name = $2
         ORDER BY c.ordinal_position ASC`,
        [tableRef.schema, tableRef.table]
      );

      return {
        columns: res.rows.map((row) => ({
          name: row.column_name,
          dataType: row.data_type,
          isNullable: row.is_nullable === 'YES',
          isPrimaryKey: Boolean(row.is_primary_key),
          isForeignKey: Boolean(row.foreign_table_name),
          references: row.foreign_table_name
            ? {
                table: `${row.foreign_table_schema}.${row.foreign_table_name}`,
                column: row.foreign_column_name
              }
            : undefined
        }))
      };
    } finally {
      await pool.end().catch(() => undefined);
    }
  }

  private async getPostgresPreview(payload: ProfilePayload) {
    const tableRef = this.parsePostgresTableName(payload.tableName || '', payload);
    const pool = this.newPgPool(payload);
    const limit = Math.max(1, Math.min(payload.limit || 20, 200));

    try {
      const query = `SELECT * FROM ${this.quoteQualifiedTable(tableRef)} LIMIT ${limit}`;
      const res = await pool.query(query);
      return { rows: res.rows };
    } finally {
      await pool.end().catch(() => undefined);
    }
  }

  private async getPostgresStats(payload: ProfilePayload) {
    const tableRef = this.parsePostgresTableName(payload.tableName || '', payload);
    const pool = this.newPgPool(payload);

    try {
      const countRes = await pool.query(`SELECT COUNT(*)::bigint AS count FROM ${this.quoteQualifiedTable(tableRef)}`);
      const colRes = await pool.query(
        `SELECT COUNT(*)::int AS count
         FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = $2`,
        [tableRef.schema, tableRef.table]
      );

      return {
        rowCount: Number(countRes.rows[0]?.count || 0),
        columnCount: Number(colRes.rows[0]?.count || 0),
        summary: `Table ${tableRef.qualifiedName} profiled successfully.`
      };
    } finally {
      await pool.end().catch(() => undefined);
    }
  }

  private async listMongoCollections(payload: ProfilePayload) {
    const { client, database } = this.newMongoClient(payload);
    try {
      await client.connect();
      const collections = await client.db(database).listCollections().toArray();
      return { tables: collections.map((collection) => collection.name).sort() };
    } finally {
      await client.close().catch(() => undefined);
    }
  }

  private async getMongoColumns(payload: ProfilePayload) {
    const { client, database } = this.newMongoClient(payload);
    try {
      await client.connect();
      const sample = await client.db(database).collection(payload.tableName || '').findOne({});
      const keys = sample ? Object.keys(sample) : [];
      return {
        columns: keys.map((key) => ({
          name: key,
          dataType: typeof sample?.[key],
          isNullable: true
        }))
      };
    } finally {
      await client.close().catch(() => undefined);
    }
  }

  private async getMongoPreview(payload: ProfilePayload) {
    const { client, database } = this.newMongoClient(payload);
    const limit = Math.max(1, Math.min(payload.limit || 20, 200));

    try {
      await client.connect();
      const rows = await client
        .db(database)
        .collection(payload.tableName || '')
        .find({})
        .limit(limit)
        .toArray();
      return { rows };
    } finally {
      await client.close().catch(() => undefined);
    }
  }

  private async getMongoStats(payload: ProfilePayload) {
    const { client, database } = this.newMongoClient(payload);

    try {
      await client.connect();
      const collection = client.db(database).collection(payload.tableName || '');
      const rowCount = await collection.countDocuments();
      const sample = await collection.findOne({});
      const columnCount = sample ? Object.keys(sample).length : 0;
      return {
        rowCount,
        columnCount,
        summary: `Collection ${payload.tableName} profiled successfully.`
      };
    } finally {
      await client.close().catch(() => undefined);
    }
  }

  private newPgPool(payload: ProfilePayload) {
    const cfg = payload.connectionConfig || {};
    const creds = payload.credentials || {};

    const host = this.normalizeRuntimeHost(String(cfg.host || '').trim());
    const database = String(cfg.database || '').trim();
    const user = String(creds.username || '').trim();
    const password = String(creds.password || '').trim();
    const port = Number(cfg.port || 5432);

    if (!host || !database || !user) {
      throw new BadRequestException('PostgreSQL profile requires host, database, and username.');
    }

    return new Pool({
      host,
      port,
      database,
      user,
      password,
      ssl: cfg.ssl ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 4000,
      statement_timeout: 5000
    });
  }

  private newMongoClient(payload: ProfilePayload) {
    const cfg = payload.connectionConfig || {};
    const creds = payload.credentials || {};

    const uri = String(cfg.uri || '').trim();
    const host = this.normalizeRuntimeHost(String(cfg.host || '').trim());
    const database = String(cfg.database || '').trim() || 'admin';
    const user = String(creds.username || '').trim();
    const password = String(creds.password || '').trim();

    const connectionUri =
      uri ||
      (user
        ? `mongodb://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}/${database}`
        : `mongodb://${host}/${database}`);

    if (!connectionUri || !host) {
      throw new BadRequestException('MongoDB profile requires uri or host/database configuration.');
    }

    return {
      client: new MongoClient(connectionUri, { serverSelectionTimeoutMS: 5000 }),
      database
    };
  }

  private assertSafeIdentifier(value: string) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
      throw new BadRequestException('Invalid table identifier.');
    }
  }

  private parsePostgresTableName(value: string, payload: ProfilePayload): PgTableReference {
    const parts = value.split('.').map((part) => part.trim()).filter(Boolean);
    const schema = parts.length > 1 ? parts[0] : this.getActivePostgresSchema(payload) || 'public';
    const table = parts.length > 1 ? parts.slice(1).join('.') : parts[0];

    this.assertSafeIdentifier(schema);
    this.assertSafeIdentifier(table);

    return {
      schema,
      table,
      qualifiedName: `${schema}.${table}`
    };
  }

  private quoteQualifiedTable(tableRef: PgTableReference) {
    return `"${tableRef.schema}"."${tableRef.table}"`;
  }

  private getActivePostgresSchema(payload: ProfilePayload) {
    const schema = String(payload.connectionConfig?.schema || '').trim();
    if (!schema) return '';
    this.assertSafeIdentifier(schema);
    return schema;
  }

  private normalizeRuntimeHost(host: string) {
    if (!this.isLoopbackHost(host) || !this.isDockerRuntime()) return host;
    return process.env.HOST_DOCKER_INTERNAL || 'host.docker.internal';
  }

  private isLoopbackHost(host: string) {
    return ['localhost', '127.0.0.2', '::1'].includes(host.trim().toLowerCase());
  }

  private isDockerRuntime() {
    return (
      Boolean(process.env.HOST_DOCKER_INTERNAL) ||
      String(process.env.POSTGRES_URL || '').includes('@postgres:') ||
      String(process.env.OLLAMA_BASE_URL || '').includes('host.docker.internal')
    );
  }
}
