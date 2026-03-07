import type { Editor, ToolDefinition } from "@pen/types";

export function listBlockTypesTool(editor: Editor): ToolDefinition {
  return {
    name: "list_block_types",
    description:
      "List all available block types in the editor schema.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: async () => {
      const types: Array<{
        type: string;
        content: string;
        props: string[];
      }> = [];

      for (const schema of editor.schema.allBlocks()) {
        types.push({
          type: schema.type,
          content: Array.isArray(schema.content)
            ? "nested"
            : (schema.content as string),
          props: Object.keys(schema.propSchema ?? {}),
        });
      }

      return types;
    },
  };
}
