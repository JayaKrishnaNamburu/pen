import type {
  PenTransport,
  PenStreamRequest,
  PenStreamPart,
  Unsubscribe,
  ToolServer,
} from "@pen/core";

export interface DirectTransportOptions {
  toolServer: ToolServer;
  onError?: (error: unknown) => void;
}

export function directTransport(
  options: DirectTransportOptions,
): PenTransport {
  const { toolServer, onError } = options;
  const activeControllers = new Set<AbortController>();

  const transport: PenTransport = {
    async *stream(
      request: PenStreamRequest,
    ): AsyncGenerator<PenStreamPart> {
      const controller = new AbortController();
      activeControllers.add(controller);
      const signal = controller.signal;

      try {
        for (const toolCall of request.toolCalls ?? []) {
          if (signal.aborted) break;

          const result = toolServer.executeTool(toolCall.name, toolCall.input, {
            toolCallId: toolCall.toolCallId,
            ...request.context,
          } as any);

          if (isAsyncIterable(result)) {
            for await (const part of result) {
              if (signal.aborted) break;
              yield part as PenStreamPart;
            }
          } else {
            const resolved = await result;
            yield {
              type: "tool-output",
              toolCallId: toolCall.toolCallId,
              output: resolved,
            } as PenStreamPart;
          }
        }

        yield { type: "done" } as PenStreamPart;
      } catch (error) {
        onError?.(error);
        yield {
          type: "error",
          errorText: error instanceof Error ? error.message : String(error),
        } as PenStreamPart;
      } finally {
        activeControllers.delete(controller);
      }
    },

    async connect(): Promise<void> {
      // No-op — always connected
    },

    async disconnect(): Promise<void> {
      for (const controller of activeControllers) {
        controller.abort();
      }
      activeControllers.clear();
    },

    get connected(): boolean {
      return true;
    },

    onConnectionChange(
      _callback: (connected: boolean) => void,
    ): Unsubscribe {
      return () => {};
    },
  };

  return transport;
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    value != null &&
    typeof value === "object" &&
    Symbol.asyncIterator in (value as object)
  );
}
