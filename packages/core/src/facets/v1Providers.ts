import type { Extension, FacetProvider } from "@input/pen-types";

import {
	decorationsFacet,
	inputRulesFacet,
	keymapFacet,
} from "./coreFacets";
import { keyBindingPriorityToPrecedence } from "./precedence";

export function v1ExtensionProviders(
	extensions: readonly Extension[],
): FacetProvider[] {
	const providers: FacetProvider[] = [];
	for (const ext of extensions) {
		for (const binding of ext.keyBindings ?? []) {
			providers.push(
				keymapFacet.of(
					[binding],
					keyBindingPriorityToPrecedence(binding.priority ?? 300),
				),
			);
		}
		for (const rule of ext.inputRules ?? []) {
			providers.push(inputRulesFacet.of(rule));
		}
		if (ext.decorations) {
			providers.push(decorationsFacet.of(ext.decorations));
		}
	}
	return providers;
}
