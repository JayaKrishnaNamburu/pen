import React from "react";
import { useSuggestions } from "../../hooks/useSuggestions";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";
import { useAIContext } from "./root";

export interface AIDiffViewProps extends AsChildProps {
	mode?: "inline" | "side-by-side";
	ref?: React.Ref<HTMLElement>;
}

export function AIDiffView(props: AIDiffViewProps) {
	const { mode: modeProp, ...rest } = props;
	const { editor } = useAIContext();
	const suggestions = useSuggestions(editor);
	const mode = modeProp ?? "inline";
	const defaultItems = suggestions.map((suggestion) => {
		const block = editor.getBlock(suggestion.blockId);
		const text = block
			?.textContent()
			.slice(suggestion.offset, suggestion.offset + suggestion.length) ?? "";
		const beforeText = suggestion.action === "delete" ? text : "";
		const afterText = suggestion.action === "insert" ? text : "";

		return (
			<div
				key={suggestion.id}
				data-suggestion-id={suggestion.id}
				data-suggestion-action={suggestion.action}
				data-block-id={suggestion.blockId}
			>
				{mode === "side-by-side" ? (
					<>
						<div data-diff-before>{beforeText}</div>
						<div data-diff-after>{afterText}</div>
					</>
				) : (
					<span data-diff-inline>{suggestion.action === "delete" ? `- ${text}` : `+ ${text}`}</span>
				)}
			</div>
		);
	});
	const renderedChildren = props.children ?? defaultItems;

	return renderAsChild(
		{
			...rest,
			children: renderedChildren,
		},
		"div",
		{
			"data-pen-ai-diff-view": "",
			"data-has-changes": suggestions.length > 0 ? "" : undefined,
			"data-mode": mode,
		},
	);
}
