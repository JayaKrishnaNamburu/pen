import { describe, expect, it } from "vitest";
import {
	createEditor,
	createHeadlessEditor,
	keymapFacet,
} from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema-default";
import { richTextShortcutsExtension } from "../index";

const RICH_TEXT_MARK_KEYS = ["Mod-b", "Mod-i", "Mod-u"] as const;

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

	it("a bare createEditor() does not install Mod-b / Mod-i / Mod-u", () => {
		const editor = createEditor({ schema: defaultSchema });
		const keys = new Set(
			editor.facet(keymapFacet).map((binding) => binding.key),
		);

		for (const key of RICH_TEXT_MARK_KEYS) {
			expect(keys.has(key)).toBe(false);
		}

		editor.destroy();
	});

	it("createHeadlessEditor() does not install Mod-b / Mod-i / Mod-u, including useDefaultExtensions", () => {
		const bare = createHeadlessEditor({ schema: defaultSchema });
		const withCoreFallback = createHeadlessEditor({
			schema: defaultSchema,
			useDefaultExtensions: true,
		});

		for (const editor of [bare, withCoreFallback]) {
			const keys = new Set(
				editor.facet(keymapFacet).map((binding) => binding.key),
			);
			for (const key of RICH_TEXT_MARK_KEYS) {
				expect(keys.has(key)).toBe(false);
			}
			editor.destroy();
		}
	});

	it("installing richTextShortcutsExtension() is what registers Mod-b / Mod-i / Mod-u", () => {
		const editor = createHeadlessEditor({
			schema: defaultSchema,
			extensions: [richTextShortcutsExtension()],
		});
		const keys = new Set(
			editor.facet(keymapFacet).map((binding) => binding.key),
		);

		for (const key of RICH_TEXT_MARK_KEYS) {
			expect(keys.has(key)).toBe(true);
		}

		editor.destroy();
	});

	it("toggles bold and italic on a live selection when installed", () => {
		const editor = createHeadlessEditor({
			schema: defaultSchema,
			extensions: [richTextShortcutsExtension()],
		});
		const blockId = editor.firstBlock()!.id;

		editor.apply(
			[
				{
					type: "splice-text",
					blockId,
					from: 0,
				to: 0,
				insert: "hello",
				},
			],
			{ origin: "user" },
		);
		editor.selectText(blockId, 0, 5);

		const bindings = editor.facet(keymapFacet);
		const bold = bindings.find((binding) => binding.key === "Mod-b");
		const italic = bindings.find((binding) => binding.key === "Mod-i");
		expect(bold).toBeDefined();
		expect(italic).toBeDefined();

		expect(bold!.handler(editor, {} as KeyboardEvent)).toBe(true);
		expect(editor.getBlock(blockId)?.textDeltas()).toEqual([
			{ insert: "hello", attributes: { bold: true } },
		]);

		expect(italic!.handler(editor, {} as KeyboardEvent)).toBe(true);
		expect(editor.getBlock(blockId)?.textDeltas()).toEqual([
			{ insert: "hello", attributes: { bold: true, italic: true } },
		]);

		expect(bold!.handler(editor, {} as KeyboardEvent)).toBe(true);
		expect(editor.getBlock(blockId)?.textDeltas()).toEqual([
			{ insert: "hello", attributes: { italic: true } },
		]);

		editor.destroy();
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
