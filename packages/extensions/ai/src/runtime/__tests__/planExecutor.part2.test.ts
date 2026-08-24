import { describe, expect, it } from "vitest";
import { buildDocumentMutationPlanExecution } from "../planExecutor";
import { createPlanExecutorEditor } from "./planExecutor.testUtils";

describe("document mutation plan executor", () => {
	it("reuses matching prefix blocks when a flow patch deletes at the end", () => {
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
				insert: "Remove me",
					},
				],
				{ origin: "system" },
			);

			const execution = buildDocumentMutationPlanExecution(editor, {
				kind: "flow_patch",
				instructions: "I am trimming the trailing paragraph.",
				scope: "adjacent-blocks",
				targetSpanId: `span:${firstId}`,
				edits: [
					{
						operation: "replace_blocks",
						locator: {
							blockIds: [firstId, "block-2", "block-3"],
						},
						markdown: ["Keep first", "", "Keep second"].join("\n"),
					},
				],
			});

			expect(execution.issues).toEqual([]);
			expect(execution.reviewSafe).toBe(true);
			expect(execution.ops).toEqual([
				{
					type: "delete-block",
					blockId: "block-3",
				},
			]);
		});

	it("reuses and rewrites a near-match suffix block during front insertions", () => {
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
				insert: "Final thoughts",
					},
				],
				{ origin: "system" },
			);

			const execution = buildDocumentMutationPlanExecution(editor, {
				kind: "flow_patch",
				instructions: "I am inserting a new intro and lightly revising the ending.",
				scope: "adjacent-blocks",
				targetSpanId: `span:${firstId}`,
				edits: [
					{
						operation: "replace_blocks",
						locator: {
							blockIds: [firstId, "block-2"],
						},
						markdown: [
							"New intro",
							"",
							"Keep first",
							"",
							"Final thoughts updated",
						].join("\n"),
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
				insert: "New intro",
				},
				{
					type: "splice-text",
					blockId: "block-2",
					from: 0,
				to: 0 + "Final thoughts".length,
					insert: "Final thoughts updated",
				},
			]);
		});

	it("reuses and reformats a suffix block when inline marks are added", () => {
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
				insert: "Final thoughts",
					},
				],
				{ origin: "system" },
			);

			const execution = buildDocumentMutationPlanExecution(editor, {
				kind: "flow_patch",
				instructions: "I am inserting a new intro and bolding the ending.",
				scope: "adjacent-blocks",
				targetSpanId: `span:${firstId}`,
				edits: [
					{
						operation: "replace_blocks",
						locator: {
							blockIds: [firstId, "block-2"],
						},
						markdown: [
							"New intro",
							"",
							"Keep first",
							"",
							"**Final thoughts**",
						].join("\n"),
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
				insert: "New intro",
				},
				{
					type: "splice-text",
					blockId: "block-2",
					from: 0,
				to: 0 + "Final thoughts".length,
					insert: "Final thoughts",
				},
				{
					type: "format-text",
					blockId: "block-2",
					from: 0,
				to: 0 + "Final thoughts".length,
					marks: { bold: true },
				},
			]);
		});

	it("reuses block ids when a flow patch inserts in the middle", () => {
			const editor = createPlanExecutorEditor();
			const firstId = editor.firstBlock()!.id;
			editor.apply(
				[
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
				insert: "Bravo",
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
				insert: "Charlie",
					},
				],
				{ origin: "system" },
			);

			const execution = buildDocumentMutationPlanExecution(editor, {
				kind: "flow_patch",
				instructions: "I am inserting a new paragraph between Bravo and Charlie.",
				scope: "adjacent-blocks",
				targetSpanId: `span:${firstId}`,
				edits: [
					{
						operation: "replace_blocks",
						locator: {
							blockIds: [firstId, "block-2", "block-3"],
						},
						markdown: ["Alpha", "", "Bravo", "", "Inserted middle", "", "Charlie"].join("\n"),
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
					position: { after: "block-2" },
				},
				{
					type: "splice-text",
					blockId: expect.any(String),
					from: 0,
				to: 0,
				insert: "Inserted middle",
				},
			]);
			expect(execution.metrics?.flowPatchAlignment).toEqual({
				preservedBlockCount: 3,
				rewrittenBlockCount: 0,
				unchangedBlockCount: 3,
				insertedBlockCount: 1,
				deletedBlockCount: 0,
				estimatedOperationCost: 2,
			});
		});

	it("reuses block ids when a flow patch deletes in the middle", () => {
			const editor = createPlanExecutorEditor();
			const firstId = editor.firstBlock()!.id;
			editor.apply(
				[
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
				insert: "Remove me",
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
				insert: "Charlie",
					},
				],
				{ origin: "system" },
			);

			const execution = buildDocumentMutationPlanExecution(editor, {
				kind: "flow_patch",
				instructions: "I am deleting the middle paragraph.",
				scope: "adjacent-blocks",
				targetSpanId: `span:${firstId}`,
				edits: [
					{
						operation: "replace_blocks",
						locator: {
							blockIds: [firstId, "block-2", "block-3"],
						},
						markdown: ["Alpha", "", "Charlie"].join("\n"),
					},
				],
			});

			expect(execution.issues).toEqual([]);
			expect(execution.reviewSafe).toBe(true);
			expect(execution.ops).toEqual([
				{
					type: "delete-block",
					blockId: "block-2",
				},
			]);
			expect(execution.metrics?.flowPatchAlignment).toEqual({
				preservedBlockCount: 2,
				rewrittenBlockCount: 0,
				unchangedBlockCount: 2,
				insertedBlockCount: 0,
				deletedBlockCount: 1,
				estimatedOperationCost: 1,
			});
		});
});
