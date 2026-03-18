import {
	getAISuggestionsController,
	type AISuggestionsExtensionConfig,
	type AISuggestionsState,
} from "@pen/ai-suggestions";
import type { Editor } from "@pen/types";
import { useEffect, useState } from "react";

const EMPTY_AI_SUGGESTIONS_STATE: AISuggestionsState = {
	enabled: false,
	status: "idle",
	activeRequestId: null,
	activeSuggestionId: null,
	activeSuggestionGroupId: null,
	suggestions: [],
	groups: [],
	metrics: {
		requestCount: 0,
		successCount: 0,
		errorCount: 0,
		cancelCount: 0,
		cacheHitCount: 0,
		dismissedRepeatDropCount: 0,
		suggestionShownCount: 0,
		suggestionAppliedCount: 0,
		suggestionDismissedCount: 0,
		promptTokens: 0,
		completionTokens: 0,
	},
};

const EMPTY_AI_SUGGESTIONS_SETTINGS: AISuggestionsExtensionConfig = {};

export function usePlaygroundAISuggestions(editor: Editor): {
	controller: ReturnType<typeof getAISuggestionsController>;
	state: AISuggestionsState;
	settings: AISuggestionsExtensionConfig;
} {
	const controller = getAISuggestionsController(editor);
	const [, setVersion] = useState(0);

	useEffect(() => {
		if (!controller) {
			return;
		}
		return controller.subscribe(() => {
			setVersion((version) => version + 1);
		});
	}, [controller]);

	return {
		controller,
		state: controller?.getState() ?? EMPTY_AI_SUGGESTIONS_STATE,
		settings: controller?.getRuntimeSettings() ?? EMPTY_AI_SUGGESTIONS_SETTINGS,
	};
}
