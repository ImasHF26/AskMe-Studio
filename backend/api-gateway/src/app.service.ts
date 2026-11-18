import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Optional,
  UnauthorizedException
} from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { createHash } from 'crypto';
import { aiGenerationConfig } from './config/ai.config';
import { semanticRetrievalConfig } from './config/retrieval.config';
import { DatabaseService } from './common/database/database.service';
import { DatasourceCryptoService } from './common/crypto/datasource-crypto.service';
import { newId } from './common/utils/id.utils';
import { DatasourceConnectionService } from './datasources/datasource-connection.service';
import { DatasourceManagerService } from './datasources/datasource-manager.service';
import { SemanticVectorService } from './semantic-layer/semantic-vector.service';
import { SemanticModelingService } from './semantic-layer/semantic-modeling.service';
import { SqlSecurityGuardService } from './copilot/sql-security-guard.service';
import { QueryExecutionService } from './copilot/query-execution.service';
import { StatisticalForecastService } from './copilot/statistical-forecast.service';
import { TextToSqlGeneratorService } from './copilot/text-to-sql-generator.service';
import {
  BUSINESS_SECTOR_PROFILES,
  type BusinessMetricAlias,
  type BusinessSectorProfile
} from './semantic-layer/business-sectors.config';
import { ConversationContextResolver } from './conversation/conversation-context-resolver.service';
import { AuthService } from './auth/auth.service';
import {
  ConversationMemoryService,
  type ConversationContext,
  type ConversationIntent
} from './conversation/conversation-memory.service';
import type { ChatSessionDetail, ChatSessionSummary } from './copilot/copilot.types';

type DatasourceType = 'postgresql' | 'mongodb' | 'csv' | 'excel';
type UserRole = 'Admin' | 'Analyst' | 'Viewer';
type SemanticType =
  | 'identifier'
  | 'dimension'
  | 'measure'
  | 'attribute'
  | 'date'
  | 'technical_date'
  | 'boolean_flag'
  | 'sensitive'
  | 'unknown';
type TableType = 'fact' | 'dimension' | 'unknown';
type SemanticProposalSource = 'metadata' | 'heuristic' | 'ai' | 'user';
type SemanticKpiFormatting = 'currency' | 'number' | 'percent' | 'integer';
type SemanticLayerLanguage = 'en' | 'fr' | 'ar';
type SemanticBusinessSector =
  | 'sales_distribution'
  | 'finance_accounting'
  | 'human_resources'
  | 'logistics_supply_chain'
  | 'manufacturing_production'
  | 'marketing_crm'
  | 'healthcare'
  | 'education_training'
  | 'banking_insurance'
  | 'real_estate_construction';
type DashboardWidgetType = 'kpi' | 'chart' | 'table' | 'text';
type DashboardChartType = 'line' | 'bar' | 'pie' | 'table';
type TextToSqlProvider = 'static' | 'ollama' | 'groq' | 'openrouter' | 'auto';
type LlmTextToSqlProvider = Exclude<TextToSqlProvider, 'static' | 'auto'>;
type IntentCategory =
  | 'IN_SCOPE_BI'
  | 'OUT_OF_SCOPE'
  | 'INSUFFICIENT_CONTEXT'
  | 'DESTRUCTIVE_REQUEST'
  | 'UNSUPPORTED_ANALYSIS';

interface UserRecord {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  passwordHash: string;
  createdAt: string;
}

interface Datasource {
  id: string;
  name: string;
  type: DatasourceType;
  createdAt: string;
  schema?: string;
}

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

interface DatasourceResolvedContext {
  type: DatasourceType;
  connectionConfig: Record<string, unknown>;
  credentials: Record<string, unknown>;
}

interface GenerateQueryResult {
  status: 'ok' | 'cannot_answer';
  sql: string;
  language: 'sql';
  canExecute: boolean;
  confidence: number;
  reasoning: string;
  usedEntities: QueryEntity[];
  provenance: QueryProvenance;
  warnings: string[];
}

interface ExecuteQueryResult {
  status: 'ok' | 'cannot_answer' | 'validation_error' | 'execution_error';
  columns: string[];
  rows: Array<Record<string, string | number>>;
  chartType: 'line' | 'bar' | 'pie' | 'table';
  narrative: string;
  executionMs: number;
  confidence: number;
  usedEntities: QueryEntity[];
  provenance: QueryProvenance;
  warnings: string[];
}

interface QueryEntity {
  type: 'table' | 'column' | 'kpi';
  name: string;
  technicalName?: string;
}

interface QueryProvenance {
  datasourceId?: string;
  retrieval?: Array<{
    entityType: SemanticSearchEntityType;
    entityName: string;
    score: number;
  }>;
  table?: {
    businessName: string;
    technicalName: string;
  };
  metric?: string;
  kpi?: string;
  columns: Array<{
    businessName: string;
    technicalName: string;
    semanticType: SemanticType;
  }>;
  sqlValidated: boolean;
  validationReason?: string;
}

interface SqlValidationResult {
  ok: boolean;
  reason?: string;
  referencedTables: string[];
  referencedColumns: string[];
  warnings: string[];
}

interface IntentClassificationResult {
  category: IntentCategory;
  reason: string;
  reformulation: string;
}

interface ScopeValidationResult extends IntentClassificationResult {
  ok: boolean;
}

interface SemanticSelectAst {
  normalized: string;
  identifiers: string[];
  functions: string[];
  referencedTables: string[];
  limit?: number;
  hasComments: boolean;
  hasMultipleStatements: boolean;
  hasSubquery: boolean;
  hasSelectStar: boolean;
  blockedKeyword?: string;
}

type SemanticSearchEntityType = 'table' | 'column' | 'kpi' | 'synonym';

interface SemanticSearchHit {
  entityType: SemanticSearchEntityType;
  entityId: string;
  entityName: string;
  mappedValue?: string;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}

interface QueryHistoryItem {
  id: string;
  question: string;
  sql: string;
  createdAt: string;
}

interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
}

interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
}

interface SemanticColumn {
  id: string;
  technicalName: string;
  businessName: string;
  semanticType: SemanticType;
  dataType: string;
  isNullable: boolean;
  isForeignKey?: boolean;
  references?: {
    table: string;
    column: string;
  };
}

type SemanticColumnLike = Pick<SemanticColumn, 'technicalName' | 'businessName' | 'semanticType' | 'dataType'> & {
  isForeignKey?: boolean;
  references?: {
    table: string;
    column: string;
  };
};

interface SemanticTable {
  id: string;
  technicalName: string;
  businessName: string;
  description: string;
  tableType: TableType;
  columns: SemanticColumn[];
}

interface SemanticKpi {
  id: string;
  name: string;
  sqlFormula: string;
  description: string;
  formatting: string;
}

interface SemanticSynonym {
  id: string;
  term: string;
  mappedValue: string;
}

interface SemanticLayerResponse {
  tables: SemanticTable[];
  kpis: SemanticKpi[];
  synonyms: SemanticSynonym[];
  relationships?: SemanticRelationship[];
}

interface GenerateSemanticProposalInput {
  useAI?: boolean;
  sampleSize?: number;
  overwriteExisting?: boolean;
  semanticLanguage?: SemanticLayerLanguage | 'auto';
  businessSector?: SemanticBusinessSector;
}

interface SaveSemanticLayerInput {
  tables?: SemanticTableProposal[];
  columns?: SemanticColumnProposal[];
  kpis?: SemanticKpiProposal[];
  synonyms?: SemanticSynonymProposal[];
  relationships?: SemanticRelationship[];
  overwriteExisting?: boolean;
}

interface SemanticTableProposal {
  technicalName: string;
  businessName: string;
  description: string;
  tableType: TableType;
  confidence: number;
  source: SemanticProposalSource;
}

interface SemanticColumnProposal {
  tableTechnicalName: string;
  technicalName: string;
  businessName: string;
  semanticType: SemanticType;
  dataType: string;
  isNullable: boolean;
  isForeignKey?: boolean;
  references?: {
    table: string;
    column: string;
  };
  confidence: number;
  source: SemanticProposalSource;
  warnings?: string[];
}

interface SemanticKpiProposal {
  name: string;
  sqlFormula: string;
  description: string;
  formatting: SemanticKpiFormatting;
  confidence: number;
  source: 'heuristic' | 'ai' | 'user';
}

interface SemanticSynonymProposal {
  term: string;
  mappedValue: string;
  confidence: number;
  source: 'heuristic' | 'ai' | 'user';
}

interface SemanticProposalResponse {
  datasourceId: string;
  confidence: number;
  tables: SemanticTableProposal[];
  columns: SemanticColumnProposal[];
  kpis: SemanticKpiProposal[];
  synonyms: SemanticSynonymProposal[];
  relationships: SemanticRelationship[];
  warnings: string[];
}

interface SemanticQueryPlan {
  intent: 'metric' | 'time_series' | 'breakdown' | 'list_records';
  sql: string;
  confidence: number;
  reasoning: string;
  table: SemanticTable;
  metricAlias: string;
  metricFormula: string;
  matchedKpi?: SemanticKpi;
  measureColumn?: SemanticColumn;
  selectedColumns?: SemanticColumn[];
  dimensionTable?: SemanticTable;
  dimensionColumn?: SemanticColumn;
  dateColumn?: SemanticColumn;
  dateGranularity?: 'day' | 'month' | 'year';
  filters?: SemanticQueryFilter[];
  joinRelationship?: SemanticRelationship;
  chartType: ExecuteQueryResult['chartType'];
}

interface SemanticQueryFilter {
  table?: SemanticTable;
  column: SemanticColumn;
  value: string;
}

interface BusinessIntent {
  entity?: string;
  metric?: string;
  aggregation?: 'sum' | 'avg' | 'count';
  ranking?: boolean;
  sort?: 'asc' | 'desc';
  topN?: number;
}

interface SemanticRelationship {
  fromTableTechnicalName: string;
  fromColumnTechnicalName: string;
  toTableTechnicalName: string;
  toColumnTechnicalName: string;
  joinType: 'inner' | 'left';
  cardinality: '1:1' | '1:n' | 'n:1' | 'n:n';
  confidence: number;
}

interface SemanticJoinSelection {
  table: SemanticTable;
  labelColumn: SemanticColumn;
  sourceColumn: SemanticColumn;
  targetColumn: SemanticColumn;
  relationship: SemanticRelationship;
}

interface BusinessIntentDimensionSelection {
  table: SemanticTable;
  labelColumn: SemanticColumn;
  sourceColumn: SemanticColumn;
  targetColumn: SemanticColumn;
  relationship?: SemanticRelationship;
}

interface LlmSqlCandidate {
  provider: LlmTextToSqlProvider;
  model: string;
  sql: string;
  intent?: SemanticQueryPlan['intent'];
  confidence: number;
  reasoning: string;
  chartType?: ExecuteQueryResult['chartType'];
  warnings: string[];
}

interface LlmSqlPlanResult {
  plan?: SemanticQueryPlan;
  validation?: SqlValidationResult;
  warnings: string[];
}

interface MetadataColumn {
  name: string;
  dataType: string;
  isNullable: boolean;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  inferredBusinessRole: string;
  references?: {
    table: string;
    column: string;
  };
  profile: ColumnProfile;
}

interface MetadataTable {
  name: string;
  schema: string;
  tableType: 'table' | 'view' | 'collection' | 'file';
  rowCount: number;
  primaryKeys: string[];
  foreignKeys: Array<{
    column: string;
    references?: {
      table: string;
      column: string;
    };
  }>;
  indexes: string[];
  inferredTableRole: TableType;
  columns: MetadataColumn[];
  sampleRows: Array<Record<string, unknown>>;
  warnings?: string[];
}

interface ColumnProfile {
  nullRatio: number;
  distinctCount: number;
  distinctRatio: number;
  min?: number | string;
  max?: number | string;
  mean?: number;
  topValues: Array<{ value: string; count: number }>;
  sampleValues: unknown[];
  averageTextLength?: number;
}

interface DashboardWidgetPosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface DashboardWidget {
  id: string;
  dashboardId: string;
  title: string;
  type: DashboardWidgetType;
  position: DashboardWidgetPosition;
  query: string;
  chartType: DashboardChartType;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface Dashboard {
  id: string;
  datasourceId: string;
  name: string;
  description: string;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  widgets: DashboardWidget[];
}

interface CreateDashboardInput {
  name: string;
  datasourceId: string;
  description?: string;
  config?: Record<string, unknown>;
}

interface UpdateDashboardInput {
  name?: string;
  datasourceId?: string;
  description?: string;
  config?: Record<string, unknown>;
}

interface CreateDashboardWidgetInput {
  title: string;
  type: DashboardWidgetType;
  position?: DashboardWidgetPosition;
  query?: string;
  chartType?: DashboardChartType;
  config?: Record<string, unknown>;
}

interface UpdateDashboardWidgetInput {
  title?: string;
  type?: DashboardWidgetType;
  position?: DashboardWidgetPosition;
  query?: string;
  chartType?: DashboardChartType;
  config?: Record<string, unknown>;
}



@Injectable()
export class AppService {
  public readonly authService: AuthService;
  public readonly datasourceManager: DatasourceManagerService;
  public readonly semanticVector: SemanticVectorService;
  public readonly semanticModeling: SemanticModelingService;
  public readonly sqlGuard: SqlSecurityGuardService;
  public readonly queryExecution: QueryExecutionService;
  public readonly textToSql: TextToSqlGeneratorService;

  get inMemoryUsers() {
    return this.authService.inMemoryUsers;
  }

  get inMemoryDatasources() {
    return this.datasourceManager.inMemoryDatasources;
  }

  get inMemorySemantic() {
    return this.semanticModeling.inMemorySemantic;
  }

  private readonly inMemoryQueryHistory: Array<QueryHistoryItem & { userId: string }> = [];
  private readonly inMemoryChatSessions: Array<ChatSessionDetail & { userId: string }> = [];

  constructor(
    private readonly database: DatabaseService,
    private readonly datasourceCrypto: DatasourceCryptoService,
    private readonly datasourceConnections: DatasourceConnectionService,
    private readonly conversationMemory: ConversationMemoryService,
    private readonly conversationContextResolver: ConversationContextResolver,
    @Optional() authService?: AuthService,
    @Optional() datasourceManager?: DatasourceManagerService,
    @Optional() semanticVector?: SemanticVectorService,
    @Optional() semanticModeling?: SemanticModelingService,
    @Optional() sqlGuard?: SqlSecurityGuardService,
    @Optional() queryExecution?: QueryExecutionService,
    @Optional() textToSql?: TextToSqlGeneratorService
  ) {
    this.authService = authService || new AuthService(this.database);
    this.datasourceManager =
      datasourceManager ||
      new DatasourceManagerService(this.database, this.datasourceCrypto, this.datasourceConnections);
    this.semanticVector = semanticVector || new SemanticVectorService(this.database);
    this.semanticModeling =
      semanticModeling ||
      new SemanticModelingService(this.database, this.datasourceManager, this.semanticVector);
    this.sqlGuard = sqlGuard || new SqlSecurityGuardService();
    this.queryExecution = queryExecution || new QueryExecutionService(this.sqlGuard);
    this.textToSql =
      textToSql ||
      new TextToSqlGeneratorService(
        this.database,
        this.datasourceManager,
        this.semanticModeling,
        this.semanticVector,
        this.sqlGuard,
        this.queryExecution,
        this.conversationMemory,
        this.conversationContextResolver
      );
  }

  getHealth() {
    return this.database.getHealth();
  }

  async register(email: string, password: string, fullName: string): Promise<AuthResponse> {
    return this.authService.register(email, password, fullName);
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    return this.authService.login(email, password);
  }

  async getCurrentUser(token: string): Promise<AuthUser> {
    return this.authService.getCurrentUser(token);
  }

  requireAuthUser(rawToken?: string): AuthUser {
    return this.authService.requireAuthUser(rawToken);
  }

  async listDatasources(user: AuthUser): Promise<Datasource[]> {
    return this.datasourceManager.listDatasources(user);
  }

  async getDatasource(user: AuthUser, datasourceId: string): Promise<Datasource> {
    return this.datasourceManager.getDatasource(user, datasourceId);
  }

  async createDatasource(user: AuthUser, payload: DatasourceCreateInput): Promise<Datasource> {
    return this.datasourceManager.createDatasource(user, payload);
  }

  async updateDatasource(
    user: AuthUser,
    datasourceId: string,
    payload: Partial<DatasourceCreateInput>
  ): Promise<Datasource> {
    const updated = await this.datasourceManager.updateDatasource(user, datasourceId, payload);
    if (payload.connectionConfig?.schema) {
      try {
        await this.semanticModeling.deleteSemanticLayer(user, datasourceId);
      } catch {
        // pas de couche sémantique préalable
      }
    }
    return updated;
  }

  async deleteDatasource(user: AuthUser, datasourceId: string): Promise<{ success: boolean; id: string }> {
    try {
      await this.semanticModeling.deleteSemanticLayer(user, datasourceId);
    } catch {
      // pas de couche sémantique préalable
    }
    return this.datasourceManager.deleteDatasource(user, datasourceId);
  }

  async testDatasourceConnection(user: AuthUser, payload: DatasourceCreateInput): Promise<DatasourceConnectionTestResult> {
    return this.datasourceManager.testDatasourceConnection(user, payload);
  }

  async listDatasourceSchemas(user: AuthUser, payload: DatasourceCreateInput): Promise<DatasourceSchemasResult> {
    return this.datasourceManager.listDatasourceSchemas(user, payload);
  }

  async listDatasetTables(user: AuthUser, datasourceId: string) {
    const context = await this.resolveDatasourceContext(user.id, datasourceId);
    return this.callMetadataService('/profile/tables', context);
  }

  async getDatasetColumns(user: AuthUser, datasourceId: string, tableName: string) {
    const context = await this.resolveDatasourceContext(user.id, datasourceId);
    return this.callMetadataService('/profile/columns', { ...context, tableName });
  }

  async getDatasetPreview(user: AuthUser, datasourceId: string, tableName: string, limit = 20) {
    const context = await this.resolveDatasourceContext(user.id, datasourceId);
    return this.callMetadataService('/profile/preview', { ...context, tableName, limit });
  }

  async getDatasetProfile(user: AuthUser, datasourceId: string, tableName: string) {
    const context = await this.resolveDatasourceContext(user.id, datasourceId);
    return this.callMetadataService('/profile/stats', { ...context, tableName });
  }

  async listDashboards(user: AuthUser): Promise<Dashboard[]> {
    return this.callDashboardService<Dashboard[]>(
      '/dashboards',
      'GET',
      undefined,
      { userId: user.id },
      'Dashboard service unavailable.'
    );
  }

  async createDashboard(user: AuthUser, payload: CreateDashboardInput): Promise<Dashboard> {
    this.assertRole(user.role, ['Admin', 'Analyst']);
    await this.assertDatasourceOwnership(user.id, payload.datasourceId);
    return this.callDashboardService<Dashboard>(
      '/dashboards',
      'POST',
      {
        userId: user.id,
        datasourceId: payload.datasourceId,
        name: payload.name,
        description: payload.description || '',
        config: payload.config || {}
      },
      undefined,
      'Dashboard service unavailable.'
    );
  }

  async getDashboard(user: AuthUser, dashboardId: string): Promise<Dashboard> {
    return this.callDashboardService<Dashboard>(
      `/dashboards/${encodeURIComponent(dashboardId)}`,
      'GET',
      undefined,
      { userId: user.id },
      'Dashboard service unavailable.'
    );
  }

  async updateDashboard(user: AuthUser, dashboardId: string, payload: UpdateDashboardInput): Promise<Dashboard> {
    this.assertRole(user.role, ['Admin', 'Analyst']);
    if (payload.datasourceId) {
      await this.assertDatasourceOwnership(user.id, payload.datasourceId);
    }
    return this.callDashboardService<Dashboard>(
      `/dashboards/${encodeURIComponent(dashboardId)}`,
      'PUT',
      {
        userId: user.id,
        datasourceId: payload.datasourceId,
        name: payload.name,
        description: payload.description,
        config: payload.config
      },
      undefined,
      'Dashboard service unavailable.'
    );
  }

  async deleteDashboard(user: AuthUser, dashboardId: string): Promise<{ ok: boolean }> {
    this.assertRole(user.role, ['Admin', 'Analyst']);
    return this.callDashboardService<{ ok: boolean }>(
      `/dashboards/${encodeURIComponent(dashboardId)}`,
      'DELETE',
      undefined,
      { userId: user.id },
      'Dashboard service unavailable.'
    );
  }

  async createDashboardWidget(
    user: AuthUser,
    dashboardId: string,
    payload: CreateDashboardWidgetInput
  ): Promise<Dashboard> {
    this.assertRole(user.role, ['Admin', 'Analyst']);
    return this.callDashboardService<Dashboard>(
      `/dashboards/${encodeURIComponent(dashboardId)}/widgets`,
      'POST',
      { ...payload, userId: user.id },
      undefined,
      'Dashboard service unavailable.'
    );
  }

  async updateDashboardWidget(
    user: AuthUser,
    dashboardId: string,
    widgetId: string,
    payload: UpdateDashboardWidgetInput
  ): Promise<Dashboard> {
    this.assertRole(user.role, ['Admin', 'Analyst']);
    return this.callDashboardService<Dashboard>(
      `/dashboards/${encodeURIComponent(dashboardId)}/widgets/${encodeURIComponent(widgetId)}`,
      'PUT',
      { ...payload, userId: user.id },
      undefined,
      'Dashboard service unavailable.'
    );
  }

  async deleteDashboardWidget(user: AuthUser, dashboardId: string, widgetId: string): Promise<Dashboard> {
    this.assertRole(user.role, ['Admin', 'Analyst']);
    return this.callDashboardService<Dashboard>(
      `/dashboards/${encodeURIComponent(dashboardId)}/widgets/${encodeURIComponent(widgetId)}`,
      'DELETE',
      undefined,
      { userId: user.id },
      'Dashboard service unavailable.'
    );
  }

  // ─── Semantic Layer (Delegated to SemanticModelingService) ──────────────────

  async getSemanticLayer(user: AuthUser, datasourceId: string): Promise<SemanticLayerResponse> {
    return this.semanticModeling.getSemanticLayer(user, datasourceId);
  }

  async generateSemanticLayer(user: AuthUser, datasourceId: string): Promise<SemanticLayerResponse> {
    return this.semanticModeling.generateSemanticLayer(user, datasourceId);
  }

  async generateSemanticProposal(
    user: AuthUser,
    datasourceId: string,
    input: GenerateSemanticProposalInput = {}
  ): Promise<SemanticProposalResponse> {
    return this.semanticModeling.generateSemanticProposal(user, datasourceId, input);
  }

  async saveSemanticLayer(
    user: AuthUser,
    datasourceId: string,
    input: SaveSemanticLayerInput = {}
  ): Promise<SemanticLayerResponse> {
    return this.semanticModeling.saveSemanticLayer(user, datasourceId, input);
  }

  async deleteSemanticLayer(user: AuthUser, datasourceId: string): Promise<{ ok: boolean }> {
    return this.semanticModeling.deleteSemanticLayer(user, datasourceId);
  }

  async updateSemanticTable(
    user: AuthUser,
    datasourceId: string,
    tableId: string,
    businessName: string,
    description: string
  ): Promise<SemanticLayerResponse> {
    return this.semanticModeling.updateSemanticTable(user, datasourceId, tableId, businessName, description);
  }

  async updateSemanticColumn(
    user: AuthUser,
    datasourceId: string,
    columnId: string,
    businessName: string,
    semanticType: SemanticType
  ): Promise<SemanticLayerResponse> {
    return this.semanticModeling.updateSemanticColumn(user, datasourceId, columnId, businessName, semanticType);
  }

  async createSemanticKpi(
    user: AuthUser,
    datasourceId: string,
    name: string,
    sqlFormula: string,
    description = '',
    formatting = ''
  ): Promise<SemanticLayerResponse> {
    return this.semanticModeling.createSemanticKpi(user, datasourceId, name, sqlFormula, description, formatting);
  }

  async createSemanticSynonym(
    user: AuthUser,
    datasourceId: string,
    term: string,
    mappedValue: string
  ): Promise<SemanticLayerResponse> {
    return this.semanticModeling.createSemanticSynonym(user, datasourceId, term, mappedValue);
  }

  hasAny(value: string, needles: string[]): boolean {
    const normalized = value.toLowerCase();
    return needles.some((needle) => normalized.includes(needle.toLowerCase()));
  }

  clampConfidence(value: number): number {
    return Math.max(0.05, Math.min(0.99, Number(value.toFixed(2))));
  }

  isNumericType(dataType: string): boolean {
    const normalized = dataType.toLowerCase();
    return ['int', 'numeric', 'decimal', 'float', 'double', 'real', 'bigint', 'smallint', 'serial', 'number'].some(
      (token) => normalized.includes(token)
    );
  }

  isAnalyticalNumericCandidate(column: Pick<SemanticColumnLike, 'technicalName' | 'semanticType' | 'dataType'>): boolean {
    return (
      column.semanticType === 'measure' ||
      (this.isNumericType(column.dataType) &&
        !['identifier', 'date', 'technical_date', 'boolean_flag', 'sensitive'].includes(column.semanticType) &&
        !this.isLikelyKeyColumn(column.technicalName))
    );
  }

  isDateType(dataType: string): boolean {
    const normalized = dataType.toLowerCase();
    return ['date', 'time', 'timestamp'].some((token) => normalized.includes(token));
  }

  isTextType(dataType: string): boolean {
    const normalized = dataType.toLowerCase();
    return ['varchar', 'text', 'char', 'string'].some((token) => normalized.includes(token));
  }

  isLikelyKeyColumn(name: string): boolean {
    const normalized = name.toLowerCase().replace(/[^a-z0-9_]/g, '');
    return (
      normalized === 'id' ||
      normalized.endsWith('_id') ||
      normalized.startsWith('id_') ||
      normalized.endsWith('_code') ||
      normalized.startsWith('code_') ||
      normalized.endsWith('_fk') ||
      normalized.endsWith('_pk')
    );
  }

  isLikelyLabelColumn(name: string): boolean {
    const normalized = name.toLowerCase().replace(/[^a-z0-9_]/g, '');
    return (
      ['name', 'nom', 'label', 'libelle', 'title', 'titre', 'designation', 'description'].some((token) =>
        normalized.includes(token)
      ) && !this.isLikelyKeyColumn(name)
    );
  }

  buildSemanticSearchEntries(layer: SemanticLayerResponse): SemanticSearchHit[] {
    return this.semanticVector.buildSemanticSearchEntries(layer);
  }

  async searchSemanticVectorIndex(
    userId: string,
    datasourceId: string,
    question: string,
    layer: SemanticLayerResponse,
    limit?: number
  ): Promise<SemanticSearchHit[]> {
    return this.semanticVector.searchSemanticVectorIndex(userId, datasourceId, question, layer, limit);
  }

  searchSemanticLayerLocally(question: string, layer: SemanticLayerResponse, limit: number): SemanticSearchHit[] {
    return this.semanticVector.searchSemanticLayerLocally(question, layer, limit);
  }

  normalizeSearchText(value: string): string {
    return this.semanticVector.normalizeSearchText(value);
  }

  buildHeuristicSemanticProposal(
    datasourceId: string,
    metadata: MetadataTable[],
    semanticLanguage?: SemanticLayerLanguage,
    businessSector?: SemanticBusinessSector
  ): SemanticProposalResponse {
    return this.semanticModeling.buildHeuristicSemanticProposal(datasourceId, metadata, semanticLanguage, businessSector);
  }

  classifyColumn(column: MetadataColumn) {
    return this.semanticModeling.classifyColumn(column);
  }

  classifyTable(
    table: MetadataTable,
    columns: SemanticColumnProposal[],
    medianRows = 0
  ) {
    return this.semanticModeling.classifyTable(table, columns, medianRows);
  }

  inferSemanticRules(input: {
    table?: MetadataTable;
    column?: MetadataColumn | { name: string; dataType?: string; isPrimaryKey?: boolean; isForeignKey?: boolean; references?: MetadataColumn['references'] };
  }) {
    return this.semanticModeling.inferSemanticRules(input);
  }

  normalizeColumnProposal(column: Partial<SemanticColumnProposal>): SemanticColumnProposal {
    return this.semanticModeling.normalizeColumnProposal(column);
  }

  unqualifyName(name: string): string {
    return this.semanticModeling.unqualifyName(name);
  }

  unquoteSqlIdentifier(name: string): string {
    return this.semanticModeling.unquoteSqlIdentifier(name);
  }

  toBusinessName(name: string): string {
    return this.semanticModeling.toBusinessName(name);
  }

  findDimensionLabelColumn(columns: SemanticColumnLike[]): SemanticColumnLike | undefined {
    return this.semanticModeling.findDimensionLabelColumn(columns);
  }

  private async extractSemanticMetadata(user: AuthUser, datasourceId: string, sampleSize: number): Promise<MetadataTable[]> {
    return (this.semanticModeling as any).extractSemanticMetadata(user, datasourceId, sampleSize);
  }

  // ─── Text-to-SQL & Copilot (Delegated to TextToSqlGeneratorService) ────────

  async generateQuery(
    user: AuthUser,
    question: string,
    datasourceId?: string,
    textToSqlProvider?: TextToSqlProvider,
    sessionId?: string,
    dashboardId?: string
  ): Promise<GenerateQueryResult> {
    return this.textToSql.generateQuery(user, question, datasourceId, textToSqlProvider, sessionId, dashboardId);
  }

  async executeQuery(
    user: AuthUser,
    question: string,
    sql: string,
    datasourceId?: string,
    sessionId?: string,
    dashboardId?: string
  ): Promise<ExecuteQueryResult> {
    return this.textToSql.executeQuery(user, question, sql, datasourceId, sessionId, dashboardId);
  }

  buildSemanticQueryPlan(
    question: string,
    layer: SemanticLayerResponse,
    retrievalHits?: any
  ): any {
    return this.textToSql.buildSemanticQueryPlan(question, layer, retrievalHits);
  }

  semanticFallbackResult(
    question: string,
    sql: string,
    layer: SemanticLayerResponse | undefined,
    plan: any,
    startedAt: number,
    warning?: string,
    status: any = 'cannot_answer',
    datasourceId?: string,
    validation?: any,
    retrievalHits: any[] = []
  ): ExecuteQueryResult {
    return this.textToSql.semanticFallbackResult(
      question,
      sql,
      layer,
      plan,
      startedAt,
      warning,
      status,
      datasourceId,
      validation,
      retrievalHits
    );
  }

  failedValidation(reason: string): SqlValidationResult {
    return this.sqlGuard.failedValidation(reason);
  }

  isSafeSemanticSelect(sql: string, layer: SemanticLayerResponse, plan?: any): boolean {
    return this.sqlGuard.isSafeSemanticSelect(sql, layer, plan);
  }

  validateSemanticSql(sql: string, layer: SemanticLayerResponse, plan?: any): SqlValidationResult {
    return this.sqlGuard.validateSemanticSql(sql, layer, plan);
  }

  parseSemanticSelect(sql: string): SemanticSelectAst {
    return this.sqlGuard.parseSemanticSelect(sql);
  }

  extractReferencedSqlTables(sql: string): string[] {
    return this.sqlGuard.extractReferencedSqlTables(sql);
  }

  extractSqlAliases(sql: string): string[] {
    return this.sqlGuard.extractSqlAliases(sql);
  }

  normalizeSqlReference(value: string): string {
    return this.sqlGuard.normalizeSqlReference(value);
  }

  quoteQualifiedSqlName(value: string): string {
    return this.sqlGuard.quoteQualifiedSqlName(value);
  }

  quoteSqlIdentifier(value: string): string {
    return this.sqlGuard.quoteSqlIdentifier(value);
  }

  assertSafeDatasourceSchema(schema: string): void {
    return this.sqlGuard.assertSafeDatasourceSchema(schema);
  }

  quoteSqlStringLiteral(value: string): string {
    return this.sqlGuard.quoteSqlStringLiteral(value);
  }

  toSqlAlias(value: string): string {
    return this.sqlGuard.toSqlAlias(value);
  }

  extractSqlIdentifiers(sql: string): string[] {
    return this.sqlGuard.extractSqlIdentifiers(sql);
  }

  newDatasourcePostgresPool(context: DatasourceResolvedContext) {
    return this.queryExecution.newDatasourcePostgresPool(context);
  }

  normalizeDatasourceRuntimeHost(host: string): string {
    return this.queryExecution.normalizeDatasourceRuntimeHost(host);
  }

  normalizeResultRow(row: Record<string, unknown>): Record<string, string | number> {
    return this.queryExecution.normalizeResultRow(row);
  }

  async listQueryHistory(userId: string): Promise<QueryHistoryItem[]> {
    if (this.database.dbReady && this.database.pool) {
      const result = await this.database.pool.query(
        'SELECT id, question, sql, created_at FROM app_query_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20',
        [userId]
      );

      return result.rows.map((row) => ({
        id: row.id,
        question: row.question,
        sql: row.sql,
        createdAt: new Date(row.created_at).toISOString()
      }));
    }

    return this.inMemoryQueryHistory
      .filter((item) => item.userId === userId)
      .slice(0, 20)
      .map(({ userId: _userId, ...history }) => history);
  }

  async listChatSessions(userId: string): Promise<ChatSessionSummary[]> {
    if (this.database.dbReady && this.database.pool) {
      const result = await this.database.pool.query(
        'SELECT id, datasource_id, title, jsonb_array_length(messages) as message_count, created_at, updated_at FROM app_chat_sessions WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 50',
        [userId]
      );
      return result.rows.map((row) => ({
        id: row.id,
        datasourceId: row.datasource_id || undefined,
        title: row.title,
        messageCount: parseInt(String(row.message_count || '0'), 10),
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString()
      }));
    }

    return this.inMemoryChatSessions
      .filter((s) => s.userId === userId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .map((s) => ({
        id: s.id,
        datasourceId: s.datasourceId,
        title: s.title,
        messageCount: s.messages.length,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt
      }));
  }

  async getChatSession(userId: string, sessionId: string): Promise<ChatSessionDetail | null> {
    if (this.database.dbReady && this.database.pool) {
      const result = await this.database.pool.query(
        'SELECT id, datasource_id, title, messages, created_at, updated_at FROM app_chat_sessions WHERE id = $1 AND user_id = $2 LIMIT 1',
        [sessionId, userId]
      );
      if (!result.rowCount) return null;
      const row = result.rows[0];
      return {
        id: row.id,
        datasourceId: row.datasource_id || undefined,
        title: row.title,
        messageCount: Array.isArray(row.messages) ? row.messages.length : 0,
        messages: Array.isArray(row.messages) ? row.messages : [],
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString()
      };
    }

    const found = this.inMemoryChatSessions.find((s) => s.id === sessionId && s.userId === userId);
    return found || null;
  }

  async saveChatSession(
    userId: string,
    input: { id?: string; title?: string; datasourceId?: string; messages: Array<Record<string, unknown>> }
  ): Promise<ChatSessionDetail> {
    const id = input.id || newId('session');
    const firstUserMsg = input.messages.find((m) => m.role === 'user');
    const title =
      input.title ||
      (typeof firstUserMsg?.text === 'string' ? firstUserMsg.text.slice(0, 60) : 'Nouvelle conversation');
    const datasourceId = input.datasourceId || null;
    const now = new Date().toISOString();

    if (this.database.dbReady && this.database.pool) {
      await this.database.pool.query(
        `INSERT INTO app_chat_sessions (id, user_id, datasource_id, title, messages, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $6)
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title,
           datasource_id = COALESCE(EXCLUDED.datasource_id, app_chat_sessions.datasource_id),
           messages = EXCLUDED.messages,
           updated_at = EXCLUDED.updated_at`,
        [id, userId, datasourceId, title, JSON.stringify(input.messages), now]
      );
      return {
        id,
        datasourceId: datasourceId || undefined,
        title,
        messageCount: input.messages.length,
        messages: input.messages,
        createdAt: now,
        updatedAt: now
      };
    }

    const existingIdx = this.inMemoryChatSessions.findIndex((s) => s.id === id && s.userId === userId);
    const sessionObj = {
      id,
      userId,
      datasourceId: datasourceId || undefined,
      title,
      messageCount: input.messages.length,
      messages: input.messages,
      createdAt: existingIdx >= 0 ? this.inMemoryChatSessions[existingIdx].createdAt : now,
      updatedAt: now
    };
    if (existingIdx >= 0) {
      this.inMemoryChatSessions[existingIdx] = sessionObj;
    } else {
      this.inMemoryChatSessions.push(sessionObj);
    }
    return sessionObj;
  }

  async deleteChatSession(userId: string, sessionId: string): Promise<boolean> {
    if (this.database.dbReady && this.database.pool) {
      const res = await this.database.pool.query(
        'DELETE FROM app_chat_sessions WHERE id = $1 AND user_id = $2',
        [sessionId, userId]
      );
      return (res.rowCount ?? 0) > 0;
    }

    const idx = this.inMemoryChatSessions.findIndex((s) => s.id === sessionId && s.userId === userId);
    if (idx >= 0) {
      this.inMemoryChatSessions.splice(idx, 1);
      return true;
    }
    return false;
  }

  private assertRole(role: UserRole, allowed: UserRole[]) {
    if (!allowed.includes(role)) {
      throw new ForbiddenException('Insufficient role for this operation.');
    }
  }

  private async assertDatasourceOwnership(userId: string, datasourceId: string) {
    return this.datasourceManager.assertDatasourceOwnership(userId, datasourceId);
  }

  private async addHistory(userId: string, question: string, sql: string) {
    const item: QueryHistoryItem = {
      id: this.newId('q'),
      question,
      sql,
      createdAt: new Date().toISOString()
    };

    if (this.database.dbReady && this.database.pool) {
      await this.database.pool.query(
        'INSERT INTO app_query_history (id, user_id, question, sql, created_at) VALUES ($1, $2, $3, $4, $5)',
        [item.id, userId, item.question, item.sql, item.createdAt]
      );
      return;
    }

    this.inMemoryQueryHistory.unshift({ ...item, userId });
  }

  private signToken(user: AuthUser) {
    return this.authService.signToken(user);
  }

  private verifyToken(token: string): JwtPayload {
    return this.authService.verifyToken(token);
  }

  private encryptJson(payload: Record<string, unknown>): string {
    return this.datasourceCrypto.encryptJson(payload);
  }

  private semanticKey(userId: string, datasourceId: string) {
    return `${userId}::${datasourceId}`;
  }

  private decryptJson(ciphertext: string): Record<string, unknown> {
    return this.datasourceCrypto.decryptJson(ciphertext);
  }

  private async resolveDatasourceContext(userId: string, datasourceId: string): Promise<DatasourceResolvedContext> {
    return this.datasourceManager.resolveDatasourceContext(userId, datasourceId);
  }

  private async callMetadataService(path: string, payload: unknown) {
    return this.callJsonService<Record<string, unknown>>(
      [process.env.METADATA_SERVICE_URL || 'http://metadata-service:3003', 'http://localhost:3003'],
      path,
      {
        method: 'POST',
        payload,
        unavailableMessage: 'Metadata service unavailable.'
      }
    );
  }

  private async callDashboardService<T>(
    path: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    payload: unknown,
    query: Record<string, string> | undefined,
    unavailableMessage: string
  ): Promise<T> {
    return this.callJsonService<T>(
      [process.env.DASHBOARD_SERVICE_URL || 'http://dashboard-service:3007', 'http://localhost:3007'],
      path,
      {
        method,
        payload,
        query,
        unavailableMessage
      }
    );
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
        const queryString = options.query
          ? `?${new URLSearchParams(options.query).toString()}`
          : '';

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

  private newId(prefix: string) {
    return newId(prefix);
  }
}
