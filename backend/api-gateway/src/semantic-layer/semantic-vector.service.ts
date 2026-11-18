import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import type { Pool, PoolClient } from 'pg';
import { DatabaseService } from '../common/database/database.service';
import { newId } from '../common/utils/id.utils';
import { semanticRetrievalConfig } from '../config/retrieval.config';
import type {
  SemanticColumn,
  SemanticKpi,
  SemanticLayerResponse,
  SemanticSearchEntityType,
  SemanticSearchHit,
  SemanticSynonym,
  SemanticTable
} from './semantic.types';

/**
 * SemanticVectorService — gestion des embeddings textuels, indexation pgvector et reranking MMR.
 *
 * Implémente :
 *  - Encodage 384 dimensions déterministe par hachage SHA-256 et trigrammes (sans dépendance Python externe)
 *  - Recherche vectorielle PostgreSQL (pgvector ivfflat cosinus `<=>`)
 *  - Recherche locale par scoring textuel pondéré
 *  - Reranking MMR (Maximal Marginal Relevance) pour diversifier les entités sélectionnées
 */
@Injectable()
export class SemanticVectorService {
  constructor(private readonly database: DatabaseService) {}

  // ─── Text Processing & Scoring ──────────────────────────────────────────────

  normalizeSearchText(value: string): string {
    const cleaned = value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[_-]+/g, ' ')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return cleaned
      .replace(/\bpaiment\b/g, 'paiement')
      .replace(/\bpaiments\b/g, 'paiements')
      .replace(/\bvante\b/g, 'vente')
      .replace(/\bvantes\b/g, 'ventes')
      .replace(/\bcomande\b/g, 'commande')
      .replace(/\bcomandes\b/g, 'commandes')
      .replace(/\bcategori\b/g, 'categorie')
      .replace(/\bcategoris\b/g, 'categories')
      .replace(/\s+/g, ' ')
      .trim();
  }

  semanticTextScore(normalizedQuestion: string, values: string[]): number {
    return values.reduce((score, value) => {
      const normalized = this.normalizeSearchText(value);
      if (!normalized) return score;
      if (normalizedQuestion.includes(normalized)) return score + 5;
      return (
        score +
        normalized
          .split(' ')
          .filter((part) => part.length > 2 && normalizedQuestion.includes(part)).length
      );
    }, 0);
  }

  // ─── Embeddings (384 Dimensions) ────────────────────────────────────────────

  embedSemanticText(value: string): number[] {
    const dimensions = 384;
    const vector = new Array<number>(dimensions).fill(0);
    const normalized = this.normalizeSearchText(value);
    const tokens = normalized.split(' ').filter(Boolean);

    for (const token of tokens) {
      const index = this.hashToken(token) % dimensions;
      const sign = this.hashToken(`${token}:sign`) % 2 === 0 ? 1 : -1;
      vector[index] += sign;

      for (const ngram of this.characterNgrams(token, 3)) {
        const ngramIndex = this.hashToken(`ng:${ngram}`) % dimensions;
        vector[ngramIndex] += sign * 0.25;
      }
    }

    const magnitude = Math.sqrt(vector.reduce((sum, item) => sum + item * item, 0)) || 1;
    return vector.map((item) => Number((item / magnitude).toFixed(6)));
  }

  private characterNgrams(value: string, size: number): string[] {
    if (value.length <= size) return [value];
    const grams: string[] = [];
    for (let index = 0; index <= value.length - size; index += 1) {
      grams.push(value.slice(index, index + size));
    }
    return grams;
  }

  private hashToken(value: string): number {
    const hash = createHash('sha256').update(value).digest();
    return hash.readUInt32BE(0);
  }

  toPgVector(vector: number[]): string {
    return `[${vector.join(',')}]`;
  }

  // ─── Search Entries Builder ─────────────────────────────────────────────────

  buildSemanticSearchEntries(layer: SemanticLayerResponse): SemanticSearchHit[] {
    const entries: SemanticSearchHit[] = [];

    for (const table of layer.tables) {
      entries.push(this.buildSemanticTableSearchEntry(table));

      for (const column of table.columns) {
        entries.push(this.buildSemanticColumnSearchEntry(table, column));
      }
    }

    for (const kpi of layer.kpis) {
      entries.push(this.buildSemanticKpiSearchEntry(kpi));
    }

    for (const synonym of layer.synonyms) {
      entries.push(this.buildSemanticSynonymSearchEntry(synonym));
    }

    return entries;
  }

  buildSemanticTableSearchEntry(table: SemanticTable): SemanticSearchHit {
    return {
      entityType: 'table',
      entityId: table.id,
      entityName: table.businessName,
      mappedValue: table.technicalName,
      content: [
        `table ${table.businessName}`,
        `technical ${table.technicalName}`,
        `type ${table.tableType}`,
        table.description
      ].join(' '),
      score: 1,
      metadata: {
        technicalName: table.technicalName,
        businessName: table.businessName,
        tableType: table.tableType
      }
    };
  }

  buildSemanticColumnSearchEntry(table: SemanticTable, column: SemanticColumn): SemanticSearchHit {
    return {
      entityType: 'column',
      entityId: column.id,
      entityName: column.businessName,
      mappedValue: column.technicalName,
      content: [
        `column ${column.businessName}`,
        `technical ${column.technicalName}`,
        `semantic type ${column.semanticType}`,
        `data type ${column.dataType}`,
        `table ${table.businessName}`,
        table.technicalName
      ].join(' '),
      score: 1,
      metadata: {
        tableTechnicalName: table.technicalName,
        tableBusinessName: table.businessName,
        technicalName: column.technicalName,
        businessName: column.businessName,
        semanticType: column.semanticType,
        dataType: column.dataType
      }
    };
  }

  buildSemanticKpiSearchEntry(kpi: SemanticKpi): SemanticSearchHit {
    return {
      entityType: 'kpi',
      entityId: kpi.id,
      entityName: kpi.name,
      mappedValue: kpi.name,
      content: [`kpi ${kpi.name}`, kpi.description, `formula ${kpi.sqlFormula}`, `format ${kpi.formatting}`].join(' '),
      score: 1,
      metadata: {
        name: kpi.name,
        sqlFormula: kpi.sqlFormula,
        formatting: kpi.formatting
      }
    };
  }

  buildSemanticSynonymSearchEntry(synonym: SemanticSynonym): SemanticSearchHit {
    return {
      entityType: 'synonym',
      entityId: synonym.id,
      entityName: synonym.term,
      mappedValue: synonym.mappedValue,
      content: [`synonym ${synonym.term}`, `maps to ${synonym.mappedValue}`].join(' '),
      score: 1,
      metadata: {
        term: synonym.term,
        mappedValue: synonym.mappedValue
      }
    };
  }

  // ─── Search & MMR Reranking ─────────────────────────────────────────────────

  async searchSemanticVectorIndex(
    userId: string,
    datasourceId: string,
    question: string,
    layer: SemanticLayerResponse,
    limit = semanticRetrievalConfig.topK
  ): Promise<SemanticSearchHit[]> {
    if (!question.trim()) return [];
    const requestedLimit = Math.max(1, Math.round(limit || semanticRetrievalConfig.topK));
    const candidateLimit = Math.max(requestedLimit, requestedLimit * 3);

    if (this.database.dbReady && this.database.pool && this.database.semanticVectorReady) {
      try {
        const embedding = this.toPgVector(this.embedSemanticText(question));
        const result = await this.database.pool.query(
          `SELECT entity_type, entity_id, entity_name, mapped_value, content, metadata,
                  1 - (embedding <=> $3::vector) AS score
           FROM app_semantic_search_entries
           WHERE user_id = $1 AND datasource_id = $2
           ORDER BY embedding <=> $3::vector
           LIMIT $4`,
          [userId, datasourceId, embedding, candidateLimit]
        );

        const hits = result.rows
          .map((row) => ({
            entityType: row.entity_type as SemanticSearchEntityType,
            entityId: row.entity_id,
            entityName: row.entity_name,
            mappedValue: row.mapped_value || undefined,
            content: row.content,
            score: Number(row.score || 0),
            metadata: row.metadata || {}
          }))
          .filter((hit) => hit.score >= semanticRetrievalConfig.similarityThreshold);

        return this.applySemanticSearchMmr(hits, requestedLimit);
      } catch (error) {
        console.warn(`Semantic vector search skipped: ${error instanceof Error ? error.message : 'unknown error'}.`);
      }
    }

    return this.searchSemanticLayerLocally(question, layer, requestedLimit);
  }

  searchSemanticLayerLocally(question: string, layer: SemanticLayerResponse, limit: number): SemanticSearchHit[] {
    const normalized = this.normalizeSearchText(question);
    const scored = this.buildSemanticSearchEntries(layer)
      .map((entry) => ({
        ...entry,
        score: this.semanticTextScore(normalized, [entry.entityName, entry.mappedValue || '', entry.content]) / 10
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);
    const thresholded = scored.filter((entry) => entry.score >= semanticRetrievalConfig.similarityThreshold);
    return this.applySemanticSearchMmr(thresholded.length ? thresholded : scored, limit);
  }

  applySemanticSearchMmr(candidates: SemanticSearchHit[], limit: number): SemanticSearchHit[] {
    const remaining = candidates.slice().sort((a, b) => b.score - a.score);
    const selected: SemanticSearchHit[] = [];
    const lambda = Math.min(1, Math.max(0, semanticRetrievalConfig.mmr));
    const vectors = new Map(
      remaining.map((hit) => [
        hit,
        this.embedSemanticText([hit.entityType, hit.entityName, hit.mappedValue || '', hit.content].join(' '))
      ])
    );
    const cosine = (left: number[], right: number[]) =>
      left.reduce((sum, item, index) => sum + item * (right[index] || 0), 0);

    while (remaining.length && selected.length < limit) {
      let bestIndex = 0;
      let bestScore = Number.NEGATIVE_INFINITY;
      for (let index = 0; index < remaining.length; index += 1) {
        const candidate = remaining[index];
        const candidateVector = vectors.get(candidate) || [];
        const duplicatePenalty = selected.reduce((max, item) => {
          if (item.entityType === candidate.entityType && item.entityId === candidate.entityId) return 1;
          return Math.max(max, cosine(candidateVector, vectors.get(item) || []));
        }, 0);
        const mmrScore = lambda * candidate.score - (1 - lambda) * duplicatePenalty;
        if (mmrScore > bestScore) {
          bestScore = mmrScore;
          bestIndex = index;
        }
      }
      selected.push(remaining.splice(bestIndex, 1)[0]);
    }

    return selected;
  }

  // ─── Index Sync & Upsert ────────────────────────────────────────────────────

  async syncSemanticVectorIndex(userId: string, datasourceId: string, layer: SemanticLayerResponse): Promise<void> {
    if (!this.database.dbReady || !this.database.pool || !this.database.semanticVectorReady) return;

    const entries = this.buildSemanticSearchEntries(layer);
    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM app_semantic_search_entries WHERE user_id = $1 AND datasource_id = $2', [
        userId,
        datasourceId
      ]);
      await this.upsertSemanticVectorEntries(userId, datasourceId, entries, client);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      console.warn(`Semantic vector index sync skipped: ${error instanceof Error ? error.message : 'unknown error'}.`);
    } finally {
      client.release();
    }
  }

  async tryUpsertSemanticVectorEntries(
    userId: string,
    datasourceId: string,
    entries: SemanticSearchHit[]
  ): Promise<void> {
    try {
      await this.upsertSemanticVectorEntries(userId, datasourceId, entries);
    } catch (error) {
      console.warn(`Semantic vector upsert skipped: ${error instanceof Error ? error.message : 'unknown error'}.`);
    }
  }

  async upsertSemanticVectorEntries(
    userId: string,
    datasourceId: string,
    entries: SemanticSearchHit[],
    client: Pool | PoolClient = this.database.pool as Pool
  ): Promise<void> {
    if (!entries.length || !this.database.dbReady || !this.database.pool || !this.database.semanticVectorReady) return;

    for (const entry of entries) {
      await client.query(
        `INSERT INTO app_semantic_search_entries
         (id, datasource_id, user_id, entity_type, entity_id, entity_name, mapped_value, content, metadata, embedding)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::vector)
         ON CONFLICT (datasource_id, user_id, entity_type, entity_id)
         DO UPDATE SET
           entity_name = EXCLUDED.entity_name,
           mapped_value = EXCLUDED.mapped_value,
           content = EXCLUDED.content,
           metadata = EXCLUDED.metadata,
           embedding = EXCLUDED.embedding,
           updated_at = now()`,
        [
          newId('sve'),
          datasourceId,
          userId,
          entry.entityType,
          entry.entityId,
          entry.entityName,
          entry.mappedValue || null,
          entry.content,
          JSON.stringify(entry.metadata),
          this.toPgVector(this.embedSemanticText(entry.content))
        ]
      );
    }
  }
}
