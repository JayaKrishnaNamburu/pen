import { aiAutocompleteControllerFacet } from "@input/pen-core";
import type { Editor } from "@input/pen-types";

interface ReactAutocompleteController {
	acceptVisibleSuggestion(): boolean;
	dismiss(reason?: "typing"): void;
	hasVisibleSuggestion(): boolean;
	request(options?: { explicit?: boolean }): boolean;
}

export function getAutocompleteController(
	editor: Editor,
): ReactAutocompleteController | null {
	return (
		(editor.facet(
			aiAutocompleteControllerFacet,
		) as ReactAutocompleteController | null) ?? null
	);
}
