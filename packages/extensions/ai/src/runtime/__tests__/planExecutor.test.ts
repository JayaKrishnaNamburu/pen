import { describe, expect, it } from "vitest";
import { buildDocumentMutationPlanExecution } from "../planExecutor";
import { validateDocumentMutationPlanShape } from "../planValidation";
import { buildStructuralReviewItems } from "../reviewArtifacts";
import { createPlanExecutorEditor } from "./planExecutor.testUtils";

describe("document mutation plan executor", () => {
	it("CH3 runs a text-edit plan into replace-text ops", () => {
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

	it("CH3 fails a text-edit plan for a missing block", () => {
		const editor = createPlanExecutorEditor();

		const execution = buildDocumentMutationPlanExecution(editor, {
			kind: "text_edit",
			target: {
				blockId: "missing-block",
				range: {
					startOffset: 0,
					endOffset: 4,
				},
			},
			operation: "replace",
			text: "gone",
		});

		expect(execution.ops).toEqual([]);
		expect(execution.reviewSafe).toBe(false);
		expect(execution.issues).toEqual([
			{
				path: "text_edit.target.blockId",
				code: "missing-block",
				message: 'Block "missing-block" was not found.',
			},
		]);
	});

	it("CH3 validates a well-formed text-edit plan", () => {
		const result = validateDocumentMutationPlanShape({
			kind: "text_edit",
			target: {
				blockId: "block-1",
				range: {
					startOffset: 0,
					endOffset: 5,
				},
			},
			operation: "replace",
			text: "Updated",
		});

		expect(result.valid).toBe(true);
		expect(result.issues).toEqual([]);
	});

	it("CH3 rejects an unknown plan kind", () => {
		const result = validateDocumentMutationPlanShape({
			kind: "mystery_edit",
		});

		expect(result.valid).toBe(false);
		expect(result.issues.some((issue) => issue.code === "invalid-kind")).toBe(
			true,
		);
	});

	it("CH3 builds review items for a text-edit plan", () => {
		const editor = createPlanExecutorEditor();
		const blockId = editor.firstBlock()!.id;
		editor.apply(
			[{ type: "splice-text", blockId, from: 0,
				to: 0,
				insert: "Hello world" }],
			{ origin: "system" },
		);

		const items = buildStructuralReviewItems(editor, {
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

		expect(items).toHaveLength(1);
		expect(items[0]).toMatchObject({
			planKind: "text_edit",
			changeKind: "updated",
			label: "Replace text",
			before: "world",
			after: "planet",
			preview: "planet",
		});
	});

	it("CH3 returns no review items for an empty review bundle", () => {
		const editor = createPlanExecutorEditor();

		const items = buildStructuralReviewItems(editor, {
			kind: "review_bundle",
			label: "Empty",
			reason: "No nested plans",
			plans: [],
		});

		expect(items).toEqual([]);
	});
});
