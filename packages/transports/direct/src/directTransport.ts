import type {
  PenTransport,
  PenStreamRequest,
  PenStreamPart,
  Unsubscribe,
  ToolServer,
  ToolContext,
  Editor,
  Position,
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

          const result = toolServer.executeTool(
            toolCall.name,
            toolCall.input,
            createTransportToolContext(request.context, () => {}),
          );

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

function createTransportToolContext(
  context: PenStreamRequest["context"],
  emit: (part: PenStreamPart) => void,
): ToolContext {
  let activeZoneId: string | null = null;

  return {
    get editor(): Editor {
      return resolveTransportEditor(context?.editor);
    },
    docId: context?.docId ?? "",
    emit,
    insertBlock(
      blockType: string,
      props: Record<string, unknown>,
      position: Position,
    ): string {
      const editor = resolveTransportEditor(context?.editor);
      const blockId = crypto.randomUUID();

      emit({
        type: "block-insert",
        blockId,
        blockType,
        props,
        position,
      });

      editor.apply(
        [{ type: "insert-block", blockId, blockType, props, position }],
        { origin: "ai" },
      );

      return blockId;
    },
    updateBlock(blockId: string, props: Record<string, unknown>): void {
      const editor = resolveTransportEditor(context?.editor);

      emit({ type: "block-update", blockId, props });
      editor.apply([{ type: "update-block", blockId, props }], {
        origin: "ai",
      });
    },
    deleteBlock(blockId: string): void {
      const editor = resolveTransportEditor(context?.editor);

      emit({ type: "block-delete", blockId });
      editor.apply([{ type: "delete-block", blockId }], { origin: "ai" });
    },
    beginStreaming(zoneId: string, blockId: string): void {
      activeZoneId = zoneId;
      emit({ type: "gen-start", zoneId, blockId });
    },
    appendDelta(delta: string): void {
      if (!activeZoneId) {
        throw new Error("appendDelta() called before beginStreaming()");
      }
      emit({ type: "gen-delta", zoneId: activeZoneId, delta });
    },
    endStreaming(status: "complete" | "cancelled" | "error"): void {
      if (!activeZoneId) {
        throw new Error("endStreaming() called before beginStreaming()");
      }
      emit({ type: "gen-end", zoneId: activeZoneId, status });
      activeZoneId = null;
    },
  };
}

function resolveTransportEditor(editor: unknown): Editor {
  if (isEditor(editor)) {
    return editor;
  }
  throw new Error("Transport tool context requires a valid editor");
}

function isEditor(value: unknown): value is Editor {
  return (
    typeof value === "object" &&
    value !== null &&
    "apply" in value &&
    "internals" in value
  );
}
