import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe, it } from "vitest";
import { noSelectionStateProperties } from "../rules/noSelectionStateProperties.js";

const ruleTester = new RuleTester({
	languageOptions: { parser: tseslint.parser },
});

const file = "packages/core/src/seeded-selection-props.ts";

describe("no-selection-state-properties", () => {
	it("flags SelectionState-shaped property reads and leaves helpers and snapshots alone", () => {
		ruleTester.run(
			"no-selection-state-properties",
			noSelectionStateProperties,
			{
				valid: [
					{
						code: "if (isCollapsed(sel)) { return; }\n",
						filename: file,
						options: [{ allowlist: [] }],
					},
					{
						code: "const range = snapshot.blockRange;\n",
						filename: file,
						options: [{ allowlist: [] }],
					},
					{
						code: "if (selection.isCollapsed()) { return; }\n",
						filename: file,
						options: [{ allowlist: [] }],
					},
					{
						code: "if (selection.isCollapsed) { return; }\n",
						filename:
							"packages/rendering/dom/src/field-editor/contenteditableDomHelpers.ts",
						options: [
							{
								allowlist: [
									{
										file: "packages/rendering/dom/src/field-editor/contenteditableDomHelpers.ts",
										construct: "selection.isCollapsed",
										reason: "browser Selection.isCollapsed",
									},
								],
							},
						],
					},
				],
				invalid: [
					{
						code: "if (sel.isCollapsed) { return; }\n",
						filename: file,
						options: [{ allowlist: [] }],
						errors: [
							{
								messageId: "property",
								data: {
									construct: "sel.isCollapsed",
									file,
								},
							},
						],
					},
					{
						code: "const range = turn.selection.blockRange;\n",
						filename: file,
						options: [{ allowlist: [] }],
						errors: [
							{
								messageId: "property",
								data: {
									construct: "turn.selection.blockRange",
									file,
								},
							},
						],
					},
				],
			},
		);
	});
});
