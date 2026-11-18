export interface ResponseEnvelope<T> {
  success: boolean;
  data: T | null;
  error: string | null;
  meta: {
    requestId: string;
    timestamp: string;
  };
}
