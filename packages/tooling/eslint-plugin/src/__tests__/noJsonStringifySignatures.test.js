import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe, it } from "vitest";
import { noJsonStringifySignatures } from "../rules/noJsonStringifySignatures.js";

const ruleTester = new RuleTester({
	languageOptions: {
		parser: tseslint.parser,
		parserOptions: { ecmaFeatures: { jsx: true } },
	},
});

const file = "packages/core/src/seeded-stringify.ts";

describe("no-json-stringify-signatures (SCALE2)", () => {
	it("SCALE2: flags JSON.stringify and consumes a matching allowlist symbol", () => {
		ruleTester.run(
			"no-json-stringify-signatures",
			noJsonStringifySignatures,
			{
				valid: [
					{
						code: "function serializePenClipboardPayload() { return JSON.stringify(payload); }\n",
						filename: file,
						options: [
							{
								allowlist: [
									{
										file,
										symbol: "serializePenClipboardPayload",
										reason: "clipboard wire format",
									},
								],
							},
						],
					},
				],
				invalid: [
					{
						code: "function signature() { return JSON.stringify(summary); }\n",
						filename: file,
						options: [{ allowlist: [] }],
						errors: [
							{
								messageId: "stringify",
								data: { symbol: "signature", file },
							},
						],
					},
					{
						code: "class EditorAnchorsImpl { serialize() { return JSON.stringify(payload); } }\n",
						filename: "packages/core/src/editor/anchors.ts",
						options: [{ allowlist: [] }],
						errors: [
							{
								messageId: "stringify",
								data: {
									symbol: "serialize",
									file: "packages/core/src/editor/anchors.ts",
								},
							},
						],
					},
				],
			},
		);
	});
});
