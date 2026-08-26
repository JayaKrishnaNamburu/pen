import React from "react";
import { resolveEditorMessage } from "@input/pen-core";
import { useSuggestions } from "../../hooks/useSuggestions";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";
import { cancelStreamingAIGenerationAfterResolution } from "../../utils/cancelStreamingAIGeneration";
import { composeRefs } from "../../utils/composeRefs";
import { renderAIChangeListItems } from "./changeListItems";
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

	const changeListItems = renderAIChangeListItems({
		editor,
		suggestions,
		acceptSuggestionAndStop,
		rejectSuggestionAndStop,
	});

	const renderedChildren =
		props.children ??
		(changeListItems.length > 0
			? changeListItems
			: (emptyState ?? (
					<div>
						{resolveEditorMessage(
							editor,
							"pen.ai.review.noPendingChanges",
						)}
					</div>
				)));

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
		},
	);
}
