import { describe, expect, it } from "vitest";
import { validateDocumentMutationPlanShape } from "../planValidation";

describe("document mutation plan validation", () => {
	it("accepts valid text, flow patch, database, and review bundle plans", () => {
		const textEditPlan = validateDocumentMutationPlanShape({
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
		const flowPatchPlan = validateDocumentMutationPlanShape({
			kind: "flow_patch",
			instructions: "I am replacing the current paragraph text.",
			scope: "single-block",
			targetSpanId: "span:block-1",
			edits: [
				{
					operation: "replace_text",
					locator: {
						blockId: "block-1",
						expectedBlockType: "paragraph",
					},
					text: "Updated paragraph",
				},
			],
		});
		const databaseEditPlan = validateDocumentMutationPlanShape({
			kind: "database_edit",
			blockId: "database-1",
			steps: [{ op: "set_active_view", viewId: "view-1" }],
		});
		const reviewBundlePlan = validateDocumentMutationPlanShape({
			kind: "review_bundle",
			label: "Revise layout",
			reason: "Needs a structural review",
			plans: [
				{
					kind: "block_update",
					blockId: "block-1",
					props: { level: 2 },
				},
			],
		});
		const blockInsertPlan = validateDocumentMutationPlanShape({
			kind: "block_insert",
			blockId: "table-1",
			blockType: "table",
			position: "last",
		});

		expect(textEditPlan.valid).toBe(true);
		expect(flowPatchPlan.valid).toBe(true);
		expect(databaseEditPlan.valid).toBe(true);
		expect(reviewBundlePlan.valid).toBe(true);
		expect(blockInsertPlan.valid).toBe(true);
	});

	it("rejects unknown kinds and missing required fields", () => {
		const invalidKind = validateDocumentMutationPlanShape({
			kind: "mystery_edit",
		});
		const missingBlockId = validateDocumentMutationPlanShape({
			kind: "database_edit",
			steps: [],
		});

		expect(invalidKind.valid).toBe(false);
		expect(invalidKind.issues.some((issue) => issue.code === "invalid-kind")).toBe(
			true,
		);
		expect(missingBlockId.valid).toBe(false);
		expect(
			missingBlockId.issues.some((issue) => issue.path === "plan.blockId"),
		).toBe(true);
	});

	it("rejects malformed step arrays and invalid nested review bundle plans", () => {
		const malformedSteps = validateDocumentMutationPlanShape({
			kind: "database_edit",
			blockId: "database-1",
			steps: "not-an-array",
		});
		const invalidNestedPlan = validateDocumentMutationPlanShape({
			kind: "review_bundle",
			label: "Review table",
			reason: "Need a safe bundle",
			plans: [
				{
					kind: "unknown_nested_kind",
				},
			],
		});

		expect(malformedSteps.valid).toBe(false);
		expect(
			malformedSteps.issues.some((issue) => issue.path === "plan.steps"),
		).toBe(true);
		expect(invalidNestedPlan.valid).toBe(false);
		expect(
			invalidNestedPlan.issues.some(
				(issue) => issue.code === "invalid-nested-plan",
			),
		).toBe(true);
	});

	it("rejects malformed flow patch edits", () => {
		const malformedFlowPatch = validateDocumentMutationPlanShape({
			kind: "flow_patch",
			instructions: "I am editing the block.",
			edits: [
				{
					operation: "replace_text",
					locator: "block-1",
				},
			],
		});

		expect(malformedFlowPatch.valid).toBe(false);
		expect(
			malformedFlowPatch.issues.some(
				(issue) => issue.path === "plan.edits[0].locator",
			),
		).toBe(true);
	});

	it("rejects plans that are incompatible with the validated target kind", () => {
		const invalidForDatabaseTarget = validateDocumentMutationPlanShape(
			{
				kind: "database_edit",
				blockId: "database-1",
				steps: [],
			},
			{
				targetKind: "text",
			},
		);

		expect(invalidForDatabaseTarget.valid).toBe(false);
		expect(
			invalidForDatabaseTarget.issues.some(
				(issue) => issue.code === "unsupported-target-kind",
			),
		).toBe(true);
	});

	it("rejects unknown block types when validation receives allowed block types", () => {
		const invalidBlockType = validateDocumentMutationPlanShape(
			{
				kind: "block_insert",
				blockType: "unknown-widget",
				position: "last",
			},
			{
				documentProfile: "structured",
				knownBlockTypes: ["paragraph", "heading"],
			},
		);

		expect(invalidBlockType.valid).toBe(false);
		expect(
			invalidBlockType.issues.some(
				(issue) => issue.code === "unknown-block-type",
			),
		).toBe(true);
	});

	it("rejects out-of-scope and read-only target references", () => {
		const outOfScopeTarget = validateDocumentMutationPlanShape(
			{
				kind: "text_edit",
				target: {
					blockId: "block-9",
				},
				operation: "replace",
				text: "Updated",
			},
			{
				allowedTargetBlockIds: ["block-1"],
				editableTargetBlockIds: ["block-1"],
			},
		);
		const readOnlyTarget = validateDocumentMutationPlanShape(
			{
				kind: "block_update",
				blockId: "block-2",
				props: { title: "Forbidden" },
			},
			{
				documentProfile: "structured",
				allowedTargetBlockIds: ["block-2"],
				editableTargetBlockIds: [],
			},
		);

		expect(outOfScopeTarget.valid).toBe(false);
		expect(
			outOfScopeTarget.issues.some(
				(issue) => issue.code === "out-of-scope-target",
			),
		).toBe(true);
		expect(readOnlyTarget.valid).toBe(false);
		expect(
			readOnlyTarget.issues.some(
				(issue) => issue.code === "read-only-target",
			),
		).toBe(true);
	});
});
