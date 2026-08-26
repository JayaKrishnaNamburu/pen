import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe, it } from "vitest";
import { noV1ExtensionFields } from "../rules/noV1ExtensionFields.js";

const ruleTester = new RuleTester({
	languageOptions: {
		parser: tseslint.parser,
	},
});

describe("no-v1-extension-fields", () => {
	it("flags v1 fields on extension objects and leaves the grep false positives alone", () => {
		ruleTester.run("no-v1-extension-fields", noV1ExtensionFields, {
			valid: [
				{
					code: "const keyBindings = []; return keyBindings;",
				},
				{
					code: "function build(keyBindings) { return keyBindings; }",
				},
				{
					code: 'defineBlock("heading", { type: "heading", keyBindings: [{ key: "Mod-1", handler: () => true }] });',
				},
				{
					code: "const bindings = schema.keyBindings;",
				},
				{
					code: "const set = extension.decorations(state, editor);",
				},
				{
					code: "const rules = ext.inputRules;",
				},
				{
					code: "facets.push(keymapFacet.of(bindings));",
				},
				{
					code: "facets.push(decorationsFacet.of((state, editor) => set));",
				},
				{
					code: "facets.push(inputRulesFacet.of(rule));",
				},
				{
					// the grep false positive: shortcuts already migrated; the name collides
					code: `
export function richTextShortcutsExtension(): Extension {
	return {
		name: "rich-text-shortcuts",
		version: "0.0.0",
		facets: shortcutsToKeymapProviders(buildKeyBindings()),
	};
}
function buildKeyBindings() {
	const keyBindings = [];
	keyBindings.push({ key: "Mod-b", handler: () => true });
	return keyBindings;
}
`,
				},
				{
					code: 'defineExtension({ name: "x", facets: [keymapFacet.of(bindings)] });',
				},
				{
					code: "const { decorations } = collect(state);",
				},
			],
			invalid: [
				{
					code: 'defineExtension({ name: "x", keyBindings: [] });',
					errors: [
						{
							messageId: "v1Field",
							data: {
								field: "keyBindings",
								facet: "keymapFacet",
							},
						},
					],
				},
				{
					code: 'defineExtension({ name: "x", inputRules: [] });',
					errors: [
						{
							messageId: "v1Field",
							data: {
								field: "inputRules",
								facet: "inputRulesFacet",
							},
						},
					],
				},
				{
					code: 'defineExtension({ name: "x", decorations: () => empty });',
					errors: [
						{
							messageId: "v1Field",
							data: {
								field: "decorations",
								facet: "decorationsFacet",
							},
						},
					],
				},
				{
					code: 'function make(): Extension { return { name: "x", keyBindings: [] }; }',
					errors: [
						{
							messageId: "v1Field",
							data: {
								field: "keyBindings",
								facet: "keymapFacet",
							},
						},
					],
				},
				{
					code: 'const ext: Extension = { name: "x", decorations: () => empty };',
					errors: [
						{
							messageId: "v1Field",
							data: {
								field: "decorations",
								facet: "decorationsFacet",
							},
						},
					],
				},
				{
					code: 'const spec = { name: "x", keyBindings: [] }; defineExtension(spec);',
					errors: [
						{
							messageId: "v1Field",
							data: {
								field: "keyBindings",
								facet: "keymapFacet",
							},
						},
					],
				},
			],
		});
	});
});
