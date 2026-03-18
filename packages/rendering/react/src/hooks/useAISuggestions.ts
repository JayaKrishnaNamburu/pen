import { useCallback, useRef, useSyncExternalStore } from "react";
import type { Editor } from "@pen/types";
import {
	getAISuggestionsController,
	type AISuggestion,
	type AISuggestionsState,
} from "@pen/ai-suggestions";

const EMPTY_STATE: AISuggestionsState = {
	enabled: true,
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

export function useAISuggestions(editor: Editor) {
	const controller = getAISuggestionsController(editor);
	const snapshotRef = useRef<AISuggestionsState>(EMPTY_STATE);

	const subscribe = useCallback(
		(callback: () => void) => controller?.subscribe(callback) ?? (() => {}),
		[controller],
	);

	const getSnapshot = useCallback(() => {
		const nextSnapshot = controller?.getState() ?? EMPTY_STATE;
		const previousSnapshot = snapshotRef.current;
		if (isSameAISuggestionsState(previousSnapshot, nextSnapshot)) {
			return previousSnapshot;
		}
		snapshotRef.current = nextSnapshot;
		return nextSnapshot;
	}, [controller]);

	const state = useSyncExternalStore(
		subscribe,
		getSnapshot,
		() => EMPTY_STATE,
	);

	const activeSuggestion =
		state.suggestions.find(
			(suggestion) => suggestion.id === state.activeSuggestionId,
		) ?? null;
	const activeGroup =
		state.groups.find((group) => group.id === state.activeSuggestionGroupId) ??
		null;

	return {
		state,
		activeSuggestion: activeSuggestion as AISuggestion | null,
		activeGroup,
		setActiveSuggestion: (id: string | null) => {
			controller?.setActiveSuggestion(id);
		},
		setActiveSuggestionGroup: (id: string | null) => {
			controller?.setActiveSuggestionGroup(id);
		},
		applySuggestion: (id: string) => controller?.applySuggestion(id) ?? false,
		applySuggestionGroup: (id: string) =>
			controller?.applySuggestionGroup(id) ?? 0,
		dismissSuggestion: (id: string) => controller?.dismissSuggestion(id) ?? false,
		dismissSuggestionGroup: (id: string) =>
			controller?.dismissSuggestionGroup(id) ?? 0,
	};
}

function isSameAISuggestionsState(
	left: AISuggestionsState,
	right: AISuggestionsState,
): boolean {
	if (left === right) {
		return true;
	}

	return (
		left.enabled === right.enabled &&
		left.status === right.status &&
		left.activeRequestId === right.activeRequestId &&
		left.activeSuggestionId === right.activeSuggestionId &&
		left.activeSuggestionGroupId === right.activeSuggestionGroupId &&
		isSameSuggestions(left.suggestions, right.suggestions) &&
		isSameGroups(left.groups, right.groups) &&
		isSameMetrics(left.metrics, right.metrics)
	);
}

function isSameSuggestions(
	left: AISuggestionsState["suggestions"],
	right: AISuggestionsState["suggestions"],
): boolean {
	if (left === right) {
		return true;
	}
	if (left.length !== right.length) {
		return false;
	}
	for (let index = 0; index < left.length; index += 1) {
		const leftSuggestion = left[index];
		const rightSuggestion = right[index];
		if (
			leftSuggestion?.id !== rightSuggestion?.id ||
			leftSuggestion?.invalidated !== rightSuggestion?.invalidated ||
			leftSuggestion?.from !== rightSuggestion?.from ||
			leftSuggestion?.to !== rightSuggestion?.to ||
			leftSuggestion?.originalText !== rightSuggestion?.originalText ||
			leftSuggestion?.replacementText !== rightSuggestion?.replacementText ||
			leftSuggestion?.title !== rightSuggestion?.title ||
			leftSuggestion?.kind !== rightSuggestion?.kind ||
			leftSuggestion?.reason !== rightSuggestion?.reason ||
			leftSuggestion?.confidence !== rightSuggestion?.confidence ||
			leftSuggestion?.scopeHash !== rightSuggestion?.scopeHash
		) {
			return false;
		}
	}
	return true;
}

function isSameGroups(
	left: AISuggestionsState["groups"],
	right: AISuggestionsState["groups"],
): boolean {
	if (left === right) {
		return true;
	}
	if (left.length !== right.length) {
		return false;
	}
	for (let index = 0; index < left.length; index += 1) {
		const leftGroup = left[index];
		const rightGroup = right[index];
		if (
			leftGroup?.id !== rightGroup?.id ||
			leftGroup?.blockId !== rightGroup?.blockId ||
			leftGroup?.kind !== rightGroup?.kind ||
			leftGroup?.title !== rightGroup?.title ||
			leftGroup?.from !== rightGroup?.from ||
			leftGroup?.to !== rightGroup?.to ||
			leftGroup?.suggestionIds.length !== rightGroup?.suggestionIds.length
		) {
			return false;
		}
		for (
			let suggestionIndex = 0;
			suggestionIndex < (leftGroup?.suggestionIds.length ?? 0);
			suggestionIndex += 1
		) {
			if (
				leftGroup?.suggestionIds[suggestionIndex] !==
				rightGroup?.suggestionIds[suggestionIndex]
			) {
				return false;
			}
		}
	}
	return true;
}

function isSameMetrics(
	left: AISuggestionsState["metrics"],
	right: AISuggestionsState["metrics"],
): boolean {
	return (
		left.requestCount === right.requestCount &&
		left.successCount === right.successCount &&
		left.errorCount === right.errorCount &&
		left.cancelCount === right.cancelCount &&
		left.cacheHitCount === right.cacheHitCount &&
		left.dismissedRepeatDropCount === right.dismissedRepeatDropCount &&
		left.suggestionShownCount === right.suggestionShownCount &&
		left.suggestionAppliedCount === right.suggestionAppliedCount &&
		left.suggestionDismissedCount === right.suggestionDismissedCount &&
		left.promptTokens === right.promptTokens &&
		left.completionTokens === right.completionTokens
	);
}
