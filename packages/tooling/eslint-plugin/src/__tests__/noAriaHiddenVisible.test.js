import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe, it } from "vitest";
import { noAriaHiddenVisible } from "../rules/noAriaHiddenVisible.js";

const ruleTester = new RuleTester({
	languageOptions: {
		parser: tseslint.parser,
		parserOptions: { ecmaFeatures: { jsx: true } },
	},
});

describe("no-aria-hidden-visible (AX4)", () => {
	it("bans aria-hidden on visible content and allows sanctioned comments", () => {
		ruleTester.run("no-aria-hidden-visible", noAriaHiddenVisible, {
			valid: [
				{ code: "<span>visible</span>", filename: "chip.tsx" },
				{
					code: "element.removeAttribute(\"aria-hidden\");",
					filename: "focusSink.ts",
				},
				{
					code: "element.getAttribute(\"aria-hidden\");",
					filename: "focusSink.ts",
				},
				{
					code: "<span aria-hidden={false}>visible</span>",
					filename: "chip.tsx",
				},
				{
					code: "/* AX7 overlay */\nelement.setAttribute(\"aria-hidden\", \"true\");",
					filename: "overlay.ts",
				},
				{
					code: "// focus sink\nelement.setAttribute(\"aria-hidden\", \"true\");",
					filename: "focusSink.ts",
				},
				{
					code: "// Justified decorative marker\n<span aria-hidden=\"true\">•</span>",
					filename: "marker.tsx",
				},
			],
			invalid: [
				{
					code: "<span aria-hidden=\"true\">atom</span>",
					filename: "chip.tsx",
					errors: [{ messageId: "hidden" }],
				},
				{
					code: "element.setAttribute(\"aria-hidden\", \"true\");",
					filename: "overlay.ts",
					errors: [{ messageId: "hidden" }],
				},
				{
					code: "const props = { \"aria-hidden\": \"true\" };",
					filename: "overlay.ts",
					errors: [{ messageId: "hidden" }],
				},
			],
		});
	});
});
