import { Body, Controller, Delete, Get, Headers, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppService } from '../app.service';
import { CreateDatasourceDto, UpdateDatasourceDto } from './dto/datasource.dto';

@ApiTags('Sources de Données & Datasets')
@ApiBearerAuth()
@Controller()
export class DatasourcesController {
  constructor(private readonly appService: AppService) {}

  @Get('/api/v1/datasources')
  @ApiOperation({ summary: 'Lister les sources de données configurées pour l’utilisateur' })
  @ApiResponse({ status: 200, description: 'Liste des sources de données' })
  async datasources(@Headers('authorization') authorization?: string) {
    const user = this.appService.requireAuthUser(this.extractBearer(authorization));
    return this.appService.listDatasources(user);
  }

  @Get('/api/v1/datasources/:id')
  @ApiOperation({ summary: 'Récupérer les détails d’une source de données par son identifiant' })
  @ApiResponse({ status: 200, description: 'Détails de la source' })
  @ApiResponse({ status: 403, description: 'Source non trouvée ou non autorisée' })
  async getDatasource(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string
  ) {
    const user = this.appService.requireAuthUser(this.extractBearer(authorization));
    return this.appService.getDatasource(user, id);
  }

  @Post('/api/v1/datasources')
  @ApiOperation({ summary: 'Enregistrer une nouvelle source de données avec chiffrement des secrets' })
  @ApiResponse({ status: 201, description: 'Source créée avec succès' })
  @ApiResponse({ status: 400, description: 'Paramètres invalides' })
  async createDatasource(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: CreateDatasourceDto
  ) {
    const user = this.appService.requireAuthUser(this.extractBearer(authorization));
    return this.appService.createDatasource(user, body);
  }

  @Put('/api/v1/datasources/:id')
  @ApiOperation({ summary: 'Mettre à jour les paramètres d’une source de données' })
  @ApiResponse({ status: 200, description: 'Source mise à jour avec succès' })
  @ApiResponse({ status: 400, description: 'Paramètres invalides' })
  @ApiResponse({ status: 403, description: 'Non autorisé' })
  async updateDatasource(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Body() body: UpdateDatasourceDto
  ) {
    const user = this.appService.requireAuthUser(this.extractBearer(authorization));
    return this.appService.updateDatasource(user, id, body);
  }

  @Delete('/api/v1/datasources/:id')
  @ApiOperation({ summary: 'Supprimer une source de données et purger en cascade sa couche sémantique' })
  @ApiResponse({ status: 200, description: 'Source et sémantique supprimées avec succès' })
  @ApiResponse({ status: 403, description: 'Non autorisé' })
  async deleteDatasource(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string
  ) {
    const user = this.appService.requireAuthUser(this.extractBearer(authorization));
    return this.appService.deleteDatasource(user, id);
  }

  @Post('/api/v1/datasources/test')
  @ApiOperation({ summary: 'Tester la connectivité réseau avec les paramètres fournis' })
  @ApiResponse({ status: 200, description: 'Résultat du test de connexion' })
  async testDatasource(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: CreateDatasourceDto
  ) {
    const user = this.appService.requireAuthUser(this.extractBearer(authorization));
    return this.appService.testDatasourceConnection(user, body);
  }

  @Post('/api/v1/datasources/schemas')
  @ApiOperation({ summary: 'Introspecter les schémas disponibles dans la base de données cible' })
  @ApiResponse({ status: 200, description: 'Liste des schémas découverts' })
  async datasourceSchemas(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: CreateDatasourceDto
  ) {
    const user = this.appService.requireAuthUser(this.extractBearer(authorization));
    return this.appService.listDatasourceSchemas(user, body);
  }

  @Get('/api/v1/datasets/:datasourceId/tables')
  async datasetTables(
    @Headers('authorization') authorization: string | undefined,
    @Param('datasourceId') datasourceId: string
  ) {
    const user = this.appService.requireAuthUser(this.extractBearer(authorization));
    return this.appService.listDatasetTables(user, datasourceId);
  }

  @Get('/api/v1/datasets/:datasourceId/tables/:tableName/columns')
  async datasetColumns(
    @Headers('authorization') authorization: string | undefined,
    @Param('datasourceId') datasourceId: string,
    @Param('tableName') tableName: string
  ) {
    const user = this.appService.requireAuthUser(this.extractBearer(authorization));
    return this.appService.getDatasetColumns(user, datasourceId, tableName);
  }

  @Get('/api/v1/datasets/:datasourceId/tables/:tableName/profile')
  async datasetProfile(
    @Headers('authorization') authorization: string | undefined,
    @Param('datasourceId') datasourceId: string,
    @Param('tableName') tableName: string
  ) {
    const user = this.appService.requireAuthUser(this.extractBearer(authorization));
    return this.appService.getDatasetProfile(user, datasourceId, tableName);
  }

  @Get('/api/v1/datasets/:datasourceId/tables/:tableName/preview')
  async datasetPreview(
    @Headers('authorization') authorization: string | undefined,
    @Param('datasourceId') datasourceId: string,
    @Param('tableName') tableName: string
  ) {
    const user = this.appService.requireAuthUser(this.extractBearer(authorization));
    return this.appService.getDatasetPreview(user, datasourceId, tableName, 20);
  }

  private extractBearer(authorization?: string): string {
    if (!authorization) return '';
    const [scheme, token] = authorization.split(' ');
    if (scheme?.toLowerCase() !== 'bearer') return '';
    return token || '';
  }
}
