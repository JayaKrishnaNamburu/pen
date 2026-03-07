import type { SSEEvent } from "./types.js";

export function parseSSELine(
  line: string,
  pending: Partial<SSEEvent>,
): { event: SSEEvent | null; pending: Partial<SSEEvent> } {
  if (line === "") {
    if (pending.data !== undefined) {
      const event: SSEEvent = {
        data: pending.data,
        id: pending.id,
        event: pending.event,
        retry: pending.retry,
      };
      return { event, pending: {} };
    }
    return { event: null, pending: {} };
  }

  if (line.startsWith(":")) {
    return { event: null, pending };
  }

  const colonIndex = line.indexOf(":");
  if (colonIndex === -1) {
    return { event: null, pending: { ...pending, [line]: "" } };
  }

  const field = line.slice(0, colonIndex);
  const value = line.slice(colonIndex + 1).replace(/^ /, "");

  switch (field) {
    case "data":
      pending.data =
        pending.data !== undefined ? `${pending.data}\n${value}` : value;
      break;
    case "id":
      pending.id = value;
      break;
    case "event":
      pending.event = value;
      break;
    case "retry": {
      const retry = parseInt(value, 10);
      if (!isNaN(retry)) pending.retry = retry;
      break;
    }
  }

  return { event: null, pending };
}

export async function* parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncGenerator<SSEEvent> {
  const decoder = new TextDecoder();
  let buffer = "";
  let pending: Partial<SSEEvent> = {};

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const result = parseSSELine(line, pending);
      pending = result.pending;
      if (result.event) {
        yield result.event;
      }
    }
  }

  if (buffer.length > 0) {
    const result = parseSSELine(buffer, pending);
    if (result.event) yield result.event;
  }
}
