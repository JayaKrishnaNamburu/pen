import { describe, expect, it } from "vitest";
import {
	areTextsReusableMatch,
	normalizeReusableText,
} from "../planExecutor/alignment";

const TURKISH_DOTTED_CAPITAL_I = "I";
const TURKISH_DOTLESS_I = "ı";
const TURKISH_DOCUMENT_TEXT = `${TURKISH_DOTTED_CAPITAL_I}şık`;
const TURKISH_QUERY = `${TURKISH_DOTLESS_I}şık`;

describe("LOC5 reusable-text folding", () => {
	it("LOC5: Turkish ı matches dotted I only when both sides use foldAndNormalize", () => {
		expect(TURKISH_DOCUMENT_TEXT.toLowerCase()).not.toBe(
			TURKISH_QUERY.toLowerCase(),
		);
		expect(normalizeReusableText(TURKISH_DOCUMENT_TEXT, "tr")).toBe(
			normalizeReusableText(TURKISH_QUERY, "tr"),
		);
		expect(normalizeReusableText(TURKISH_DOCUMENT_TEXT, "en")).not.toBe(
			normalizeReusableText(TURKISH_QUERY, "en"),
		);
		expect(
			areTextsReusableMatch(TURKISH_DOCUMENT_TEXT, TURKISH_QUERY, "tr"),
		).toBe(true);
	});
});
