import React from "react";
import { useAIStructuredPreview } from "../../hooks/useAIStructuredPreview";
import { useSuggestions } from "../../hooks/useSuggestions";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";
import { cancelStreamingAIGenerationAfterResolution } from "../../utils/cancelStreamingAIGeneration";
import { composeRefs } from "../../utils/composeRefs";
import { renderAIChangeListItems } from "./changeListItems";
import {
	clampReviewFocusIndex,
	findReviewFocusElement,
	groupStructuralReviewItems,
	resolveReviewFocusTarget,
	resolveReviewFocusTargetId,
} from "./changeListUtils";
import { useAIContext } from "./root";

export interface AIChangeListProps extends AsChildProps {
	emptyState?: React.ReactNode;
	ref?: React.Ref<HTMLElement>;
}

export function AIChangeList(props: AIChangeListProps) {
	const { emptyState, ref, ...rest } = props;
	const { editor, controller, state } = useAIContext();

	const suggestions = useSuggestions(editor);
	const generation = state.activeGeneration;
	const structuredPreview = useAIStructuredPreview(editor, generation);
	const rootRef = React.useRef<HTMLElement | null>(null);
	const activeSessionId = generation?.sessionId ?? null;

	function acceptSuggestionAndStop(suggestionId: string): void {
		const accepted = controller?.acceptSuggestion(suggestionId) ?? false;
		if (!accepted) {
			return;
		}
		cancelStreamingAIGenerationAfterResolution(controller, {
			sessionId: activeSessionId,
			suggestionIds: [suggestionId],
			suggestions,
		});
	}

	function rejectSuggestionAndStop(suggestionId: string): void {
		const rejected = controller?.rejectSuggestion(suggestionId) ?? false;
		if (!rejected) {
			return;
		}
		cancelStreamingAIGenerationAfterResolution(controller, {
			sessionId: activeSessionId,
			suggestionIds: [suggestionId],
			suggestions,
		});
	}

	function acceptReviewItemsAndStop(reviewItemIds: readonly string[]): void {
		const accepted = controller?.acceptReviewItems(reviewItemIds) ?? false;
		if (!accepted) {
			return;
		}
		cancelStreamingAIGenerationAfterResolution(controller, {
			sessionId: activeSessionId,
		});
	}

	function rejectReviewItemsAndStop(reviewItemIds: readonly string[]): void {
		const rejected = controller?.rejectReviewItems(reviewItemIds) ?? false;
		if (!rejected) {
			return;
		}
		cancelStreamingAIGenerationAfterResolution(controller, {
			sessionId: activeSessionId,
		});
	}

	function acceptReviewItemAndStop(reviewItemId: string): void {
		const accepted = controller?.acceptReviewItem(reviewItemId) ?? false;
		if (!accepted) {
			return;
		}
		cancelStreamingAIGenerationAfterResolution(controller, {
			sessionId: activeSessionId,
		});
	}

	function rejectReviewItemAndStop(reviewItemId: string): void {
		const rejected = controller?.rejectReviewItem(reviewItemId) ?? false;
		if (!rejected) {
			return;
		}
		cancelStreamingAIGenerationAfterResolution(controller, {
			sessionId: activeSessionId,
		});
	}
	const [subgroupExpandedState, setSubgroupExpandedState] = React.useState<
		Record<string, boolean>
	>({});
	const [activeReviewTargetId, setActiveReviewTargetId] = React.useState<
		string | null
	>(null);
	const previewReviewItems = structuredPreview.preview?.reviewItems ?? [];
	const isPreviewActive =
		generation?.status === "streaming" && previewReviewItems.length > 0;
	const structuralReviewItems = isPreviewActive
		? previewReviewItems
		: (generation?.reviewItems ?? []);
	const canApplyReviewActions =
		generation?.status !== "streaming" && generation?.planState === "validated";
	const structuralReviewGroups = groupStructuralReviewItems(structuralReviewItems);

	function toggleSubgroupExpanded(
		subgroupKey: string,
		defaultExpanded: boolean,
	): void {
		setSubgroupExpandedState((currentState) => ({
			...currentState,
			[subgroupKey]: !(currentState[subgroupKey] ?? defaultExpanded),
		}));
	}

	const { nodes: changeListItems, reviewFocusTargets } = renderAIChangeListItems({
		editor,
		suggestions,
		structuralReviewGroups,
		subgroupExpandedState,
		activeReviewTargetId,
		canApplyReviewActions,
		acceptSuggestionAndStop,
		rejectSuggestionAndStop,
		acceptReviewItemsAndStop,
		rejectReviewItemsAndStop,
		acceptReviewItemAndStop,
		rejectReviewItemAndStop,
		toggleSubgroupExpanded,
		setActiveReviewTargetId,
	});

	const firstReviewFocusTargetId = reviewFocusTargets[0]?.id ?? null;

	React.useEffect(() => {
		if (firstReviewFocusTargetId == null) {
			if (activeReviewTargetId != null) {
				setActiveReviewTargetId(null);
			}
			return;
		}
		if (
			activeReviewTargetId == null ||
			!reviewFocusTargets.some((target) => target.id === activeReviewTargetId)
		) {
			setActiveReviewTargetId(firstReviewFocusTargetId);
		}
	}, [activeReviewTargetId, firstReviewFocusTargetId, reviewFocusTargets]);

	React.useEffect(() => {
		if (!rootRef.current || !activeReviewTargetId) {
			return;
		}
		const targetElement = findReviewFocusElement(rootRef.current, activeReviewTargetId);
		if (targetElement && document.activeElement !== targetElement) {
			targetElement.focus();
		}
	}, [activeReviewTargetId, structuralReviewItems.length, subgroupExpandedState]);

	function focusReviewTarget(targetId: string | null): void {
		setActiveReviewTargetId(targetId);
		if (!rootRef.current || targetId == null) {
			return;
		}
		const targetElement = findReviewFocusElement(rootRef.current, targetId);
		targetElement?.focus();
	}

	function moveReviewFocus(direction: -1 | 1): void {
		const currentIndex = reviewFocusTargets.findIndex(
			(target) => target.id === activeReviewTargetId,
		);
		const nextIndex =
			currentIndex === -1
				? 0
				: clampReviewFocusIndex(
						currentIndex + direction,
						reviewFocusTargets.length - 1,
					);
		const nextTarget = reviewFocusTargets[nextIndex];
		if (nextTarget) {
			focusReviewTarget(nextTarget.id);
		}
	}

	function handleReviewListFocus(event: React.FocusEvent<HTMLElement>): void {
		if (
			event.target === event.currentTarget &&
			firstReviewFocusTargetId != null
		) {
			setActiveReviewTargetId(firstReviewFocusTargetId);
			const firstReviewFocusElement = findReviewFocusElement(
				event.currentTarget,
				firstReviewFocusTargetId,
			);
			firstReviewFocusElement?.focus();
		}
	}

	function handleReviewListKeyDown(event: React.KeyboardEvent<HTMLElement>): void {
		if (reviewFocusTargets.length === 0) {
			return;
		}
		const currentTarget =
			resolveReviewFocusTarget(
				reviewFocusTargets,
				resolveReviewFocusTargetId(event.target),
			) ??
			resolveReviewFocusTarget(reviewFocusTargets, activeReviewTargetId);
		if (!currentTarget) {
			return;
		}

		switch (event.key) {
			case "ArrowDown":
				event.preventDefault();
				moveReviewFocus(1);
				return;
			case "ArrowUp":
				event.preventDefault();
				moveReviewFocus(-1);
				return;
			case "Home":
				event.preventDefault();
				if (firstReviewFocusTargetId != null) {
					focusReviewTarget(firstReviewFocusTargetId);
				}
				return;
			case "End": {
				event.preventDefault();
				const lastReviewFocusTargetId =
					reviewFocusTargets[reviewFocusTargets.length - 1]?.id ?? null;
				if (lastReviewFocusTargetId != null) {
					focusReviewTarget(lastReviewFocusTargetId);
				}
				return;
			}
			case "ArrowLeft":
				if (currentTarget.collapse) {
					event.preventDefault();
					currentTarget.collapse();
					focusReviewTarget(currentTarget.parentId ?? currentTarget.id);
				}
				return;
			case "ArrowRight":
				if (currentTarget.expand) {
					event.preventDefault();
					currentTarget.expand();
					focusReviewTarget(currentTarget.id);
				}
				return;
			case "Enter":
			case " ":
				if (currentTarget.toggle) {
					event.preventDefault();
					currentTarget.toggle();
					focusReviewTarget(currentTarget.id);
				}
				return;
			case "a":
			case "A":
				if (currentTarget.accept) {
					event.preventDefault();
					currentTarget.accept();
				}
				return;
			case "r":
			case "R":
				if (currentTarget.reject) {
					event.preventDefault();
					currentTarget.reject();
				}
				return;
		}
	}

	const renderedChildren =
		props.children ??
		(changeListItems.length > 0
			? changeListItems
			: emptyState ?? <div>No pending changes.</div>);

	return renderAsChild(
		{
			...rest,
			ref: composeRefs(ref, rootRef),
			children: renderedChildren,
		},
		"div",
		{
			"data-pen-ai-change-list": "",
			"data-suggestion-count": suggestions.length,
			"data-review-item-count": structuralReviewItems.length,
			"data-review-preview-active": isPreviewActive ? "" : undefined,
			tabIndex: reviewFocusTargets.length > 0 ? 0 : undefined,
			onFocus: handleReviewListFocus,
			onKeyDown: handleReviewListKeyDown,
		},
	);
}
