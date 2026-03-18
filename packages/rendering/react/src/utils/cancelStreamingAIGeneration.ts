import type { AIController, PersistentSuggestion } from "@pen/ai";

interface CancelStreamingAIGenerationOptions {
	sessionId?: string | null;
	suggestionIds?: readonly string[];
	suggestions?: readonly PersistentSuggestion[];
}

export function cancelStreamingAIGenerationAfterResolution(
	controller: AIController | null | undefined,
	options: CancelStreamingAIGenerationOptions = {},
): void {
	const activeGeneration = controller?.getState().activeGeneration;
	if (!controller || activeGeneration?.status !== "streaming") {
		return;
	}
	if (options.sessionId && activeGeneration.sessionId !== options.sessionId) {
		return;
	}
	if (options.suggestionIds && options.suggestionIds.length > 0) {
		const suggestionIdSet = new Set(options.suggestionIds);
		const matchesResolvedSuggestion = (options.suggestions ?? []).some((suggestion) => {
			if (!suggestionIdSet.has(suggestion.id)) {
				return false;
			}
			return options.sessionId == null || suggestion.sessionId === options.sessionId;
		});
		if (!matchesResolvedSuggestion) {
			return;
		}
	}
	controller.cancelActiveGeneration();
}
