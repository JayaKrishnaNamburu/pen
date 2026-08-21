import { collectToolExecutionOutput } from "@input/pen-core";
import type {
  ApplyOptions,
  DocumentOp,
  Editor,
  OpOrigin,
  TextStreamWriter,
  ToolContext,
} from "@input/pen-types";
import {
  authorizeAIToolCall,
  denyAIToolCall,
  isAIToolCallDenied,
  type AIToolAuthorityReason,
  type AIToolCallDenied,
  type AIToolTurn,
} from "./authority";
import { AI_TOOL_READ_ONLY_MUTATION_CODE } from "./constants";
import type { AIToolRuntime } from "./types";

export type OpenAIToolCall =
  | { ok: false; denial: AIToolCallDenied }
  | { ok: true; close: (output?: unknown) => unknown };

/**
 * Authorize a model-driven tool call and install the write guard without
 * executing the handler. Transports stream `executeTool` themselves so
 * they can abort mid-iterable; they must not call `executeTool` unless
 * this returns `{ ok: true }`.
 */
export async function openAIToolCall(
  toolRuntime: AIToolRuntime,
  name: string,
  input: unknown,
  context: ToolContext,
  turn?: AIToolTurn,
): Promise<OpenAIToolCall> {
  if (!turn) {
    const authorization = await authorizeAIToolCall(
      name,
      input,
      toolRuntime.getTool(name),
      { allowedMutatingTools: [] },
    );
    if (!authorization.allowed || authorization.destructive) {
      return {
        ok: false,
        denial: denyAIToolCall(
          "blocked",
          authorization.reason ?? "tool-not-allowed",
        ),
      };
    }
    return openGuardedCall(name, context, authorization.mutating);
  }

  if (turn.ended) {
    turn.markStatus("turn-ended", turn.reason ?? "budget-calls-exhausted");
    return {
      ok: false,
      denial: denyAIToolCall(
        "turn-ended",
        turn.reason ?? "budget-calls-exhausted",
      ),
    };
  }

  const authorization = await authorizeAIToolCall(
    name,
    input,
    toolRuntime.getTool(name),
    turn.grant,
  );

  if (!turn.tryRecordCall()) {
    turn.markStatus("turn-ended", turn.reason ?? "budget-calls-exhausted");
    return {
      ok: false,
      denial: denyAIToolCall(
        "turn-ended",
        turn.reason ?? "budget-calls-exhausted",
      ),
    };
  }

  if (!authorization.allowed) {
    turn.closeCall();
    return {
      ok: false,
      denial: finishDeniedCall(
        turn,
        authorization.reason ?? "tool-not-allowed",
      ),
    };
  }

  if (authorization.diagnostic) {
    emitAuthorityDiagnostic(context, authorization.diagnostic);
  }

  return openGuardedCall(name, context, authorization.mutating, turn);
}

export async function executeAITool(
  toolRuntime: AIToolRuntime,
  name: string,
  input: unknown,
  context: ToolContext,
  turn?: AIToolTurn,
  onPart?: (part: unknown, output: unknown) => void,
): Promise<unknown> {
  const opened = await openAIToolCall(
    toolRuntime,
    name,
    input,
    context,
    turn,
  );
  if (!opened.ok) {
    return opened.denial;
  }
  try {
    const output = await collectToolExecutionOutput(
      toolRuntime.executeTool(name, input, context),
      onPart,
    );
    return opened.close(output);
  } catch (error) {
    opened.close();
    throw error;
  }
}

function resolveToolEditor(context: ToolContext): Editor | null {
  try {
    return context.editor ?? null;
  } catch {
    return null;
  }
}

function openGuardedCall(
  name: string,
  context: ToolContext,
  mutating: boolean,
  turn?: AIToolTurn,
): Extract<OpenAIToolCall, { ok: true }> {
  let readOnlyMutation = false;
  let closed = false;
  const editor = resolveToolEditor(context);
  const restoreWrites = editor
    ? guardEditorWrites(editor, {
        mutating,
        turn,
        onReadOnlyMutation: () => {
          if (readOnlyMutation) {
            return;
          }
          readOnlyMutation = true;
          emitAuthorityDiagnostic(context, {
            code: AI_TOOL_READ_ONLY_MUTATION_CODE,
            message: `Read-only tool "${name}" attempted a document write and was refused.`,
          });
        },
      })
    : () => {};
  return {
    ok: true,
    close: (output?: unknown) => {
      if (!closed) {
        closed = true;
        restoreWrites();
        turn?.closeCall();
      }
      if (readOnlyMutation) {
        return turn
          ? finishDeniedCall(turn, "tool-not-allowed")
          : denyAIToolCall("blocked", "tool-not-allowed");
      }
      if (isAIToolCallDenied(output)) {
        return turn ? finishDeniedCall(turn, output.reason) : output;
      }
      if (turn) {
        if (turn.ended) {
          turn.markStatus("executed", turn.reason ?? undefined);
        } else {
          turn.markStatus("executed");
        }
      }
      return output;
    },
  };
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

function guardEditorWrites(
  editor: Editor,
  options: {
    mutating: boolean;
    turn?: AIToolTurn;
    onReadOnlyMutation: () => void;
  },
): () => void {
  const restoreApply = patchEditorApply(editor, options);
  const restoreStream = patchEditorOpenTextStream(editor, options);
  return () => {
    restoreStream();
    restoreApply();
  };
}

function patchEditorApply(
  editor: Editor,
  options: {
    mutating: boolean;
    turn?: AIToolTurn;
    onReadOnlyMutation: () => void;
  },
): () => void {
  const apply = editor.apply;
  if (typeof apply !== "function") {
    return () => {};
  }
  const originalApply = apply.bind(editor);
  editor.apply = (ops: DocumentOp[], applyOptions?: ApplyOptions) => {
    if (!options.mutating) {
      if (ops.length > 0) {
        options.onReadOnlyMutation();
      }
      return;
    }
    const turn = options.turn;
    if (!turn) {
      originalApply(ops, applyOptions);
      return;
    }
    const accepted = turn.recordOps(ops.length);
    if (accepted <= 0) {
      return;
    }
    originalApply(
      accepted < ops.length ? ops.slice(0, accepted) : ops,
      applyOptionsWithTurn(applyOptions, turn),
    );
  };
  return () => {
    editor.apply = originalApply;
  };
}

function patchEditorOpenTextStream(
  editor: Editor,
  options: {
    mutating: boolean;
    turn?: AIToolTurn;
    onReadOnlyMutation: () => void;
  },
): () => void {
  const openTextStream = editor.openTextStream;
  if (typeof openTextStream !== "function") {
    return () => {};
  }
  const originalOpen = openTextStream.bind(editor);
  editor.openTextStream = (target, streamOptions) => {
    if (!options.mutating) {
      options.onReadOnlyMutation();
      return refuseTextStreamWriter(target.blockId);
    }
    const turn = options.turn;
    if (!turn?.groupId) {
      return originalOpen(target, streamOptions);
    }
    return originalOpen(target, {
      ...streamOptions,
      origin: originWithGroupId(streamOptions.origin, turn.groupId),
    });
  };
  return () => {
    editor.openTextStream = originalOpen;
  };
}

function refuseTextStreamWriter(blockId: string): TextStreamWriter {
  return {
    append() {},
    splice() {},
    get position() {
      return { blockId, offset: 0 };
    },
    flush() {},
    close() {},
    abort() {},
  };
}

function applyOptionsWithTurn(
  options: ApplyOptions | undefined,
  turn: AIToolTurn,
): ApplyOptions {
  const groupId = turn.groupId;
  if (!groupId) {
    return options ?? {};
  }
  return {
    ...options,
    origin: originWithGroupId(options?.origin, groupId),
    groupId: options?.groupId ?? groupId,
    undoGroupId: options?.undoGroupId ?? groupId,
  };
}

function originWithGroupId(
  origin: OpOrigin | undefined,
  groupId: string,
): OpOrigin {
  if (typeof origin === "string") {
    return { type: origin, groupId };
  }
  if (origin) {
    return { ...origin, groupId: origin.groupId ?? groupId };
  }
  return { type: "ai", groupId };
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
