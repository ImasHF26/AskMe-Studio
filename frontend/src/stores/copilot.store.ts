import { defineStore } from 'pinia';
import { apiClient } from '../services/api/client';
import type {
  ChatAnswerInfo,
  ChatMessage,
  ChatSessionDetail,
  ChatSessionSummary,
  QueryExecuteResponse,
  QueryGenerateResponse,
  TextToSqlProvider
} from '../types';
import { getAskMeSessionId, resetAskMeSessionId, setAskMeSessionId } from '../utils/askmeSession';

interface QueryHistoryItem {
  id: string;
  question: string;
  sql: string;
  createdAt: string;
}

const TEXT_TO_SQL_PROVIDER_KEY = 'askme_text_to_sql_provider';
const SESSION_MESSAGES_PREFIX = 'askme_chat_messages_';

const normalizeTextToSqlProvider = (value: unknown): TextToSqlProvider => {
  return value === 'static' || value === 'ollama' || value === 'groq' || value === 'openrouter' || value === 'auto'
    ? value
    : 'groq';
};

export const useCopilotStore = defineStore('copilot', {
  state: () => ({
    loading: false,
    loadingHistory: false,
    loadingSessions: false,
    error: '' as string,
    historyError: '' as string,
    sessionsError: '' as string,
    currentQuestion: '' as string,
    currentSessionId: getAskMeSessionId(),
    generatedSql: '' as string,
    confidence: 0,
    reasoning: '' as string,
    textToSqlProvider: normalizeTextToSqlProvider(localStorage.getItem(TEXT_TO_SQL_PROVIDER_KEY)),
    result: null as QueryExecuteResponse | null,
    messages: [] as ChatMessage[],
    sessions: [] as ChatSessionSummary[],
    history: [] as QueryHistoryItem[]
  }),
  actions: {
    setTextToSqlProvider(provider: TextToSqlProvider) {
      this.textToSqlProvider = normalizeTextToSqlProvider(provider);
      localStorage.setItem(TEXT_TO_SQL_PROVIDER_KEY, this.textToSqlProvider);
    },

    addMessage(
      role: 'user' | 'assistant',
      text: string,
      answerInfo?: ChatAnswerInfo,
      result?: QueryExecuteResponse
    ) {
      this.messages.push({
        id: `m_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
        role,
        text,
        createdAt: new Date().toISOString(),
        answerInfo,
        result
      });
    },

    async fetchHistory() {
      this.loadingHistory = true;
      this.historyError = '';
      try {
        const response = await apiClient.get<QueryHistoryItem[]>('/query/history');
        this.history = response.data;
      } catch (error) {
        this.historyError = 'Failed to load query history.';
      } finally {
        this.loadingHistory = false;
      }
    },

    async loadSessions() {
      this.loadingSessions = true;
      this.sessionsError = '';
      try {
        const response = await apiClient.get<ChatSessionSummary[]>('/copilot/sessions');
        this.sessions = response.data;
      } catch (error) {
        // Fallback to local session metadata if backend is offline
        const localList: ChatSessionSummary[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(SESSION_MESSAGES_PREFIX)) {
            const sid = key.replace(SESSION_MESSAGES_PREFIX, '');
            try {
              const parsed = JSON.parse(localStorage.getItem(key) || '[]');
              const firstUser = parsed.find((m: ChatMessage) => m.role === 'user');
              localList.push({
                id: sid,
                title: firstUser?.text ? firstUser.text.slice(0, 60) : 'Conversation locale',
                messageCount: parsed.length,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              });
            } catch {
              // Ignore corrupted entry
            }
          }
        }
        if (localList.length) {
          this.sessions = localList;
        }
      } finally {
        this.loadingSessions = false;
      }
    },

    async loadCurrentSession() {
      const sessionId = this.currentSessionId || getAskMeSessionId();
      this.currentSessionId = sessionId;

      // 1. Try local cache first for instant UI response
      const localRaw = localStorage.getItem(`${SESSION_MESSAGES_PREFIX}${sessionId}`);
      if (localRaw) {
        try {
          this.messages = JSON.parse(localRaw);
        } catch {
          // ignore parsing error
        }
      }

      // 2. Try remote API to get fresh session state
      try {
        const res = await apiClient.get<ChatSessionDetail>(`/copilot/sessions/${sessionId}`);
        if (res.data && Array.isArray(res.data.messages) && res.data.messages.length > 0) {
          this.messages = res.data.messages as ChatMessage[];
          localStorage.setItem(`${SESSION_MESSAGES_PREFIX}${sessionId}`, JSON.stringify(this.messages));
        }
      } catch {
        // Local cache remains active
      }
    },

    async switchSession(sessionId: string) {
      if (this.currentSessionId === sessionId && this.messages.length > 0) return;
      this.currentSessionId = sessionId;
      setAskMeSessionId(sessionId);
      this.result = null;
      this.error = '';

      // 1. Try local cache
      const localRaw = localStorage.getItem(`${SESSION_MESSAGES_PREFIX}${sessionId}`);
      if (localRaw) {
        try {
          this.messages = JSON.parse(localRaw);
        } catch {
          this.messages = [];
        }
      } else {
        this.messages = [];
      }

      // 2. Refresh from server
      try {
        const res = await apiClient.get<ChatSessionDetail>(`/copilot/sessions/${sessionId}`);
        if (res.data && Array.isArray(res.data.messages)) {
          this.messages = res.data.messages as ChatMessage[];
          localStorage.setItem(`${SESSION_MESSAGES_PREFIX}${sessionId}`, JSON.stringify(this.messages));
        }
      } catch {
        // Keep local messages
      }
    },

    createNewSession() {
      const newSid = resetAskMeSessionId();
      this.currentSessionId = newSid;
      this.messages = [];
      this.result = null;
      this.error = '';
      this.generatedSql = '';
      this.reasoning = '';
    },

    async deleteSession(sessionId: string) {
      try {
        await apiClient.delete(`/copilot/sessions/${sessionId}`);
      } catch {
        // Ignore network delete error
      }
      localStorage.removeItem(`${SESSION_MESSAGES_PREFIX}${sessionId}`);
      this.sessions = this.sessions.filter((s) => s.id !== sessionId);

      if (this.currentSessionId === sessionId) {
        this.createNewSession();
      }
    },

    async persistActiveSession(datasourceId?: string) {
      const sessionId = this.currentSessionId || getAskMeSessionId();
      if (!this.messages.length) return;

      // 1. Persist to localStorage immediately
      try {
        localStorage.setItem(`${SESSION_MESSAGES_PREFIX}${sessionId}`, JSON.stringify(this.messages));
      } catch {
        // quota exceeded or storage error
      }

      // 2. Persist to Backend API
      const firstUserMsg = this.messages.find((m) => m.role === 'user');
      const title = firstUserMsg?.text ? firstUserMsg.text.slice(0, 60) : 'Conversation AskMe';
      try {
        await apiClient.post('/copilot/sessions', {
          id: sessionId,
          datasourceId,
          title,
          messages: this.messages
        });
        await this.loadSessions();
      } catch {
        // Keep local copy
      }
    },

    async runQuestion(question: string, datasourceId?: string) {
      this.loading = true;
      this.error = '';
      this.currentQuestion = question;
      this.result = null;
      this.addMessage('user', question);

      try {
        const sessionId = this.currentSessionId || getAskMeSessionId();
        const generated = await apiClient.post<QueryGenerateResponse>('/copilot/query/generate', {
          question,
          datasourceId,
          sessionId,
          textToSqlProvider: this.textToSqlProvider
        });

        this.generatedSql = generated.data.sql;
        this.confidence = generated.data.confidence;
        this.reasoning = generated.data.reasoning;

        if (generated.data.status !== 'ok' || !generated.data.canExecute) {
          const narrative = generated.data.reasoning || 'AskMe cannot answer this question with the selected data.';
          this.result = {
            status: generated.data.status === 'ok' ? 'ok' : 'cannot_answer',
            columns: [],
            rows: [],
            chartType: 'table',
            narrative,
            executionMs: 0,
            confidence: generated.data.confidence,
            usedEntities: generated.data.usedEntities || [],
            provenance: generated.data.provenance,
            warnings: generated.data.warnings || []
          };
          this.addMessage(
            'assistant',
            narrative,
            {
              question,
              sql: generated.data.sql,
              status: generated.data.status === 'ok' ? 'ok' : generated.data.status,
              chartType: 'table',
              confidence: generated.data.confidence,
              reasoning: generated.data.reasoning,
              executionMs: 0,
              rowsCount: 0,
              columns: [],
              datasourceId,
              warnings: generated.data.warnings || [],
              usedEntities: generated.data.usedEntities || [],
              provenance: generated.data.provenance
            },
            this.result
          );
          await this.persistActiveSession(datasourceId);
          await this.fetchHistory();
          return;
        }

        const executed = await apiClient.post<QueryExecuteResponse>('/copilot/query/execute', {
          question,
          sql: generated.data.sql,
          datasourceId,
          sessionId
        });

        const warnings = Array.from(new Set([...(generated.data.warnings || []), ...(executed.data.warnings || [])]));
        this.result = {
          ...executed.data,
          warnings
        };
        this.addMessage(
          'assistant',
          executed.data.narrative,
          {
            question,
            sql: generated.data.sql,
            status: executed.data.status || 'ok',
            chartType: executed.data.chartType,
            confidence: executed.data.confidence ?? generated.data.confidence,
            reasoning: generated.data.reasoning,
            executionMs: executed.data.executionMs,
            rowsCount: executed.data.rows.length,
            columns: executed.data.columns,
            rows: executed.data.rows,
            datasourceId,
            warnings,
            usedEntities: executed.data.usedEntities || generated.data.usedEntities || [],
            provenance: executed.data.provenance || generated.data.provenance
          },
          this.result
        );
        await this.persistActiveSession(datasourceId);
        await this.fetchHistory();
      } catch (error: any) {
        console.error('[AskMe Copilot] Erreur lors de la requête :', error);
        
        let detailedMessage = 'Une erreur est survenue lors du traitement de votre question.';
        const responseData = error?.response?.data;
        const status = error?.response?.status;

        if (status === 401) {
          detailedMessage = 'Session expirée ou non autorisée. Veuillez vous reconnecter.';
        } else if (status === 400) {
          const validationMsg = Array.isArray(responseData?.message)
            ? responseData.message.join(' | ')
            : responseData?.message;
          detailedMessage = `Requête invalide : ${validationMsg || 'Paramètres incorrects'}.`;
        } else if (status === 404) {
          detailedMessage = 'La ressource ou la source de données demandée est introuvable.';
        } else if (status === 500) {
          detailedMessage = `Erreur interne du serveur : ${responseData?.message || 'Vérifiez la configuration LLM/base de données'}.`;
        } else if (error?.code === 'ERR_NETWORK' || !error?.response) {
          detailedMessage = 'Impossible de contacter l’API Gateway (vérifiez que le backend tourne sur le port 8080).';
        } else if (responseData?.message) {
          detailedMessage = String(responseData.message);
        }

        this.error = detailedMessage;
        this.addMessage('assistant', detailedMessage);
        await this.persistActiveSession(datasourceId);
      } finally {
        this.loading = false;
      }
    }
  }
});
