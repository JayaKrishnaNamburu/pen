import { describe, expect, it } from "vitest";
import type { ChangeSummary, SelectionState } from "@input/pen-types";
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

	it("maps continuation anchors through a summary and drops them on range death", () => {
		const state = new AutocompleteContinuationState();
		state.setSequence({
			requestId: "request-1",
			blockId: "block-1",
			startOffset: 6,
			candidate,
			continuationDepth: 1,
		});

		expect(state.mapThroughSummary(shiftSummary(2))).toBe(true);
		expect(state.sequence).toMatchObject({
			blockId: "block-1",
			startOffset: 8,
		});

		expect(state.mapThroughSummary(deleteSummary())).toBe(false);
		expect(state.sequence).toBeNull();
	});
});

function shiftSummary(insertLength: number): ChangeSummary {
	return {
		commitId: 1,
		originType: "collaborator",
		text: [],
		structural: [],
		isEmpty: false,
		mapOffset(_blockId, offset) {
			return offset + insertLength;
		},
		mapPoint(point) {
			return {
				blockId: point.blockId,
				offset: point.offset + insertLength,
			};
		},
		mapRange(range) {
			return {
				anchor: {
					blockId: range.anchor.blockId,
					offset: range.anchor.offset + insertLength,
				},
				focus: {
					blockId: range.focus.blockId,
					offset: range.focus.offset + insertLength,
				},
			};
		},
		compose() {
			return this;
		},
	};
}

function deleteSummary(): ChangeSummary {
	return {
		...shiftSummary(0),
		mapOffset() {
			return null;
		},
		mapPoint() {
			return null;
		},
		mapRange() {
			return null;
		},
	};
}
