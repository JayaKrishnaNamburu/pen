import type { PenStreamPart } from "@input/pen-types";
import type { ModelDoubleToolCall } from "./createModelDouble";

/** AIB6 example: generation that aborts after the first delta. */
export function abortHalfwayGenerationParts(): PenStreamPart[] {
	return [
		{ type: "gen-start", zoneId: "zone-1", blockId: "block-1" },
		{ type: "gen-delta", zoneId: "zone-1", delta: "Hello" },
		{ type: "abort", reason: "cancelled" },
	];
}

/** AIB3/AIB6: a hostile turn that requests 100 mutating calls. */
export function hostileMutatingTurnCalls(
	count = 100,
): ModelDoubleToolCall[] {
	return Array.from({ length: count }, (_, index) => {
		const insert = index % 2 === 0;
		return {
			toolCallId: `hostile-${index}`,
			toolName: insert ? "insert_block" : "delete_block",
			input: insert
				? {
						position: "last",
						blockType: "paragraph",
						content: `hostile-${index}`,
					}
				: { blockId: `hostile-missing-${index}` },
		};
	});
}

/** AIB6 example: a tool call that fails before the stream closes. */
export function failingToolCallParts(): PenStreamPart[] {
	return [
		{
			type: "tool-input-available",
			toolCallId: "tool-1",
			toolName: "delete_block",
			input: { blockId: "block-1" },
		},
		{
			type: "tool-error",
			toolCallId: "tool-1",
			error: "tool failed",
		},
		{ type: "done" },
	];
}
