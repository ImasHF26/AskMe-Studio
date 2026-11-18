import {
  BadRequestException,
  ForbiddenException,
  Injectable
} from '@nestjs/common';
import { DatabaseService } from '../common/database/database.service';
import { DatasourceCryptoService } from '../common/crypto/datasource-crypto.service';
import { newId } from '../common/utils/id.utils';
import { DatasourceConnectionService } from './datasource-connection.service';
import type { AuthUser, UserRole } from '../auth/auth.service';

export type DatasourceType = 'postgresql' | 'mongodb' | 'csv' | 'excel';

export interface Datasource {
  id: string;
  name: string;
  type: DatasourceType;
  createdAt: string;
  schema?: string;
}

export interface DatasourceCreateInput {
  name: string;
  type: DatasourceType;
  credentials?: Record<string, unknown>;
  connectionConfig?: Record<string, unknown>;
}

export interface DatasourceConnectionTestResult {
  ok: boolean;
  message: string;
  details?: Record<string, unknown>;
}

export interface DatasourceSchemasResult {
  schemas: string[];
  defaultSchema?: string;
}

export interface DatasourceResolvedContext {
  type: DatasourceType;
  connectionConfig: Record<string, unknown>;
  credentials: Record<string, unknown>;
}

export interface InMemoryDatasourceRecord extends Datasource {
  userId: string;
  encryptedCredentials: string;
  connectionConfig: Record<string, unknown>;
}

/**
 * DatasourceManagerService — gestion CRUD et résolution de contexte pour les sources de données.
 *
 * Supporte :
 *  - PostgreSQL (production) via DatabaseService.pool
 *  - In-memory (dev / tests) via inMemoryDatasources
 */
@Injectable()
export class DatasourceManagerService {
  /** Stockage in-memory pour le dev et les tests sans conteneur PostgreSQL */
  readonly inMemoryDatasources: InMemoryDatasourceRecord[] = [];

  constructor(
    private readonly database: DatabaseService,
    private readonly datasourceCrypto: DatasourceCryptoService,
    private readonly datasourceConnections: DatasourceConnectionService
  ) {}

  assertRole(role: UserRole, allowed: UserRole[]) {
    if (!allowed.includes(role)) {
      throw new ForbiddenException('Insufficient role for this operation.');
    }
  }

  async assertDatasourceOwnership(userId: string, datasourceId: string): Promise<void> {
    if (this.database.dbReady && this.database.pool) {
      const result = await this.database.pool.query(
        'SELECT id FROM app_datasources WHERE id = $1 AND user_id = $2 LIMIT 1',
        [datasourceId, userId]
      );
      if (!result.rowCount) {
        throw new ForbiddenException('Datasource not found or not owned by user.');
      }
      return;
    }

    const exists = this.inMemoryDatasources.some((item) => item.id === datasourceId && item.userId === userId);
    if (!exists) {
      throw new ForbiddenException('Datasource not found or not owned by user.');
    }
  }

  async listDatasources(user: AuthUser): Promise<Datasource[]> {
    if (this.database.dbReady && this.database.pool) {
      const result = await this.database.pool.query(
        'SELECT id, name, type, connection_config, created_at FROM app_datasources WHERE user_id = $1 ORDER BY created_at DESC',
        [user.id]
      );

      return result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        type: row.type,
        schema: row.connection_config?.schema || undefined,
        createdAt: new Date(row.created_at).toISOString()
      }));
    }

    return this.inMemoryDatasources
      .filter((item) => item.userId === user.id)
      .map(({ userId: _userId, encryptedCredentials: _encrypted, connectionConfig, ...datasource }) => ({
        ...datasource,
        schema: String(connectionConfig?.schema || '') || undefined
      }));
  }

  async createDatasource(user: AuthUser, payload: DatasourceCreateInput): Promise<Datasource> {
    this.assertRole(user.role, ['Admin', 'Analyst']);

    const safeType: DatasourceType = ['postgresql', 'mongodb', 'csv', 'excel'].includes(payload.type)
      ? payload.type
      : 'postgresql';

    const safeName = payload.name?.trim();
    if (!safeName) {
      throw new BadRequestException('Datasource name is required.');
    }

    if (safeType === 'postgresql') {
      const schema = String(payload.connectionConfig?.schema || '').trim();
      if (!schema) {
        throw new BadRequestException('PostgreSQL schema is required. Load schemas and choose one before creating the datasource.');
      }
      this.datasourceConnections.assertSafeDatasourceSchema(schema);
    }

    const testResult = await this.testDatasourceConnection(user, payload);
    if (!testResult.ok) {
      throw new BadRequestException(`Connection test failed: ${testResult.message}`);
    }

    const datasource: Datasource = {
      id: newId('ds'),
      name: safeName,
      type: safeType,
      createdAt: new Date().toISOString()
    };

    const credentials = payload.credentials || {};
    const connectionConfig = payload.connectionConfig || {};
    const encryptedCredentials =
      Object.keys(credentials).length > 0 ? this.datasourceCrypto.encryptJson(credentials) : '';

    if (this.database.dbReady && this.database.pool) {
      await this.database.pool.query(
        `INSERT INTO app_datasources (id, user_id, name, type, encrypted_credentials, connection_config, created_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
        [datasource.id, user.id, datasource.name, datasource.type, encryptedCredentials, JSON.stringify(connectionConfig), datasource.createdAt]
      );
      return datasource;
    }

    this.inMemoryDatasources.unshift({
      ...datasource,
      userId: user.id,
      encryptedCredentials,
      connectionConfig
    });

    return datasource;
  }

  async getDatasource(user: AuthUser, datasourceId: string): Promise<Datasource> {
    await this.assertDatasourceOwnership(user.id, datasourceId);

    if (this.database.dbReady && this.database.pool) {
      const result = await this.database.pool.query(
        'SELECT id, name, type, connection_config, created_at FROM app_datasources WHERE id = $1 AND user_id = $2 LIMIT 1',
        [datasourceId, user.id]
      );
      if (!result.rowCount) {
        throw new ForbiddenException('Datasource not found or not owned by user.');
      }
      const row = result.rows[0];
      return {
        id: row.id,
        name: row.name,
        type: row.type,
        schema: row.connection_config?.schema || undefined,
        createdAt: new Date(row.created_at).toISOString()
      };
    }

    const found = this.inMemoryDatasources.find((item) => item.id === datasourceId && item.userId === user.id);
    if (!found) {
      throw new ForbiddenException('Datasource not found or not owned by user.');
    }
    return {
      id: found.id,
      name: found.name,
      type: found.type,
      schema: String(found.connectionConfig?.schema || '') || undefined,
      createdAt: found.createdAt
    };
  }

  async updateDatasource(
    user: AuthUser,
    datasourceId: string,
    payload: Partial<DatasourceCreateInput>
  ): Promise<Datasource> {
    this.assertRole(user.role, ['Admin', 'Analyst']);
    await this.assertDatasourceOwnership(user.id, datasourceId);

    if (payload.name !== undefined && !payload.name.trim()) {
      throw new BadRequestException('Datasource name cannot be empty.');
    }

    if (payload.type === 'postgresql' && payload.connectionConfig?.schema) {
      const schema = String(payload.connectionConfig.schema).trim();
      this.datasourceConnections.assertSafeDatasourceSchema(schema);
    }

    let newEncryptedCredentials = '';
    if (payload.credentials && Object.keys(payload.credentials).length > 0) {
      newEncryptedCredentials = this.datasourceCrypto.encryptJson(payload.credentials);
    }

    if (this.database.dbReady && this.database.pool) {
      const current = await this.database.pool.query(
        'SELECT name, type, connection_config, encrypted_credentials, created_at FROM app_datasources WHERE id = $1 AND user_id = $2 LIMIT 1',
        [datasourceId, user.id]
      );
      if (!current.rowCount) {
        throw new ForbiddenException('Datasource not found.');
      }
      const currentRow = current.rows[0];
      const mergedConfig = {
        ...(currentRow.connection_config || {}),
        ...(payload.connectionConfig || {})
      };
      const finalName = payload.name?.trim() || currentRow.name;
      const finalType = payload.type || currentRow.type;
      const finalEncrypted = newEncryptedCredentials || currentRow.encrypted_credentials;

      await this.database.pool.query(
        `UPDATE app_datasources
         SET name = $1, type = $2, connection_config = $3::jsonb, encrypted_credentials = $4
         WHERE id = $5 AND user_id = $6`,
        [finalName, finalType, JSON.stringify(mergedConfig), finalEncrypted, datasourceId, user.id]
      );

      return {
        id: datasourceId,
        name: finalName,
        type: finalType,
        schema: mergedConfig.schema || undefined,
        createdAt: new Date(currentRow.created_at).toISOString()
      };
    }

    const index = this.inMemoryDatasources.findIndex((item) => item.id === datasourceId && item.userId === user.id);
    if (index === -1) {
      throw new ForbiddenException('Datasource not found.');
    }

    const currentItem = this.inMemoryDatasources[index];
    const mergedConfig = {
      ...(currentItem.connectionConfig || {}),
      ...(payload.connectionConfig || {})
    };
    const finalName = payload.name?.trim() || currentItem.name;
    const finalType = payload.type || currentItem.type;
    const finalEncrypted = newEncryptedCredentials || currentItem.encryptedCredentials;

    const updated = {
      ...currentItem,
      name: finalName,
      type: finalType,
      connectionConfig: mergedConfig,
      encryptedCredentials: finalEncrypted
    };

    this.inMemoryDatasources[index] = updated;

    return {
      id: updated.id,
      name: updated.name,
      type: updated.type,
      schema: String(mergedConfig.schema || '') || undefined,
      createdAt: updated.createdAt
    };
  }

  async deleteDatasource(user: AuthUser, datasourceId: string): Promise<{ success: boolean; id: string }> {
    this.assertRole(user.role, ['Admin', 'Analyst']);
    await this.assertDatasourceOwnership(user.id, datasourceId);

    if (this.database.dbReady && this.database.pool) {
      await this.database.pool.query(
        'DELETE FROM app_datasources WHERE id = $1 AND user_id = $2',
        [datasourceId, user.id]
      );
      return { success: true, id: datasourceId };
    }

    const index = this.inMemoryDatasources.findIndex(
      (item) => item.id === datasourceId && item.userId === user.id
    );
    if (index !== -1) {
      this.inMemoryDatasources.splice(index, 1);
      return { success: true, id: datasourceId };
    }

    return { success: false, id: datasourceId };
  }

  async testDatasourceConnection(user: AuthUser, payload: DatasourceCreateInput): Promise<DatasourceConnectionTestResult> {
    this.assertRole(user.role, ['Admin', 'Analyst']);
    return this.datasourceConnections.testDatasourceConnection(payload);
  }

  async listDatasourceSchemas(user: AuthUser, payload: DatasourceCreateInput): Promise<DatasourceSchemasResult> {
    this.assertRole(user.role, ['Admin', 'Analyst']);
    return this.datasourceConnections.listDatasourceSchemas(payload);
  }

  async resolveDatasourceContext(userId: string, datasourceId: string): Promise<DatasourceResolvedContext> {
    await this.assertDatasourceOwnership(userId, datasourceId);

    if (this.database.dbReady && this.database.pool) {
      const result = await this.database.pool.query(
        `SELECT type, encrypted_credentials, connection_config
         FROM app_datasources
         WHERE id = $1 AND user_id = $2
         LIMIT 1`,
        [datasourceId, userId]
      );

      if (!result.rowCount) {
        throw new ForbiddenException('Datasource not found or not owned by user.');
      }

      const row = result.rows[0];
      return {
        type: row.type as DatasourceType,
        connectionConfig: (row.connection_config || {}) as Record<string, unknown>,
        credentials: this.datasourceCrypto.decryptJson(row.encrypted_credentials || '')
      };
    }

    const datasource = this.inMemoryDatasources.find((item) => item.id === datasourceId && item.userId === userId);
    if (!datasource) {
      throw new ForbiddenException('Datasource not found or not owned by user.');
    }

    return {
      type: datasource.type,
      connectionConfig: datasource.connectionConfig || {},
      credentials: this.datasourceCrypto.decryptJson(datasource.encryptedCredentials || '')
    };
  }
}
