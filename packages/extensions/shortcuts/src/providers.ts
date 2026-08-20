import type { FacetProvider, KeyBinding } from "@input/pen-types";

export const PEN_KEYMAP_FACET_NAME = "pen.keymap" as const;

type ShortcutToggleMark = "bold" | "italic" | "underline";

const TOGGLE_MARK_BY_KEY: Readonly<Record<string, ShortcutToggleMark>> = {
	"Mod-b": "bold",
	"Mod-i": "italic",
	"Mod-u": "underline",
};

export interface ShortcutKeymapProvider extends FacetProvider {
	readonly facetName: typeof PEN_KEYMAP_FACET_NAME;
	readonly commandName: "pen.toggleMark";
	readonly mark: ShortcutToggleMark;
	readonly precedence: "default";
}

export function shortcutsToKeymapProviders(
	bindings: readonly Pick<KeyBinding, "key">[],
): readonly ShortcutKeymapProvider[] {
	const providers: ShortcutKeymapProvider[] = [];

	for (const binding of bindings) {
		// Mod-k stays unmapped: host onToggleLink; no catalog command
		if (binding.key === "Mod-k") continue;

		const mark = TOGGLE_MARK_BY_KEY[binding.key];
		if (!mark) continue;

		providers.push({
			facetName: PEN_KEYMAP_FACET_NAME,
			commandName: "pen.toggleMark",
			mark,
			precedence: "default",
		});
	}

	return providers;
}
