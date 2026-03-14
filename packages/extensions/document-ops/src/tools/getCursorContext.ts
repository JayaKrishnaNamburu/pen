import type { Editor, ToolDefinition } from "@pen/types";
import { buildCursorContext } from "../utils/documentContext";

export function getCursorContextTool(editor: Editor): ToolDefinition {
	return {
		name: "get_cursor_context",
		description:
			"Get the current selection, active block, and nearby block previews without reading the full document.",
		inputSchema: {
			type: "object",
			properties: {
				includeSuggestions: {
					type: "boolean",
					default: false,
				},
			},
		},
		handler: async (input: unknown) => {
			const options = (input ?? {}) as Record<string, unknown>;
			return buildCursorContext(
				editor,
				options.includeSuggestions === true ? "raw" : "resolved",
			);
		},
	};
}
