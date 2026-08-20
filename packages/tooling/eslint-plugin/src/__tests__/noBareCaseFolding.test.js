import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe, it } from "vitest";
import { noBareCaseFolding } from "../rules/noBareCaseFolding.js";

const ruleTester = new RuleTester({
	languageOptions: {
		parser: tseslint.parser,
	},
});

describe("no-bare-case-folding (LOC5)", () => {
	it("bans matching-path case folds and leaves key/platform folds alone", () => {
		ruleTester.run("no-bare-case-folding", noBareCaseFolding, {
			valid: [
				{ code: "const folded = foldAndNormalize(query, locale);" },
				{ code: "if (event.key.toLowerCase() === key) {}" },
				{ code: "if (navigator.platform.toLowerCase().includes(\"mac\")) {}" },
			],
			invalid: [
				{
					code: "const lower = query.toLowerCase();",
					errors: [{ messageId: "bareFold", data: { name: "toLowerCase" } }],
				},
				{
					code: "title.toUpperCase().includes(query);",
					errors: [{ messageId: "bareFold", data: { name: "toUpperCase" } }],
				},
			],
		});
	});
});
