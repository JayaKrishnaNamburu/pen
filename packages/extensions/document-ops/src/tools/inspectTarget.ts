import type { Editor, ToolDefinition } from "@pen/types";
import { inspectStructuredTarget } from "../utils/structuredTargets";

export function inspectTargetTool(editor: Editor): ToolDefinition {
	return {
		name: "inspect_target",
		description:
			"Inspect the active block or a specific block id to learn its schema-aware target details and valid operations.",
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
			const target = inspectStructuredTarget(
				editor,
				typeof options.blockId === "string" ? options.blockId : null,
			);

			return {
				target,
			};
		},
	};
}
