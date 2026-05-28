import { describe, expect, it } from "vitest";
import { buildDocumentMutationPlanExecution } from "../planExecutor";
import { createPlanExecutorEditor } from "./planExecutor.testUtils";

describe("document mutation plan executor", () => {
	it("builds replace-text ops for text edit plans", () => {
			const editor = createPlanExecutorEditor();
			const blockId = editor.firstBlock()!.id;
			editor.apply(
				[{ type: "insert-text", blockId, offset: 0, text: "Hello world" }],
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
					type: "replace-text",
					blockId,
					offset: 6,
					length: 5,
					text: "planet",
				},
			]);
		});

	it("builds native ops for flow patch plans", () => {
			const editor = createPlanExecutorEditor();
			const firstBlockId = editor.firstBlock()!.id;
			editor.apply(
				[{
					type: "replace-text",
					blockId: firstBlockId,
					offset: 0,
					length: 0,
					text: "Alpha",
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
					type: "insert-text",
					blockId: "block-2",
					offset: 0,
					text: "Bravo",
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
				type: "replace-text",
				blockId: firstBlockId,
				offset: 0,
				length: 5,
				text: "Alpha updated",
			});
			expect(execution.ops.some((op) => op.type === "insert-block")).toBe(true);
			expect(execution.ops.some((op) => op.type === "insert-text")).toBe(true);
		});

	it("optimizes single-block markdown replacements into native ops", () => {
			const editor = createPlanExecutorEditor();
			const blockId = editor.firstBlock()!.id;
			editor.apply(
				[{ type: "insert-text", blockId, offset: 0, text: "Old title" }],
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
					type: "convert-block",
					blockId,
					newType: "heading",
					newProps: { level: 2 },
				},
				{
					type: "replace-text",
					blockId,
					offset: 0,
					length: "Old title".length,
					text: "New title",
				},
			]);
		});

	it("optimizes adjacent multi-block markdown replacements into native ops", () => {
			const editor = createPlanExecutorEditor();
			const headingId = editor.firstBlock()!.id;
			editor.apply(
				[
					{ type: "convert-block", blockId: headingId, newType: "heading", newProps: { level: 1 } },
					{ type: "insert-text", blockId: headingId, offset: 0, text: "Old heading" },
					{
						type: "insert-block",
						blockId: "paragraph-2",
						blockType: "paragraph",
						props: {},
						position: { after: headingId },
					},
					{
						type: "insert-text",
						blockId: "paragraph-2",
						offset: 0,
						text: "Old body",
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
					type: "update-block",
					blockId: headingId,
					props: { level: 2 },
				},
				{
					type: "replace-text",
					blockId: headingId,
					offset: 0,
					length: "Old heading".length,
					text: "New heading",
				},
				{
					type: "replace-text",
					blockId: "paragraph-2",
					offset: 0,
					length: "Old body".length,
					text: "New body copy",
				},
			]);
		});

	it("optimizes adjacent list rewrites into native ops", () => {
			const editor = createPlanExecutorEditor();
			const firstId = editor.firstBlock()!.id;
			editor.apply(
				[
					{ type: "convert-block", blockId: firstId, newType: "bulletListItem", newProps: { indent: 0 } },
					{ type: "insert-text", blockId: firstId, offset: 0, text: "Alpha" },
					{
						type: "insert-block",
						blockId: "item-2",
						blockType: "bulletListItem",
						props: { indent: 0 },
						position: { after: firstId },
					},
					{
						type: "insert-text",
						blockId: "item-2",
						offset: 0,
						text: "Beta",
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
					type: "convert-block",
					blockId: firstId,
					newType: "numberedListItem",
					newProps: { indent: 0, start: 1 },
				},
				{
					type: "replace-text",
					blockId: firstId,
					offset: 0,
					length: "Alpha".length,
					text: "First",
				},
				{
					type: "convert-block",
					blockId: "item-2",
					newType: "numberedListItem",
					newProps: { indent: 0, start: undefined },
				},
				{
					type: "replace-text",
					blockId: "item-2",
					offset: 0,
					length: "Beta".length,
					text: "Second",
				},
			]);
		});

	it("reuses matching suffix blocks when a flow patch inserts at the front", () => {
			const editor = createPlanExecutorEditor();
			const firstId = editor.firstBlock()!.id;
			editor.apply(
				[
					{ type: "insert-text", blockId: firstId, offset: 0, text: "Keep first" },
					{
						type: "insert-block",
						blockId: "block-2",
						blockType: "paragraph",
						props: {},
						position: { after: firstId },
					},
					{
						type: "insert-text",
						blockId: "block-2",
						offset: 0,
						text: "Keep second",
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
					type: "insert-text",
					blockId: expect.any(String),
					offset: 0,
					text: "New intro",
				},
			]);
		});
});
