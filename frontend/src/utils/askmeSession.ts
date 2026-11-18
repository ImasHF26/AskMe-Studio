const ASKME_SESSION_KEY = 'askme_copilot_session_id';

const createSessionId = () => {
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  return `askme_session_${uuid}`;
};

export const setAskMeSessionId = (sessionId: string) => {
  localStorage.setItem(ASKME_SESSION_KEY, sessionId);
};

export const resetAskMeSessionId = () => {
  const sessionId = createSessionId();
  localStorage.setItem(ASKME_SESSION_KEY, sessionId);
  return sessionId;
};

export const getAskMeSessionId = () => {
  const existing = localStorage.getItem(ASKME_SESSION_KEY);
  if (existing) return existing;
  const sessionId = createSessionId();
  localStorage.setItem(ASKME_SESSION_KEY, sessionId);
  return sessionId;
};
