import type { PenStreamPart } from "@input/pen-types";

/** AIB6 example: generation that aborts after the first delta. */
export function abortHalfwayGenerationParts(): PenStreamPart[] {
	return [
		{ type: "gen-start", zoneId: "zone-1", blockId: "block-1" },
		{ type: "gen-delta", zoneId: "zone-1", delta: "Hello" },
		{ type: "abort", reason: "cancelled" },
	];
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
