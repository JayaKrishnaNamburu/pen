import React from "react";
import { useSuggestions } from "../../hooks/useSuggestions";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";
import { useAIContext } from "./root";

export interface AITrackChangesProps extends AsChildProps {
	mode?: "suggesting" | "editing";
	ref?: React.Ref<HTMLElement>;
}

export function AITrackChanges(props: AITrackChangesProps) {
	const { mode: modeProp, ...rest } = props;
	const { editor, state } = useAIContext();
	const suggestions = useSuggestions(editor);
	const mode = modeProp ?? (state.suggestMode ? "suggesting" : "editing");

	return renderAsChild(
		rest,
		"div",
		{
			"data-pen-ai-trackChanges": "",
			"data-mode": mode,
			"data-suggestion-count": suggestions.length,
		},
	);
}
