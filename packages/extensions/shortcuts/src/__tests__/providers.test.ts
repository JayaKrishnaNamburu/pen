import { describe, expect, it } from "vitest";
import { richTextShortcutsExtension } from "../richTextShortcutsExtension";
import {
	PEN_KEYMAP_FACET_NAME,
	shortcutsToKeymapProviders,
} from "../providers";

describe("R-keymap / 1.3", () => {
	it("R-keymap / 1.3: maps Mod-b / Mod-i / Mod-u to pen.keymap providers", () => {
		const providers = shortcutsToKeymapProviders([
			{ key: "Mod-b" },
			{ key: "Mod-i" },
			{ key: "Mod-u" },
		]);

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

	it("R-keymap / 1.3: preserves Extension.keyBindings order", () => {
		const providers = shortcutsToKeymapProviders([
			{ key: "Mod-u" },
			{ key: "Mod-b" },
			{ key: "Mod-i" },
		]);

		expect(providers.map((provider) => provider.mark)).toEqual([
			"underline",
			"bold",
			"italic",
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

	it("R-keymap / 1.3: maps an empty list to no providers", () => {
		expect(shortcutsToKeymapProviders([])).toEqual([]);
	});

	it("R-keymap / 1.3: leaves Mod-k unmapped", () => {
		expect(shortcutsToKeymapProviders([{ key: "Mod-k" }])).toEqual([]);
	});

	it("R-keymap / 1.3: skips unknown keys", () => {
		expect(
			shortcutsToKeymapProviders([
				{ key: "Ctrl-b" },
				{ key: "Mod-Shift-k" },
				{ key: "Enter" },
			]),
		).toEqual([]);
	});

	it("R-keymap / 1.3: keeps only catalog keys in encounter order", () => {
		const providers = shortcutsToKeymapProviders([
			{ key: "Mod-k" },
			{ key: "Mod-u" },
			{ key: "Ctrl-b" },
			{ key: "Mod-b" },
			{ key: "Enter" },
			{ key: "Mod-i" },
		]);

		expect(providers.map((provider) => provider.mark)).toEqual([
			"underline",
			"bold",
			"italic",
		]);
	});

	it("R-keymap / 1.3: maps default rich-text shortcut keyBindings", () => {
		const extension = richTextShortcutsExtension();
		const providers = shortcutsToKeymapProviders(extension.keyBindings ?? []);

		expect(providers).toEqual([
			{
				facetName: "pen.keymap",
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

	it("R-keymap / 1.3: drops Mod-k from extension keyBindings when onToggleLink is set", () => {
		const extension = richTextShortcutsExtension({
			onToggleLink: () => true,
		});

		expect(extension.keyBindings?.map((binding) => binding.key)).toEqual([
			"Mod-b",
			"Mod-i",
			"Mod-u",
			"Mod-k",
		]);
		expect(
			shortcutsToKeymapProviders(extension.keyBindings ?? []).map(
				(provider) => provider.mark,
			),
		).toEqual(["bold", "italic", "underline"]);
	});
});
