import type { Editor, Extension } from "@pen/types";
import { defineExtension } from "@pen/types";
import { StreamingTargetImpl } from "./streamingTarget";
import type { DocumentOp, GenerationZone } from "@pen/types";

interface DeferredSchemaEngine {
  markDirty(blockId: string): void;
  deferBlock(blockId: string): void;
  undeferBlock(blockId: string): void;
}

export interface DeltaStreamOptions {
  batchInterval?: number;
}

export function deltaStreamExtension(
  options?: DeltaStreamOptions,
): Extension {
  let editor: Editor | null = null;
  let streamingTarget: StreamingTargetImpl | null = null;
  let unsubscribeApplyBoundary: (() => void) | null = null;
  let isolatingApply = false;

  return defineExtension({
    name: "delta-stream",

    activateClient: async (ctx) => {
      editor = ctx.editor;
      const engine =
        ctx.editor.internals.engine as unknown as DeferredSchemaEngine;
      streamingTarget = new StreamingTargetImpl(
        ctx.editor,
        engine,
        options?.batchInterval,
      );

      ctx.editor.internals.setSlot(
        "delta-stream:target",
        streamingTarget,
      );

      unsubscribeApplyBoundary = ctx.editor.internals.onApplyBoundary((event) => {
        if (event.phase === "before") {
          const activeBlockId = getActiveGenerationBlockId(streamingTarget);
          isolatingApply =
            event.origin === "user" &&
            activeBlockId !== null &&
            targetsOutsideGenerationZone(event.ops, activeBlockId);

          if (isolatingApply) {
            ctx.editor.undoManager.stopCapturing();
          }
          return;
        }

        if (isolatingApply) {
          ctx.editor.undoManager.stopCapturing();
          isolatingApply = false;
        }
      });
    },

    deactivateClient: async () => {
      unsubscribeApplyBoundary?.();
      unsubscribeApplyBoundary = null;
      isolatingApply = false;

      if (streamingTarget?.generationZone) {
        streamingTarget.endStreaming("error");
      }
      editor?.internals.setSlot("delta-stream:target", undefined);
      editor = null;
      streamingTarget = null;
    },
  });
}

function getActiveGenerationBlockId(
  streamingTarget: { generationZone: GenerationZone | null } | null,
): string | null {
  return streamingTarget?.generationZone?.blockId ?? null;
}

function targetsOutsideGenerationZone(
  ops: readonly DocumentOp[],
  activeBlockId: string,
): boolean {
  for (const op of ops) {
    const targetBlockId =
      "blockId" in op
        ? op.blockId
        : "targetBlockId" in op
          ? op.targetBlockId
          : null;

    if (targetBlockId && targetBlockId !== activeBlockId) {
      return true;
    }
  }

  return false;
}
