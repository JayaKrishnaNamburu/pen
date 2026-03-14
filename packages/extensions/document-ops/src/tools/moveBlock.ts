import type { Editor, ToolDefinition, Position } from "@pen/types";
import { POSITION_SCHEMA } from "../constants/toolSchemas";
import { assertToolCanMutateBlock } from "../utils/mutationPolicy";

export function moveBlockTool(editor: Editor): ToolDefinition {
  return {
    name: "move_block",
    description: "Move a block to a new position.",
    inputSchema: {
      type: "object",
      required: ["blockId", "position"],
      properties: {
        blockId: { type: "string" },
        position: POSITION_SCHEMA,
      },
    },
    handler: async (input: unknown) => {
      const opts = input as {
        blockId: string;
        position: Position;
      };
      assertToolCanMutateBlock(editor, opts.blockId);
      editor.apply(
        [
          {
            type: "move-block",
            blockId: opts.blockId,
            position: opts.position,
          },
        ],
        { origin: "ai" },
      );
      return { success: true };
    },
  };
}
