import { TextToSqlGeneratorService } from '../src/copilot/text-to-sql-generator.service';
import { DatabaseService } from '../src/common/database/database.service';
import { DatasourceManagerService } from '../src/datasources/datasource-manager.service';
import { SemanticModelingService } from '../src/semantic-layer/semantic-modeling.service';
import { SemanticVectorService } from '../src/semantic-layer/semantic-vector.service';
import { SqlSecurityGuardService } from '../src/copilot/sql-security-guard.service';
import { QueryExecutionService } from '../src/copilot/query-execution.service';
import { ConversationMemoryService } from '../src/conversation/conversation-memory.service';
import { ConversationContextResolver } from '../src/conversation/conversation-context-resolver.service';
import { DatasourceCryptoService } from '../src/common/crypto/datasource-crypto.service';
import { DatasourceConnectionService } from '../src/datasources/datasource-connection.service';
import type { AuthUser } from '../src/auth/auth.service';
import type { SemanticLayerResponse } from '../src/semantic-layer/semantic.types';

describe('TextToSqlGeneratorService (Unit Tests)', () => {
  let generator: TextToSqlGeneratorService;
  let mockDatabase: DatabaseService;
  let datasourceManager: DatasourceManagerService;
  let semanticModeling: SemanticModelingService;
  let semanticVector: SemanticVectorService;
  let sqlGuard: SqlSecurityGuardService;
  let queryExecution: QueryExecutionService;
  let conversationMemory: ConversationMemoryService;
  let contextResolver: ConversationContextResolver;

  const mockUser: AuthUser = {
    id: 'usr_copilot_test',
    email: 'copilot@askme.ai',
    fullName: 'Copilot Tester',
    role: 'Analyst'
  };

  const sampleSemanticLayer: SemanticLayerResponse = {
    tables: [
      {
        id: 'stb_orders',
        technicalName: 'f_ventes',
        businessName: 'Ventes',
        description: 'Commandes et transactions',
        tableType: 'fact',
        columns: [
          {
            id: 'scl_id',
            technicalName: 'id_vente',
            businessName: 'Identifiant Vente',
            semanticType: 'identifier',
            dataType: 'integer',
            isNullable: false
          },
          {
            id: 'scl_amount',
            technicalName: 'montant_total',
            businessName: "Chiffre d'affaires",
            semanticType: 'measure',
            dataType: 'numeric',
            isNullable: false
          },
          {
            id: 'scl_client_fk',
            technicalName: 'id_client',
            businessName: 'ID Client',
            semanticType: 'identifier',
            dataType: 'integer',
            isNullable: false,
            isForeignKey: true,
            references: { table: 'dim_client', column: 'id' }
          },
          {
            id: 'scl_payment_method_fk',
            technicalName: 'payment_method_id',
            businessName: 'ID Méthode Paiement',
            semanticType: 'identifier',
            dataType: 'integer',
            isNullable: false,
            isForeignKey: true,
            references: { table: 'dim_payment_method', column: 'payment_method_id' }
          },
          {
            id: 'scl_date_fk',
            technicalName: 'date_id',
            businessName: 'ID Date',
            semanticType: 'identifier',
            dataType: 'integer',
            isNullable: false,
            isForeignKey: true,
            references: { table: 'dim_date', column: 'date_id' }
          }
        ]
      },
      {
        id: 'stb_clients',
        technicalName: 'dim_client',
        businessName: 'Clients',
        description: 'Clients de la plateforme',
        tableType: 'dimension',
        columns: [
          {
            id: 'scl_client_id',
            technicalName: 'id',
            businessName: 'ID',
            semanticType: 'identifier',
            dataType: 'integer',
            isNullable: false
          },
          {
            id: 'scl_client_name',
            technicalName: 'nom_client',
            businessName: 'Nom du Client',
            semanticType: 'dimension',
            dataType: 'varchar',
            isNullable: false
          }
        ]
      },
      {
        id: 'stb_payment_method',
        technicalName: 'dim_payment_method',
        businessName: 'Modes de Paiement',
        description: 'Moyens et méthodes de paiement',
        tableType: 'dimension',
        columns: [
          {
            id: 'scl_pm_id',
            technicalName: 'payment_method_id',
            businessName: 'ID',
            semanticType: 'identifier',
            dataType: 'integer',
            isNullable: false
          },
          {
            id: 'scl_pm_name',
            technicalName: 'payment_method',
            businessName: 'Méthode de Paiement',
            semanticType: 'dimension',
            dataType: 'varchar',
            isNullable: false
          }
        ]
      },
      {
        id: 'stb_date',
        technicalName: 'dim_date',
        businessName: 'Dates',
        description: 'Dimension temporelle',
        tableType: 'dimension',
        columns: [
          {
            id: 'scl_date_id',
            technicalName: 'date_id',
            businessName: 'ID Date',
            semanticType: 'identifier',
            dataType: 'integer',
            isNullable: false
          },
          {
            id: 'scl_year',
            technicalName: 'year',
            businessName: 'Année',
            semanticType: 'dimension',
            dataType: 'integer',
            isNullable: false
          },
          {
            id: 'scl_month',
            technicalName: 'month',
            businessName: 'Mois',
            semanticType: 'dimension',
            dataType: 'integer',
            isNullable: false
          }
        ]
      }
    ],
    kpis: [
      {
        id: 'kpi_ca',
        name: "Chiffre d'affaires",
        sqlFormula: 'SUM(montant_total)',
        description: 'CA total généré',
        formatting: 'currency'
      }
    ],
    synonyms: [
      {
        id: 'syn_ca',
        term: 'ca',
        mappedValue: "Chiffre d'affaires"
      }
    ],
    relationships: [
      {
        fromTableTechnicalName: 'f_ventes',
        fromColumnTechnicalName: 'id_client',
        toTableTechnicalName: 'dim_client',
        toColumnTechnicalName: 'id',
        joinType: 'inner',
        cardinality: 'n:1',
        confidence: 0.98
      },
      {
        fromTableTechnicalName: 'f_ventes',
        fromColumnTechnicalName: 'payment_method_id',
        toTableTechnicalName: 'dim_payment_method',
        toColumnTechnicalName: 'payment_method_id',
        joinType: 'inner',
        cardinality: 'n:1',
        confidence: 0.98
      },
      {
        fromTableTechnicalName: 'f_ventes',
        fromColumnTechnicalName: 'date_id',
        toTableTechnicalName: 'dim_date',
        toColumnTechnicalName: 'date_id',
        joinType: 'inner',
        cardinality: 'n:1',
        confidence: 0.98
      }
    ]
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
    semanticModeling = new SemanticModelingService(mockDatabase, datasourceManager, semanticVector);
    sqlGuard = new SqlSecurityGuardService();
    queryExecution = new QueryExecutionService(sqlGuard);
    conversationMemory = new ConversationMemoryService();
    contextResolver = new ConversationContextResolver();

    generator = new TextToSqlGeneratorService(
      mockDatabase,
      datasourceManager,
      semanticModeling,
      semanticVector,
      sqlGuard,
      queryExecution,
      conversationMemory,
      contextResolver
    );
  });

  it('should detect business intent correctly for revenue queries', () => {
    const intent = (generator as any).detectBusinessIntent('Quel est le chiffre d affaires par client ?');
    expect(intent).toBeDefined();
    expect(intent.metric).toBeDefined();
    expect(intent.entity).toBe('client');
  });

  it('should build a deterministic semantic query plan from business intent', () => {
    const plan = generator.buildSemanticQueryPlan(
      'Quel est le chiffre d affaires par client ?',
      sampleSemanticLayer
    );

    expect(plan).toBeDefined();
    expect(plan?.table.technicalName).toBe('f_ventes');
    expect(plan?.sql).toContain('SELECT');
    expect(plan?.sql).toContain('f_ventes');
    expect(plan?.sql).toContain('montant_total');
    expect(plan?.sql).toContain('GROUP BY');
    expect(plan?.sql).toContain('LIMIT');
  });

  it('should generate query successfully in static mode without external LLM', async () => {
    datasourceManager.inMemoryDatasources.push({
      id: 'ds_dw_eval',
      name: 'Data Warehouse',
      type: 'postgresql',
      userId: mockUser.id,
      encryptedCredentials: '',
      connectionConfig: {},
      createdAt: new Date().toISOString()
    });

    semanticModeling.inMemorySemantic[`${mockUser.id}::ds_dw_eval`] = sampleSemanticLayer;

    const result = await generator.generateQuery(
      mockUser,
      'Total des ventes',
      'ds_dw_eval',
      'static'
    );

    expect(result.status).toBe('ok');
    expect(result.canExecute).toBe(true);
    expect(result.sql).toContain('SELECT');
    expect(result.sql).toContain('LIMIT');
    expect(result.provenance.sqlValidated).toBe(true);
  });

  it('should reject out of scope / creative requests gracefully', async () => {
    const result = await generator.generateQuery(
      mockUser,
      'Raconte-moi une blague sur les bases de données',
      'ds_dw_eval',
      'static'
    );

    expect(result.status).toBe('cannot_answer');
    expect(result.sql).toBe('');
    expect(result.canExecute).toBe(false);
  });

  it('should detect business intent and generate query for payment methods frequency', async () => {
    datasourceManager.inMemoryDatasources.push({
      id: 'ds_dw_eval_pm',
      name: 'Data Warehouse PM',
      type: 'postgresql',
      userId: mockUser.id,
      encryptedCredentials: '',
      connectionConfig: {},
      createdAt: new Date().toISOString()
    });
    semanticModeling.inMemorySemantic[`${mockUser.id}::ds_dw_eval_pm`] = sampleSemanticLayer;

    const result = await generator.generateQuery(
      mockUser,
      'Quels sont les methodes de paiments les plus fréquents',
      'ds_dw_eval_pm',
      'static'
    );

    expect(result.status).toBe('ok');
    expect(result.canExecute).toBe(true);
    expect(result.sql).toContain('dim_payment_method');
    expect(result.sql).toContain('payment_method');
    expect(result.sql).toContain('COUNT(');
    expect(result.sql).toContain('GROUP BY');
    expect(result.sql).toContain('ORDER BY');
    expect(result.sql).toContain('DESC');
  });

  it('should resolve payment method dimension when specified with sales count', async () => {
    datasourceManager.inMemoryDatasources.push({
      id: 'ds_dw_eval_pm2',
      name: 'Data Warehouse PM 2',
      type: 'postgresql',
      userId: mockUser.id,
      encryptedCredentials: '',
      connectionConfig: {},
      createdAt: new Date().toISOString()
    });
    semanticModeling.inMemorySemantic[`${mockUser.id}::ds_dw_eval_pm2`] = sampleSemanticLayer;

    const result = await generator.generateQuery(
      mockUser,
      'quels sont les methodes de paiment les plus fréquents par nombre de vente',
      'ds_dw_eval_pm2',
      'static'
    );

    expect(result.status).toBe('ok');
    expect(result.canExecute).toBe(true);
    expect(result.sql).toContain('dim_payment_method');
    expect(result.sql).toContain('payment_method');
    expect(result.sql).not.toContain('dim_produit');
  });

  it('should generate chronological time series query for monthly sales', async () => {
    datasourceManager.inMemoryDatasources.push({
      id: 'ds_dw_eval_monthly',
      name: 'Data Warehouse Monthly',
      type: 'postgresql',
      userId: mockUser.id,
      encryptedCredentials: '',
      connectionConfig: {},
      createdAt: new Date().toISOString()
    });
    semanticModeling.inMemorySemantic[`${mockUser.id}::ds_dw_eval_monthly`] = sampleSemanticLayer;

    const result = await generator.generateQuery(
      mockUser,
      'Montre les ventes mensuelles',
      'ds_dw_eval_monthly',
      'static'
    );

    expect(result.status).toBe('ok');
    expect(result.canExecute).toBe(true);
    expect(result.sql).toContain('dim_date');
    expect(result.sql).toContain('month');
    expect(result.sql).toContain('year');
    expect(result.sql).toContain('ASC');
    expect(result.sql).not.toContain('DESC');
    expect(result.reasoning).toContain('Évolution chronologique');
  });
});
