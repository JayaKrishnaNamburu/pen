import type { AppPlacement } from "./block";
import type { Position } from "./ops";
import type { SelectionState } from "./selection";
import type { LayoutProps } from "./layout";
import type { ModelMessage, ToolSchema } from "./tools";

// ── Stream Part Union ───────────────────────────────────────

export type PenStreamPart =
  | GenStartPart
  | GenDeltaPart
  | GenEndPart
  | BlockInsertPart
  | BlockUpdatePart
  | BlockDeletePart
  | BlockMovePart
  | LayoutUpdatePart
  | AppCreatePart
  | AppUpdatePart
  | AppDeletePart
  | StepStartPart
  | StepEndPart
  | ToolInputStartPart
  | ToolInputDeltaPart
  | ToolInputAvailablePart
  | ToolOutputPart
  | ToolErrorPart
  | DataPart
  | ErrorPart
  | AbortPart
  | PingPart
  | DonePart;

// ── Generation parts ────────────────────────────────────────

export interface GenStartPart {
  type: "gen-start";
  zoneId: string;
  blockId: string;
}
export interface GenDeltaPart {
  type: "gen-delta";
  zoneId: string;
  delta: string;
}
export interface GenEndPart {
  type: "gen-end";
  zoneId: string;
  status: "complete" | "cancelled" | "error";
}

// ── Block parts ─────────────────────────────────────────────

export interface BlockInsertPart {
  type: "block-insert";
  blockId: string;
  blockType: string;
  props?: Record<string, unknown>;
  position: Position;
}
export interface BlockUpdatePart {
  type: "block-update";
  blockId: string;
  props: Record<string, unknown>;
}
export interface BlockDeletePart {
  type: "block-delete";
  blockId: string;
}
export interface BlockMovePart {
  type: "block-move";
  blockId: string;
  position: Position;
}

// ── Layout parts ────────────────────────────────────────────

export interface LayoutUpdatePart {
  type: "layout-update";
  blockId: string;
  layout: Partial<LayoutProps>;
}

// ── App parts ───────────────────────────────────────────────

export interface AppCreatePart {
  type: "app-create";
  appId: string;
  appType: string;
  config: Record<string, unknown>;
  placement: AppPlacement;
}
export interface AppUpdatePart {
  type: "app-update";
  appId: string;
  patch: Record<string, unknown>;
}
export interface AppDeletePart {
  type: "app-delete";
  appId: string;
}

// ── Step parts ──────────────────────────────────────────────

export interface StepStartPart {
  type: "step-start";
  stepIndex: number;
  label?: string;
}
export interface StepEndPart {
  type: "step-end";
  stepIndex: number;
}

// ── Tool parts ──────────────────────────────────────────────

export interface ToolInputStartPart {
  type: "tool-input-start";
  toolCallId: string;
  toolName: string;
}
export interface ToolInputDeltaPart {
  type: "tool-input-delta";
  toolCallId: string;
  inputDelta: string;
}
export interface ToolInputAvailablePart {
  type: "tool-input-available";
  toolCallId: string;
  toolName: string;
  input: unknown;
}
export interface ToolOutputPart {
  type: "tool-output";
  toolCallId: string;
  output: unknown;
}
export interface ToolErrorPart {
  type: "tool-error";
  toolCallId: string;
  error: string;
}

// ── Data / control parts ────────────────────────────────────

export interface DataPart {
  type: `data-${string}`;
  id?: string;
  data: unknown;
  transient?: boolean;
}
export interface ErrorPart {
  type: "error";
  errorText: string;
  code?: string;
}
export interface AbortPart {
  type: "abort";
  reason: string;
}
export interface PingPart {
  type: "ping";
}
export interface DonePart {
  type: "done";
}

// ── Stream Request ──────────────────────────────────────────

export interface PenStreamRequest {
  prompt: string;
  context?: {
    editor?: unknown;
    docId?: string;
    selection?: SelectionState;
    blockId?: string;
  };
  tools?: ToolSchema[];
  toolCalls?: Array<{
    toolCallId: string;
    name: string;
    input: unknown;
  }>;
  messages?: ModelMessage[];
  signal?: AbortSignal;
  streamId?: string;
}
