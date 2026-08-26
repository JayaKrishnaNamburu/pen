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
	it("bans matching-path case folds and leaves identifier and display folds alone", () => {
		ruleTester.run("no-bare-case-folding", noBareCaseFolding, {
			valid: [
				{ code: "const folded = foldAndNormalize(query, locale);" },
				{ code: "if (event.key.toLowerCase() === key) {}" },
				{ code: 'if (event.code.toLowerCase() === "keya") {}' },
				{
					code: 'if (navigator.platform.toLowerCase().includes("mac")) {}',
				},
				{ code: 'if (key.toLowerCase() === "style") {}' },
				{
					code: "return parsed.pathname.slice(0, end).trim().toLowerCase();",
				},
				{
					code: "const rest = parsed.pathname; return rest.slice(0, end).trim().toLowerCase();",
				},
				{
					code: "const type = MARKDOWN_CALLOUT_TYPE_MAP[label.toLowerCase()];",
				},
				{
					code: 'const clean = label.replace(/:$/, "").toLowerCase(); const type = MAP[clean];',
				},
				{
					code: 'const calloutType = raw.toLowerCase(); return ["info", "warning"].includes(calloutType) ? calloutType : "info";',
				},
				{
					code: "const normalizedPrompt = prompt.trim().toLowerCase(); return /\\bdelete\\b/.test(normalizedPrompt);",
				},
				{
					code: 'const parts = pattern.split("-").map((part) => part.toLowerCase()); const key = parts.pop()?.toLowerCase() ?? "";',
				},
				{
					code: "const match = prompt.match(/\\b(first|second)\\b/); const word = match[1]?.toLowerCase();",
				},
				{
					code: 'const match = /\\bcallout-(info|warning)\\b/i.exec(cls); const type = (match[1] ?? "info").toLowerCase();',
				},
				{
					code: "return word.charAt(0).toUpperCase() + word.slice(1);",
				},
				{
					code: "return text.replace(/^([a-z])/, (character) => character.toUpperCase());",
				},
				{ code: 'return "image/png".toLowerCase();' },
			],
			invalid: [
				{
					code: "const lower = query.toLowerCase();",
					errors: [
						{
							messageId: "bareFold",
							data: { name: "toLowerCase" },
						},
					],
				},
				{
					code: "title.toUpperCase().includes(query);",
					errors: [
						{
							messageId: "bareFold",
							data: { name: "toUpperCase" },
						},
					],
				},
				{
					code: 'return text.trim().replace(/\\s+/g, " ").toLowerCase();',
					errors: [
						{
							messageId: "bareFold",
							data: { name: "toLowerCase" },
						},
					],
				},
				{
					code: "const folded = query.toLowerCase(); return haystack.includes(folded);",
					errors: [
						{
							messageId: "bareFold",
							data: { name: "toLowerCase" },
						},
					],
				},
				{
					code: "return left.toLowerCase() === right.toLowerCase();",
					errors: [
						{
							messageId: "bareFold",
							data: { name: "toLowerCase" },
						},
						{
							messageId: "bareFold",
							data: { name: "toLowerCase" },
						},
					],
				},
				{
					code: 'const tokens = query.split(" ").map((word) => word.toLowerCase());',
					errors: [
						{
							messageId: "bareFold",
							data: { name: "toLowerCase" },
						},
					],
				},
			],
		});
	});
});
