import { describe, expect, it } from "vitest";
import type { SelectionState } from "@pen/types";
import { AutocompleteContinuationState } from "../continuationState";
import type { AutocompleteStructuredCandidate } from "../structuredCandidate";

const candidate: AutocompleteStructuredCandidate = {
	rawText: " world",
	inlineText: " world",
	appendedBlocks: [],
	previewBlocks: [],
};

function textSelection(blockId: string, offset: number): SelectionState {
	return {
		type: "text",
		anchor: { blockId, offset },
		focus: { blockId, offset },
		isCollapsed: true,
		isMultiBlock: false,
		blockRange: [blockId],
		toRange: () => {
			throw new Error("not needed for continuation state tests");
		},
	};
}

describe("AutocompleteContinuationState", () => {
	it("activates a prefetched continuation only for the accepted caret", () => {
		const state = new AutocompleteContinuationState();
		state.setPendingAcceptedContinuation({
			sourceRequestId: "request-1",
			blockId: "block-1",
			startOffset: 6,
			continuationDepth: 1,
		});
		state.setPrefetchedContinuation({
			sourceRequestId: "request-1",
			requestId: "request-2",
			blockId: "block-1",
			startOffset: 6,
			candidate,
			continuationDepth: 1,
		});

		expect(
			state.activatePendingAcceptedContinuation(
				textSelection("block-1", 5),
			),
		).toBeNull();

		const activated = state.activatePendingAcceptedContinuation(
			textSelection("block-1", 6),
		);

		expect(activated).toMatchObject({
			requestId: "request-2",
			blockId: "block-1",
			startOffset: 6,
			continuationDepth: 1,
		});
		expect(state.sequence).toBe(activated);
	});

	it("consumes only the AI commit caused by accepting a sequence segment", () => {
		const state = new AutocompleteContinuationState();

		expect(state.consumeAcceptedAiCommit("ai")).toBe(false);

		state.beginAcceptingSequenceSegment();
		expect(state.consumeAcceptedAiCommit("user")).toBe(false);
		expect(state.consumeAcceptedAiCommit("ai")).toBe(true);
		expect(state.consumeAcceptedAiCommit("ai")).toBe(false);
	});
});
