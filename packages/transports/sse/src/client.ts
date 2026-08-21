import type {
  PenTransport,
  PenStreamRequest,
  PenStreamPart,
  Unsubscribe,
} from "@input/pen-types";
import type { SSEClientOptions } from "./types";
import { parseSSEStream } from "./parser";

const MAX_SSE_EVENT_BYTES = 1_048_576;
const textEncoder = new TextEncoder();

export function sseTransport(options: SSEClientOptions): PenTransport {
  const {
    url,
    headers = {},
    pingTimeout = 30_000,
  } = options;

  let isConnected = false;
  let activeAbort: AbortController | null = null;
  const connectionListeners = new Set<(connected: boolean) => void>();

  function setConnected(value: boolean): void {
    if (isConnected === value) return;
    isConnected = value;
    for (const cb of connectionListeners) cb(value);
  }

  const transport: PenTransport = {
    async *stream(
      request: PenStreamRequest,
    ): AsyncGenerator<PenStreamPart> {
      activeAbort = new AbortController();
      const signal = options.signal
        ? composeAbortSignals(options.signal, activeAbort.signal)
        : activeAbort.signal;

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            ...headers,
          },
          body: JSON.stringify(request),
          signal,
        });

        if (!response.ok) {
          yield {
            type: "error",
            errorText: `SSE request failed: ${response.status} ${response.statusText}`,
            code: `HTTP_${response.status}`,
          } as PenStreamPart;
          return;
        }

        if (!response.body) {
          yield {
            type: "error",
            errorText: "SSE response has no body",
            code: "NO_BODY",
          } as PenStreamPart;
          return;
        }

        setConnected(true);
        let pingTimer: ReturnType<typeof setTimeout> | null = null;

        const resetPingTimer = (): void => {
          if (pingTimer) clearTimeout(pingTimer);
          pingTimer = setTimeout(() => {
            setConnected(false);
          }, pingTimeout);
        };
        resetPingTimer();

        const reader = response.body.getReader();
        try {
          for await (const sseEvent of parseSSEStream(reader)) {
            resetPingTimer();

            const decoded = decodeStreamPart(sseEvent.data);
            if (decoded.kind === "drop") {
              yield decoded.error;
              continue;
            }

            const part = decoded.part;
            if (part.type === "ping") continue;

            yield part;

            if (part.type === "done" || part.type === "error") break;
          }
        } finally {
          if (pingTimer) clearTimeout(pingTimer);
          reader.releaseLock();
        }
      } catch (error) {
        if (signal.aborted) return;
        setConnected(false);

        yield {
          type: "error",
          errorText: error instanceof Error ? error.message : String(error),
          code: "NETWORK_ERROR",
        } as PenStreamPart;
      } finally {
        activeAbort = null;
      }
    },

    async connect(): Promise<void> {
      try {
        const response = await fetch(url, {
          method: "HEAD",
          headers,
        });
        setConnected(response.ok);
      } catch {
        // probe fetch failed; stay disconnected.
        setConnected(false);
      }
    },

    async disconnect(): Promise<void> {
      activeAbort?.abort();
      activeAbort = null;
      setConnected(false);
    },

    get connected(): boolean {
      return isConnected;
    },

    onConnectionChange(
      callback: (connected: boolean) => void,
    ): Unsubscribe {
      connectionListeners.add(callback);
      return () => connectionListeners.delete(callback);
    },
  };

  return transport;
}

function decodeStreamPart(
  data: string,
): { kind: "part"; part: PenStreamPart } | { kind: "drop"; error: PenStreamPart } {
  if (textEncoder.encode(data).byteLength > MAX_SSE_EVENT_BYTES) {
    return {
      kind: "drop",
      error: {
        type: "error",
        errorText: "SSE event exceeded the size bound.",
        code: "OVERSIZED_EVENT",
      },
    };
  }

  try {
    const part = JSON.parse(data) as PenStreamPart;
    if (
      typeof part !== "object" ||
      part === null ||
      typeof part.type !== "string"
    ) {
      return {
        kind: "drop",
        error: {
          type: "error",
          errorText: "SSE event was not a stream part.",
          code: "MALFORMED_EVENT",
        },
      };
    }
    return { kind: "part", part };
  } catch {
    return {
      kind: "drop",
      error: {
        type: "error",
        errorText: "SSE event was not valid JSON.",
        code: "MALFORMED_EVENT",
      },
    };
  }
}

function composeAbortSignals(...signals: AbortSignal[]): AbortSignal {
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any(signals);
  }

  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener("abort", () => controller.abort(signal.reason), {
      once: true,
    });
  }
  return controller.signal;
}

