import { useSyncExternalStore } from "react";
import { aiControllerFacet } from "@input/pen-core";
import type { Editor } from "@input/pen-types";
import type { AIController, PersistentSuggestion } from "@input/pen-ai";

const EMPTY_SUGGESTIONS: readonly PersistentSuggestion[] = [];

export function useSuggestions(editor: Editor): readonly PersistentSuggestion[] {
	const controller =
		(editor.facet(aiControllerFacet) as AIController | null) ?? null;

	return useSyncExternalStore(
		(callback) => {
			if (!controller) {
				return () => {};
			}
			return controller.subscribe(callback);
		},
		() => controller?.getSuggestions() ?? EMPTY_SUGGESTIONS,
		() => EMPTY_SUGGESTIONS,
	);
}
