import type { PenStreamRequest, PenStreamPart, ToolServer } from "@pen/core";
import type { SSEServerOptions } from "./types.js";

export function createSSEHandler(
  options: SSEServerOptions,
): (request: Request) => Response | Promise<Response> {
  const { toolServer, editor: _editor, onRequest, onError, pingInterval = 15_000 } = options;

  const streamHistories = new Map<
    string,
    Array<{ id: string; data: string }>
  >();

  return async (request: Request): Promise<Response> => {
    if (request.method === "GET") {
      return handleReconnect(request, streamHistories);
    }

    const body = (await request.json()) as PenStreamRequest;
    onRequest?.(body);

    const streamId = crypto.randomUUID();
    let eventIndex = 0;

    const history: Array<{ id: string; data: string }> = [];
    streamHistories.set(streamId, history);

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let pingTimer: ReturnType<typeof setInterval> | null = null;

        const send = (part: PenStreamPart): void => {
          const id = `${streamId}:${eventIndex++}`;
          const data = JSON.stringify(part);

          history.push({ id, data });
          if (history.length > 1000) history.shift();

          const event = `id: ${id}\ndata: ${data}\n\n`;
          controller.enqueue(encoder.encode(event));
        };

        const sendPing = (): void => {
          send({ type: "ping" } as PenStreamPart);
        };

        try {
          pingTimer = setInterval(sendPing, pingInterval);

          if (toolServer && body.toolCalls) {
            for (const toolCall of body.toolCalls) {
              const result = toolServer.executeTool(
                toolCall.name,
                toolCall.input,
                { toolCallId: toolCall.toolCallId, ...body.context } as any,
              );

              if (isAsyncIterable(result)) {
                for await (const part of result) {
                  send(part as PenStreamPart);
                }
              } else {
                const resolved = await result;
                send({
                  type: "tool-output",
                  toolCallId: toolCall.toolCallId,
                  output: resolved,
                } as PenStreamPart);
              }
            }
          }

          send({ type: "done" } as PenStreamPart);
        } catch (error) {
          onError?.(error);
          send({
            type: "error",
            errorText:
              error instanceof Error ? error.message : String(error),
          } as PenStreamPart);
        } finally {
          if (pingTimer) clearInterval(pingTimer);
          controller.close();
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Stream-Id": streamId,
      },
    });
  };
}

function handleReconnect(
  request: Request,
  _streamHistories: Map<string, Array<{ id: string; data: string }>>,
): Response {
  const lastEventId = request.headers.get("Last-Event-ID");
  if (!lastEventId) {
    return new Response("Missing Last-Event-ID", { status: 400 });
  }

  return new Response("Replay not supported for this transport", {
    status: 501,
    headers: { "X-Replay-Supported": "false" },
  });
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    value != null &&
    typeof value === "object" &&
    Symbol.asyncIterator in (value as object)
  );
}
