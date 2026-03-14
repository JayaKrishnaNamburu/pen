import { describe, expect, it } from "vitest";
import {
	buildStructuredIntentRequestPrompt,
	parseStructuredIntentPreview,
	parseStructuredIntentResult,
} from "../structuredIntent";

describe("structured intent pipeline", () => {
	it("rejects table creation intents at parse time because tables are markdown-first", () => {
		const result = parseStructuredIntentResult(
			{
				kind: "review_bundle",
				label: "Create people table",
				reason: "Insert a table and populate it.",
				changes: [
					{
						kind: "insert_block",
						blockId: "people-table",
						blockType: "table",
						position: "after_active",
						table: {
							columns: [
								{ id: "first_name", title: "First Name" },
								{ id: "last_name", title: "Last Name" },
							],
							rows: [
								{
									index: 0,
									cells: {
										first_name: "Alice",
										last_name: "Johnson",
									},
								},
								{
									index: 2,
									cells: {
										first_name: "Bob",
										last_name: "Smith",
									},
								},
							],
						},
					},
				],
			},
			"table",
		);

		expect(result.intentState).toBe("rejected");
		expect(result.intent).toBeNull();
		expect(result.issues).toEqual([
			expect.objectContaining({
				message: expect.stringContaining("markdown authoring lane"),
			}),
		]);
	});

	it("builds previewable intent objects from partial structured output", () => {
		const preview = parseStructuredIntentPreview(
			{
				kind: "database",
				blockId: "database-1",
				columns: [{ title: "Name" }],
			},
			"database",
		);

		expect(preview?.intentState).toBe("validated");
	});

	it("wraps structured requests in a shared transport envelope", () => {
		const prompt = buildStructuredIntentRequestPrompt({
			prompt: "Create a database with names",
			targetKind: "database",
			activeBlockId: "anchor-block",
			workingSet: {
				documentVersion: 1,
				viewMode: "resolved",
				source: "document-summary",
				context: { activeBlockType: "paragraph" },
				trackedBlockIds: ["anchor-block"],
				blockRevisions: { "anchor-block": 1 },
				selectionSignature: null,
			},
		});

		expect(prompt).toContain("pen:structured-intent-request/v1");
		expect(prompt).toContain("Create a database with names");
	});
});
