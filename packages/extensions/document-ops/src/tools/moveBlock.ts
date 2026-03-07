import type { Editor, ToolDefinition, Position } from "@pen/types";

export function moveBlockTool(editor: Editor): ToolDefinition {
  return {
    name: "move_block",
    description: "Move a block to a new position.",
    inputSchema: {
      type: "object",
      required: ["blockId", "position"],
      properties: {
        blockId: { type: "string" },
        position: {},
      },
    },
    handler: async (input: unknown) => {
      const opts = input as {
        blockId: string;
        position: Position;
      };
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
