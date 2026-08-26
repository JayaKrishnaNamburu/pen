import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe, it } from "vitest";
import { noUserFacingLiterals } from "../rules/noUserFacingLiterals.js";

const ruleTester = new RuleTester({
	languageOptions: {
		parser: tseslint.parser,
		parserOptions: { ecmaFeatures: { jsx: true } },
	},
});

describe("no-user-facing-literals (LOC1)", () => {
	it("bans chrome literals and leaves catalog lookups alone", () => {
		ruleTester.run("no-user-facing-literals", noUserFacingLiterals, {
			valid: [
				{ code: "<button>{resolveEditorMessage(editor, \"pen.ai.review.accept\")}</button>", filename: "chrome.tsx" },
				{ code: "<input aria-label={resolveEditorMessage(editor, \"pen.search.input.label\")} />", filename: "chrome.tsx" },
				{ code: "<input placeholder=\"pen.search.input.placeholder\" />", filename: "chrome.tsx" },
				{ code: "<span>  </span>", filename: "chrome.tsx" },
				{ code: "<span>3</span>", filename: "chrome.tsx" },
				{ code: "throw new Error(\"Missing context\");" },
			],
			invalid: [
				{
					code: "<button>Accept</button>",
					filename: "chrome.tsx",
					errors: [{ messageId: "jsxText" }],
				},
				{
					code: "<input aria-label=\"Search\" />",
					filename: "chrome.tsx",
					errors: [{ messageId: "attribute", data: { name: "aria-label" } }],
				},
				{
					code: "<input placeholder={\"Find...\"} />",
					filename: "chrome.tsx",
					errors: [{ messageId: "attribute", data: { name: "placeholder" } }],
				},
				{
					code: "announce(\"Suggestion appeared\");",
					errors: [{ messageId: "announce" }],
				},
			],
		});
	});
});
