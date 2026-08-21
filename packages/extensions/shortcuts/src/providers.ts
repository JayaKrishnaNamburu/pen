import {
	keyBindingPriorityToPrecedence,
	keymapFacet,
} from "@input/pen-core";
import type { FacetProvider, KeyBinding } from "@input/pen-types";

export const PEN_KEYMAP_FACET_NAME = "pen.keymap" as const;

export interface ShortcutKeymapProvider extends FacetProvider {
	readonly facetName: typeof PEN_KEYMAP_FACET_NAME;
}

export function shortcutsToKeymapProviders(
	bindings: readonly KeyBinding[],
): readonly FacetProvider[] {
	return bindings.map((binding) =>
		keymapFacet.of(
			[binding],
			keyBindingPriorityToPrecedence(binding.priority ?? 300),
		),
	);
}
