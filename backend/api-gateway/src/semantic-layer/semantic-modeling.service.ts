import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException
} from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { DatabaseService } from '../common/database/database.service';
import { DatasourceManagerService, type DatasourceType } from '../datasources/datasource-manager.service';
import { SemanticVectorService } from './semantic-vector.service';
import { newId } from '../common/utils/id.utils';
import type { AuthUser, UserRole } from '../auth/auth.service';
import {
  BUSINESS_SECTOR_PROFILES,
  type BusinessMetricAlias,
  type BusinessSectorProfile
} from './business-sectors.config';
import type {
  SemanticType,
  TableType,
  SemanticProposalSource,
  SemanticKpiFormatting,
  SemanticLayerLanguage,
  SemanticBusinessSector,
  SemanticColumn,
  SemanticColumnLike,
  SemanticTable,
  SemanticKpi,
  SemanticSynonym,
  SemanticRelationship,
  SemanticLayerResponse,
  SemanticTableProposal,
  SemanticColumnProposal,
  SemanticKpiProposal,
  SemanticSynonymProposal,
  SemanticProposalResponse,
  GenerateSemanticProposalInput,
  SaveSemanticLayerInput,
  ColumnProfile,
  MetadataColumn,
  MetadataTable
} from './semantic.types';

@Injectable()
export class SemanticModelingService {
  public readonly inMemorySemantic: Record<string, SemanticLayerResponse> = {};

  constructor(
    private readonly database: DatabaseService,
    private readonly datasourceManager: DatasourceManagerService,
    private readonly semanticVector: SemanticVectorService
  ) {}

  private newId(prefix: string): string {
    return newId(prefix);
  }

  private assertRole(role: UserRole, allowed: UserRole[]) {
    if (!allowed.includes(role)) {
      throw new ForbiddenException(`Insufficient permissions for role ${role}.`);
    }
  }

  private asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  public normalizeSearchText(value: string): string {
    return this.semanticVector.normalizeSearchText(value);
  }

  public semanticKey(userId: string, datasourceId: string): string {
    return `${userId}::${datasourceId}`;
  }

  private async callMetadataService(path: string, payload: unknown): Promise<Record<string, unknown>> {
    const bases = [process.env.METADATA_SERVICE_URL || 'http://metadata-service:3003', 'http://localhost:3003'];
    let lastError = 'Metadata service unavailable.';

    for (const base of bases) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch(`${base}${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload ?? {}),
          signal: controller.signal
        });

        if (!response.ok) {
          const details = await response.text();
          lastError = details || `Metadata service error (${response.status}).`;
          continue;
        }

        const text = await response.text();
        if (!text) {
          return {};
        }

        return JSON.parse(text) as Record<string, unknown>;
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Metadata service request failed.';
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new BadRequestException(lastError);
  }

  async getSemanticLayer(user: AuthUser, datasourceId: string): Promise<SemanticLayerResponse> {
    await this.datasourceManager.assertDatasourceOwnership(user.id, datasourceId);

    if (this.database.dbReady && this.database.pool) {
      const tablesRes = await this.database.pool.query(
        `SELECT id, technical_name, business_name, description, table_type
         FROM app_semantic_tables
         WHERE user_id = $1 AND datasource_id = $2
         ORDER BY created_at ASC`,
        [user.id, datasourceId]
      );

      const tables: SemanticTable[] = tablesRes.rows.map((row) => ({
        id: row.id,
        technicalName: row.technical_name,
        businessName: row.business_name,
        description: row.description,
        tableType: row.table_type,
        columns: []
      }));

      const tableIds = tables.map((table) => table.id);
      if (tableIds.length > 0) {
        const columnsRes = await this.database.pool.query(
          `SELECT id, table_id, technical_name, business_name, semantic_type, data_type, is_nullable
           FROM app_semantic_columns
           WHERE user_id = $1 AND table_id = ANY($2)
           ORDER BY created_at ASC`,
          [user.id, tableIds]
        );

        const tableIndex = new Map(tables.map((table) => [table.id, table]));
        for (const row of columnsRes.rows) {
          const target = tableIndex.get(row.table_id);
          if (!target) continue;
          target.columns.push({
            id: row.id,
            technicalName: row.technical_name,
            businessName: row.business_name,
            semanticType: row.semantic_type,
            dataType: row.data_type,
            isNullable: row.is_nullable
          });
        }
      }

      const kpisRes = await this.database.pool.query(
        `SELECT id, name, sql_formula, description, formatting
         FROM app_semantic_kpis
         WHERE user_id = $1 AND datasource_id = $2
         ORDER BY created_at DESC`,
        [user.id, datasourceId]
      );

      const synonymsRes = await this.database.pool.query(
        `SELECT id, term, mapped_value
         FROM app_semantic_synonyms
         WHERE user_id = $1 AND datasource_id = $2
         ORDER BY created_at DESC`,
        [user.id, datasourceId]
      );

      const relationshipsRes = await this.database.pool.query(
        `SELECT id, from_table_id, from_column_id, to_table_id, to_column_id, join_type, cardinality, confidence
         FROM app_semantic_relationships
         WHERE user_id = $1 AND datasource_id = $2
         ORDER BY created_at ASC`,
        [user.id, datasourceId]
      );

      const tableIndexById = new Map(tables.map((table) => [table.id, table]));
      const columnIndexById = new Map<string, SemanticColumn>();
      for (const table of tables) {
        for (const column of table.columns) {
          columnIndexById.set(column.id, column);
        }
      }
      const relationships = relationshipsRes.rows
        .map((row) => {
          const fromTable = tableIndexById.get(row.from_table_id);
          const fromColumn = columnIndexById.get(row.from_column_id);
          const toTable = tableIndexById.get(row.to_table_id);
          const toColumn = columnIndexById.get(row.to_column_id);
          if (!fromTable || !fromColumn || !toTable || !toColumn) return undefined;
          return {
            fromTableTechnicalName: fromTable.technicalName,
            fromColumnTechnicalName: fromColumn.technicalName,
            toTableTechnicalName: toTable.technicalName,
            toColumnTechnicalName: toColumn.technicalName,
            joinType: row.join_type,
            cardinality: row.cardinality,
            confidence: Number(row.confidence)
          } as SemanticRelationship;
        })
        .filter((relationship): relationship is SemanticRelationship => Boolean(relationship));

      return {
        tables,
        kpis: kpisRes.rows.map((row) => ({
          id: row.id,
          name: row.name,
          sqlFormula: row.sql_formula,
          description: row.description,
          formatting: row.formatting
        })),
        synonyms: synonymsRes.rows.map((row) => ({
          id: row.id,
          term: row.term,
          mappedValue: row.mapped_value
        })),
        relationships
      };
    }

    return this.inMemorySemantic[this.semanticKey(user.id, datasourceId)] || {
      tables: [],
      kpis: [],
      synonyms: [],
      relationships: []
    };
  }

  async generateSemanticLayer(user: AuthUser, datasourceId: string): Promise<SemanticLayerResponse> {
    this.assertRole(user.role, ['Admin', 'Analyst']);
    await this.datasourceManager.assertDatasourceOwnership(user.id, datasourceId);

    const existing = await this.getSemanticLayer(user, datasourceId);
    if (existing.tables.length > 0) return existing;

    const proposal = await this.generateSemanticProposal(user, datasourceId, {
      useAI: false,
      sampleSize: 100,
      overwriteExisting: false
    });

    return this.saveSemanticLayer(user, datasourceId, {
      tables: proposal.tables,
      columns: proposal.columns,
      kpis: proposal.kpis,
      synonyms: proposal.synonyms,
      relationships: proposal.relationships,
      overwriteExisting: false
    });
  }

  async generateSemanticProposal(
    user: AuthUser,
    datasourceId: string,
    input: GenerateSemanticProposalInput = {}
  ): Promise<SemanticProposalResponse> {
    this.assertRole(user.role, ['Admin', 'Analyst']);
    await this.datasourceManager.assertDatasourceOwnership(user.id, datasourceId);

    if (!input.overwriteExisting) {
      const existing = await this.getSemanticLayer(user, datasourceId);
      if (existing.tables.length > 0) {
        return {
          datasourceId,
          confidence: 0.9,
          tables: existing.tables.map((table) => ({
            technicalName: table.technicalName,
            businessName: table.businessName,
            description: table.description,
            tableType: table.tableType,
            confidence: 0.9,
            source: 'user'
          })),
          columns: existing.tables.flatMap((table) =>
            table.columns.map((column) => ({
              tableTechnicalName: table.technicalName,
              technicalName: column.technicalName,
              businessName: column.businessName,
              semanticType: column.semanticType,
              dataType: column.dataType,
              isNullable: column.isNullable,
              confidence: 0.9,
              source: 'user'
            }))
          ),
          kpis: existing.kpis.map((kpi) => ({
            name: kpi.name,
            sqlFormula: kpi.sqlFormula,
            description: kpi.description,
            formatting: this.normalizeKpiFormatting(kpi.formatting),
            confidence: 0.9,
            source: 'user'
          })),
          synonyms: existing.synonyms.map((synonym) => ({
            term: synonym.term,
            mappedValue: synonym.mappedValue,
            confidence: 0.9,
            source: 'user'
          })),
          relationships: (existing.relationships || []).map((relationship) => ({ ...relationship })),
          warnings: ['Existing semantic layer returned because overwriteExisting is false.']
        };
      }
    }

    const sampleSize = Math.max(10, Math.min(Number(input.sampleSize || 100), 500));
    const semanticLanguage = this.normalizeSemanticLayerLanguage(input.semanticLanguage);
    const businessSector = this.normalizeBusinessSector(input.businessSector);
    const metadata = await this.extractSemanticMetadata(user, datasourceId, sampleSize);
    const proposal = this.buildHeuristicSemanticProposal(datasourceId, metadata, semanticLanguage, businessSector);

    if (input.useAI) {
      return this.enrichSemanticProposalWithAI(proposal, metadata, semanticLanguage, businessSector);
    }

    return proposal;
  }

  async saveSemanticLayer(
    user: AuthUser,
    datasourceId: string,
    input: SaveSemanticLayerInput
  ): Promise<SemanticLayerResponse> {
    this.assertRole(user.role, ['Admin', 'Analyst']);
    await this.datasourceManager.assertDatasourceOwnership(user.id, datasourceId);

    const tables = (input.tables || []).map((table) => this.normalizeTableProposal(table));
    const columns = (input.columns || []).map((column) => this.normalizeColumnProposal(column));
    const kpis = (input.kpis || []).map((kpi) => this.normalizeKpiProposal(kpi));
    const synonyms = (input.synonyms || []).map((synonym) => this.normalizeSynonymProposal(synonym));
    this.validateSemanticLayerPayload(tables, columns, kpis, synonyms);

    if (this.database.dbReady && this.database.pool) {
      const client = await this.database.pool.connect();
      try {
        await client.query('BEGIN');

        if (input.overwriteExisting) {
          await client.query('DELETE FROM app_semantic_synonyms WHERE datasource_id = $1 AND user_id = $2', [
            datasourceId,
            user.id
          ]);
          await client.query('DELETE FROM app_semantic_kpis WHERE datasource_id = $1 AND user_id = $2', [
            datasourceId,
            user.id
          ]);
          await client.query('DELETE FROM app_semantic_relationships WHERE datasource_id = $1 AND user_id = $2', [
            datasourceId,
            user.id
          ]);
          await client.query('DELETE FROM app_semantic_tables WHERE datasource_id = $1 AND user_id = $2', [
            datasourceId,
            user.id
          ]);
        }

        const tableIds = new Map<string, string>();
        for (const table of tables) {
          const existingTable = await client.query(
            `SELECT id
             FROM app_semantic_tables
             WHERE datasource_id = $1 AND user_id = $2 AND technical_name = $3
             LIMIT 1`,
            [datasourceId, user.id, table.technicalName]
          );

          const tableId = existingTable.rows[0]?.id || this.newId('stb');
          tableIds.set(table.technicalName, tableId);

          if (existingTable.rowCount) {
            await client.query(
              `UPDATE app_semantic_tables
               SET business_name = $1, description = $2, table_type = $3, updated_at = now()
               WHERE id = $4 AND datasource_id = $5 AND user_id = $6`,
              [table.businessName, table.description, table.tableType, tableId, datasourceId, user.id]
            );
          } else {
            await client.query(
              `INSERT INTO app_semantic_tables
               (id, datasource_id, user_id, technical_name, business_name, description, table_type)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [
                tableId,
                datasourceId,
                user.id,
                table.technicalName,
                table.businessName,
                table.description,
                table.tableType
              ]
            );
          }
        }

        const columnIds = new Map<string, string>();
        for (const column of columns) {
          const tableId = tableIds.get(column.tableTechnicalName);
          if (!tableId) continue;

          const existingColumn = await client.query(
            `SELECT id
             FROM app_semantic_columns
             WHERE table_id = $1 AND user_id = $2 AND technical_name = $3
             LIMIT 1`,
            [tableId, user.id, column.technicalName]
          );

          if (existingColumn.rowCount) {
            const columnId = existingColumn.rows[0].id;
            columnIds.set(`${column.tableTechnicalName}.${column.technicalName}`, columnId);
            await client.query(
              `UPDATE app_semantic_columns
               SET business_name = $1, semantic_type = $2, data_type = $3, is_nullable = $4, updated_at = now()
               WHERE id = $5 AND table_id = $6 AND user_id = $7`,
              [
                column.businessName,
                column.semanticType,
                column.dataType,
                column.isNullable,
                columnId,
                tableId,
                user.id
              ]
            );
          } else {
            const columnId = this.newId('scl');
            columnIds.set(`${column.tableTechnicalName}.${column.technicalName}`, columnId);
            await client.query(
              `INSERT INTO app_semantic_columns
               (id, table_id, user_id, technical_name, business_name, semantic_type, data_type, is_nullable)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [
                columnId,
                tableId,
                user.id,
                column.technicalName,
                column.businessName,
                column.semanticType,
                column.dataType,
                column.isNullable
              ]
            );
          }
        }

        for (const kpi of kpis) {
          const existingKpi = await client.query(
            `SELECT id
             FROM app_semantic_kpis
             WHERE datasource_id = $1 AND user_id = $2 AND lower(name) = lower($3)
             LIMIT 1`,
            [datasourceId, user.id, kpi.name]
          );

          if (existingKpi.rowCount) {
            await client.query(
              `UPDATE app_semantic_kpis
               SET sql_formula = $1, description = $2, formatting = $3
               WHERE id = $4 AND datasource_id = $5 AND user_id = $6`,
              [kpi.sqlFormula, kpi.description, kpi.formatting, existingKpi.rows[0].id, datasourceId, user.id]
            );
          } else {
            await client.query(
              `INSERT INTO app_semantic_kpis
               (id, datasource_id, user_id, name, sql_formula, description, formatting)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [this.newId('kpi'), datasourceId, user.id, kpi.name, kpi.sqlFormula, kpi.description, kpi.formatting]
            );
          }
        }

        for (const synonym of synonyms) {
          const existingSynonym = await client.query(
            `SELECT id
             FROM app_semantic_synonyms
             WHERE datasource_id = $1 AND user_id = $2 AND lower(term) = lower($3) AND mapped_value = $4
             LIMIT 1`,
            [datasourceId, user.id, synonym.term, synonym.mappedValue]
          );

          if (!existingSynonym.rowCount) {
            await client.query(
              `INSERT INTO app_semantic_synonyms
               (id, datasource_id, user_id, term, mapped_value)
               VALUES ($1, $2, $3, $4, $5)`,
              [this.newId('syn'), datasourceId, user.id, synonym.term, synonym.mappedValue]
            );
          }
        }

        const persistedLayerBase: SemanticLayerResponse = {
          tables: tables.map((table) => ({
            id: tableIds.get(table.technicalName) || this.newId('stb'),
            technicalName: table.technicalName,
            businessName: table.businessName,
            description: table.description,
            tableType: table.tableType,
            columns: columns
              .filter((column) => column.tableTechnicalName === table.technicalName)
              .map((column) => ({
                id: columnIds.get(`${column.tableTechnicalName}.${column.technicalName}`) || this.newId('scl'),
                technicalName: column.technicalName,
                businessName: column.businessName,
                semanticType: column.semanticType,
                dataType: column.dataType,
                isNullable: column.isNullable,
                isForeignKey: column.isForeignKey,
                references: column.references ? { ...column.references } : undefined
              }))
          })),
          kpis: kpis.map((kpi) => ({
            id: this.newId('kpi'),
            name: kpi.name,
            sqlFormula: kpi.sqlFormula,
            description: kpi.description,
            formatting: kpi.formatting
          })),
          synonyms: synonyms.map((synonym) => ({
            id: this.newId('syn'),
            term: synonym.term,
            mappedValue: synonym.mappedValue
          }))
        };
        const persistedLayer: SemanticLayerResponse = {
          ...persistedLayerBase,
          relationships: input.relationships?.length ? input.relationships : this.inferSemanticRelationships(persistedLayerBase)
        };
        await this.persistSemanticRelationships(client, user.id, datasourceId, persistedLayer);

        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }

      const layer = await this.getSemanticLayer(user, datasourceId);
      await this.semanticVector.syncSemanticVectorIndex(user.id, datasourceId, layer);
      return layer;
    }

    const tableIds = new Map<string, string>();
    const savedTables: SemanticTable[] = tables.map((table) => {
      const id = this.newId('stb');
      tableIds.set(table.technicalName, id);
      return {
        id,
        technicalName: table.technicalName,
        businessName: table.businessName,
        description: table.description,
        tableType: table.tableType,
        columns: []
      };
    });

    const savedTableIndex = new Map(savedTables.map((table) => [table.technicalName, table]));
    for (const column of columns) {
      const table = savedTableIndex.get(column.tableTechnicalName);
      if (!table) continue;
      table.columns.push({
        id: this.newId('scl'),
        technicalName: column.technicalName,
        businessName: column.businessName,
        semanticType: column.semanticType,
        dataType: column.dataType,
        isNullable: column.isNullable,
        isForeignKey: column.isForeignKey,
        references: column.references ? { ...column.references } : undefined
      });
    }

    const layerBase: SemanticLayerResponse = {
      tables: savedTables,
      kpis: kpis.map((kpi) => ({
        id: this.newId('kpi'),
        name: kpi.name,
        sqlFormula: kpi.sqlFormula,
        description: kpi.description,
        formatting: kpi.formatting
      })),
      synonyms: synonyms.map((synonym) => ({
        id: this.newId('syn'),
        term: synonym.term,
        mappedValue: synonym.mappedValue
      })),
    };
    const layer: SemanticLayerResponse = {
      ...layerBase,
      relationships: input.relationships?.length ? input.relationships : this.inferSemanticRelationships(layerBase)
    };
    this.inMemorySemantic[this.semanticKey(user.id, datasourceId)] = layer;
    return layer;
  }

  async deleteSemanticLayer(user: AuthUser, datasourceId: string): Promise<{ ok: boolean }> {
    this.assertRole(user.role, ['Admin', 'Analyst']);
    await this.datasourceManager.assertDatasourceOwnership(user.id, datasourceId);

    if (this.database.dbReady && this.database.pool) {
      const client = await this.database.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM app_semantic_synonyms WHERE datasource_id = $1 AND user_id = $2', [
          datasourceId,
          user.id
        ]);
        await client.query('DELETE FROM app_semantic_relationships WHERE datasource_id = $1 AND user_id = $2', [
          datasourceId,
          user.id
        ]);
        await client.query('DELETE FROM app_semantic_kpis WHERE datasource_id = $1 AND user_id = $2', [
          datasourceId,
          user.id
        ]);
        await client.query('DELETE FROM app_semantic_tables WHERE datasource_id = $1 AND user_id = $2', [
          datasourceId,
          user.id
        ]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
      await this.semanticVector.syncSemanticVectorIndex(user.id, datasourceId, { tables: [], kpis: [], synonyms: [], relationships: [] });
      return { ok: true };
    }

    delete this.inMemorySemantic[this.semanticKey(user.id, datasourceId)];
    return { ok: true };
  }

  async updateSemanticTable(
    user: AuthUser,
    datasourceId: string,
    tableId: string,
    businessName: string,
    description: string
  ) {
    this.assertRole(user.role, ['Admin', 'Analyst']);
    await this.datasourceManager.assertDatasourceOwnership(user.id, datasourceId);

    if (this.database.dbReady && this.database.pool) {
      await this.database.pool.query(
        `UPDATE app_semantic_tables
         SET business_name = $1, description = $2, updated_at = now()
         WHERE id = $3 AND datasource_id = $4 AND user_id = $5`,
        [businessName, description, tableId, datasourceId, user.id]
      );
      const layer = await this.getSemanticLayer(user, datasourceId);
      const table = layer.tables.find((item) => item.id === tableId);
      if (table) {
        await this.semanticVector.tryUpsertSemanticVectorEntries(user.id, datasourceId, [
          this.semanticVector.buildSemanticTableSearchEntry(table),
          ...table.columns.map((column) => this.semanticVector.buildSemanticColumnSearchEntry(table, column))
        ]);
      }
      return layer;
    }

    const layer = this.inMemorySemantic[this.semanticKey(user.id, datasourceId)];
    if (layer) {
      const table = layer.tables.find((item) => item.id === tableId);
      if (table) {
        table.businessName = businessName;
        table.description = description;
      }
    }
    return layer || { tables: [], kpis: [], synonyms: [], relationships: [] };
  }

  async updateSemanticColumn(
    user: AuthUser,
    datasourceId: string,
    columnId: string,
    businessName: string,
    semanticType: SemanticType
  ) {
    this.assertRole(user.role, ['Admin', 'Analyst']);
    await this.datasourceManager.assertDatasourceOwnership(user.id, datasourceId);

    if (this.database.dbReady && this.database.pool) {
      await this.database.pool.query(
        `UPDATE app_semantic_columns
         SET business_name = $1, semantic_type = $2, updated_at = now()
         WHERE id = $3 AND user_id = $4`,
        [businessName, semanticType, columnId, user.id]
      );
      const layer = await this.getSemanticLayer(user, datasourceId);
      const table = layer.tables.find((item) => item.columns.some((column) => column.id === columnId));
      const column = table?.columns.find((item) => item.id === columnId);
      if (table && column) {
        await this.semanticVector.tryUpsertSemanticVectorEntries(user.id, datasourceId, [
          this.semanticVector.buildSemanticColumnSearchEntry(table, column)
        ]);
      }
      return layer;
    }

    const layer = this.inMemorySemantic[this.semanticKey(user.id, datasourceId)];
    if (layer) {
      for (const table of layer.tables) {
        const column = table.columns.find((item) => item.id === columnId);
        if (column) {
          column.businessName = businessName;
          column.semanticType = semanticType;
        }
      }
    }
    return layer || { tables: [], kpis: [], synonyms: [], relationships: [] };
  }

  async createSemanticKpi(
    user: AuthUser,
    datasourceId: string,
    name: string,
    sqlFormula: string,
    description: string,
    formatting: string
  ) {
    this.assertRole(user.role, ['Admin', 'Analyst']);
    await this.datasourceManager.assertDatasourceOwnership(user.id, datasourceId);

    if (!name.trim() || !sqlFormula.trim()) {
      throw new BadRequestException('KPI name and formula are required.');
    }

    if (this.database.dbReady && this.database.pool) {
      const result = await this.database.pool.query(
        `INSERT INTO app_semantic_kpis
         (id, datasource_id, user_id, name, sql_formula, description, formatting)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, name, sql_formula, description, formatting`,
        [this.newId('kpi'), datasourceId, user.id, name.trim(), sqlFormula.trim(), description.trim(), formatting.trim()]
      );
      const row = result.rows[0];
      await this.semanticVector.tryUpsertSemanticVectorEntries(user.id, datasourceId, [
        this.semanticVector.buildSemanticKpiSearchEntry({
          id: row.id,
          name: row.name,
          sqlFormula: row.sql_formula,
          description: row.description,
          formatting: row.formatting
        })
      ]);
      const layer = await this.getSemanticLayer(user, datasourceId);
      return layer;
    }

    const key = this.semanticKey(user.id, datasourceId);
    const layer = this.inMemorySemantic[key] || { tables: [], kpis: [], synonyms: [], relationships: [] };
    layer.kpis.unshift({
      id: this.newId('kpi'),
      name: name.trim(),
      sqlFormula: sqlFormula.trim(),
      description: description.trim(),
      formatting: formatting.trim()
    });
    this.inMemorySemantic[key] = layer;
    return layer;
  }

  async createSemanticSynonym(user: AuthUser, datasourceId: string, term: string, mappedValue: string) {
    this.assertRole(user.role, ['Admin', 'Analyst']);
    await this.datasourceManager.assertDatasourceOwnership(user.id, datasourceId);

    if (!term.trim() || !mappedValue.trim()) {
      throw new BadRequestException('Synonym term and mapped value are required.');
    }

    if (this.database.dbReady && this.database.pool) {
      const result = await this.database.pool.query(
        `INSERT INTO app_semantic_synonyms
         (id, datasource_id, user_id, term, mapped_value)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, term, mapped_value`,
        [this.newId('syn'), datasourceId, user.id, term.trim(), mappedValue.trim()]
      );
      const row = result.rows[0];
      await this.semanticVector.tryUpsertSemanticVectorEntries(user.id, datasourceId, [
        this.semanticVector.buildSemanticSynonymSearchEntry({
          id: row.id,
          term: row.term,
          mappedValue: row.mapped_value
        })
      ]);
      const layer = await this.getSemanticLayer(user, datasourceId);
      return layer;
    }

    const key = this.semanticKey(user.id, datasourceId);
    const layer = this.inMemorySemantic[key] || { tables: [], kpis: [], synonyms: [], relationships: [] };
    layer.synonyms.unshift({
      id: this.newId('syn'),
      term: term.trim(),
      mappedValue: mappedValue.trim()
    });
    this.inMemorySemantic[key] = layer;
    return layer;
  }

  private async extractSemanticMetadata(
    user: AuthUser,
    datasourceId: string,
    sampleSize: number
  ): Promise<MetadataTable[]> {
    return this.profileSchema(user, datasourceId, sampleSize);
  }

  private async profileSchema(
    user: AuthUser,
    datasourceId: string,
    sampleSize: number
  ): Promise<MetadataTable[]> {
    const context = await this.datasourceManager.resolveDatasourceContext(user.id, datasourceId);
    const tablePayload = (await this.callMetadataService('/profile/tables', context)) as { tables?: unknown[] };
    const rawTables = Array.isArray(tablePayload.tables) ? tablePayload.tables : [];
    const tables: MetadataTable[] = [];

    for (const rawTable of rawTables) {
      const technicalName = this.readTableTechnicalName(rawTable);
      if (!technicalName) continue;

      const table: MetadataTable = {
        name: technicalName,
        schema: this.readTableSchema(rawTable, technicalName),
        tableType: this.readMetadataTableType(rawTable, context.type),
        rowCount: 0,
        primaryKeys: [],
        foreignKeys: [],
        indexes: this.readTableIndexes(rawTable),
        inferredTableRole: 'unknown',
        columns: [],
        sampleRows: [],
        warnings: []
      };

      try {
        const [columnsPayload, previewPayload, statsPayload] = await Promise.all([
          this.callMetadataService('/profile/columns', { ...context, tableName: technicalName }),
          this.callMetadataService('/profile/preview', { ...context, tableName: technicalName, limit: sampleSize }),
          this.callMetadataService('/profile/stats', { ...context, tableName: technicalName })
        ]);

        const rows = Array.isArray((previewPayload as { rows?: unknown[] }).rows)
          ? ((previewPayload as { rows: Array<Record<string, unknown>> }).rows || [])
          : [];
        table.sampleRows = rows;
        table.rowCount = Number((statsPayload as { rowCount?: number }).rowCount || rows.length || 0);

        const rawColumns = Array.isArray((columnsPayload as { columns?: unknown[] }).columns)
          ? ((columnsPayload as { columns: Array<Record<string, unknown>> }).columns || [])
          : [];
        const inferredColumns: Array<Record<string, unknown>> = rawColumns.length
          ? rawColumns
          : this.inferColumnsFromRows(rows);

        table.columns = inferredColumns.map((column) => {
          const name = String(column.name || '').trim();
          const references = this.normalizeColumnReference(column.references);
          const isPrimaryKey = Boolean(column.isPrimaryKey);
          const isForeignKey = Boolean(column.isForeignKey || references);
          const dataType = String(column.dataType || this.inferValueType(rows.map((row) => row[name])) || 'unknown');
          return {
            name,
            dataType,
            isNullable: Boolean(column.isNullable ?? true),
            isPrimaryKey,
            isForeignKey,
            inferredBusinessRole: this.inferColumnBusinessRole(name, dataType, {
              isPrimaryKey,
              isForeignKey,
              references
            }),
            references,
            profile: this.profileColumn(rows, name)
          };
        });
        table.primaryKeys = table.columns.filter((column) => column.isPrimaryKey).map((column) => column.name);
        table.foreignKeys = table.columns
          .filter((column) => column.isForeignKey)
          .map((column) => ({
            column: column.name,
            references: column.references ? { ...column.references } : undefined
          }));
        table.inferredTableRole = this.inferTableRoleFromProfile(table);
      } catch (error) {
        table.warnings?.push(
          `Metadata for ${technicalName} is incomplete: ${error instanceof Error ? error.message : 'unknown extraction error'
          }.`
        );
      }

      tables.push(table);
    }

    return tables;
  }

  public buildHeuristicSemanticProposal(
    datasourceId: string,
    metadata: MetadataTable[],
    semanticLanguage: SemanticLayerLanguage = 'en',
    businessSector: SemanticBusinessSector = 'sales_distribution'
  ): SemanticProposalResponse {
    const warnings: string[] = [];
    const rowCounts = metadata.map((table) => table.rowCount).filter((count) => count > 0).sort((a, b) => a - b);
    const medianRows = rowCounts.length ? rowCounts[Math.floor(rowCounts.length / 2)] : 0;
    const tableColumns = new Map<string, SemanticColumnProposal[]>();

    const columns = metadata.flatMap((table) => {
      if (!table.columns.length) {
        warnings.push(`Datasource metadata for ${table.name} has no columns; table classified as unknown.`);
      }
      for (const warning of table.warnings || []) warnings.push(warning);

      const proposed = table.columns.map((column) => {
        const classification = this.classifyColumn(column);
        warnings.push(...classification.warnings);
        const columnWarnings = [...classification.warnings];
        const proposal: SemanticColumnProposal = {
          tableTechnicalName: table.name,
          technicalName: column.name,
          businessName: this.toLocalizedBusinessName(column.name, semanticLanguage, classification.semanticType),
          semanticType: classification.semanticType,
          dataType: column.dataType,
          isNullable: column.isNullable,
          isForeignKey: column.isForeignKey,
          references: column.references ? { ...column.references } : undefined,
          confidence: classification.confidence,
          source: 'heuristic',
          warnings: columnWarnings
        };
        return proposal;
      });
      tableColumns.set(table.name, proposed);
      return proposed;
    });

    const tables = metadata.map((table) => {
      const classifiedColumns = tableColumns.get(table.name) || [];
      const classification = this.classifyTable(table, classifiedColumns, medianRows);
      const labelColumn = this.findDimensionLabelColumn(classifiedColumns);
      const joinKeyColumns = this.findJoinKeyColumns(table, classifiedColumns);
      return {
        technicalName: table.name,
        businessName: this.toLocalizedBusinessName(this.unqualifyName(table.name), semanticLanguage),
        description: this.buildLocalizedTableDescription(
          table.name,
          classification.tableType,
          semanticLanguage,
          labelColumn,
          joinKeyColumns,
          classifiedColumns
        ),
        tableType: classification.tableType,
        confidence: classification.confidence,
        source: 'heuristic' as SemanticProposalSource
      };
    });

    const kpis = this.generateKpiProposals(tables, columns, warnings, semanticLanguage, businessSector);
    const synonyms = this.generateSynonymProposals(tables, columns, kpis, semanticLanguage, businessSector);
    const relationships = this.inferSemanticRelationships({
      tables: tables.map((table) => ({
        id: table.technicalName,
        technicalName: table.technicalName,
        businessName: table.businessName,
        description: table.description,
        tableType: table.tableType,
        columns: columns
          .filter((column) => column.tableTechnicalName === table.technicalName)
          .map((column) => ({
            id: `${table.technicalName}.${column.technicalName}`,
            technicalName: column.technicalName,
            businessName: column.businessName,
            semanticType: column.semanticType,
            dataType: column.dataType,
            isNullable: column.isNullable,
            isForeignKey: column.isForeignKey,
            references: column.references ? { ...column.references } : undefined
          }))
      })),
      kpis: [],
      synonyms: []
    });
    const confidenceItems = [
      ...tables.map((table) => table.confidence),
      ...columns.map((column) => column.confidence),
      ...kpis.map((kpi) => kpi.confidence),
      ...synonyms.map((synonym) => synonym.confidence),
      ...relationships.map((relationship) => relationship.confidence)
    ];
    const confidence = confidenceItems.length
      ? Number((confidenceItems.reduce((sum, value) => sum + value, 0) / confidenceItems.length).toFixed(2))
      : 0;

    return {
      datasourceId,
      confidence,
      tables,
      columns,
      kpis,
      synonyms,
      relationships,
      warnings: Array.from(new Set(warnings))
    };
  }

  public classifyColumn(column: MetadataColumn): {
    semanticType: SemanticType;
    confidence: number;
    warnings: string[];
  } {
    const name = column.name.toLowerCase();
    const warnings: string[] = [];
    const semanticRule = this.inferSemanticRules({ column });
    if (semanticRule?.semanticType) {
      if (semanticRule.businessRole === 'foreign_key' && !column.isForeignKey && !column.references) {
        warnings.push(`Relationship ${column.name} detected by naming convention but no FK constraint exists.`);
      }
      if (semanticRule.businessRole === 'sensitive') {
        warnings.push(`Sensitive business attribute ${column.name} detected; avoid exposing raw personal data in generated answers.`);
      }
      return {
        semanticType: semanticRule.semanticType,
        confidence: semanticRule.confidence || 0.85,
        warnings
      };
    }
    const distinctRatio = column.profile.distinctRatio;
    const numeric = this.isNumericType(column.dataType);
    const dateLike = this.isDateType(column.dataType) || this.hasAny(name, ['date', 'time', 'year', 'month', 'day']);
    const textLike = this.isTextType(column.dataType);
    const keyLike = column.isForeignKey || Boolean(column.references) || this.isLikelyKeyColumn(name);

    if (column.isPrimaryKey) {
      return { semanticType: 'identifier', confidence: 0.96, warnings };
    }

    if (keyLike || name === 'id' || name.endsWith('_id') || name.includes('uuid')) {
      if ((name.endsWith('_id') || this.isLikelyKeyColumn(name)) && !column.isForeignKey && !column.references) {
        warnings.push(`Relationship ${column.name} detected by naming convention but no FK constraint exists.`);
      }
      return { semanticType: 'identifier', confidence: column.isForeignKey || column.references ? 0.92 : 0.8, warnings };
    }

    if (dateLike || this.valuesLookLikeDates(column.profile.sampleValues)) {
      return { semanticType: 'date', confidence: this.isDateType(column.dataType) ? 0.94 : 0.74, warnings };
    }

    if (column.isForeignKey) {
      return { semanticType: 'identifier', confidence: 0.9, warnings };
    }

    if (
      numeric &&
      this.hasAny(name, [
        'amount',
        'price',
        'total',
        'revenue',
        'sales',
        'cost',
        'quantity',
        'qty',
        'score',
        'duration',
        'balance',
        'margin',
        'tax'
      ])
    ) {
      return { semanticType: 'measure', confidence: distinctRatio >= 0.2 ? 0.89 : 0.78, warnings };
    }

    if (
      textLike &&
      (distinctRatio <= 0.5 ||
        this.isLikelyLabelColumn(name) ||
        this.hasAny(name, ['category', 'region', 'city', 'country', 'status', 'type', 'segment', 'gender', 'product', 'customer']))
    ) {
      return { semanticType: 'dimension', confidence: distinctRatio <= 0.3 ? 0.84 : 0.7, warnings };
    }

    return { semanticType: 'unknown', confidence: 0.45, warnings };
  }

  public classifyTable(
    table: MetadataTable,
    columns: SemanticColumnProposal[],
    medianRows: number
  ): { tableType: TableType; confidence: number } {
    const name = table.name.toLowerCase();
    const semanticRule = this.inferSemanticRules({ table });
    if (semanticRule?.tableType) {
      return { tableType: semanticRule.tableType, confidence: semanticRule.confidence || 0.9 };
    }
    if (table.inferredTableRole !== 'unknown') {
      return { tableType: table.inferredTableRole, confidence: 0.86 };
    }
    const foreignKeys = table.columns.filter((column) => column.isForeignKey || column.name.toLowerCase().endsWith('_id')).length;
    const measures = columns.filter((column) => column.semanticType === 'measure').length;
    const dimensions = columns.filter((column) => column.semanticType === 'dimension').length;
    const hasPk = table.columns.some((column) => column.isPrimaryKey || column.name.toLowerCase() === 'id');
    const relativelyLarge = medianRows > 0 && table.rowCount >= medianRows;

    let factScore = 0;
    if (foreignKeys >= 2) factScore += 2;
    if (measures > 0) factScore += 2;
    if (relativelyLarge) factScore += 1;
    if (this.hasAny(name, ['orders', 'sales', 'transactions', 'events', 'logs', 'payments', 'invoices'])) factScore += 2;

    let dimensionScore = 0;
    if (hasPk) dimensionScore += 1;
    if (dimensions >= measures) dimensionScore += 1;
    if (medianRows > 0 && table.rowCount <= medianRows) dimensionScore += 1;
    if (this.hasAny(name, ['customer', 'product', 'date', 'region', 'category', 'supplier', 'employee'])) {
      dimensionScore += 2;
    }

    if (factScore >= 4 && factScore >= dimensionScore) return { tableType: 'fact', confidence: 0.82 };
    if (dimensionScore >= 3) return { tableType: 'dimension', confidence: 0.76 };
    return { tableType: 'unknown', confidence: 0.5 };
  }

  private generateKpiProposals(
    tables: SemanticTableProposal[],
    columns: SemanticColumnProposal[],
    warnings: string[],
    semanticLanguage: SemanticLayerLanguage = 'en',
    businessSector: SemanticBusinessSector = 'sales_distribution'
  ): SemanticKpiProposal[] {
    const proposals: SemanticKpiProposal[] = [];
    const seen = new Set<string>();
    const factTableNames = new Set(tables.filter((table) => table.tableType === 'fact').map((table) => table.technicalName));
    const measureColumns = columns.filter(
      (item) =>
        item.semanticType === 'measure' &&
        (factTableNames.size ? factTableNames.has(item.tableTechnicalName) : true) &&
        !this.isLikelyKeyColumn(item.technicalName)
    );

    for (const kpi of this.generateDomainKPIs(businessSector, columns)) {
      const key = `${kpi.name}:${kpi.sqlFormula}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      proposals.push(kpi);
    }

    for (const column of measureColumns) {
      if (this.isDomainKpiCoveredColumn(businessSector, column.technicalName)) continue;
      const lower = column.technicalName.toLowerCase();
      const metricName = this.toLocalizedBusinessName(column.technicalName, semanticLanguage, 'measure');
      const metricAlias = this.findBusinessMetricAlias(column, businessSector);
      const isRate = /^taux_/i.test(lower);
      const isUnitPrice = /prix_?unitaire/i.test(lower);
      const isCurrency =
        !isRate &&
        (metricAlias?.formatting === 'currency' ||
          this.hasAny(lower, ['amount', 'price', 'revenue', 'sales', 'cost', 'balance', 'margin', 'tax']));
      if (isUnitPrice) continue;
      const totalName = metricAlias?.totalName || this.localizedKpiName('total', metricName, semanticLanguage);
      const averageName = metricAlias?.averageName || this.localizedKpiName('average', metricName, semanticLanguage);

      const candidates = isRate
        ? [
            {
              name: averageName,
              sqlFormula: `AVG(${column.technicalName})`,
              description:
                metricAlias?.averageDescription ||
                this.localizedKpiDescription('average', metricName, column.tableTechnicalName, semanticLanguage),
              formatting: 'percent'
            }
          ]
        : [
            {
              name: totalName,
              sqlFormula: `SUM(${column.technicalName})`,
              description:
                metricAlias?.totalDescription ||
                this.localizedKpiDescription('total', metricName, column.tableTechnicalName, semanticLanguage),
              formatting: metricAlias?.formatting || (isCurrency ? 'currency' : 'number')
            },
            {
              name: averageName,
              sqlFormula: `AVG(${column.technicalName})`,
              description:
                metricAlias?.averageDescription ||
                this.localizedKpiDescription('average', metricName, column.tableTechnicalName, semanticLanguage),
              formatting: metricAlias?.formatting || (isCurrency ? 'currency' : 'number')
            }
          ];

      for (const kpi of candidates as Array<Omit<SemanticKpiProposal, 'confidence' | 'source'>>) {
        const key = `${kpi.name}:${kpi.sqlFormula}`.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        proposals.push({ ...kpi, confidence: metricAlias ? 0.88 : 0.82, source: 'heuristic' });
      }
    }

    const factTables = tables.filter((table) => table.tableType === 'fact');
    const shouldAddGenericCount = !(businessSector === 'sales_distribution' && proposals.some((kpi) => this.normalizeSearchText(kpi.name) === 'nombre de commandes'));
    for (const table of shouldAddGenericCount ? factTables.length ? factTables : tables.slice(0, 1) : []) {
      const kpi: SemanticKpiProposal = {
        name: this.localizedKpiName('count', this.localizedRecordsName(semanticLanguage), semanticLanguage),
        sqlFormula: 'COUNT(*)',
        description: this.localizedCountDescription(table.businessName, semanticLanguage),
        formatting: 'integer',
        confidence: 0.76,
        source: 'heuristic'
      };
      const key = `${kpi.name}:${kpi.sqlFormula}`.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        proposals.push(kpi);
      }
    }

    for (const kpi of proposals) {
      const valid = this.validateKpiFormula(kpi.sqlFormula, columns.map((column) => column.technicalName));
      if (!valid.ok) warnings.push(`KPI ${kpi.name} discarded by validation: ${valid.reason}.`);
    }

    return proposals.filter((kpi) => {
      const valid = this.validateKpiFormula(kpi.sqlFormula, columns.map((column) => column.technicalName));
      if (!valid.ok) return false;
      const coherent = this.validateKpiBusinessCoherence(kpi.name, kpi.sqlFormula);
      if (!coherent.ok) {
        warnings.push(`KPI ${kpi.name} discarded by business validation: ${coherent.reason}.`);
        return false;
      }
      kpi.formatting = this.normalizeKpiFormattingForFormula(kpi.formatting, kpi.sqlFormula, kpi.name);
      return true;
    });
  }

  private generateDomainKPIs(
    domain: SemanticBusinessSector,
    columns: SemanticColumnProposal[]
  ): SemanticKpiProposal[] {
    if (domain !== 'sales_distribution') return [];

    const columnNames = new Set(columns.map((column) => column.technicalName));
    const hasColumn = (name: string) => columnNames.has(name);
    const makeKpi = (
      name: string,
      sqlFormula: string,
      description: string,
      formatting: SemanticKpiFormatting,
      requiredColumns: string[]
    ): SemanticKpiProposal | undefined => {
      if (!requiredColumns.every(hasColumn)) return undefined;
      const valid = this.validateKpiFormula(sqlFormula, Array.from(columnNames));
      if (!valid.ok) return undefined;
      return {
        name,
        sqlFormula,
        description,
        formatting,
        confidence: 0.94,
        source: 'heuristic'
      };
    };

    return [
      makeKpi("Chiffre d'affaires", 'SUM(montant_total)', "Montant total des ventes realisees.", 'currency', ['montant_total']),
      makeKpi("Chiffre d'affaires net", 'SUM(montant_net)', "Chiffre d'affaires net apres remises et ajustements.", 'currency', ['montant_net']),
      makeKpi('Montant brut', 'SUM(montant_brut)', 'Montant brut total avant remises et ajustements.', 'currency', ['montant_brut']),
      makeKpi('Quantite vendue', 'SUM(quantite)', 'Nombre total d’unites vendues.', 'number', ['quantite']),
      makeKpi('Nombre de commandes', 'COUNT(DISTINCT id_commande)', 'Nombre distinct de commandes.', 'integer', ['id_commande']),
      makeKpi(
        'Panier moyen',
        'SUM(montant_total) / NULLIF(COUNT(DISTINCT id_commande), 0)',
        'Montant moyen par commande.',
        'currency',
        ['montant_total', 'id_commande']
      ),
      makeKpi('Remise totale', 'SUM(montant_remise)', 'Total des remises accordees.', 'currency', ['montant_remise']),
      makeKpi('TVA totale', 'SUM(montant_tva)', 'Total de la TVA collectee.', 'currency', ['montant_tva']),
      makeKpi('Cout d’achat total', 'SUM(cout_achat_total)', 'Total des couts d’achat des produits vendus.', 'currency', ['cout_achat_total']),
      makeKpi('Marge brute', 'SUM(marge_brute)', 'Marge brute totale generee par les ventes.', 'currency', ['marge_brute']),
      makeKpi(
        'Taux de marge',
        'SUM(marge_brute) / NULLIF(SUM(montant_net), 0)',
        "Ratio entre la marge brute et le chiffre d'affaires net.",
        'percent',
        ['marge_brute', 'montant_net']
      ),
      makeKpi('Cout de livraison total', 'SUM(cout_livraison)', 'Total des couts de livraison.', 'currency', ['cout_livraison']),
      makeKpi('Cout de livraison moyen', 'AVG(cout_livraison)', 'Cout moyen de livraison.', 'currency', ['cout_livraison']),
      makeKpi('Satisfaction moyenne', 'AVG(note_satisfaction)', 'Note moyenne de satisfaction client.', 'number', ['note_satisfaction']),
      makeKpi('Delai moyen de reponse', 'AVG(delai_reponse_heures)', 'Delai moyen de reponse du support client.', 'number', ['delai_reponse_heures']),
      makeKpi('Stock disponible', 'SUM(quantite_stock)', 'Quantite totale disponible en stock.', 'number', ['quantite_stock']),
      makeKpi('Valeur du stock', 'SUM(valeur_stock)', 'Valeur totale du stock disponible.', 'currency', ['valeur_stock']),
      makeKpi('Nombre de ruptures stock', 'COUNT(*) FILTER (WHERE rupture_stock = true)', 'Nombre de lignes en rupture de stock.', 'integer', ['rupture_stock']),
      makeKpi(
        'Taux de retard livraison',
        'COUNT(*) FILTER (WHERE retard_livraison = true) / NULLIF(COUNT(*), 0)',
        'Part des livraisons en retard.',
        'percent',
        ['retard_livraison']
      )
    ].filter((kpi): kpi is SemanticKpiProposal => Boolean(kpi));
  }

  private isDomainKpiCoveredColumn(domain: SemanticBusinessSector, technicalName: string) {
    if (domain !== 'sales_distribution') return false;
    return new Set([
      'montant_total',
      'montant_net',
      'montant_brut',
      'quantite',
      'id_commande',
      'montant_remise',
      'montant_tva',
      'cout_achat_total',
      'marge_brute',
      'taux_marge',
      'cout_livraison',
      'valeur_stock',
      'quantite_stock',
      'note_satisfaction',
      'delai_reponse_heures',
      'rupture_stock',
      'retard_livraison'
    ]).has(technicalName);
  }

  private generateSynonymProposals(
    tables: SemanticTableProposal[],
    columns: SemanticColumnProposal[],
    kpis: SemanticKpiProposal[],
    semanticLanguage: SemanticLayerLanguage = 'en',
    businessSector: SemanticBusinessSector = 'sales_distribution'
  ): SemanticSynonymProposal[] {
    const profile = this.getBusinessSectorProfile(businessSector);
    const dictionary: Record<string, string[]> = {
      amount: ['revenue', 'sales', "chiffre d'affaires", 'ca', 'montant', 'montant total', 'montant net', 'ventes', 'revenu', 'recette', 'الإيرادات', 'المبلغ'],
      revenue: ['amount', 'sales', "chiffre d'affaires", 'ca', 'revenu', 'recette', 'ventes', 'montant_total', 'montant_net', 'الإيرادات'],
      sales: ['revenue', 'ventes', "chiffre d'affaires", 'commande', 'ligne de vente', 'المبيعات'],

      gross_amount: ['montant brut', 'brut', 'avant remise', 'montant_brut'],
      net_amount: ['montant net', 'net', 'après remise', 'chiffre d’affaires net', 'montant_net'],
      total_amount: ['montant total', 'total TTC', 'chiffre d’affaires total', 'montant_total'],
      vat: ['tva', 'taxe', 'montant tva', 'montant_tva', 'ضريبة'],
      discount: ['remise', 'réduction', 'rabais', 'taux_remise', 'montant_remise', 'خصم'],
      cost: ['coût', 'cout', 'achat', 'coût d’achat', 'cout_achat', 'cout_achat_total', 'تكلفة'],
      margin: ['marge', 'marge brute', 'profit', 'bénéfice', 'gain', 'marge_brute', 'ربح'],
      margin_rate: ['taux de marge', 'rentabilité', 'profitabilité', 'taux_marge'],

      customer: ['client', 'buyer', 'acheteur', 'nom_client', 'segment_client', 'statut_client', 'عميل', 'العملاء'],
      product: ['produit', 'article', 'référence', 'code produit', 'nom_produit', 'code_produit', 'منتج', 'المنتجات'],
      category: ['categorie', 'catégorie produit', 'famille', 'classe', 'categorie_produit', 'sous_categorie', 'فئة'],
      brand: ['marque', 'brand', 'fabricant', 'ماركة'],
      supplier: ['fournisseur', 'vendor', 'مورد'],

      date: ['periode', 'temps', 'date', 'date commande', 'date_commande', 'date_jour', 'jour', 'mois', 'annee', 'trimestre', 'semaine', 'تاريخ', 'شهر', 'سنة'],
      month: ['mois', 'mensuel', 'ce mois-ci', 'mois courant', 'libelle_mois'],
      year: ['annee', 'année', 'annuel', 'cette année'],
      quarter: ['trimestre', 'quarter', 'ربع سنة'],
      week: ['semaine', 'hebdomadaire'],
      commercial_period: ['période commerciale', 'periode_commerciale', 'ramadan', 'aid al fitr', 'aid al adha', 'black friday', 'soldes', 'rentrée scolaire', 'fin d année'],

      quantity: ['quantite', 'quantité', 'volume', 'nombre', 'unités vendues', 'quantite_stock', 'كمية', 'عدد'],
      qty: ['quantite', 'quantité', 'volume', 'nombre', 'unités', 'كمية', 'عدد'],

      region: ['region', 'région', 'zone', 'territoire', 'region_commerciale', 'zone_commerciale', 'منطقة'],
      country: ['pays', 'marche', 'marché', 'territoire', 'maroc', 'بلد', 'سوق'],
      city: ['ville', 'localite', 'localité', 'province', 'code_postal', 'مدينة'],
      geography: ['géographie', 'geographie', 'localisation', 'région', 'ville', 'province', 'zone commerciale'],

      status: ['statut', 'etat', 'état', 'state', 'statut_commande', 'statut_client', 'statut_produit', 'statut_entrepot', 'حالة'],
      order: ['commande', 'id_commande', 'numéro commande', 'numero_ligne', 'ligne commande', 'طلب'],
      payment: [
        'paiement',
        'paiment',
        'paiements',
        'paiments',
        'type_paiement',
        'mode de paiement',
        'modes de paiement',
        'moyen de paiement',
        'moyens de paiement',
        'methode de paiement',
        'methode de paiment',
        'methodes de paiement',
        'methodes de paiment',
        'methodes de paiments',
        'payment_method',
        'carte bancaire',
        'espèces',
        'virement',
        'chèque',
        'wallet mobile',
        'الدفع'
      ],
      payment_method: [
        'mode de paiement',
        'modes de paiement',
        'moyen de paiement',
        'moyens de paiement',
        'methode de paiement',
        'methode de paiment',
        'methodes de paiement',
        'methodes de paiment',
        'methodes de paiments',
        'type de paiement',
        'types de paiement',
        'paiement',
        'paiements',
        'payment method',
        'payment_method'
      ],
      delivery: ['livraison', 'mode_livraison', 'date_livraison_prevue', 'date_livraison_reelle', 'delai_livraison_jours', 'retard_livraison', 'cout_livraison', 'توصيل'],
      delay: ['retard', 'délai', 'delai', 'retard livraison', 'livraison lente', 'delai_livraison_jours', 'retard_livraison'],

      channel: ['canal', 'source', 'canal de vente', 'nom_canal', 'type_canal', 'digital', 'physique', 'direct', 'قناة'],
      campaign: ['campagne', 'marketing', 'promotion', 'nom_campagne', 'type_campagne', 'canal_marketing', 'budget_campagne', 'objectif_campagne'],
      budget: ['budget', 'budget campagne', 'budget_campagne'],
      objective: ['objectif', 'cible', 'objectif_mensuel', 'objectif_campagne'],

      employee: ['employe', 'employé', 'collaborateur', 'commercial', 'vendeur', 'conseiller', 'nom_commercial', 'موظف'],
      commercial: ['commercial', 'vendeur', 'équipe commerciale', 'secteur_commercial', 'region_commerciale', 'objectif_mensuel'],

      stock: ['stock', 'inventaire', 'quantite_stock', 'valeur_stock', 'seuil_alerte', 'rupture_stock', 'مخزون'],
      warehouse: ['entrepot', 'entrepôt', 'depot', 'dépôt', 'hub', 'nom_entrepot', 'capacite_stock', 'مستودع'],
      shortage: ['rupture', 'rupture stock', 'rupture_stock', 'stock critique', 'seuil alerte'],

      satisfaction: ['satisfaction', 'note satisfaction', 'note_satisfaction', 'avis client', 'expérience client', 'رضا العملاء'],
      complaint: ['réclamation', 'reclamation', 'motif_reclamation', 'plainte', 'produit défectueux', 'produit non conforme', 'service client'],
      response_time: ['délai réponse', 'delai_reponse_heures', 'temps de réponse', 'support client'],

      segment: ['segment', 'segment client', 'groupe', 'premium', 'standard', 'economique', 'professionnel', 'revendeur', 'شريحة'],
      gender: ['genre', 'sexe', 'homme', 'femme'],
      age: ['âge', 'age', 'tranche_age', 'tranche d’âge'],

      department: ['departement', 'département', 'service', 'قسم'],

      ...profile.synonyms
    };
    const allowedColumns = columns.filter((column) => this.isAllowedSynonymTargetColumn(column));
    const existingValues = new Set([...allowedColumns.map((column) => column.technicalName), ...kpis.map((kpi) => kpi.name)]);
    const proposals: SemanticSynonymProposal[] = [];
    const seen = new Set<string>();
    const reliableTerms = new Set<string>();
    const addSynonym = (term: string, mappedValue: string, confidence: number) => {
      if (!term || !existingValues.has(mappedValue)) return;
      if (confidence < 0.9 && reliableTerms.has(this.normalizeSearchText(term))) return;
      const key = `${term}:${mappedValue}`.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      if (confidence >= 0.9) reliableTerms.add(this.normalizeSearchText(term));
      proposals.push({ term, mappedValue, confidence, source: 'heuristic' });
    };

    for (const synonym of this.generateReliableBusinessSynonyms(columns, kpis)) {
      addSynonym(synonym.term, synonym.mappedValue, synonym.confidence);
    }

    for (const column of allowedColumns) {
      if (businessSector === 'sales_distribution' && this.isSalesReliableSynonymCoveredColumn(column.technicalName)) continue;
      const lower = column.technicalName.toLowerCase();
      for (const [needle, terms] of Object.entries(dictionary)) {
        if (!lower.includes(needle)) continue;
        if (!existingValues.has(column.technicalName)) continue;
        for (const term of this.prioritizeSynonymTerms(terms, semanticLanguage)) {
          addSynonym(term, column.technicalName, 0.78);
        }
      }

      const metricAlias = this.findBusinessMetricAlias(column, businessSector);
      if (metricAlias && businessSector !== 'sales_distribution') {
        for (const term of this.prioritizeSynonymTerms(metricAlias.synonyms, semanticLanguage)) {
          addSynonym(term, column.technicalName, 0.84);
        }
      }
    }

    for (const kpi of kpis) {
      const normalizedKpi = this.normalizeSearchText(kpi.name);
      const terms = [
        ...this.domainKpiSynonymTerms(kpi.name),
        ...(businessSector === 'sales_distribution'
          ? []
          : profile.metricAliases
              .filter(
                (alias) =>
                  normalizedKpi === this.normalizeSearchText(alias.totalName) ||
                  normalizedKpi === this.normalizeSearchText(alias.averageName)
              )
              .flatMap((alias) => alias.synonyms)),
        kpi.name
      ];
      for (const term of this.prioritizeSynonymTerms(terms, semanticLanguage)) {
        addSynonym(term, kpi.name, 0.82);
      }
    }

    return proposals.slice(0, 90);
  }

  private isAllowedSynonymTargetColumn(column: SemanticColumnProposal) {
    if (!['measure', 'dimension', 'attribute', 'date', 'boolean_flag'].includes(column.semanticType)) return false;
    return !this.isForbiddenSynonymTarget(column.technicalName);
  }

  private isForbiddenSynonymTarget(technicalName: string) {
    const normalized = technicalName.toLowerCase();
    return (
      /^sk(?:_|$)/i.test(normalized) ||
      /^id(?:_|$)/i.test(normalized) ||
      normalized === 'id' ||
      normalized === 'created_at' ||
      normalized === 'updated_at' ||
      normalized === 'email' ||
      normalized === 'telephone' ||
      normalized === 'email_commercial' ||
      normalized === 'telephone_commercial' ||
      normalized === 'date_debut' ||
      normalized === 'date_fin' ||
      normalized.endsWith('_id')
    );
  }

  private generateReliableBusinessSynonyms(
    columns: SemanticColumnProposal[],
    kpis: SemanticKpiProposal[]
  ): SemanticSynonymProposal[] {
    const proposals: SemanticSynonymProposal[] = [];
    const kpiByName = new Map(kpis.map((kpi) => [this.normalizeSearchText(kpi.name), kpi.name]));
    const columnsByName = columns.filter((column) => this.isAllowedSynonymTargetColumn(column));
    const findColumn = (technicalName: string, tableHints: string[] = []) => {
      const normalizedColumn = this.normalizeSearchText(technicalName);
      return columnsByName.find((column) => {
        if (this.normalizeSearchText(column.technicalName) !== normalizedColumn) return false;
        if (!tableHints.length) return true;
        const table = this.normalizeSearchText(column.tableTechnicalName);
        return tableHints.some((hint) => table.includes(this.normalizeSearchText(hint)));
      })?.technicalName;
    };
    const add = (terms: string[], mappedValue?: string, confidence = 0.9) => {
      if (!mappedValue) return;
      for (const term of terms) {
        proposals.push({ term, mappedValue, confidence, source: 'heuristic' });
      }
    };
    const kpi = (name: string) => kpiByName.get(this.normalizeSearchText(name));

    add(['ca', "chiffre d'affaires", 'revenu', 'ventes'], kpi("Chiffre d'affaires"), 0.95);
    add(['ca net', "chiffre d'affaires net"], kpi("Chiffre d'affaires net"), 0.95);
    add(['panier moyen', 'ticket moyen', 'moyenne commande'], kpi('Panier moyen'), 0.95);
    add(['marge', 'marge brute', 'benefice brut', 'bénéfice brut'], kpi('Marge brute'), 0.94);
    add(['taux de marge', 'rentabilite', 'rentabilité'], kpi('Taux de marge'), 0.94);

    add(['quantite vendue', 'quantité vendue', 'volume vendu', 'volume des ventes'], findColumn('quantite', ['f_ventes']), 0.9);
    add(['stock', 'stock disponible', 'quantite en stock', 'quantité en stock'], findColumn('quantite_stock', ['f_stock']), 0.9);
    add(['valeur stock', 'valeur inventaire', "valeur d'inventaire"], findColumn('valeur_stock', ['f_stock']), 0.9);
    add(['satisfaction', 'note client', 'avis client'], findColumn('note_satisfaction', ['f_satisfaction_client']), 0.9);
    add(['delai reponse', 'délai réponse', 'temps reponse', 'temps réponse'], findColumn('delai_reponse_heures', ['f_satisfaction_client']), 0.9);
    add(['retard livraison', 'livraison en retard'], findColumn('retard_livraison', ['f_ventes']), 0.9);
    add(['rupture stock', 'produit en rupture'], findColumn('rupture_stock', ['f_stock']), 0.9);

    add(['date commande'], findColumn('date_commande', ['f_ventes']) || findColumn('date_jour', ['dim_temps']), 0.88);
    add(['mois'], findColumn('mois', ['dim_temps']) || findColumn('libelle_mois', ['dim_temps']), 0.88);
    add(['annee', 'année'], findColumn('annee', ['dim_temps']), 0.88);
    add(['trimestre'], findColumn('trimestre', ['dim_temps']), 0.88);
    add(['semaine'], findColumn('semaine_annee', ['dim_temps']), 0.88);

    add(['region', 'région'], findColumn('region', ['dim_geographie']), 0.88);
    add(['province'], findColumn('province', ['dim_geographie']), 0.88);
    add(['ville'], findColumn('ville', ['dim_geographie']), 0.88);
    add(['pays'], findColumn('pays', ['dim_geographie']), 0.88);
    add(['zone commerciale'], findColumn('zone_commerciale', ['dim_geographie']), 0.88);

    add(['client'], findColumn('nom_client', ['dim_client']), 0.88);
    add(['segment client'], findColumn('segment_client', ['dim_client']), 0.88);
    add(['produit'], findColumn('nom_produit', ['dim_produit']), 0.88);
    add(['categorie produit', 'catégorie produit'], findColumn('categorie_produit', ['dim_produit']), 0.88);
    add(['commercial', 'vendeur'], findColumn('nom_commercial', ['dim_commercial']), 0.88);

    return proposals;
  }

  private isSalesReliableSynonymCoveredColumn(technicalName: string) {
    return new Set([
      'quantite',
      'quantite_stock',
      'valeur_stock',
      'note_satisfaction',
      'delai_reponse_heures',
      'retard_livraison',
      'rupture_stock',
      'date_commande',
      'date_jour',
      'mois',
      'libelle_mois',
      'annee',
      'trimestre',
      'semaine_annee',
      'region',
      'province',
      'ville',
      'pays',
      'zone_commerciale',
      'nom_client',
      'segment_client',
      'nom_produit',
      'categorie_produit',
      'nom_commercial'
    ]).has(technicalName);
  }

  private domainKpiSynonymTerms(kpiName: string) {
    const normalized = this.normalizeSearchText(kpiName);
    const dictionary: Record<string, string[]> = {
      'chiffre d affaires': ['ca', "chiffre d'affaires", 'revenu', 'ventes'],
      'chiffre d affaires net': ['ca net', "chiffre d'affaires net", 'revenu net', 'ventes nettes'],
      'panier moyen': ['panier moyen', 'ticket moyen', 'valeur moyenne commande'],
      'marge brute': ['marge', 'benefice', 'profit brut', 'marge commerciale'],
      'taux de marge': ['taux de marge', 'rentabilite', 'profitabilite'],
      'stock disponible': ['stock', 'stock disponible', 'inventaire'],
      'satisfaction moyenne': ['satisfaction', 'avis client', 'note client'],
      'quantite vendue': ['quantite vendue', 'volume vendu', 'unites vendues'],
      'nombre de commandes': ['nombre commandes', 'commandes', 'volume commandes']
    };
    return dictionary[normalized] || [];
  }

  private prioritizeSynonymTerms(terms: string[], semanticLanguage: SemanticLayerLanguage) {
    if (semanticLanguage === 'fr') {
      return [...terms].sort((a, b) => this.isLikelyFrenchTerm(b) - this.isLikelyFrenchTerm(a));
    }
    if (semanticLanguage === 'ar') {
      return [...terms].sort((a, b) => this.isLikelyArabicTerm(b) - this.isLikelyArabicTerm(a));
    }
    return terms;
  }

  private isLikelyFrenchTerm(term: string) {
    return /chiffre|montant|ventes|client|acheteur|produit|periode|temps|jour|mois|annee|quantite|nombre|region|pays|ville|statut|etat|categorie|famille|canal|departement|employe|fournisseur/i.test(
      term
    )
      ? 1
      : 0;
  }

  private isLikelyArabicTerm(term: string) {
    return /[\u0600-\u06FF]/.test(term) ? 1 : 0;
  }

  private async enrichSemanticProposalWithAI(
    proposal: SemanticProposalResponse,
    metadata: MetadataTable[],
    semanticLanguage: SemanticLayerLanguage = 'en',
    businessSector: SemanticBusinessSector = 'sales_distribution'
  ): Promise<SemanticProposalResponse> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || apiKey === 'change-me') {
      return {
        ...proposal,
        warnings: [...proposal.warnings, 'AI enrichment skipped because GROQ_API_KEY is not configured.']
      };
    }

    const businessProfile = this.getBusinessSectorProfile(businessSector);
    const businessPromptContext = this.buildBusinessSectorPromptContext(businessProfile);
    let next = proposal;
    try {
      next = await this.classifyTables(next, metadata, semanticLanguage, businessPromptContext, apiKey);
      next = await this.classifyColumns(next, metadata, semanticLanguage, businessPromptContext, apiKey);
      next = await this.generateKPIs(next, metadata, semanticLanguage, businessPromptContext, apiKey);
      next = await this.generateSynonyms(next, semanticLanguage, businessPromptContext, apiKey);
      next = await this.validateSemanticLayer(next, semanticLanguage, businessPromptContext, apiKey);
      next.warnings = Array.from(new Set(next.warnings));
      return next;
    } catch (error) {
      return {
        ...next,
        warnings: [
          ...next.warnings,
          `AI enrichment partially skipped: ${error instanceof Error ? error.message : 'unknown AI error'}.`
        ]
      };
    }
  }

  private async classifyTables(
    proposal: SemanticProposalResponse,
    metadata: MetadataTable[],
    semanticLanguage: SemanticLayerLanguage,
    businessContext: ReturnType<SemanticModelingService['buildBusinessSectorPromptContext']>,
    apiKey: string
  ) {
    let next = proposal;
    for (const chunk of this.chunkArray(metadata, 25)) {
      const ai = await this.callSemanticLayerLlmStep(apiKey, 'classifyTables', {
        task:
          'Generate a business-oriented table description and improve table businessName. Do not describe technical implementation, source metadata inference, or table classification mechanics. Never use generic wording such as "table inferred from datasource metadata" or "table dimension inferée depuis les metadonnees". Preserve technicalName and tableType unless the local inferred role is clearly stronger.',
        targetLanguage: this.semanticLanguageName(semanticLanguage),
        selectedBusinessSubject: businessContext,
        tables: chunk.map((table) => ({
          technicalName: table.name,
          schema: table.schema,
          rowCount: table.rowCount,
          primaryKeys: table.primaryKeys,
          foreignKeys: table.foreignKeys.map((fk) => fk.column),
          indexes: table.indexes,
          inferredTableRole: table.inferredTableRole,
          columns: table.columns.map((column) => ({
            technicalName: column.name,
            businessName:
              proposal.columns.find((item) => item.tableTechnicalName === table.name && item.technicalName === column.name)
                ?.businessName || this.toBusinessName(column.name),
            sqlType: column.dataType,
            currentSemanticType:
              proposal.columns.find((item) => item.tableTechnicalName === table.name && item.technicalName === column.name)
                ?.semanticType || 'unknown',
            nullable: column.isNullable
          })),
          proposed: proposal.tables.find((item) => item.technicalName === table.name)
        }))
      });
      next = this.applyValidatedAiSuggestions(next, ai);
    }
    return next;
  }

  private async classifyColumns(
    proposal: SemanticProposalResponse,
    metadata: MetadataTable[],
    semanticLanguage: SemanticLayerLanguage,
    businessContext: ReturnType<SemanticModelingService['buildBusinessSectorPromptContext']>,
    apiKey: string
  ) {
    let next = proposal;
    const compactColumns = metadata.flatMap((table) =>
      table.columns.map((column) => ({
        tableTechnicalName: table.name,
        technicalName: column.name,
        sqlType: column.dataType,
        nullable: column.isNullable,
        isPrimaryKey: column.isPrimaryKey,
        isForeignKey: column.isForeignKey,
        distinctCount: column.profile.distinctCount,
        nullRatio: column.profile.nullRatio,
        min: column.profile.min,
        max: column.profile.max,
        sampleValues: column.profile.sampleValues,
        inferredBusinessRole: column.inferredBusinessRole,
        proposed: proposal.columns.find((item) => item.tableTechnicalName === table.name && item.technicalName === column.name)
      }))
    );

    for (const chunk of this.chunkArray(compactColumns, 30)) {
      const ai = await this.callSemanticLayerLlmStep(apiKey, 'classifyColumns', {
        task:
          'Validate and improve column businessName and semanticType. Do not change tableTechnicalName, technicalName, or dataType. Respect sensitive data, identifiers, technical timestamps, boolean flags, business dates, measures, dimensions, and attributes.',
        targetLanguage: this.semanticLanguageName(semanticLanguage),
        selectedBusinessSubject: businessContext,
        columns: chunk
      });
      next = this.applyValidatedAiSuggestions(next, ai);
    }
    return next;
  }

  private async generateKPIs(
    proposal: SemanticProposalResponse,
    metadata: MetadataTable[],
    semanticLanguage: SemanticLayerLanguage,
    businessContext: ReturnType<SemanticModelingService['buildBusinessSectorPromptContext']>,
    apiKey: string
  ) {
    const profileByColumn = new Map(
      metadata.flatMap((table) =>
        table.columns.map((column) => [`${table.name}.${column.name}`, column.inferredBusinessRole])
      )
    );
    const ai = await this.callSemanticLayerLlmStep(apiKey, 'generateKPIs', {
      task:
        'Refine KPI names and descriptions. You may suggest additional KPIs only if formulas use available columns exactly. Prefer domain KPI rules.',
      targetLanguage: this.semanticLanguageName(semanticLanguage),
      selectedBusinessSubject: businessContext,
      availableColumns: proposal.columns
        .filter((column) => ['measure', 'identifier', 'date', 'boolean_flag'].includes(column.semanticType))
        .slice(0, 160)
        .map((column) => ({
          tableTechnicalName: column.tableTechnicalName,
          technicalName: column.technicalName,
          semanticType: column.semanticType,
          inferredBusinessRole: profileByColumn.get(`${column.tableTechnicalName}.${column.technicalName}`) || 'unknown'
        })),
      currentKpis: proposal.kpis
    });
    return this.applyValidatedAiSuggestions(proposal, ai);
  }

  private async generateSynonyms(
    proposal: SemanticProposalResponse,
    semanticLanguage: SemanticLayerLanguage,
    businessContext: ReturnType<SemanticModelingService['buildBusinessSectorPromptContext']>,
    apiKey: string
  ) {
    const allowedTargets = [
      ...proposal.kpis.map((kpi) => ({ type: 'kpi', mappedValue: kpi.name, name: kpi.name })),
      ...proposal.columns
        .filter((column) => this.isAllowedSynonymTargetColumn(column))
        .map((column) => ({
          type: column.semanticType,
          mappedValue: column.technicalName,
          name: column.businessName
        }))
    ];
    const ai = await this.callSemanticLayerLlmStep(apiKey, 'generateSynonyms', {
      task:
        'Suggest synonym terms only for allowedTargets. Never map synonyms to sk_*, id_*, created_at, updated_at, unknown columns, or tables.',
      targetLanguage: this.semanticLanguageName(semanticLanguage),
      selectedBusinessSubject: businessContext,
      allowedTargets: allowedTargets.slice(0, 120),
      currentSynonyms: proposal.synonyms.slice(0, 90)
    });
    return this.applyValidatedAiSuggestions(proposal, ai);
  }

  private async validateSemanticLayer(
    proposal: SemanticProposalResponse,
    semanticLanguage: SemanticLayerLanguage,
    businessContext: ReturnType<SemanticModelingService['buildBusinessSectorPromptContext']>,
    apiKey: string
  ) {
    const ai = await this.callSemanticLayerLlmStep(apiKey, 'validateSemanticLayer', {
      task:
        'Validate coherence. Return JSON with optional warnings only, plus optional corrected kpis/synonyms that obey all constraints.',
      targetLanguage: this.semanticLanguageName(semanticLanguage),
      selectedBusinessSubject: businessContext,
      summary: {
        tableCount: proposal.tables.length,
        columnCount: proposal.columns.length,
        kpiCount: proposal.kpis.length,
        synonymCount: proposal.synonyms.length,
        warnings: proposal.warnings.slice(0, 30)
      },
      kpis: proposal.kpis,
      synonyms: proposal.synonyms.slice(0, 90)
    });
    const next = this.applyValidatedAiSuggestions(proposal, ai);
    const aiWarnings = Array.isArray(ai.warnings) ? ai.warnings.map(String) : [];
    next.warnings = Array.from(new Set([...next.warnings, ...aiWarnings]));
    return next;
  }

  private async callSemanticLayerLlmStep(
    apiKey: string,
    step: string,
    payload: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
        temperature: 0,
        max_tokens: 1200,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: this.semanticArchitectSystemPrompt()
          },
          {
            role: 'user',
            content: JSON.stringify({ step, ...payload })
          }
        ]
      })
    });

    if (!response.ok) {
      return { warnings: [`AI step ${step} skipped: Groq returned ${response.status}.`] };
    }

    const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = body.choices?.[0]?.message?.content || '{}';
    return JSON.parse(content) as Record<string, unknown>;
  }

  private semanticArchitectSystemPrompt() {
    return [
      'You are a Senior Business Intelligence Semantic Architect.',
      'Enrich a semantic layer from detected database metadata for Natural Language to SQL generation, BI, KPI generation, semantic search, and dashboard generation.',
      'Return strict JSON only.',
      'For this API, allowed top-level keys are: tables, columns, kpis, synonyms, warnings.',
      'Tables may include: technicalName, businessName, description, tableType, confidence.',
      'Columns may include: tableTechnicalName, technicalName, businessName, semanticType, confidence.',
      'KPIs may include: name, description, sqlFormula or sql_formula, aggregationType or aggregation_type, formatting, confidence.',
      'Synonyms may include: term, mappedValue or mapped_value, confidence.',
      'Preserve all technical names exactly.',
      'Never invent tables or columns.',
      'Never generate SQL using unavailable columns.',
      'Do not describe technical implementation, source metadata inference, or table classification mechanics in table descriptions; describe the business purpose, what the entity represents, and how it can be used for analytics.',
      'For dimension tables, write a business reference description around the main label field when available; for fact tables, write a business activity description around measures, dates, and join keys.',
      'Allowed semantic types: identifier, dimension, measure, attribute, date, technical_date, boolean_flag, sensitive, unknown.',
      'Classify numeric aggregatable fields as measure.',
      'Classify names, categories, statuses, segments, labels, regions, products, customers, and channels as dimension.',
      'Classify descriptive non-aggregatable text as attribute.',
      'Classify business dates as date.',
      'Classify technical timestamps like created_at, updated_at, inserted_at, modified_at, deleted_at, loaded_at, and synced_at as technical_date.',
      'Classify ids, keys, UUIDs, primary keys, and foreign keys as identifier.',
      'Classify boolean-like fields as boolean_flag.',
      'Classify personal data like email, phone, telephone, CIN, national id, passport, address, and other direct personal identifiers as sensitive.',
      'Generate concise business synonyms for business-relevant columns and KPIs; include French, Arabic, and English terms when useful.',
      'Synonyms may map only to KPIs, measures, dimensions, attributes, boolean flags, or safe business date columns.',
      'Never map synonyms to sensitive columns, technical dates, unknown columns, raw IDs, sk_* columns, id_* columns, created_at, or updated_at.',
      'Suggest only realistic KPIs based on available structure. Prefer SUM, AVG, COUNT, COUNT DISTINCT, and ratios. Use NULLIF for division.',
      'Do not include SELECT statements in KPI formulas; return aggregate expressions only.'
    ].join(' ');
  }

  private applyValidatedAiSuggestions(
    proposal: SemanticProposalResponse,
    ai: Record<string, unknown>
  ): SemanticProposalResponse {
    const warnings = [...proposal.warnings, ...this.asStringArray(ai.warnings)];
    const next: SemanticProposalResponse = {
      ...proposal,
      tables: proposal.tables.map((table) => ({ ...table })),
      columns: proposal.columns.map((column) => ({ ...column, warnings: [...(column.warnings || [])] })),
      kpis: proposal.kpis.map((kpi) => ({ ...kpi })),
      synonyms: proposal.synonyms.map((synonym) => ({ ...synonym })),
      relationships: proposal.relationships.map((relationship) => ({ ...relationship })),
      warnings
    };
    const tableMap = new Map(next.tables.map((table) => [table.technicalName, table]));
    const columnMap = new Map(next.columns.map((column) => [`${column.tableTechnicalName}.${column.technicalName}`, column]));
    const existingColumns = next.columns.map((column) => column.technicalName);
    const existingMappedValues = new Set([
      ...next.columns.filter((column) => this.isAllowedSynonymTargetColumn(column)).map((column) => column.technicalName),
      ...next.kpis.map((kpi) => kpi.name)
    ]);

    for (const item of this.asRecordArray(ai.tables)) {
      const technicalName = String(item.technicalName || '').trim();
      const table = tableMap.get(technicalName);
      if (!table) {
        warnings.push(`LLM suggested table ${technicalName || '[blank]'} but it does not exist. Suggestion discarded.`);
        continue;
      }
      table.businessName = String(item.businessName || table.businessName).trim() || table.businessName;
      table.description = String(item.description || table.description).trim() || table.description;
      table.confidence = this.clampConfidence(Number(item.confidence || table.confidence));
      table.source = 'ai';
    }

    for (const item of this.asRecordArray(ai.columns)) {
      const key = `${String(item.tableTechnicalName || '').trim()}.${String(item.technicalName || '').trim()}`;
      const column = columnMap.get(key);
      if (!column) {
        warnings.push(`LLM suggested column ${key} but it does not exist. Suggestion discarded.`);
        continue;
      }
      column.businessName = String(item.businessName || column.businessName).trim() || column.businessName;
      if (item.semanticType || item.semantic_type) {
        column.semanticType = this.normalizeSemanticType(String(item.semanticType || item.semantic_type));
      }
      column.confidence = this.clampConfidence(Number(item.confidence || column.confidence));
      column.source = 'ai';
    }

    for (const item of this.asRecordArray(ai.kpis)) {
      const name = String(item.name || '').trim();
      const sqlFormula = String(item.sqlFormula || item.sql_formula || '').trim();
      if (!name || !sqlFormula) continue;
      const valid = this.validateKpiFormula(sqlFormula, existingColumns);
      if (!valid.ok) {
        warnings.push(`LLM suggested KPI ${name} with invalid formula. Suggestion discarded: ${valid.reason}.`);
        continue;
      }
      const coherence = this.validateKpiBusinessCoherence(name, sqlFormula);
      if (!coherence.ok) {
        warnings.push(`LLM suggested KPI ${name} discarded: ${coherence.reason}.`);
        continue;
      }
      const existing = next.kpis.find((kpi) => kpi.name.toLowerCase() === name.toLowerCase());
      const enriched: SemanticKpiProposal = {
        name,
        sqlFormula,
        description: String(item.description || existing?.description || '').trim(),
        formatting: this.normalizeKpiFormattingForFormula(
          String(item.formatting || existing?.formatting || 'number'),
          sqlFormula,
          name
        ),
        confidence: this.clampConfidence(Number(item.confidence || existing?.confidence || 0.7)),
        source: 'ai'
      };
      if (existing) Object.assign(existing, enriched);
      else next.kpis.push(enriched);
    }

    for (const item of this.asRecordArray(ai.synonyms)) {
      const term = String(item.term || '').trim();
      const mappedValue = String(item.mappedValue || item.mapped_value || '').trim();
      if (!term || !mappedValue) continue;
      if (!existingMappedValues.has(mappedValue)) {
        warnings.push(
          `LLM suggested synonym ${term} -> ${mappedValue} but synonyms may only map to KPIs, measures, dimensions, or safe dates. Suggestion discarded.`
        );
        continue;
      }
      const exists = next.synonyms.some(
        (synonym) => synonym.term.toLowerCase() === term.toLowerCase() && synonym.mappedValue === mappedValue
      );
      if (!exists) {
        next.synonyms.push({
          term,
          mappedValue,
          confidence: this.clampConfidence(Number(item.confidence || 0.68)),
          source: 'ai'
        });
      }
    }

    next.warnings = Array.from(new Set(warnings));
    return next;
  }

  private validateSemanticLayerPayload(
    tables: SemanticTableProposal[],
    columns: SemanticColumnProposal[],
    kpis: SemanticKpiProposal[],
    synonyms: SemanticSynonymProposal[]
  ) {
    if (!tables.length) throw new BadRequestException('At least one semantic table is required.');
    const tableNames = new Set(tables.map((table) => table.technicalName));
    const columnNames = new Set(columns.map((column) => column.technicalName));
    const mappedValues = new Set([...tableNames, ...columnNames, ...kpis.map((kpi) => kpi.name)]);

    for (const table of tables) {
      if (!table.technicalName || !table.businessName) {
        throw new BadRequestException('Table technicalName and businessName are required.');
      }
    }

    for (const column of columns) {
      if (!tableNames.has(column.tableTechnicalName)) {
        throw new BadRequestException(`Column ${column.technicalName} references unknown table ${column.tableTechnicalName}.`);
      }
      if (!column.technicalName || !column.businessName) {
        throw new BadRequestException('Column technicalName and businessName are required.');
      }
    }

    for (const kpi of kpis) {
      const valid = this.validateKpiFormula(kpi.sqlFormula, Array.from(columnNames));
      if (!valid.ok) throw new BadRequestException(`KPI ${kpi.name} formula is invalid: ${valid.reason}.`);
    }

    for (const synonym of synonyms) {
      if (!synonym.term || !synonym.mappedValue) {
        throw new BadRequestException('Synonym term and mappedValue are required.');
      }
      if (!mappedValues.has(synonym.mappedValue)) {
        throw new BadRequestException(`Synonym ${synonym.term} maps to unknown value ${synonym.mappedValue}.`);
      }
    }
  }

  private async persistSemanticRelationships(
    client: PoolClient,
    userId: string,
    datasourceId: string,
    layer: SemanticLayerResponse
  ) {
    const relationships = this.inferSemanticRelationships(layer);
    await client.query('DELETE FROM app_semantic_relationships WHERE datasource_id = $1 AND user_id = $2', [
      datasourceId,
      userId
    ]);

    if (!relationships.length) return;

    const tableIndex = new Map(layer.tables.map((table) => [this.normalizeSearchText(table.technicalName), table]));
    const columnIndex = new Map(
      layer.tables.flatMap((table) =>
        table.columns.map((column) => [`${this.normalizeSearchText(table.technicalName)}.${this.normalizeSearchText(column.technicalName)}`, { table, column }])
      )
    );

    for (const relationship of relationships) {
      const fromTable = tableIndex.get(this.normalizeSearchText(relationship.fromTableTechnicalName));
      const toTable = tableIndex.get(this.normalizeSearchText(relationship.toTableTechnicalName));
      const fromColumn = columnIndex.get(
        `${this.normalizeSearchText(relationship.fromTableTechnicalName)}.${this.normalizeSearchText(relationship.fromColumnTechnicalName)}`
      );
      const toColumn = columnIndex.get(
        `${this.normalizeSearchText(relationship.toTableTechnicalName)}.${this.normalizeSearchText(relationship.toColumnTechnicalName)}`
      );
      if (!fromTable || !toTable || !fromColumn || !toColumn) continue;

      await client.query(
        `INSERT INTO app_semantic_relationships
         (id, datasource_id, user_id, from_table_id, from_column_id, to_table_id, to_column_id, join_type, cardinality, confidence)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          this.newId('rel'),
          datasourceId,
          userId,
          fromTable.id,
          fromColumn.column.id,
          toTable.id,
          toColumn.column.id,
          relationship.joinType,
          relationship.cardinality,
          relationship.confidence
        ]
      );
    }
  }

  private normalizeTableProposal(table: Partial<SemanticTableProposal>): SemanticTableProposal {
    return {
      technicalName: String(table.technicalName || '').trim(),
      businessName: String(table.businessName || '').trim(),
      description: String(table.description || '').trim(),
      tableType: this.normalizeTableType(String(table.tableType || 'unknown')),
      confidence: this.clampConfidence(Number(table.confidence || 0.7)),
      source: this.normalizeProposalSource(String(table.source || 'user'))
    };
  }

  public normalizeColumnProposal(column: Partial<SemanticColumnProposal>): SemanticColumnProposal {
    return {
      tableTechnicalName: String(column.tableTechnicalName || '').trim(),
      technicalName: String(column.technicalName || '').trim(),
      businessName: String(column.businessName || '').trim(),
      semanticType: this.normalizeSemanticType(String(column.semanticType || 'unknown')),
      dataType: String(column.dataType || 'unknown').trim(),
      isNullable: column.isNullable ?? true,
      isForeignKey: column.isForeignKey ?? false,
      references: column.references ? { table: String(column.references.table || ''), column: String(column.references.column || '') } : undefined,
      confidence: this.clampConfidence(Number(column.confidence || 0.7)),
      source: this.normalizeProposalSource(String(column.source || 'user')),
      warnings: Array.isArray(column.warnings) ? column.warnings.map(String) : []
    };
  }

  private normalizeKpiProposal(kpi: Partial<SemanticKpiProposal>): SemanticKpiProposal {
    return {
      name: String(kpi.name || '').trim(),
      sqlFormula: String(kpi.sqlFormula || '').trim(),
      description: String(kpi.description || '').trim(),
      formatting: this.normalizeKpiFormatting(String(kpi.formatting || 'number')),
      confidence: this.clampConfidence(Number(kpi.confidence || 0.7)),
      source: ['heuristic', 'ai', 'user'].includes(String(kpi.source)) ? (kpi.source as 'heuristic' | 'ai' | 'user') : 'user'
    };
  }

  private normalizeSynonymProposal(synonym: Partial<SemanticSynonymProposal>): SemanticSynonymProposal {
    return {
      term: String(synonym.term || '').trim(),
      mappedValue: String(synonym.mappedValue || '').trim(),
      confidence: this.clampConfidence(Number(synonym.confidence || 0.7)),
      source: ['heuristic', 'ai', 'user'].includes(String(synonym.source))
        ? (synonym.source as 'heuristic' | 'ai' | 'user')
        : 'user'
    };
  }

  private validateKpiFormula(sqlFormula: string, existingColumns: string[]): { ok: boolean; reason?: string } {
    if (!sqlFormula.trim()) return { ok: false, reason: 'formula is empty' };
    const trimmedFormula = sqlFormula.trim();
    const summedRate = trimmedFormula.match(/\bsum\s*\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\)/i)?.[1];
    if (summedRate && /^taux_/i.test(summedRate)) {
      return { ok: false, reason: `rate column ${summedRate} must not be summed` };
    }
    const allowedColumns = new Set(existingColumns);
    const keywords = new Set([
      'sum',
      'avg',
      'count',
      'distinct',
      'filter',
      'where',
      'true',
      'false',
      'min',
      'max',
      'case',
      'when',
      'then',
      'else',
      'end',
      'nullif',
      'coalesce',
      'round',
      'cast',
      'as',
      'numeric',
      'integer',
      'decimal',
      'float'
    ]);
    const identifiers = sqlFormula.match(/[a-zA-Z_][a-zA-Z0-9_.]*/g) || [];
    const referenced = identifiers
      .map((identifier) => identifier.split('.').pop() || identifier)
      .filter((identifier) => !keywords.has(identifier.toLowerCase()));

    if (!referenced.length && /^count\s*\(\s*\*\s*\)$/i.test(trimmedFormula)) return { ok: true };
    for (const identifier of referenced) {
      if (!allowedColumns.has(identifier)) return { ok: false, reason: `unknown column ${identifier}` };
    }
    return { ok: true };
  }

  private validateKpiBusinessCoherence(name: string, sqlFormula: string): { ok: boolean; reason?: string } {
    const normalizedName = this.normalizeSearchText(name);
    const normalizedFormula = this.normalizeSearchText(sqlFormula);

    if (normalizedName.includes('chiffre d affaires') && normalizedFormula.includes('sum montant brut')) {
      return { ok: false, reason: "chiffre d'affaires must not use montant_brut" };
    }
    if (normalizedName.includes('panier moyen') && normalizedFormula.includes('avg montant brut')) {
      return { ok: false, reason: 'panier moyen must be a sales amount divided by distinct orders, not AVG(montant_brut)' };
    }
    if (normalizedName.includes('marge commerciale') && normalizedFormula.includes('sum taux marge')) {
      return { ok: false, reason: 'margin KPIs must not sum taux_marge' };
    }
    if (normalizedName.includes('prix unitaire') && /\bsum\s*\(/i.test(sqlFormula)) {
      return { ok: false, reason: 'unit price must not be summed' };
    }
    if (/taux[_\s](marge|remise|tva)/i.test(sqlFormula) && /\bsum\s*\(/i.test(sqlFormula)) {
      return { ok: false, reason: 'rate columns must not be summed' };
    }
    return { ok: true };
  }

  private normalizeKpiFormattingForFormula(formatting: string, sqlFormula: string, kpiName = ''): SemanticKpiFormatting {
    const normalizedName = this.normalizeSearchText(kpiName);
    const normalizedFormula = sqlFormula.toLowerCase();
    if (normalizedName.includes('panier moyen')) return 'currency';
    if (/taux_|\/\s*nullif/i.test(normalizedFormula)) return 'percent';
    if (/montant_|cout_|prix_|marge_|valeur_/i.test(normalizedFormula)) return 'currency';
    if (/count\s*\(/i.test(normalizedFormula)) return 'integer';
    return this.normalizeKpiFormatting(formatting);
  }

  private profileColumn(rows: Array<Record<string, unknown>>, columnName: string): ColumnProfile {
    const values = rows.map((row) => row[columnName]);
    const total = Math.max(values.length, 1);
    const present = values.filter((value) => value !== null && value !== undefined && value !== '');
    const nullRatio = Number(((total - present.length) / total).toFixed(3));
    const stringValues = present.map((value) => String(value));
    const distinctValues = new Set(stringValues);
    const frequencies = new Map<string, number>();
    for (const value of stringValues) frequencies.set(value, (frequencies.get(value) || 0) + 1);

    const numericValues = present.map((value) => Number(value)).filter((value) => Number.isFinite(value));
    const dateValues = present.map((value) => Date.parse(String(value))).filter((value) => Number.isFinite(value));
    const profile: ColumnProfile = {
      nullRatio,
      distinctCount: distinctValues.size,
      distinctRatio: Number((distinctValues.size / total).toFixed(3)),
      topValues: Array.from(frequencies.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([value, count]) => ({ value, count })),
      sampleValues: present.slice(0, 3)
    };

    if (numericValues.length) {
      profile.min = Math.min(...numericValues);
      profile.max = Math.max(...numericValues);
      profile.mean = Number((numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length).toFixed(3));
    } else if (dateValues.length) {
      profile.min = new Date(Math.min(...dateValues)).toISOString();
      profile.max = new Date(Math.max(...dateValues)).toISOString();
    }

    if (stringValues.length) {
      profile.averageTextLength = Number(
        (stringValues.reduce((sum, value) => sum + value.length, 0) / stringValues.length).toFixed(2)
      );
    }

    return profile;
  }

  private inferColumnsFromRows(rows: Array<Record<string, unknown>>) {
    const names = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
    return names.map((name) => ({
      name,
      dataType: this.inferValueType(rows.map((row) => row[name])),
      isNullable: rows.some((row) => row[name] === null || row[name] === undefined)
    }));
  }

  private inferValueType(values: unknown[]) {
    const present = values.filter((value) => value !== null && value !== undefined && value !== '');
    if (!present.length) return 'unknown';
    if (present.every((value) => typeof value === 'number' || Number.isFinite(Number(value)))) return 'numeric';
    if (present.every((value) => this.valueLooksLikeDate(value))) return 'date';
    if (present.every((value) => typeof value === 'boolean')) return 'boolean';
    return 'text';
  }

  private readTableTechnicalName(rawTable: unknown) {
    if (typeof rawTable === 'string') return rawTable;
    if (!rawTable || typeof rawTable !== 'object') return '';
    const table = rawTable as Record<string, unknown>;
    return String(table.name || table.qualifiedName || table.tableName || '').trim();
  }

  private readTableSchema(rawTable: unknown, technicalName: string) {
    if (rawTable && typeof rawTable === 'object') {
      const table = rawTable as Record<string, unknown>;
      const explicitSchema = String(table.schema || table.tableSchema || '').trim();
      if (explicitSchema) return explicitSchema;
    }
    const parts = technicalName.split('.');
    return parts.length > 1 ? parts.slice(0, -1).join('.') : 'public';
  }

  private readTableIndexes(rawTable: unknown) {
    if (!rawTable || typeof rawTable !== 'object') return [];
    const table = rawTable as Record<string, unknown>;
    const indexes = Array.isArray(table.indexes) ? table.indexes : Array.isArray(table.indices) ? table.indices : [];
    return indexes
      .map((index) => {
        if (typeof index === 'string') return index;
        if (index && typeof index === 'object') {
          const item = index as Record<string, unknown>;
          return String(item.name || item.indexName || item.column || '').trim();
        }
        return '';
      })
      .filter(Boolean);
  }

  private readMetadataTableType(rawTable: unknown, datasourceType: DatasourceType): MetadataTable['tableType'] {
    if (datasourceType === 'mongodb') return 'collection';
    if (datasourceType === 'csv' || datasourceType === 'excel') return 'file';
    if (!rawTable || typeof rawTable !== 'object') return 'table';
    const type = String((rawTable as Record<string, unknown>).type || 'table');
    return type === 'view' ? 'view' : 'table';
  }

  private normalizeColumnReference(value: unknown): MetadataColumn['references'] | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const ref = value as Record<string, unknown>;
    const table = String(ref.table || '').trim();
    const column = String(ref.column || '').trim();
    return table && column ? { table, column } : undefined;
  }

  public inferSemanticRules(input: { table?: MetadataTable; column?: MetadataColumn | { name: string; dataType?: string; isPrimaryKey?: boolean; isForeignKey?: boolean; references?: MetadataColumn['references'] } }) {
    if (input.table) {
      const tableName = this.unqualifyName(input.table.name).toLowerCase();
      if (/^dim(?:_|$)/i.test(tableName)) return { tableType: 'dimension' as TableType, confidence: 0.96, reason: 'dim_* naming convention' };
      if (/^f(?:_|$)/i.test(tableName) || /^fact(?:_|$)/i.test(tableName)) {
        return { tableType: 'fact' as TableType, confidence: 0.96, reason: 'f_* or fact_* naming convention' };
      }
    }

    if (input.column) {
      const column = input.column;
      const rawName = column.name.toLowerCase();
      const name = this.normalizeSearchText(column.name);
      const sqlType = String(column.dataType || '');
      const numeric = this.isNumericType(sqlType);

      if (/^sk(?:_|$)/i.test(rawName)) return { semanticType: 'identifier' as SemanticType, businessRole: 'foreign_key', confidence: 0.95 };
      if (/^id(?:_|$)/i.test(rawName) || column.isPrimaryKey) {
        return { semanticType: 'identifier' as SemanticType, businessRole: 'identifier', confidence: 0.94 };
      }
      if (column.isForeignKey || column.references) {
        return { semanticType: 'identifier' as SemanticType, businessRole: 'foreign_key', confidence: 0.92 };
      }
      if (this.hasAny(name, ['email', 'telephone', 'phone', 'mobile', 'cin', 'ice'])) {
        return { semanticType: 'dimension' as SemanticType, businessRole: 'sensitive', confidence: 0.92 };
      }
      if (this.hasAny(rawName, ['rupture_stock', 'retard_livraison'])) {
        return { semanticType: 'dimension' as SemanticType, businessRole: 'business_flag', confidence: 0.9 };
      }
      if (/^date(?:_|$)/i.test(rawName) || this.hasAny(name, ['mois', 'trimestre', 'annee', 'semaine annee'])) {
        return { semanticType: 'date' as SemanticType, businessRole: 'time_dimension', confidence: 0.95 };
      }
      if (this.hasAny(name, ['pays', 'region', 'province', 'ville'])) {
        return { semanticType: 'dimension' as SemanticType, businessRole: 'geography_dimension', confidence: 0.9 };
      }
      if (
        numeric &&
        (/^montant(?:_|$)/i.test(rawName) ||
          /^prix(?:_|$)/i.test(rawName) ||
          /^cout(?:_|$)/i.test(rawName) ||
          /^marge(?:_|$)/i.test(rawName) ||
          /^valeur(?:_|$)/i.test(rawName) ||
          rawName === 'quantite' ||
          rawName.includes('quantite_'))
      ) {
        return { semanticType: 'measure' as SemanticType, businessRole: 'measure', confidence: 0.94 };
      }
      if (numeric && /^taux(?:_|$)/i.test(rawName)) {
        return { semanticType: 'measure' as SemanticType, businessRole: 'percentage_measure', confidence: 0.93 };
      }
      if (numeric && /^note(?:_|$)/i.test(rawName)) {
        return { semanticType: 'measure' as SemanticType, businessRole: 'score_measure', confidence: 0.91 };
      }
    }

    return undefined;
  }

  private inferColumnBusinessRole(
    columnName: string,
    dataType: string,
    flags: { isPrimaryKey?: boolean; isForeignKey?: boolean; references?: MetadataColumn['references'] } = {}
  ) {
    return this.inferSemanticRules({
      column: {
        name: columnName,
        dataType,
        isPrimaryKey: flags.isPrimaryKey,
        isForeignKey: flags.isForeignKey,
        references: flags.references
      }
    })?.businessRole || 'unknown';
  }

  private inferTableRoleFromProfile(table: MetadataTable): TableType {
    const rule = this.inferSemanticRules({ table });
    if (rule?.tableType) return rule.tableType;
    const measureCount = table.columns.filter((column) => this.inferSemanticRules({ column })?.semanticType === 'measure').length;
    const keyCount = table.columns.filter((column) => column.isForeignKey || this.isLikelyKeyColumn(column.name)).length;
    if (measureCount > 0 && keyCount >= 1) return 'fact';
    if (table.primaryKeys.length && measureCount === 0) return 'dimension';
    return 'unknown';
  }

  private normalizeSemanticType(value: string): SemanticType {
    const normalized = this.normalizeSearchText(value).replace(/\s+/g, '_');
    const aliases: Record<string, SemanticType> = {
      id: 'identifier',
      key: 'identifier',
      primary_key: 'identifier',
      foreign_key: 'identifier',
      category: 'dimension',
      label: 'dimension',
      name: 'dimension',
      text: 'attribute',
      description: 'attribute',
      amount: 'measure',
      metric: 'measure',
      number: 'measure',
      datetime: 'date',
      timestamp: 'technical_date',
      technical_timestamp: 'technical_date',
      flag: 'boolean_flag',
      boolean: 'boolean_flag',
      bool: 'boolean_flag',
      pii: 'sensitive',
      personal_data: 'sensitive',
      private: 'sensitive'
    };
    const candidate = aliases[normalized] || normalized;
    return [
      'identifier',
      'dimension',
      'measure',
      'attribute',
      'date',
      'technical_date',
      'boolean_flag',
      'sensitive',
      'unknown'
    ].includes(candidate)
      ? (candidate as SemanticType)
      : 'unknown';
  }

  private normalizeTableType(value: string): TableType {
    return ['fact', 'dimension', 'unknown'].includes(value) ? (value as TableType) : 'unknown';
  }

  private normalizeProposalSource(value: string): SemanticProposalSource {
    return ['metadata', 'heuristic', 'ai', 'user'].includes(value) ? (value as SemanticProposalSource) : 'user';
  }

  private normalizeKpiFormatting(value: string): SemanticKpiFormatting {
    return ['currency', 'number', 'percent', 'integer'].includes(value)
      ? (value as SemanticKpiFormatting)
      : 'number';
  }

  private clampConfidence(value: number) {
    if (!Number.isFinite(value)) return 0.5;
    return Number(Math.max(0, Math.min(1, value)).toFixed(2));
  }

  private isNumericType(dataType: string) {
    return /int|numeric|decimal|double|real|float|money|serial|number/i.test(dataType);
  }

  private isAnalyticalNumericCandidate(column: Pick<SemanticColumnLike, 'technicalName' | 'semanticType' | 'dataType'>) {
    return (
      !['identifier', 'sensitive', 'technical_date', 'boolean_flag', 'unknown'].includes(column.semanticType) &&
      !this.isLikelyKeyColumn(column.technicalName)
    );
  }

  private isDateType(dataType: string) {
    return /date|time|timestamp/i.test(dataType);
  }

  private isTextType(dataType: string) {
    return /char|text|string|varchar|uuid|enum|json/i.test(dataType);
  }

  private valuesLookLikeDates(values: unknown[]) {
    const present = values.filter((value) => value !== null && value !== undefined && value !== '');
    if (!present.length) return false;
    return present.filter((value) => this.valueLooksLikeDate(value)).length / present.length >= 0.8;
  }

  private valueLooksLikeDate(value: unknown) {
    if (value instanceof Date) return true;
    if (typeof value !== 'string') return false;
    if (!/\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/.test(value)) return false;
    return Number.isFinite(Date.parse(value));
  }

  private hasAny(value: string, needles: string[]) {
    return needles.some((needle) => value.includes(needle));
  }

  public unqualifyName(name: string) {
    return name.split('.').pop() || name;
  }

  public unquoteSqlIdentifier(name: string) {
    return name.replace(/^"+|"+$/g, '').replace(/""/g, '"').trim();
  }

  public toBusinessName(name: string) {
    return name
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (match) => match.toUpperCase());
  }

  private normalizeSemanticLayerLanguage(value: unknown): SemanticLayerLanguage {
    const normalized = String(value || process.env.DEFAULT_SEMANTIC_LAYER_LANGUAGE || 'en').toLowerCase();
    if (normalized.startsWith('fr')) return 'fr';
    if (normalized.startsWith('ar')) return 'ar';
    return 'en';
  }

  private normalizeBusinessSector(value: unknown): SemanticBusinessSector {
    const normalized = String(value || process.env.DEFAULT_SEMANTIC_BUSINESS_SECTOR || 'sales_distribution')
      .trim()
      .toLowerCase();
    return Object.prototype.hasOwnProperty.call(BUSINESS_SECTOR_PROFILES, normalized)
      ? (normalized as SemanticBusinessSector)
      : 'sales_distribution';
  }

  private getBusinessSectorProfile(businessSector: SemanticBusinessSector) {
    return BUSINESS_SECTOR_PROFILES[businessSector] || BUSINESS_SECTOR_PROFILES.sales_distribution;
  }

  private buildBusinessSectorPromptContext(profile: BusinessSectorProfile) {
    return {
      code: profile.code,
      subject: profile.label,
      description: profile.description,
      kpiRules: profile.metricAliases
        .map((alias) => `${alias.keywords.join('/')} => SUM: ${alias.totalName}, AVG: ${alias.averageName}`)
        .join('; '),
      synonymHints: Object.entries(profile.synonyms)
        .map(([concept, terms]) => `${concept}: ${terms.join(', ')}`)
        .join('; ')
    };
  }

  private findBusinessMetricAlias(column: SemanticColumnProposal, businessSector: SemanticBusinessSector) {
    const normalized = this.normalizeSearchText(`${column.technicalName} ${column.businessName}`);
    return this
      .getBusinessSectorProfile(businessSector)
      .metricAliases.find((alias) => alias.keywords.some((keyword) => normalized.includes(this.normalizeSearchText(keyword))));
  }

  private semanticLanguageName(language: SemanticLayerLanguage) {
    if (language === 'fr') return 'French';
    if (language === 'ar') return 'Arabic';
    return 'English';
  }

  private toLocalizedBusinessName(name: string, language: SemanticLayerLanguage, semanticType?: SemanticType) {
    const english = this.toBusinessName(this.unqualifyName(name));
    const normalized = this.normalizeSearchText(name);
    const exactMeasureName = semanticType === 'measure' ? this.exactMeasureBusinessName(normalized, language) : '';
    if (exactMeasureName) return exactMeasureName;

    if (language === 'en') return english;

    const special = this.localizedBusinessSpecialCase(normalized, language, semanticType);
    if (special) return special;

    const dictionary = this.localizedBusinessDictionary(language);
    const translated = english
      .split(' ')
      .map((word) => dictionary[this.normalizeSearchText(word)] || word)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    return translated || english;
  }

  private exactMeasureBusinessName(normalizedName: string, language: SemanticLayerLanguage) {
    const frenchNames: Record<string, string> = {
      'montant total': "Chiffre d'affaires",
      'montant net': "Chiffre d'affaires net",
      'montant brut': 'Montant brut',
      'montant remise': 'Remise totale',
      'montant tva': 'TVA',
      'marge brute': 'Marge brute',
      'taux marge': 'Taux de marge',
      'cout achat total': "Cout d'achat total",
      'cout livraison': 'Cout de livraison',
      quantite: 'Quantite vendue',
      'prix unitaire': 'Prix unitaire',
      'valeur stock': 'Valeur du stock',
      'quantite stock': 'Stock disponible',
      'note satisfaction': 'Satisfaction moyenne',
      'delai reponse heures': 'Delai moyen de reponse'
    };

    if (language === 'fr') return frenchNames[normalizedName] || '';
    if (language === 'ar') return '';
    return this.toBusinessName(normalizedName);
  }

  private localizedBusinessSpecialCase(
    normalizedName: string,
    language: SemanticLayerLanguage,
    semanticType?: SemanticType
  ) {
    const revenueLike =
      semanticType === 'measure' &&
      this.hasAny(normalizedName, ['amount', 'total', 'revenue', 'sales', 'price', 'margin']);
    if (!revenueLike) return '';

    if (language === 'fr') return "Chiffre d'affaires";
    if (language === 'ar') return 'الإيرادات';
    return '';
  }

  private localizedBusinessDictionary(language: SemanticLayerLanguage): Record<string, string> {
    if (language === 'fr') {
      return {
        order: 'Commande',
        orders: 'Commandes',
        customer: 'Client',
        customers: 'Clients',
        product: 'Produit',
        products: 'Produits',
        payment: 'Paiement',
        payments: 'Paiements',
        payment_method: 'Mode de paiement',
        payment_methods: 'Modes de paiement',
        invoice: 'Facture',
        invoices: 'Factures',
        transaction: 'Transaction',
        transactions: 'Transactions',
        user: 'Utilisateur',
        users: 'Utilisateurs',
        employee: 'Employe',
        employees: 'Employes',
        supplier: 'Fournisseur',
        suppliers: 'Fournisseurs',
        date: 'Date',
        created: 'Creation',
        updated: 'Mise a jour',
        amount: 'Montant',
        total: 'Total',
        price: 'Prix',
        quantity: 'Quantite',
        qty: 'Quantite',
        status: 'Statut',
        category: 'Categorie',
        region: 'Region',
        country: 'Pays',
        city: 'Ville',
        channel: 'Canal',
        segment: 'Segment',
        label: 'Libelle',
        title: 'Titre',
        display: 'Affichage',
        name: 'Nom',
        description: 'Description',
        type: 'Type',
        count: 'Nombre',
        average: 'Moyenne',
        number: 'Nombre'
      };
    }

    if (language === 'ar') {
      return {
        order: 'طلب',
        orders: 'الطلبات',
        customer: 'عميل',
        customers: 'العملاء',
        product: 'منتج',
        products: 'المنتجات',
        payment: 'دفعة',
        payments: 'الدفعات',
        invoice: 'فاتورة',
        invoices: 'الفواتير',
        transaction: 'معاملة',
        transactions: 'المعاملات',
        user: 'مستخدم',
        users: 'المستخدمون',
        employee: 'موظف',
        employees: 'الموظفون',
        supplier: 'مورد',
        suppliers: 'الموردون',
        date: 'التاريخ',
        created: 'الإنشاء',
        updated: 'التحديث',
        amount: 'المبلغ',
        total: 'الإجمالي',
        price: 'السعر',
        quantity: 'الكمية',
        qty: 'الكمية',
        status: 'الحالة',
        category: 'الفئة',
        region: 'المنطقة',
        country: 'البلد',
        city: 'المدينة',
        channel: 'القناة',
        segment: 'الشريحة',
        label: 'التسمية',
        title: 'العنوان',
        display: 'العرض',
        name: 'الاسم',
        description: 'الوصف',
        type: 'النوع',
        count: 'العدد',
        average: 'المتوسط',
        number: 'عدد'
      };
    }

    return {};
  }

  private buildLocalizedTableDescription(
    technicalName: string,
    tableType: TableType,
    language: SemanticLayerLanguage,
    labelColumn?: SemanticColumnLike,
    joinKeyColumns: SemanticColumnProposal[] = [],
    columns: SemanticColumnLike[] = []
  ) {
    const businessName = this.toLocalizedBusinessName(this.unqualifyName(technicalName), language);
    const subject = this.buildBusinessTableSubject(businessName, language);
    const labelDescription = labelColumn ? this.describeSemanticColumn(labelColumn) : '';
    const joinKeyDescription = joinKeyColumns.length ? joinKeyColumns.map((column) => this.describeSemanticColumn(column)).join(', ') : '';
    const measureDescription = columns
      .filter((column) => column.semanticType === 'measure')
      .slice(0, 3)
      .map((column) => this.describeSemanticColumn(column))
      .join(', ');
    const dateDescription = columns
      .filter((column) => column.semanticType === 'date')
      .slice(0, 2)
      .map((column) => this.describeSemanticColumn(column))
      .join(', ');
    if (language === 'fr') {
      const pieces =
        tableType === 'fact'
          ? [`Suivi metier ${subject} utilise pour mesurer l'activite et calculer les indicateurs analytiques.`]
          : tableType === 'dimension'
            ? [`Referentiel metier ${subject} utilise pour qualifier, segmenter et filtrer les analyses.`]
            : [`Vue metier ${subject} utilisee pour explorer et analyser les donnees disponibles.`];
      if (tableType === 'dimension' && labelDescription) {
        pieces.push(`Champ libelle principal: ${labelDescription}, utile pour afficher les resultats avec un intitule lisible.`);
      }
      if (tableType === 'fact' && joinKeyDescription) {
        pieces.push(`Cles de jointure principales: ${joinKeyDescription}.`);
      }
      if (tableType === 'fact' && measureDescription) {
        pieces.push(`Mesures disponibles: ${measureDescription}.`);
      }
      if (dateDescription) {
        pieces.push(`Analyse temporelle possible via ${dateDescription}.`);
      }
      return pieces.join(' ');
    }
    if (language === 'ar') {
      const pieces =
        tableType === 'fact'
          ? [`متابعة أعمال ${subject} لقياس النشاط وحساب المؤشرات التحليلية.`]
          : tableType === 'dimension'
            ? [`مرجع أعمال ${subject} لتوصيف التحليلات وتقسيمها وتصفيتها.`]
            : [`عرض أعمال ${subject} لاستكشاف البيانات المتاحة وتحليلها.`];
      if (tableType === 'dimension' && labelDescription) {
        pieces.push(`حقل التسمية الرئيسي: ${labelDescription} لاستخدامه في عرض النتائج بتسمية مفهومة.`);
      }
      if (tableType === 'fact' && joinKeyDescription) {
        pieces.push(`حقول الربط الرئيسية: ${joinKeyDescription}.`);
      }
      if (tableType === 'fact' && measureDescription) {
        pieces.push(`المقاييس المتاحة: ${measureDescription}.`);
      }
      if (dateDescription) {
        pieces.push(`يمكن إجراء التحليل الزمني عبر ${dateDescription}.`);
      }
      return pieces.join(' ');
    }
    const pieces =
      tableType === 'fact'
        ? [`Business activity tracking for ${subject}, used to measure performance and calculate analytical indicators.`]
        : tableType === 'dimension'
          ? [`Business reference for ${subject}, used to qualify, segment, and filter analytics.`]
          : [`Business view for ${subject}, used to explore and analyze available data.`];
    if (tableType === 'dimension' && labelDescription) {
      pieces.push(`Primary label field: ${labelDescription}, useful for displaying readable result labels.`);
    }
    if (tableType === 'fact' && joinKeyDescription) {
      pieces.push(`Primary join keys: ${joinKeyDescription}.`);
    }
    if (tableType === 'fact' && measureDescription) {
      pieces.push(`Available measures: ${measureDescription}.`);
    }
    if (dateDescription) {
      pieces.push(`Time analysis is available through ${dateDescription}.`);
    }
    return pieces.join(' ');
  }

  private buildBusinessTableSubject(businessName: string, language: SemanticLayerLanguage) {
    const subject = businessName
      .replace(/^(fact|dim|dimension|f|d)\s+/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    const cleanSubject = subject || businessName.trim() || 'donnees';
    if (language === 'fr') return `des ${this.pluralizeFrenchSubject(this.lowercaseFirst(cleanSubject))}`;
    if (language === 'ar') return cleanSubject;
    return this.lowercaseFirst(cleanSubject);
  }

  private lowercaseFirst(value: string) {
    return value ? `${value.charAt(0).toLocaleLowerCase()}${value.slice(1)}` : value;
  }

  private pluralizeFrenchSubject(value: string) {
    const trimmed = value.trim();
    if (!trimmed || /s$|x$/i.test(trimmed)) return trimmed;
    return `${trimmed}s`;
  }

  private localizedKpiName(kind: 'total' | 'average' | 'count', metricName: string, language: SemanticLayerLanguage) {
    if (language === 'fr') {
      if (kind === 'total') return `${metricName} total`;
      if (kind === 'average') return `${metricName} moyen`;
      return `Nombre de ${metricName}`;
    }
    if (language === 'ar') {
      if (kind === 'total') return `إجمالي ${metricName}`;
      if (kind === 'average') return `متوسط ${metricName}`;
      return `عدد ${metricName}`;
    }
    if (kind === 'total') return `Total ${metricName}`;
    if (kind === 'average') return `Average ${metricName}`;
    return `Number of ${metricName}`;
  }

  private localizedKpiDescription(
    kind: 'total' | 'average',
    metricName: string,
    tableTechnicalName: string,
    language: SemanticLayerLanguage
  ) {
    if (language === 'fr') {
      return `${kind === 'total' ? 'Total' : 'Moyenne'} de ${metricName} calcule depuis ${tableTechnicalName}.`;
    }
    if (language === 'ar') {
      return `${kind === 'total' ? 'إجمالي' : 'متوسط'} ${metricName} محسوب من ${tableTechnicalName}.`;
    }
    return `${kind === 'total' ? 'Total' : 'Average'} ${metricName.toLowerCase()} calculated from ${tableTechnicalName}.`;
  }

  private localizedRecordsName(language: SemanticLayerLanguage) {
    if (language === 'fr') return 'lignes';
    if (language === 'ar') return 'السجلات';
    return 'Records';
  }

  private localizedCountDescription(tableBusinessName: string, language: SemanticLayerLanguage) {
    if (language === 'fr') return `Nombre de lignes dans ${tableBusinessName}.`;
    if (language === 'ar') return `عدد السجلات في ${tableBusinessName}.`;
    return `Number of records in ${tableBusinessName}.`;
  }

  public findDimensionLabelColumn(columns: SemanticColumnLike[]) {
    const candidates = columns.filter(
      (column) =>
        column.semanticType === 'dimension' &&
        !this.isLikelyKeyColumn(column.technicalName) &&
        !this.isDateType(column.dataType) &&
        !this.isNumericType(column.dataType)
    );

    if (!candidates.length) return undefined;

    return candidates
      .map((column) => ({ column, score: this.semanticLabelScore(column) }))
      .sort((left, right) => right.score - left.score)[0]?.column;
  }

  private findJoinKeyColumns(table: MetadataTable, columns: SemanticColumnProposal[]) {
    return table.columns
      .filter(
        (column) =>
          !column.isPrimaryKey &&
          (column.isForeignKey || Boolean(column.references) || (this.isLikelyKeyColumn(column.name) && column.name.toLowerCase() !== 'id'))
      )
      .map((column) => columns.find((proposal) => proposal.technicalName === column.name))
      .filter((column): column is SemanticColumnProposal => Boolean(column))
      .filter((column) => column.semanticType === 'identifier')
      .slice(0, 3);
  }

  private semanticLabelScore(column: SemanticColumnLike) {
    const normalized = this.normalizeSearchText(`${column.technicalName} ${column.businessName}`);
    let score = 0;

    if (this.hasAny(normalized, ['label', 'title', 'display', 'description', 'designation'])) score += 5;
    if (this.hasAny(normalized, ['name', 'nom', 'libelle'])) score += 4;
    if (this.hasAny(normalized, ['full name', 'first name', 'last name', 'customer name', 'product name', 'category name'])) {
      score += 4;
    }
    if (this.isTextType(column.dataType)) score += 2;

    return score;
  }

  private isLikelyLabelColumn(name: string) {
    const normalized = this.normalizeSearchText(name);
    return this.hasAny(normalized, [
      'label',
      'title',
      'display',
      'description',
      'designation',
      'name',
      'nom',
      'libelle',
      'full name',
      'first name',
      'last name',
      'customer name',
      'product name',
      'category name'
    ]);
  }

  private isLikelyKeyColumn(name: string) {
    const normalized = this.normalizeSearchText(name);
    return /(^| )id($| )|(^| )key($| )|(^| )ref($| )|(^| )code($| )|(^| )uuid($| )|(^| )guid($| )|_id$|_key$|_ref$|_code$|uuid|guid/i.test(
      normalized
    );
  }

  private describeSemanticColumn(column: SemanticColumnLike) {
    const businessName = column.businessName.trim() || column.technicalName;
    if (businessName.toLowerCase() === column.technicalName.toLowerCase()) {
      return column.technicalName;
    }
    return `${businessName} (${column.technicalName})`;
  }

  private asRecordArray(value: unknown): Array<Record<string, unknown>> {
    return Array.isArray(value)
      ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      : [];
  }

  private chunkArray<T>(items: T[], size: number): T[][] {
    const chunkSize = Math.max(1, size);
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += chunkSize) {
      chunks.push(items.slice(index, index + chunkSize));
    }
    return chunks;
  }


  public inferSemanticRelationships(layer: SemanticLayerResponse): SemanticRelationship[] {
    if (layer.relationships?.length) {
      return layer.relationships;
    }

    const relationships: SemanticRelationship[] = [];
    const seen = new Set<string>();
    const dimensionTables = layer.tables.filter(
      (table) => table.tableType === 'dimension' || table.columns.some((column) => column.semanticType === 'dimension')
    );

    for (const sourceTable of layer.tables) {
      const sourceTableKey = this.semanticTableMatchKey(sourceTable.technicalName);
      if (!sourceTableKey) continue;
      for (const sourceColumn of sourceTable.columns) {
        const explicitRelationship = this.resolveExplicitSemanticRelationship(layer, sourceTable, sourceColumn);
        if (explicitRelationship) {
          const explicitKey = `${explicitRelationship.fromTableTechnicalName}.${explicitRelationship.fromColumnTechnicalName}->${explicitRelationship.toTableTechnicalName}.${explicitRelationship.toColumnTechnicalName}`;
          if (!seen.has(explicitKey)) {
            seen.add(explicitKey);
            relationships.push(explicitRelationship);
          }
          continue;
        }

        if (!this.isLikelyJoinSourceColumn(sourceColumn, sourceTable)) continue;

        const base = this.semanticRelationshipBase(sourceColumn.technicalName);
        if (!base || base === sourceTableKey) continue;

        const candidates = dimensionTables
          .filter((targetTable) => targetTable.technicalName !== sourceTable.technicalName)
          .map((targetTable) => {
            const targetKey = this.semanticTableMatchKey(targetTable.technicalName);
            const targetJoinColumn = this.findSemanticTargetJoinColumn(targetTable);
            if (!targetKey || !targetJoinColumn) {
              return { targetTable, targetJoinColumn, score: 0 };
            }

            let score = 0;
            if (targetKey === base) score += 6;
            if (targetKey === `${base}s` || targetKey === `${base}es`) score += 5;
            if (base === targetKey.replace(/s$/, '')) score += 5;
            if (this.normalizeSearchText(targetTable.businessName).includes(this.normalizeSearchText(base))) score += 3;
            if (this.normalizeSearchText(base).includes(this.normalizeSearchText(targetTable.businessName))) score += 2;
            if (targetTable.tableType === 'dimension') score += 2;
            if (this.findDimensionLabelColumn(targetTable.columns)) score += 1;

            return { targetTable, targetJoinColumn, score };
          })
          .filter((item) => item.score >= 6)
          .sort((a, b) => b.score - a.score);

        const best = candidates[0];
        if (!best || !best.targetJoinColumn) continue;

        const key = `${sourceTable.technicalName}.${sourceColumn.technicalName}->${best.targetTable.technicalName}.${best.targetJoinColumn.technicalName}`;
        if (seen.has(key)) continue;
        seen.add(key);
        relationships.push({
          fromTableTechnicalName: sourceTable.technicalName,
          fromColumnTechnicalName: sourceColumn.technicalName,
          toTableTechnicalName: best.targetTable.technicalName,
          toColumnTechnicalName: best.targetJoinColumn.technicalName,
          joinType: 'inner',
          cardinality: 'n:1',
          confidence: this.clampConfidence(best.score / 10)
        });
      }
    }

    return relationships;
  }

  public resolveExplicitSemanticRelationship(
    layer: SemanticLayerResponse,
    sourceTable: SemanticTable,
    sourceColumn: SemanticColumnLike
  ): SemanticRelationship | undefined {
    if (!sourceColumn.isForeignKey && !sourceColumn.references) return undefined;

    const referenceTable = String(sourceColumn.references?.table || '').trim();
    const referenceColumn = String(sourceColumn.references?.column || '').trim();
    if (!referenceTable) return undefined;

    const targetTable = this.findSemanticTableByReference(layer, referenceTable);
    if (!targetTable) return undefined;

    const targetColumn =
      (referenceColumn && this.findSemanticColumnByReference(targetTable, referenceColumn)) || this.findSemanticTargetJoinColumn(targetTable);
    if (!targetColumn) return undefined;

    return {
      fromTableTechnicalName: sourceTable.technicalName,
      fromColumnTechnicalName: sourceColumn.technicalName,
      toTableTechnicalName: targetTable.technicalName,
      toColumnTechnicalName: targetColumn.technicalName,
      joinType: 'inner',
      cardinality: 'n:1',
      confidence: this.clampConfidence(sourceColumn.references ? 0.98 : 0.92)
    };
  }

  private findSemanticTableByReference(layer: SemanticLayerResponse, referenceTable: string) {
    const normalizedReference = this.normalizeSearchText(referenceTable);
    const referenceKey = this.semanticTableMatchKey(referenceTable);
    return layer.tables.find(
      (table) =>
        this.normalizeSearchText(table.technicalName) === normalizedReference ||
        this.normalizeSearchText(this.unqualifyName(table.technicalName)) === normalizedReference ||
        this.semanticTableMatchKey(table.technicalName) === referenceKey
    );
  }

  private findSemanticColumnByReference(table: SemanticTable, referenceColumn: string) {
    const normalizedReference = this.normalizeSearchText(referenceColumn);
    return table.columns.find(
      (column) =>
        this.normalizeSearchText(column.technicalName) === normalizedReference ||
        this.normalizeSearchText(this.unqualifyName(column.technicalName)) === normalizedReference
    );
  }

  private semanticTableMatchKey(name: string) {
    return this.normalizeSearchText(this.unqualifyName(name))
      .replace(/^(app|fact|dim)\s+/g, '')
      .replace(/\b(table|master|dimension|dim|data|lookup|ref)\b/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .replace(/ies$/, 'y')
      .replace(/s$/, '');
  }

  private semanticRelationshipBase(name: string) {
    return this.normalizeSearchText(this.unqualifyName(name))
      .replace(/\b(fk|ref|reference|foreign key)\b/g, '')
      .replace(/\b(id|key|code)\b$/g, '')
      .replace(/^(id|key|code)\s+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private isLikelyJoinSourceColumn(column: SemanticColumnLike, table: SemanticTable) {
    const name = this.normalizeSearchText(column.technicalName);
    const base = this.semanticRelationshipBase(column.technicalName);
    const tableKey = this.semanticTableMatchKey(table.technicalName);
    if (!base) return false;
    if (column.semanticType !== 'identifier' && !this.isLikelyKeyColumn(column.technicalName)) return false;
    if (name === 'id' || base === tableKey) return false;
    return true;
  }

  private findSemanticTargetJoinColumn(table: SemanticTable) {
    return (
      table.columns.find((column) => this.normalizeSearchText(column.technicalName) === 'id') ||
      table.columns.find((column) => this.semanticRelationshipBase(column.technicalName) === this.semanticTableMatchKey(table.technicalName)) ||
      table.columns.find((column) => column.semanticType === 'identifier') ||
      table.columns[0]
    );
  }

}
