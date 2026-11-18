import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  SemanticColumn,
  SemanticColumnLike,
  SemanticLayerResponse,
  SemanticTable
} from '../semantic-layer/semantic.types';

export interface SqlValidationResult {
  ok: boolean;
  reason?: string;
  referencedTables: string[];
  referencedColumns: string[];
  warnings: string[];
}

export interface SemanticSelectAst {
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

export interface SqlQueryPlanReference {
  table: {
    technicalName: string;
  };
  metricAlias: string;
  dimensionColumn?: {
    technicalName: string;
    businessName?: string;
  };
  selectedColumns?: Array<{
    technicalName: string;
    businessName?: string;
  }>;
}

@Injectable()
export class SqlSecurityGuardService {
  failedValidation(reason: string): SqlValidationResult {
    return {
      ok: false,
      reason,
      referencedTables: [],
      referencedColumns: [],
      warnings: [reason]
    };
  }

  isSafeSemanticSelect(
    sql: string,
    layer: SemanticLayerResponse,
    plan?: SqlQueryPlanReference
  ): boolean {
    return this.validateSemanticSql(sql, layer, plan).ok;
  }

  validateSemanticSql(
    sql: string,
    layer: SemanticLayerResponse,
    plan?: SqlQueryPlanReference
  ): SqlValidationResult {
    const warnings: string[] = [];
    const ast = this.parseSemanticSelect(sql);
    const fail = (reason: string): SqlValidationResult => ({
      ok: false,
      reason,
      referencedTables: [],
      referencedColumns: [],
      warnings
    });

    if (!ast.normalized) return fail('SQL is empty.');
    if (!ast.normalized.startsWith('select')) return fail('Only SELECT statements are allowed.');
    if (ast.hasComments) return fail('SQL comments are not allowed.');
    if (ast.hasMultipleStatements) return fail('Multiple SQL statements are not allowed.');
    if (ast.blockedKeyword) return fail(`SQL contains blocked keyword ${ast.blockedKeyword}.`);
    if (ast.hasSubquery) return fail('Subqueries are not allowed in generated analytics SQL.');
    if (ast.hasSelectStar) return fail('SELECT * is not allowed; generated SQL must list explicit semantic columns.');

    const referencedTables = ast.referencedTables;
    if (!referencedTables.length) return fail('SQL must reference one semantic table.');

    const allowedTables = new Set<string>();
    for (const table of layer.tables) {
      allowedTables.add(this.normalizeSqlReference(table.technicalName));
      allowedTables.add(this.normalizeSqlReference(this.unqualifyName(table.technicalName)));
    }

    const unknownTable = referencedTables.find((table) => !allowedTables.has(this.normalizeSqlReference(table)));
    if (unknownTable) return fail(`SQL references unknown table ${unknownTable}.`);

    const allowedIdentifiers = new Set<string>([
      ...layer.tables.flatMap((table) => table.technicalName.split('.')),
      ...layer.tables.map((table) => table.technicalName),
      ...layer.kpis.map((kpi) => this.toSqlAlias(kpi.name)),
      'record_count',
      'semantic_answer'
    ]);
    for (const table of layer.tables) {
      allowedIdentifiers.add(this.unqualifyName(table.technicalName));
      allowedIdentifiers.add(this.toSqlAlias(table.businessName));
      for (const column of table.columns) allowedIdentifiers.add(column.technicalName);
      for (const column of table.columns) allowedIdentifiers.add(this.toSqlAlias(column.businessName));
    }
    if (plan) {
      allowedIdentifiers.add(plan.metricAlias);
      if (plan.dimensionColumn) {
        allowedIdentifiers.add(this.toSqlAlias(plan.dimensionColumn.businessName || plan.dimensionColumn.technicalName));
      }
      for (const column of plan.selectedColumns || []) {
        allowedIdentifiers.add(this.toSqlAlias(column.businessName || column.technicalName));
      }
    }
    for (const alias of this.extractSqlAliases(sql)) allowedIdentifiers.add(this.toSqlAlias(alias));

    const sqlIdentifiers = ast.identifiers.filter(
      (identifier) =>
        ![
          'select',
          'from',
          'as',
          'sum',
          'avg',
          'count',
          'distinct',
          'min',
          'max',
          'case',
          'when',
          'then',
          'else',
          'end',
          'nullif',
          'coalesce',
          'round',
          'cast',
          'numeric',
          'integer',
          'decimal',
          'float',
          'group',
          'by',
          'order',
          'desc',
          'asc',
          'where',
          'ilike',
          'and',
          'or',
          'not',
          'is',
          'null',
          'having',
          'join',
          'on',
          'limit',
          'date_trunc',
          'month',
          'period'
        ].includes(identifier.toLowerCase())
    );

    const unknownIdentifier = sqlIdentifiers.find(
      (identifier) => !allowedIdentifiers.has(identifier) && !identifier.startsWith('askme_')
    );
    if (unknownIdentifier) return fail(`SQL references unknown column / identifier ${unknownIdentifier}.`);

    const allowedFunctions = new Set([
      'sum',
      'avg',
      'count',
      'min',
      'max',
      'date_trunc',
      'nullif',
      'coalesce',
      'round',
      'cast'
    ]);
    const unknownFunction = ast.functions.find((name) => !allowedFunctions.has(name));
    if (unknownFunction) return fail(`SQL uses unsupported function ${unknownFunction}.`);

    if (!ast.limit) return fail('SQL must include LIMIT.');
    const limit = ast.limit;
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) return fail('SQL LIMIT must be between 1 and 500.');

    const allColumns = layer.tables.flatMap((table) => table.columns.map((column) => column.technicalName));
    const referencedColumns = Array.from(new Set(sqlIdentifiers.filter((identifier) => allColumns.includes(identifier))));
    if (plan && !referencedTables.some((table) => this.normalizeSqlReference(table) === this.normalizeSqlReference(plan.table.technicalName))) {
      warnings.push(`Validated SQL table differs from the planned table ${plan.table.technicalName}.`);
    }

    return {
      ok: true,
      referencedTables,
      referencedColumns,
      warnings
    };
  }

  parseSemanticSelect(sql: string): SemanticSelectAst {
    const normalized = sql.trim().toLowerCase();
    const blockedKeyword = sql.match(/\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|copy|call|execute)\b/i)?.[1];
    const limitMatch = sql.match(/\blimit\s+(\d+)\b/i);

    return {
      normalized,
      identifiers: this.extractSqlIdentifiers(sql),
      functions: Array.from(sql.matchAll(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g)).map((match) => match[1].toLowerCase()),
      referencedTables: this.extractReferencedSqlTables(sql),
      limit: limitMatch ? Number(limitMatch[1]) : undefined,
      hasComments: /--|\/\*/.test(sql),
      hasMultipleStatements: /;\s*\S/.test(sql),
      hasSubquery: /\(\s*select\b/i.test(sql),
      hasSelectStar: /\bselect\s+\*/i.test(sql) || /,\s*\*/.test(sql),
      blockedKeyword
    };
  }

  extractReferencedSqlTables(sql: string): string[] {
    return Array.from(
      sql.matchAll(/\b(?:from|join)\s+((?:"[^"]+"|[a-zA-Z_][a-zA-Z0-9_]*)(?:\s*\.\s*(?:"[^"]+"|[a-zA-Z_][a-zA-Z0-9_]*))?)/gi)
    ).map((match) => this.normalizeSqlReference(match[1]));
  }

  extractSqlAliases(sql: string): string[] {
    return Array.from(sql.matchAll(/\bas\s+(?:"([^"]+)"|([a-zA-Z_][a-zA-Z0-9_]*))/gi))
      .map((match) => match[1] || match[2] || '')
      .filter(Boolean);
  }

  normalizeSqlReference(value: string): string {
    return value
      .replace(/"/g, '')
      .replace(/\s*\.\s*/g, '.')
      .trim();
  }

  ensureSemanticSqlLimit(sql: string): string {
    const trimmed = sql.trim();
    if (!trimmed) return '';
    if (/\blimit\s+\d+\b/i.test(trimmed)) return trimmed;
    const withoutTrailingSemicolon = trimmed.replace(/;\s*$/g, '');
    if (!withoutTrailingSemicolon.toLowerCase().startsWith('select')) return trimmed;
    return `${withoutTrailingSemicolon} LIMIT 100;`;
  }

  quoteQualifiedSqlName(value: string): string {
    return value
      .split('.')
      .map((part) => this.quoteSqlIdentifier(part))
      .join('.');
  }

  quoteSqlIdentifier(value: string): string {
    return `"${value.replace(/"/g, '""')}"`;
  }

  assertSafeDatasourceSchema(schema: string): void {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) {
      throw new BadRequestException('Invalid PostgreSQL schema name.');
    }
  }

  quoteSqlStringLiteral(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
  }

  toSqlAlias(value: string): string {
    const normalized = this.normalizeSearchText(this.toBusinessName(value))
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();
    return normalized || 'semantic_value';
  }

  extractSqlIdentifiers(sql: string): string[] {
    const withoutStrings = sql.replace(/'[^']*'/g, ' ');
    return Array.from(withoutStrings.matchAll(/"?([a-zA-Z_][a-zA-Z0-9_]*)"?/g)).map((match) => match[1]);
  }

  private unqualifyName(name: string): string {
    const parts = name.split('.');
    return parts[parts.length - 1];
  }

  private toBusinessName(name: string): string {
    return name
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  private normalizeSearchText(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[_-]+/g, ' ')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
