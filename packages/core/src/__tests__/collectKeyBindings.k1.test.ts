import { describe, expect, it } from "vitest";
import {
	type BlockSchema,
	COLLECT_KEY_BINDINGS_SLOT_KEY,
	type Editor,
	type KeyBinding,
	type SchemaRegistry,
} from "@input/pen-types";

import { createHeadlessEditor } from "../editor/editor";
import { keymapFacet } from "../facets/coreFacets";
import { defineBlock } from "../schema/defineBlock";
import { defineExtension } from "../schema/defineExtension";
import { mergeSchemas, SchemaRegistryImpl } from "../schema/registry";
import { createDefaultSchema } from "./fixtures/testSchema";

function collectBindings(editor: Editor): readonly KeyBinding[] {
	const collect = editor.internals.getSlot<
		(registry: SchemaRegistry) => readonly KeyBinding[]
	>(COLLECT_KEY_BINDINGS_SLOT_KEY);
	return collect?.(editor.schema) ?? [];
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
						keymapFacet.of(
							[{ key: "Mod-f", handler }],
							"default",
						),
					],
				}),
			],
		});

		expect(
			collectBindings(editor).some((binding) => binding.handler === handler),
		).toBe(true);
		editor.destroy();
	});

	it("K1: a v1-declared binding still resolves through the collector", () => {
		const handler = () => false;
		const editor = createHeadlessEditor({
			schema: createDefaultSchema(),
			extensions: [
				defineExtension({
					name: "v1-declared",
					keyBindings: [{ key: "Mod-v", handler }],
				}),
			],
		});

		expect(
			collectBindings(editor).some((binding) => binding.handler === handler),
		).toBe(true);
		editor.destroy();
	});

	it("K1: facet-declared and v1-declared bindings resolve together in facet order", () => {
		const highest = () => false;
		const fallback = () => false;
		const editor = createHeadlessEditor({
			schema: createDefaultSchema(),
			extensions: [
				defineExtension({
					name: "v1-default",
					keyBindings: [{ key: "Mod-x", handler: fallback }],
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

	it("K1: a v1-declared binding is registered once, not twice", () => {
		const handler = () => false;
		const binding: KeyBinding = { key: "Mod-d", handler };
		const editor = createHeadlessEditor({
			schema: createDefaultSchema(),
			extensions: [
				defineExtension({
					name: "v1-once",
					keyBindings: [binding],
				}),
			],
		});

		const copies = collectBindings(editor).filter(
			(next) => next.handler === handler,
		);
		expect(copies).toHaveLength(1);
		expect(copies[0]).toBe(binding);
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
					blocks: [keyed as unknown as BlockSchema],
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
