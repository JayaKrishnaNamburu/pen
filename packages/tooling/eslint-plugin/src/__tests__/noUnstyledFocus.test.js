import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe, it } from "vitest";
import { noUnstyledFocus } from "../rules/noUnstyledFocus.js";

const ruleTester = new RuleTester({
	languageOptions: {
		parser: tseslint.parser,
		parserOptions: { ecmaFeatures: { jsx: true } },
	},
});

describe("no-unstyled-focus (AX5)", () => {
	it("bans outline none unless a nearby focus-visible ring exists", () => {
		ruleTester.run("no-unstyled-focus", noUnstyledFocus, {
			valid: [
				{ code: "const style = { outline: \"2px solid currentColor\" };" },
				{
					code: [
						"const css = \"button { outline: none; }\";",
						"const ring = \"button:focus-visible { outline: 2px solid currentColor; }\";",
					].join("\n"),
				},
			],
			invalid: [
				{
					code: "const style = { outline: \"none\" };",
					errors: [{ messageId: "outlineNone" }],
				},
				{
					code: "const css = \"button { outline: none; }\";",
					errors: [{ messageId: "outlineNone" }],
				},
				{
					code: "const css = `button:focus-visible { outline: none; }`;",
					errors: [{ messageId: "outlineNone" }],
				},
			],
		});
	});
});
