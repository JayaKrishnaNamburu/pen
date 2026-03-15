import type { PenStreamPart } from "./stream";
import type { Editor } from "./editor";
import type { Position } from "./ops";
import type { PropSchema } from "./schema";

// ── Tool Registry + Runtime ────────────────────────────────

export interface ToolRegistry {
  registerTool(def: ToolDefinition): void;
  unregisterTool(name: string): void;
  listTools(): readonly ToolDefinition[];
  getTool(name: string): ToolDefinition | null;
}

export interface ToolRuntime extends ToolRegistry {
  executeTool(
    name: string,
    input: unknown,
    ctx: ToolContext,
  ): Promise<unknown> | AsyncIterable<unknown>;
}

/**
 * @deprecated Use `ToolRuntime`.
 */
export interface ToolServer extends ToolRuntime {}

export type ToolExecutionResult =
  | Promise<unknown>
  | AsyncIterable<unknown>;

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: PropSchema;
  handler: (
    input: unknown,
    ctx: ToolContext,
  ) => Promise<unknown> | AsyncIterable<unknown>;
}

// ── Model Adapter ───────────────────────────────────────────

export interface ModelAdapter {
  capabilities?: {
    structuredIntent?: boolean;
  };
  stream(options: {
    messages: ModelMessage[];
    tools: ToolSchema[];
    signal?: AbortSignal;
    requestMode?: string;
  }): AsyncIterable<ModelStreamEvent>;
}

export type ModelStreamEvent =
  | { type: "text-delta"; delta: string }
  | {
      type: "structured-data";
      contract?: "grid" | "app";
      data: unknown;
      final?: boolean;
    }
  | {
      type: "tool-call";
      toolCallId: string;
      toolName: string;
      input: unknown;
    }
  | {
      type: "done";
      usage?: { promptTokens: number; completionTokens: number };
    }
  | { type: "error"; error: unknown };

export interface ToolSchema {
  name: string;
  description: string;
  inputSchema: PropSchema;
}

// ── Model Messages ──────────────────────────────────────────

export interface ModelMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ModelMessagePart[];
  toolCallId?: string;
  toolName?: string;
}

export type ModelMessagePart =
  | { type: "text"; text: string }
  | {
      type: "tool-call";
      toolCallId: string;
      toolName: string;
      input: unknown;
    }
  | {
      type: "tool-result";
      toolCallId: string;
      result: unknown;
      isError?: boolean;
    };

// ── Tool Context ────────────────────────────────────────────

export interface ToolContext {
  readonly editor: Editor;
  readonly docId: string;
  emit(part: PenStreamPart): void;

  insertBlock(
    blockType: string,
    props: Record<string, unknown>,
    position: Position,
  ): string;
  updateBlock(blockId: string, props: Record<string, unknown>): void;
  deleteBlock(blockId: string): void;
  beginStreaming(zoneId: string, blockId: string): void;
  appendDelta(delta: string): void;
  endStreaming(status: "complete" | "cancelled" | "error"): void;
}

export function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    value != null &&
    typeof value === "object" &&
    Symbol.asyncIterator in (value as object)
  );
}

export async function resolveToolExecution(
  result: ToolExecutionResult,
): Promise<unknown | AsyncIterable<unknown>> {
  return await result;
}

export async function collectToolExecutionOutput(
  result: ToolExecutionResult,
  onPart?: (part: unknown, output: unknown) => void,
): Promise<unknown> {
  const resolved = await resolveToolExecution(result);
  if (!isAsyncIterable(resolved)) {
    return resolved;
  }

  const parts: unknown[] = [];
  for await (const part of resolved) {
    parts.push(part);
    onPart?.(part, parts.length <= 1 ? parts[0] : [...parts]);
  }

  return parts.length <= 1 ? parts[0] : parts;
}
