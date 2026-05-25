import React from "react";
import type { Editor } from "@pen/types";
import { getAIController, type PersistentTextSuggestion } from "@pen/ai";
import { useActiveAISession } from "./useActiveAISession";
import { useAIActions } from "./useAIActions";
import { useSuggestions } from "./useSuggestions";
import { cancelStreamingAIGenerationAfterResolution } from "../utils/cancelStreamingAIGeneration";
import {
	acceptSuggestionGroup,
	areSuggestionControlPositionsEqual,
	dedupeSuggestionsById,
	isTextSuggestion,
	rejectSuggestionGroup,
	resolveSuggestionAnchorElements,
	resolveSuggestionControlPositions,
	resolveSuggestionGroupOptimistically,
	scrollSuggestionIntoView,
} from "./inlineSuggestionControlUtils";

export interface InlineSuggestionControlPosition {
	id: string;
	action: "insert" | "delete" | "mixed";
	suggestionIds: readonly string[];
	host: HTMLElement;
	top: number;
	left: number;
	placement: "anchor" | "right-rail";
}

export interface InlineSuggestionControlsState {
	positions: readonly InlineSuggestionControlPosition[];
	activePosition: InlineSuggestionControlPosition | null;
	activeIndex: number;
	activeSuggestionNumber: number;
	visibleCount: number;
	hasVisibleControls: boolean;
	shouldUseRightEdgeRail: boolean;
	canGoToPrevious: boolean;
	canGoToNext: boolean;
	setActiveIndex: React.Dispatch<React.SetStateAction<number>>;
	goToPrevious: () => void;
	goToNext: () => void;
	acceptActiveSuggestionGroup: () => boolean;
	rejectActiveSuggestionGroup: () => boolean;
}

export function useInlineSuggestionControls(
	editor: Editor,
): InlineSuggestionControlsState {
	const controller = getAIController(editor);
	const actions = useAIActions(editor);
	const suggestions = useSuggestions(editor);
	const activeSession = useActiveAISession(editor);

	const [positions, setPositions] = React.useState<
		readonly InlineSuggestionControlPosition[]
	>([]);
	const [activeIndex, setActiveIndex] = React.useState(0);
	const [resolvingSuggestionIds, setResolvingSuggestionIds] = React.useState<
		readonly string[]
	>([]);

	const activeInlineSessionTurn =
		activeSession?.surface === "inline-edit"
			? activeSession.turns[activeSession.turns.length - 1] ?? null
			: null;
	const shouldUseRightEdgeRail =
		activeSession?.surface === "inline-edit" &&
		activeSession.contextualPrompt?.composer.isOpen === true &&
		activeInlineSessionTurn != null;

	const sessionSuggestionIds = new Set(
		shouldUseRightEdgeRail && activeInlineSessionTurn
			? activeInlineSessionTurn.suggestionIds
			: (activeSession?.pendingSuggestionIds ?? []),
	);
	const resolvingSuggestionIdSet = React.useMemo(
		() => new Set(resolvingSuggestionIds),
		[resolvingSuggestionIds],
	);
	const scopedSuggestions = React.useMemo(
		() => {
			const filteredSuggestions: PersistentTextSuggestion[] = activeSession
				? suggestions.filter(
						(suggestion): suggestion is PersistentTextSuggestion =>
							isTextSuggestion(suggestion) &&
							(suggestion.sessionId === activeSession.id ||
								sessionSuggestionIds.has(suggestion.id)) &&
							!resolvingSuggestionIdSet.has(suggestion.id),
					)
				: suggestions.filter(
						(suggestion): suggestion is PersistentTextSuggestion =>
							isTextSuggestion(suggestion) &&
							!resolvingSuggestionIdSet.has(suggestion.id),
					);
			return dedupeSuggestionsById(filteredSuggestions);
		},
		[activeSession, resolvingSuggestionIdSet, suggestions],
	);

	React.useEffect(() => {
		if (resolvingSuggestionIds.length === 0) {
			return;
		}
		const pendingSuggestionIds = new Set(suggestions.map((suggestion) => suggestion.id));
		setResolvingSuggestionIds((currentIds) =>
			currentIds.filter((suggestionId) => pendingSuggestionIds.has(suggestionId)),
		);
	}, [resolvingSuggestionIds.length, suggestions]);

	React.useLayoutEffect(() => {
		function updatePositions() {
			const nextPositions = resolveSuggestionControlPositions(editor, scopedSuggestions, {
				placement: shouldUseRightEdgeRail ? "right-rail" : "anchor",
			});
			setPositions((currentPositions) =>
				areSuggestionControlPositionsEqual(currentPositions, nextPositions)
					? currentPositions
					: nextPositions,
			);
		}

		updatePositions();
		window.addEventListener("resize", updatePositions);
		window.addEventListener("scroll", updatePositions, true);
		return () => {
			window.removeEventListener("resize", updatePositions);
			window.removeEventListener("scroll", updatePositions, true);
		};
	}, [editor, scopedSuggestions, shouldUseRightEdgeRail]);

	const activeGroupId =
		positions[activeIndex]?.id ??
		positions[positions.length - 1]?.id ??
		null;
	const activePosition = activeGroupId
		? positions.find((position) => position.id === activeGroupId) ?? null
		: null;
	const activeSuggestionNumber =
		activeGroupId == null
			? 0
			: positions.findIndex((position) => position.id === activeGroupId) + 1;
	const activeSuggestionScrollKey =
		activePosition == null
			? null
			: `${activePosition.id}:${activePosition.suggestionIds.join(",")}`;

	React.useEffect(() => {
		if (positions.length === 0) {
			setActiveIndex(0);
			return;
		}
		if (activeGroupId && positions.some((position) => position.id === activeGroupId)) {
			return;
		}
		setActiveIndex(positions.length - 1);
	}, [activeGroupId, positions]);

	React.useEffect(() => {
		if (!activePosition || !activeSuggestionScrollKey) {
			return;
		}
		const anchors = resolveSuggestionAnchorElements(editor, activePosition.suggestionIds);
		if (anchors.length === 0) {
			return;
		}
		scrollSuggestionIntoView(anchors);
	}, [activeSuggestionScrollKey, editor]);

	function goToPrevious() {
		setActiveIndex((currentIndex) => Math.max(0, currentIndex - 1));
	}

	function goToNext() {
		setActiveIndex((currentIndex) =>
			Math.min(positions.length - 1, currentIndex + 1),
		);
	}

	function acceptActiveSuggestionGroup(): boolean {
		if (!activePosition) {
			return false;
		}
		const acceptedSuggestionIds = resolveSuggestionGroupOptimistically(
			setResolvingSuggestionIds,
			activePosition.suggestionIds,
			() => acceptSuggestionGroup(actions, activePosition.suggestionIds),
		);
		if (acceptedSuggestionIds.length === 0) {
			return false;
		}
		cancelStreamingAIGenerationAfterResolution(controller, {
			sessionId: activeSession?.id ?? null,
			suggestionIds: acceptedSuggestionIds,
			suggestions,
		});
		return true;
	}

	function rejectActiveSuggestionGroup(): boolean {
		if (!activePosition) {
			return false;
		}
		const rejectedSuggestionIds = resolveSuggestionGroupOptimistically(
			setResolvingSuggestionIds,
			activePosition.suggestionIds,
			() => rejectSuggestionGroup(actions, activePosition.suggestionIds),
		);
		if (rejectedSuggestionIds.length === 0) {
			return false;
		}
		cancelStreamingAIGenerationAfterResolution(controller, {
			sessionId: activeSession?.id ?? null,
			suggestionIds: rejectedSuggestionIds,
			suggestions,
		});
		return true;
	}

	return {
		positions,
		activePosition,
		activeIndex,
		activeSuggestionNumber,
		visibleCount: positions.length,
		hasVisibleControls: activePosition != null,
		shouldUseRightEdgeRail,
		canGoToPrevious: activeSuggestionNumber > 1,
		canGoToNext: activeSuggestionNumber > 0 && activeSuggestionNumber < positions.length,
		setActiveIndex,
		goToPrevious,
		goToNext,
		acceptActiveSuggestionGroup,
		rejectActiveSuggestionGroup,
	};
}

