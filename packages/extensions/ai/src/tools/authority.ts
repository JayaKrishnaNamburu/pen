import type { ToolDefinition } from "@input/pen-types";
import {
  AI_DESTRUCTIVE_TOOL_NAME_SET,
  AI_READ_ONLY_TOOL_NAME_SET,
  AI_TOOL_MAX_CALLS_PER_TURN,
  AI_TOOL_MAX_OPS_PER_CALL,
  AI_TOOL_MAX_TOTAL_OPS_PER_TURN,
  AI_TOOL_UNCONFIRMED_CODE,
} from "./constants";

export type AIToolConfirmationDecision = "allow" | "refuse" | "defer";

export type AIToolAuthorityReason =
  | "tool-not-allowed"
  | "tool-refused"
  | "tool-confirmation-deferred"
  | "budget-calls-exhausted"
  | "budget-ops-per-call-exhausted"
  | "budget-total-ops-exhausted";

export type AIToolCallStatus = "executed" | "blocked" | "turn-ended";

export interface AIToolConfirmationRequest {
  readonly toolName: string;
  readonly input: unknown;
  readonly destructive: boolean;
}

export type AIToolConfirmFn = (
  request: AIToolConfirmationRequest,
) => AIToolConfirmationDecision | Promise<AIToolConfirmationDecision>;

export interface AIToolGrant {
  readonly allowedMutatingTools: readonly string[];
  readonly confirm?: AIToolConfirmFn;
}

export interface AIToolBudgetLimits {
  readonly maxCallsPerTurn: number;
  readonly maxOpsPerCall: number;
  readonly maxTotalOpsPerTurn: number;
}

export interface AIToolTurnOptions {
  readonly allowedMutatingTools?: readonly string[];
  readonly confirm?: AIToolConfirmFn;
  readonly budget?: Partial<AIToolBudgetLimits>;
  readonly groupId?: string;
}

export interface AIToolAuthorization {
  readonly allowed: boolean;
  readonly mutating: boolean;
  readonly destructive: boolean;
  readonly reason?: Extract<
    AIToolAuthorityReason,
    "tool-not-allowed" | "tool-refused" | "tool-confirmation-deferred"
  >;
  readonly diagnostic?: { code: string; message: string };
}

export interface AIToolCallDenied {
  readonly ok: false;
  readonly status: "blocked" | "turn-ended";
  readonly reason: AIToolAuthorityReason;
}

export interface AIToolTurn {
  readonly grant: AIToolGrant;
  readonly limits: AIToolBudgetLimits;
  readonly groupId: string | null;
  readonly calls: number;
  readonly ops: number;
  readonly ended: boolean;
  readonly reason: AIToolAuthorityReason | null;
  readonly lastStatus: AIToolCallStatus | null;
  tryRecordCall(): boolean;
  recordOps(count: number): number;
  closeCall(): void;
  markStatus(status: AIToolCallStatus, reason?: AIToolAuthorityReason): void;
}

type ToolAuthorityFields = {
  mutating?: boolean;
  destructive?: boolean;
};

export function isMutatingAITool(
  name: string,
  definition?: ToolDefinition | null,
): boolean {
  const explicit = readOptionalBoolean(definition, "mutating");
  if (explicit !== undefined) {
    return explicit;
  }
  return !AI_READ_ONLY_TOOL_NAME_SET.has(name);
}

export function isDestructiveAITool(
  name: string,
  definition?: ToolDefinition | null,
): boolean {
  const explicit = readOptionalBoolean(definition, "destructive");
  if (explicit !== undefined) {
    return explicit;
  }
  return AI_DESTRUCTIVE_TOOL_NAME_SET.has(name);
}

export async function authorizeAIToolCall(
  name: string,
  input: unknown,
  definition: ToolDefinition | null,
  grant: AIToolGrant,
): Promise<AIToolAuthorization> {
  const mutating = isMutatingAITool(name, definition);
  const destructive = isDestructiveAITool(name, definition);
  if (mutating && !grant.allowedMutatingTools.includes(name)) {
    return {
      allowed: false,
      mutating,
      destructive,
      reason: "tool-not-allowed",
    };
  }
  if (!destructive) {
    return { allowed: true, mutating, destructive };
  }
  if (!grant.confirm) {
    return {
      allowed: true,
      mutating,
      destructive,
      diagnostic: {
        code: AI_TOOL_UNCONFIRMED_CODE,
        message: `Destructive tool "${name}" ran without a confirmation resolver.`,
      },
    };
  }

  const decision = await grant.confirm({
    toolName: name,
    input,
    destructive,
  });
  switch (decision) {
    case "allow":
      return { allowed: true, mutating, destructive };
    case "refuse":
      return {
        allowed: false,
        mutating,
        destructive,
        reason: "tool-refused",
      };
    case "defer":
      return {
        allowed: false,
        mutating,
        destructive,
        reason: "tool-confirmation-deferred",
      };
    default: {
      const _exhaustive: never = decision;
      return _exhaustive;
    }
  }
}

export function createAIToolTurn(options: AIToolTurnOptions = {}): AIToolTurn {
  return new AIToolTurnState(options);
}

export function isAIToolCallDenied(value: unknown): value is AIToolCallDenied {
  if (value == null || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<AIToolCallDenied>;
  return (
    candidate.ok === false &&
    (candidate.status === "blocked" || candidate.status === "turn-ended") &&
    typeof candidate.reason === "string"
  );
}

export function denyAIToolCall(
  status: "blocked" | "turn-ended",
  reason: AIToolAuthorityReason,
): AIToolCallDenied {
  return { ok: false, status, reason };
}

class AIToolTurnState implements AIToolTurn {
  readonly grant: AIToolGrant;
  readonly limits: AIToolBudgetLimits;
  readonly groupId: string | null;
  private _calls = 0;
  private _ops = 0;
  private _opsThisCall = 0;
  private _ended = false;
  private _reason: AIToolAuthorityReason | null = null;
  private _lastStatus: AIToolCallStatus | null = null;

  constructor(options: AIToolTurnOptions) {
    this.grant = {
      allowedMutatingTools: options.allowedMutatingTools ?? [],
      confirm: options.confirm,
    };
    this.limits = {
      maxCallsPerTurn:
        options.budget?.maxCallsPerTurn ?? AI_TOOL_MAX_CALLS_PER_TURN,
      maxOpsPerCall: options.budget?.maxOpsPerCall ?? AI_TOOL_MAX_OPS_PER_CALL,
      maxTotalOpsPerTurn:
        options.budget?.maxTotalOpsPerTurn ?? AI_TOOL_MAX_TOTAL_OPS_PER_TURN,
    };
    this.groupId = options.groupId ?? null;
  }

  get calls(): number {
    return this._calls;
  }

  get ops(): number {
    return this._ops;
  }

  get ended(): boolean {
    return this._ended;
  }

  get reason(): AIToolAuthorityReason | null {
    return this._reason;
  }

  get lastStatus(): AIToolCallStatus | null {
    return this._lastStatus;
  }

  tryRecordCall(): boolean {
    this._opsThisCall = 0;
    if (this._ended) {
      return false;
    }
    if (this._calls >= this.limits.maxCallsPerTurn) {
      this.end("budget-calls-exhausted");
      return false;
    }
    this._calls += 1;
    return true;
  }

  recordOps(count: number): number {
    if (count <= 0) {
      return 0;
    }
    const callRoom = this.limits.maxOpsPerCall - this._opsThisCall;
    const turnRoom = this.limits.maxTotalOpsPerTurn - this._ops;
    const allowed = Math.max(0, Math.min(count, callRoom, turnRoom));
    this._opsThisCall += allowed;
    this._ops += allowed;
    if (allowed < count) {
      if (callRoom <= turnRoom) {
        this.end("budget-ops-per-call-exhausted");
      } else {
        this.end("budget-total-ops-exhausted");
      }
    }
    return allowed;
  }

  closeCall(): void {
    if (this._ended) {
      return;
    }
    if (this._calls >= this.limits.maxCallsPerTurn) {
      this.end("budget-calls-exhausted");
    }
  }

  markStatus(status: AIToolCallStatus, reason?: AIToolAuthorityReason): void {
    this._lastStatus = status;
    if (reason && this._ended && !this._reason) {
      this._reason = reason;
    }
    if (status === "turn-ended" && reason) {
      this.end(reason);
    }
  }

  private end(reason: AIToolAuthorityReason): void {
    this._ended = true;
    this._reason = reason;
  }
}

function readOptionalBoolean(
  definition: ToolDefinition | null | undefined,
  key: keyof ToolAuthorityFields,
): boolean | undefined {
  if (definition == null || !(key in definition)) {
    return undefined;
  }
  const value = (definition as ToolDefinition & ToolAuthorityFields)[key];
  return typeof value === "boolean" ? value : undefined;
}
