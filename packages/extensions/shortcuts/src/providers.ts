import {
	keyBindingPriorityToPrecedence,
	keymapFacet,
} from "@input/pen-core";
import type { FacetProvider, KeyBinding } from "@input/pen-types";

/** Facet name every keymap contribution registers under. */
export const PEN_KEYMAP_FACET_NAME = "pen.keymap" as const;

/**
 * Wrap key bindings as keymap facet providers, one provider per
 * binding, so an extension can hand them to `facets` directly. A
 * binding's `priority` becomes its precedence; bindings without one
 * default to 300, which places them below the built-in rich-text
 * shortcuts.
 */
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
