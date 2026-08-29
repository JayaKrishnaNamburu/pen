import { describe, expect, it } from "vitest";
import {
	type Editor,
	type KeyBinding,
} from "@input/pen-types";

import { collectEditorKeyBindings } from "../editor/extensionManager";
import { createHeadlessEditor } from "../editor/editor";
import { keymapFacet } from "../facets/coreFacets";
import { defineBlock } from "../schema/defineBlock";
import { defineExtension } from "../schema/defineExtension";
import { mergeSchemas, SchemaRegistryImpl } from "../schema/registry";
import { createDefaultSchema } from "./fixtures/testSchema";

function collectBindings(editor: Editor): readonly KeyBinding[] {
	return collectEditorKeyBindings(editor);
}

describe("collectKeyBindings K1", () => {
	it("K1: a facet-declared binding resolves through the collector", () => {
		const handler = () => false;
		const editor = createHeadlessEditor({
			schema: createDefaultSchema(),
			extensions: [
				defineExtension({
					name: "facet-declared",
					facets: [
						keymapFacet.of([{ key: "Mod-f", handler }], "default"),
					],
				}),
			],
		});

		expect(
			collectBindings(editor).some(
				(binding) => binding.handler === handler,
			),
		).toBe(true);
		editor.destroy();
	});

	it("K1: two facet-declared bindings resolve together in facet order", () => {
		const highest = () => false;
		const fallback = () => false;
		const editor = createHeadlessEditor({
			schema: createDefaultSchema(),
			extensions: [
				defineExtension({
					name: "facet-default",
					facets: [
						keymapFacet.of(
							[{ key: "Mod-x", handler: fallback }],
							"default",
						),
					],
				}),
				defineExtension({
					name: "facet-highest",
					facets: [
						keymapFacet.of(
							[{ key: "Mod-x", handler: highest }],
							"highest",
						),
					],
				}),
			],
		});

		expect(
			collectBindings(editor)
				.filter((binding) => binding.key === "Mod-x")
				.map((binding) => binding.handler),
		).toEqual([highest, fallback]);
		editor.destroy();
	});

	it("K1: schema block bindings keep context.blockType", () => {
		const handler = () => false;
		const keyed = defineBlock("keyedBlock", {
			content: "inline",
			fieldEditor: "richtext",
			keyBindings: [{ key: "Tab", handler }],
		});
		const editor = createHeadlessEditor({
			schema: mergeSchemas(
				createDefaultSchema(),
				new SchemaRegistryImpl({
					blocks: [keyed],
					inlines: [],
				}),
			),
		});

		const binding = collectBindings(editor).find(
			(next) => next.handler === handler,
		);
		expect(binding?.context?.blockType).toEqual(["keyedBlock"]);
		editor.destroy();
	});
});
