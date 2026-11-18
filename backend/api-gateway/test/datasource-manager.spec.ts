import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DatasourceManagerService } from '../src/datasources/datasource-manager.service';
import { DatabaseService } from '../src/common/database/database.service';
import { DatasourceCryptoService } from '../src/common/crypto/datasource-crypto.service';
import { DatasourceConnectionService } from '../src/datasources/datasource-connection.service';
import type { AuthUser } from '../src/auth/auth.service';

describe('DatasourceManagerService (Unit Tests)', () => {
  let service: DatasourceManagerService;
  let mockDatabase: DatabaseService;
  let cryptoService: DatasourceCryptoService;
  let mockConnections: DatasourceConnectionService;

  const analystUser: AuthUser = {
    id: 'usr_analyst_1',
    email: 'analyst@askme.studio',
    fullName: 'Analyst User',
    role: 'Analyst'
  };

  const viewerUser: AuthUser = {
    id: 'usr_viewer_1',
    email: 'viewer@askme.studio',
    fullName: 'Viewer User',
    role: 'Viewer'
  };

  beforeEach(() => {
    process.env.DATASOURCE_SECRET = 'test-secret-key-that-is-at-least-32-chars-long!';

    mockDatabase = {
      pool: undefined,
      dbReady: false,
      semanticVectorReady: false,
      getHealth: () => ({ status: 'ok', service: 'database', persistence: 'memory' }),
      onModuleInit: async () => {}
    } as unknown as DatabaseService;

    cryptoService = new DatasourceCryptoService();

    mockConnections = {
      testDatasourceConnection: jest.fn().mockResolvedValue({ ok: true, message: 'Connection successful' }),
      listDatasourceSchemas: jest.fn().mockResolvedValue({ schemas: ['public', 'analytics'], defaultSchema: 'public' }),
      assertSafeDatasourceSchema: jest.fn()
    } as unknown as DatasourceConnectionService;

    service = new DatasourceManagerService(mockDatabase, cryptoService, mockConnections);
  });

  describe('createDatasource & listDatasources', () => {
    it('should create a datasource in memory with encrypted credentials', async () => {
      const created = await service.createDatasource(analystUser, {
        name: 'Sales DW',
        type: 'postgresql',
        credentials: { host: 'localhost', user: 'postgres', password: 'secretpassword' },
        connectionConfig: { schema: 'public', port: 5432 }
      });

      expect(created).toBeDefined();
      expect(created.id).toMatch(/^ds_/);
      expect(created.name).toBe('Sales DW');
      expect(created.type).toBe('postgresql');

      const list = await service.listDatasources(analystUser);
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe(created.id);
      expect(list[0].schema).toBe('public');
    });

    it('should reject creation if datasource name is missing', async () => {
      await expect(
        service.createDatasource(analystUser, {
          name: '   ',
          type: 'postgresql',
          connectionConfig: { schema: 'public' }
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject creation if user has Viewer role', async () => {
      await expect(
        service.createDatasource(viewerUser, {
          name: 'Forbidden DB',
          type: 'postgresql',
          connectionConfig: { schema: 'public' }
        })
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject creation if connection test fails', async () => {
      (mockConnections.testDatasourceConnection as jest.Mock).mockResolvedValueOnce({
        ok: false,
        message: 'Host unreachable'
      });

      await expect(
        service.createDatasource(analystUser, {
          name: 'Unreachable DB',
          type: 'postgresql',
          connectionConfig: { schema: 'public' }
        })
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('resolveDatasourceContext & assertDatasourceOwnership', () => {
    let datasourceId: string;

    beforeEach(async () => {
      const ds = await service.createDatasource(analystUser, {
        name: 'Analytics DB',
        type: 'postgresql',
        credentials: { password: 'my-super-secret' },
        connectionConfig: { schema: 'analytics' }
      });
      datasourceId = ds.id;
    });

    it('should resolve and decrypt datasource context for owner', async () => {
      const context = await service.resolveDatasourceContext(analystUser.id, datasourceId);

      expect(context).toBeDefined();
      expect(context.type).toBe('postgresql');
      expect(context.connectionConfig).toEqual({ schema: 'analytics' });
      expect(context.credentials.password).toBe('my-super-secret');
    });

    it('should reject context resolution for another user', async () => {
      await expect(
        service.resolveDatasourceContext('other_user_id', datasourceId)
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getDatasource, updateDatasource & deleteDatasource', () => {
    let datasourceId: string;

    beforeEach(async () => {
      const ds = await service.createDatasource(analystUser, {
        name: 'Initial Name',
        type: 'postgresql',
        credentials: { password: 'pass1' },
        connectionConfig: { schema: 'public', port: 5432 }
      });
      datasourceId = ds.id;
    });

    it('should retrieve a datasource by id for its owner', async () => {
      const ds = await service.getDatasource(analystUser, datasourceId);
      expect(ds).toBeDefined();
      expect(ds.id).toBe(datasourceId);
      expect(ds.name).toBe('Initial Name');
      expect(ds.schema).toBe('public');
    });

    it('should update datasource name and schema in memory', async () => {
      const updated = await service.updateDatasource(analystUser, datasourceId, {
        name: 'Updated Name',
        connectionConfig: { schema: 'analytics' }
      });

      expect(updated.name).toBe('Updated Name');
      expect(updated.schema).toBe('analytics');

      // Verify in list
      const list = await service.listDatasources(analystUser);
      expect(list[0].name).toBe('Updated Name');
      expect(list[0].schema).toBe('analytics');

      // Verify context preserves password
      const context = await service.resolveDatasourceContext(analystUser.id, datasourceId);
      expect(context.credentials.password).toBe('pass1');
    });

    it('should reject update if non-owner or Viewer tries to update', async () => {
      await expect(
        service.updateDatasource(viewerUser, datasourceId, { name: 'New Name' })
      ).rejects.toThrow(ForbiddenException);

      const otherAnalyst: AuthUser = { id: 'usr_other', email: 'other@askme.ai', fullName: 'Other', role: 'Analyst' };
      await expect(
        service.updateDatasource(otherAnalyst, datasourceId, { name: 'Hacked Name' })
      ).rejects.toThrow(ForbiddenException);
    });

    it('should delete datasource in memory', async () => {
      const result = await service.deleteDatasource(analystUser, datasourceId);
      expect(result.success).toBe(true);
      expect(result.id).toBe(datasourceId);

      const list = await service.listDatasources(analystUser);
      expect(list).toHaveLength(0);

      await expect(
        service.getDatasource(analystUser, datasourceId)
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
