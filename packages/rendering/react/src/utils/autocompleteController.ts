import type { Editor } from "@pen/types";
import { AI_AUTOCOMPLETE_CONTROLLER_SLOT } from "@pen/types";

interface ReactAutocompleteController {
	acceptVisibleSuggestion(): boolean;
	dismiss(reason?: "typing"): void;
	hasVisibleSuggestion(): boolean;
	request(options?: { explicit?: boolean }): boolean;
}

export function getAutocompleteController(
	editor: Editor,
): ReactAutocompleteController | null {
	return editor.internals.getSlot<ReactAutocompleteController>(
		AI_AUTOCOMPLETE_CONTROLLER_SLOT,
	) ?? null;
}
