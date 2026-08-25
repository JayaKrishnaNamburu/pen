import { aiControllerFacet } from "@input/pen-core";
import type { Editor } from "@input/pen-types";
import type { AIController } from "@input/pen-ai";
import { useAI } from "./useAI";

export function useSuggestMode(editor: Editor): {
	suggestMode: boolean;
	setSuggestMode: (enabled: boolean) => void;
} {
	const state = useAI(editor);
	const controller =
		(editor.facet(aiControllerFacet) as AIController | null) ?? null;
	return {
		suggestMode: state.suggestMode,
		setSuggestMode(enabled: boolean) {
			controller?.setSuggestMode(enabled);
		},
	};
}
