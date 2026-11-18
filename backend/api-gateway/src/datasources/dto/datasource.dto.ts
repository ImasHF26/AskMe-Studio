import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';
import type { DatasourceType } from '../datasource-manager.service';

export class CreateDatasourceDto {
  @ApiProperty({ example: 'Postgres Production DW', description: 'Nom lisible de la source de données' })
  @IsString()
  @IsNotEmpty({ message: 'Le nom de la source est obligatoire' })
  name!: string;

  @ApiProperty({
    example: 'postgresql',
    enum: ['postgresql', 'mongodb', 'csv', 'excel'],
    description: 'Type de source supportée'
  })
  @IsEnum(['postgresql', 'mongodb', 'csv', 'excel'], {
    message: 'Type non supporté (postgresql, mongodb, csv, excel)'
  })
  type!: DatasourceType;

  @ApiPropertyOptional({
    example: { username: 'postgres', password: 'secretpassword' },
    description: 'Identifiants d’accès chiffrés en base de données'
  })
  @IsOptional()
  @IsObject()
  credentials?: Record<string, unknown>;

  @ApiPropertyOptional({
    example: { host: 'localhost', port: 5432, database: 'sales_dw', schema: 'public' },
    description: 'Configuration réseau et connexion'
  })
  @IsOptional()
  @IsObject()
  connectionConfig?: Record<string, unknown>;
}

export class UpdateDatasourceDto {
  @ApiPropertyOptional({ example: 'Postgres Production DW (Updated)', description: 'Nouveau nom lisible' })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Le nom ne peut pas être vide s’il est fourni' })
  name?: string;

  @ApiPropertyOptional({
    example: 'postgresql',
    enum: ['postgresql', 'mongodb', 'csv', 'excel'],
    description: 'Type de source'
  })
  @IsOptional()
  @IsEnum(['postgresql', 'mongodb', 'csv', 'excel'])
  type?: DatasourceType;

  @ApiPropertyOptional({
    example: { username: 'postgres', password: 'newsecretpassword' },
    description: 'Nouveaux identifiants (si modifiés)'
  })
  @IsOptional()
  @IsObject()
  credentials?: Record<string, unknown>;

  @ApiPropertyOptional({
    example: { host: 'localhost', port: 5432, database: 'sales_dw', schema: 'analytics' },
    description: 'Nouvelle configuration réseau et schéma'
  })
  @IsOptional()
  @IsObject()
  connectionConfig?: Record<string, unknown>;
}
