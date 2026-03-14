import { collectToolExecutionOutput, type Editor, type PenStreamPart } from "@pen/types";
import type { StreamingTargetImpl } from "./streamingTarget";
import {
  assertToolCanMutateBlock,
  assertToolCanUseBlockType,
  getDocumentToolRuntime,
  ToolContextImpl,
} from "@pen/document-ops";
import type { ToolRuntimeImpl } from "@pen/document-ops";

export async function processStream(
  stream: AsyncIterable<PenStreamPart>,
  editor: Editor,
  options?: {
    onPart?: (part: PenStreamPart) => void;
    signal?: AbortSignal;
  },
): Promise<void> {
  const streaming = editor.internals.getSlot<StreamingTargetImpl>(
    "delta-stream:target",
  )!;
  const toolRuntime =
    editor.internals.getSlot<ToolRuntimeImpl>(
      "document-ops:toolRuntime",
    ) ?? getDocumentToolRuntime(editor);

  for await (const part of stream) {
    if (options?.signal?.aborted) break;
    options?.onPart?.(part);

    switch (part.type) {
      case "gen-start":
        streaming.beginStreaming(part.zoneId, part.blockId);
        break;

      case "gen-delta":
        streaming.appendDelta(part.delta);
        break;

      case "gen-end":
        streaming.endStreaming(part.status);
        break;

      case "block-insert": {
        const blockId = part.blockId ?? crypto.randomUUID();
        assertToolCanUseBlockType(editor, part.blockType);
        editor.apply(
          [
            {
              type: "insert-block",
              blockId,
              blockType: part.blockType,
              props: part.props ?? {},
              position: part.position,
            },
          ],
          { origin: "ai" },
        );
        break;
      }

      case "block-update":
        assertToolCanMutateBlock(editor, part.blockId);
        editor.apply(
          [
            {
              type: "update-block",
              blockId: part.blockId,
              props: part.props,
            },
          ],
          { origin: "ai" },
        );
        break;

      case "block-delete":
        assertToolCanMutateBlock(editor, part.blockId);
        editor.apply(
          [{ type: "delete-block", blockId: part.blockId }],
          { origin: "ai" },
        );
        break;

      case "block-move":
        assertToolCanMutateBlock(editor, part.blockId);
        editor.apply(
          [
            {
              type: "move-block",
              blockId: part.blockId,
              position: part.position,
            },
          ],
          { origin: "ai" },
        );
        break;

      case "tool-input-available": {
        if (!toolRuntime) break;
        try {
          let emittedProgressiveOutput = false;
          const result = await collectToolExecutionOutput(
            toolRuntime.executeTool(
              part.toolName,
              part.input,
              new ToolContextImpl(editor, "", (emitted) =>
                options?.onPart?.(emitted),
              ),
            ),
            (_toolPart, progressiveOutput) => {
              emittedProgressiveOutput = true;
              options?.onPart?.({
                type: "tool-output",
                toolCallId: part.toolCallId,
                output: progressiveOutput,
              });
            },
          );

          if (!emittedProgressiveOutput) {
            options?.onPart?.({
              type: "tool-output",
              toolCallId: part.toolCallId,
              output: result,
            });
          }
        } catch (err) {
          options?.onPart?.({
            type: "tool-error",
            toolCallId: part.toolCallId,
            error: String(err),
          });
        }
        break;
      }

      case "error":
        if (streaming.generationZone) {
          streaming.endStreaming("error");
        }
        break;

      case "abort":
        if (streaming.generationZone) {
          streaming.endStreaming("cancelled");
        }
        break;

      case "ping":
        break;

      case "done":
        break;

      default: {
        const partType = (part as { type: string }).type;
        if (partType.startsWith("data-")) {
          // Data parts are stored by consumers via onPart callback
        }
        break;
      }
    }
  }

  // Clean up any active generation on stream end
  if (streaming?.generationZone) {
    streaming.endStreaming("error");
  }
}
