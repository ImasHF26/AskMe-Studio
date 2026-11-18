import { apiClient } from '../api/client';

export type ExplorerSemanticType = 'measure' | 'dimension' | 'date' | 'identifier';
export type ExplorerTableType = 'fact' | 'dimension' | 'view' | 'table';

export interface ExplorerColumn {
  name: string;
  type: string;
  dataType?: string;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  nullable: boolean;
  semanticType?: ExplorerSemanticType;
  references?: {
    table: string;
    column: string;
  };
}

export interface ExplorerTable {
  name: string;
  schema?: string;
  type: ExplorerTableType;
  rowCount?: number;
  columns: ExplorerColumn[];
}

export interface ExplorerRelationship {
  id: string;
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  type?: string;
}

export interface ExplorerSchemaResponse {
  tables: ExplorerTable[];
  relationships: ExplorerRelationship[];
}

export interface ExplorerPreviewResponse {
  columns: string[];
  rows: Array<Record<string, unknown>>;
  metadata: {
    rowCount?: number;
    previewLimit: number;
  };
}

interface LegacyColumn {
  name: string;
  type?: string;
  dataType?: string;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  nullable?: boolean;
  isNullable?: boolean;
  semanticType?: ExplorerSemanticType;
  references?: {
    table: string;
    column: string;
  };
}

interface LegacyStats {
  rowCount?: number;
  columnCount?: number;
  summary?: string;
}

interface LegacyTable {
  name?: string;
  schema?: string;
  tableName?: string;
  type?: ExplorerTableType;
}

const normalizeType = (value?: string, columnName?: string) => {
  const lowerVal = String(value || '').toLowerCase();
  const lowerName = String(columnName || '').toLowerCase();

  // Détection des mesures par nom métier explicite
  const isMeasureName = /(montant|amount|total|prix|price|cout|cost|marge|margin|qte|quantite|quantity|ca|revenue|solde|balance|taux|rate|score|remise|discount|tva|tax|valeur|value|duree|duration|poids|weight|volume)/i.test(lowerName);
  if (isMeasureName) return 'measure';

  // Détection par type de données SQL
  if (
    lowerVal.includes('int') ||
    lowerVal.includes('numeric') ||
    lowerVal.includes('decimal') ||
    lowerVal.includes('double') ||
    lowerVal.includes('float') ||
    lowerVal.includes('real') ||
    lowerVal.includes('money') ||
    lowerVal.includes('number')
  ) {
    return 'measure';
  }

  if (lowerVal.includes('date') || lowerVal.includes('time') || lowerVal.includes('timestamp')) return 'date';
  return 'dimension';
};

const detectTableType = (name: string, columns: ExplorerColumn[], rowCount?: number): ExplorerTableType => {
  const lower = name.split('.').pop()!.toLowerCase();

  // 1. Détection formelle par préfixe ou convention de nommage BI / Data Warehouse
  const isFactPrefix = /^(fact_|f_|ft_|fait_|faits_)/i.test(lower) || /(_fact|_facts|_f)$/i.test(lower);
  const isFactWord = /(transaction|sales|vente|ventes|order|orders|commande|commandes|facture|factures|invoice|invoices|achat|achats|purchase|purchases|paiement|paiements|payment|payments|livraison|livraisons|shipment|shipments|ligne_|lignes_|line_item|order_detail|activity|event|operations|mouvements)/i.test(lower);

  if (isFactPrefix || isFactWord) {
    return 'fact';
  }

  const isDimPrefix = /^(dim_|d_)/i.test(lower) || /(_dim|_dimension)$/i.test(lower);
  const isDimWord = /(customer|client|product|produit|category|categorie|temps|date|time|magasin|store|employe|employee|promotion|geographie|geography|fournisseur|supplier|region|pays|country|ville|city)/i.test(lower);

  if (isDimPrefix || isDimWord) {
    return 'dimension';
  }

  // 2. Détection par structure en étoile : concentration de clés étrangères multiples + mesures
  const fkCount = columns.filter((col) => col.isForeignKey).length;
  const measureCount = columns.filter((col) => col.semanticType === 'measure').length;

  if (fkCount >= 2 && measureCount >= 1) {
    return 'fact';
  }

  if (measureCount >= 2 || (rowCount || 0) > 1000) {
    return 'fact';
  }

  return 'table';
};

const normalizeColumn = (column: LegacyColumn): ExplorerColumn => {
  const dataType = column.dataType || column.type || 'unknown';
  const lowerName = column.name.toLowerCase();
  const primaryKey = Boolean(column.isPrimaryKey || lowerName === 'id' || lowerName.endsWith('_id') && lowerName.split('_').length === 1);
  const foreignKey = Boolean(
    column.isForeignKey ||
      column.references ||
      (!primaryKey && /(^id_|_id$|_key$|id$|key$|^sk_)/i.test(lowerName))
  );

  let semanticType = column.semanticType;
  if (!semanticType) {
    if (primaryKey) {
      semanticType = 'identifier';
    } else if (foreignKey) {
      semanticType = 'dimension';
    } else {
      semanticType = normalizeType(dataType, column.name);
    }
  }

  return {
    name: column.name,
    type: dataType,
    dataType,
    isPrimaryKey: primaryKey,
    isForeignKey: foreignKey,
    nullable: column.nullable ?? column.isNullable ?? true,
    semanticType,
    references: column.references
  };
};

const tableKey = (name: string) =>
  name
    .split('.')
    .pop()!
    .toLowerCase()
    .replace(/^(app_|fact_|dim_)/, '')
    .replace(/_/g, ' ')
    .replace(/\b(data|lookup|ref)\b/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/_?(table|master|dimension|dim)$/, '')
    .replace(/ies$/, 'y')
    .replace(/s$/, '');

const relationshipCandidates = (columnName: string) => {
  const base = columnName
    .toLowerCase()
    .replace(/_id$/, '')
    .replace(/_key$/, '')
    .replace(/id$/, '')
    .replace(/key$/, '')
    .replace(/^id_/, '')
    .replace(/^key_/, '')
    .replace(/_/g, ' ')
    .trim()
    .replace(/\s+/g, '_');

  return new Set([
    base,
    base.replace(/ies$/, 'y').replace(/s$/, ''),
    `app_${base}`,
    `dim_${base}`,
    `d_${base}`,
    `${base}s`,
    `${base.replace(/y$/, 'ie')}s`,
    `${base}_dim`,
    `${base}_dimension`
  ]);
};

const inferRelationships = (tables: ExplorerTable[]): ExplorerRelationship[] => {
  const relationships: ExplorerRelationship[] = [];
  const seen = new Set<string>();

  const addRelationship = (relationship: ExplorerRelationship) => {
    if (seen.has(relationship.id)) return;
    seen.add(relationship.id);
    relationships.push(relationship);
  };

  for (const table of tables) {
    for (const column of table.columns) {
      if (!column.isForeignKey) continue;

      if (column.references?.table) {
        const target = tables.find(
          (item) => item.name === column.references?.table || tableKey(item.name) === tableKey(column.references?.table || '')
        );
        if (target && target.name !== table.name) {
          addRelationship({
            id: `${table.name}.${column.name}->${target.name}.${column.references.column}`,
            fromTable: table.name,
            fromColumn: column.name,
            toTable: target.name,
            toColumn: column.references.column,
            type: 'foreign-key'
          });
          continue;
        }
      }

      const candidates = relationshipCandidates(column.name);
      if (!candidates.size) continue;

      const target = tables.find((item) => {
        const itemName = item.name.toLowerCase();
        const itemBase = tableKey(item.name);
        return candidates.has(itemBase) || candidates.has(itemName) || candidates.has(itemName.split('.').pop() || '');
      });
      if (!target || target.name === table.name) continue;

      const targetColumn =
        target.columns.find((item) => item.isPrimaryKey) ||
        target.columns.find((item) => item.name.toLowerCase() === 'id') ||
        target.columns.find((item) => item.name.toLowerCase().endsWith('_id')) ||
        target.columns[0];
      addRelationship({
        id: `${table.name}.${column.name}->${target.name}.${targetColumn?.name || 'id'}`,
        fromTable: table.name,
        fromColumn: column.name,
        toTable: target.name,
        toColumn: targetColumn?.name || 'id',
        type: 'many-to-one'
      });
    }
  }

  return relationships;
};

const normalizeTableRef = (table: string | LegacyTable) => {
  if (typeof table === 'string') {
    return {
      name: table,
      schema: table.includes('.') ? table.split('.')[0] : undefined,
      tableName: table.includes('.') ? table.split('.').slice(1).join('.') : table
    };
  }

  const rawName = table.name || table.tableName || '';
  const schema = table.schema || (rawName.includes('.') ? rawName.split('.')[0] : undefined);
  const tableName = table.tableName || (rawName.includes('.') ? rawName.split('.').slice(1).join('.') : rawName);
  const qualifiedName = schema && !rawName.includes('.') ? `${schema}.${tableName}` : rawName;

  return {
    name: qualifiedName,
    schema,
    tableName,
    type: table.type
  };
};

const normalizeSchema = (schema: ExplorerSchemaResponse): ExplorerSchemaResponse => {
  const tables = (schema.tables || []).map((table) => {
    const columns = (table.columns || []).map(normalizeColumn);
    const name = table.schema && !table.name.includes('.') ? `${table.schema}.${table.name}` : table.name;
    return {
      ...table,
      name,
      type: table.type || detectTableType(name, columns, table.rowCount),
      columns
    };
  });

  const relationships = schema.relationships?.length ? schema.relationships : inferRelationships(tables);

  // Deuxième passe d'inférence en étoile (Star Schema) :
  // Une table de fait concentre les clés étrangères vers des dimensions distinctes.
  const outgoingDistinctTargets = new Map<string, Set<string>>();
  for (const rel of relationships) {
    if (!outgoingDistinctTargets.has(rel.fromTable)) {
      outgoingDistinctTargets.set(rel.fromTable, new Set());
    }
    outgoingDistinctTargets.get(rel.fromTable)!.add(rel.toTable);
  }

  for (const table of tables) {
    const isExplicitDim = /^(dim_|d_)/i.test(table.name.split('.').pop() || '');
    if (!isExplicitDim) {
      const distinctTargets = outgoingDistinctTargets.get(table.name)?.size || 0;
      // Si la table pointe vers 2 dimensions différentes ou plus, c'est une table de faits
      if (distinctTargets >= 2) {
        table.type = 'fact';
      }
    }
  }

  // Troisième passe de sécurité : si toujours 0 table de fait détectée dans le schéma,
  // identifier la table ayant le plus de relations et de mesures pour être le Hub de fait.
  const hasFact = tables.some((table) => table.type === 'fact');
  if (!hasFact && tables.length > 0) {
    const scored = [...tables].sort((a, b) => {
      const aRels = outgoingDistinctTargets.get(a.name)?.size || 0;
      const bRels = outgoingDistinctTargets.get(b.name)?.size || 0;
      const aMeasures = a.columns.filter((c) => c.semanticType === 'measure').length;
      const bMeasures = b.columns.filter((c) => c.semanticType === 'measure').length;
      return (bRels * 3 + bMeasures) - (aRels * 3 + aMeasures);
    });
    if (scored[0] && !/^(dim_|d_)/i.test(scored[0].name.split('.').pop() || '')) {
      scored[0].type = 'fact';
    }
  }

  return {
    tables,
    relationships
  };
};

export const mockExplorerSchema: ExplorerSchemaResponse = normalizeSchema({
  tables: [
    {
      name: 'f_ventes',
      schema: 'dw',
      type: 'fact',
      rowCount: 24,
      columns: [
        { name: 'sk_vente', type: 'integer', isPrimaryKey: true, isForeignKey: false, nullable: false, semanticType: 'identifier' },
        { name: 'sk_temps', type: 'integer', isPrimaryKey: false, isForeignKey: true, nullable: false, semanticType: 'dimension' },
        { name: 'sk_produit', type: 'integer', isPrimaryKey: false, isForeignKey: true, nullable: false, semanticType: 'dimension' },
        { name: 'sk_client', type: 'integer', isPrimaryKey: false, isForeignKey: true, nullable: false, semanticType: 'dimension' },
        { name: 'sk_geographie', type: 'integer', isPrimaryKey: false, isForeignKey: true, nullable: false, semanticType: 'dimension' },
        { name: 'sk_magasin', type: 'integer', isPrimaryKey: false, isForeignKey: true, nullable: false, semanticType: 'dimension' },
        { name: 'sk_employe', type: 'integer', isPrimaryKey: false, isForeignKey: true, nullable: false, semanticType: 'dimension' },
        { name: 'sk_promotion', type: 'integer', isPrimaryKey: false, isForeignKey: true, nullable: false, semanticType: 'dimension' },
        { name: 'sk_moyen_paiement', type: 'integer', isPrimaryKey: false, isForeignKey: true, nullable: false, semanticType: 'dimension' },
        { name: 'quantite', type: 'integer', isPrimaryKey: false, isForeignKey: false, nullable: false, semanticType: 'measure' },
        { name: 'prix_unitaire_vendu', type: 'numeric', isPrimaryKey: false, isForeignKey: false, nullable: false, semanticType: 'measure' },
        { name: 'montant_total', type: 'numeric', isPrimaryKey: false, isForeignKey: false, nullable: false, semanticType: 'measure' },
        { name: 'montant_remise', type: 'numeric', isPrimaryKey: false, isForeignKey: false, nullable: false, semanticType: 'measure' },
        { name: 'cout_achat_total', type: 'numeric', isPrimaryKey: false, isForeignKey: false, nullable: false, semanticType: 'measure' },
        { name: 'marge_brute', type: 'numeric', isPrimaryKey: false, isForeignKey: false, nullable: false, semanticType: 'measure' }
      ]
    },
    {
      name: 'dim_temps',
      schema: 'dw',
      type: 'dimension',
      rowCount: 14,
      columns: [
        { name: 'sk_temps', type: 'integer', isPrimaryKey: true, isForeignKey: false, nullable: false, semanticType: 'identifier' },
        { name: 'date_complete', type: 'date', isPrimaryKey: false, isForeignKey: false, nullable: false, semanticType: 'date' },
        { name: 'jour', type: 'integer', isPrimaryKey: false, isForeignKey: false, nullable: false, semanticType: 'dimension' },
        { name: 'mois', type: 'integer', isPrimaryKey: false, isForeignKey: false, nullable: false, semanticType: 'dimension' },
        { name: 'nom_mois', type: 'varchar', isPrimaryKey: false, isForeignKey: false, nullable: false, semanticType: 'dimension' },
        { name: 'trimestre', type: 'integer', isPrimaryKey: false, isForeignKey: false, nullable: false, semanticType: 'dimension' },
        { name: 'annee', type: 'integer', isPrimaryKey: false, isForeignKey: false, nullable: false, semanticType: 'dimension' },
        { name: 'jour_semaine', type: 'varchar', isPrimaryKey: false, isForeignKey: false, nullable: false, semanticType: 'dimension' },
        { name: 'est_weekend', type: 'boolean', isPrimaryKey: false, isForeignKey: false, nullable: false, semanticType: 'dimension' },
        { name: 'est_ferie', type: 'boolean', isPrimaryKey: false, isForeignKey: false, nullable: false, semanticType: 'dimension' }
      ]
    },
    {
      name: 'dim_produit',
      schema: 'dw',
      type: 'dimension',
      rowCount: 15,
      columns: [
        { name: 'sk_produit', type: 'integer', isPrimaryKey: true, isForeignKey: false, nullable: false, semanticType: 'identifier' },
        { name: 'nom_produit', type: 'varchar', isPrimaryKey: false, isForeignKey: false, nullable: false, semanticType: 'dimension' },
        { name: 'categorie', type: 'varchar', isPrimaryKey: false, isForeignKey: false, nullable: false, semanticType: 'dimension' },
        { name: 'sous_categorie', type: 'varchar', isPrimaryKey: false, isForeignKey: false, nullable: false, semanticType: 'dimension' },
        { name: 'marque', type: 'varchar', isPrimaryKey: false, isForeignKey: false, nullable: false, semanticType: 'dimension' },
        { name: 'cout_unitaire', type: 'numeric', isPrimaryKey: false, isForeignKey: false, nullable: false, semanticType: 'measure' },
        { name: 'prix_unitaire', type: 'numeric', isPrimaryKey: false, isForeignKey: false, nullable: false, semanticType: 'measure' },
        { name: 'fournisseur', type: 'varchar', isPrimaryKey: false, isForeignKey: false, nullable: false, semanticType: 'dimension' }
      ]
    },
    {
      name: 'dim_client',
      schema: 'dw',
      type: 'dimension',
      rowCount: 10,
      columns: [
        { name: 'sk_client', type: 'integer', isPrimaryKey: true, isForeignKey: false, nullable: false, semanticType: 'identifier' },
        { name: 'nom_client', type: 'varchar', isPrimaryKey: false, isForeignKey: false, nullable: false, semanticType: 'dimension' },
        { name: 'prenom_client', type: 'varchar', isPrimaryKey: false, isForeignKey: false, nullable: false, semanticType: 'dimension' },
        { name: 'genre', type: 'varchar', isPrimaryKey: false, isForeignKey: false, nullable: true, semanticType: 'dimension' },
        { name: 'tranche_age', type: 'varchar', isPrimaryKey: false, isForeignKey: false, nullable: true, semanticType: 'dimension' },
        { name: 'segment_client', type: 'varchar', isPrimaryKey: false, isForeignKey: false, nullable: true, semanticType: 'dimension' },
        { name: 'membre_fidelite', type: 'boolean', isPrimaryKey: false, isForeignKey: false, nullable: false, semanticType: 'dimension' }
      ]
    },
    {
      name: 'dim_geographie',
      schema: 'dw',
      type: 'dimension',
      rowCount: 8,
      columns: [
        { name: 'sk_geographie', type: 'integer', isPrimaryKey: true, isForeignKey: false, nullable: false, semanticType: 'identifier' },
        { name: 'ville', type: 'varchar', isPrimaryKey: false, isForeignKey: false, nullable: false, semanticType: 'dimension' },
        { name: 'region', type: 'varchar', isPrimaryKey: false, isForeignKey: false, nullable: false, semanticType: 'dimension' },
        { name: 'pays', type: 'varchar', isPrimaryKey: false, isForeignKey: false, nullable: false, semanticType: 'dimension' }
      ]
    },
    {
      name: 'dim_magasin',
      schema: 'dw',
      type: 'dimension',
      rowCount: 6,
      columns: [
        { name: 'sk_magasin', type: 'integer', isPrimaryKey: true, isForeignKey: false, nullable: false, semanticType: 'identifier' },
        { name: 'nom_magasin', type: 'varchar', isPrimaryKey: false, isForeignKey: false, nullable: false, semanticType: 'dimension' },
        { name: 'sk_geographie', type: 'integer', isPrimaryKey: false, isForeignKey: true, nullable: true, semanticType: 'dimension' },
        { name: 'type_magasin', type: 'varchar', isPrimaryKey: false, isForeignKey: false, nullable: false, semanticType: 'dimension' },
        { name: 'surface_m2', type: 'integer', isPrimaryKey: false, isForeignKey: false, nullable: true, semanticType: 'measure' }
      ]
    },
    {
      name: 'dim_employe',
      schema: 'dw',
      type: 'dimension',
      rowCount: 6,
      columns: [
        { name: 'sk_employe', type: 'integer', isPrimaryKey: true, isForeignKey: false, nullable: false, semanticType: 'identifier' },
        { name: 'nom_employe', type: 'varchar', isPrimaryKey: false, isForeignKey: false, nullable: false, semanticType: 'dimension' },
        { name: 'departement', type: 'varchar', isPrimaryKey: false, isForeignKey: false, nullable: false, semanticType: 'dimension' },
        { name: 'annee_embauche', type: 'integer', isPrimaryKey: false, isForeignKey: false, nullable: false, semanticType: 'dimension' },
        { name: 'fonction', type: 'varchar', isPrimaryKey: false, isForeignKey: false, nullable: false, semanticType: 'dimension' }
      ]
    },
    {
      name: 'dim_promotion',
      schema: 'dw',
      type: 'dimension',
      rowCount: 6,
      columns: [
        { name: 'sk_promotion', type: 'integer', isPrimaryKey: true, isForeignKey: false, nullable: false, semanticType: 'identifier' },
        { name: 'nom_promotion', type: 'varchar', isPrimaryKey: false, isForeignKey: false, nullable: false, semanticType: 'dimension' },
        { name: 'taux_remise', type: 'numeric', isPrimaryKey: false, isForeignKey: false, nullable: false, semanticType: 'measure' },
        { name: 'type_promotion', type: 'varchar', isPrimaryKey: false, isForeignKey: false, nullable: false, semanticType: 'dimension' }
      ]
    },
    {
      name: 'dim_moyen_paiement',
      schema: 'dw',
      type: 'dimension',
      rowCount: 4,
      columns: [
        { name: 'sk_moyen_paiement', type: 'integer', isPrimaryKey: true, isForeignKey: false, nullable: false, semanticType: 'identifier' },
        { name: 'moyen_paiement', type: 'varchar', isPrimaryKey: false, isForeignKey: false, nullable: false, semanticType: 'dimension' }
      ]
    }
  ],
  relationships: [
    { id: 'dw.f_ventes.sk_temps->dw.dim_temps.sk_temps', fromTable: 'dw.f_ventes', fromColumn: 'sk_temps', toTable: 'dw.dim_temps', toColumn: 'sk_temps', type: 'foreign-key' },
    { id: 'dw.f_ventes.sk_produit->dw.dim_produit.sk_produit', fromTable: 'dw.f_ventes', fromColumn: 'sk_produit', toTable: 'dw.dim_produit', toColumn: 'sk_produit', type: 'foreign-key' },
    { id: 'dw.f_ventes.sk_client->dw.dim_client.sk_client', fromTable: 'dw.f_ventes', fromColumn: 'sk_client', toTable: 'dw.dim_client', toColumn: 'sk_client', type: 'foreign-key' },
    { id: 'dw.f_ventes.sk_geographie->dw.dim_geographie.sk_geographie', fromTable: 'dw.f_ventes', fromColumn: 'sk_geographie', toTable: 'dw.dim_geographie', toColumn: 'sk_geographie', type: 'foreign-key' },
    { id: 'dw.f_ventes.sk_magasin->dw.dim_magasin.sk_magasin', fromTable: 'dw.f_ventes', fromColumn: 'sk_magasin', toTable: 'dw.dim_magasin', toColumn: 'sk_magasin', type: 'foreign-key' },
    { id: 'dw.f_ventes.sk_employe->dw.dim_employe.sk_employe', fromTable: 'dw.f_ventes', fromColumn: 'sk_employe', toTable: 'dw.dim_employe', toColumn: 'sk_employe', type: 'foreign-key' },
    { id: 'dw.f_ventes.sk_promotion->dw.dim_promotion.sk_promotion', fromTable: 'dw.f_ventes', fromColumn: 'sk_promotion', toTable: 'dw.dim_promotion', toColumn: 'sk_promotion', type: 'foreign-key' },
    { id: 'dw.f_ventes.sk_moyen_paiement->dw.dim_moyen_paiement.sk_moyen_paiement', fromTable: 'dw.f_ventes', fromColumn: 'sk_moyen_paiement', toTable: 'dw.dim_moyen_paiement', toColumn: 'sk_moyen_paiement', type: 'foreign-key' },
    { id: 'dw.dim_magasin.sk_geographie->dw.dim_geographie.sk_geographie', fromTable: 'dw.dim_magasin', fromColumn: 'sk_geographie', toTable: 'dw.dim_geographie', toColumn: 'sk_geographie', type: 'foreign-key' }
  ]
});

export const datasetExplorerService = {
  async fetchSchema(datasourceId: string): Promise<ExplorerSchemaResponse> {
    const semanticTableTypes = new Map<string, ExplorerTableType>();
    try {
      const semanticRes = await apiClient.get<{ tables?: Array<{ technicalName?: string; tableType?: string }> }>(
        `/semantic/${datasourceId}`
      );
      if (Array.isArray(semanticRes.data?.tables)) {
        for (const tbl of semanticRes.data.tables) {
          if (tbl.technicalName && tbl.tableType) {
            semanticTableTypes.set(tbl.technicalName.toLowerCase(), tbl.tableType as ExplorerTableType);
            const shortName = tbl.technicalName.split('.').pop()?.toLowerCase();
            if (shortName) {
              semanticTableTypes.set(shortName, tbl.tableType as ExplorerTableType);
            }
          }
        }
      }
    } catch {
      // Couche sémantique non encore générée, détection heuristique standard
    }

    const applySemanticOverrides = (schemaResult: ExplorerSchemaResponse) => {
      for (const table of schemaResult.tables) {
        const short = table.name.split('.').pop()?.toLowerCase() || '';
        const override = semanticTableTypes.get(table.name.toLowerCase()) || semanticTableTypes.get(short);
        if (override) {
          table.type = override;
        }
      }
      return schemaResult;
    };

    try {
      const response = await apiClient.get<ExplorerSchemaResponse>(`/datasources/${datasourceId}/schema`);
      return applySemanticOverrides(normalizeSchema(response.data));
    } catch (schemaError) {
      const tablesResponse = await apiClient.get<{ tables: Array<string | LegacyTable> }>(`/datasets/${datasourceId}/tables`);
      const tableRefs = (tablesResponse.data.tables || []).map(normalizeTableRef).filter((table) => table.name);

      const tables = await Promise.all(
        tableRefs.map(async (tableRef) => {
          const encodedName = encodeURIComponent(tableRef.name);
          const [columnsResponse, profileResponse] = await Promise.allSettled([
            apiClient.get<{ columns: LegacyColumn[] }>(`/datasets/${datasourceId}/tables/${encodedName}/columns`),
            apiClient.get<LegacyStats>(`/datasets/${datasourceId}/tables/${encodedName}/profile`)
          ]);

          const columns = columnsResponse.status === 'fulfilled' ? columnsResponse.value.data.columns || [] : [];
          const profile = profileResponse.status === 'fulfilled' ? profileResponse.value.data : undefined;
          const normalizedColumns = columns.map(normalizeColumn);

          const short = tableRef.name.split('.').pop()?.toLowerCase() || '';
          const semanticOverride = semanticTableTypes.get(tableRef.name.toLowerCase()) || semanticTableTypes.get(short);

          return {
            name: tableRef.name,
            schema: tableRef.schema,
            type: semanticOverride || (tableRef.type as ExplorerTableType) || detectTableType(tableRef.name, normalizedColumns, profile?.rowCount),
            rowCount: profile?.rowCount,
            columns: normalizedColumns
          } satisfies ExplorerTable;
        })
      );

      return applySemanticOverrides(normalizeSchema({ tables, relationships: inferRelationships(tables) }));
    }
  },

  async fetchSchemas(datasourceId: string): Promise<string[]> {
    const response = await apiClient.get<{ tables: Array<string | LegacyTable> }>(`/datasets/${datasourceId}/tables`);
    const schemaNames = new Set<string>();
    for (const table of response.data.tables || []) {
      const normalized = normalizeTableRef(table);
      if (normalized.schema) {
        schemaNames.add(normalized.schema);
      } else {
        schemaNames.add('public');
      }
    }
    return Array.from(schemaNames).sort();
  },

  async fetchPreview(datasourceId: string, tableName: string, limit = 10): Promise<ExplorerPreviewResponse> {
    const encodedName = encodeURIComponent(tableName);

    try {
      const response = await apiClient.get<ExplorerPreviewResponse>(
        `/datasources/${datasourceId}/tables/${encodedName}/preview?limit=${limit}`
      );
      return {
        columns: response.data.columns || Object.keys(response.data.rows?.[0] || {}),
        rows: response.data.rows || [],
        metadata: {
          previewLimit: limit,
          ...(response.data.metadata || {})
        }
      };
    } catch (previewError) {
      const response = await apiClient.get<{ rows: Array<Record<string, unknown>>; columns?: string[]; metadata?: ExplorerPreviewResponse['metadata'] }>(
        `/datasets/${datasourceId}/tables/${encodedName}/preview?limit=${limit}`
      );
      const rows = response.data.rows || [];
      return {
        columns: response.data.columns || Object.keys(rows[0] || {}),
        rows,
        metadata: {
          previewLimit: limit,
          ...(response.data.metadata || {})
        }
      };
    }
  }
};