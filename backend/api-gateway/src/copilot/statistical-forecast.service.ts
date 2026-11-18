import { Injectable } from '@nestjs/common';

export interface ForecastComputation {
  isForecastRequested: boolean;
  hasSufficientHistory: boolean;
  targetPeriodLabel?: string;
  timeColumn?: string;
  metricColumn?: string;
  historicalCount: number;
  predictedValue?: number;
  rSquared?: number;
  slope?: number;
  cagrPercent?: number;
  explanation: string;
  enrichedRows: Array<Record<string, string | number>>;
  enrichedColumns: string[];
}

@Injectable()
export class StatisticalForecastService {
  private readonly forecastKeywords = [
    'predire',
    'prédire',
    'prediction',
    'prédiction',
    'prevision',
    'prévision',
    'previsions',
    'prévisions',
    'forecast',
    'forecasting',
    'projeter',
    'projection',
    'projections',
    'estimer pour',
    'estimation pour',
    'tendance future',
    'perspective',
    'perspectives'
  ];

  public isForecastQuestion(question: string): boolean {
    const normalized = this.normalizeText(question);
    return this.forecastKeywords.some((keyword) => normalized.includes(keyword));
  }

  public extractTargetYear(question: string): number | undefined {
    const match = question.match(/\b(202[6-9]|203\d)\b/);
    if (match) return parseInt(match[1], 10);
    const normalized = this.normalizeText(question);
    if (normalized.includes('annee prochaine') || normalized.includes('an prochain') || normalized.includes('next year')) {
      return new Date().getFullYear() + 1;
    }
    return undefined;
  }

  public applyForecast(
    question: string,
    columns: string[],
    rows: Array<Record<string, string | number>>
  ): ForecastComputation {
    if (!this.isForecastQuestion(question) || !rows.length) {
      return {
        isForecastRequested: false,
        hasSufficientHistory: false,
        historicalCount: rows.length,
        explanation: '',
        enrichedRows: rows,
        enrichedColumns: columns
      };
    }

    const timeCol = this.findTimeColumn(columns, rows);
    const metricCol = this.findMetricColumn(columns, timeCol);

    if (!timeCol || !metricCol) {
      return {
        isForecastRequested: true,
        hasSufficientHistory: false,
        historicalCount: rows.length,
        explanation: 'Impossible d’identifier une dimension temporelle et une métrique numérique dans les résultats pour calculer une prévision.',
        enrichedRows: rows,
        enrichedColumns: columns
      };
    }

    // Extraire les points ordonnés (x, y)
    const points: Array<{ rawX: string | number; numX: number; numY: number; originalRow: Record<string, string | number> }> = [];
    for (const row of rows) {
      const valX = row[timeCol];
      const valY = parseFloat(String(row[metricCol]).replace(/[^0-9.-]/g, ''));
      const numX = this.parseNumericTime(valX);
      if (numX !== undefined && !isNaN(valY)) {
        points.push({ rawX: valX, numX, numY: valY, originalRow: row });
      }
    }

    points.sort((a, b) => a.numX - b.numX);

    if (points.length < 2) {
      const singleYear = points[0]?.rawX || 'actuelle';
      const singleVal = points[0]?.numY || 0;
      return {
        isForecastRequested: true,
        hasSufficientHistory: false,
        timeColumn: timeCol,
        metricColumn: metricCol,
        historicalCount: points.length,
        explanation: `L'historique disponible ne contient qu'une seule période (${singleYear} : ${singleVal}). Au moins deux périodes comparables sont nécessaires pour établir une projection statistique fiable.`,
        enrichedRows: rows,
        enrichedColumns: columns
      };
    }

    // Régression linéaire : y = a * x + b
    const n = points.length;
    let sumX = 0;
    let sumY = 0;
    for (const p of points) {
      sumX += p.numX;
      sumY += p.numY;
    }
    const meanX = sumX / n;
    const meanY = sumY / n;

    let num = 0;
    let den = 0;
    let ssTot = 0;
    for (const p of points) {
      const diffX = p.numX - meanX;
      const diffY = p.numY - meanY;
      num += diffX * diffY;
      den += diffX * diffX;
      ssTot += diffY * diffY;
    }

    const slope = den !== 0 ? num / den : 0;
    const intercept = meanY - slope * meanX;

    // Calcul R²
    let ssRes = 0;
    for (const p of points) {
      const pred = slope * p.numX + intercept;
      ssRes += Math.pow(p.numY - pred, 2);
    }
    const rSquared = ssTot > 0 ? Math.max(0, Math.min(1, 1 - ssRes / ssTot)) : 1;

    // Cible de prévision
    const explicitTargetYear = this.extractTargetYear(question);
    const lastPoint = points[points.length - 1];
    const targetX = explicitTargetYear !== undefined ? explicitTargetYear : lastPoint.numX + 1;
    const targetLabel = String(targetX);

    const rawPrediction = slope * targetX + intercept;
    const predictedValue = Math.max(0, Math.round(rawPrediction * 100) / 100);

    // Taux de croissance global (CAGR)
    const firstPoint = points[0];
    const yearsDiff = lastPoint.numX - firstPoint.numX;
    let cagrPercent: number | undefined;
    if (yearsDiff > 0 && firstPoint.numY > 0) {
      cagrPercent = Math.round((Math.pow(lastPoint.numY / firstPoint.numY, 1 / yearsDiff) - 1) * 1000) / 10;
    }

    // Formatage de l'explication
    const slopeDirection = slope >= 0 ? `+${slope.toFixed(1)}` : `${slope.toFixed(1)}`;
    const explanation = `Projection statistique pour ${targetLabel} : sur la base de l'historique ${firstPoint.numX}-${lastPoint.numX} (tendance de ${slopeDirection} par période, R² = ${rSquared.toFixed(2)}), le volume estimé s'établit à ${predictedValue.toLocaleString('fr-FR')}.`;

    // Enrichir les lignes pour affichage dans le tableau et le graphique
    const enrichedRows: Array<Record<string, string | number>> = rows.map((row) => ({
      ...row,
      Type: 'Historique'
    }));

    const forecastRow: Record<string, string | number> = {
      [timeCol]: `${targetLabel} (Prévision)`,
      [metricCol]: predictedValue,
      Type: 'Prévision'
    };

    enrichedRows.push(forecastRow);

    const enrichedColumns = columns.includes('Type') ? columns : [...columns, 'Type'];

    return {
      isForecastRequested: true,
      hasSufficientHistory: true,
      targetPeriodLabel: targetLabel,
      timeColumn: timeCol,
      metricColumn: metricCol,
      historicalCount: points.length,
      predictedValue,
      rSquared: Math.round(rSquared * 100) / 100,
      slope: Math.round(slope * 100) / 100,
      cagrPercent,
      explanation,
      enrichedRows,
      enrichedColumns
    };
  }

  private findTimeColumn(columns: string[], rows: Array<Record<string, string | number>>): string | undefined {
    const timeCandidates = ['annee', 'year', 'date', 'mois', 'month', 'period', 'full_date'];
    for (const cand of timeCandidates) {
      const found = columns.find((c) => this.normalizeText(c).includes(cand));
      if (found) return found;
    }
    // Chercher par inspection des valeurs
    if (rows.length) {
      for (const col of columns) {
        const val = rows[0][col];
        if (this.parseNumericTime(val) !== undefined) return col;
      }
    }
    return columns[0];
  }

  private findMetricColumn(columns: string[], timeColumn?: string): string | undefined {
    const metricCandidates = ['nombre_ventes', 'quantite_vendue', 'chiffre_affaires', 'total_amount', 'quantity', 'sales', 'profit', 'ca'];
    for (const cand of metricCandidates) {
      const found = columns.find((c) => this.normalizeText(c).includes(cand));
      if (found && found !== timeColumn) return found;
    }
    return columns.find((c) => c !== timeColumn);
  }

  private parseNumericTime(value: unknown): number | undefined {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const yearMatch = value.match(/\b(19\d\d|20\d\d)\b/);
      if (yearMatch) return parseInt(yearMatch[1], 10);
      const num = parseFloat(value);
      if (!isNaN(num) && num > 1900 && num < 2100) return num;
    }
    return undefined;
  }

  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }
}
