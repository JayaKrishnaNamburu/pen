import type { Editor, ToolDefinition } from "@input/pen-types";
import { assertToolCanMutateBlock } from "../utils/mutationPolicy";
import { applyValidatedOps } from "../utils/payloadValidation";

export function updateBlockTool(editor: Editor): ToolDefinition {
  return {
    name: "update_block",
    description: "Update a block's properties.",
    inputSchema: {
      type: "object",
      required: ["blockId", "props"],
      properties: {
        blockId: { type: "string" },
        props: { type: "object" },
      },
    },
    handler: async (input: unknown) => {
      const opts = input as {
        blockId: string;
        props: Record<string, unknown>;
      };
      assertToolCanMutateBlock(editor, opts.blockId);
      applyValidatedOps(
        editor,
        [
          {
            type: "update-block",
            blockId: opts.blockId,
            props: opts.props,
          },
        ],
        { origin: "ai" },
      );
      return { success: true };
    },
  };
}
