import type { Extension } from "@pen/types";
import { defineExtension } from "@pen/types";
import { StreamingTargetImpl } from "./streamingTarget";

interface DeferredSchemaEngine {
  markDirty(blockId: string): void;
  deferBlock(blockId: string): void;
  undeferBlock(blockId: string): void;
}

export interface DeltaStreamOptions {
  batchInterval?: number;
}

export function deltaStreamExtension(
  _options?: DeltaStreamOptions,
): Extension {
  let streamingTarget: StreamingTargetImpl | null = null;

  return defineExtension({
    name: "delta-stream",

    activateClient: async (ctx) => {
      const engine =
        ctx.editor.internals.engine as unknown as DeferredSchemaEngine;
      streamingTarget = new StreamingTargetImpl(
        ctx.editor,
        engine,
      );

      ctx.editor.internals.setSlot(
        "delta-stream:target",
        streamingTarget,
      );
    },

    deactivateClient: async () => {
      if (streamingTarget?.generationZone) {
        streamingTarget.endStreaming("error");
      }
      streamingTarget = null;
    },
  });
}
