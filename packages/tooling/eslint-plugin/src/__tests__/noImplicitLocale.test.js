import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe, it } from "vitest";
import { noImplicitLocale } from "../rules/noImplicitLocale.js";

const ruleTester = new RuleTester({
	languageOptions: {
		parser: tseslint.parser,
	},
});

describe("no-implicit-locale (LOC3)", () => {
	it("requires an explicit locale on Intl and localeCompare", () => {
		ruleTester.run("no-implicit-locale", noImplicitLocale, {
			valid: [
				{ code: "new Intl.NumberFormat(locale, options);" },
				{ code: "new Intl.Segmenter(locale, { granularity: \"word\" });" },
				{ code: "left.localeCompare(right, locale);" },
				{ code: "left.localeCompare(right, \"en\");" },
			],
			invalid: [
				{
					code: "new Intl.DateTimeFormat();",
					errors: [{ messageId: "intl", data: { name: "DateTimeFormat" } }],
				},
				{
					code: "new Intl.NumberFormat(undefined, options);",
					errors: [{ messageId: "intl", data: { name: "NumberFormat" } }],
				},
				{
					code: "left.localeCompare(right);",
					errors: [{ messageId: "localeCompare" }],
				},
			],
		});
	});
});
