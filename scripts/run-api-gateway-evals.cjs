const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const { AppService } = require(path.join(root, 'backend/api-gateway/dist/app.service.js'));
const { ConversationContextResolver } = require(path.join(
  root,
  'backend/api-gateway/dist/conversation/conversation-context-resolver.service.js'
));
const evals = JSON.parse(fs.readFileSync(path.join(root, 'evals/api-gateway-semantic.json'), 'utf8'));

const user = {
  id: 'usr_eval',
  email: 'eval@askme.studio',
  fullName: 'Eval User',
  role: 'Analyst'
};
const datasourceId = 'ds_eval';

const semanticLayer = {
  tables: [
    {
      id: 'tbl_orders',
      technicalName: 'orders',
      businessName: 'Orders',
      description: 'Customer orders',
      tableType: 'fact',
      columns: [
        {
          id: 'col_total_amount',
          technicalName: 'total_amount',
          businessName: 'Revenue',
          semanticType: 'measure',
          dataType: 'numeric',
          isNullable: false
        },
        {
          id: 'col_created_at',
          technicalName: 'created_at',
          businessName: 'Created At',
          semanticType: 'date',
          dataType: 'timestamp',
          isNullable: false
        },
        {
          id: 'col_customer_id',
          technicalName: 'customer_id',
          businessName: 'Client ID',
          semanticType: 'identifier',
          dataType: 'integer',
          isNullable: false
        },
        {
          id: 'col_product_id',
          technicalName: 'product_id',
          businessName: 'Product ID',
          semanticType: 'identifier',
          dataType: 'integer',
          isNullable: false
        },
        {
          id: 'col_status',
          technicalName: 'status',
          businessName: 'Status',
          semanticType: 'dimension',
          dataType: 'text',
          isNullable: true
        },
        {
          id: 'col_category',
          technicalName: 'category',
          businessName: 'Category',
          semanticType: 'dimension',
          dataType: 'text',
          isNullable: true
        }
      ]
    },
    {
      id: 'tbl_customers',
      technicalName: 'customers',
      businessName: 'Clients',
      description: 'Customer master data',
      tableType: 'dimension',
      columns: [
        {
          id: 'col_customer_id',
          technicalName: 'customer_id',
          businessName: 'Client ID',
          semanticType: 'identifier',
          dataType: 'integer',
          isNullable: false
        },
        {
          id: 'col_customer_name',
          technicalName: 'customer_name',
          businessName: 'Nom Client',
          semanticType: 'dimension',
          dataType: 'varchar',
          isNullable: false
        },
        {
          id: 'col_first_name',
          technicalName: 'first_name',
          businessName: 'Prenom',
          semanticType: 'dimension',
          dataType: 'text',
          isNullable: true
        },
        {
          id: 'col_last_name',
          technicalName: 'last_name',
          businessName: 'Nom',
          semanticType: 'dimension',
          dataType: 'text',
          isNullable: true
        }
      ]
    },
    {
      id: 'tbl_products',
      technicalName: 'products',
      businessName: 'Produits',
      description: 'Product master data',
      tableType: 'dimension',
      columns: [
        {
          id: 'col_product_id',
          technicalName: 'product_id',
          businessName: 'Product ID',
          semanticType: 'identifier',
          dataType: 'integer',
          isNullable: false
        },
        {
          id: 'col_product_name',
          technicalName: 'product_name',
          businessName: 'Nom Produit',
          semanticType: 'dimension',
          dataType: 'varchar',
          isNullable: false
        }
      ]
    }
  ],
  kpis: [
    {
      id: 'kpi_revenue',
      name: 'Revenue',
      sqlFormula: 'SUM("total_amount")',
      description: 'Total revenue from orders',
      formatting: 'currency'
    }
  ],
  synonyms: [
    {
      id: 'syn_revenue',
      term: 'sales',
      mappedValue: 'Revenue'
    },
    {
      id: 'syn_chiffre_affaires',
      term: "chiffre d'affaires",
      mappedValue: 'Revenue'
    }
  ]
};

const salesSemanticLayer = {
  tables: [
    {
      id: 'tbl_f_ventes',
      technicalName: 'dw.f_ventes',
      businessName: 'Ventes',
      description: 'Faits de ventes',
      tableType: 'fact',
      columns: [
        {
          id: 'col_sk_produit',
          technicalName: 'sk_produit',
          businessName: 'Clé produit',
          semanticType: 'identifier',
          dataType: 'integer',
          isNullable: false
        },
        {
          id: 'col_sk_client',
          technicalName: 'sk_client',
          businessName: 'Clé client',
          semanticType: 'identifier',
          dataType: 'integer',
          isNullable: false
        },
        {
          id: 'col_sk_geographie',
          technicalName: 'sk_geographie',
          businessName: 'Clé géographie',
          semanticType: 'identifier',
          dataType: 'integer',
          isNullable: false
        },
        {
          id: 'col_sk_magasin',
          technicalName: 'sk_magasin',
          businessName: 'Clé magasin',
          semanticType: 'identifier',
          dataType: 'integer',
          isNullable: false
        },
        {
          id: 'col_sk_employe',
          technicalName: 'sk_employe',
          businessName: 'Clé employé',
          semanticType: 'identifier',
          dataType: 'integer',
          isNullable: false
        },
        {
          id: 'col_sk_moyen_paiement',
          technicalName: 'sk_moyen_paiement',
          businessName: 'Clé moyen de paiement',
          semanticType: 'identifier',
          dataType: 'integer',
          isNullable: false
        },
        {
          id: 'col_sk_temps',
          technicalName: 'sk_temps',
          businessName: 'Clé temps',
          semanticType: 'identifier',
          dataType: 'integer',
          isNullable: false
        },
        {
          id: 'col_sk_promotion',
          technicalName: 'sk_promotion',
          businessName: 'Clé promotion',
          semanticType: 'identifier',
          dataType: 'integer',
          isNullable: false
        },
        {
          id: 'col_quantite',
          technicalName: 'quantite',
          businessName: 'Quantité',
          semanticType: 'measure',
          dataType: 'numeric',
          isNullable: false
        },
        {
          id: 'col_montant_total',
          technicalName: 'montant_total',
          businessName: "Chiffre d'affaires",
          semanticType: 'measure',
          dataType: 'numeric',
          isNullable: false
        },
        {
          id: 'col_cout_achat_total',
          technicalName: 'cout_achat_total',
          businessName: 'Coût achat total',
          semanticType: 'measure',
          dataType: 'numeric',
          isNullable: false
        },
        {
          id: 'col_marge_brute',
          technicalName: 'marge_brute',
          businessName: 'Marge brute',
          semanticType: 'measure',
          dataType: 'numeric',
          isNullable: false
        }
      ]
    },
    {
      id: 'tbl_dim_produit',
      technicalName: 'dw.dim_produit',
      businessName: 'Produits',
      description: 'Dimension produit',
      tableType: 'dimension',
      columns: [
        {
          id: 'col_dim_produit_sk',
          technicalName: 'sk_produit',
          businessName: 'Clé produit',
          semanticType: 'identifier',
          dataType: 'integer',
          isNullable: false
        },
        {
          id: 'col_nom_produit',
          technicalName: 'nom_produit',
          businessName: 'Nom produit',
          semanticType: 'dimension',
          dataType: 'varchar',
          isNullable: false
        },
        {
          id: 'col_categorie',
          technicalName: 'categorie',
          businessName: 'Catégorie',
          semanticType: 'dimension',
          dataType: 'varchar',
          isNullable: false
        }
      ]
    },
    {
      id: 'tbl_dim_client',
      technicalName: 'dw.dim_client',
      businessName: 'Clients',
      description: 'Dimension client',
      tableType: 'dimension',
      columns: [
        {
          id: 'col_dim_client_sk',
          technicalName: 'sk_client',
          businessName: 'Clé client',
          semanticType: 'identifier',
          dataType: 'integer',
          isNullable: false
        },
        {
          id: 'col_nom_client',
          technicalName: 'nom_client',
          businessName: 'Nom client',
          semanticType: 'dimension',
          dataType: 'varchar',
          isNullable: false
        },
        {
          id: 'col_prenom_client',
          technicalName: 'prenom_client',
          businessName: 'Prénom client',
          semanticType: 'dimension',
          dataType: 'varchar',
          isNullable: true
        },
        {
          id: 'col_membre_fidelite',
          technicalName: 'membre_fidelite',
          businessName: 'Membre fidélité (client fidèle)',
          semanticType: 'dimension',
          dataType: 'boolean',
          isNullable: true
        }
      ]
    },
    {
      id: 'tbl_dim_geographie',
      technicalName: 'dw.dim_geographie',
      businessName: 'Géographie',
      description: 'Dimension géographique',
      tableType: 'dimension',
      columns: [
        {
          id: 'col_dim_geo_sk',
          technicalName: 'sk_geographie',
          businessName: 'Clé géographie',
          semanticType: 'identifier',
          dataType: 'integer',
          isNullable: false
        },
        {
          id: 'col_region',
          technicalName: 'region',
          businessName: 'Région',
          semanticType: 'dimension',
          dataType: 'varchar',
          isNullable: false
        }
      ]
    },
    {
      id: 'tbl_dim_magasin',
      technicalName: 'dw.dim_magasin',
      businessName: 'Magasins',
      description: 'Dimension magasin',
      tableType: 'dimension',
      columns: [
        {
          id: 'col_dim_magasin_sk',
          technicalName: 'sk_magasin',
          businessName: 'Clé magasin',
          semanticType: 'identifier',
          dataType: 'integer',
          isNullable: false
        },
        {
          id: 'col_nom_magasin',
          technicalName: 'nom_magasin',
          businessName: 'Nom magasin',
          semanticType: 'dimension',
          dataType: 'varchar',
          isNullable: false
        },
        {
          id: 'col_type_magasin',
          technicalName: 'type_magasin',
          businessName: 'Type magasin',
          semanticType: 'dimension',
          dataType: 'varchar',
          isNullable: false
        }
      ]
    },
    {
      id: 'tbl_dim_employe',
      technicalName: 'dw.dim_employe',
      businessName: 'Employés',
      description: 'Dimension employé',
      tableType: 'dimension',
      columns: [
        {
          id: 'col_dim_employe_sk',
          technicalName: 'sk_employe',
          businessName: 'Clé employé',
          semanticType: 'identifier',
          dataType: 'integer',
          isNullable: false
        },
        {
          id: 'col_nom_employe',
          technicalName: 'nom_employe',
          businessName: 'Nom employé',
          semanticType: 'dimension',
          dataType: 'varchar',
          isNullable: false
        }
      ]
    },
    {
      id: 'tbl_dim_moyen_paiement',
      technicalName: 'dw.dim_moyen_paiement',
      businessName: 'Moyens de paiement',
      description: 'Dimension moyen de paiement',
      tableType: 'dimension',
      columns: [
        {
          id: 'col_dim_mp_sk',
          technicalName: 'sk_moyen_paiement',
          businessName: 'Clé moyen paiement',
          semanticType: 'identifier',
          dataType: 'integer',
          isNullable: false
        },
        {
          id: 'col_moyen_paiement',
          technicalName: 'moyen_paiement',
          businessName: 'Moyen de paiement',
          semanticType: 'dimension',
          dataType: 'varchar',
          isNullable: false
        }
      ]
    },
    {
      id: 'tbl_dim_temps',
      technicalName: 'dw.dim_temps',
      businessName: 'Temps',
      description: 'Dimension temps',
      tableType: 'dimension',
      columns: [
        {
          id: 'col_dim_temps_sk',
          technicalName: 'sk_temps',
          businessName: 'Clé temps',
          semanticType: 'identifier',
          dataType: 'integer',
          isNullable: false
        },
        {
          id: 'col_nom_mois',
          technicalName: 'nom_mois',
          businessName: 'Nom mois',
          semanticType: 'dimension',
          dataType: 'varchar',
          isNullable: false
        },
        {
          id: 'col_annee',
          technicalName: 'annee',
          businessName: 'Année',
          semanticType: 'dimension',
          dataType: 'integer',
          isNullable: false
        }
      ]
    },
    {
      id: 'tbl_dim_promotion',
      technicalName: 'dw.dim_promotion',
      businessName: 'Promotions',
      description: 'Dimension promotion',
      tableType: 'dimension',
      columns: [
        {
          id: 'col_dim_promo_sk',
          technicalName: 'sk_promotion',
          businessName: 'Clé promotion',
          semanticType: 'identifier',
          dataType: 'integer',
          isNullable: false
        },
        {
          id: 'col_nom_promotion',
          technicalName: 'nom_promotion',
          businessName: 'Nom promotion',
          semanticType: 'dimension',
          dataType: 'varchar',
          isNullable: false
        }
      ]
    }
  ],
  kpis: [
    {
      id: 'kpi_cost',
      name: 'Coût achat total',
      sqlFormula: 'SUM("cout_achat_total")',
      description: 'Coût total des achats',
      formatting: 'currency'
    }
  ],
  synonyms: [
    {
      id: 'syn_fidele',
      term: 'fidèle',
      mappedValue: 'membre_fidelite'
    },
    {
      id: 'syn_marge_brute',
      term: 'marge brute',
      mappedValue: 'marge_brute'
    }
  ]
};

const defaultMetadata = [
  {
    name: 'orders',
    tableType: 'table',
    rowCount: 100,
    sampleRows: [],
    warnings: [],
    columns: [
      {
        name: 'id',
        dataType: 'integer',
        isNullable: false,
        isPrimaryKey: true,
        isForeignKey: false,
        profile: { nullRatio: 0, distinctCount: 100, distinctRatio: 1, topValues: [], sampleValues: [] }
      },
      {
        name: 'total_amount',
        dataType: 'numeric',
        isNullable: false,
        isPrimaryKey: false,
        isForeignKey: false,
        profile: { nullRatio: 0, distinctCount: 80, distinctRatio: 0.8, topValues: [], sampleValues: [120, 230] }
      }
    ]
  }
];

const dwMetadata = [
  {
    name: 'f_ventes',
    tableType: 'table',
    rowCount: 10000,
    sampleRows: [],
    warnings: [],
    columns: [
      {
        name: 'sk_vente',
        dataType: 'integer',
        isNullable: false,
        isPrimaryKey: true,
        isForeignKey: false,
        profile: { nullRatio: 0, distinctCount: 10000, distinctRatio: 1, topValues: [], sampleValues: [] }
      },
      {
        name: 'sk_produit',
        dataType: 'integer',
        isNullable: false,
        isPrimaryKey: false,
        isForeignKey: true,
        references: { table: 'dim_produit', column: 'sk_produit' },
        profile: { nullRatio: 0, distinctCount: 50, distinctRatio: 0.005, topValues: [], sampleValues: [] }
      },
      {
        name: 'sk_client',
        dataType: 'integer',
        isNullable: false,
        isPrimaryKey: false,
        isForeignKey: true,
        references: { table: 'dim_client', column: 'sk_client' },
        profile: { nullRatio: 0, distinctCount: 100, distinctRatio: 0.01, topValues: [], sampleValues: [] }
      },
      {
        name: 'sk_geographie',
        dataType: 'integer',
        isNullable: false,
        isPrimaryKey: false,
        isForeignKey: true,
        references: { table: 'dim_geographie', column: 'sk_geographie' },
        profile: { nullRatio: 0, distinctCount: 20, distinctRatio: 0.002, topValues: [], sampleValues: [] }
      },
      {
        name: 'sk_magasin',
        dataType: 'integer',
        isNullable: false,
        isPrimaryKey: false,
        isForeignKey: true,
        references: { table: 'dim_magasin', column: 'sk_magasin' },
        profile: { nullRatio: 0, distinctCount: 15, distinctRatio: 0.0015, topValues: [], sampleValues: [] }
      },
      {
        name: 'sk_employe',
        dataType: 'integer',
        isNullable: false,
        isPrimaryKey: false,
        isForeignKey: true,
        references: { table: 'dim_employe', column: 'sk_employe' },
        profile: { nullRatio: 0, distinctCount: 30, distinctRatio: 0.003, topValues: [], sampleValues: [] }
      },
      {
        name: 'sk_promotion',
        dataType: 'integer',
        isNullable: false,
        isPrimaryKey: false,
        isForeignKey: true,
        references: { table: 'dim_promotion', column: 'sk_promotion' },
        profile: { nullRatio: 0, distinctCount: 10, distinctRatio: 0.001, topValues: [], sampleValues: [] }
      },
      {
        name: 'sk_moyen_paiement',
        dataType: 'integer',
        isNullable: false,
        isPrimaryKey: false,
        isForeignKey: true,
        references: { table: 'dim_moyen_paiement', column: 'sk_moyen_paiement' },
        profile: { nullRatio: 0, distinctCount: 5, distinctRatio: 0.0005, topValues: [], sampleValues: [] }
      },
      {
        name: 'sk_temps',
        dataType: 'integer',
        isNullable: false,
        isPrimaryKey: false,
        isForeignKey: true,
        references: { table: 'dim_temps', column: 'sk_temps' },
        profile: { nullRatio: 0, distinctCount: 365, distinctRatio: 0.036, topValues: [], sampleValues: [] }
      },
      {
        name: 'montant_total',
        dataType: 'numeric',
        isNullable: false,
        isPrimaryKey: false,
        isForeignKey: false,
        profile: { nullRatio: 0, distinctCount: 500, distinctRatio: 0.05, topValues: [], sampleValues: [] }
      }
    ]
  },
  {
    name: 'dim_produit',
    tableType: 'table',
    rowCount: 50,
    sampleRows: [],
    warnings: [],
    columns: [
      {
        name: 'sk_produit',
        dataType: 'integer',
        isNullable: false,
        isPrimaryKey: true,
        isForeignKey: false,
        profile: { nullRatio: 0, distinctCount: 50, distinctRatio: 1, topValues: [], sampleValues: [] }
      },
      {
        name: 'nom_produit',
        dataType: 'varchar',
        isNullable: false,
        isPrimaryKey: false,
        isForeignKey: false,
        profile: { nullRatio: 0, distinctCount: 50, distinctRatio: 1, topValues: [], sampleValues: [] }
      }
    ]
  },
  {
    name: 'dim_client',
    tableType: 'table',
    rowCount: 100,
    sampleRows: [],
    warnings: [],
    columns: [
      {
        name: 'sk_client',
        dataType: 'integer',
        isNullable: false,
        isPrimaryKey: true,
        isForeignKey: false,
        profile: { nullRatio: 0, distinctCount: 100, distinctRatio: 1, topValues: [], sampleValues: [] }
      },
      {
        name: 'nom_client',
        dataType: 'varchar',
        isNullable: false,
        isPrimaryKey: false,
        isForeignKey: false,
        profile: { nullRatio: 0, distinctCount: 100, distinctRatio: 1, topValues: [], sampleValues: [] }
      }
    ]
  },
  {
    name: 'dim_geographie',
    tableType: 'table',
    rowCount: 20,
    sampleRows: [],
    warnings: [],
    columns: [
      {
        name: 'sk_geographie',
        dataType: 'integer',
        isNullable: false,
        isPrimaryKey: true,
        isForeignKey: false,
        profile: { nullRatio: 0, distinctCount: 20, distinctRatio: 1, topValues: [], sampleValues: [] }
      },
      {
        name: 'ville',
        dataType: 'varchar',
        isNullable: false,
        isPrimaryKey: false,
        isForeignKey: false,
        profile: { nullRatio: 0, distinctCount: 20, distinctRatio: 1, topValues: [], sampleValues: [] }
      }
    ]
  },
  {
    name: 'dim_magasin',
    tableType: 'table',
    rowCount: 15,
    sampleRows: [],
    warnings: [],
    columns: [
      {
        name: 'sk_magasin',
        dataType: 'integer',
        isNullable: false,
        isPrimaryKey: true,
        isForeignKey: false,
        profile: { nullRatio: 0, distinctCount: 15, distinctRatio: 1, topValues: [], sampleValues: [] }
      },
      {
        name: 'nom_magasin',
        dataType: 'varchar',
        isNullable: false,
        isPrimaryKey: false,
        isForeignKey: false,
        profile: { nullRatio: 0, distinctCount: 15, distinctRatio: 1, topValues: [], sampleValues: [] }
      },
      {
        name: 'sk_geographie',
        dataType: 'integer',
        isNullable: false,
        isPrimaryKey: false,
        isForeignKey: true,
        references: { table: 'dim_geographie', column: 'sk_geographie' },
        profile: { nullRatio: 0, distinctCount: 10, distinctRatio: 0.67, topValues: [], sampleValues: [] }
      }
    ]
  },
  {
    name: 'dim_employe',
    tableType: 'table',
    rowCount: 30,
    sampleRows: [],
    warnings: [],
    columns: [
      {
        name: 'sk_employe',
        dataType: 'integer',
        isNullable: false,
        isPrimaryKey: true,
        isForeignKey: false,
        profile: { nullRatio: 0, distinctCount: 30, distinctRatio: 1, topValues: [], sampleValues: [] }
      },
      {
        name: 'nom_employe',
        dataType: 'varchar',
        isNullable: false,
        isPrimaryKey: false,
        isForeignKey: false,
        profile: { nullRatio: 0, distinctCount: 30, distinctRatio: 1, topValues: [], sampleValues: [] }
      }
    ]
  },
  {
    name: 'dim_promotion',
    tableType: 'table',
    rowCount: 10,
    sampleRows: [],
    warnings: [],
    columns: [
      {
        name: 'sk_promotion',
        dataType: 'integer',
        isNullable: false,
        isPrimaryKey: true,
        isForeignKey: false,
        profile: { nullRatio: 0, distinctCount: 10, distinctRatio: 1, topValues: [], sampleValues: [] }
      },
      {
        name: 'nom_promotion',
        dataType: 'varchar',
        isNullable: false,
        isPrimaryKey: false,
        isForeignKey: false,
        profile: { nullRatio: 0, distinctCount: 10, distinctRatio: 1, topValues: [], sampleValues: [] }
      }
    ]
  },
  {
    name: 'dim_moyen_paiement',
    tableType: 'table',
    rowCount: 5,
    sampleRows: [],
    warnings: [],
    columns: [
      {
        name: 'sk_moyen_paiement',
        dataType: 'integer',
        isNullable: false,
        isPrimaryKey: true,
        isForeignKey: false,
        profile: { nullRatio: 0, distinctCount: 5, distinctRatio: 1, topValues: [], sampleValues: [] }
      },
      {
        name: 'type_paiement',
        dataType: 'varchar',
        isNullable: false,
        isPrimaryKey: false,
        isForeignKey: false,
        profile: { nullRatio: 0, distinctCount: 5, distinctRatio: 1, topValues: [], sampleValues: [] }
      }
    ]
  },
  {
    name: 'dim_temps',
    tableType: 'table',
    rowCount: 365,
    sampleRows: [],
    warnings: [],
    columns: [
      {
        name: 'sk_temps',
        dataType: 'integer',
        isNullable: false,
        isPrimaryKey: true,
        isForeignKey: false,
        profile: { nullRatio: 0, distinctCount: 365, distinctRatio: 1, topValues: [], sampleValues: [] }
      },
      {
        name: 'nom_mois',
        dataType: 'varchar',
        isNullable: false,
        isPrimaryKey: false,
        isForeignKey: false,
        profile: { nullRatio: 0, distinctCount: 12, distinctRatio: 0.033, topValues: [], sampleValues: [] }
      }
    ]
  }
];

function createMemoryService() {
  const contexts = new Map();
  return {
    async getContext(sessionId) {
      return contexts.get(sessionId);
    },
    async saveContext(sessionId, context) {
      contexts.set(sessionId, context);
    },
    async clearContext(sessionId) {
      contexts.delete(sessionId);
    },
    async appendTurn(sessionId, turn) {
      const previous = contexts.get(sessionId);
      if (!previous) return;
      contexts.set(sessionId, {
        ...previous,
        history: [...(previous.history || []), turn].slice(-5),
        updatedAt: new Date().toISOString()
      });
    }
  };
}

function createService() {
  return new AppService(
    {
      dbReady: false,
      semanticVectorReady: false,
      pool: undefined,
      getHealth: () => ({ service: 'api-gateway', status: 'ok', persistence: 'memory' })
    },
    {
      encryptJson: () => '',
      decryptJson: () => ({})
    },
    {},
    createMemoryService(),
    new ConversationContextResolver()
  );
}

function setSemanticLayer(service, layer) {
  service.inMemoryDatasources.push({
    id: datasourceId,
    userId: user.id,
    name: 'Eval datasource',
    type: 'postgresql',
    createdAt: new Date(0).toISOString(),
    encryptedCredentials: '',
    connectionConfig: {}
  });
  service.inMemorySemantic[`${user.id}::${datasourceId}`] = layer;
}

function assertIncludesAll(haystack, needles, name) {
  for (const needle of needles || []) {
    assert(
      haystack.toLowerCase().includes(String(needle).toLowerCase()),
      `${name}: expected "${haystack}" to include "${needle}"`
    );
  }
}

async function run() {
  let passed = 0;

  for (const item of evals) {
    const service = createService();
    setSemanticLayer(service, item.semanticLayer === 'empty' ? { tables: [], kpis: [], synonyms: [] } : semanticLayer);

    if (item.validatorOnly) {
      const targetLayer = item.sql && (item.sql.includes('dw') || item.name.includes('dw')) ? salesSemanticLayer : semanticLayer;
      const validation = service.validateSemanticSql(item.sql, targetLayer);
      assert.strictEqual(validation.ok, false, `${item.name}: validation should fail`);
      assertIncludesAll(validation.reason || '', [item.expectedReasonIncludes], item.name);
      passed += 1;
      continue;
    }

    if (item.retrievalOnly) {
      const targetLayer =
        item.expectedHit === 'marge_brute' ||
        item.expectedHit === 'membre_fidelite' ||
        item.name.includes('dw') ||
        item.name.includes('margin') ||
        item.name.includes('loyalty')
          ? salesSemanticLayer
          : semanticLayer;
      const hits = service.searchSemanticLayerLocally(item.question, targetLayer, 5);
      const found = hits.some((hit) =>
        [hit.entityName, hit.mappedValue, hit.content].some((value) =>
          String(value).toLowerCase().includes(String(item.expectedHit).toLowerCase())
        )
      );
      assert(found, `${item.name}: expected retrieval hit ${item.expectedHit}`);
      passed += 1;
      continue;
    }

    if (item.generationLanguageOnly) {
      const proposal = service.buildHeuristicSemanticProposal(
        datasourceId,
        item.metadata || defaultMetadata,
        item.semanticLanguage
      );
      assert.strictEqual(
        proposal.tables[0].technicalName,
        item.expectedTechnicalName,
        `${item.name}: technical name must remain unchanged`
      );
      assert.strictEqual(
        proposal.tables[0].businessName,
        item.expectedTableBusinessName,
        `${item.name}: unexpected localized table name`
      );
      assert(
        proposal.kpis.some((kpi) => kpi.name.includes(item.expectedKpiNameIncludes)),
        `${item.name}: expected localized KPI including ${item.expectedKpiNameIncludes}`
      );
      if (item.expectedKpiNameExcludes) {
        assert(
          proposal.kpis.every(
            (kpi) =>
              !item.expectedKpiNameExcludes.some((needle) => {
                const normalizedNeedle = String(needle).toLowerCase();
                return [kpi.name, kpi.sqlFormula].some((value) => String(value).toLowerCase().includes(normalizedNeedle));
              })
          ),
          `${item.name}: KPI names must not include forbidden values`
        );
      }
      if (item.expectedColumnSemanticTypes) {
        for (const expected of item.expectedColumnSemanticTypes) {
          const column = proposal.columns.find((entry) => entry.technicalName === expected.name);
          assert(column, `${item.name}: expected column ${expected.name}`);
          assert.strictEqual(
            column.semanticType,
            expected.semanticType,
            `${item.name}: unexpected semantic type for ${expected.name}`
          );
        }
      }
      if (item.expectedTableDescriptionIncludes) {
        assertIncludesAll(proposal.tables[0].description, item.expectedTableDescriptionIncludes, item.name);
      }
      for (const forbidden of item.expectedTableDescriptionExcludes || []) {
        assert(
          !proposal.tables[0].description.toLowerCase().includes(String(forbidden).toLowerCase()),
          `${item.name}: expected table description "${proposal.tables[0].description}" not to include "${forbidden}"`
        );
      }
      passed += 1;
      continue;
    }

    if (item.relationshipPersistenceOnly) {
      const metadataToUse = item.metadata || (item.name.includes('dw') ? dwMetadata : defaultMetadata);
      const proposal = service.buildHeuristicSemanticProposal(
        datasourceId,
        metadataToUse,
        item.semanticLanguage || 'en'
      );
      const saved = await service.saveSemanticLayer(user, datasourceId, {
        tables: proposal.tables,
        columns: proposal.columns,
        kpis: proposal.kpis,
        synonyms: proposal.synonyms,
        overwriteExisting: true
      });
      assert(saved.relationships && saved.relationships.length > 0, `${item.name}: expected persisted relationships`);
      for (const expected of item.expectedRelationshipIncludes || []) {
        const found = saved.relationships.some((relationship) =>
          `${relationship.fromTableTechnicalName}.${relationship.fromColumnTechnicalName}->${relationship.toTableTechnicalName}.${relationship.toColumnTechnicalName}`
            .toLowerCase()
            .includes(String(expected).toLowerCase())
        );
        assert(found, `${item.name}: expected relationship ${expected}`);
      }
      passed += 1;
      continue;
    }

    if (item.businessIntentOnly) {
      const plan = service.buildSemanticQueryPlan(item.question, salesSemanticLayer);
      assert(plan, `${item.name}: expected a semantic query plan`);
      assertIncludesAll(plan.sql, item.expectedSqlIncludes, item.name);
      for (const forbidden of item.expectedSqlExcludes || []) {
        assert(
          !plan.sql.toLowerCase().includes(String(forbidden).toLowerCase()),
          `${item.name}: expected "${plan.sql}" not to include "${forbidden}"`
        );
      }
      if (item.expectedMetricAlias) {
        assert.strictEqual(plan.metricAlias, item.expectedMetricAlias, `${item.name}: unexpected metric alias`);
      }
      if (item.expectedMetricColumn) {
        assert.strictEqual(
          plan.measureColumn?.technicalName,
          item.expectedMetricColumn,
          `${item.name}: unexpected metric column`
        );
      }
      if (item.expectedDimensionColumn) {
        assert.strictEqual(
          plan.dimensionColumn?.technicalName,
          item.expectedDimensionColumn,
          `${item.name}: unexpected dimension column`
        );
      }
      passed += 1;
      continue;
    }

    if (item.conversationMemoryOnly) {
      const sessionId = 'askme_eval_session';
      const isEmployee = item.name.includes('employee') || String(item.previousQuestion).includes('employé');
      await service.conversationMemory.saveContext(sessionId, isEmployee ? {
        sessionId,
        datasourceId,
        lastQuestion: item.previousQuestion,
        lastSql: 'SELECT "dw"."dim_employe"."nom_employe", "dw"."dim_employe"."departement", SUM("dw"."f_ventes"."montant_total") AS "chiffre_affaires" FROM "dw"."f_ventes" JOIN "dw"."dim_employe" ON "dw"."f_ventes"."sk_employe" = "dw"."dim_employe"."sk_employe" GROUP BY "dw"."dim_employe"."nom_employe", "dw"."dim_employe"."departement" ORDER BY "chiffre_affaires" DESC LIMIT 1;',
        lastIntent: {
          entity: 'employe',
          metric: 'montant_total',
          aggregation: 'sum',
          ranking: true,
          sort: 'desc',
          topN: 1,
          groupBy: ['nom_employe', 'departement']
        },
        lastResultSchema: ['nom_employe', 'departement', 'chiffre_affaires'],
        lastResultPreview: [{ nom_employe: 'Dupont', departement: 'Ventes', chiffre_affaires: 95000 }],
        lastAnswer: 'Jean Dupont est l’employé avec le plus grand chiffre d’affaires.',
        history: [],
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString()
      } : {
        sessionId,
        datasourceId,
        lastQuestion: item.previousQuestion,
        lastSql: 'SELECT "dw"."dim_client"."nom_client", "dw"."dim_client"."prenom_client", SUM("dw"."f_ventes"."montant_total") AS "chiffre_affaires" FROM "dw"."f_ventes" JOIN "dw"."dim_client" ON "dw"."f_ventes"."sk_client" = "dw"."dim_client"."sk_client" GROUP BY "dw"."dim_client"."nom_client", "dw"."dim_client"."prenom_client" ORDER BY "chiffre_affaires" DESC LIMIT 1;',
        lastIntent: {
          entity: 'client',
          metric: 'montant_total',
          aggregation: 'sum',
          ranking: true,
          sort: 'desc',
          topN: 1,
          groupBy: ['nom_client', 'prenom_client']
        },
        lastResultSchema: ['nom_client', 'prenom_client', 'chiffre_affaires'],
        lastResultPreview: [{ nom_client: 'Alami', prenom_client: 'Sara', chiffre_affaires: 125000 }],
        lastAnswer: 'Sara Alami est le client avec le plus grand chiffre d’affaires.',
        history: [],
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString()
      });
      const result = await service.generateQuery(user, item.question, datasourceId, 'static', sessionId);
      assert.strictEqual(result.status, 'ok', `${item.name}: unexpected generate status`);
      assert.strictEqual(result.canExecute, false, `${item.name}: memory answer must not execute SQL`);
      assert.strictEqual(result.sql, '', `${item.name}: memory answer must not generate SQL`);
      assertIncludesAll(result.reasoning, item.expectedAnswerIncludes, item.name);
      passed += 1;
      continue;
    }

    if (item.fallbackOnly) {
      const plan = service.buildSemanticQueryPlan(item.question, semanticLayer);
      const result = service.semanticFallbackResult(
        item.question,
        plan.sql,
        semanticLayer,
        plan,
        Date.now(),
        'forced execution failure',
        item.expectedStatus,
        datasourceId
      );
      assert.strictEqual(result.status, item.expectedStatus, `${item.name}: unexpected fallback status`);
      assert.strictEqual(result.rows.length, item.expectedRows, `${item.name}: fallback must not fabricate rows`);
      passed += 1;
      continue;
    }

    const result = await service.generateQuery(user, item.question, item.datasourceId === null ? undefined : datasourceId);
    assert.strictEqual(result.status, item.expectedStatus, `${item.name}: unexpected generate status`);
    assertIncludesAll(result.sql, item.expectedSqlIncludes, item.name);
    if (item.expectedReasonIncludes) {
      assertIncludesAll(result.reasoning || '', item.expectedReasonIncludes, item.name);
    }

    for (const expected of item.expectedEntities || []) {
      const found = result.usedEntities.some((entity) =>
        [entity.name, entity.technicalName].filter(Boolean).some((value) =>
          String(value).toLowerCase().includes(String(expected).toLowerCase())
        )
      );
      assert(found, `${item.name}: expected entity ${expected}`);
    }

    passed += 1;
  }

  console.log(`api-gateway semantic evals passed: ${passed}/${evals.length}`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
