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

export async function executeAITool(
  toolRuntime: AIToolRuntime,
  name: string,
  input: unknown,
  context: ToolContext,
  turn?: AIToolTurn,
  onPart?: (part: unknown, output: unknown) => void,
): Promise<unknown> {
  if (!turn) {
    const authorization = await authorizeAIToolCall(
      name,
      input,
      toolRuntime.getTool(name),
      { allowedMutatingTools: [] },
    );
    if (!authorization.allowed || authorization.destructive) {
      return denyAIToolCall(
        "blocked",
        authorization.reason ?? "tool-not-allowed",
      );
    }
    return runToolHandler(
      toolRuntime,
      name,
      input,
      context,
      onPart,
      authorization.mutating,
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

  const output = await runToolHandler(
    toolRuntime,
    name,
    input,
    context,
    onPart,
    authorization.mutating,
    turn,
  );
  turn.closeCall();
  if (isAIToolCallDenied(output)) {
    return finishDeniedCall(turn, output.reason);
  }
  if (turn.ended) {
    turn.markStatus("executed", turn.reason ?? undefined);
  } else {
    turn.markStatus("executed");
  }
  return output;
}

async function runToolHandler(
  toolRuntime: AIToolRuntime,
  name: string,
  input: unknown,
  context: ToolContext,
  onPart: ((part: unknown, output: unknown) => void) | undefined,
  mutating: boolean,
  turn?: AIToolTurn,
): Promise<unknown> {
  let readOnlyMutation = false;
  const restoreWrites = guardEditorWrites(context.editor, {
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
  });
  try {
    const output = await collectToolExecutionOutput(
      toolRuntime.executeTool(name, input, context),
      onPart,
    );
    if (readOnlyMutation) {
      return denyAIToolCall("blocked", "tool-not-allowed");
    }
    return output;
  } finally {
    restoreWrites();
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
