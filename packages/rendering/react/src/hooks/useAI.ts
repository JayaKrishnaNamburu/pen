import { useSyncExternalStore } from "react";
import { aiControllerFacet } from "@input/pen-core";
import type { Editor } from "@input/pen-types";
import type { AIController, AIControllerState } from "@input/pen-ai";

const EMPTY_AI_STATE: AIControllerState = {
	status: "idle",
	activeGeneration: null,
	sessions: [],
	activeSessionId: null,
	suggestMode: false,
	ephemeralSuggestion: null,
	streamingReviewPreview: null,
	commandMenuOpen: false,
} as AIControllerState;

export function useAI(editor: Editor): AIControllerState {
	const controller =
		(editor.facet(aiControllerFacet) as AIController | null) ?? null;

	return useSyncExternalStore(
		(callback) => {
			if (!controller) {
				return () => {};
			}
			return controller.subscribe(callback);
		},
		() => controller?.getState() ?? EMPTY_AI_STATE,
		() => EMPTY_AI_STATE,
	);
}
