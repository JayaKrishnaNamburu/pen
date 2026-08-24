import { describe, expect, it } from "vitest";
import { buildDocumentMutationPlanExecution } from "../planExecutor";
import { createPlanExecutorEditor } from "./planExecutor.testUtils";

describe("document mutation plan executor", () => {
	it("prefers the lower-op middle alignment when repeated blocks create multiple match options", () => {
			const editor = createPlanExecutorEditor();
			const firstId = editor.firstBlock()!.id;
			editor.apply(
				[
					{
						type: "set-props", blockId: firstId, props: { type: "heading", ...{ level: 1  }},
					},
					{ type: "splice-text", blockId: firstId, from: 0,
				to: 0,
				insert: "Alpha" },
					{
						type: "insert-block",
						blockId: "block-2",
						blockType: "paragraph",
						props: {},
						position: { after: firstId },
					},
					{
						type: "splice-text",
						blockId: "block-2",
						from: 0,
				to: 0,
				insert: "Note",
					},
					{
						type: "insert-block",
						blockId: "block-3",
						blockType: "paragraph",
						props: {},
						position: { after: "block-2" },
					},
					{
						type: "splice-text",
						blockId: "block-3",
						from: 0,
				to: 0,
				insert: "Omega",
					},
				],
				{ origin: "system" },
			);

			const execution = buildDocumentMutationPlanExecution(editor, {
				kind: "flow_patch",
				instructions: "I am moving a revised note before Alpha while keeping Omega.",
				scope: "adjacent-blocks",
				targetSpanId: `span:${firstId}`,
				edits: [
					{
						operation: "replace_blocks",
						locator: {
							blockIds: [firstId, "block-2", "block-3"],
						},
						markdown: ["Note updated", "", "# Alpha", "", "Omega"].join("\n"),
					},
				],
			});

			expect(execution.issues).toEqual([]);
			expect(execution.reviewSafe).toBe(true);
			expect(execution.ops).toEqual([
				{
					type: "insert-block",
					blockId: expect.any(String),
					blockType: "paragraph",
					props: {},
					position: { before: firstId },
				},
				{
					type: "splice-text",
					blockId: expect.any(String),
					from: 0,
				to: 0,
				insert: "Note updated",
				},
				{
					type: "delete-block",
					blockId: "block-2",
				},
			]);
			expect(execution.metrics?.flowPatchAlignment).toEqual({
				preservedBlockCount: 2,
				rewrittenBlockCount: 0,
				unchangedBlockCount: 2,
				insertedBlockCount: 1,
				deletedBlockCount: 1,
				estimatedOperationCost: 3,
			});
		});

	it("supports review bundles that insert then update and edit a regular block", () => {
			const editor = createPlanExecutorEditor();

			const execution = buildDocumentMutationPlanExecution(editor, {
				kind: "review_bundle",
				label: "Create heading",
				reason: "Insert, refine props, and edit text.",
				plans: [
					{
						kind: "block_insert",
						blockId: "heading-new",
						blockType: "paragraph",
						position: "last",
						initialText: "Draft",
					},
					{
						kind: "block_update",
						blockId: "heading-new",
						props: { tone: "title" },
					},
					{
						kind: "text_edit",
						target: {
							blockId: "heading-new",
							range: {
								startOffset: 0,
								endOffset: 5,
							},
						},
						operation: "replace",
						text: "Final",
					},
				],
			});

			expect(execution.issues).toEqual([]);
			expect(execution.ops).toEqual([
				{
					type: "insert-block",
					blockId: "heading-new",
					blockType: "paragraph",
					props: {},
					position: "last",
				},
				{
					type: "splice-text",
					blockId: "heading-new",
					from: 0,
				to: 0,
				insert: "Draft",
				},
				{
					type: "set-props",
					blockId: "heading-new",
					props: { tone: "title" },
				},
				{
					type: "splice-text",
					blockId: "heading-new",
					from: 0,
				to: 0 + 5,
					insert: "Final",
				},
			]);
		});

	it("supports review bundles that insert then convert a regular block", () => {
			const editor = createPlanExecutorEditor();

			const execution = buildDocumentMutationPlanExecution(editor, {
				kind: "review_bundle",
				label: "Create heading",
				reason: "Insert then convert the new block.",
				plans: [
					{
						kind: "block_insert",
						blockId: "heading-new",
						blockType: "paragraph",
						position: "last",
						initialText: "Hello",
					},
					{
						kind: "block_convert",
						blockId: "heading-new",
						newType: "heading",
						props: { level: 2 },
					},
				],
			});

			expect(execution.issues).toEqual([]);
			expect(execution.ops).toEqual([
				{
					type: "insert-block",
					blockId: "heading-new",
					blockType: "paragraph",
					props: {},
					position: "last",
				},
				{
					type: "splice-text",
					blockId: "heading-new",
					from: 0,
				to: 0,
				insert: "Hello",
				},
				{
					type: "set-props", blockId: "heading-new", props: { type: "heading", ...{ level: 2  }},
				},
			]);
		});

});
