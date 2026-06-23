/**
 * Reconnecting EventSource wrapper for GET-based SSE endpoints.
 *
 * NOTE: The sector scan pipeline uses POST + fetch ReadableStream rather than
 * EventSource (because EventSource only supports GET). This utility is provided
 * for any future GET-based SSE endpoints, and as a reference for the
 * reconnection and heartbeat patterns used in the pipeline hook.
 *
 * Heartbeat events emitted by the backend every ~4 seconds reset the retry
 * counter, confirming the connection is alive even during silent periods.
 */

export interface SSEOptions {
  onMessage: (data: unknown) => void;
  onDone: (data: unknown) => void;
  onError: (e: Event) => void;
  maxRetries?: number;
}

export function createReconnectingSSE(url: string, options: SSEOptions) {
  const { onMessage, onDone, onError, maxRetries = 3 } = options;
  let retries = 0;
  let closed = false;
  let es: EventSource;

  function connect() {
    if (closed) return;
    es = new EventSource(url);

    es.onmessage = (e: MessageEvent) => {
      retries = 0;
      try {
        onMessage(JSON.parse(e.data));
      } catch {
        /* ignore malformed frames */
      }
    };

    es.addEventListener("heartbeat", () => {
      retries = 0; // connection is alive — reset retry counter
    });

    es.addEventListener("done", (e: MessageEvent) => {
      closed = true;
      es.close();
      try {
        onDone(JSON.parse(e.data));
      } catch {
        onDone({});
      }
    });

    es.onerror = (e: Event) => {
      if (closed) return;
      es.close();
      if (retries < maxRetries) {
        retries++;
        const delay = Math.min(1000 * retries, 5000);
        setTimeout(connect, delay);
      } else {
        onError(e);
      }
    };
  }

  connect();
  return {
    close: () => {
      closed = true;
      es?.close();
    },
  };
}
