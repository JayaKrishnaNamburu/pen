import { type InsertBlockOp } from "@input/pen-types";
import { describe, expect, it } from "vitest";
import { buildDocumentMutationPlanExecution } from "../planExecutor";
import { createPlanExecutorEditor } from "./planExecutor.testUtils";

describe("document mutation plan executor", () => {
	it("builds replace-text ops for text edit plans", () => {
			const editor = createPlanExecutorEditor();
			const blockId = editor.firstBlock()!.id;
			editor.apply(
				[{ type: "splice-text", blockId, from: 0,
				to: 0,
				insert: "Hello world" }],
				{ origin: "system" },
			);

			const execution = buildDocumentMutationPlanExecution(editor, {
				kind: "text_edit",
				target: {
					blockId,
					range: {
						startOffset: 6,
						endOffset: 11,
					},
				},
				operation: "replace",
				text: "planet",
			});

			expect(execution.reviewSafe).toBe(true);
			expect(execution.issues).toEqual([]);
			expect(execution.ops).toEqual([
				{
					type: "splice-text",
					blockId,
					from: 6,
				to: 6 + 5,
					insert: "planet",
				},
			]);
		});

	it("builds native ops for flow patch plans", () => {
			const editor = createPlanExecutorEditor();
			const firstBlockId = editor.firstBlock()!.id;
			editor.apply(
				[{
					type: "splice-text",
					blockId: firstBlockId,
					from: 0,
				to: 0 + 0,
					insert: "Alpha",
				}],
				{ origin: "system" },
			);
			editor.apply(
				[{
					type: "insert-block",
					blockId: "block-2",
					blockType: "paragraph",
					props: {},
					position: { after: firstBlockId },
				}, {
					type: "splice-text",
					blockId: "block-2",
					from: 0,
				to: 0,
				insert: "Bravo",
				}],
				{ origin: "system" },
			);

			const execution = buildDocumentMutationPlanExecution(editor, {
				kind: "flow_patch",
				instructions: "I am updating the current paragraph and inserting a heading after it.",
				scope: "adjacent-blocks",
				targetSpanId: `span:${firstBlockId}`,
				edits: [
					{
						operation: "replace_text",
						locator: {
							blockId: firstBlockId,
							expectedBlockType: "paragraph",
						},
						text: "Alpha updated",
					},
					{
						operation: "insert_after",
						locator: {
							blockId: "block-2",
						},
						markdown: "## Next step",
					},
				],
			});

			expect(execution.reviewSafe).toBe(true);
			expect(execution.issues).toEqual([]);
			expect(execution.ops[0]).toEqual({
				type: "splice-text",
				blockId: firstBlockId,
				from: 0,
				to: 0 + 5,
				insert: "Alpha updated",
			});
			const headingInsert = execution.ops.find(
				(op): op is InsertBlockOp =>
					op.type === "insert-block" && op.blockType === "heading",
			);
			expect(
				headingInsert,
				"heading insert: expected insert-block heading after block-2",
			).toEqual({
				type: "insert-block",
				blockId: expect.any(String),
				blockType: "heading",
				props: { level: 2 },
				position: { after: "block-2" },
			});
			expect(
				execution.ops.some(
					(op) =>
						op.type === "splice-text" &&
						headingInsert != null &&
						op.blockId === headingInsert.blockId &&
						op.from === 0 &&
						op.to === 0 &&
						op.insert === "Next step",
				),
				'heading insert: expected splice-text inserting "Next step" into the new heading',
			).toBe(true);
		});

	it("optimizes single-block markdown replacements into native ops", () => {
			const editor = createPlanExecutorEditor();
			const blockId = editor.firstBlock()!.id;
			editor.apply(
				[{ type: "splice-text", blockId, from: 0,
				to: 0,
				insert: "Old title" }],
				{ origin: "system" },
			);

			const execution = buildDocumentMutationPlanExecution(editor, {
				kind: "flow_patch",
				instructions: "I am turning the paragraph into a heading with new copy.",
				scope: "single-block",
				targetSpanId: `span:${blockId}`,
				edits: [
					{
						operation: "replace_blocks",
						locator: {
							blockIds: [blockId],
						},
						markdown: "## New title",
					},
				],
			});

			expect(execution.issues).toEqual([]);
			expect(execution.reviewSafe).toBe(true);
			expect(execution.ops).toEqual([
				{
					type: "set-props",
					blockId,
					props: { type: "heading", level: 2 },
				},
				{
					type: "splice-text",
					blockId,
					from: 0,
				to: 0 + "Old title".length,
					insert: "New title",
				},
			]);
		});

	it("optimizes adjacent multi-block markdown replacements into native ops", () => {
			const editor = createPlanExecutorEditor();
			const headingId = editor.firstBlock()!.id;
			editor.apply(
				[
					{ type: "set-props", blockId: headingId, props: { type: "heading", ...{ level: 1  }} },
					{ type: "splice-text", blockId: headingId, from: 0,
				to: 0,
				insert: "Old heading" },
					{
						type: "insert-block",
						blockId: "paragraph-2",
						blockType: "paragraph",
						props: {},
						position: { after: headingId },
					},
					{
						type: "splice-text",
						blockId: "paragraph-2",
						from: 0,
				to: 0,
				insert: "Old body",
					},
				],
				{ origin: "system" },
			);

			const execution = buildDocumentMutationPlanExecution(editor, {
				kind: "flow_patch",
				instructions: "I am rewriting the heading and paragraph together.",
				scope: "adjacent-blocks",
				targetSpanId: `span:${headingId}`,
				edits: [
					{
						operation: "replace_blocks",
						locator: {
							blockIds: [headingId, "paragraph-2"],
						},
						markdown: ["## New heading", "", "New body copy"].join("\n"),
					},
				],
			});

			expect(execution.issues).toEqual([]);
			expect(execution.reviewSafe).toBe(true);
			expect(execution.ops).toEqual([
				{
					type: "set-props",
					blockId: headingId,
					props: { level: 2 },
				},
				{
					type: "splice-text",
					blockId: headingId,
					from: 0,
				to: 0 + "Old heading".length,
					insert: "New heading",
				},
				{
					type: "splice-text",
					blockId: "paragraph-2",
					from: 0,
				to: 0 + "Old body".length,
					insert: "New body copy",
				},
			]);
		});

	it("optimizes adjacent list rewrites into native ops", () => {
			const editor = createPlanExecutorEditor();
			const firstId = editor.firstBlock()!.id;
			editor.apply(
				[
					{ type: "set-props", blockId: firstId, props: { type: "bulletListItem", ...{ indent: 0  }} },
					{ type: "splice-text", blockId: firstId, from: 0,
				to: 0,
				insert: "Alpha" },
					{
						type: "insert-block",
						blockId: "item-2",
						blockType: "bulletListItem",
						props: { indent: 0 },
						position: { after: firstId },
					},
					{
						type: "splice-text",
						blockId: "item-2",
						from: 0,
				to: 0,
				insert: "Beta",
					},
				],
				{ origin: "system" },
			);

			const execution = buildDocumentMutationPlanExecution(editor, {
				kind: "flow_patch",
				instructions: "I am converting the bullet list into a numbered list.",
				scope: "adjacent-blocks",
				targetSpanId: `span:${firstId}`,
				edits: [
					{
						operation: "replace_blocks",
						locator: {
							blockIds: [firstId, "item-2"],
						},
						markdown: ["1. First", "2. Second"].join("\n"),
					},
				],
			});

			expect(execution.issues).toEqual([]);
			expect(execution.reviewSafe).toBe(true);
			expect(execution.ops).toEqual([
				{
					type: "set-props", blockId: firstId, props: { type: "numberedListItem", ...{ indent: 0 }, start: 1 },
				},
				{
					type: "splice-text",
					blockId: firstId,
					from: 0,
				to: 0 + "Alpha".length,
					insert: "First",
				},
				{
					type: "set-props", blockId: "item-2", props: { type: "numberedListItem", ...{ indent: 0 }, start: undefined },
				},
				{
					type: "splice-text",
					blockId: "item-2",
					from: 0,
				to: 0 + "Beta".length,
					insert: "Second",
				},
			]);
		});

	it("reuses matching suffix blocks when a flow patch inserts at the front", () => {
			const editor = createPlanExecutorEditor();
			const firstId = editor.firstBlock()!.id;
			editor.apply(
				[
					{ type: "splice-text", blockId: firstId, from: 0,
				to: 0,
				insert: "Keep first" },
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
				insert: "Keep second",
					},
				],
				{ origin: "system" },
			);

			const execution = buildDocumentMutationPlanExecution(editor, {
				kind: "flow_patch",
				instructions: "I am inserting a new heading before the existing paragraphs.",
				scope: "adjacent-blocks",
				targetSpanId: `span:${firstId}`,
				edits: [
					{
						operation: "replace_blocks",
						locator: {
							blockIds: [firstId, "block-2"],
						},
						markdown: ["## New intro", "", "Keep first", "", "Keep second"].join("\n"),
					},
				],
			});

			expect(execution.issues).toEqual([]);
			expect(execution.reviewSafe).toBe(true);
			expect(execution.ops).toEqual([
				{
					type: "insert-block",
					blockId: expect.any(String),
					blockType: "heading",
					props: { level: 2 },
					position: { before: firstId },
				},
				{
					type: "splice-text",
					blockId: expect.any(String),
					from: 0,
				to: 0,
				insert: "New intro",
				},
			]);
		});
});
