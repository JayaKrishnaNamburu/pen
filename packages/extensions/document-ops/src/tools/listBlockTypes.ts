import type { Editor, ToolDefinition } from "@pen/types";
import { listAvailableToolBlockTypes } from "../utils/structuredTargets";

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
      return listAvailableToolBlockTypes(editor);
    },
  };
}
