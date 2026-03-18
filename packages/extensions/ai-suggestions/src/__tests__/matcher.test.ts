import { describe, expect, it } from "vitest";
import { dedupeOverlappingSuggestions, materializeSuggestionsFromCandidates } from "../matcher";

describe("@pen/ai-suggestions matcher", () => {
	it("materializes suggestions from unique matches only", () => {
		const suggestions = materializeSuggestionsFromCandidates({
			blockId: "block-1",
			scopeId: "scope-1",
			scopeHash: "hash-1",
			scopeText: "Ths sentence is fine.",
			scopeFrom: 0,
			candidates: [
				{
					kind: "spelling",
					title: "Spelling",
					originalText: "Ths",
					replacementText: "This",
				},
			],
		});

		expect(suggestions).toHaveLength(1);
		expect(suggestions[0]).toMatchObject({
			blockId: "block-1",
			from: 0,
			to: 3,
			originalText: "Ths",
			replacementText: "This",
		});
	});

	it("drops lower-priority overlapping suggestions", () => {
		const suggestions = dedupeOverlappingSuggestions([
			{
				id: "a",
				kind: "grammar",
				title: "Grammar",
				blockId: "block-1",
				from: 0,
				to: 5,
				originalText: "their",
				replacementText: "there",
				confidence: 0.7,
				scopeId: "scope-1",
				scopeHash: "hash-1",
				createdAt: Date.now(),
				invalidated: false,
			},
			{
				id: "b",
				kind: "spelling",
				title: "Spelling",
				blockId: "block-1",
				from: 0,
				to: 5,
				originalText: "their",
				replacementText: "there",
				confidence: 0.95,
				scopeId: "scope-1",
				scopeHash: "hash-1",
				createdAt: Date.now(),
				invalidated: false,
			},
		]);

		expect(suggestions).toHaveLength(1);
		expect(suggestions[0]?.id).toBe("b");
	});
});
