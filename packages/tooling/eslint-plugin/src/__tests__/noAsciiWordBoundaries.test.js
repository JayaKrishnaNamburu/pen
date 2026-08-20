import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe, it } from "vitest";
import { noAsciiWordBoundaries } from "../rules/noAsciiWordBoundaries.js";

const ruleTester = new RuleTester({
	languageOptions: {
		parser: tseslint.parser,
	},
});

describe("no-ascii-word-boundaries (LOC4)", () => {
	it("bans ASCII word regex and leaves segmenter helpers alone", () => {
		ruleTester.run("no-ascii-word-boundaries", noAsciiWordBoundaries, {
			valid: [
				{ code: "const next = nextWordBoundary(text, offset, locale);" },
				{ code: "const range = wordRangeAt(text, offset, locale);" },
				{ code: "const space = /[ \\t]/u;" },
			],
			invalid: [
				{
					code: "const word = /\\bword\\b/;",
					errors: [{ messageId: "asciiWord" }],
				},
				{
					code: "const letters = /\\w+/;",
					errors: [{ messageId: "asciiWord" }],
				},
				{
					code: "const run = /\\s+/;",
					errors: [{ messageId: "asciiWord" }],
				},
				{
					code: "const pattern = new RegExp(`\\\\b${query}\\\\b`);",
					errors: [{ messageId: "asciiWord" }],
				},
			],
		});
	});
});
