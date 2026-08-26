import { describe, expect, it } from "vitest";
import { parseSuggestionResponse } from "../analyzer";

const TURKISH_DOTTED_CAPITAL_I = "I";
const TURKISH_DOTLESS_I = "ı";
const TURKISH_CAPITAL = `${TURKISH_DOTTED_CAPITAL_I}şık`;
const TURKISH_LOWER = `${TURKISH_DOTLESS_I}şık`;

function suggestionPayload(
	originalText: string,
	replacementText: string,
): string {
	return JSON.stringify({
		suggestions: [
			{
				kind: "spelling",
				title: "Spelling",
				originalText,
				replacementText,
			},
		],
	});
}

describe("LOC5 comparable-text folding", () => {
	it("LOC5: Turkish ı and I are a no-op only when both sides use foldAndNormalize", () => {
		expect(TURKISH_CAPITAL.toLowerCase()).not.toBe(
			TURKISH_LOWER.toLowerCase(),
		);

		expect(
			parseSuggestionResponse(
				suggestionPayload(TURKISH_CAPITAL, TURKISH_LOWER),
				"tr",
			),
		).toHaveLength(0);
		expect(
			parseSuggestionResponse(
				suggestionPayload(TURKISH_CAPITAL, TURKISH_LOWER),
				"en",
			),
		).toHaveLength(1);
		expect(
			parseSuggestionResponse(
				suggestionPayload(TURKISH_CAPITAL, "Istanbul"),
				"tr",
			),
		).toHaveLength(1);
	});
});
