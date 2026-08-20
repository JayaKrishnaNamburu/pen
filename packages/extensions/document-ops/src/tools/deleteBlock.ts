import type { Editor, ToolDefinition } from "@input/pen-types";
import { assertToolCanMutateBlock } from "../utils/mutationPolicy";
import { applyValidatedOps } from "../utils/payloadValidation";

export function deleteBlockTool(editor: Editor): ToolDefinition {
  return {
    name: "delete_block",
    description: "Delete a block from the document.",
    inputSchema: {
      type: "object",
      required: ["blockId"],
      properties: {
        blockId: { type: "string" },
      },
    },
    handler: async (input: unknown) => {
      const opts = input as { blockId: string };
      assertToolCanMutateBlock(editor, opts.blockId);
      applyValidatedOps(
        editor,
        [{ type: "delete-block", blockId: opts.blockId }],
        { origin: "ai" },
      );
      return { success: true };
    },
  };
}
