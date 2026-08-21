import { describe, expect, it } from "vitest";
import {
	createHeadlessEditor,
	keyBindingPriorityToPrecedence,
	keymapFacet,
} from "@input/pen-core";
import type { Extension, KeyBinding } from "@input/pen-types";
import { defaultSchema } from "@input/pen-schema-default";
import { richTextShortcutsExtension } from "../richTextShortcutsExtension";
import { PEN_KEYMAP_FACET_NAME } from "../providers";

function competitor(binding: KeyBinding): Extension {
	return {
		name: "keymap-competitor",
		version: "0.0.0",
		keyBindings: [binding],
	};
}

describe("R-keymap / K1", () => {
	it("R-keymap / K1: ships one highest provider per default mark binding", () => {
		const extension = richTextShortcutsExtension();

		expect(extension.keyBindings).toBeUndefined();
		expect(extension.facets?.map((provider) => provider.facetName)).toEqual([
			PEN_KEYMAP_FACET_NAME,
			PEN_KEYMAP_FACET_NAME,
			PEN_KEYMAP_FACET_NAME,
		]);
		expect(extension.facets?.map((provider) => provider.precedence)).toEqual([
			"highest",
			"highest",
			"highest",
		]);
	});

	it("K1: priority 100 still precedes a shim-lifted undeclared-priority binding", () => {
		const editor = createHeadlessEditor({
			schema: defaultSchema,
			extensions: [
				richTextShortcutsExtension(),
				competitor({
					key: "Mod-b",
					handler: () => true,
				}),
			],
		});

		const modB = editor
			.facet(keymapFacet)
			.filter((binding) => binding.key === "Mod-b");
		expect(modB).toHaveLength(2);
		expect(modB[0]?.priority).toBe(100);
		expect(modB[0]?.description).toBe("Toggle bold formatting");
		expect(modB[1]?.priority).toBeUndefined();
		expect(keyBindingPriorityToPrecedence(modB[0]?.priority ?? 300)).toBe(
			"highest",
		);
		expect(keyBindingPriorityToPrecedence(modB[1]?.priority ?? 300)).toBe(
			"default",
		);
		editor.destroy();
	});

	it("K1: a priority-100 competitor still precedes a default-300 binding", () => {
		const editor = createHeadlessEditor({
			schema: defaultSchema,
			extensions: [
				richTextShortcutsExtension({
					bindings: { bold: ["Mod-f"], italic: null, underline: null },
				}),
				competitor({
					key: "Mod-f",
					handler: () => true,
				}),
			],
		});

		const modF = editor
			.facet(keymapFacet)
			.filter((binding) => binding.key === "Mod-f");
		expect(modF.map((binding) => binding.priority ?? 300)).toEqual([
			100, 300,
		]);
		editor.destroy();
	});
});
