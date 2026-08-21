import { describe, expect, it } from "vitest";
import { buildSuggestionFingerprint } from "../cache";

const TURKISH_DOTTED_CAPITAL_I = "I";
const TURKISH_DOTLESS_I = "ı";
const TURKISH_CAPITAL = `${TURKISH_DOTTED_CAPITAL_I}şık`;
const TURKISH_LOWER = `${TURKISH_DOTLESS_I}şık`;

const KIND = "spelling" as const;
const REPLACEMENT = "light";

describe("LOC5 fingerprint folding", () => {
	it("LOC5: Turkish ı and I fingerprint equal only when both sides use foldAndNormalize", () => {
		expect(TURKISH_CAPITAL.toLowerCase()).not.toBe(TURKISH_LOWER.toLowerCase());

		expect(
			buildSuggestionFingerprint(
				"scope-1",
				{
					kind: KIND,
					originalText: TURKISH_CAPITAL,
					replacementText: REPLACEMENT,
				},
				"tr",
			),
		).toBe(
			buildSuggestionFingerprint(
				"scope-1",
				{
					kind: KIND,
					originalText: TURKISH_LOWER,
					replacementText: REPLACEMENT,
				},
				"tr",
			),
		);
		expect(
			buildSuggestionFingerprint(
				"scope-1",
				{
					kind: KIND,
					originalText: TURKISH_CAPITAL,
					replacementText: REPLACEMENT,
				},
				"en",
			),
		).not.toBe(
			buildSuggestionFingerprint(
				"scope-1",
				{
					kind: KIND,
					originalText: TURKISH_LOWER,
					replacementText: REPLACEMENT,
				},
				"en",
			),
		);
	});
});
