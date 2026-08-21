import { describe, expect, it } from "vitest";
import { createHeadlessEditor, keymapFacet } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema-default";
import { richTextShortcutsExtension } from "../index";

describe("@input/pen-shortcuts", () => {
	it("creates default rich-text shortcut keymap providers", () => {
		const extension = richTextShortcutsExtension();

		expect(extension.name).toBe("rich-text-shortcuts");
		expect(extension.keyBindings).toBeUndefined();
		expect(extension.facets).toHaveLength(3);
		expect(
			extension.facets?.every(
				(provider) =>
					provider.facetName === "pen.keymap" &&
					provider.precedence === "highest",
			),
		).toBe(true);
	});

	it("omits a mark when its binding list is nulled", () => {
		const extension = richTextShortcutsExtension({
			bindings: { italic: null },
		});

		expect(extension.facets).toHaveLength(2);
	});

	it("adds a Mod-k provider when onToggleLink is set", () => {
		const editor = createHeadlessEditor({
			schema: defaultSchema,
			extensions: [
				richTextShortcutsExtension({
					onToggleLink: () => true,
				}),
			],
		});

		expect(editor.facet(keymapFacet).map((binding) => binding.key)).toEqual([
			"Mod-b",
			"Mod-i",
			"Mod-u",
			"Mod-k",
		]);
		editor.destroy();
	});
});
