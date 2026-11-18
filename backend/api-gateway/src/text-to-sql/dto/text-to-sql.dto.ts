import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import type { TextToSqlProvider } from '../../copilot/copilot.types';

export class GenerateQueryDto {
  @ApiProperty({
    example: 'Quel est le chiffre d’affaires par mois en 2024 ?',
    description: 'Question analytique en langage naturel (français, anglais, arabe)'
  })
  @IsString()
  @IsNotEmpty({ message: 'La question est obligatoire' })
  question!: string;

  @ApiPropertyOptional({
    example: 'ds_dw_01',
    description: 'Identifiant de la source de données'
  })
  @IsOptional()
  @IsString()
  datasourceId?: string;

  @ApiPropertyOptional({
    example: 'auto',
    enum: ['static', 'ollama', 'groq', 'openrouter', 'auto'],
    description: 'Fournisseur de génération Text-to-SQL'
  })
  @IsOptional()
  @IsEnum(['static', 'ollama', 'groq', 'openrouter', 'auto'])
  textToSqlProvider?: TextToSqlProvider;

  @ApiPropertyOptional({
    example: 'session_conv_123',
    description: 'Identifiant de session conversationnelle multi-tours'
  })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiPropertyOptional({
    example: 'dash_sales_2024',
    description: 'Identifiant optionnel du dashboard associé'
  })
  @IsOptional()
  @IsString()
  dashboardId?: string;
}

export class ExecuteQueryDto {
  @ApiProperty({
    example: 'Quel est le chiffre d’affaires par mois en 2024 ?',
    description: 'Question originale de l’utilisateur'
  })
  @IsString()
  @IsNotEmpty({ message: 'La question est obligatoire' })
  question!: string;

  @ApiProperty({
    example: 'SELECT date_trunc(\'month\', "date_commande") AS "mois", SUM("montant_total") AS "ca" FROM "f_ventes" GROUP BY 1 ORDER BY 1 LIMIT 50;',
    description: 'Requête SQL SELECT validée par la couche sémantique'
  })
  @IsString()
  @IsNotEmpty({ message: 'La requête SQL est obligatoire' })
  sql!: string;

  @ApiPropertyOptional({
    example: 'ds_dw_01',
    description: 'Identifiant de la source de données'
  })
  @IsOptional()
  @IsString()
  datasourceId?: string;

  @ApiPropertyOptional({
    example: 'session_conv_123',
    description: 'Identifiant de session conversationnelle'
  })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiPropertyOptional({
    example: 'dash_sales_2024',
    description: 'Identifiant optionnel du dashboard associé'
  })
  @IsOptional()
  @IsString()
  dashboardId?: string;
}

export class SaveChatSessionDto {
  @ApiPropertyOptional({
    example: 'session_123',
    description: 'Identifiant optionnel de la session'
  })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiPropertyOptional({
    example: 'Prévision ventes 2026',
    description: 'Titre de la conversation'
  })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({
    example: 'ds_01',
    description: 'Identifiant de la source de données'
  })
  @IsOptional()
  @IsString()
  datasourceId?: string;

  @ApiProperty({
    description: 'Liste des messages de la session'
  })
  messages!: Array<Record<string, unknown>>;
}
