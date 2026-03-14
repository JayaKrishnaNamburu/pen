import React from "react";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";
import { useAIContext } from "./root";

export interface AISuggestionProps extends AsChildProps {
	ref?: React.Ref<HTMLElement>;
}

export function AISuggestion(props: AISuggestionProps) {
	const { state } = useAIContext();
	const suggestion = state.ephemeralSuggestion;

	return renderAsChild(
		props,
		"div",
		{
			"data-pen-ai-suggestion": "",
			"data-type": suggestion?.type ?? undefined,
			"data-visible": suggestion ? "" : undefined,
			hidden: suggestion == null,
		},
	);
}
