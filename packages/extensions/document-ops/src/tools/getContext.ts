import type { Editor, ToolDefinition } from "@pen/types";

export function getContextTool(editor: Editor): ToolDefinition {
  return {
    name: "get_context",
    description:
      "Get context about the current document and selection.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: async () => {
      const sel = editor.getSelection();
      return {
        blockCount: editor.blockCount(),
        selection: sel,
        selectedText: editor.getSelectedText(),
      };
    },
  };
}
