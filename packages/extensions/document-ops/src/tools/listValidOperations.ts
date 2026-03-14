import type { Editor, ToolDefinition } from "@pen/types";
import {
	inspectStructuredTarget,
	listValidOperationsForTarget,
} from "../utils/structuredTargets";

export function listValidOperationsTool(editor: Editor): ToolDefinition {
	return {
		name: "list_valid_operations",
		description:
			"List the valid schema-aware mutation operations for the active block or a specific block id.",
		inputSchema: {
			type: "object",
			properties: {
				blockId: {
					type: "string",
				},
			},
		},
		handler: async (input: unknown) => {
			const options = (input ?? {}) as Record<string, unknown>;
			const resolvedBlockId =
				typeof options.blockId === "string" ? options.blockId : null;
			const target = inspectStructuredTarget(editor, resolvedBlockId);
			return {
				blockId: target?.blockId ?? resolvedBlockId,
				operations: listValidOperationsForTarget(
					editor,
					resolvedBlockId,
				),
			};
		},
	};
}
