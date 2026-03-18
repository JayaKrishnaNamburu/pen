import React from "react";
import type { Editor } from "@pen/types";
import { EditorContext } from "../../context/editorContext";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";
import { useAISuggestionPopover } from "../../hooks/useAISuggestionPopover";

interface AISuggestionsContextValue {
	editor: Editor;
	popover: ReturnType<typeof useAISuggestionPopover>;
}

const AISuggestionsContext =
	React.createContext<AISuggestionsContextValue | null>(null);

const AI_SUGGESTIONS_STYLESHEET_ID = "pen-ai-suggestions-styles";
const AI_SUGGESTIONS_STYLES = `
.pen-ai-suggestion-underline {
	transition: filter 180ms ease;
}

.pen-ai-suggestion-underline:hover {
	--pen-ai-suggestion-line: var(--pen-ai-suggestion-line-hover);
	filter: saturate(1.08);
}

.pen-ai-suggestion-active {
	filter: saturate(1.08);
}
`;

export interface AISuggestionsRootProps extends AsChildProps {
	editor?: Editor;
	ref?: React.Ref<HTMLElement>;
}

export function AISuggestionsRoot(props: AISuggestionsRootProps) {
	const { editor: editorProp, ...rest } = props;
	const editorContext = React.useContext(EditorContext);
	const editor = editorProp ?? editorContext?.editor;
	if (!editor) {
		throw new Error(
			"Pen AI suggestions primitives require an editor or Pen.Editor.Root context.",
		);
	}

	const popover = useAISuggestionPopover(editor);
	const { closeSuggestion, openSuggestion } = popover;

	React.useEffect(() => {
		const handleClick = (event: MouseEvent) => {
			const target = event.target instanceof Element ? event.target : null;
			const anchor = target?.closest("[data-ai-suggestion-id]") as HTMLElement | null;
			if (!anchor) {
				if (target?.closest("[data-pen-ai-suggestions-popover]") == null) {
					closeSuggestion();
				}
				return;
			}

			const suggestionId = anchor.dataset.aiSuggestionId;
			if (!suggestionId) {
				return;
			}

			event.preventDefault();
			openSuggestion(suggestionId);
		};

		document.addEventListener("click", handleClick, true);
		return () => {
			document.removeEventListener("click", handleClick, true);
		};
	}, [closeSuggestion, openSuggestion]);

	React.useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape") {
				return;
			}
			closeSuggestion();
		};

		document.addEventListener("keydown", handleKeyDown, true);
		return () => {
			document.removeEventListener("keydown", handleKeyDown, true);
		};
	}, [closeSuggestion]);

	React.useEffect(() => {
		let styleElement = document.getElementById(
			AI_SUGGESTIONS_STYLESHEET_ID,
		) as HTMLStyleElement | null;

		if (!styleElement) {
			styleElement = document.createElement("style");
			styleElement.id = AI_SUGGESTIONS_STYLESHEET_ID;
			document.head.appendChild(styleElement);
		}
		styleElement.textContent = AI_SUGGESTIONS_STYLES;

		const nextRefCount = Number(styleElement.dataset.refCount ?? "0") + 1;
		styleElement.dataset.refCount = String(nextRefCount);

		return () => {
			if (!styleElement) {
				return;
			}
			const currentRefCount = Number(styleElement.dataset.refCount ?? "1") - 1;
			if (currentRefCount <= 0) {
				styleElement.remove();
				return;
			}
			styleElement.dataset.refCount = String(currentRefCount);
		};
	}, []);

	return (
		<AISuggestionsContext.Provider value={{ editor, popover }}>
			{renderAsChild(rest, "div", {
				"data-pen-ai-suggestions-root": "",
			})}
		</AISuggestionsContext.Provider>
	);
}

export function useAISuggestionsContext(): AISuggestionsContextValue {
	const context = React.useContext(AISuggestionsContext);
	if (!context) {
		throw new Error(
			"Pen AI suggestions primitives must be used within <Pen.AISuggestions.Root>.",
		);
	}
	return context;
}
