import {
	applyMergeBlocks,
	applySplitBlock,
	createEditor,
} from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema";
import type { SelectionState } from "@input/pen-types";
import { describe, expect, it } from "vitest";
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
	};
}

function createDocumentEditor(text = "Hello world") {
	const editor = createEditor({ schema: defaultSchema });
	const blockId = editor.firstBlock()!.id;
	editor.apply([
		{ type: "splice-text", blockId, from: 0, to: 0, insert: text },
	]);
	return { editor, blockId };
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

	it("keeps a continuation target through an in-block insert", () => {
		const { editor, blockId } = createDocumentEditor();
		const state = new AutocompleteContinuationState();
		state.setSequence(
			{
				requestId: "request-1",
				blockId,
				startOffset: 6,
				candidate,
				continuationDepth: 1,
				requestPrefix: "Hello ",
			},
			editor,
		);

		editor.apply(
			[{ type: "splice-text", blockId, from: 0, to: 0, insert: "xx" }],
			{ origin: { type: "collaborator" } },
		);
		expect(state.syncThroughCommit(editor, editor.lastChangeSummary!)).toBe(
			true,
		);
		expect(state.sequence).toMatchObject({
			blockId,
			startOffset: 8,
		});

		editor.destroy();
	});

	it("drops a continuation when the block is removed", () => {
		const { editor, blockId } = createDocumentEditor();
		editor.apply([
			{
				type: "insert-block",
				blockId: "keep",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
		]);
		const state = new AutocompleteContinuationState();
		state.setSequence(
			{
				requestId: "request-1",
				blockId,
				startOffset: 6,
				candidate,
				continuationDepth: 1,
			},
			editor,
		);

		editor.apply([{ type: "delete-block", blockId }], {
			origin: { type: "collaborator" },
		});
		expect(state.syncThroughCommit(editor, editor.lastChangeSummary!)).toBe(
			false,
		);
		expect(state.sequence).toBeNull();

		editor.destroy();
	});

	it("follows a tail continuation across a split", () => {
		const { editor, blockId } = createDocumentEditor("meadow sage");
		const state = new AutocompleteContinuationState();
		state.setSequence(
			{
				requestId: "request-1",
				blockId,
				startOffset: 9,
				candidate,
				continuationDepth: 1,
			},
			editor,
		);

		applySplitBlock(editor, {
			blockId,
			offset: 6,
			newBlockId: "tail",
			applyOptions: { origin: { type: "collaborator" } },
		});
		expect(state.syncThroughCommit(editor, editor.lastChangeSummary!)).toBe(
			true,
		);
		expect(state.sequence).toMatchObject({
			blockId: "tail",
			startOffset: 3,
		});

		editor.destroy();
	});

	it("follows a continuation across a merge", () => {
		const { editor, blockId } = createDocumentEditor("meadow");
		editor.apply([
			{
				type: "insert-block",
				blockId: "source",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{
				type: "splice-text",
				blockId: "source",
				from: 0,
				to: 0,
				insert: " sage",
			},
		]);
		const state = new AutocompleteContinuationState();
		state.setSequence(
			{
				requestId: "request-1",
				blockId: "source",
				startOffset: 1,
				candidate,
				continuationDepth: 1,
			},
			editor,
		);

		applyMergeBlocks(editor, {
			targetBlockId: blockId,
			sourceBlockId: "source",
			applyOptions: { origin: { type: "collaborator" } },
		});
		expect(state.syncThroughCommit(editor, editor.lastChangeSummary!)).toBe(
			true,
		);
		expect(state.sequence).toMatchObject({
			blockId,
			startOffset: 7,
		});

		editor.destroy();
	});
});
