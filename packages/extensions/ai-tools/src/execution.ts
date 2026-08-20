import {
  collectToolExecutionOutput,
  type ApplyOptions,
  type DocumentOp,
  type Editor,
  type ToolContext,
} from "@input/pen-types";
import {
  authorizeAIToolCall,
  denyAIToolCall,
  type AIToolAuthorityReason,
  type AIToolCallDenied,
  type AIToolTurn,
} from "./authority";
import type { AIToolRuntime } from "./types";

export async function executeAITool(
  toolRuntime: AIToolRuntime,
  name: string,
  input: unknown,
  context: ToolContext,
  turn?: AIToolTurn,
): Promise<unknown> {
  if (!turn) {
    return collectToolExecutionOutput(
      toolRuntime.executeTool(name, input, context),
    );
  }

  if (turn.ended) {
    turn.markStatus("turn-ended", turn.reason ?? "budget-calls-exhausted");
    return denyAIToolCall("turn-ended", turn.reason ?? "budget-calls-exhausted");
  }

  const authorization = await authorizeAIToolCall(
    name,
    input,
    toolRuntime.getTool(name),
    turn.grant,
  );

  if (!turn.tryRecordCall()) {
    turn.markStatus("turn-ended", turn.reason ?? "budget-calls-exhausted");
    return denyAIToolCall("turn-ended", turn.reason ?? "budget-calls-exhausted");
  }

  if (!authorization.allowed) {
    turn.closeCall();
    return finishDeniedCall(turn, authorization.reason ?? "tool-not-allowed");
  }

  if (authorization.diagnostic) {
    emitAuthorityDiagnostic(context, authorization.diagnostic);
  }

  const restoreApply = meterEditorApply(context.editor, turn);
  try {
    const output = await collectToolExecutionOutput(
      toolRuntime.executeTool(name, input, context),
    );
    turn.closeCall();
    if (turn.ended) {
      turn.markStatus("executed", turn.reason ?? undefined);
    } else {
      turn.markStatus("executed");
    }
    return output;
  } finally {
    restoreApply();
  }
}

function finishDeniedCall(
  turn: AIToolTurn,
  reason: AIToolAuthorityReason,
): AIToolCallDenied {
  if (turn.ended) {
    turn.markStatus("turn-ended", turn.reason ?? reason);
    return denyAIToolCall("turn-ended", turn.reason ?? reason);
  }
  turn.markStatus("blocked", reason);
  return denyAIToolCall("blocked", reason);
}

function meterEditorApply(editor: Editor, turn: AIToolTurn): () => void {
  const apply = editor.apply;
  if (typeof apply !== "function") {
    return () => {};
  }
  const originalApply = apply.bind(editor);
  editor.apply = (ops: DocumentOp[], options?: ApplyOptions) => {
    const accepted = turn.recordOps(ops.length);
    if (accepted <= 0) {
      return;
    }
    originalApply(
      accepted < ops.length ? ops.slice(0, accepted) : ops,
      options,
    );
  };
  return () => {
    editor.apply = originalApply;
  };
}

function emitAuthorityDiagnostic(
  context: ToolContext,
  diagnostic: { code: string; message: string },
): void {
  context.editor.internals?.emit?.("diagnostic", {
    code: diagnostic.code,
    level: "info",
    source: "ai-tools",
    message: diagnostic.message,
    extension: "ai-tools",
  });
}
