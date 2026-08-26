import { aiAutocompleteControllerFacet } from "@input/pen-core";
import type { Editor } from "@input/pen-types";

interface AutocompleteController {
	acceptVisibleSuggestion(): boolean;
	dismiss(reason?: "typing"): void;
	hasVisibleSuggestion(): boolean;
	request(options?: { explicit?: boolean }): boolean;
}

export function getAutocompleteController(
	editor: Editor,
): AutocompleteController | null {
	return (
		(editor.facet(
			aiAutocompleteControllerFacet,
		) as AutocompleteController | null) ?? null
	);
}
