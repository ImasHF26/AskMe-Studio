import { Injectable } from '@nestjs/common';
import type { ConversationContext, ConversationIntent } from './conversation-memory.service';

export interface FollowUpResolution {
  isFollowUp: boolean;
  resolvedQuestion?: string;
  action: 'answer_from_memory' | 'reuse_context_generate_sql' | 'new_question';
  inheritedIntent?: ConversationIntent;
  answer?: string;
}

@Injectable()
export class ConversationContextResolver {
  resolveFollowUp(question: string, previousContext?: ConversationContext): FollowUpResolution {
    if (!previousContext) {
      return { isFollowUp: false, action: 'new_question' };
    }

    const normalized = this.normalize(question);
    if (!this.hasFollowUpSignal(normalized)) {
      return { isFollowUp: false, action: 'new_question' };
    }

    if (this.isNameFollowUp(normalized) && previousContext.lastIntent?.entity === 'client') {
      const clientName = this.extractClientName(previousContext.lastResultPreview || []);
      if (clientName) {
        console.log('[conversation-context] answer from memory');
        return {
          isFollowUp: true,
          action: 'answer_from_memory',
          answer: `Le client concerné est : ${clientName}.`,
          inheritedIntent: previousContext.lastIntent
        };
      }

      console.log('[conversation-context] context reused for SQL');
      return {
        isFollowUp: true,
        action: 'reuse_context_generate_sql',
        resolvedQuestion: this.resolveQuestion(question, previousContext),
        inheritedIntent: { ...previousContext.lastIntent }
      };
    }

    if (
      (this.hasAny(normalized, ['departement', 'travaille t il', 'travaille', 'service']) || this.isNameFollowUp(normalized)) &&
      (previousContext.lastIntent?.entity === 'employe' || String(previousContext.lastQuestion).toLowerCase().includes('employe'))
    ) {
      const dept = this.findValue(previousContext.lastResultPreview?.[0] || {}, ['departement', 'nom_departement', 'service']);
      if (dept) {
        console.log('[conversation-context] answer from memory');
        return {
          isFollowUp: true,
          action: 'answer_from_memory',
          answer: `L'employé concerné travaille dans le département ${dept}.`,
          inheritedIntent: previousContext.lastIntent
        };
      }
    }

    if (this.isChartFollowUp(normalized)) {
      console.log('[conversation-context] answer from memory');
      return {
        isFollowUp: true,
        action: 'answer_from_memory',
        answer: previousContext.lastSql
          ? 'Je peux réutiliser le dernier résultat pour l’afficher en graphique.'
          : previousContext.lastAnswer || 'Je peux réutiliser le dernier résultat disponible.',
        inheritedIntent: previousContext.lastIntent
      };
    }

    const inheritedIntent: ConversationIntent = {
      ...(previousContext.lastIntent || {})
    };

    if (this.hasAny(normalized, ['et par region', 'par region'])) inheritedIntent.groupBy = ['region'];
    if (this.hasAny(normalized, ['et par mois', 'par mois'])) inheritedIntent.groupBy = ['mois'];
    if (this.hasAny(normalized, ['compare avec l annee precedente', 'annee precedente'])) {
      inheritedIntent.groupBy = Array.from(new Set([...(inheritedIntent.groupBy || []), 'temps']));
    }
    if (this.hasAny(normalized, ['top 10'])) {
      inheritedIntent.ranking = true;
      inheritedIntent.sort = inheritedIntent.sort || 'desc';
      inheritedIntent.topN = 10;
    }

    console.log('[conversation-context] follow-up detected');
    return {
      isFollowUp: true,
      action: 'reuse_context_generate_sql',
      resolvedQuestion: this.resolveQuestion(question, previousContext, inheritedIntent),
      inheritedIntent
    };
  }

  private resolveQuestion(question: string, previousContext: ConversationContext, inheritedIntent?: ConversationIntent) {
    const normalized = this.normalize(question);
    const metric = inheritedIntent?.metric || previousContext.lastIntent?.metric || 'la dernière mesure';

    if (this.hasAny(normalized, ['et par region', 'par region'])) return `${previousContext.lastQuestion} par région`;
    if (this.hasAny(normalized, ['et par mois', 'par mois'])) return `${previousContext.lastQuestion} par mois`;
    if (this.hasAny(normalized, ['top 10'])) return `Top 10 pour ${previousContext.lastQuestion}`;
    if (this.hasAny(normalized, ['les autres'])) return `Les autres résultats pour ${previousContext.lastQuestion}`;
    if (this.hasAny(normalized, ['pourquoi'])) return `Explique ${previousContext.lastQuestion}`;
    if (this.isNameFollowUp(normalized)) return `Quel est le nom du ${previousContext.lastIntent?.entity || 'résultat'} pour ${metric} ?`;
    return `${previousContext.lastQuestion}. Suivi utilisateur : ${question}`;
  }

  private hasFollowUpSignal(normalized: string) {
    return this.hasAny(normalized, [
      'son nom',
      'sa valeur',
      'ses ventes',
      'ce client',
      'ce produit',
      'cette region',
      'ce resultat',
      'detaille',
      'donne moi le detail',
      'et par region',
      'et par mois',
      'affiche le en graphique',
      'compare avec l annee precedente',
      'top 10',
      'les autres',
      'pourquoi',
      'c est qui',
      'qui est ce',
      'quel departement',
      'dans quel departement',
      'departement',
      'travaille t il',
      'travaille'
    ]);
  }

  private isNameFollowUp(normalized: string) {
    return this.hasAny(normalized, ['son nom', 'quel est son nom', 'c est qui', 'qui est ce']);
  }

  private isChartFollowUp(normalized: string) {
    return this.hasAny(normalized, ['affiche le en graphique', 'graphique', 'visualise', 'visualisation']);
  }

  private extractClientName(rows: Array<Record<string, unknown>>) {
    const first = rows[0];
    if (!first) return undefined;
    const nom = this.findValue(first, ['nom_client', 'client_nom', 'nom', 'client']);
    const prenom = this.findValue(first, ['prenom_client', 'client_prenom', 'prenom']);
    return [nom, prenom].filter(Boolean).join(' ').trim() || undefined;
  }

  private findValue(row: Record<string, unknown>, candidates: string[]) {
    const entries = Object.entries(row);
    for (const candidate of candidates) {
      const found = entries.find(([key]) => this.normalize(key) === this.normalize(candidate));
      if (found && found[1] !== null && found[1] !== undefined) return String(found[1]);
    }
    return undefined;
  }

  private hasAny(value: string, needles: string[]) {
    return needles.some((needle) => value.includes(this.normalize(needle)));
  }

  private normalize(value: string) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[’']/g, ' ')
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ');
  }
}
