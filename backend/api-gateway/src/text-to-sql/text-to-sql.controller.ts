import { Body, Controller, Delete, Get, Headers, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppService } from '../app.service';
import { ExecuteQueryDto, GenerateQueryDto, SaveChatSessionDto } from './dto/text-to-sql.dto';

@ApiTags('Copilot & Text-to-SQL')
@ApiBearerAuth()
@Controller()
export class TextToSqlController {
  constructor(private readonly appService: AppService) {}

  @Post('/api/v1/copilot/query/generate')
  @ApiOperation({ summary: 'Générer une requête SQL sécurisée et validée à partir d’une question en langage naturel' })
  @ApiHeader({ name: 'x-session-id', required: false, description: 'ID de session conversationnelle' })
  @ApiResponse({ status: 200, description: 'Requête SQL générée avec plan d’exécution et provenance' })
  async generate(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-session-id') sessionHeader: string | undefined,
    @Body() body: GenerateQueryDto
  ) {
    const user = this.appService.requireAuthUser(this.extractBearer(authorization));
    return this.appService.generateQuery(
      user,
      body.question,
      body.datasourceId,
      body.textToSqlProvider,
      body.sessionId || sessionHeader,
      body.dashboardId
    );
  }

  @Post('/api/v1/copilot/query/execute')
  @ApiOperation({ summary: 'Exécuter une requête SQL analytique bornée avec narratif et inférence de graphique' })
  @ApiHeader({ name: 'x-session-id', required: false, description: 'ID de session conversationnelle' })
  @ApiResponse({ status: 200, description: 'Données tabulaires, narratif exécutif et type de visualisation recommandé' })
  async execute(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-session-id') sessionHeader: string | undefined,
    @Body() body: ExecuteQueryDto
  ) {
    const user = this.appService.requireAuthUser(this.extractBearer(authorization));
    return this.appService.executeQuery(
      user,
      body.question,
      body.sql,
      body.datasourceId,
      body.sessionId || sessionHeader,
      body.dashboardId
    );
  }

  @Get('/api/v1/query/history')
  @ApiOperation({ summary: 'Consulter l’historique des requêtes exécutées par l’utilisateur' })
  async history(@Headers('authorization') authorization: string | undefined) {
    const user = this.appService.requireAuthUser(this.extractBearer(authorization));
    return this.appService.listQueryHistory(user.id);
  }

  @Get('/api/v1/copilot/sessions')
  @ApiOperation({ summary: 'Lister les sessions de chat de l’utilisateur' })
  async listSessions(@Headers('authorization') authorization: string | undefined) {
    const user = this.appService.requireAuthUser(this.extractBearer(authorization));
    return this.appService.listChatSessions(user.id);
  }

  @Get('/api/v1/copilot/sessions/:sessionId')
  @ApiOperation({ summary: 'Récupérer le détail d’une session de chat avec ses messages' })
  async getSession(
    @Headers('authorization') authorization: string | undefined,
    @Param('sessionId') sessionId: string
  ) {
    const user = this.appService.requireAuthUser(this.extractBearer(authorization));
    return this.appService.getChatSession(user.id, sessionId);
  }

  @Post('/api/v1/copilot/sessions')
  @ApiOperation({ summary: 'Sauvegarder ou mettre à jour une session de chat' })
  async saveSession(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: SaveChatSessionDto
  ) {
    const user = this.appService.requireAuthUser(this.extractBearer(authorization));
    return this.appService.saveChatSession(user.id, body);
  }

  @Delete('/api/v1/copilot/sessions/:sessionId')
  @ApiOperation({ summary: 'Supprimer une session de chat' })
  async deleteSession(
    @Headers('authorization') authorization: string | undefined,
    @Param('sessionId') sessionId: string
  ) {
    const user = this.appService.requireAuthUser(this.extractBearer(authorization));
    return { success: await this.appService.deleteChatSession(user.id, sessionId) };
  }

  private extractBearer(authorization?: string): string {
    if (!authorization) return '';
    const [scheme, token] = authorization.split(' ');
    if (scheme?.toLowerCase() !== 'bearer') return '';
    return token || '';
  }
}
