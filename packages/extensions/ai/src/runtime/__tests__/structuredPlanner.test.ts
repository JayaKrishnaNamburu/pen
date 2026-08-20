import { describe, expect, it } from "vitest";
import { parseStructuredPlanResult } from "../structuredPlanner";

describe("structured planner normalization", () => {
	it("rejects legacy table planner responses because tables are markdown-first", () => {
		const result = parseStructuredPlanResult(
			JSON.stringify({
				kind: "table_edit",
				blockId: "table-1",
				steps: [{ op: "insert_row", index: 1 }],
			}),
			"table",
		);

		expect(result.plan).toBeNull();
		expect(result.planState).toBe("rejected");
		expect(result.issues).toEqual([
			expect.objectContaining({
				code: "invalid-kind",
				message: expect.stringContaining("markdown authoring lane"),
			}),
		]);
	});

	it("normalizes block insert planner responses with inferred block types and confidence objects", () => {
		const result = parseStructuredPlanResult(
			[
				"```json",
				JSON.stringify(
					{
						kind: "review_bundle",
						plans: [
							{
								kind: "block_insert",
								blockId: "heading-1",
								block: {
									type: "heading",
								},
								position: {
									relativeTo: "active",
									placement: "after",
								},
								confidence: 0.95,
							},
						],
					},
					null,
					2,
				),
				"```",
			].join("\n"),
			"block",
		);

		expect(result.planState).toBe("validated");
		expect(result.plan).toMatchObject({
			kind: "review_bundle",
			label: "Structured changes",
			reason: "Apply the requested structured changes.",
			plans: [
				{
					kind: "block_insert",
					blockId: "heading-1",
					blockType: "heading",
					position: "last",
					confidence: { score: 0.95 },
				},
			],
		});
	});
});
