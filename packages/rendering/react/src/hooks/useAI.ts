import { useSyncExternalStore } from "react";
import type { Editor } from "@input/pen-types";
import { getAIController, type AIControllerState } from "@input/pen-ai";

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
	const controller = getAIController(editor);

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
