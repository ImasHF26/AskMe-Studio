import { Injectable } from '@nestjs/common';
import { BUSINESS_SECTOR_PROFILES } from './business-sectors.config';
import type {
  SemanticBusinessSector,
  SemanticColumnProposal,
  SemanticKpiProposal,
  SemanticSynonymProposal
} from './semantic.types';

export interface McpEnrichColumnResult {
  technicalName: string;
  tableTechnicalName: string;
  suggestedBusinessName: string;
  description: string;
  exampleQuestions: string[];
}

export interface McpEnrichKpiResult {
  name: string;
  sqlFormula: string;
  description: string;
  formatting: 'currency' | 'number' | 'percent' | 'integer';
  insight: string;
}

export interface McpEnrichSynonymResult {
  term: string;
  mappedValue: string;
  rationale: string;
}

export interface McpEnrichmentResponse {
  columns: McpEnrichColumnResult[];
  kpis: McpEnrichKpiResult[];
  synonyms: McpEnrichSynonymResult[];
  sectorInsights: string[];
  provider: string;
  model: string;
}

export interface McpEnrichRequest {
  datasourceId: string;
  businessSector: SemanticBusinessSector;
  language: 'fr' | 'en' | 'ar';
  columns: SemanticColumnProposal[];
  kpis: SemanticKpiProposal[];
  synonyms: SemanticSynonymProposal[];
  provider?: 'auto' | 'groq' | 'ollama' | 'openrouter';
}

@Injectable()
export class SemanticMcpEnricherService {
  // ─── Public entry point ────────────────────────────────────────────────────

  async enrich(req: McpEnrichRequest): Promise<McpEnrichmentResponse> {
    const sectorProfile = BUSINESS_SECTOR_PROFILES[req.businessSector];
    const provider = this.resolveProvider(req.provider);

    const systemPrompt = this.buildSystemPrompt(req.language, sectorProfile.label, sectorProfile.description);
    const userPrompt = this.buildUserPrompt(req, sectorProfile);

    let rawContent: string;
    let usedModel = '';

    try {
      const result = await this.callLlm(provider, systemPrompt, userPrompt);
      rawContent = result.content;
      usedModel = result.model;
    } catch (err) {
      // Fallback to heuristic enrichment when LLM is unavailable
      return this.heuristicFallback(req, sectorProfile.label, provider, String(err));
    }

    return this.parseResponse(rawContent, req, sectorProfile.label, provider, usedModel);
  }

  // ─── LLM provider routing ─────────────────────────────────────────────────

  private resolveProvider(requested?: string): 'groq' | 'ollama' | 'openrouter' {
    if (requested && requested !== 'auto') return requested as 'groq' | 'ollama' | 'openrouter';
    const groqKey = process.env.GROQ_API_KEY;
    if (groqKey && groqKey !== 'change-me') return 'groq';
    const openrouterKey = process.env.OPENROUTER_API_KEY;
    if (openrouterKey && openrouterKey !== 'change-me') return 'openrouter';
    return 'ollama';
  }

  private async callLlm(
    provider: 'groq' | 'ollama' | 'openrouter',
    systemPrompt: string,
    userPrompt: string
  ): Promise<{ content: string; model: string }> {
    if (provider === 'groq') return this.callGroq(systemPrompt, userPrompt);
    if (provider === 'openrouter') return this.callOpenRouter(systemPrompt, userPrompt);
    return this.callOllama(systemPrompt, userPrompt);
  }

  private async callGroq(systemPrompt: string, userPrompt: string): Promise<{ content: string; model: string }> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || apiKey === 'change-me') throw new Error('GROQ_API_KEY not configured');
    const model = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          temperature: 0.3,
          max_tokens: 3000,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ]
        })
      });
      if (!response.ok) throw new Error(`Groq returned ${response.status}`);
      const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return { content: String(body.choices?.[0]?.message?.content || '').trim(), model };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async callOpenRouter(systemPrompt: string, userPrompt: string): Promise<{ content: string; model: string }> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey || apiKey === 'change-me') throw new Error('OPENROUTER_API_KEY not configured');
    const model = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
    const baseUrl = String(process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
          'X-Title': 'AskMe Studio Semantic MCP'
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          temperature: 0.3,
          max_tokens: 3000,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ]
        })
      });
      if (!response.ok) throw new Error(`OpenRouter returned ${response.status}`);
      const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return { content: String(body.choices?.[0]?.message?.content || '').trim(), model };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async callOllama(systemPrompt: string, userPrompt: string): Promise<{ content: string; model: string }> {
    const ollamaUrl = String(process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/+$/, '');
    const model = process.env.OLLAMA_MODEL || 'qwen2.5-coder:7b';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    try {
      const response = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          stream: false,
          format: 'json',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ]
        })
      });
      if (!response.ok) throw new Error(`Ollama returned ${response.status}`);
      const body = (await response.json()) as { message?: { content?: string }; response?: string };
      return { content: String(body.message?.content || body.response || '').trim(), model };
    } finally {
      clearTimeout(timeout);
    }
  }

  // ─── Prompt engineering ────────────────────────────────────────────────────

  private buildSystemPrompt(language: string, sectorLabel: string, sectorDescription: string): string {
    const langInstruction =
      language === 'fr'
        ? 'Réponds en français. Tous les noms métier, descriptions et insights doivent être en français.'
        : language === 'ar'
          ? 'Réponds en arabe. Tous les noms métier, descriptions et insights doivent être en arabe.'
          : 'Reply in English. All business names, descriptions and insights must be in English.';

    return [
      'You are AskMe Studio Semantic MCP Enricher — a Business Intelligence modeling expert.',
      `You specialize in the domain: ${sectorLabel}. ${sectorDescription}`,
      langInstruction,
      'Your role: enrich a semantic layer (columns, KPIs, synonyms) with meaningful business names, descriptions, and insights.',
      'Return ONLY valid JSON matching the output schema. Do not wrap in Markdown code blocks.',
      'Be concise, precise and business-oriented. No hallucination. Base everything on the column/table names provided.',
      'For columns: suggest clear business names based on technical names and data types.',
      'For KPIs: suggest relevant SQL aggregate formulas using the available columns.',
      'For synonyms: suggest natural language aliases that users would type in a chatbot.',
      'For insights: provide 3-5 high-value analytical questions users should ask about this data.'
    ].join('\n');
  }

  private buildUserPrompt(req: McpEnrichRequest, sectorProfile: ReturnType<typeof BUSINESS_SECTOR_PROFILES[SemanticBusinessSector]>): string {
    // Build a compact representation of the current semantic content
    const columnSummary = req.columns.slice(0, 60).map((c) => ({
      table: c.tableTechnicalName,
      technical: c.technicalName,
      currentBusiness: c.businessName,
      dataType: c.dataType,
      semanticType: c.semanticType
    }));

    const kpiSummary = req.kpis.slice(0, 20).map((k) => ({
      name: k.name,
      formula: k.sqlFormula
    }));

    const synonymSummary = req.synonyms.slice(0, 30).map((s) => ({
      term: s.term,
      mappedValue: s.mappedValue
    }));

    const sectorSynonyms = Object.entries(sectorProfile.synonyms || {})
      .slice(0, 8)
      .map(([key, vals]) => `${key}: ${(vals as string[]).join(', ')}`)
      .join(' | ');

    const metricAliases = sectorProfile.metricAliases
      .slice(0, 4)
      .map((m) => `${m.totalName} (keywords: ${m.keywords.join(',')})`)
      .join(' | ');

    return JSON.stringify(
      {
        context: {
          sector: sectorProfile.code,
          sectorLabel: sectorProfile.label,
          language: req.language,
          knownSectorSynonyms: sectorSynonyms,
          knownMetricAliases: metricAliases
        },
        currentColumns: columnSummary,
        currentKpis: kpiSummary,
        currentSynonyms: synonymSummary,
        task: 'Enrich the semantic layer for this business sector. Suggest improved names, descriptions, new KPIs relevant to the sector, and useful synonyms.',
        outputSchema: {
          columns: [
            {
              technicalName: 'exact match from input',
              tableTechnicalName: 'exact match from input',
              suggestedBusinessName: 'clear business label in user language',
              description: '1-sentence business description',
              exampleQuestions: ['question 1 a user might ask about this column', 'question 2']
            }
          ],
          kpis: [
            {
              name: 'KPI name',
              sqlFormula: 'SQL aggregate formula using existing column technical names',
              description: '1-sentence description',
              formatting: 'currency | number | percent | integer',
              insight: '1-sentence business insight about this KPI'
            }
          ],
          synonyms: [
            {
              term: 'user-typed term / acronym',
              mappedValue: 'technical column or table name it maps to',
              rationale: '1-sentence why this synonym is useful'
            }
          ],
          sectorInsights: [
            'High-value analytical question 1 relevant to this sector and dataset',
            'High-value analytical question 2',
            'High-value analytical question 3'
          ]
        }
      },
      null,
      2
    );
  }

  // ─── Response parsing ──────────────────────────────────────────────────────

  private parseResponse(
    raw: string,
    req: McpEnrichRequest,
    sectorLabel: string,
    provider: string,
    model: string
  ): McpEnrichmentResponse {
    let parsed: Record<string, unknown>;
    try {
      // Strip markdown code fences if present
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
      parsed = JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      return this.heuristicFallback(req, sectorLabel, provider, 'LLM returned invalid JSON');
    }

    const toStr = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
    const toArr = (v: unknown): string[] => (Array.isArray(v) ? v.map(toStr).filter(Boolean) : []);

    const columns: McpEnrichColumnResult[] = this.asArray(parsed.columns).map((item) => ({
      technicalName: toStr(item.technicalName),
      tableTechnicalName: toStr(item.tableTechnicalName),
      suggestedBusinessName: toStr(item.suggestedBusinessName),
      description: toStr(item.description),
      exampleQuestions: toArr(item.exampleQuestions).slice(0, 3)
    }));

    const kpis: McpEnrichKpiResult[] = this.asArray(parsed.kpis).map((item) => ({
      name: toStr(item.name),
      sqlFormula: toStr(item.sqlFormula),
      description: toStr(item.description),
      formatting: (['currency', 'number', 'percent', 'integer'].includes(toStr(item.formatting))
        ? toStr(item.formatting)
        : 'number') as McpEnrichKpiResult['formatting'],
      insight: toStr(item.insight)
    }));

    const synonyms: McpEnrichSynonymResult[] = this.asArray(parsed.synonyms).map((item) => ({
      term: toStr(item.term),
      mappedValue: toStr(item.mappedValue),
      rationale: toStr(item.rationale)
    }));

    const sectorInsights = toArr(parsed.sectorInsights).slice(0, 6);

    return { columns, kpis, synonyms, sectorInsights, provider, model };
  }

  // ─── Heuristic fallback (no LLM) ──────────────────────────────────────────

  private heuristicFallback(
    req: McpEnrichRequest,
    sectorLabel: string,
    provider: string,
    errorMsg: string
  ): McpEnrichmentResponse {
    const sectorProfile = BUSINESS_SECTOR_PROFILES[req.businessSector];

    // Enrich columns from technical naming heuristics
    const columns: McpEnrichColumnResult[] = req.columns.slice(0, 40).map((col) => {
      const suggestedBusinessName = col.businessName || this.inferBusinessName(col.technicalName, req.language);
      return {
        technicalName: col.technicalName,
        tableTechnicalName: col.tableTechnicalName,
        suggestedBusinessName,
        description: this.inferColumnDescription(col, req.language),
        exampleQuestions: this.inferExampleQuestions(col, req.language)
      };
    });

    // Suggest KPIs from sector metric aliases
    const kpis: McpEnrichKpiResult[] = sectorProfile.metricAliases.slice(0, 4).map((alias) => {
      const measureCol = req.columns.find((c) =>
        alias.keywords.some((kw) => c.technicalName.toLowerCase().includes(kw))
      );
      const formula = measureCol ? `SUM(${measureCol.technicalName})` : `COUNT(*)`;
      return {
        name: alias.totalName,
        sqlFormula: formula,
        description: alias.totalDescription,
        formatting: alias.formatting || 'number',
        insight: req.language === 'fr'
          ? `Analyser ${alias.totalName.toLowerCase()} permet de piloter la performance opérationnelle.`
          : `Tracking ${alias.totalName} helps drive operational performance.`
      };
    });

    // Build synonyms from sector vocabulary
    const synonyms: McpEnrichSynonymResult[] = [];
    for (const [concept, aliases] of Object.entries(sectorProfile.synonyms || {})) {
      const matchingCol = req.columns.find((c) =>
        c.technicalName.toLowerCase().includes(concept) ||
        c.businessName.toLowerCase().includes(concept)
      );
      if (matchingCol) {
        for (const alias of (aliases as string[]).slice(0, 2)) {
          synonyms.push({
            term: alias,
            mappedValue: matchingCol.technicalName,
            rationale: req.language === 'fr'
              ? `Alias naturel pour ${matchingCol.businessName || matchingCol.technicalName}.`
              : `Natural alias for ${matchingCol.businessName || matchingCol.technicalName}.`
          });
        }
      }
    }

    const sectorInsights =
      req.language === 'fr'
        ? [
            `Quelle est l'évolution de la performance sur les 12 derniers mois ?`,
            `Quels sont les top 10 éléments selon le volume principal ?`,
            `Comment se répartit l'activité par catégorie ou dimension ?`,
            `Quels indicateurs montrent une dégradation par rapport à la période précédente ?`
          ]
        : [
            `What is the performance trend over the last 12 months?`,
            `Which are the top 10 items by main volume metric?`,
            `How does activity break down by category or dimension?`,
            `Which KPIs show degradation compared to the previous period?`
          ];

    console.warn(`[SemanticMcpEnricher] LLM unavailable (${errorMsg}). Using heuristic fallback.`);
    return { columns, kpis, synonyms, sectorInsights, provider: `${provider}-fallback`, model: 'heuristic' };
  }

  // ─── Local heuristic helpers ───────────────────────────────────────────────

  private inferBusinessName(technicalName: string, language: string): string {
    const clean = technicalName
      .replace(/^(dim_|fact_|f_|d_|t_)/i, '')
      .replace(/[_\-]+/g, ' ')
      .toLowerCase()
      .trim();

    const fr: Record<string, string> = {
      'id': 'Identifiant',
      'date': 'Date',
      'month': 'Mois',
      'year': 'Année',
      'amount': 'Montant',
      'total': 'Total',
      'count': 'Nombre',
      'qty': 'Quantité',
      'quantity': 'Quantité',
      'price': 'Prix',
      'name': 'Nom',
      'code': 'Code',
      'status': 'Statut',
      'type': 'Type',
      'category': 'Catégorie',
      'region': 'Région',
      'country': 'Pays',
      'city': 'Ville',
      'description': 'Description',
      'email': 'Email',
      'phone': 'Téléphone'
    };

    if (language === 'fr') {
      for (const [en, frLabel] of Object.entries(fr)) {
        if (clean.includes(en)) return frLabel;
      }
    }

    return clean.replace(/\b\w/g, (c) => c.toUpperCase());
  }

  private inferColumnDescription(col: SemanticColumnProposal, language: string): string {
    const name = col.businessName || col.technicalName;
    if (language === 'fr') {
      if (col.semanticType === 'measure') return `Mesure numérique représentant ${name.toLowerCase()}.`;
      if (col.semanticType === 'dimension') return `Dimension d'analyse permettant de segmenter par ${name.toLowerCase()}.`;
      if (col.semanticType === 'date') return `Référence temporelle pour les analyses chronologiques.`;
      if (col.semanticType === 'identifier') return `Identifiant unique pour chaque enregistrement.`;
      return `Attribut descriptif : ${name.toLowerCase()}.`;
    }
    if (col.semanticType === 'measure') return `Numeric measure representing ${name.toLowerCase()}.`;
    if (col.semanticType === 'dimension') return `Analysis dimension to segment data by ${name.toLowerCase()}.`;
    if (col.semanticType === 'date') return `Temporal reference for chronological analysis.`;
    return `Descriptive attribute: ${name.toLowerCase()}.`;
  }

  private inferExampleQuestions(col: SemanticColumnProposal, language: string): string[] {
    const name = col.businessName || col.technicalName;
    if (col.semanticType === 'measure') {
      return language === 'fr'
        ? [`Quelle est la somme de ${name} par période ?`, `Quelle est la moyenne de ${name} ?`]
        : [`What is the total ${name} per period?`, `What is the average ${name}?`];
    }
    if (col.semanticType === 'dimension') {
      return language === 'fr'
        ? [`Quelle est la répartition par ${name} ?`, `Quels sont les top 10 par ${name} ?`]
        : [`What is the breakdown by ${name}?`, `What are the top 10 by ${name}?`];
    }
    return [];
  }

  private asArray(v: unknown): Record<string, unknown>[] {
    if (!Array.isArray(v)) return [];
    return v.filter((item) => typeof item === 'object' && item !== null) as Record<string, unknown>[];
  }
}
