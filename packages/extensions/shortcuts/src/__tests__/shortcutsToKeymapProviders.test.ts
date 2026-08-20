import { describe, expect, it } from "vitest";
import type { KeyBinding } from "@input/pen-types";
import {
	richTextShortcutsExtension,
	shortcutsToKeymapProviders,
	PEN_KEYMAP_FACET_NAME,
} from "../index";

function binding(key: string): Pick<KeyBinding, "key"> {
	return { key };
}

describe("K2 / 4.3 shortcutsToKeymapProviders", () => {
	it("K2 / 4.3: maps Mod-b/i/u to pen.toggleMark keymap providers", () => {
		const extension = richTextShortcutsExtension();
		const providers = shortcutsToKeymapProviders(extension.keyBindings ?? []);

		expect(providers).toEqual([
			{
				facetName: PEN_KEYMAP_FACET_NAME,
				commandName: "pen.toggleMark",
				mark: "bold",
				precedence: "default",
			},
			{
				facetName: "pen.keymap",
				commandName: "pen.toggleMark",
				mark: "italic",
				precedence: "default",
			},
			{
				facetName: "pen.keymap",
				commandName: "pen.toggleMark",
				mark: "underline",
				precedence: "default",
			},
		]);
	});

	it("K2 / 4.3: leaves Mod-k unmapped", () => {
		const extension = richTextShortcutsExtension({
			onToggleLink: () => true,
		});

		expect(extension.keyBindings?.map((item) => item.key)).toEqual([
			"Mod-b",
			"Mod-i",
			"Mod-u",
			"Mod-k",
		]);

		const providers = shortcutsToKeymapProviders(extension.keyBindings ?? []);

		expect(providers).toHaveLength(3);
		expect(providers.map((provider) => provider.mark)).toEqual([
			"bold",
			"italic",
			"underline",
		]);
		expect(
			providers.every(
				(provider) =>
					provider.facetName === "pen.keymap" &&
					provider.commandName === "pen.toggleMark" &&
					provider.precedence === "default",
			),
		).toBe(true);
	});

	it("4.3: maps an empty list to no providers", () => {
		expect(shortcutsToKeymapProviders([])).toEqual([]);
	});

	it("4.3: skips unknown keys and a Mod-k-only list", () => {
		expect(
			shortcutsToKeymapProviders([
				binding("Mod-k"),
				binding("Mod-a"),
				binding("Shift-Enter"),
			]),
		).toEqual([]);
	});
});
