import type { PenStreamPart } from "./stream";
import type { Editor } from "./editor";
import type { Position } from "./ops";
import type { PropSchema } from "./schema";

// ── Tool Server ─────────────────────────────────────────────

export interface ToolServer {
  registerTool(def: ToolDefinition): void;
  unregisterTool(name: string): void;
  listTools(): readonly ToolDefinition[];
  executeTool(
    name: string,
    input: unknown,
    ctx: ToolContext,
  ): Promise<unknown> | AsyncIterable<unknown>;
}

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
  stream(options: {
    messages: ModelMessage[];
    tools: ToolSchema[];
    signal?: AbortSignal;
  }): AsyncIterable<ModelStreamEvent>;
}

export type ModelStreamEvent =
  | { type: "text-delta"; delta: string }
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
