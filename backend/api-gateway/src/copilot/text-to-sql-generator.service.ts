import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional
} from '@nestjs/common';
import { DatabaseService } from '../common/database/database.service';
import { DatasourceManagerService, type DatasourceResolvedContext } from '../datasources/datasource-manager.service';
import { SemanticModelingService } from '../semantic-layer/semantic-modeling.service';
import { SemanticVectorService } from '../semantic-layer/semantic-vector.service';
import { SqlSecurityGuardService, type SqlValidationResult } from './sql-security-guard.service';
import { QueryExecutionService } from './query-execution.service';
import { StatisticalForecastService } from './statistical-forecast.service';
import {
  ConversationMemoryService,
  type ConversationContext,
  type ConversationIntent
} from '../conversation/conversation-memory.service';
import { ConversationContextResolver } from '../conversation/conversation-context-resolver.service';
import { newId } from '../common/utils/id.utils';
import { aiGenerationConfig } from '../config/ai.config';
import { semanticRetrievalConfig } from '../config/retrieval.config';
import type { AuthUser, UserRole } from '../auth/auth.service';
import type {
  SemanticColumn,
  SemanticColumnLike,
  SemanticLayerResponse,
  SemanticSearchHit,
  SemanticTable,
  SemanticType,
  SemanticKpi,
  SemanticRelationship
} from '../semantic-layer/semantic.types';
import type {
  BusinessIntent,
  BusinessIntentDimensionSelection,
  ExecuteQueryResult,
  GenerateQueryResult,
  IntentCategory,
  IntentClassificationResult,
  LlmSqlCandidate,
  LlmSqlPlanResult,
  LlmTextToSqlProvider,
  QueryEntity,
  QueryProvenance,
  ScopeValidationResult,
  SemanticJoinSelection,
  SemanticQueryFilter,
  SemanticQueryPlan,
  TextToSqlProvider
} from './copilot.types';

@Injectable()
export class TextToSqlGeneratorService {
  constructor(
    private readonly database: DatabaseService,
    private readonly datasourceManager: DatasourceManagerService,
    private readonly semanticModeling: SemanticModelingService,
    private readonly semanticVector: SemanticVectorService,
    private readonly sqlGuard: SqlSecurityGuardService,
    private readonly queryExecution: QueryExecutionService,
    private readonly conversationMemory: ConversationMemoryService,
    private readonly conversationContextResolver: ConversationContextResolver,
    @Optional() private readonly statisticalForecast: StatisticalForecastService = new StatisticalForecastService()
  ) {}

  private newId(prefix: string): string {
    return newId(prefix);
  }

  private failedValidation(reason: string): SqlValidationResult {
    return this.sqlGuard.failedValidation(reason);
  }

  private hasAny(value: string, needles: string[]): boolean {
    const normalized = value.toLowerCase();
    return needles.some((needle) => normalized.includes(needle.toLowerCase()));
  }

  private clampConfidence(value: number): number {
    return Math.max(0.05, Math.min(0.99, Number(value.toFixed(2))));
  }

  private isNumericType(dataType: string): boolean {
    const normalized = dataType.toLowerCase();
    return ['int', 'numeric', 'decimal', 'float', 'double', 'real', 'bigint', 'smallint', 'serial', 'number'].some(
      (token) => normalized.includes(token)
    );
  }

  private isAnalyticalNumericCandidate(column: Pick<SemanticColumnLike, 'technicalName' | 'semanticType' | 'dataType'>): boolean {
    return (
      column.semanticType === 'measure' ||
      (this.isNumericType(column.dataType) &&
        !['identifier', 'date', 'technical_date', 'boolean_flag', 'sensitive'].includes(column.semanticType) &&
        !this.isLikelyKeyColumn(column.technicalName))
    );
  }

  private isDateType(dataType: string): boolean {
    const normalized = dataType.toLowerCase();
    return ['date', 'time', 'timestamp'].some((token) => normalized.includes(token));
  }

  private isTextType(dataType: string): boolean {
    const normalized = dataType.toLowerCase();
    return ['varchar', 'text', 'char', 'string'].some((token) => normalized.includes(token));
  }

  private isLikelyKeyColumn(name: string): boolean {
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

  private isLikelyLabelColumn(name: string): boolean {
    const normalized = name.toLowerCase().replace(/[^a-z0-9_]/g, '');
    return (
      ['name', 'nom', 'label', 'libelle', 'title', 'titre', 'designation', 'description'].some((token) =>
        normalized.includes(token)
      ) && !this.isLikelyKeyColumn(name)
    );
  }


  private unquoteSqlIdentifier(value: string): string {
    return this.semanticModeling.unquoteSqlIdentifier(value);
  }

  private unqualifyName(value: string): string {
    return this.semanticModeling.unqualifyName(value);
  }

  private toBusinessName(value: string): string {
    return this.semanticModeling.toBusinessName(value);
  }

  private findDimensionLabelColumn(columns: SemanticColumnLike[]): SemanticColumnLike | undefined {
    return this.semanticModeling.findDimensionLabelColumn(columns);
  }

  private extractSqlIdentifiers(sql: string): string[] {
    return this.sqlGuard.extractSqlIdentifiers(sql);
  }

  private parseSemanticSelect(sql: string) {
    return this.sqlGuard.parseSemanticSelect(sql);
  }

  private extractSqlAliases(sql: string): string[] {
    return this.sqlGuard.extractSqlAliases(sql);
  }

  private quoteSqlStringLiteral(value: string): string {
    return this.sqlGuard.quoteSqlStringLiteral(value);
  }

  private normalizeSqlReference(value: string): string {
    return this.sqlGuard.normalizeSqlReference(value);
  }

  private assertRole(role: UserRole, allowed: UserRole[]) {
    if (!allowed.includes(role)) {
      throw new ForbiddenException(`Insufficient permissions for role ${role}.`);
    }
  }

  private normalizeSearchText(value: string): string {
    return this.semanticVector.normalizeSearchText(value);
  }





  private searchSemanticVectorIndex(
    userId: string,
    datasourceId: string,
    question: string,
    layer: SemanticLayerResponse,
    limit?: number
  ) {
    return this.semanticVector.searchSemanticVectorIndex(userId, datasourceId, question, layer, limit);
  }

  private searchSemanticLayerLocally(question: string, layer: SemanticLayerResponse, limit: number) {
    return this.semanticVector.searchSemanticLayerLocally(question, layer, limit);
  }

  private buildSemanticSearchEntries(layer: SemanticLayerResponse) {
    return this.semanticVector.buildSemanticSearchEntries(layer);
  }

  private getSemanticLayer(user: AuthUser, datasourceId: string) {
    return this.semanticModeling.getSemanticLayer(user, datasourceId);
  }

  private inferSemanticRelationships(layer: SemanticLayerResponse) {
    return this.semanticModeling.inferSemanticRelationships(layer);
  }

  private resolveExplicitSemanticRelationship(layer: SemanticLayerResponse, sourceTable: SemanticTable, sourceColumn: SemanticColumnLike) {
    return this.semanticModeling.resolveExplicitSemanticRelationship(layer, sourceTable, sourceColumn);
  }

  private validateSemanticSql(sql: string, layer: SemanticLayerResponse, plan?: any): SqlValidationResult {
    return this.sqlGuard.validateSemanticSql(sql, layer, plan);
  }

  private isSafeSemanticSelect(sql: string, layer: SemanticLayerResponse, plan?: any): boolean {
    return this.sqlGuard.isSafeSemanticSelect(sql, layer, plan);
  }

  private ensureSemanticSqlLimit(sql: string): string {
    return this.sqlGuard.ensureSemanticSqlLimit(sql);
  }

  private toSqlAlias(value: string): string {
    return this.sqlGuard.toSqlAlias(value);
  }

  private quoteSqlIdentifier(value: string): string {
    return this.sqlGuard.quoteSqlIdentifier(value);
  }

  private quoteQualifiedSqlName(value: string): string {
    return this.sqlGuard.quoteQualifiedSqlName(value);
  }

  private assertSafeDatasourceSchema(schema: string): void {
    return this.sqlGuard.assertSafeDatasourceSchema(schema);
  }

  private newDatasourcePostgresPool(context: DatasourceResolvedContext) {
    return this.queryExecution.newDatasourcePostgresPool(context);
  }

  private normalizeResultRow(row: Record<string, unknown>) {
    return this.queryExecution.normalizeResultRow(row);
  }

  private normalizeDatasourceRuntimeHost(host: string) {
    return this.queryExecution.normalizeDatasourceRuntimeHost(host);
  }

  private resolveDatasourceContext(userId: string, datasourceId: string) {
    return this.datasourceManager.resolveDatasourceContext(userId, datasourceId);
  }

  private assertDatasourceOwnership(userId: string, datasourceId: string) {
    return this.datasourceManager.assertDatasourceOwnership(userId, datasourceId);
  }

  private async addHistory(userId: string, question: string, sql: string) {
    if (this.database.dbReady && this.database.pool) {
      await this.database.pool.query(
        'INSERT INTO app_query_history (id, user_id, question, sql) VALUES ($1, $2, $3, $4)',
        [this.newId('q'), userId, question, sql]
      );
    }
  }

  private classifyQuestionIntent(
    question: string,
    layer?: SemanticLayerResponse,
    retrievalHits: SemanticSearchHit[] = []
  ): IntentClassificationResult {
    const normalized = this.normalizeSearchText(question);
    const reformulation = this.businessScopeReformulation();
    const scopeSignals = this.getQuestionScopeSignals(normalized, layer, retrievalHits);
    if (!normalized) {
      return {
        category: 'INSUFFICIENT_CONTEXT',
        reason: `Je n’ai pas reçu de question exploitable. ${reformulation}`,
        reformulation
      };
    }

    if (
      this.hasAny(normalized, [
        'supprime',
        'supprimer',
        'efface',
        'effacer',
        'delete',
        'drop',
        'truncate',
        'update',
        'insert',
        'alter',
        'create table',
        'delete all',
        'remove all',
        'vider',
        'modifie',
        'modifier toutes',
        'mets a jour',
        'mise a jour'
      ])
    ) {
      return {
        category: 'DESTRUCTIVE_REQUEST',
        reason: 'Cette demande est bloquée, car elle correspond à une action destructive non autorisée.',
        reformulation
      };
    }

    if (this.isGeneralKnowledgeOrCreativeRequest(normalized) && !scopeSignals.hasBusinessScopeSignal) {
      return {
        category: 'OUT_OF_SCOPE',
        reason:
          'Je ne peux pas répondre à cette question, car elle est hors du périmètre d’AskMe Studio et n’est pas liée au Data Warehouse. Je peux uniquement analyser les données métier disponibles : ventes, clients, produits, régions, commandes, marges, dates, statuts ou délais.',
        reformulation
      };
    }

    if (
      this.hasAny(normalized, [
        'predis',
        'predire',
        'prevoir',
        'forecast',
        'prediction',
        'predict',
        'estime demain',
        'estimer demain'
      ]) &&
      !this.hasAny(normalized, ['vente', 'ventes', 'sales', 'chiffre', 'affaire', 'revenue', 'commande', 'marge'])
    ) {
      return {
        category: 'UNSUPPORTED_ANALYSIS',
        reason:
          'Je ne peux pas produire cette analyse prédictive avec le contexte actuel. AskMe Studio répond uniquement à partir des données métier disponibles et validées.',
        reformulation
      };
    }

    if (
      this.hasAny(normalized, [
        'meteo',
        'weather',
        'president',
        'premier ministre',
        'actualite',
        'actualites',
        'news',
        'film',
        'cinema',
        'bitcoin',
        'crypto',
        'bourse',
        'stock price',
        'cours du',
        'football',
        'sport',
        'recette',
        'voyage',
        'restaurant'
      ])
    ) {
      return {
        category: 'OUT_OF_SCOPE',
        reason:
          'Je ne peux pas répondre à cette question, car elle est hors du périmètre d’AskMe Studio. Je peux uniquement analyser les données métier disponibles dans le Data Warehouse, comme les ventes, clients, produits, régions, commandes, marges ou délais de livraison.',
        reformulation
      };
    }

    if (
      !this.hasAny(normalized, [
        'paiement',
        'paiements',
        'paiment',
        'paiments',
        'payment',
        'payments',
        'mode de paiement',
        'moyen de paiement',
        'methode de paiement'
      ]) &&
      this.hasAny(normalized, [
        'salaire',
        'salaires',
        'salary',
        'bulletin de paie',
        'fiche de paie',
        'feuille de paie',
        'payroll',
        'rh',
        'ressources humaines',
        'recrutement',
        'absences'
      ])
    ) {
      return {
        category: 'INSUFFICIENT_CONTEXT',
        reason:
          'Je ne peux pas répondre précisément à cette question, car aucune donnée RH ou salariale n’est disponible dans le Data Warehouse actuel. Je peux analyser les ventes, clients, produits, commandes, régions, marges ou délais.',
        reformulation
      };
    }

    if (!scopeSignals.hasBusinessScopeSignal && !scopeSignals.hasAnalyticalSignal) {
      return {
        category: 'OUT_OF_SCOPE',
        reason:
          'Je ne peux pas répondre à cette question, car son lien avec les données métier disponibles n’est pas suffisamment clair. AskMe Studio répond uniquement aux questions BI liées au Data Warehouse.',
        reformulation
      };
    }

    return {
      category: 'IN_SCOPE_BI',
      reason: '',
      reformulation
    };
  }

  private validateQuestionScope(
    question: string,
    layer: SemanticLayerResponse,
    retrievalHits: SemanticSearchHit[],
    intent: IntentClassificationResult
  ): ScopeValidationResult {
    if (intent.category !== 'IN_SCOPE_BI') {
      return { ...intent, ok: false };
    }

    const reformulation = intent.reformulation || this.businessScopeReformulation();
    if (!layer.tables.length) {
      return {
        ok: false,
        category: 'INSUFFICIENT_CONTEXT',
        reason:
          'Je ne peux pas générer de SQL, car aucune couche sémantique exploitable n’est disponible pour cette source de données. Générez et sauvegardez la couche sémantique avant de poser une question métier.',
        reformulation
      };
    }

    const relevance = this.assessSemanticQuestionRelevance(question, layer, retrievalHits);
    const normalized = this.normalizeSearchText(question);
    const scopeSignals = this.getQuestionScopeSignals(normalized, layer, retrievalHits);
    if (relevance.ok) {
      if (!scopeSignals.hasBusinessScopeSignal && !scopeSignals.hasAnalyticalSignal) {
        return {
          ok: false,
          category: 'OUT_OF_SCOPE',
          reason:
            'Je ne peux pas répondre à cette question, car elle ne formule pas une analyse BI claire sur les données métier disponibles.',
          reformulation
        };
      }
      return { ok: true, category: 'IN_SCOPE_BI', reason: '', reformulation };
    }

    if (!scopeSignals.hasBusinessScopeSignal && !scopeSignals.hasAnalyticalSignal) {
      return {
        ok: false,
        category: 'OUT_OF_SCOPE',
        reason:
          'Je ne peux pas répondre à cette question, car elle est hors du périmètre d’AskMe Studio. Je peux uniquement analyser les données métier disponibles dans le Data Warehouse.',
        reformulation
      };
    }

    return {
      ok: false,
      category: 'INSUFFICIENT_CONTEXT',
      reason:
        'Je ne peux pas répondre précisément à cette question, car les tables ou colonnes nécessaires ne sont pas disponibles dans la couche sémantique actuelle. Je peux analyser les ventes, clients, produits, commandes, régions, marges, statuts ou délais si ces données existent dans le Data Warehouse.',
      reformulation
    };
  }

  private businessScopeReformulation() {
    return 'Essayez par exemple : "Quel est le chiffre d’affaires par région ?", "Quelles catégories génèrent le plus de marge ?" ou "Quel est le délai moyen de livraison par statut ?".';
  }

  private invalidGenerateQueryResult(
    datasourceId: string | undefined,
    scope: ScopeValidationResult | IntentClassificationResult,
    extraWarnings: string[] = []
  ): GenerateQueryResult {
    const reason = scope.reason || this.businessScopeReformulation();
    return {
      status: 'cannot_answer',
      sql: '',
      language: 'sql',
      canExecute: false,
      confidence:
        scope.category === 'DESTRUCTIVE_REQUEST' || scope.category === 'OUT_OF_SCOPE' || scope.category === 'UNSUPPORTED_ANALYSIS'
          ? 0.98
          : 0.2,
      reasoning: `${reason}${scope.reformulation && !reason.includes(scope.reformulation) ? ` ${scope.reformulation}` : ''}`,
      usedEntities: [],
      provenance: this.emptyQueryProvenance(datasourceId, false, scope.category),
      warnings: Array.from(new Set([scope.category, reason, scope.reformulation, ...extraWarnings].filter(Boolean)))
    };
  }

  private getQuestionScopeSignals(
    normalizedQuestion: string,
    layer?: SemanticLayerResponse,
    retrievalHits: SemanticSearchHit[] = []
  ) {
    const staticBusinessDomain = this.hasAny(normalizedQuestion, this.businessDomainTerms());
    const analytical =
      this.hasGenericAnalyticsIntent(normalizedQuestion) ||
      this.hasAny(normalizedQuestion, [
        'analyse',
        'analyser',
        'analytics',
        'rapport',
        'report',
        'dashboard',
        'graphique',
        'visualise',
        'visualisation',
        'affiche',
        'liste',
        'montre',
        'show',
        'list',
        'compare',
        'comparaison',
        'par',
        'by',
        'frequent',
        'frequents',
        'frequente',
        'frequentes',
        'frequence',
        'populaire',
        'populaires',
        'recurrent',
        'recurrents',
        'top',
        'classement',
        'repartition',
        'distribution'
      ]);
    const semanticMatch = layer ? this.hasSemanticLayerSignal(normalizedQuestion, layer) : false;
    const retrievalMatch = retrievalHits.some((hit) =>
      this.semanticTextScore(normalizedQuestion, [hit.entityName, hit.mappedValue || '', hit.content]) > 0
    );

    return {
      staticBusinessDomain,
      analytical,
      semanticMatch,
      retrievalMatch,
      hasBusinessScopeSignal: staticBusinessDomain || semanticMatch || retrievalMatch,
      hasAnalyticalSignal: analytical
    };
  }

  private hasSemanticLayerSignal(normalizedQuestion: string, layer: SemanticLayerResponse) {
    const hasSearchMatch = this.buildSemanticSearchEntries(layer).some(
      (entry) => this.semanticTextScore(normalizedQuestion, [entry.entityName, entry.mappedValue || '', entry.content]) > 0
    );
    if (hasSearchMatch) return true;

    const tokens = normalizedQuestion.split(' ').filter((w) => w.length > 2);
    return layer.tables.some((table) => {
      const allTerms = [
        table.technicalName,
        table.businessName,
        ...table.columns.flatMap((c) => [c.technicalName, c.businessName])
      ].map((t) => this.normalizeSearchText(t));
      return tokens.some((token) => allTerms.some((term) => term.includes(token)));
    });
  }

  private businessDomainTerms() {
    return [
      'vente',
      'ventes',
      'sales',
      'chiffre affaires',
      'chiffre d affaires',
      'ca',
      'revenue',
      'revenu',
      'client',
      'clients',
      'customer',
      'customers',
      'produit',
      'produits',
      'product',
      'products',
      'commande',
      'commandes',
      'order',
      'orders',
      'region',
      'regions',
      'geographie',
      'segment',
      'segments',
      'vendeur',
      'vendeurs',
      'seller',
      'salesperson',
      'commercial',
      'commerciaux',
      'categorie',
      'categories',
      'category',
      'categories',
      'marque',
      'marques',
      'brand',
      'brands',
      'date',
      'dates',
      'statut',
      'statuts',
      'status',
      'marge',
      'marges',
      'margin',
      'delai',
      'delais',
      'livraison',
      'delivery',
      'remise',
      'discount',
      'quantite',
      'quantites',
      'quantity',
      'cout achat',
      'cost',
      'paiement',
      'paiements',
      'paiment',
      'paiments',
      'payment',
      'payments',
      'payment method',
      'payment_method',
      'methode',
      'methodes',
      'mode',
      'modes',
      'moyen',
      'moyens',
      'reglement',
      'reglements',
      'magasin',
      'magasins',
      'boutique',
      'boutiques',
      'store',
      'stores',
      'promotion',
      'promotions',
      'promo',
      'employe',
      'employes',
      'employee',
      'employees',
      'canal',
      'canaux',
      'channel',
      'channels',
      'frequent',
      'frequents',
      'frequence',
      'panier'
    ];
  }

  private isGeneralKnowledgeOrCreativeRequest(normalizedQuestion: string) {
    return this.hasAny(normalizedQuestion, [
      'qui est',
      'who is',
      'qu est ce que',
      'what is',
      'explique moi',
      'explain',
      'resume',
      'summarize',
      'traduis',
      'translate',
      'ecris',
      'write',
      'redige',
      'compose',
      'code',
      'programme',
      'poeme',
      'blague',
      'joke',
      'definition',
      'histoire de',
      'history of',
      'meilleur',
      'best',
      'conseille moi',
      'recommend'
    ]);
  }

  public async generateQuery(
    user: AuthUser,
    question: string,
    datasourceId?: string,
    textToSqlProvider?: TextToSqlProvider,
    sessionId?: string,
    dashboardId?: string
  ): Promise<GenerateQueryResult> {
    const conversationSession = this.resolveConversationSessionId(user.id, datasourceId, sessionId);
    const conversationWarnings = conversationSession.warning ? [conversationSession.warning] : [];

    if (!datasourceId) {
      return {
        status: 'cannot_answer',
        sql: '',
        language: 'sql',
        canExecute: false,
        confidence: 0.2,
        reasoning: 'Aucune source de données n’est sélectionnée. Sélectionnez une source pour qu’AskMe utilise sa couche sémantique.',
        usedEntities: [],
        provenance: this.emptyQueryProvenance(datasourceId, false, 'Aucune source de données sélectionnée.'),
        warnings: Array.from(new Set(['Aucune source de données sélectionnée.', ...conversationWarnings]))
      };
    }

    const previousContext = await this.conversationMemory.getContext(conversationSession.sessionId);
    const followUp = this.conversationContextResolver.resolveFollowUp(question, previousContext);
    let effectiveQuestion = question;
    let inheritedIntent = followUp.inheritedIntent;

    if (followUp.isFollowUp) {
      console.log(`[conversation-context] follow-up detected: ${conversationSession.sessionId}`);
    }

    if (followUp.action === 'answer_from_memory' && followUp.answer) {
      await this.saveConversationMemoryAnswer(
        conversationSession.sessionId,
        datasourceId,
        dashboardId,
        question,
        followUp.answer,
        previousContext,
        inheritedIntent
      );
      return {
        status: 'ok',
        sql: '',
        language: 'sql',
        canExecute: false,
        confidence: 0.94,
        reasoning: followUp.answer,
        usedEntities: [],
        provenance: this.emptyQueryProvenance(datasourceId, true, 'Réponse issue de la mémoire conversationnelle.'),
        warnings: Array.from(new Set(['Réponse issue de la mémoire conversationnelle.', ...conversationWarnings]))
      };
    }

    if (followUp.action === 'reuse_context_generate_sql' && followUp.resolvedQuestion) {
      console.log(`[conversation-context] context reused for SQL: ${conversationSession.sessionId}`);
      effectiveQuestion = followUp.resolvedQuestion;
    }

    const intent = this.classifyQuestionIntent(effectiveQuestion);
    if (intent.category !== 'IN_SCOPE_BI') {
      return this.invalidGenerateQueryResult(datasourceId, intent, conversationWarnings);
    }

    const layer = await this.getSemanticLayer(user, datasourceId);
    const retrievalHits = await this.searchSemanticVectorIndex(user.id, datasourceId, effectiveQuestion, layer);
    const scope = this.validateQuestionScope(effectiveQuestion, layer, retrievalHits, intent);
    if (!scope.ok) {
      return this.invalidGenerateQueryResult(datasourceId, scope, conversationWarnings);
    }

    const deterministicBusinessPlan = this.shouldPreferBusinessIntentPlan(effectiveQuestion, layer, inheritedIntent)
      ? this.buildSemanticQueryPlan(effectiveQuestion, layer, retrievalHits)
      : null;
    const llmPlanResult = deterministicBusinessPlan
      ? { warnings: [] }
      : await this.buildLlmSemanticQueryPlan(effectiveQuestion, layer, retrievalHits, textToSqlProvider, inheritedIntent);
    const plan = deterministicBusinessPlan || llmPlanResult.plan || this.buildSemanticQueryPlan(effectiveQuestion, layer, retrievalHits);
    const planningWarnings = llmPlanResult.warnings;
    if (!plan) {
      return {
        status: 'cannot_answer',
        sql: '',
        language: 'sql',
        canExecute: false,
        confidence: 0.25,
        reasoning:
          'No usable semantic layer was found for this datasource. Generate and save the semantic layer before asking data questions.',
        usedEntities: [],
        provenance: this.emptyQueryProvenance(datasourceId, false, 'No usable semantic layer was found.'),
        warnings: Array.from(new Set([...planningWarnings, 'No usable semantic layer was found.', ...conversationWarnings]))
      };
    }

    const validation = llmPlanResult.plan && llmPlanResult.validation ? llmPlanResult.validation : this.validateSemanticSql(plan.sql, layer, plan);
    if (!validation.ok) {
      return {
        status: 'cannot_answer',
        sql: '',
        language: 'sql',
        canExecute: false,
        confidence: 0.2,
        reasoning: `Generated SQL failed validation: ${validation.reason || 'unknown validation error'}.`,
        usedEntities: this.getPlanUsedEntities(plan),
        provenance: this.buildQueryProvenance(plan, datasourceId, validation, retrievalHits),
        warnings: Array.from(
          new Set([
            ...planningWarnings,
            `Generated SQL failed validation: ${validation.reason || 'unknown validation error'}.`,
            ...conversationWarnings
          ])
        )
      };
    }

    await this.saveConversationContextFromPlan(
      conversationSession.sessionId,
      datasourceId,
      dashboardId,
      question,
      plan,
      undefined,
      undefined,
      inheritedIntent
    );

    return {
      status: 'ok',
      sql: plan.sql,
      language: 'sql',
      canExecute: true,
      confidence: plan.confidence,
      reasoning: plan.reasoning,
      usedEntities: this.getPlanUsedEntities(plan),
      provenance: this.buildQueryProvenance(plan, datasourceId, validation, retrievalHits),
      warnings: Array.from(new Set([...planningWarnings, ...validation.warnings, ...conversationWarnings]))
    };
  }

  public async executeQuery(
    user: AuthUser,
    question: string,
    sql: string,
    datasourceId?: string,
    sessionId?: string,
    dashboardId?: string
  ): Promise<ExecuteQueryResult> {
    const startedAt = Date.now();
    let result: ExecuteQueryResult | undefined;
    let layer: SemanticLayerResponse | undefined;
    let plan: SemanticQueryPlan | undefined;
    const conversationSession = this.resolveConversationSessionId(user.id, datasourceId, sessionId);

    if (!datasourceId) {
      result = this.semanticFallbackResult(
        question,
        sql,
        undefined,
        undefined,
        startedAt,
        'Aucune source de données n’est sélectionnée. Sélectionnez une source avant d’exécuter une requête.',
        'cannot_answer',
        datasourceId
      );
      await this.addHistory(user.id, question, sql || '[not executed: no datasource]');
      return result;
    }

    if (datasourceId) {
      const intent = this.classifyQuestionIntent(question);
      if (intent.category !== 'IN_SCOPE_BI') {
        result = this.semanticFallbackResult(
          question,
          sql,
          undefined,
          undefined,
          startedAt,
          intent.reason,
          intent.category === 'DESTRUCTIVE_REQUEST' ? 'validation_error' : 'cannot_answer',
          datasourceId,
          this.failedValidation(intent.category)
        );
        await this.addHistory(user.id, question, sql || `[not executed: ${intent.category}]`);
        return {
          ...result,
          warnings: Array.from(new Set([intent.category, intent.reason, intent.reformulation]))
        };
      }

      layer = await this.getSemanticLayer(user, datasourceId);
      const retrievalHits = await this.searchSemanticVectorIndex(user.id, datasourceId, question, layer);
      const scope = this.validateQuestionScope(question, layer, retrievalHits, intent);
      if (!scope.ok) {
        result = this.semanticFallbackResult(
          question,
          sql,
          layer,
          undefined,
          startedAt,
          scope.reason,
          'cannot_answer',
          datasourceId,
          this.failedValidation(scope.category),
          retrievalHits
        );
        await this.addHistory(user.id, question, sql || `[not executed: ${scope.category}]`);
        return {
          ...result,
          warnings: Array.from(new Set([scope.category, scope.reason, scope.reformulation]))
        };
      }

      plan =
        this.buildSemanticQueryPlanFromSql(question, sql, layer, retrievalHits)?.plan ||
        this.buildSemanticQueryPlan(question, layer, retrievalHits) ||
        undefined;
      const context = await this.resolveDatasourceContext(user.id, datasourceId);
      const validation = this.validateSemanticSql(sql, layer, plan);

      if (!validation.ok) {
        result = this.semanticFallbackResult(
          question,
          sql,
          layer,
          plan,
          startedAt,
          `Query rejected by semantic validation: ${validation.reason || 'unknown validation error'}.`,
          'validation_error',
          datasourceId,
          validation,
          retrievalHits
        );
      } else if (context.type === 'postgresql') {
        try {
          result = await this.executePostgresSemanticSelect(
            context,
            question,
            sql,
            plan,
            startedAt,
            datasourceId,
            validation,
            retrievalHits
          );
        } catch (error) {
          result = this.semanticFallbackResult(
            question,
            sql,
            layer,
            plan,
            startedAt,
            `PostgreSQL execution failed: ${error instanceof Error ? error.message : 'unknown error'}.`,
            'execution_error',
            datasourceId,
            validation,
            retrievalHits
          );
        }
      } else {
        result = this.semanticFallbackResult(
          question,
          sql,
          layer,
          plan,
          startedAt,
          `Execution is not yet available for datasource type ${context.type}.`,
          'cannot_answer',
          datasourceId,
          validation,
          retrievalHits
        );
      }
    }

    if (!result) {
      result = this.semanticFallbackResult(
        question,
        sql,
        layer,
        plan,
        startedAt,
        'La requête ne peut pas être exécutée avec le contexte sémantique disponible.',
        'cannot_answer',
        datasourceId
      );
    }

    await this.addHistory(user.id, question, sql);
    if (datasourceId) {
      await this.saveConversationContextFromPlan(conversationSession.sessionId, datasourceId, dashboardId, question, plan, result, sql);
    }
    return result;
  }

  private resolveConversationSessionId(userId: string, datasourceId?: string, sessionId?: string) {
    const sanitized = String(sessionId || '')
      .trim()
      .replace(/[^a-zA-Z0-9:_-]/g, '_')
      .slice(0, 160);
    if (sanitized) return { sessionId: sanitized };
    return {
      sessionId: `askme_temp_${userId}_${datasourceId || 'no_datasource'}_${this.newId('session')}`,
      warning: 'Aucun sessionId conversationnel fourni ; une session temporaire backend a été utilisée.'
    };
  }

  private shouldPreferBusinessIntentPlan(question: string, layer?: SemanticLayerResponse, inheritedIntent?: ConversationIntent) {
    const intent = this.detectBusinessIntent(question, layer);
    return Boolean(
      (intent.entity && (intent.ranking || intent.metric)) ||
        inheritedIntent?.entity ||
        inheritedIntent?.metric ||
        inheritedIntent?.groupBy?.length
    );
  }

  private async saveConversationMemoryAnswer(
    sessionId: string,
    datasourceId: string,
    dashboardId: string | undefined,
    question: string,
    answer: string,
    previousContext?: ConversationContext,
    inheritedIntent?: ConversationIntent
  ) {
    const now = new Date().toISOString();
    const turn = {
      question,
      intent: inheritedIntent || previousContext?.lastIntent,
      resultSchema: previousContext?.lastResultSchema || [],
      resultPreview: previousContext?.lastResultPreview || [],
      answer,
      createdAt: now
    };
    await this.conversationMemory.saveContext(sessionId, {
      ...(previousContext || {
        sessionId,
        datasourceId,
        createdAt: now
      }),
      sessionId,
      datasourceId,
      dashboardId: dashboardId || previousContext?.dashboardId,
      lastQuestion: question,
      lastAnswer: answer,
      lastIntent: inheritedIntent || previousContext?.lastIntent,
      history: [...(previousContext?.history || []), turn].slice(-5),
      updatedAt: now,
      createdAt: previousContext?.createdAt || now
    });
  }

  private async saveConversationContextFromPlan(
    sessionId: string,
    datasourceId: string,
    dashboardId: string | undefined,
    question: string,
    plan: SemanticQueryPlan | undefined,
    result?: ExecuteQueryResult,
    sqlOverride?: string,
    inheritedIntent?: ConversationIntent
  ) {
    const previousContext = await this.conversationMemory.getContext(sessionId);
    const now = new Date().toISOString();
    const sql = sqlOverride || plan?.sql || previousContext?.lastSql;
    const intent = this.mergeConversationIntent(this.extractConversationIntent(plan, sql), inheritedIntent, previousContext?.lastIntent);
    const resultSchema = result?.columns || previousContext?.lastResultSchema || [];
    const resultPreview = result?.rows?.slice(0, 5) || previousContext?.lastResultPreview || [];
    const answer = result?.narrative || previousContext?.lastAnswer;
    const turn = {
      question,
      sql,
      intent,
      resultSchema,
      resultPreview,
      answer,
      createdAt: now
    };

    await this.conversationMemory.saveContext(sessionId, {
      sessionId,
      datasourceId,
      dashboardId: dashboardId || previousContext?.dashboardId,
      lastQuestion: question,
      lastSql: sql,
      lastIntent: intent,
      lastResultSchema: resultSchema,
      lastResultPreview: resultPreview,
      lastAnswer: answer,
      history: [...(previousContext?.history || []), turn].slice(-5),
      createdAt: previousContext?.createdAt || now,
      updatedAt: now
    });
  }

  private mergeConversationIntent(
    current?: ConversationIntent,
    inherited?: ConversationIntent,
    previous?: ConversationIntent
  ): ConversationIntent | undefined {
    const merged = {
      ...(previous || {}),
      ...(inherited || {}),
      ...(current || {}),
      groupBy: Array.from(new Set([...(previous?.groupBy || []), ...(inherited?.groupBy || []), ...(current?.groupBy || [])]))
    };
    return Object.values(merged).some((value) => (Array.isArray(value) ? value.length > 0 : value !== undefined)) ? merged : undefined;
  }

  private extractConversationIntent(plan?: SemanticQueryPlan, sql?: string): ConversationIntent | undefined {
    if (!plan && !sql) return undefined;
    const metric = plan?.measureColumn?.technicalName || plan?.matchedKpi?.name || this.extractMetricFromSql(sql || '');
    const groupBy = plan?.dimensionColumn?.technicalName ? [plan.dimensionColumn.technicalName] : this.extractGroupByFromSql(sql || '');
    const sort = /\border\s+by\b[\s\S]*\basc\b/i.test(sql || plan?.sql || '')
      ? 'asc'
      : /\border\s+by\b[\s\S]*\bdesc\b/i.test(sql || plan?.sql || '')
        ? 'desc'
        : undefined;
    const topN = Number((sql || plan?.sql || '').match(/\blimit\s+(\d+)\b/i)?.[1] || '') || undefined;
    const formula = plan?.metricFormula || sql || '';
    const aggregation = /\bavg\s*\(/i.test(formula) ? 'avg' : /\bcount\s*\(/i.test(formula) ? 'count' : /\bsum\s*\(/i.test(formula) ? 'sum' : undefined;
    const entity = this.inferConversationEntity(plan);

    return {
      entity,
      metric,
      aggregation,
      ranking: Boolean(sort),
      sort,
      topN,
      groupBy
    };
  }

  private inferConversationEntity(plan?: SemanticQueryPlan) {
    const text = this.normalizeSearchText(
      [plan?.dimensionTable?.technicalName, plan?.dimensionTable?.businessName, plan?.dimensionColumn?.technicalName].filter(Boolean).join(' ')
    );
    if (this.hasAny(text, ['client', 'customer'])) return 'client';
    if (this.hasAny(text, ['produit', 'product', 'article'])) return 'produit';
    if (this.hasAny(text, ['region', 'geographie', 'geo', 'zone'])) return 'region';
    return undefined;
  }

  private extractMetricFromSql(sql: string) {
    return sql.match(/\b(?:sum|avg|count)\s*\(\s*(?:"[^"]+"\.){0,2}"?([a-zA-Z0-9_]+)"?/i)?.[1];
  }

  private extractGroupByFromSql(sql: string) {
    const groupBy = sql.match(/\bgroup\s+by\s+([\s\S]*?)(?:\border\s+by\b|\blimit\b|;|$)/i)?.[1];
    if (!groupBy) return [];
    return groupBy
      .split(',')
      .map((part) => this.unquoteSqlIdentifier(this.unqualifyName(part.trim())))
      .filter(Boolean);
  }

  private async buildLlmSemanticQueryPlan(
    question: string,
    layer: SemanticLayerResponse,
    retrievalHits: SemanticSearchHit[] = [],
    requestedProvider?: TextToSqlProvider,
    conversationIntent?: ConversationIntent
  ): Promise<LlmSqlPlanResult> {
    const providerMode = this.normalizeTextToSqlProvider(requestedProvider || process.env.TEXT_TO_SQL_PROVIDER);
    if (providerMode === 'static') return { warnings: [] };

    const providers = this.getEnabledLlmTextToSqlProviders(providerMode);
    if (!providers.length) {
      return {
        warnings: [`LLM Text-to-SQL ignoré : le mode fournisseur "${providerMode}" n’a aucun fournisseur activé.`]
      };
    }

    const warnings: string[] = [];
    for (const provider of providers) {
      const candidate = await this.requestLlmSqlCandidate(provider, question, layer, retrievalHits, conversationIntent);
      warnings.push(...candidate.warnings);
      if (!candidate.sql) continue;

      const planned = this.buildSemanticQueryPlanFromSql(question, candidate.sql, layer, retrievalHits, candidate);
      if (!planned?.plan) {
        warnings.push(`Text-to-SQL ${provider} ignoré : le SQL ne correspond pas à la couche sémantique.`);
        continue;
      }

      const validation = this.validateSemanticSql(planned.plan.sql, layer, planned.plan);
      if (validation.ok) {
        return {
          plan: planned.plan,
          validation,
          warnings: Array.from(
            new Set([
              ...warnings,
              ...validation.warnings,
              `Text-to-SQL généré par ${candidate.provider}/${candidate.model} et validé avec la couche sémantique.`
            ])
          )
        };
      }

      warnings.push(
        `Candidat Text-to-SQL ${provider} rejeté par la validation : ${validation.reason || 'erreur de validation inconnue'}.`
      );
    }

    warnings.push('Le LLM Text-to-SQL n’a pas produit une requête validée ; le planificateur sémantique de secours a été utilisé.');
    return { warnings: Array.from(new Set(warnings)) };
  }

  private normalizeTextToSqlProvider(value: unknown): TextToSqlProvider {
    const normalized = String(value || 'groq').toLowerCase().trim();
    if (normalized === 'ollama' || normalized === 'groq' || normalized === 'openrouter' || normalized === 'auto') {
      return normalized;
    }
    return 'static';
  }

  private getEnabledLlmTextToSqlProviders(providerMode: TextToSqlProvider): LlmTextToSqlProvider[] {
    const requested: LlmTextToSqlProvider[] =
      providerMode === 'auto'
        ? ['ollama', 'groq', 'openrouter']
        : providerMode === 'ollama' || providerMode === 'groq' || providerMode === 'openrouter'
          ? [providerMode]
          : [];

    return requested.filter((provider) => {
      if (provider === 'ollama') return this.isEnvEnabled('TEXT_TO_SQL_OLLAMA_ENABLED', true);
      if (provider === 'groq') return this.isEnvEnabled('TEXT_TO_SQL_GROQ_ENABLED', true);
      return this.isEnvEnabled('TEXT_TO_SQL_OPENROUTER_ENABLED', true);
    });
  }

  private isEnvEnabled(name: string, defaultValue: boolean) {
    const raw = process.env[name];
    if (raw === undefined) return defaultValue;
    const normalized = raw.toLowerCase().trim();
    if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false;
    return defaultValue;
  }

  private async requestLlmSqlCandidate(
    provider: LlmTextToSqlProvider,
    question: string,
    layer: SemanticLayerResponse,
    retrievalHits: SemanticSearchHit[],
    conversationIntent?: ConversationIntent
  ): Promise<LlmSqlCandidate> {
    const model =
      provider === 'ollama'
        ? process.env.OLLAMA_SQL_MODEL || process.env.TEXT_TO_SQL_MODEL || 'qwen2.5-coder:7b'
        : provider === 'openrouter'
          ? process.env.OPENROUTER_SQL_MODEL ||
            process.env.TEXT_TO_SQL_MODEL ||
            process.env.OPENROUTER_MODEL ||
            'openai/gpt-4o-mini'
          : process.env.GROQ_SQL_MODEL || process.env.TEXT_TO_SQL_MODEL || process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
    const warnings: string[] = [];
    const systemPrompt = [
      'You are AskMe Studio Text-to-SQL.',
      'Return JSON only. Do not wrap it in Markdown.',
      'Default user-facing language is French. If the user explicitly asks another language, use that language.',
      'The reasoning and warnings fields must be written in the user-facing language.',
      'Generate one read-only PostgreSQL SELECT query grounded only in the semantic context.',
      'Use only listed technical table names, technical column names, and KPI formulas.',
      'Do not use table aliases, subqueries, comments, mutations, DDL, CTEs, or multiple statements.',
      'Never use SELECT *.',
      'Always include LIMIT between 1 and 500.',
      'Return an analytics intent and chartType as a presentation contract for the frontend.',
      'Choose chartType table for record lists, detailed listings, or many descriptive columns.',
      'Choose chartType line for trends or evolution over a date/time column.',
      'Choose chartType pie for share/proportion/part/repartition graphique questions with a dimension and one metric.',
      'Choose chartType bar for rankings, comparisons, top values, or categorical breakdowns.',
      'For record listing requests, select the requested non-identifier columns and use LIMIT 100.',
      'If a list request does not name columns, select descriptive dimension/text columns such as name, label, email, or phone.',
      'For aggregations, prefer saved KPI formulas when relevant.',
      'When the context exposes relationships, join fact tables to dimension tables through those keys and use the dimension label column for breakdowns.',
      'If the question cannot be answered from the semantic context, return {"status":"cannot_answer","sql":"","confidence":0,"reasoning":"...","warnings":["..."]}.'
    ].join('\n');
    let semanticContext = this.buildTextToSqlPromptContext(question, layer, retrievalHits);
    const maxPromptContextChars = semanticRetrievalConfig.context.maxPromptContextChars;
    if (JSON.stringify(semanticContext).length > maxPromptContextChars) {
      semanticContext = {
        ...semanticContext,
        tables: semanticContext.tables.slice(0, semanticRetrievalConfig.compactContext.maxTables).map((table) => ({
          ...table,
          description: '',
          columns: table.columns.slice(0, semanticRetrievalConfig.compactContext.maxColumnsPerTable)
        })),
        kpis: semanticContext.kpis.slice(0, semanticRetrievalConfig.compactContext.maxKpis),
        synonyms: semanticContext.synonyms.slice(0, semanticRetrievalConfig.compactContext.maxSynonyms),
        relationships: semanticContext.relationships.slice(0, semanticRetrievalConfig.compactContext.maxRelationships),
        retrievalHints: semanticContext.retrievalHints.slice(0, semanticRetrievalConfig.compactContext.maxRetrievalHints)
      };
    }

    const userPrompt = JSON.stringify(
      {
        question,
        conversationIntent,
        conversationInstruction: conversationIntent
          ? 'This is a follow-up question. Reuse the inherited conversationIntent as business constraints for metric, entity, ranking, sort, topN and groupBy.'
          : undefined,
        semanticContext,
        outputSchema: {
          status: 'ok | cannot_answer',
          sql: 'PostgreSQL SELECT with LIMIT',
          intent: 'metric | time_series | breakdown | list_records',
          chartType: 'line | bar | pie | table',
          confidence: '0.0 to 1.0',
          reasoning: 'short grounded explanation in French by default',
          warnings: ['short warnings in French by default']
        }
      },
      null,
      2
    );

    try {
      const content =
        provider === 'ollama'
          ? await this.callOllamaTextToSql(model, systemPrompt, userPrompt)
          : provider === 'openrouter'
            ? await this.callOpenRouterTextToSql(model, systemPrompt, userPrompt)
            : await this.callGroqTextToSql(model, systemPrompt, userPrompt);
      const parsed = this.parseLlmSqlCandidate(content);
      const rawStatus = String(parsed.status || '').toLowerCase();
      if (rawStatus === 'cannot_answer' || !String(parsed.sql || '').trim()) {
        return {
          provider,
          model,
          sql: '',
          confidence: 0,
          reasoning: String(parsed.reasoning || `${provider} ne peut pas répondre avec le contexte sémantique disponible.`),
          warnings: [
            ...this.asStringArray(parsed.warnings),
            `Text-to-SQL ${provider}/${model} a retourné cannot_answer.`
          ]
        };
      }

      return {
        provider,
        model,
        sql: this.ensureSemanticSqlLimit(String(parsed.sql || '')),
        intent: this.normalizeSemanticQueryIntent(parsed.intent),
        chartType: this.normalizeChartType(parsed.chartType),
        confidence: this.clampConfidence(Number(parsed.confidence || 0.68)),
        reasoning: String(parsed.reasoning || `Généré par ${provider}/${model} à partir du contexte sémantique.`).slice(0, 800),
        warnings: this.asStringArray(parsed.warnings)
      };
    } catch (error) {
      warnings.push(`Text-to-SQL ${provider}/${model} ignoré : ${error instanceof Error ? error.message : 'erreur inconnue'}.`);
      return {
        provider,
        model,
        sql: '',
        confidence: 0,
        reasoning: '',
        warnings
      };
    }
  }

  private async callOllamaTextToSql(model: string, systemPrompt: string, userPrompt: string) {
    const baseUrl = String(process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/+$/g, '');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.getTextToSqlTimeoutMs());
    try {
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          stream: false,
          options: {
            temperature: aiGenerationConfig.sql.temperature,
            top_p: aiGenerationConfig.sql.topP,
            num_predict: aiGenerationConfig.sql.maxCompletionTokens,
            stop: aiGenerationConfig.sql.stop
          },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ]
        })
      });
      if (!response.ok) throw new Error(`Ollama returned ${response.status}`);
      const body = (await response.json()) as { message?: { content?: string }; response?: string };
      return String(body.message?.content || body.response || '').trim();
    } finally {
      clearTimeout(timeout);
    }
  }

  private async callGroqTextToSql(model: string, systemPrompt: string, userPrompt: string) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || apiKey === 'change-me') throw new Error('GROQ_API_KEY is not configured');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.getTextToSqlTimeoutMs());
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json'
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          temperature: aiGenerationConfig.sql.temperature,
          top_p: aiGenerationConfig.sql.topP,
          max_tokens: aiGenerationConfig.sql.maxCompletionTokens,
          frequency_penalty: aiGenerationConfig.sql.frequencyPenalty,
          presence_penalty: aiGenerationConfig.sql.presencePenalty,
          stop: aiGenerationConfig.sql.stop,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ]
        })
      });
      if (!response.ok) throw new Error(`Groq returned ${response.status}`);
      const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return String(body.choices?.[0]?.message?.content || '').trim();
    } finally {
      clearTimeout(timeout);
    }
  }

  private async callOpenRouterTextToSql(model: string, systemPrompt: string, userPrompt: string) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey || apiKey === 'change-me') throw new Error('OPENROUTER_API_KEY is not configured');

    const baseUrl = String(process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/g, '');
    const headers: Record<string, string> = {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json'
    };
    const referer = process.env.OPENROUTER_HTTP_REFERER || process.env.OPENROUTER_SITE_URL;
    if (referer) headers['HTTP-Referer'] = referer;
    headers['X-Title'] = process.env.OPENROUTER_APP_TITLE || 'AskMe Studio';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.getTextToSqlTimeoutMs());
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          model,
          temperature: aiGenerationConfig.sql.temperature,
          top_p: aiGenerationConfig.sql.topP,
          max_tokens: aiGenerationConfig.sql.maxCompletionTokens,
          frequency_penalty: aiGenerationConfig.sql.frequencyPenalty,
          presence_penalty: aiGenerationConfig.sql.presencePenalty,
          stop: aiGenerationConfig.sql.stop,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ]
        })
      });
      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(`OpenRouter returned ${response.status}${errorBody ? `: ${errorBody.slice(0, 240)}` : ''}`);
      }
      const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return String(body.choices?.[0]?.message?.content || '').trim();
    } finally {
      clearTimeout(timeout);
    }
  }

  private getTextToSqlTimeoutMs() {
    const value = aiGenerationConfig.fallback.timeoutMs;
    return Number.isFinite(value) && value >= 1000 ? value : 15000;
  }

  private parseLlmSqlCandidate(content: string): Record<string, unknown> {
    const cleaned = String(content || '').trim();
    if (!cleaned) throw new Error('empty LLM response');
    const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] || cleaned;
    const start = fenced.indexOf('{');
    const end = fenced.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('LLM response did not contain a JSON object');
    const parsed = JSON.parse(fenced.slice(start, end + 1)) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('LLM response JSON was not an object');
    }
    return parsed as Record<string, unknown>;
  }

  private buildTextToSqlPromptContext(
    question: string,
    layer: SemanticLayerResponse,
    retrievalHits: SemanticSearchHit[]
  ) {
    const normalizedQuestion = this.normalizeSearchText(question);
    const relationships = this.inferSemanticRelationships(layer);
    const retrievalTableNames = new Set(
      retrievalHits
        .map((hit) =>
          String(
            hit.metadata.tableTechnicalName ||
            (hit.entityType === 'table' ? hit.metadata.technicalName || hit.mappedValue : '')
          )
        )
        .filter(Boolean)
    );
    const scoredTables = layer.tables
      .map((table) => ({
        table,
        score:
          this.semanticTextScore(normalizedQuestion, [
            table.technicalName,
            table.businessName,
            table.description,
            ...table.columns.flatMap((column) => [column.technicalName, column.businessName])
          ]) + (retrievalTableNames.has(table.technicalName) ? 8 : 0)
      }))
      .sort((a, b) => b.score - a.score);
    const selectedTables = scoredTables
      .filter((item, index) => item.score > 0 || index < 3)
      .slice(0, semanticRetrievalConfig.context.maxTables)
      .map((item) => item.table);
    const selectedTableNames = new Set(selectedTables.map((table) => table.technicalName));
    const selectedKpis = layer.kpis
      .map((kpi) => ({
        kpi,
        score:
          this.semanticTextScore(normalizedQuestion, [kpi.name, kpi.description, kpi.sqlFormula]) +
          (this.findTableForKpiFormula(kpi.sqlFormula, layer.tables.flatMap((table) => this.columnsForTable(table))) &&
            selectedTableNames.has(
              this.findTableForKpiFormula(kpi.sqlFormula, layer.tables.flatMap((table) => this.columnsForTable(table)))!
                .technicalName
            )
            ? 4
            : 0)
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, semanticRetrievalConfig.context.maxKpis)
      .map((item) => item.kpi);
    const selectedSynonyms = layer.synonyms
      .filter((synonym) =>
        [synonym.term, synonym.mappedValue].some((value) =>
          this.normalizeSearchText(question).includes(this.normalizeSearchText(value))
        )
      )
      .slice(0, semanticRetrievalConfig.context.maxSynonyms);

    return {
      tables: selectedTables.map((table) => ({
        technicalName: table.technicalName,
        businessName: table.businessName,
        description: String(table.description || '').slice(0, 120),
        tableType: table.tableType,
        columns: this.rankColumnsForTextToSql(normalizedQuestion, table, retrievalHits)
          .slice(0, semanticRetrievalConfig.context.maxColumnsPerTable)
          .map((column) => ({
            technicalName: column.technicalName,
            businessName: column.businessName,
            semanticType: column.semanticType,
            dataType: column.dataType,
            isNullable: column.isNullable
          }))
      })),
      kpis: selectedKpis.map((kpi) => ({
        name: kpi.name,
        sqlFormula: kpi.sqlFormula,
        description: String(kpi.description || '').slice(0, 120),
        formatting: kpi.formatting
      })),
      synonyms: selectedSynonyms.map((synonym) => ({
        term: synonym.term,
        mappedValue: synonym.mappedValue
      })),
      relationships: relationships
        .filter((relationship) => selectedTableNames.has(relationship.fromTableTechnicalName) || selectedTableNames.has(relationship.toTableTechnicalName))
        .slice(0, semanticRetrievalConfig.context.maxRelationships)
        .map((relationship) => ({
          fromTableTechnicalName: relationship.fromTableTechnicalName,
          fromColumnTechnicalName: relationship.fromColumnTechnicalName,
          toTableTechnicalName: relationship.toTableTechnicalName,
          toColumnTechnicalName: relationship.toColumnTechnicalName,
          joinType: relationship.joinType,
          cardinality: relationship.cardinality,
          confidence: Number(relationship.confidence.toFixed(3))
        })),
      retrievalHints: retrievalHits.slice(0, semanticRetrievalConfig.context.maxRetrievalHints).map((hit) => ({
        entityType: hit.entityType,
        entityName: hit.entityName,
        mappedValue: hit.mappedValue,
        score: Number(hit.score.toFixed(3)),
        technicalName: hit.metadata.technicalName,
        tableTechnicalName: hit.metadata.tableTechnicalName
      }))
    };
  }

  private rankColumnsForTextToSql(
    normalizedQuestion: string,
    table: SemanticTable,
    retrievalHits: SemanticSearchHit[]
  ) {
    const retrievalColumnNames = new Set(
      retrievalHits
        .filter((hit) => hit.entityType === 'column')
        .map((hit) => String(hit.metadata.technicalName || ''))
        .filter(Boolean)
    );
    return table.columns
      .map((column) => ({
        column,
        score:
          this.semanticTextScore(normalizedQuestion, [
            column.technicalName,
            column.businessName,
            ...this.columnQuestionAliases(column)
          ]) +
          (retrievalColumnNames.has(column.technicalName) ? 8 : 0) +
          (column.semanticType === 'identifier' ? -1 : 0)
      }))
      .sort((a, b) => b.score - a.score)
      .map((item) => item.column);
  }

  private buildSemanticQueryPlanFromSql(
    question: string,
    sql: string,
    layer: SemanticLayerResponse,
    retrievalHits: SemanticSearchHit[] = [],
    candidate?: LlmSqlCandidate
  ): LlmSqlPlanResult | undefined {
    const ast = this.parseSemanticSelect(sql);
    const table = this.findSemanticTableBySqlReference(layer, ast.referencedTables[0]);
    if (!table) return undefined;

    const referencedColumns = this.findReferencedSemanticColumns(sql, layer);
    const tableColumns = referencedColumns.filter((item) => item.table === table).map((item) => item.column);
    const matchedKpi = this.findKpiReferencedBySql(sql, layer, referencedColumns);
    const measureColumn =
      tableColumns.find((column) => column.semanticType === 'measure') ||
      (matchedKpi && this.findColumnForKpiFormula(matchedKpi.sqlFormula, this.columnsForTable(table)));
    const dateColumn = tableColumns.find((column) => column.semanticType === 'date');
    const dimensionSelection = this.findGroupedDimensionSelectionFromSql(sql, table, referencedColumns);
    const dimensionColumn = dimensionSelection?.column || this.findGroupedDimensionFromSql(sql, table, tableColumns);
    const dimensionTable = dimensionSelection?.table;
    const joinRelationship = dimensionTable && dimensionTable.technicalName !== table.technicalName ? this.findSemanticRelationshipBetweenTables(layer, table, dimensionTable) : undefined;
    const hasAggregate = ast.functions.some((name: string) => ['sum', 'avg', 'count', 'min', 'max'].includes(name));
    const intent =
      candidate?.intent ||
      (dateColumn && hasAggregate
        ? 'time_series'
        : dimensionColumn && hasAggregate
          ? 'breakdown'
          : hasAggregate
            ? 'metric'
            : 'list_records');
    const selectedColumns =
      intent === 'list_records'
        ? tableColumns.filter((column) => column.semanticType !== 'identifier').slice(0, 8)
        : undefined;
    const metricAlias = this.extractMetricAliasFromSql(sql, matchedKpi, measureColumn, intent);
    const chartType =
      candidate?.chartType ||
      this.inferChartTypeFromSignals({
        question,
        intent,
        hasDate: Boolean(dateColumn),
        hasDimension: Boolean(dimensionColumn)
      });
    const filters = this.extractSemanticFiltersFromSql(sql, table);
    const providerDetails = candidate ? ` Généré par ${candidate.provider}/${candidate.model}.` : '';
    const reasoning = candidate?.reasoning
      ? `${candidate.reasoning}${providerDetails}`
      : `SQL fourni rattaché à la table de la couche sémantique "${table.businessName}" (${table.technicalName}).`;

    return {
      plan: {
        intent,
        sql: this.ensureSemanticSqlLimit(sql),
        confidence: this.clampConfidence(candidate?.confidence || 0.58),
        reasoning,
        table,
        metricAlias,
        metricFormula: matchedKpi?.sqlFormula || (measureColumn ? `SUM(${this.quoteSqlIdentifier(measureColumn.technicalName)})` : ''),
        matchedKpi,
        measureColumn,
        selectedColumns,
        dimensionTable,
        dimensionColumn,
        joinRelationship,
        dateColumn,
        filters,
        chartType
      },
      warnings: []
    };
  }

  private findSemanticTableBySqlReference(layer: SemanticLayerResponse, reference: string | undefined) {
    if (!reference) return undefined;
    return layer.tables.find(
      (table) =>
        this.normalizeSqlReference(table.technicalName) === this.normalizeSqlReference(reference) ||
        this.normalizeSqlReference(this.unqualifyName(table.technicalName)) === this.normalizeSqlReference(reference)
    );
  }

  private findReferencedSemanticColumns(sql: string, layer: SemanticLayerResponse) {
    const identifiers = new Set(this.extractSqlIdentifiers(sql));
    return layer.tables.flatMap((table) =>
      table.columns
        .filter((column) => identifiers.has(column.technicalName))
        .map((column) => ({
          table,
          column
        }))
    );
  }

  private findKpiReferencedBySql(
    sql: string,
    layer: SemanticLayerResponse,
    referencedColumns: Array<{ table: SemanticTable; column: SemanticColumn }>
  ) {
    const normalizedSql = this.normalizeSearchText(sql);
    const referencedNames = new Set(referencedColumns.map((item) => item.column.technicalName));
    return layer.kpis.find((kpi) => {
      const formulaColumns = this.extractSqlIdentifiers(kpi.sqlFormula).filter((identifier) =>
        layer.tables.some((table) => table.columns.some((column) => column.technicalName === identifier))
      );
      return (
        normalizedSql.includes(this.normalizeSearchText(kpi.name)) ||
        (formulaColumns.length > 0 && formulaColumns.every((column) => referencedNames.has(column)))
      );
    });
  }

  private findGroupedDimensionFromSql(sql: string, table: SemanticTable, referencedColumns: SemanticColumn[]) {
    const groupBy = sql.match(/\bgroup\s+by\b([\s\S]*?)(?:\border\s+by\b|\blimit\b|;|$)/i)?.[1] || '';
    const groupIdentifiers = new Set(this.extractSqlIdentifiers(groupBy));
    return (
      referencedColumns.find(
        (column) =>
          column.semanticType === 'dimension' &&
          (groupIdentifiers.has(column.technicalName) || this.normalizeSearchText(sql).includes(this.normalizeSearchText(column.businessName)))
      ) || table.columns.find((column) => column.semanticType === 'dimension' && groupIdentifiers.has(column.technicalName))
    );
  }

  private findGroupedDimensionSelectionFromSql(
    sql: string,
    table: SemanticTable,
    referencedColumns: Array<{ table: SemanticTable; column: SemanticColumn }>
  ) {
    const groupBy = sql.match(/\bgroup\s+by\b([\s\S]*?)(?:\border\s+by\b|\blimit\b|;|$)/i)?.[1] || '';
    const groupIdentifiers = new Set(this.extractSqlIdentifiers(groupBy));
    const normalizedSql = this.normalizeSearchText(sql);
    return (
      referencedColumns
        .filter((item) => item.column.semanticType === 'dimension' || this.isTextType(item.column.dataType))
        .map((item) => ({
          ...item,
          score:
            (groupIdentifiers.has(item.column.technicalName) ? 8 : 0) +
            (normalizedSql.includes(this.normalizeSearchText(item.column.businessName)) ? 4 : 0) +
            (item.table.technicalName !== table.technicalName ? 2 : 0)
        }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)[0] || undefined
    );
  }

  private findSemanticRelationshipBetweenTables(
    layer: SemanticLayerResponse,
    fromTable: SemanticTable,
    toTable: SemanticTable
  ) {
    return this.inferSemanticRelationships(layer).find(
      (relationship) =>
        this.normalizeSqlReference(relationship.fromTableTechnicalName) === this.normalizeSqlReference(fromTable.technicalName) &&
        this.normalizeSqlReference(relationship.toTableTechnicalName) === this.normalizeSqlReference(toTable.technicalName)
    );
  }

  private extractMetricAliasFromSql(
    sql: string,
    matchedKpi: SemanticKpi | undefined,
    measureColumn: SemanticColumn | undefined,
    intent: SemanticQueryPlan['intent']
  ) {
    const aliases = this.extractSqlAliases(sql);
    if (intent !== 'list_records' && aliases.length) return this.toSqlAlias(aliases[aliases.length - 1]);
    if (matchedKpi) return this.toSqlAlias(matchedKpi.name);
    if (measureColumn) return this.toSqlAlias(`Total ${measureColumn.businessName || measureColumn.technicalName}`);
    return intent === 'list_records' ? 'records' : 'semantic_answer';
  }

  private extractSemanticFiltersFromSql(sql: string, table: SemanticTable): SemanticQueryFilter[] {
    const where = sql.match(/\bwhere\b([\s\S]*?)(?:\bgroup\s+by\b|\border\s+by\b|\blimit\b|;|$)/i)?.[1] || '';
    if (!where) return [];
    return table.columns
      .map((column) => {
        const pattern = new RegExp(
          `"${this.escapeRegExp(column.technicalName)}"|\\b${this.escapeRegExp(column.technicalName)}\\b`,
          'i'
        );
        if (!pattern.test(where)) return undefined;
        const value = where.match(/'(.*?)'/)?.[1] || '';
        return value ? { column, value } : undefined;
      })
      .filter((filter): filter is SemanticQueryFilter => Boolean(filter))
      .slice(0, 3);
  }

  private normalizeSemanticQueryIntent(value: unknown): SemanticQueryPlan['intent'] | undefined {
    const normalized = String(value || '').toLowerCase().trim();
    if (['metric', 'time_series', 'breakdown', 'list_records'].includes(normalized)) {
      return normalized as SemanticQueryPlan['intent'];
    }
    return undefined;
  }

  private normalizeChartType(value: unknown): ExecuteQueryResult['chartType'] | undefined {
    const normalized = String(value || '').toLowerCase().trim();
    if (normalized === 'line' || normalized === 'bar' || normalized === 'pie' || normalized === 'donut' || normalized === 'table') {
      return normalized === 'donut' ? 'pie' : normalized;
    }
    return undefined;
  }

  private inferChartTypeFromSignals(input: {
    question?: string;
    intent?: SemanticQueryPlan['intent'];
    hasDate?: boolean;
    hasDimension?: boolean;
    columns?: string[];
    rows?: Array<Record<string, string | number>>;
  }): ExecuteQueryResult['chartType'] {
    const normalized = this.normalizeSearchText(input.question || '');
    const columns = input.columns || [];
    const rows = input.rows || [];
    const numericColumns = columns.filter((column) =>
      rows.some((row) => typeof row[column] === 'number' || Number.isFinite(Number(row[column])))
    );

    const scores: Record<ExecuteQueryResult['chartType'], number> = {
      table: 0,
      bar: 0,
      line: 0,
      pie: 0
    };

    const add = (chartType: ExecuteQueryResult['chartType'], weight: number) => {
      scores[chartType] += weight;
    };

    const textWeight = (terms: string[]) => this.semanticTextScore(normalized, terms);
    add('table', input.intent === 'list_records' ? 12 : 0);
    add('table', columns.length >= 3 ? 4 : 0);
    add('table', numericColumns.length === 0 && columns.length > 0 ? 3 : 0);

    add('line', input.intent === 'time_series' ? 10 : 0);
    add('line', input.hasDate ? 7 : 0);
    add('line', textWeight(['evolution', 'évolution', 'trend', 'tendance', 'mensuel', 'monthly', 'par mois', 'année', 'year']) * 2);

    add('pie', input.intent === 'breakdown' ? 3 : 0);
    add('pie', input.hasDimension && numericColumns.length === 1 ? 4 : 0);
    add(
      'pie',
      textWeight([
        'repartition',
        'répartition',
        'repartition graphique',
        'répartition graphique',
        'ventilation',
        'proportion',
        'part',
        'share',
        'pourcentage',
        'percentage',
        'contribution'
      ]) * 2
    );

    add('bar', input.intent === 'breakdown' ? 8 : 0);
    add('bar', input.hasDimension ? 4 : 0);
    add(
      'bar',
      textWeight(['top', 'classement', 'ranking', 'compare', 'comparaison', 'distribution', 'breakdown', 'par categorie', 'par catégorie']) * 2
    );

    return (Object.entries(scores) as Array<[ExecuteQueryResult['chartType'], number]>).sort((a, b) => b[1] - a[1])[0][0];
  }

  private asStringArray(value: unknown) {
    return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
  }



  private assessSemanticQuestionRelevance(
    question: string,
    layer: SemanticLayerResponse,
    retrievalHits: SemanticSearchHit[] = []
  ): { ok: boolean; reason: string } {
    const normalized = this.normalizeSearchText(question);
    const reason =
      'Je n’ai pas de réponse fiable pour cette question avec la couche sémantique active. Reformulez avec une métrique, une table ou une dimension disponible.';

    if (!normalized) return { ok: false, reason };

    const hasSemanticTextMatch = this.buildSemanticSearchEntries(layer).some(
      (entry) => this.semanticTextScore(normalized, [entry.entityName, entry.mappedValue || '', entry.content]) > 0
    );
    const hasRetrievalTextMatch = retrievalHits.some(
      (hit) => this.semanticTextScore(normalized, [hit.entityName, hit.mappedValue || '', hit.content]) > 0
    );

    if (hasSemanticTextMatch || hasRetrievalTextMatch) return { ok: true, reason: '' };

    if (this.hasGenericAnalyticsIntent(normalized) && this.semanticLayerHasMetricSurface(layer)) {
      return { ok: true, reason: '' };
    }

    return { ok: false, reason };
  }

  private hasGenericAnalyticsIntent(normalizedQuestion: string) {
    return (
      this.hasAny(normalizedQuestion, [
        'total',
        'totaux',
        'somme',
        'sum',
        'combien',
        'nombre',
        'count',
        'moyenne',
        'average',
        'minimum',
        'maximum',
        'max',
        'min',
        'chiffre',
        'affaire',
        'revenue',
        'sales',
        'vente',
        'ventes',
        'evolution',
        'tendance',
        'trend',
        'par an',
        'par annee',
        'annee',
        'annuel',
        'year',
        'par mois',
        'mensuel',
        'month',
        'repartition',
        'distribution',
        'ventilation',
        'breakdown',
        'classement',
        'ranking',
        'top',
        'compare',
        'comparaison'
      ]) || /\b(ca|kpi)\b/.test(normalizedQuestion)
    );
  }

  private semanticLayerHasMetricSurface(layer: SemanticLayerResponse) {
    return (
      layer.kpis.length > 0 ||
      layer.tables.some((table) =>
        table.columns.some(
          (column) =>
            column.semanticType === 'measure' ||
            (this.isNumericType(column.dataType) && this.isAnalyticalNumericCandidate(column))
        )
      )
    );
  }

  public buildSemanticQueryPlan(
    question: string,
    layer: SemanticLayerResponse,
    retrievalHits: SemanticSearchHit[] = []
  ): SemanticQueryPlan | null {
    if (!layer.tables.length) return null;

    const normalized = this.normalizeSearchText(question);
    const retrievalHints = retrievalHits.flatMap((hit) =>
      [hit.entityName, hit.mappedValue, String(hit.metadata.technicalName || ''), String(hit.metadata.businessName || '')].filter(
        (value): value is string => Boolean(value)
      )
    );
    const hintedTableNames = new Set(
      retrievalHits
        .map((hit) => String(hit.metadata.tableTechnicalName || hit.mappedValue || ''))
        .filter(Boolean)
    );
    const factTable =
      layer.tables.find((table) => hintedTableNames.has(table.technicalName)) ||
      layer.tables.find((table) => table.tableType === 'fact') ||
      layer.tables.find((table) => table.columns.some((column) => column.semanticType === 'measure')) ||
      layer.tables[0];
    const allColumns = layer.tables.flatMap((table) =>
      table.columns.map((column) => ({
        table,
        column
      }))
    );
    const synonymHints = layer.synonyms
      .filter((synonym) => normalized.includes(this.normalizeSearchText(synonym.term)))
      .map((synonym) => synonym.mappedValue);
    const semanticHints = Array.from(new Set([...synonymHints, ...retrievalHints]));
    const wantsListRecords = this.isListRecordsQuestion(normalized);

    if (wantsListRecords) {
      const listTable = this.findBestSemanticTable(normalized, layer, semanticHints) || factTable;
      const selectedColumns = this.findRequestedListColumns(normalized, listTable, semanticHints);
      if (!selectedColumns.length) return null;

      const selectExpr = selectedColumns
        .map((column) => `${this.quoteSqlIdentifier(column.technicalName)} AS ${this.quoteSqlIdentifier(this.toSqlAlias(column.businessName || column.technicalName))}`)
        .join(', ');
      const sql = `SELECT ${selectExpr} FROM ${this.quoteQualifiedSqlName(listTable.technicalName)} LIMIT 100;`;
      const columnNames = selectedColumns.map((column) => `"${column.businessName}"`).join(', ');

      return {
        intent: 'list_records',
        sql,
        confidence: 0.84,
        reasoning: `Liste des colonnes ${columnNames} depuis la table de la couche sémantique "${listTable.businessName}" (${listTable.technicalName}).`,
        table: listTable,
        metricAlias: 'records',
        metricFormula: '',
        selectedColumns,
        chartType: 'table'
      };
    }

    const businessIntent = this.detectBusinessIntent(question, layer);
    const businessIntentPlan = this.buildBusinessIntentQueryPlan(question, normalized, layer, businessIntent, semanticHints, factTable);
    if (businessIntentPlan) return businessIntentPlan;

    const matchedKpi = this.findBestSemanticKpi(normalized, layer, semanticHints);
    const matchedMeasure = matchedKpi
      ? this.findColumnForKpiFormula(matchedKpi.sqlFormula, allColumns)
      : this.findBestSemanticColumn(normalized, allColumns, ['measure'], semanticHints)?.column;
    const measureColumn =
      matchedMeasure ||
      allColumns.find((item) => item.column.semanticType === 'measure')?.column ||
      allColumns.find((item) => this.isNumericType(item.column.dataType) && this.isAnalyticalNumericCandidate(item.column))
        ?.column;
    const metricTable =
      (measureColumn && allColumns.find((item) => item.column === measureColumn)?.table) ||
      (matchedKpi && this.findTableForKpiFormula(matchedKpi.sqlFormula, allColumns)) ||
      factTable;

    if (!metricTable) return null;

    const relationships = this.inferSemanticRelationships(layer);

    const wantsCount = this.hasAny(normalized, [
      'nombre de ventes',
      'nombre des ventes',
      'nombre de vantes',
      'nombre des vantes',
      'nombre de commandes',
      'nombre des commandes',
      'nombre de transactions',
      'nombre des transactions',
      'nombre total de ventes',
      'nombre total des ventes',
      'nombre total de commandes',
      'combien de ventes',
      'combien de commandes',
      'combien de transactions',
      'count of sales',
      'count of orders'
    ]) || (
      this.hasAny(normalized, ['nombre de', 'nombre des', 'combien de', 'combien d', 'nb de', 'nb des', 'compte des', 'compte de']) &&
      !this.hasAny(normalized, ['chiffre', 'chiffre d affaires', 'ca', 'revenu', 'montant', 'marge', 'prix', 'cout', 'salaire'])
    );

    const factIdColumn = metricTable.columns.find(
      (col) => col.semanticType === 'identifier' && this.isLikelyKeyColumn(col.technicalName)
    ) || metricTable.columns.find((col) => col.semanticType === 'identifier');

    const metricFormula = matchedKpi
      ? matchedKpi.sqlFormula
      : wantsCount
        ? (factIdColumn ? `COUNT(${this.quoteSqlIdentifier(factIdColumn.technicalName)})` : 'COUNT(*)')
        : measureColumn
          ? `SUM(${this.quoteSqlIdentifier(measureColumn.technicalName)})`
          : 'COUNT(*)';
    const metricAlias = this.toSqlAlias(
      matchedKpi?.name ||
      (wantsCount
        ? 'Nombre de ventes'
        : measureColumn
          ? `Total ${measureColumn.businessName || this.toBusinessName(measureColumn.technicalName)}`
          : 'Record Count')
    );

    const wantsTime = this.hasAny(normalized, [
      'month',
      'monthly',
      'mois',
      'mensuel',
      'mensuelle',
      'mensuelles',
      'year',
      'yearly',
      'annee',
      'annual',
      'annuel',
      'annuelle',
      'annuelles',
      'date',
      'jour',
      'day',
      'trend',
      'evolution'
    ]);
    const wantsDistribution = this.hasAny(normalized, [
      'repartition',
      'distribution',
      'districution',
      'ventilation',
      'breakdown',
      'split',
      'share',
      'part',
      'proportion',
      'percentage',
      'pourcentage'
    ]);
    const wantsGroup =
      wantsDistribution ||
      wantsTime ||
      this.hasAny(normalized, [' by ', ' per ', ' par ', ' pour chaque ', 'top', 'ranking', 'classement']);
    const dateColumn = wantsTime ? this.findBestTimeSeriesDateColumn(normalized, metricTable, semanticHints) : undefined;
    const dateGranularity = dateColumn ? this.inferTimeGranularity(normalized) : undefined;
    const localDimensionColumn = !dateColumn && wantsGroup
      ? this.findBestSemanticColumn(normalized, this.columnsForTable(metricTable), ['dimension'], semanticHints)?.column
      : undefined;
    const joinedDimension = !dateColumn && wantsGroup && !localDimensionColumn
      ? this.findBestJoinedDimensionSelection(normalized, metricTable, layer, semanticHints, relationships)
      : undefined;
    const dimensionColumn =
      !dateColumn && wantsGroup && !joinedDimension
        ? localDimensionColumn
        : undefined;
    const dimensionTable = joinedDimension?.table || (dimensionColumn ? metricTable : undefined);
    const activeTables = [metricTable, ...(dimensionTable && dimensionTable.technicalName !== metricTable.technicalName ? [dimensionTable] : [])];
    const isForecast = this.statisticalForecast.isForecastQuestion(question);
    const filters = this.findSemanticFilters(normalized, activeTables, semanticHints, isForecast);
    const whereClause = filters.length
      ? ` WHERE ${filters
        .filter((filter) => filter.table)
        .map(
          (filter) =>
            `${this.quoteQualifiedSqlName(filter.table!.technicalName)}.${this.quoteSqlIdentifier(filter.column.technicalName)} ILIKE ${this.quoteSqlStringLiteral(filter.value)}`
        )
        .join(' AND ')}`
      : '';

    const quotedTable = this.quoteQualifiedSqlName(metricTable.technicalName);
    const joinClause = joinedDimension
      ? ` JOIN ${this.quoteQualifiedSqlName(joinedDimension.table.technicalName)} ON ${this.quoteQualifiedSqlName(metricTable.technicalName)}.${this.quoteSqlIdentifier(joinedDimension.sourceColumn.technicalName)} = ${this.quoteQualifiedSqlName(joinedDimension.table.technicalName)}.${this.quoteSqlIdentifier(joinedDimension.targetColumn.technicalName)}`
      : '';
    let sql: string;
    let chartType: ExecuteQueryResult['chartType'] = 'table';
    let confidence = matchedKpi || measureColumn ? 0.82 : 0.62;

    const isTemporalDimension = Boolean(
      wantsTime ||
      (joinedDimension && this.hasAny(this.normalizeSearchText(`${joinedDimension.labelColumn.technicalName} ${joinedDimension.table.technicalName}`), ['temps', 'annee', 'mois', 'date', 'year', 'month'])) ||
      (dimensionColumn && this.hasAny(this.normalizeSearchText(`${dimensionColumn.technicalName}`), ['temps', 'annee', 'mois', 'date', 'year', 'month']))
    );

    if (dateColumn && dateGranularity) {
      const periodExpr = `date_trunc('${dateGranularity}', ${this.quoteSqlIdentifier(dateColumn.technicalName)})`;
      sql = `SELECT ${periodExpr} AS period, ${metricFormula} AS ${this.quoteSqlIdentifier(metricAlias)} FROM ${quotedTable}${joinClause}${whereClause} GROUP BY period ORDER BY period ASC LIMIT ${this.semanticTimeSeriesLimit(dateGranularity)};`;
      confidence += 0.06;
    } else if (joinedDimension) {
      const dimensionExpr = `${this.quoteQualifiedSqlName(joinedDimension.table.technicalName)}.${this.quoteSqlIdentifier(joinedDimension.labelColumn.technicalName)}`;
      const dimensionAlias = this.toSqlAlias(joinedDimension.labelColumn.businessName || joinedDimension.labelColumn.technicalName);
      const orderClause = isTemporalDimension ? `${dimensionExpr} ASC` : `${this.quoteSqlIdentifier(metricAlias)} DESC`;
      sql = `SELECT ${dimensionExpr} AS ${this.quoteSqlIdentifier(dimensionAlias)}, ${metricFormula} AS ${this.quoteSqlIdentifier(metricAlias)} FROM ${quotedTable}${joinClause}${whereClause} GROUP BY ${dimensionExpr} ORDER BY ${orderClause} LIMIT 20;`;
      confidence += 0.08;
    } else if (dimensionColumn) {
      const dimensionExpr = this.quoteSqlIdentifier(dimensionColumn.technicalName);
      const orderClause = isTemporalDimension ? `${dimensionExpr} ASC` : `${this.quoteSqlIdentifier(metricAlias)} DESC`;
      sql = `SELECT ${dimensionExpr} AS ${this.quoteSqlIdentifier(this.toSqlAlias(dimensionColumn.businessName || dimensionColumn.technicalName))}, ${metricFormula} AS ${this.quoteSqlIdentifier(metricAlias)} FROM ${quotedTable}${joinClause}${whereClause} GROUP BY ${dimensionExpr} ORDER BY ${orderClause} LIMIT 20;`;
      confidence += 0.05;
    } else {
      sql = `SELECT ${metricFormula} AS ${this.quoteSqlIdentifier(metricAlias)} FROM ${quotedTable}${joinClause}${whereClause} LIMIT 1;`;
    }
    chartType = this.inferChartTypeFromSignals({
      question,
      intent: (dateColumn || isTemporalDimension) ? 'time_series' : dimensionColumn || joinedDimension ? 'breakdown' : 'metric',
      hasDate: Boolean(dateColumn || isTemporalDimension),
      hasDimension: Boolean(dimensionColumn || joinedDimension)
    });
    if (filters.length) confidence += 0.04;
    if (joinedDimension) confidence += 0.04;

    const reasoningParts = [
      `Utilisation de la table de la couche sémantique "${metricTable.businessName}" (${metricTable.technicalName}).`,
      matchedKpi
        ? `KPI correspondant : "${matchedKpi.name}".`
        : measureColumn
          ? `Mesure correspondante : "${measureColumn.businessName}" (${measureColumn.technicalName}).`
          : 'Aucune mesure explicite trouvée ; utilisation du nombre de lignes.',
      dateColumn && dateGranularity
        ? `Regroupement par ${this.timeGranularityLabel(dateGranularity)} via la colonne date "${dateColumn.businessName}".`
        : joinedDimension
          ? `Jointure détectée vers "${joinedDimension.table.businessName}" via ${joinedDimension.sourceColumn.businessName} = ${joinedDimension.targetColumn.businessName}.`
          : dimensionColumn
            ? `${wantsDistribution ? 'Répartition construite' : 'Regroupement'} par la dimension "${dimensionColumn.businessName}".`
            : 'Aucun regroupement demandé ou identifié.',
      filters.length
        ? `Filtre appliqué : ${filters.map((filter) => `${filter.column.businessName} = ${filter.value}`).join(', ')}.`
        : 'Aucun filtre demandé ou identifié.'
    ];

    return {
      intent: dateColumn ? 'time_series' : dimensionColumn || joinedDimension ? 'breakdown' : 'metric',
      sql,
      confidence: this.clampConfidence(confidence),
      reasoning: reasoningParts.join(' '),
      table: metricTable,
      metricAlias,
      metricFormula,
      matchedKpi,
      measureColumn,
      dimensionTable,
      dimensionColumn: joinedDimension?.labelColumn || dimensionColumn,
      joinRelationship: joinedDimension?.relationship,
      dateColumn,
      dateGranularity,
      filters,
      chartType
    };
  }

  private findBestSemanticKpi(normalizedQuestion: string, layer: SemanticLayerResponse, synonymHints: string[]) {
    const normalizedHints = new Set(synonymHints.map((hint) => this.normalizeSearchText(hint)));
    return layer.kpis
      .map((kpi) => ({
        kpi,
        score:
          this.semanticTextScore(normalizedQuestion, [kpi.name, kpi.description]) +
          (normalizedHints.has(this.normalizeSearchText(kpi.name)) ? 4 : 0)
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)[0]?.kpi;
  }

  private detectBusinessIntent(question: string, layer?: SemanticLayerResponse): BusinessIntent {
    const normalized = this.normalizeSearchText(question);
    const asksSingleWinner = this.hasAny(normalized, [
      'ayant le plus grand',
      'le plus grand',
      'plus grand chiffre',
      'meilleur client',
      'premier client',
      'quel employe genere le plus',
      'genere le plus'
    ]);
    const isPerStore = this.hasAny(normalized, ['par magasin', 'par boutique', 'par store', 'par point de vente']);
    const isDistribution = this.hasAny(normalized, [
      'repartition',
      'distribution',
      'districution',
      'par moyen de paiement',
      'moyen de paiement',
      'par mois',
      'par annee',
      'par an',
      'evolution du chiffre',
      'effet des promotions',
      'physiques et en ligne'
    ]);
    const isGrouping = this.hasAny(normalized, [
      ' par ',
      ' per ',
      'par categorie',
      'par moyen',
      'par mois',
      'par annee',
      'par an',
      'par magasin',
      'entre',
      'mensuel',
      'mensuelle',
      'mensuelles',
      'annuel',
      'annuelle',
      'annuelles'
    ]);
    const isMonthly = this.hasAny(normalized, ['par mois', 'mois', 'mensuel', 'mensuelle', 'mensuelles', 'monthly']);
    const isYearly = this.hasAny(normalized, ['par annee', 'par an', 'annee', 'annuel', 'annuelle', 'annuelles', 'yearly', 'year']);
    const isDistributionKeyword = this.hasAny(normalized, ['repartition', 'distribution', 'districution', 'ventilation']);
    const isLimit20 = isPerStore || isYearly || isDistributionKeyword || this.hasAny(normalized, ['moyen de paiement', 'physiques et en ligne', 'par magasin']);
    const topN = Number(
      normalized.match(/\btop\s+(\d+)\b/)?.[1] ||
        normalized.match(/\b(\d+)\s+(premiers|premieres|meilleurs|meilleures)\b/)?.[1] ||
        (asksSingleWinner ? 1 : isMonthly ? 48 : isLimit20 ? 20 : 10)
    );
    const isFrequency = this.hasAny(normalized, [
      'frequent',
      'frequents',
      'frequente',
      'frequentes',
      'plus frequent',
      'plus frequents',
      'les plus frequents',
      'frequence',
      'plus utilise',
      'plus utilises',
      'plus utilisee',
      'plus utilisees',
      'populaire',
      'populaires',
      'recurrent',
      'recurrents'
    ]);
    const isForecast = this.statisticalForecast.isForecastQuestion(question);
    const isExplicitRanking = this.hasAny(normalized, [
      'top',
      'meilleur',
      'meilleurs',
      'meilleure',
      'meilleures',
      'pire',
      'pires',
      'plus grand',
      'ayant le plus grand',
      'genere le plus',
      'les plus vendus',
      'plus vendus',
      'top ventes',
      'best sellers',
      'plus commandes',
      'plus achetes',
      'classement'
    ]);
    const isTemporalEntity = isMonthly || isYearly || isForecast || this.hasAny(normalized, ['annee', 'mois', 'date', 'temps', 'year', 'month', 'semaine', 'jour']);
    const ranking =
      isForecast ||
      isFrequency ||
      isPerStore ||
      isDistribution ||
      isGrouping ||
      isMonthly ||
      isYearly ||
      isExplicitRanking ||
      this.hasAny(normalized, [
        'plus',
        'maximum',
        'moins',
        'minimum',
        'faible'
      ]);
    const sort = isForecast
      ? 'asc'
      : (isTemporalEntity && !isExplicitRanking)
        ? 'asc'
        : (this.hasAny(normalized, ['moins', 'minimum', 'faible', 'pire']) ? 'asc' : ranking ? 'desc' : undefined);

    let entity: string | undefined;
    if (this.hasAny(normalized, ['physiques et en ligne', 'physique', 'type magasin'])) entity = 'type_magasin';
    else if (this.hasAny(normalized, [
      'moyen de paiement',
      'moyens de paiement',
      'methode de paiement',
      'methodes de paiement',
      'methode de paiment',
      'methodes de paiment',
      'methodes de paiments',
      'mode de paiement',
      'modes de paiement',
      'type de paiement',
      'types de paiement',
      'moyen paiement',
      'mode paiement',
      'methode paiement',
      'methode paiment',
      'methodes paiment',
      'methodes paiments',
      'paiement',
      'paiements',
      'paiment',
      'paiments',
      'payment',
      'payments',
      'payment method',
      'payment_method'
    ])) entity = 'moyen_paiement';
    else if (this.hasAny(normalized, ['promotion', 'promotions', 'promo', 'promos'])) entity = 'promotion';
    else if (this.hasAny(normalized, ['par annee', 'par an', 'annuel', 'annuelle', 'annuelles', 'yearly']) || (this.hasAny(normalized, ['annee', 'year']) && !this.hasAny(normalized, ['mois', 'mensuel']))) entity = 'annee';
    else if (this.hasAny(normalized, ['par mois', 'evolution du chiffre', 'mois', 'mensuel', 'mensuelle', 'mensuelles', 'monthly'])) entity = 'mois';
    else if (isForecast) entity = 'annee';
    else if (this.hasAny(normalized, ['categorie de produit', 'categorie'])) entity = 'categorie';
    else if (this.hasAny(normalized, ['employe', 'employes', 'employee', 'vendeur', 'commercial'])) entity = 'employe';
    else if (this.hasAny(normalized, ['magasin', 'magasins', 'boutique', 'boutiques', 'store', 'stores'])) entity = 'magasin';
    else if (this.hasAny(normalized, ['produit', 'produits', 'article', 'articles', 'best sellers'])) entity = 'produit';
    else if (this.hasAny(normalized, ['client', 'clients'])) entity = 'client';
    else if (this.hasAny(normalized, ['region', 'région', 'regions', 'régions'])) entity = 'region';

    // WrenAI-style dynamic entity detection across any domain (Healthcare, HR, Logistics, Finance)
    if (!entity && layer?.tables) {
      const dimensionTables = layer.tables.filter((t) => t.tableType === 'dimension');
      for (const dimTable of dimensionTables) {
        const dimTech = this.normalizeSearchText(dimTable.technicalName);
        const dimBus = this.normalizeSearchText(dimTable.businessName);
        const dimDesc = this.normalizeSearchText(dimTable.description || '');
        if (
          normalized.includes(dimTech) ||
          normalized.includes(dimBus) ||
          (dimDesc && normalized.includes(dimDesc)) ||
          dimTable.columns.some((c) => normalized.includes(this.normalizeSearchText(c.businessName)) || normalized.includes(this.normalizeSearchText(c.technicalName)))
        ) {
          entity = dimTech;
          break;
        }
      }
    }

    let metric: string | undefined;
    let aggregation: BusinessIntent['aggregation'] = 'sum';

    const wantsCount = isFrequency || this.hasAny(normalized, [
      'nombre de ventes',
      'nombre des ventes',
      'nombre de vantes',
      'nombre des vantes',
      'nombre de commandes',
      'nombre des commandes',
      'nombre de transactions',
      'nombre des transactions',
      'nombre total de ventes',
      'nombre total des ventes',
      'nombre total de commandes',
      'combien de ventes',
      'combien de commandes',
      'combien de transactions',
      'count of sales',
      'count of orders',
      'par nombre de vente',
      'par nombre des ventes',
      'par nombre de commande'
    ]) || (
      this.hasAny(normalized, ['nombre de', 'nombre des', 'combien de', 'combien d', 'nb de', 'nb des', 'compte des', 'compte de']) &&
      !this.hasAny(normalized, ['chiffre', 'chiffre d affaires', 'ca', 'revenu', 'montant', 'marge', 'prix', 'cout', 'salaire'])
    );

    if (wantsCount) {
      metric = 'count';
      aggregation = 'count';
    } else if (this.hasAny(normalized, ['marge brute', 'marge'])) {
      metric = 'marge_brute';
    } else if (
      entity === 'promotion' ||
      this.hasAny(normalized, ['volume des ventes', 'volume de vente', 'volume', 'quantite', 'quantité', 'unites vendues', 'unités vendues', 'quantite vendue', 'quantité vendue']) ||
      (entity === 'produit' &&
        this.hasAny(normalized, ['plus vendus', 'les plus vendus', 'top ventes', 'best sellers', 'plus commandes', 'plus achetes'])) ||
      (entity === 'region' && this.hasAny(normalized, ['vend', 'vendent', 'moins', 'plus']) && !this.hasAny(normalized, ['chiffre', 'ca', 'revenu', 'montant']))
    ) {
      metric = 'quantite';
    } else if (this.hasAny(normalized, ['chiffre d affaires', 'ca', 'revenu', 'ventes', 'repartition'])) {
      metric = 'montant_total';
    } else {
      metric = 'montant_total';
    }

    if (
      !wantsCount && (
        this.hasAny(normalized, ['moyenne', 'average', 'en moyenne']) ||
        (this.hasAny(normalized, ['moyen']) && !this.hasAny(normalized, ['moyen de paiement', 'moyens de paiement']))
      )
    ) {
      aggregation = 'avg';
    }

    return {
      entity,
      metric,
      aggregation,
      ranking,
      sort,
      topN: Math.max(1, Math.min(Number.isFinite(topN) ? topN : 10, 100))
    };
  }

  private buildBusinessIntentQueryPlan(
    question: string,
    normalizedQuestion: string,
    layer: SemanticLayerResponse,
    intent: BusinessIntent,
    semanticHints: string[],
    fallbackFactTable?: SemanticTable
  ): SemanticQueryPlan | null {
    if (!intent.entity || !intent.metric || !intent.ranking) return null;

    const relationships = this.inferSemanticRelationships(layer);
    const allColumns = layer.tables.flatMap((table) => table.columns.map((column) => ({ table, column })));
    const measureSelection = this.findBusinessIntentMeasure(intent, allColumns, fallbackFactTable);
    if (!measureSelection) return null;

    const dimensionSelection = this.findBusinessIntentDimension(intent.entity, measureSelection.table, layer, relationships);
    if (!dimensionSelection) return null;

    const aggregation = intent.aggregation || 'sum';
    const metricFormula =
      aggregation === 'count' || intent.metric === 'count'
        ? (measureSelection.column?.semanticType === 'identifier'
            ? `COUNT(${this.quoteQualifiedColumn(measureSelection.table, measureSelection.column)})`
            : 'COUNT(*)')
        : aggregation === 'avg'
          ? `AVG(${this.quoteQualifiedColumn(measureSelection.table, measureSelection.column)})`
          : `SUM(${this.quoteQualifiedColumn(measureSelection.table, measureSelection.column)})`;
    const metricAlias = this.businessIntentMetricAlias(intent);
    const dimensionColumns = this.businessIntentDimensionColumns(intent, dimensionSelection);
    const dimensionSelectExpr = dimensionColumns
      .map((column) => {
        const expression = this.quoteQualifiedColumn(dimensionSelection.table, column);
        const alias = this.toSqlAlias(column.businessName || column.technicalName);
        return `${expression} AS ${this.quoteSqlIdentifier(alias)}`;
      })
      .join(', ');
    const dimensionGroupExpr = dimensionColumns.map((column) => this.quoteQualifiedColumn(dimensionSelection.table, column)).join(', ');
    const joinClause =
      dimensionSelection.table.technicalName === measureSelection.table.technicalName
        ? ''
        : ` JOIN ${this.quoteQualifiedSqlName(dimensionSelection.table.technicalName)} ON ${this.quoteQualifiedColumn(
            measureSelection.table,
            dimensionSelection.sourceColumn
          )} = ${this.quoteQualifiedColumn(dimensionSelection.table, dimensionSelection.targetColumn)}`;
    const isForecast = this.statisticalForecast.isForecastQuestion(question);
    const isTemporalEntity = intent.entity === 'annee' || intent.entity === 'mois' || intent.entity === 'temps' || intent.entity === 'date';
    const isExplicitRanking = this.hasAny(normalizedQuestion, [
      'top',
      'meilleur',
      'meilleurs',
      'meilleure',
      'meilleures',
      'pire',
      'pires',
      'plus grand',
      'ayant le plus grand',
      'genere le plus',
      'les plus vendus',
      'plus vendus',
      'top ventes',
      'best sellers',
      'plus commandes',
      'plus achetes',
      'classement'
    ]);
    const sort = isForecast || (isTemporalEntity && !isExplicitRanking) ? 'asc' : (intent.sort || 'desc');
    const orderExpr = isForecast || (isTemporalEntity && !isExplicitRanking) ? dimensionGroupExpr : this.quoteSqlIdentifier(metricAlias);
    const limit = intent.topN || (isTemporalEntity ? 48 : 10);
    const sql = `SELECT ${dimensionSelectExpr}, ${metricFormula} AS ${this.quoteSqlIdentifier(
      metricAlias
    )} FROM ${this.quoteQualifiedSqlName(measureSelection.table.technicalName)}${joinClause} GROUP BY ${dimensionGroupExpr} ORDER BY ${orderExpr} ${sort.toUpperCase()} LIMIT ${limit};`;

    return {
      intent: (isForecast || isTemporalEntity) ? 'time_series' : 'breakdown',
      sql,
      confidence: 0.92,
      reasoning: [
        isForecast
          ? `Analyse prédictive détectée pour ${intent.entity} : extraction de l'historique chronologique pour projection statistique.`
          : isTemporalEntity && !isExplicitRanking
            ? `Évolution chronologique par ${intent.entity}.`
            : `Intent métier détecté : classement ${sort === 'asc' ? 'ascendant' : 'descendant'} par ${intent.entity}.`,
        intent.aggregation === 'count' ? `Calcul du nombre d'enregistrements.` : `Mesure calculée : ${measureSelection.column.businessName || measureSelection.column.technicalName}.`,
        `Regroupement par ${dimensionSelection.labelColumn.businessName || dimensionSelection.labelColumn.technicalName}.`
      ].join(' '),
      table: measureSelection.table,
      metricAlias,
      metricFormula,
      measureColumn: measureSelection.column,
      dimensionTable: dimensionSelection.table,
      dimensionColumn: dimensionSelection.labelColumn,
      joinRelationship: dimensionSelection.relationship,
      chartType: this.inferChartTypeFromSignals({
        question,
        intent: isTemporalEntity ? 'time_series' : 'breakdown',
        hasDate: isTemporalEntity,
        hasDimension: true
      })
    };
  }

  private businessIntentDimensionColumns(intent: BusinessIntent, dimensionSelection: BusinessIntentDimensionSelection) {
    const columns = [dimensionSelection.labelColumn];
    if (intent.entity === 'client') {
      const firstName = dimensionSelection.table.columns.find((column) =>
        this.hasAny(this.normalizeSearchText(column.technicalName), ['prenom client', 'first name', 'prenom'])
      );
      if (firstName && !columns.some((column) => column.technicalName === firstName.technicalName)) {
        columns.push(firstName);
      }
    } else if (intent.entity === 'mois') {
      const yearCol = dimensionSelection.table.columns.find((column) =>
        this.hasAny(this.normalizeSearchText(column.technicalName), ['annee', 'year'])
      );
      if (yearCol && !columns.some((column) => column.technicalName === yearCol.technicalName)) {
        columns.unshift(yearCol);
      }
    } else if (intent.entity === 'annee') {
      const yearCol = dimensionSelection.table.columns.find((column) =>
        this.hasAny(this.normalizeSearchText(column.technicalName), ['annee', 'year'])
      );
      if (yearCol) {
        return [yearCol];
      }
    }
    return columns;
  }

  private findBusinessIntentMeasure(
    intent: BusinessIntent,
    allColumns: Array<{ table: SemanticTable; column: SemanticColumn }>,
    fallbackFactTable?: SemanticTable
  ) {
    if (intent.metric === 'count' || intent.aggregation === 'count') {
      const factCandidates = allColumns.filter((item) => item.table.tableType === 'fact');
      const pool = factCandidates.length ? factCandidates : allColumns;
      const idCandidate =
        pool.find(
          (item) => item.column.semanticType === 'identifier' && this.isLikelyKeyColumn(item.column.technicalName)
        ) ||
        pool.find((item) => item.column.semanticType === 'identifier') ||
        pool[0];
      return idCandidate;
    }

    const metric = this.normalizeSearchText(intent.metric || '');
    const forbiddenForSoldProducts = new Set(['cout_achat_total', 'marge_brute', 'montant_total', 'total_amount', 'profit']);

    const metricSynonyms: Record<string, string[]> = {
      montant_total: [
        'montant_total', 'montant total', 'total_amount', 'total amount', 'total_price', 'total price',
        'montant', 'chiffre_affaires', 'chiffre affaires', 'chiffre d affaires', 'ca',
        'amount', 'sales_amount', 'sales amount', 'total', 'revenue', 'prix_total', 'prix total', 'valeur'
      ],
      quantite: [
        'quantite', 'quantite vendue', 'quantite_vendue', 'quantity', 'qty', 'volume', 'unites', 'units', 'nombre_articles', 'nombre articles'
      ],
      marge_brute: [
        'marge_brute', 'marge brute', 'marge', 'margin', 'gross_margin', 'gross margin', 'profit', 'benefice'
      ]
    };
    const validNames = new Set(
      (metricSynonyms[metric] || [metric]).map((item) => this.normalizeSearchText(item))
    );

    const candidates = allColumns
      .filter((item) => validNames.has(this.normalizeSearchText(item.column.technicalName)) || validNames.has(this.normalizeSearchText(item.column.businessName)))
      .filter((item) => !(intent.entity === 'produit' && forbiddenForSoldProducts.has(item.column.technicalName)));

    const pool = candidates.length > 0
      ? candidates
      : allColumns
          .filter((item) => item.column.semanticType === 'measure' || this.isNumericType(item.column.dataType))
          .filter((item) => !(intent.entity === 'produit' && forbiddenForSoldProducts.has(item.column.technicalName)));

    return pool
      .map((item) => {
        let score = 0;
        if (item.table.tableType === 'fact') score += 5;
        if (fallbackFactTable && item.table.technicalName === fallbackFactTable.technicalName) score += 2;
        const colNorm = this.normalizeSearchText(`${item.column.technicalName} ${item.column.businessName}`);
        if (validNames.has(this.normalizeSearchText(item.column.technicalName))) score += 8;
        if (validNames.has(this.normalizeSearchText(item.column.businessName))) score += 7;
        if (metric && (colNorm.includes(metric) || metric.includes(colNorm))) score += 6;
        if (item.column.semanticType === 'measure') score += 3;
        const tableKey = this.normalizeSearchText(item.table.technicalName);
        if (this.hasAny(tableKey, ['f ventes', 'fact ventes', 'sales', 'orders'])) score += 2;
        return { ...item, score };
      })
      .sort((a, b) => b.score - a.score)[0];
  }

  private findBusinessIntentDimension(
    entity: string,
    metricTable: SemanticTable,
    layer: SemanticLayerResponse,
    relationships: SemanticRelationship[]
  ): BusinessIntentDimensionSelection | undefined {
    const labelPriority = this.businessEntityLabelCandidates(entity);
    const tableHints = this.businessEntityTableHints(entity);
    const sameTableLabel = metricTable.columns.find((column) => labelPriority.includes(this.normalizeSearchText(column.technicalName)));
    if (sameTableLabel) {
      return {
        table: metricTable,
        labelColumn: sameTableLabel,
        sourceColumn: sameTableLabel,
        targetColumn: sameTableLabel
      };
    }

    const dimensionTables = layer.tables
      .filter((table) => table.technicalName !== metricTable.technicalName)
      .filter((table) => table.tableType === 'dimension' || table.columns.some((column) => column.semanticType === 'dimension'));

    const candidates = dimensionTables
      .map((table) => {
        const tableText = this.normalizeSearchText(`${table.technicalName} ${table.businessName}`);
        const labelColumn = (
          table.columns.find((column) => labelPriority.includes(this.normalizeSearchText(column.technicalName))) ||
          this.findDimensionLabelColumn(table.columns)
        ) as SemanticColumn | undefined;
        const relationship = relationships.find(
          (item) =>
            this.normalizeSqlReference(item.fromTableTechnicalName) === this.normalizeSqlReference(metricTable.technicalName) &&
            this.normalizeSqlReference(item.toTableTechnicalName) === this.normalizeSqlReference(table.technicalName)
        );
        const joinColumns = relationship
          ? this.findBusinessIntentRelationshipColumns(metricTable, table, relationship)
          : this.findBusinessIntentJoinColumns(entity, metricTable, table);
        if (!labelColumn || !joinColumns) return { table, labelColumn, relationship, score: 0 };
        const hasTableHint = tableHints.some((hint) => tableText.includes(hint));
        const hasLabelMatch = labelPriority.includes(this.normalizeSearchText(labelColumn.technicalName));
        const entityNorm = this.normalizeSearchText(entity);
        const isDynamicMatch =
          tableText.includes(entityNorm) ||
          entityNorm.includes(this.normalizeSearchText(table.technicalName)) ||
          entityNorm.includes(this.normalizeSearchText(table.businessName));
        if (!hasTableHint && !hasLabelMatch && !isDynamicMatch) {
          return { table, labelColumn, relationship, score: 0 };
        }
        let score = 0;
        if (hasTableHint || isDynamicMatch) score += 6;
        if (hasLabelMatch) score += 5;
        if (table.tableType === 'dimension') score += 2;
        score += relationship ? 3 : 2;
        return { table, labelColumn, relationship, sourceColumn: joinColumns.sourceColumn, targetColumn: joinColumns.targetColumn, score };
      })
      .filter((item) => item.score > 0 && item.labelColumn && item.sourceColumn && item.targetColumn)
      .sort((a, b) => b.score - a.score);

    const best = candidates[0];
    if (!best?.labelColumn || !best.sourceColumn || !best.targetColumn) return undefined;
    return {
      table: best.table,
      labelColumn: best.labelColumn,
      sourceColumn: best.sourceColumn,
      targetColumn: best.targetColumn,
      relationship: best.relationship
    };
  }

  private findBusinessIntentRelationshipColumns(
    metricTable: SemanticTable,
    dimensionTable: SemanticTable,
    relationship: SemanticRelationship
  ) {
    const sourceColumn = metricTable.columns.find(
      (column) =>
        this.normalizeSearchText(column.technicalName) === this.normalizeSearchText(relationship.fromColumnTechnicalName) ||
        this.normalizeSearchText(column.technicalName) === this.normalizeSearchText(this.unqualifyName(relationship.fromColumnTechnicalName))
    );
    const targetColumn = dimensionTable.columns.find(
      (column) =>
        this.normalizeSearchText(column.technicalName) === this.normalizeSearchText(relationship.toColumnTechnicalName) ||
        this.normalizeSearchText(column.technicalName) === this.normalizeSearchText(this.unqualifyName(relationship.toColumnTechnicalName))
    );
    return sourceColumn && targetColumn ? { sourceColumn, targetColumn } : undefined;
  }

  private findBusinessIntentJoinColumns(entity: string, metricTable: SemanticTable, dimensionTable: SemanticTable) {
    // 1. Direct foreign key reference in metricTable
    const refColumn = metricTable.columns.find(
      (c) =>
        c.references &&
        (this.normalizeSearchText(c.references.table) === this.normalizeSearchText(dimensionTable.technicalName) ||
          this.normalizeSearchText(this.unqualifyName(c.references.table)) ===
            this.normalizeSearchText(this.unqualifyName(dimensionTable.technicalName)))
    );
    if (refColumn && refColumn.references) {
      const targetCol =
        dimensionTable.columns.find(
          (c) => this.normalizeSearchText(c.technicalName) === this.normalizeSearchText(refColumn.references!.column)
        ) || dimensionTable.columns.find((c) => c.semanticType === 'identifier');
      if (targetCol) {
        return { sourceColumn: refColumn, targetColumn: targetCol };
      }
    }

    const entityKeys = this.businessIntentEntityJoinKeys(entity);
    const matchesEntityKey = (key: string) =>
      entityKeys.some((entityKey) => key === entityKey || key.includes(entityKey) || entityKey.includes(key));
    const sourceCandidates = metricTable.columns
      .filter((column) => column.semanticType === 'identifier' || column.isForeignKey || this.isLikelyJoinSourceColumn(column, metricTable))
      .map((column) => ({ column, key: this.businessIntentJoinKey(column.technicalName) }))
      .filter((item) => matchesEntityKey(item.key));
    const targetCandidates = dimensionTable.columns
      .filter((column) => column.semanticType === 'identifier' || this.isLikelyKeyColumn(column.technicalName))
      .map((column) => ({ column, key: this.businessIntentJoinKey(column.technicalName) }))
      .filter((item) => matchesEntityKey(item.key));

    const exactPair = sourceCandidates
      .flatMap((source) =>
        targetCandidates.map((target) => ({
          sourceColumn: source.column,
          targetColumn: target.column,
          score:
            (this.normalizeSearchText(source.column.technicalName) === this.normalizeSearchText(target.column.technicalName) ? 4 : 0) +
            (source.key === target.key ? 3 : 0)
        }))
      )
      .sort((left, right) => right.score - left.score)[0];

    if (exactPair) return { sourceColumn: exactPair.sourceColumn, targetColumn: exactPair.targetColumn };

    // 2. Generic key match between tables (e.g. shared identifier column name)
    const anyMatchingSource = metricTable.columns.find((sourceCol) =>
      dimensionTable.columns.some(
        (targetCol) =>
          this.normalizeSearchText(sourceCol.technicalName) === this.normalizeSearchText(targetCol.technicalName) &&
          (sourceCol.semanticType === 'identifier' || targetCol.semanticType === 'identifier')
      )
    );
    if (anyMatchingSource) {
      const targetCol = dimensionTable.columns.find(
        (t) => this.normalizeSearchText(t.technicalName) === this.normalizeSearchText(anyMatchingSource.technicalName)
      );
      if (targetCol) return { sourceColumn: anyMatchingSource, targetColumn: targetCol };
    }

    return undefined;
  }

  private businessIntentEntityJoinKeys(entity: string) {
    const dictionary: Record<string, string[]> = {
      produit: ['produit', 'product', 'article'],
      categorie: ['produit', 'product', 'article'],
      client: ['client', 'customer'],
      region: ['region', 'geographie', 'geo', 'territoire', 'zone'],
      magasin: ['magasin', 'store', 'boutique', 'store id', 'store_id'],
      type_magasin: ['magasin', 'store', 'boutique'],
      employe: ['employe', 'employee', 'vendeur', 'commercial', 'employee id', 'employee_id'],
      moyen_paiement: ['moyen paiement', 'mode paiement', 'methode paiement', 'paiement', 'paiment', 'payment', 'payment method', 'payment_method'],
      mois: ['temps', 'date', 'calendrier', 'time'],
      annee: ['temps', 'date', 'calendrier', 'time', 'annee', 'year'],
      promotion: ['promotion', 'promo', 'promotion id', 'promotion_id']
    };
    const entityNorm = this.normalizeSearchText(entity);
    const baseEntity = entityNorm.replace(/^(dim_|f_|tbl_)/, '');
    const genericKeys = [entityNorm, baseEntity, this.businessIntentJoinKey(entityNorm), this.businessIntentJoinKey(baseEntity)];
    const dictKeys = dictionary[entity] || [];
    return Array.from(new Set([...dictKeys, ...genericKeys])).map((value) => this.businessIntentJoinKey(value));
  }

  private businessIntentJoinKey(value: string) {
    return this.normalizeSearchText(value)
      .replace(/\b(sk|pk|fk|id|cle|key|code|dim|fact|f)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private businessEntityLabelCandidates(entity: string) {
    const dictionary: Record<string, string[]> = {
      produit: ['nom produit', 'libelle produit', 'produit', 'designation produit'],
      categorie: ['categorie', 'categorie produit', 'nom categorie'],
      client: ['nom client', 'client', 'raison sociale', 'full name'],
      region: ['region', 'nom region', 'zone commerciale'],
      magasin: ['store_name', 'store name', 'nom magasin', 'magasin', 'store', 'boutique', 'libelle magasin'],
      type_magasin: ['type magasin', 'type de magasin', 'canal'],
      employe: ['employee_name', 'employee name', 'nom employe', 'employe', 'nom', 'employee', 'vendeur', 'commercial'],
      moyen_paiement: [
        'payment_method',
        'payment method',
        'payment',
        'moyen paiement',
        'mode paiement',
        'moyen de paiement',
        'methode paiement',
        'methode de paiement',
        'methode de paiment',
        'methodes de paiement',
        'methodes de paiment',
        'methodes de paiments',
        'libelle paiement',
        'nom paiement',
        'type paiement',
        'type de paiement'
      ],
      mois: ['nom mois', 'mois', 'month'],
      annee: ['annee', 'year', 'an', 'exercice'],
      promotion: ['promotion_name', 'promotion name', 'nom promotion', 'promotion', 'promo', 'promotion_type', 'type promotion']
    };
    return (dictionary[entity] || [entity]).map((value) => this.normalizeSearchText(value));
  }

  private businessEntityTableHints(entity: string) {
    const dictionary: Record<string, string[]> = {
      produit: ['dim produit', 'produit', 'product'],
      categorie: ['dim produit', 'produit', 'product'],
      client: ['dim client', 'client', 'customer'],
      region: ['dim geographie', 'geographie', 'region', 'geo'],
      magasin: ['dim store', 'dim_store', 'store', 'dim magasin', 'magasin', 'boutique'],
      type_magasin: ['dim magasin', 'magasin', 'store'],
      employe: ['dim employee', 'dim_employee', 'dim employe', 'employe', 'employee', 'vendeur', 'commercial'],
      moyen_paiement: [
        'dim payment method',
        'dim_payment_method',
        'payment_method',
        'payment method',
        'dim moyen paiement',
        'dim_moyen_paiement',
        'moyen paiement',
        'paiement',
        'paiment',
        'payment'
      ],
      mois: ['dim temps', 'temps', 'date', 'calendrier'],
      annee: ['dim temps', 'temps', 'date', 'calendrier'],
      promotion: ['dim promotion', 'dim_promotion', 'promotion', 'promo']
    };
    return (dictionary[entity] || [entity]).map((value) => this.normalizeSearchText(value));
  }

  private businessIntentMetricAlias(intent: BusinessIntent) {
    if (intent.aggregation === 'count' || intent.metric === 'count') {
      if (intent.entity === 'client') return 'nombre_clients';
      if (intent.entity === 'produit') return 'nombre_produits';
      if (intent.entity === 'moyen_paiement') return 'nombre_ventes';
      return 'nombre_ventes';
    }
    if (intent.metric === 'quantite') return 'quantite_vendue';
    if (intent.metric === 'marge_brute') return 'marge_totale';
    if (intent.metric === 'montant_total') return 'chiffre_affaires';
    return this.toSqlAlias(`${intent.aggregation || 'sum'} ${intent.metric || 'metric'}`);
  }

  private quoteQualifiedColumn(table: SemanticTable, column: SemanticColumnLike) {
    return `${this.quoteQualifiedSqlName(table.technicalName)}.${this.quoteSqlIdentifier(column.technicalName)}`;
  }

  private isListRecordsQuestion(normalizedQuestion: string) {
    const listWords = ['affiche', 'afficher', 'liste', 'lister', 'show', 'list', 'donne', 'donner', 'display'];
    const columnWords = ['nom', 'noms', 'prenom', 'prenoms', 'first name', 'last name', 'email', 'telephone', 'phone'];
    const recordWords = ['client', 'clients', 'customer', 'customers', 'produit', 'produits', 'product', 'products'];
    const metricWords = ['chiffre', 'affaire', 'revenue', 'sales', 'total', 'moyenne', 'average', 'nombre de', 'count'];
    return (
      this.hasAny(normalizedQuestion, listWords) &&
      (this.hasAny(normalizedQuestion, columnWords) || this.hasAny(normalizedQuestion, recordWords)) &&
      !this.hasAny(normalizedQuestion, metricWords)
    );
  }

  private findBestSemanticTable(
    normalizedQuestion: string,
    layer: SemanticLayerResponse,
    semanticHints: string[]
  ): SemanticTable | undefined {
    const normalizedHints = new Set(semanticHints.map((hint) => this.normalizeSearchText(hint)));
    return layer.tables
      .map((table) => ({
        table,
        score:
          this.semanticTextScore(normalizedQuestion, [table.technicalName, table.businessName, table.description]) +
          (normalizedHints.has(this.normalizeSearchText(table.technicalName)) ||
            normalizedHints.has(this.normalizeSearchText(table.businessName))
            ? 4
            : 0)
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)[0]?.table;
  }

  private findBestJoinedDimensionSelection(
    normalizedQuestion: string,
    metricTable: SemanticTable,
    layer: SemanticLayerResponse,
    semanticHints: string[],
    relationships: SemanticRelationship[]
  ): SemanticJoinSelection | undefined {
    const normalizedHints = new Set(semanticHints.map((hint) => this.normalizeSearchText(hint)));
    const candidateTables = layer.tables
      .filter((table) => table.technicalName !== metricTable.technicalName)
      .filter((table) => table.tableType === 'dimension' || table.columns.some((column) => column.semanticType === 'dimension'));

    const scored = candidateTables
      .map((table) => {
        const relationship = relationships.find(
          (item) =>
            this.normalizeSqlReference(item.fromTableTechnicalName) === this.normalizeSqlReference(metricTable.technicalName) &&
            this.normalizeSqlReference(item.toTableTechnicalName) === this.normalizeSqlReference(table.technicalName)
        );
        const questionTokens = normalizedQuestion
          .replace(/\bdistricution\b/g, 'distribution')
          .replace(/\bpar an\b/g, 'par annee')
          .split(' ')
          .filter((w) => w.length >= 3 || w === 'an' || w === 'ca');
        const matchingColumn = table.columns.find((col) => {
          const colClean = this.normalizeSearchText(`${col.technicalName} ${col.businessName}`);
          return questionTokens.some((token) => colClean.includes(token));
        });

        const labelColumn = (
          matchingColumn ||
          this.findDimensionLabelColumn(table.columns) ||
          table.columns.find((column) => column.semanticType === 'dimension' || this.isTextType(column.dataType))
        ) as SemanticColumn | undefined;

        const joinPair = relationship
          ? this.findBusinessIntentRelationshipColumns(metricTable, table, relationship)
          : this.findBusinessIntentJoinColumns(this.normalizeSearchText(table.technicalName), metricTable, table);

        if (!joinPair || !labelColumn) {
          return { table, relationship, labelColumn, joinPair: undefined, score: 0 };
        }

        const textScore = this.semanticTextScore(normalizedQuestion, [
          table.technicalName,
          table.businessName,
          this.semanticTableMatchKey(table.technicalName),
          this.semanticTableMatchKey(table.businessName),
          table.description,
          labelColumn.technicalName,
          labelColumn.businessName,
          this.semanticTableMatchKey(labelColumn.technicalName),
          this.semanticTableMatchKey(labelColumn.businessName),
          ...table.columns.map((c) => `${c.technicalName} ${c.businessName}`)
        ]);
        const matchBonus = matchingColumn ? 8 : 0;
        const hintScore =
          (normalizedHints.has(this.normalizeSearchText(table.technicalName)) ||
            normalizedHints.has(this.normalizeSearchText(table.businessName))
            ? 4
            : 0) +
          (this.isLikelyLabelColumn(labelColumn.technicalName) || this.isLikelyLabelColumn(labelColumn.businessName) ? 2 : 0);
        if (textScore <= 0 && hintScore <= 0 && matchBonus <= 0) {
          return { table, relationship, labelColumn, joinPair: undefined, score: 0 };
        }
        const score = textScore + hintScore + matchBonus + (table.tableType === 'dimension' ? 2 : 0) + (relationship ? 3 : 2);

        return { table, relationship, labelColumn, joinPair, score };
      })
      .filter((item) => item.score >= 5 && item.joinPair)
      .sort((a, b) => b.score - a.score);

    const best = scored[0];
    if (!best?.labelColumn || !best.joinPair) return undefined;

    return {
      table: best.table,
      labelColumn: best.labelColumn,
      sourceColumn: best.joinPair.sourceColumn,
      targetColumn: best.joinPair.targetColumn,
      relationship: best.relationship
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

  private findRequestedListColumns(
    normalizedQuestion: string,
    table: SemanticTable,
    semanticHints: string[]
  ): SemanticColumn[] {
    const normalizedHints = new Set(semanticHints.map((hint) => this.normalizeSearchText(hint)));
    const candidates = table.columns
      .filter((column) => column.semanticType !== 'identifier')
      .map((column) => {
        const aliases = this.columnQuestionAliases(column);
        const score =
          this.semanticTextScore(normalizedQuestion, [column.technicalName, column.businessName, ...aliases]) +
          (normalizedHints.has(this.normalizeSearchText(column.technicalName)) ||
            normalizedHints.has(this.normalizeSearchText(column.businessName))
            ? 4
            : 0);
        return { column, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    const selected = candidates.map((item) => item.column).slice(0, 6);
    if (selected.length) return selected;

    return table.columns
      .filter((column) => column.semanticType === 'dimension' || this.isTextType(column.dataType))
      .filter((column) => column.semanticType !== 'identifier')
      .slice(0, 6);
  }

  private columnQuestionAliases(column: SemanticColumn) {
    const normalized = this.normalizeSearchText(`${column.technicalName} ${column.businessName}`);
    const aliases: string[] = [];
    if (this.hasAny(normalized, ['first name', 'firstname', 'prenom', 'given name'])) {
      aliases.push('prenom', 'prénom', 'first name', 'given name');
    }
    if (this.hasAny(normalized, ['last name', 'lastname', 'nom', 'surname', 'family name'])) {
      aliases.push('nom', 'last name', 'surname', 'family name');
    }
    if (this.hasAny(normalized, ['full name', 'name', 'nom complet'])) {
      aliases.push('nom', 'nom complet', 'name', 'full name');
    }
    if (this.hasAny(normalized, ['email', 'mail'])) aliases.push('email', 'mail', 'courriel');
    if (this.hasAny(normalized, ['phone', 'telephone', 'mobile'])) aliases.push('telephone', 'téléphone', 'phone', 'mobile');
    return aliases;
  }

  private findBestSemanticColumn(
    normalizedQuestion: string,
    candidates: Array<{ table: SemanticTable; column: SemanticColumn }>,
    semanticTypes: SemanticType[],
    synonymHints: string[]
  ) {
    const normalizedHints = new Set(synonymHints.map((hint) => this.normalizeSearchText(hint)));
    const isDimensionSearch = semanticTypes.length === 1 && semanticTypes[0] === 'dimension';
    return candidates
      .filter((item) => semanticTypes.includes(item.column.semanticType))
      .map((item) => {
        const colScore = this.semanticTextScore(normalizedQuestion, [
          item.column.technicalName,
          item.column.businessName
        ]);
        const tableScore = isDimensionSearch
          ? 0
          : this.semanticTextScore(normalizedQuestion, [
              item.table.technicalName,
              item.table.businessName
            ]);
        const hintScore =
          (normalizedHints.has(this.normalizeSearchText(item.column.technicalName)) ||
            normalizedHints.has(this.normalizeSearchText(item.column.businessName))
            ? 4
            : 0);
        return {
          ...item,
          score: colScore + tableScore + hintScore
        };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)[0];
  }

  private semanticTextScore(normalizedQuestion: string, values: string[]) {
    return values.reduce((score, value) => {
      const normalized = this.normalizeSearchText(value);
      if (!normalized) return score;
      if (normalizedQuestion.includes(normalized)) return score + 5;
      return (
        score +
        normalized
          .split(' ')
          .filter((part) => part.length > 2 && normalizedQuestion.includes(part)).length
      );
    }, 0);
  }

  private findColumnForKpiFormula(
    sqlFormula: string,
    allColumns: Array<{ table: SemanticTable; column: SemanticColumn }>
  ): SemanticColumn | undefined {
    const columnNames = this.extractSqlIdentifiers(sqlFormula);
    return allColumns.find((item) => columnNames.includes(item.column.technicalName))?.column;
  }

  private findTableForKpiFormula(
    sqlFormula: string,
    allColumns: Array<{ table: SemanticTable; column: SemanticColumn }>
  ): SemanticTable | undefined {
    const columnNames = this.extractSqlIdentifiers(sqlFormula);
    return allColumns.find((item) => columnNames.includes(item.column.technicalName))?.table;
  }

  private columnsForTable(table: SemanticTable) {
    return table.columns.map((column) => ({ table, column }));
  }

  private inferTimeGranularity(normalizedQuestion: string): 'day' | 'month' | 'year' {
    if (
      this.hasAny(normalizedQuestion, [
        'par an',
        'par annee',
        'annee',
        'annuel',
        'annuelle',
        'annual',
        'year',
        'yearly'
      ])
    ) {
      return 'year';
    }

    if (this.hasAny(normalizedQuestion, ['jour', 'quotidien', 'quotidienne', 'daily', 'day'])) {
      return 'day';
    }

    return 'month';
  }

  private semanticTimeSeriesLimit(granularity: 'day' | 'month' | 'year') {
    if (granularity === 'year') return 20;
    if (granularity === 'day') return 60;
    return 24;
  }

  private timeGranularityLabel(granularity: 'day' | 'month' | 'year') {
    if (granularity === 'year') return 'année';
    if (granularity === 'day') return 'jour';
    return 'mois';
  }

  private findBestTimeSeriesDateColumn(
    normalizedQuestion: string,
    table: SemanticTable,
    semanticHints: string[]
  ): SemanticColumn | undefined {
    const dateCandidates = this.columnsForTable(table).filter((item) => item.column.semanticType === 'date');
    if (!dateCandidates.length) return undefined;

    const normalizedHints = new Set(semanticHints.map((hint) => this.normalizeSearchText(hint)));
    const auditDateRequested = this.hasAny(normalizedQuestion, [
      'mise a jour',
      'maj',
      'updated',
      'update',
      'creation',
      'created',
      'cree',
      'modifie',
      'modified',
      'audit',
      'chargement',
      'loaded',
      'insert'
    ]);
    const salesContext =
      this.hasAny(normalizedQuestion, [
        'vente',
        'ventes',
        'sales',
        'chiffre',
        'affaire',
        'revenue',
        'commande',
        'facture'
      ]) || /\bca\b/.test(normalizedQuestion);

    return dateCandidates
      .map((item) => {
        const normalizedColumnName = this.normalizeSearchText(`${item.column.technicalName} ${item.column.businessName}`);
        const normalizedName = this.normalizeSearchText(
          `${item.column.technicalName} ${item.column.businessName} ${item.table.technicalName} ${item.table.businessName}`
        );
        const isAuditDate = this.hasAny(normalizedColumnName, [
          'updated',
          'update',
          'mise a jour',
          'maj',
          'created',
          'creation',
          'cree',
          'modified',
          'modifie',
          'audit',
          'load',
          'loaded',
          'chargement',
          'insert'
        ]);
        const isBusinessSalesDate = this.hasAny(normalizedColumnName, [
          'vente',
          'sales',
          'commande',
          'order',
          'facture',
          'invoice',
          'livraison',
          'delivery',
          'expedition',
          'shipping',
          'transaction'
        ]);
        const hintScore =
          normalizedHints.has(this.normalizeSearchText(item.column.technicalName)) ||
          normalizedHints.has(this.normalizeSearchText(item.column.businessName))
            ? 4
            : 0;

        let score =
          this.semanticTextScore(normalizedQuestion, [
            item.column.technicalName,
            item.column.businessName,
            item.table.technicalName,
            item.table.businessName
          ]) + hintScore;

        if (isBusinessSalesDate) score += salesContext ? 7 : 4;
        if (this.hasAny(normalizedColumnName, ['date'])) score += 1;
        if (isAuditDate) score += auditDateRequested ? 2 : -10;

        return { ...item, score };
      })
      .sort((a, b) => b.score - a.score)[0]?.column;
  }

  private findSemanticFilters(
    normalizedQuestion: string,
    tables: SemanticTable[],
    semanticHints: string[],
    isForecast: boolean = false
  ): SemanticQueryFilter[] {
    const filters: SemanticQueryFilter[] = [];
    for (const table of tables) {
      const dimensions = table.columns.filter((column) => column.semanticType === 'dimension' || this.isTextType(column.dataType));
      for (const column of dimensions) {
        if (isForecast && this.hasAny(this.normalizeSearchText(`${column.technicalName} ${column.businessName}`), ['annee', 'year', 'date', 'mois', 'month'])) {
          continue;
        }
        const value = this.extractFilterValueForColumn(normalizedQuestion, column, semanticHints);
        if (value) filters.push({ table, column, value });
      }
    }
    return filters.slice(0, 3);
  }

  private extractFilterValueForColumn(
    normalizedQuestion: string,
    column: SemanticColumn,
    semanticHints: string[]
  ) {
    const aliases = [
      column.technicalName,
      column.businessName,
      ...this.columnQuestionAliases(column),
      ...semanticHints.filter((hint) => this.normalizeSearchText(hint) === this.normalizeSearchText(column.technicalName))
    ]
      .map((value) => this.normalizeSearchText(value))
      .filter(Boolean);

    const uniqueAliases = Array.from(new Set(aliases));
    for (const alias of uniqueAliases) {
      const patterns = [
        new RegExp(`\\b${this.escapeRegExp(alias)}\\s+(?:est|=|egale|égal|equals|is|de|des|concernent|concernant)?\\s+([\\p{L}\\p{N}_-]+)`, 'u'),
        new RegExp(`\\b(?:pour|de|des|concernent|concernant)\\s+(?:la\\s+|le\\s+|les\\s+)?${this.escapeRegExp(alias)}\\s+([\\p{L}\\p{N}_-]+)`, 'u')
      ];
      for (const pattern of patterns) {
        const match = normalizedQuestion.match(pattern);
        const value = match?.[1]?.trim();
        if (value && !this.isFilterStopWord(value)) return this.toBusinessName(value).trim();
      }
    }

    if (this.hasAny(this.normalizeSearchText(`${column.technicalName} ${column.businessName}`), ['category', 'categorie', 'catégorie'])) {
      const match = normalizedQuestion.match(/\b(?:categorie|category|catégorie)\s+([\p{L}\p{N}_-]+)/u);
      const value = match?.[1]?.trim();
      if (value && !this.isFilterStopWord(value)) return this.toBusinessName(value).trim();
    }

    return '';
  }

  private isFilterStopWord(value: string) {
    return ['qui', 'que', 'dont', 'par', 'pour', 'des', 'les', 'la', 'le', 'de', 'du', 'the', 'a', 'an'].includes(
      this.normalizeSearchText(value)
    );
  }

  private escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private async executePostgresSemanticSelect(
    context: DatasourceResolvedContext,
    question: string,
    sql: string,
    plan: SemanticQueryPlan | undefined,
    startedAt: number,
    datasourceId: string | undefined,
    validation: SqlValidationResult,
    retrievalHits: SemanticSearchHit[] = []
  ): Promise<ExecuteQueryResult> {
    const pool = this.newDatasourcePostgresPool(context);
    const client = await pool.connect();
    try {
      const schema = String(context.connectionConfig?.schema || '').trim();
      if (schema) {
        this.assertSafeDatasourceSchema(schema);
        await client.query(`SET search_path TO ${this.quoteSqlIdentifier(schema)}, public`);
      }
      const result = await client.query(sql);
      let columns = result.fields.map((field) => field.name);
      let rows = result.rows.map((row) => this.normalizeResultRow(row));

      const forecast = this.statisticalForecast.applyForecast(question, columns, rows);
      let forecastExplanation = '';
      if (forecast.isForecastRequested) {
        if (forecast.hasSufficientHistory) {
          rows = forecast.enrichedRows;
          columns = forecast.enrichedColumns;
          forecastExplanation = forecast.explanation;
        } else {
          forecastExplanation = forecast.explanation;
        }
      }

      const narrativeResult = await this.buildVerifiedNarrative(question, rows, columns, plan, forecastExplanation || undefined);
      const finalNarrative = forecastExplanation
        ? (forecast.hasSufficientHistory ? `${forecast.explanation} ${narrativeResult.narrative}` : forecast.explanation)
        : narrativeResult.narrative;

      return {
        status: 'ok',
        columns,
        rows,
        chartType:
          (forecast.isForecastRequested && forecast.hasSufficientHistory ? 'bar' : undefined) ||
          plan?.chartType ||
          this.inferChartTypeFromSignals({
            question,
            columns,
            rows
          }),
        narrative: finalNarrative,
        executionMs: Date.now() - startedAt,
        confidence: plan?.confidence || 0.5,
        usedEntities: plan ? this.getPlanUsedEntities(plan) : [],
        provenance: plan
          ? this.buildQueryProvenance(plan, datasourceId, validation, retrievalHits)
          : this.emptyQueryProvenance(datasourceId, validation.ok, validation.reason),
        warnings: Array.from(new Set([...validation.warnings, ...narrativeResult.warnings]))
      };
    } finally {
      client.release();
      await pool.end().catch(() => undefined);
    }
  }

  public semanticFallbackResult(
    question: string,
    sql: string,
    layer: SemanticLayerResponse | undefined,
    plan: SemanticQueryPlan | undefined,
    startedAt: number,
    warning?: string,
    status: ExecuteQueryResult['status'] = 'cannot_answer',
    datasourceId?: string,
    validation?: SqlValidationResult,
    retrievalHits: SemanticSearchHit[] = []
  ): ExecuteQueryResult {
    const columns: string[] = [];
    const rows: Array<Record<string, string | number>> = [];
    const reason =
      warning ||
      (layer
        ? 'La question ne peut pas être traitée de façon fiable avec la couche sémantique disponible.'
        : `Couche sémantique indisponible pour : ${question}`);

    return {
      status,
      columns,
      rows,
      chartType: plan?.chartType || 'table',
      narrative: this.buildSemanticNarrative(rows, columns, plan, reason),
      executionMs: Date.now() - startedAt,
      confidence: status === 'cannot_answer' ? 0.1 : 0.2,
      usedEntities: plan ? this.getPlanUsedEntities(plan) : [],
      provenance: plan
        ? this.buildQueryProvenance(plan, datasourceId, validation || this.failedValidation(reason), retrievalHits)
        : this.emptyQueryProvenance(datasourceId, Boolean(validation?.ok), validation?.reason || reason),
      warnings: Array.from(new Set([reason, ...(validation?.warnings || [])]))
    };
  }

  private buildSemanticNarrative(
    rows: Array<Record<string, string | number>>,
    columns: string[],
    plan: SemanticQueryPlan | undefined,
    warning?: string
  ) {
    if (!plan) {
      return warning || 'J’ai besoin d’une couche sémantique sauvegardée pour la source sélectionnée avant de répondre de façon fiable.';
    }

    if (warning && !rows.length) {
      return `${warning} Aucune donnée n’a été retournée, car AskMe affiche uniquement les résultats validés et exécutés sur la source sélectionnée.`;
    }

    const context = `J’ai utilisé la couche sémantique sauvegardée : ${plan.table.businessName}, métrique ${plan.metricAlias}`;
    const grouping = plan.dateColumn
      ? ` regroupée par ${plan.dateGranularity ? this.timeGranularityLabel(plan.dateGranularity) : 'période'} via ${plan.dateColumn.businessName}`
      : plan.dimensionColumn
        ? ` regroupée par ${plan.dimensionColumn.businessName}`
        : '';
    const firstRow = rows[0];
    const highlight =
      firstRow && columns.length
        ? ` Premier résultat : ${columns.map((column) => `${column} = ${firstRow[column]}`).join(', ')}.`
        : '';

    return `${warning ? `${warning} ` : ''}${context}${grouping}.${highlight}`;
  }

  private async buildVerifiedNarrative(
    question: string,
    rows: Array<Record<string, string | number>>,
    columns: string[],
    plan: SemanticQueryPlan | undefined,
    warning?: string
  ): Promise<{ narrative: string; warnings: string[] }> {
    const deterministic = this.buildSemanticNarrative(rows, columns, plan, warning);
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || apiKey === 'change-me' || process.env.LLM_NARRATIVE_ENABLED === 'false' || !plan || !rows.length) {
      return { narrative: deterministic, warnings: [] };
    }

    const prompt = [
      'Tu écris des narrations BI concises à partir de résultats de requête vérifiés.',
      'Utilise uniquement les lignes, colonnes, métriques, regroupements et éléments de provenance fournis.',
      'N’invente aucune cause, aucun nombre, aucun libellé, aucune tendance, aucune recommandation et aucun contexte métier.',
      'Si les lignes sont insuffisantes, décris seulement ce qui est visible.',
      'Réponds en français par défaut. Si la question demande explicitement une autre langue, utilise cette langue.',
      'Retourne un seul court paragraphe.',
      '',
      JSON.stringify({
        table: plan.table.businessName,
        metric: plan.metricAlias,
        grouping: plan.dateColumn?.businessName || plan.dimensionColumn?.businessName || null,
        question,
        columns,
        rows: rows.slice(0, 10)
      })
    ].join('\n');

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: process.env.GROQ_NARRATIVE_MODEL || process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
          temperature: aiGenerationConfig.narrative.temperature,
          top_p: aiGenerationConfig.narrative.topP,
          max_tokens: aiGenerationConfig.narrative.maxCompletionTokens,
          frequency_penalty: aiGenerationConfig.narrative.frequencyPenalty,
          presence_penalty: aiGenerationConfig.narrative.presencePenalty,
          stop: aiGenerationConfig.narrative.stop,
          messages: [
            {
              role: 'system',
              content:
                'Tu es un narrateur analytics prudent. Chaque affirmation doit être strictement basée sur les lignes exécutées fournies.'
            },
            { role: 'user', content: prompt }
          ]
        })
      });

      if (!response.ok) {
        return {
          narrative: deterministic,
          warnings: [`Narration LLM ignorée : Groq a retourné ${response.status}.`]
        };
      }

      const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const narrative = String(body.choices?.[0]?.message?.content || '').trim();
      if (!narrative) {
        return { narrative: deterministic, warnings: ['Narration LLM ignorée : réponse vide.'] };
      }

      return {
        narrative: narrative.slice(0, 1200),
        warnings: ['Narration générée par LLM à partir des lignes exécutées et validées uniquement.']
      };
    } catch (error) {
      return {
        narrative: deterministic,
        warnings: [`Narration LLM ignorée : ${error instanceof Error ? error.message : 'erreur inconnue'}.`]
      };
    }
  }

  private getPlanUsedEntities(plan: SemanticQueryPlan): QueryEntity[] {
    const entities: QueryEntity[] = [
      {
        type: 'table',
        name: plan.table.businessName,
        technicalName: plan.table.technicalName
      }
    ];

    if (plan.dimensionTable && plan.dimensionTable.technicalName !== plan.table.technicalName) {
      entities.push({
        type: 'table',
        name: plan.dimensionTable.businessName,
        technicalName: plan.dimensionTable.technicalName
      });
    }

    if (plan.matchedKpi) {
      entities.push({ type: 'kpi', name: plan.matchedKpi.name });
    }
    if (plan.measureColumn) {
      entities.push({
        type: 'column',
        name: plan.measureColumn.businessName,
        technicalName: plan.measureColumn.technicalName
      });
    }
    for (const column of plan.selectedColumns || []) {
      entities.push({
        type: 'column',
        name: column.businessName,
        technicalName: column.technicalName
      });
    }
    if (plan.dateColumn) {
      entities.push({
        type: 'column',
        name: plan.dateColumn.businessName,
        technicalName: plan.dateColumn.technicalName
      });
    }
    if (plan.dimensionColumn) {
      entities.push({
        type: 'column',
        name: plan.dimensionColumn.businessName,
        technicalName: plan.dimensionColumn.technicalName
      });
    }
    if (plan.joinRelationship) {
      const joinedTables = [plan.table, plan.dimensionTable].filter((table): table is SemanticTable => Boolean(table));
      for (const technicalName of [
        plan.joinRelationship.fromColumnTechnicalName,
        plan.joinRelationship.toColumnTechnicalName
      ]) {
        const column = joinedTables.flatMap((table) => table.columns).find((item) => item.technicalName === technicalName);
        if (column) {
          entities.push({
            type: 'column',
            name: column.businessName,
            technicalName: column.technicalName
          });
        }
      }
    }
    for (const filter of plan.filters || []) {
      entities.push({
        type: 'column',
        name: filter.column.businessName,
        technicalName: filter.column.technicalName
      });
    }

    return entities.filter(
      (entity, index, all) =>
        all.findIndex((candidate) => candidate.type === entity.type && candidate.technicalName === entity.technicalName) === index
    );
  }

  private buildQueryProvenance(
    plan: SemanticQueryPlan,
    datasourceId: string | undefined,
    validation: SqlValidationResult,
    retrievalHits: SemanticSearchHit[] = []
  ): QueryProvenance {
    const columns = [
      plan.measureColumn,
      plan.dateColumn,
      plan.dimensionColumn,
      ...(plan.selectedColumns || []),
      ...(plan.filters || []).map((filter) => filter.column)
    ].filter(
      (column): column is SemanticColumn => Boolean(column)
    );

    return {
      datasourceId,
      retrieval: retrievalHits.slice(0, 5).map((hit) => ({
        entityType: hit.entityType,
        entityName: hit.entityName,
        score: Number(hit.score.toFixed(3))
      })),
      table: {
        businessName: plan.table.businessName,
        technicalName: plan.table.technicalName
      },
      metric: plan.metricAlias,
      kpi: plan.matchedKpi?.name,
      columns: columns.map((column) => ({
        businessName: column.businessName,
        technicalName: column.technicalName,
        semanticType: column.semanticType
      })),
      sqlValidated: validation.ok,
      validationReason: validation.reason
    };
  }

  private emptyQueryProvenance(
    datasourceId: string | undefined,
    sqlValidated: boolean,
    validationReason?: string
  ): QueryProvenance {
    return {
      datasourceId,
      columns: [],
      sqlValidated,
      validationReason
    };
  }
}
