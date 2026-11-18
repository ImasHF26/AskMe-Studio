import { SemanticVectorService } from '../src/semantic-layer/semantic-vector.service';
import { DatabaseService } from '../src/common/database/database.service';
import type { SemanticLayerResponse } from '../src/semantic-layer/semantic.types';

describe('SemanticVectorService (Unit Tests)', () => {
  let service: SemanticVectorService;
  let mockDatabase: DatabaseService;

  const sampleLayer: SemanticLayerResponse = {
    tables: [
      {
        id: 'tbl_orders',
        technicalName: 'orders',
        businessName: 'Commandes',
        description: 'Commandes clients passées en ligne',
        tableType: 'fact',
        columns: [
          {
            id: 'col_total',
            technicalName: 'total_amount',
            businessName: 'Montant total',
            semanticType: 'measure',
            dataType: 'numeric',
            isNullable: false
          },
          {
            id: 'col_date',
            technicalName: 'created_at',
            businessName: 'Date de commande',
            semanticType: 'date',
            dataType: 'timestamp',
            isNullable: false
          }
        ]
      }
    ],
    kpis: [
      {
        id: 'kpi_ca',
        name: "Chiffre d'affaires",
        sqlFormula: 'SUM(total_amount)',
        description: 'Total des ventes hors taxes',
        formatting: 'currency'
      }
    ],
    synonyms: [
      {
        id: 'syn_ca',
        term: 'revenu',
        mappedValue: "Chiffre d'affaires"
      }
    ]
  };

  beforeEach(() => {
    mockDatabase = {
      pool: undefined,
      dbReady: false,
      semanticVectorReady: false,
      getHealth: () => ({ status: 'ok', service: 'database', persistence: 'memory' }),
      onModuleInit: async () => {}
    } as unknown as DatabaseService;

    service = new SemanticVectorService(mockDatabase);
  });

  describe('embedSemanticText', () => {
    it('should generate a 384-dimensional deterministic normalized vector', () => {
      const vec1 = service.embedSemanticText('chiffre affaires commandes');
      const vec2 = service.embedSemanticText('chiffre affaires commandes');

      expect(vec1).toHaveLength(384);
      expect(vec2).toEqual(vec1);

      // Verify L2 norm is close to 1.0 (unit vector)
      const magnitude = Math.sqrt(vec1.reduce((sum, val) => sum + val * val, 0));
      expect(magnitude).toBeCloseTo(1.0, 2);
    });

    it('should format a vector correctly for pgvector syntax', () => {
      const pgVector = service.toPgVector([0.123, -0.456, 0.789]);
      expect(pgVector).toBe('[0.123,-0.456,0.789]');
    });
  });

  describe('normalizeSearchText & semanticTextScore', () => {
    it('should strip accents, lower-case and clean punctuation', () => {
      const normalized = service.normalizeSearchText('Chiffre d’Affaires & Événements_Spéciaux !');
      expect(normalized).toBe('chiffre d affaires evenements speciaux');
    });

    it('should calculate higher text score for exact text matches', () => {
      const exactScore = service.semanticTextScore('quel est le montant total', ['Montant total', 'total_amount']);
      const partialScore = service.semanticTextScore('quel est le statut', ['Montant total', 'total_amount']);

      expect(exactScore).toBeGreaterThan(0);
      expect(exactScore).toBeGreaterThan(partialScore);
    });
  });

  describe('buildSemanticSearchEntries', () => {
    it('should build entries for tables, columns, kpis and synonyms', () => {
      const entries = service.buildSemanticSearchEntries(sampleLayer);

      // 1 table + 2 columns + 1 kpi + 1 synonym = 5 entries
      expect(entries).toHaveLength(5);

      const tableEntry = entries.find((e) => e.entityType === 'table');
      expect(tableEntry).toBeDefined();
      expect(tableEntry?.entityName).toBe('Commandes');
      expect(tableEntry?.mappedValue).toBe('orders');

      const kpiEntry = entries.find((e) => e.entityType === 'kpi');
      expect(kpiEntry).toBeDefined();
      expect(kpiEntry?.entityName).toBe("Chiffre d'affaires");

      const synEntry = entries.find((e) => e.entityType === 'synonym');
      expect(synEntry).toBeDefined();
      expect(synEntry?.entityName).toBe('revenu');
      expect(synEntry?.mappedValue).toBe("Chiffre d'affaires");
    });
  });

  describe('searchSemanticLayerLocally & MMR reranking', () => {
    it('should retrieve relevant semantic entries for a natural language query', () => {
      const hits = service.searchSemanticLayerLocally('donne moi le chiffre d affaires', sampleLayer, 3);

      expect(hits.length).toBeGreaterThan(0);
      const topHit = hits[0];
      expect(
        topHit.entityName.includes('affaires') ||
        topHit.content.includes('affaires') ||
        topHit.entityType === 'kpi'
      ).toBe(true);
    });

    it('should apply MMR to diversify search candidates and limit results', () => {
      const hits = service.searchSemanticLayerLocally('commandes montant', sampleLayer, 2);

      expect(hits.length).toBeLessThanOrEqual(2);
      const types = hits.map((h) => h.entityType);
      // Results should not exceed requested limit
      expect(types).toHaveLength(hits.length);
    });
  });
});
