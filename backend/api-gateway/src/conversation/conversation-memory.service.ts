import Redis from 'ioredis';
import { Injectable } from '@nestjs/common';

export interface ConversationIntent {
  entity?: string;
  metric?: string;
  aggregation?: string;
  ranking?: boolean;
  sort?: 'asc' | 'desc';
  topN?: number;
  groupBy?: string[];
}

export interface ConversationTurn {
  question: string;
  sql?: string;
  intent?: ConversationIntent | Record<string, unknown>;
  resultSchema?: string[];
  resultPreview?: Array<Record<string, unknown>>;
  answer?: string;
  createdAt: string;
}

export interface ConversationContext {
  sessionId: string;
  datasourceId: string;
  dashboardId?: string;
  lastQuestion: string;
  lastSql?: string;
  lastIntent?: ConversationIntent;
  lastResultSchema?: string[];
  lastResultPreview?: Array<Record<string, unknown>>;
  lastAnswer?: string;
  history?: ConversationTurn[];
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class ConversationMemoryService {
  private readonly ttlSeconds = Number(process.env.CONVERSATION_MEMORY_TTL_SECONDS || 3600);
  private readonly redis?: Redis;
  private readonly fallback = new Map<string, { expiresAt: number; value: ConversationContext }>();

  constructor() {
    const redisUrl = process.env.REDIS_URL;
    const redisHost = process.env.REDIS_HOST;
    const redisPort = Number(process.env.REDIS_PORT || 63179);
    if (!redisUrl && !redisHost) {
      console.warn('[conversation-memory] Redis is not configured; using temporary in-memory fallback.');
      return;
    }

    try {
      const options = {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        retryStrategy: () => null
      };
      this.redis = redisUrl
        ? new Redis(redisUrl, options)
        : new Redis({ host: redisHost, port: redisPort, ...options });
      this.redis.on('error', (error) => {
        console.warn(`[conversation-memory] Redis unavailable: ${error.message}`);
      });
    } catch (error) {
      console.warn(`[conversation-memory] Redis initialization failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  async getContext(sessionId: string): Promise<ConversationContext | undefined> {
    const key = this.key(sessionId);
    try {
      const raw = await this.redis?.get(key);
      if (!raw) {
        console.log(`[conversation-memory] context expired / not found: ${sessionId}`);
        return this.getFallback(sessionId);
      }
      console.log(`[conversation-memory] conversation context loaded: ${sessionId}`);
      return JSON.parse(raw) as ConversationContext;
    } catch (error) {
      console.warn(`[conversation-memory] Redis get failed, using fallback: ${error instanceof Error ? error.message : 'unknown error'}`);
      return this.getFallback(sessionId);
    }
  }

  async saveContext(sessionId: string, context: ConversationContext): Promise<void> {
    const sanitized = this.sanitizeContext({
      ...context,
      sessionId,
      history: (context.history || []).slice(-5),
      lastResultPreview: (context.lastResultPreview || []).slice(0, 5)
    });
    const key = this.key(sessionId);

    try {
      await this.redis?.set(key, JSON.stringify(sanitized), 'EX', this.ttlSeconds);
      console.log(`[conversation-memory] context saved: ${sessionId}`);
    } catch (error) {
      console.warn(`[conversation-memory] Redis save failed, using fallback: ${error instanceof Error ? error.message : 'unknown error'}`);
    }

    this.fallback.set(sessionId, {
      expiresAt: Date.now() + this.ttlSeconds * 1000,
      value: sanitized
    });
  }

  async clearContext(sessionId: string): Promise<void> {
    try {
      await this.redis?.del(this.key(sessionId));
    } catch (error) {
      console.warn(`[conversation-memory] Redis clear failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
    this.fallback.delete(sessionId);
  }

  async appendTurn(sessionId: string, turn: ConversationTurn): Promise<void> {
    const previous = await this.getContext(sessionId);
    if (!previous) return;
    await this.saveContext(sessionId, {
      ...previous,
      history: [...(previous.history || []), this.sanitizeTurn(turn)].slice(-5),
      updatedAt: new Date().toISOString()
    });
  }

  private key(sessionId: string) {
    return `askme:conversation:${sessionId}`;
  }

  private getFallback(sessionId: string) {
    const cached = this.fallback.get(sessionId);
    if (!cached) return undefined;
    if (cached.expiresAt <= Date.now()) {
      this.fallback.delete(sessionId);
      console.log(`[conversation-memory] context expired / not found: ${sessionId}`);
      return undefined;
    }
    console.log(`[conversation-memory] conversation context loaded from fallback: ${sessionId}`);
    return cached.value;
  }

  private sanitizeContext(context: ConversationContext): ConversationContext {
    return {
      ...context,
      lastResultSchema: this.sanitizeSchema(context.lastResultSchema || []),
      lastResultPreview: this.sanitizeRows(context.lastResultPreview || []),
      history: (context.history || []).map((turn) => this.sanitizeTurn(turn)).slice(-5)
    };
  }

  private sanitizeTurn(turn: ConversationTurn): ConversationTurn {
    return {
      ...turn,
      resultSchema: this.sanitizeSchema(turn.resultSchema || []),
      resultPreview: this.sanitizeRows(turn.resultPreview || [])
    };
  }

  private sanitizeSchema(schema: string[]) {
    return schema.filter((column) => !this.isSensitiveColumn(column));
  }

  private sanitizeRows(rows: Array<Record<string, unknown>>) {
    return rows.slice(0, 5).map((row) =>
      Object.fromEntries(Object.entries(row).filter(([column]) => !this.isSensitiveColumn(column)))
    );
  }

  private isSensitiveColumn(column: string) {
    return ['email', 'telephone', 'email_commercial', 'telephone_commercial'].includes(
      String(column || '')
        .toLowerCase()
        .trim()
    );
  }
}
