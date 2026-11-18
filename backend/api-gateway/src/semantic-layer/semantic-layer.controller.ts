import { Body, Controller, Delete, Get, Headers, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppService } from '../app.service';
import { SemanticMcpEnricherService } from './semantic-mcp-enricher.service';
import {
  CreateSemanticKpiDto,
  CreateSemanticSynonymDto,
  GenerateSemanticProposalDto,
  McpEnrichRequestDto,
  SaveSemanticLayerDto,
  UpdateSemanticColumnDto,
  UpdateSemanticTableDto
} from './dto/semantic.dto';

@ApiTags('Couche Sémantique & Modélisation BI')
@ApiBearerAuth()
@Controller()
export class SemanticLayerController {
  constructor(
    private readonly appService: AppService,
    private readonly mcpEnricher: SemanticMcpEnricherService
  ) {}

  @Get('/api/v1/semantic/:datasourceId')
  @ApiOperation({ summary: 'Obtenir la couche sémantique persistée pour une source' })
  @ApiResponse({ status: 200, description: 'Couche sémantique (tables, colonnes, KPIs, synonymes, relations)' })
  async semantic(
    @Headers('authorization') authorization: string | undefined,
    @Param('datasourceId') datasourceId: string
  ) {
    const user = this.appService.requireAuthUser(this.extractBearer(authorization));
    return this.appService.getSemanticLayer(user, datasourceId);
  }

  @Post('/api/v1/semantic/:datasourceId/generate')
  @ApiOperation({ summary: 'Générer automatiquement une couche sémantique heuristique' })
  @ApiResponse({ status: 201, description: 'Couche sémantique générée et indexée' })
  async generateSemantic(
    @Headers('authorization') authorization: string | undefined,
    @Param('datasourceId') datasourceId: string
  ) {
    const user = this.appService.requireAuthUser(this.extractBearer(authorization));
    return this.appService.generateSemanticLayer(user, datasourceId);
  }

  @Post(['/api/v1/semantic-layer/:datasourceId/generate-proposal', '/api/semantic-layer/:datasourceId/generate-proposal'])
  @ApiOperation({ summary: 'Générer une proposition interactive de modélisation (avec ou sans LLM)' })
  @ApiResponse({ status: 201, description: 'Propositions de tables, colonnes, KPIs et relations' })
  async generateSemanticProposal(
    @Headers('authorization') authorization: string | undefined,
    @Param('datasourceId') datasourceId: string,
    @Body() body: GenerateSemanticProposalDto
  ) {
    const user = this.appService.requireAuthUser(this.extractBearer(authorization));
    return this.appService.generateSemanticProposal(user, datasourceId, body);
  }

  @Post(['/api/v1/semantic-layer/:datasourceId/save', '/api/semantic-layer/:datasourceId/save'])
  @ApiOperation({ summary: 'Sauvegarder et synchroniser la couche sémantique validée' })
  @ApiResponse({ status: 201, description: 'Couche sémantique enregistrée et embeddings pgvector mis à jour' })
  async saveSemanticLayer(
    @Headers('authorization') authorization: string | undefined,
    @Param('datasourceId') datasourceId: string,
    @Body() body: SaveSemanticLayerDto
  ) {
    const user = this.appService.requireAuthUser(this.extractBearer(authorization));
    return this.appService.saveSemanticLayer(user, datasourceId, body);
  }

  @Get(['/api/v1/semantic-layer/:datasourceId', '/api/semantic-layer/:datasourceId'])
  @ApiOperation({ summary: 'Consulter la couche sémantique (alias)' })
  async semanticLayer(
    @Headers('authorization') authorization: string | undefined,
    @Param('datasourceId') datasourceId: string
  ) {
    const user = this.appService.requireAuthUser(this.extractBearer(authorization));
    return this.appService.getSemanticLayer(user, datasourceId);
  }

  @Delete(['/api/v1/semantic-layer/:datasourceId', '/api/semantic-layer/:datasourceId'])
  @ApiOperation({ summary: 'Supprimer la couche sémantique d’une source' })
  @ApiResponse({ status: 200, description: 'Couche sémantique supprimée' })
  async deleteSemanticLayer(
    @Headers('authorization') authorization: string | undefined,
    @Param('datasourceId') datasourceId: string
  ) {
    const user = this.appService.requireAuthUser(this.extractBearer(authorization));
    return this.appService.deleteSemanticLayer(user, datasourceId);
  }

  @Put('/api/v1/semantic/:datasourceId/tables/:tableId')
  @ApiOperation({ summary: 'Mettre à jour le nom métier et la description d’une table' })
  async updateSemanticTable(
    @Headers('authorization') authorization: string | undefined,
    @Param('datasourceId') datasourceId: string,
    @Param('tableId') tableId: string,
    @Body() body: UpdateSemanticTableDto
  ) {
    const user = this.appService.requireAuthUser(this.extractBearer(authorization));
    return this.appService.updateSemanticTable(user, datasourceId, tableId, body.businessName, body.description);
  }

  @Put('/api/v1/semantic/:datasourceId/columns/:columnId')
  @ApiOperation({ summary: 'Mettre à jour le rôle sémantique et nom métier d’une colonne' })
  async updateSemanticColumn(
    @Headers('authorization') authorization: string | undefined,
    @Param('datasourceId') datasourceId: string,
    @Param('columnId') columnId: string,
    @Body() body: UpdateSemanticColumnDto
  ) {
    const user = this.appService.requireAuthUser(this.extractBearer(authorization));
    return this.appService.updateSemanticColumn(user, datasourceId, columnId, body.businessName, body.semanticType);
  }

  @Post('/api/v1/semantic/:datasourceId/kpis')
  @ApiOperation({ summary: 'Créer un KPI métier calculé' })
  async createSemanticKpi(
    @Headers('authorization') authorization: string | undefined,
    @Param('datasourceId') datasourceId: string,
    @Body() body: CreateSemanticKpiDto
  ) {
    const user = this.appService.requireAuthUser(this.extractBearer(authorization));
    return this.appService.createSemanticKpi(
      user,
      datasourceId,
      body.name,
      body.sqlFormula,
      body.description || '',
      body.formatting || ''
    );
  }

  @Post('/api/v1/semantic/:datasourceId/synonyms')
  @ApiOperation({ summary: 'Créer un synonyme métier' })
  async createSemanticSynonym(
    @Headers('authorization') authorization: string | undefined,
    @Param('datasourceId') datasourceId: string,
    @Body() body: CreateSemanticSynonymDto
  ) {
    const user = this.appService.requireAuthUser(this.extractBearer(authorization));
    return this.appService.createSemanticSynonym(user, datasourceId, body.term, body.mappedValue);
  }

  @Post(['/api/v1/semantic-layer/:datasourceId/mcp-enrich', '/api/semantic-layer/:datasourceId/mcp-enrich'])
  @ApiOperation({ summary: 'Enrichissement sémantique intelligent via LLM (colonnes, KPIs, synonymes, insights)' })
  @ApiResponse({ status: 201, description: 'Suggestions LLM pour la couche sémantique' })
  async mcpEnrich(
    @Headers('authorization') authorization: string | undefined,
    @Param('datasourceId') datasourceId: string,
    @Body() body: McpEnrichRequestDto
  ) {
    this.appService.requireAuthUser(this.extractBearer(authorization));
    return this.mcpEnricher.enrich({
      datasourceId,
      businessSector: body.businessSector || 'sales_distribution',
      language: body.language || 'fr',
      columns: body.columns || [],
      kpis: body.kpis || [],
      synonyms: body.synonyms || [],
      provider: body.provider || 'auto'
    });
  }

  private extractBearer(authorization?: string): string {
    if (!authorization) return '';
    const [scheme, token] = authorization.split(' ');
    if (scheme?.toLowerCase() !== 'bearer') return '';
    return token || '';
  }
}
