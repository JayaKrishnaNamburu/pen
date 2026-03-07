import type { Editor, ToolDefinition } from "@pen/types";

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
      editor.apply(
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
