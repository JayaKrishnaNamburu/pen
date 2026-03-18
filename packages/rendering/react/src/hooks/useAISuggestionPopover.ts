import React from "react";
import type { Editor } from "@pen/types";
import type { AISuggestionGroup } from "@pen/ai-suggestions";
import { queryAISuggestionAnchorElement } from "../utils/aiDomScope";
import { useAISuggestions } from "./useAISuggestions";

export interface AISuggestionPopoverPosition {
	top: number;
	left: number;
	width: number;
	height: number;
}

export function useAISuggestionPopover(editor: Editor) {
	const {
		state,
		activeSuggestion,
		activeGroup,
		setActiveSuggestion,
		setActiveSuggestionGroup,
		applySuggestionGroup,
		dismissSuggestionGroup,
	} = useAISuggestions(editor);
	const [position, setPosition] =
		React.useState<AISuggestionPopoverPosition | null>(null);

	const activeGroupIndex =
		activeGroup == null
			? -1
			: state.groups.findIndex((group) => group.id === activeGroup.id);

	const closeSuggestion = React.useCallback(() => {
		setActiveSuggestion(null);
		setPosition(null);
	}, [setActiveSuggestion]);

	const updatePositionFromGroup = React.useCallback(
		(group: AISuggestionGroup | null) => {
			const anchorSuggestionId = group?.suggestionIds[0] ?? null;
			if (!anchorSuggestionId) {
				setPosition(null);
				return;
			}

			const anchor = queryAISuggestionAnchorElement(editor, anchorSuggestionId);
			if (!anchor) {
				setPosition(null);
				return;
			}

			const rect = anchor.getBoundingClientRect();
			setPosition({
				top: rect.bottom + window.scrollY + 8,
				left: rect.left + window.scrollX,
				width: rect.width,
				height: rect.height,
			});
		},
		[editor],
	);

	const openGroup = React.useCallback(
		(groupId: string) => {
			const group = state.groups.find((item) => item.id === groupId) ?? null;
			if (!group) {
				return;
			}
			setActiveSuggestionGroup(groupId);
			updatePositionFromGroup(group);
		},
		[state.groups, setActiveSuggestionGroup, updatePositionFromGroup],
	);

	const openSuggestion = React.useCallback(
		(suggestionId: string) => {
			const groupId =
				state.groups.find((group) => group.suggestionIds.includes(suggestionId))?.id ??
				null;
			if (groupId) {
				openGroup(groupId);
				return;
			}
			setActiveSuggestion(suggestionId);
		},
		[openGroup, setActiveSuggestion, state.groups],
	);

	const goToPreviousGroup = React.useCallback(() => {
		if (activeGroupIndex <= 0) {
			return;
		}
		openGroup(state.groups[activeGroupIndex - 1]!.id);
	}, [activeGroupIndex, openGroup, state.groups]);

	const goToNextGroup = React.useCallback(() => {
		if (activeGroupIndex < 0 || activeGroupIndex >= state.groups.length - 1) {
			return;
		}
		openGroup(state.groups[activeGroupIndex + 1]!.id);
	}, [activeGroupIndex, openGroup, state.groups]);

	const applyActiveGroup = React.useCallback(() => {
		if (!activeGroup) {
			return 0;
		}
		const count = applySuggestionGroup(activeGroup.id);
		setPosition(null);
		return count;
	}, [activeGroup, applySuggestionGroup]);

	const dismissActiveGroup = React.useCallback(() => {
		if (!activeGroup) {
			return 0;
		}
		const count = dismissSuggestionGroup(activeGroup.id);
		setPosition(null);
		return count;
	}, [activeGroup, dismissSuggestionGroup]);

	React.useLayoutEffect(() => {
		if (!activeGroup) {
			return;
		}

		const updatePosition = () => {
			updatePositionFromGroup(activeGroup);
		};

		updatePosition();
		window.addEventListener("resize", updatePosition);
		window.addEventListener("scroll", updatePosition, true);

		return () => {
			window.removeEventListener("resize", updatePosition);
			window.removeEventListener("scroll", updatePosition, true);
		};
	}, [activeGroup, updatePositionFromGroup]);

	return {
		activeSuggestion,
		activeGroup,
		activeGroupIndex,
		groupCount: state.groups.length,
		position,
		openSuggestion,
		openGroup,
		closeSuggestion,
		goToPreviousGroup,
		goToNextGroup,
		applyActiveGroup,
		dismissActiveGroup,
	};
}
