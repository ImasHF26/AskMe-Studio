import { StatisticalForecastService } from '../src/copilot/statistical-forecast.service';

describe('StatisticalForecastService', () => {
  let service: StatisticalForecastService;

  beforeEach(() => {
    service = new StatisticalForecastService();
  });

  it('should detect forecast questions accurately', () => {
    expect(service.isForecastQuestion('on pourra prédire le nombre de ventes de l’année 2026?')).toBe(true);
    expect(service.isForecastQuestion('Quelle est la prévision pour l’année prochaine ?')).toBe(true);
    expect(service.isForecastQuestion('Projeter le chiffre d’affaires pour 2027')).toBe(true);
    expect(service.isForecastQuestion('Quel est le chiffre d’affaires en 2024 ?')).toBe(false);
  });

  it('should extract target year from question', () => {
    expect(service.extractTargetYear('prédire les ventes de 2026')).toBe(2026);
    expect(service.extractTargetYear('projection pour 2028')).toBe(2028);
    expect(service.extractTargetYear('quel est le total ?')).toBeUndefined();
  });

  it('should compute linear regression and predict future point when history is sufficient', () => {
    const columns = ['annee', 'nombre_ventes'];
    const rows = [
      { annee: 2023, nombre_ventes: 16 },
      { annee: 2024, nombre_ventes: 20 },
      { annee: 2025, nombre_ventes: 24 }
    ];

    const result = service.applyForecast('prédire les ventes pour 2026', columns, rows);

    expect(result.isForecastRequested).toBe(true);
    expect(result.hasSufficientHistory).toBe(true);
    expect(result.predictedValue).toBe(28);
    expect(result.slope).toBe(4);
    expect(result.rSquared).toBe(1);
    expect(result.enrichedRows.length).toBe(4);
    expect(result.enrichedRows[3]).toEqual({
      annee: '2026 (Prévision)',
      nombre_ventes: 28,
      Type: 'Prévision'
    });
  });

  it('should handle insufficient history gracefully with clear explanation', () => {
    const columns = ['annee', 'nombre_ventes'];
    const rows = [{ annee: 2025, nombre_ventes: 24 }];

    const result = service.applyForecast('prédire les ventes pour 2026', columns, rows);

    expect(result.isForecastRequested).toBe(true);
    expect(result.hasSufficientHistory).toBe(false);
    expect(result.explanation).toContain('Au moins deux périodes comparables sont nécessaires');
  });
});
