import { SemanticModelingService } from '../src/semantic-layer/semantic-modeling.service';
import { DatabaseService } from '../src/common/database/database.service';
import { DatasourceManagerService } from '../src/datasources/datasource-manager.service';
import { SemanticVectorService } from '../src/semantic-layer/semantic-vector.service';
import { DatasourceCryptoService } from '../src/common/crypto/datasource-crypto.service';
import { DatasourceConnectionService } from '../src/datasources/datasource-connection.service';
import type { AuthUser } from '../src/auth/auth.service';
import type { MetadataTable, SemanticLayerResponse } from '../src/semantic-layer/semantic.types';

describe('SemanticModelingService (Unit Tests)', () => {
  let modelingService: SemanticModelingService;
  let mockDatabase: DatabaseService;
  let datasourceManager: DatasourceManagerService;
  let semanticVector: SemanticVectorService;

  const mockUser: AuthUser = {
    id: 'usr_test_analyst',
    email: 'analyst@askme.ai',
    fullName: 'Test Analyst',
    role: 'Analyst'
  };

  beforeEach(() => {
    mockDatabase = {
      dbReady: false,
      pool: null,
      semanticVectorReady: false,
      query: jest.fn()
    } as unknown as DatabaseService;

    const cryptoService = new DatasourceCryptoService();
    const connectionService = new DatasourceConnectionService();
    datasourceManager = new DatasourceManagerService(mockDatabase, cryptoService, connectionService);
    semanticVector = new SemanticVectorService(mockDatabase);

    modelingService = new SemanticModelingService(mockDatabase, datasourceManager, semanticVector);
  });

  it('should normalize column proposals and rigorously preserve foreign keys and references', () => {
    const rawColumn = {
      tableTechnicalName: 'f_ventes',
      technicalName: 'id_client',
      businessName: 'Identifiant Client',
      semanticType: 'identifier' as const,
      dataType: 'integer',
      isNullable: false,
      isForeignKey: true,
      references: {
        table: 'dim_client',
        column: 'id'
      },
      confidence: 0.95,
      source: 'heuristic' as const
    };

    const normalized = modelingService.normalizeColumnProposal(rawColumn);

    expect(normalized.isForeignKey).toBe(true);
    expect(normalized.references).toBeDefined();
    expect(normalized.references?.table).toBe('dim_client');
    expect(normalized.references?.column).toBe('id');
  });

  it('should build heuristic semantic proposal with facts, dimensions, and KPIs', () => {
    const metadata: MetadataTable[] = [
      {
        name: 'f_ventes',
        schema: 'public',
        tableType: 'table',
        rowCount: 10000,
        primaryKeys: ['id_vente'],
        foreignKeys: [
          {
            column: 'id_client',
            references: { table: 'dim_client', column: 'id' }
          }
        ],
        indexes: ['idx_f_ventes_date'],
        inferredTableRole: 'fact',
        columns: [
          {
            name: 'id_vente',
            dataType: 'integer',
            isNullable: false,
            isPrimaryKey: true,
            isForeignKey: false,
            inferredBusinessRole: 'identifier',
            profile: {
              nullRatio: 0,
              distinctCount: 10000,
              distinctRatio: 1,
              topValues: [],
              sampleValues: [1, 2, 3]
            }
          },
          {
            name: 'montant_total',
            dataType: 'numeric',
            isNullable: false,
            isPrimaryKey: false,
            isForeignKey: false,
            inferredBusinessRole: 'measure',
            profile: {
              nullRatio: 0,
              distinctCount: 3400,
              distinctRatio: 0.34,
              min: 10,
              max: 5000,
              mean: 250,
              topValues: [],
              sampleValues: [150.5, 300]
            }
          },
          {
            name: 'id_client',
            dataType: 'integer',
            isNullable: false,
            isPrimaryKey: false,
            isForeignKey: true,
            inferredBusinessRole: 'identifier',
            references: { table: 'dim_client', column: 'id' },
            profile: {
              nullRatio: 0,
              distinctCount: 500,
              distinctRatio: 0.05,
              topValues: [],
              sampleValues: [10, 20]
            }
          }
        ],
        sampleRows: []
      },
      {
        name: 'dim_client',
        schema: 'public',
        tableType: 'table',
        rowCount: 500,
        primaryKeys: ['id'],
        foreignKeys: [],
        indexes: [],
        inferredTableRole: 'dimension',
        columns: [
          {
            name: 'id',
            dataType: 'integer',
            isNullable: false,
            isPrimaryKey: true,
            isForeignKey: false,
            inferredBusinessRole: 'identifier',
            profile: {
              nullRatio: 0,
              distinctCount: 500,
              distinctRatio: 1,
              topValues: [],
              sampleValues: [1, 2]
            }
          },
          {
            name: 'nom_client',
            dataType: 'varchar',
            isNullable: false,
            isPrimaryKey: false,
            isForeignKey: false,
            inferredBusinessRole: 'dimension',
            profile: {
              nullRatio: 0,
              distinctCount: 500,
              distinctRatio: 1,
              topValues: [],
              sampleValues: ['Acme Corp', 'Global Logistics']
            }
          }
        ],
        sampleRows: []
      }
    ];

    const proposal = modelingService.buildHeuristicSemanticProposal(
      'ds_dw_01',
      metadata,
      'fr',
      'sales_distribution'
    );

    expect(proposal.datasourceId).toBe('ds_dw_01');
    expect(proposal.tables.length).toBe(2);
    expect(proposal.columns.length).toBe(5);

    // Verify foreign key in proposal columns
    const fkCol = proposal.columns.find((c) => c.technicalName === 'id_client');
    expect(fkCol).toBeDefined();
    expect(fkCol?.isForeignKey).toBe(true);
    expect(fkCol?.references?.table).toBe('dim_client');

    // Verify generated KPIs
    expect(proposal.kpis.length).toBeGreaterThan(0);
    const revenueKpi = proposal.kpis.find((k) => k.name.toLowerCase().includes('affaires') || k.sqlFormula.includes('montant_total'));
    expect(revenueKpi).toBeDefined();
  });

  it('should infer explicit relationships between fact and dimension tables', () => {
    const layer: SemanticLayerResponse = {
      tables: [
        {
          id: 'stb_1',
          technicalName: 'f_ventes',
          businessName: 'Ventes',
          description: 'Table des ventes',
          tableType: 'fact',
          columns: [
            {
              id: 'scl_1',
              technicalName: 'id_client',
              businessName: 'Client ID',
              semanticType: 'identifier',
              dataType: 'integer',
              isNullable: false,
              isForeignKey: true,
              references: {
                table: 'dim_client',
                column: 'id'
              }
            }
          ]
        },
        {
          id: 'stb_2',
          technicalName: 'dim_client',
          businessName: 'Clients',
          description: 'Table des clients',
          tableType: 'dimension',
          columns: [
            {
              id: 'scl_2',
              technicalName: 'id',
              businessName: 'Identifiant',
              semanticType: 'identifier',
              dataType: 'integer',
              isNullable: false
            }
          ]
        }
      ],
      kpis: [],
      synonyms: []
    };

    const relationships = modelingService.inferSemanticRelationships(layer);

    expect(relationships.length).toBe(1);
    expect(relationships[0].fromTableTechnicalName).toBe('f_ventes');
    expect(relationships[0].fromColumnTechnicalName).toBe('id_client');
    expect(relationships[0].toTableTechnicalName).toBe('dim_client');
    expect(relationships[0].toColumnTechnicalName).toBe('id');
    expect(relationships[0].cardinality).toBe('n:1');
  });

  it('should save and retrieve semantic layer in-memory when DB is not ready', async () => {
    datasourceManager.inMemoryDatasources.push({
      id: 'ds_test_1',
      name: 'Test DS',
      type: 'postgresql',
      userId: mockUser.id,
      encryptedCredentials: '',
      connectionConfig: {},
      createdAt: new Date().toISOString()
    });

    const saved = await modelingService.saveSemanticLayer(mockUser, 'ds_test_1', {
      tables: [
        {
          technicalName: 'produits',
          businessName: 'Catalogue Produits',
          description: 'Liste des produits',
          tableType: 'dimension',
          confidence: 0.9,
          source: 'heuristic'
        }
      ],
      columns: [
        {
          tableTechnicalName: 'produits',
          technicalName: 'prix_unitaire',
          businessName: 'Prix Unitaire',
          semanticType: 'measure',
          dataType: 'numeric',
          isNullable: false,
          confidence: 0.95,
          source: 'heuristic'
        }
      ],
      kpis: [
        {
          name: 'Prix Moyen',
          sqlFormula: 'AVG(prix_unitaire)',
          description: 'Prix moyen des articles',
          formatting: 'currency',
          confidence: 0.9,
          source: 'heuristic'
        }
      ],
      synonyms: [
        {
          term: 'tarif',
          mappedValue: 'prix_unitaire',
          confidence: 0.9,
          source: 'heuristic'
        }
      ]
    });

    expect(saved.tables.length).toBe(1);
    expect(saved.tables[0].businessName).toBe('Catalogue Produits');
    expect(saved.kpis.length).toBe(1);

    const retrieved = await modelingService.getSemanticLayer(mockUser, 'ds_test_1');
    expect(retrieved.tables.length).toBe(1);
    expect(retrieved.tables[0].technicalName).toBe('produits');
    expect(retrieved.kpis[0].name).toBe('Prix Moyen');
  });
});
