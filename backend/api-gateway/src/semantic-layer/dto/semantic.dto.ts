import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min
} from 'class-validator';
import type {
  SemanticBusinessSector,
  SemanticColumnProposal,
  SemanticKpiProposal,
  SemanticLayerLanguage,
  SemanticRelationship,
  SemanticSynonymProposal,
  SemanticTableProposal,
  SemanticType
} from '../semantic.types';

export class UpdateSemanticTableDto {
  @ApiProperty({ example: 'Ventes Globales', description: 'Nom métier de la table' })
  @IsString()
  @IsNotEmpty({ message: 'Le nom métier est requis' })
  businessName!: string;

  @ApiProperty({ example: 'Historique des transactions de ventes', description: 'Description fonctionnelle' })
  @IsString()
  description!: string;
}

export class UpdateSemanticColumnDto {
  @ApiProperty({ example: 'Montant HT', description: 'Nom métier de la colonne' })
  @IsString()
  @IsNotEmpty({ message: 'Le nom métier est requis' })
  businessName!: string;

  @ApiProperty({
    example: 'measure',
    enum: ['identifier', 'dimension', 'measure', 'attribute', 'date', 'technical_date', 'boolean_flag', 'sensitive', 'unknown'],
    description: 'Rôle sémantique'
  })
  @IsEnum([
    'identifier',
    'dimension',
    'measure',
    'attribute',
    'date',
    'technical_date',
    'boolean_flag',
    'sensitive',
    'unknown'
  ])
  semanticType!: SemanticType;
}

export class GenerateSemanticProposalDto {
  @ApiPropertyOptional({ example: false, description: 'Activer le raffinement par LLM' })
  @IsOptional()
  @IsBoolean()
  useAI?: boolean;

  @ApiPropertyOptional({ example: 100, description: 'Taille de l’échantillon de profilage' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  sampleSize?: number;

  @ApiPropertyOptional({ example: true, description: 'Écraser la proposition existante' })
  @IsOptional()
  @IsBoolean()
  overwriteExisting?: boolean;

  @ApiPropertyOptional({ example: 'fr', enum: ['en', 'fr', 'ar', 'auto'], description: 'Langue de la couche sémantique' })
  @IsOptional()
  @IsEnum(['en', 'fr', 'ar', 'auto'])
  semanticLanguage?: SemanticLayerLanguage | 'auto';

  @ApiPropertyOptional({
    example: 'sales_distribution',
    enum: [
      'sales_distribution',
      'finance_accounting',
      'human_resources',
      'logistics_supply_chain',
      'manufacturing_production',
      'marketing_crm',
      'healthcare',
      'education_training',
      'banking_insurance',
      'real_estate_construction'
    ],
    description: 'Secteur d’activité métier'
  })
  @IsOptional()
  @IsEnum([
    'sales_distribution',
    'finance_accounting',
    'human_resources',
    'logistics_supply_chain',
    'manufacturing_production',
    'marketing_crm',
    'healthcare',
    'education_training',
    'banking_insurance',
    'real_estate_construction'
  ])
  businessSector?: SemanticBusinessSector;
}

export class SaveSemanticLayerDto {
  @ApiPropertyOptional({ description: 'Propositions de tables validées' })
  @IsOptional()
  @IsArray()
  tables?: SemanticTableProposal[];

  @ApiPropertyOptional({ description: 'Propositions de colonnes validées' })
  @IsOptional()
  @IsArray()
  columns?: SemanticColumnProposal[];

  @ApiPropertyOptional({ description: 'KPIs validés' })
  @IsOptional()
  @IsArray()
  kpis?: SemanticKpiProposal[];

  @ApiPropertyOptional({ description: 'Synonymes validés' })
  @IsOptional()
  @IsArray()
  synonyms?: SemanticSynonymProposal[];

  @ApiPropertyOptional({ description: 'Relations de jointure validées' })
  @IsOptional()
  @IsArray()
  relationships?: SemanticRelationship[];

  @ApiPropertyOptional({ example: true, description: 'Écraser la configuration existante' })
  @IsOptional()
  @IsBoolean()
  overwriteExisting?: boolean;
}

export class CreateSemanticKpiDto {
  @ApiProperty({ example: 'Chiffre d’affaires', description: 'Nom du KPI' })
  @IsString()
  @IsNotEmpty({ message: 'Le nom du KPI est requis' })
  name!: string;

  @ApiProperty({ example: 'SUM(montant_total)', description: 'Formule SQL d’agrégation' })
  @IsString()
  @IsNotEmpty({ message: 'La formule SQL est requise' })
  sqlFormula!: string;

  @ApiPropertyOptional({ example: 'Total des ventes hors taxes', description: 'Description fonctionnelle' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'currency', description: 'Formatage (currency, number, percent, integer)' })
  @IsOptional()
  @IsString()
  formatting?: string;
}

export class CreateSemanticSynonymDto {
  @ApiProperty({ example: ‘ca’, description: ‘Terme ou acronyme métier’ })
  @IsString()
  @IsNotEmpty({ message: ‘Le terme est requis’ })
  term!: string;

  @ApiProperty({ example: ‘Chiffre d’affaires’, description: ‘Valeur ou KPI mappé’ })
  @IsString()
  @IsNotEmpty({ message: ‘La valeur mappée est requise’ })
  mappedValue!: string;
}

export class McpEnrichRequestDto {
  @ApiPropertyOptional({
    example: ‘sales_distribution’,
    enum: [
      ‘sales_distribution’, ‘finance_accounting’, ‘human_resources’,
      ‘logistics_supply_chain’, ‘manufacturing_production’, ‘marketing_crm’,
      ‘healthcare’, ‘education_training’, ‘banking_insurance’, ‘real_estate_construction’
    ],
    description: ‘Secteur métier pour le contexte sémantique’
  })
  @IsOptional()
  @IsEnum([
    ‘sales_distribution’, ‘finance_accounting’, ‘human_resources’,
    ‘logistics_supply_chain’, ‘manufacturing_production’, ‘marketing_crm’,
    ‘healthcare’, ‘education_training’, ‘banking_insurance’, ‘real_estate_construction’
  ])
  businessSector?: SemanticBusinessSector;

  @ApiPropertyOptional({ example: ‘fr’, enum: [‘en’, ‘fr’, ‘ar’], description: ‘Langue de sortie’ })
  @IsOptional()
  @IsEnum([‘en’, ‘fr’, ‘ar’])
  language?: ‘fr’ | ‘en’ | ‘ar’;

  @ApiPropertyOptional({ description: ‘Colonnes de la proposition courante’ })
  @IsOptional()
  @IsArray()
  columns?: SemanticColumnProposal[];

  @ApiPropertyOptional({ description: ‘KPIs de la proposition courante’ })
  @IsOptional()
  @IsArray()
  kpis?: SemanticKpiProposal[];

  @ApiPropertyOptional({ description: ‘Synonymes de la proposition courante’ })
  @IsOptional()
  @IsArray()
  synonyms?: SemanticSynonymProposal[];

  @ApiPropertyOptional({ example: ‘auto’, enum: [‘auto’, ‘groq’, ‘ollama’, ‘openrouter’], description: ‘Fournisseur LLM’ })
  @IsOptional()
  @IsEnum([‘auto’, ‘groq’, ‘ollama’, ‘openrouter’])
  provider?: ‘auto’ | ‘groq’ | ‘ollama’ | ‘openrouter’;
}
