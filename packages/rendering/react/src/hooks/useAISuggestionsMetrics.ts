import type { Editor } from "@input/pen-types";
import { useAISuggestions } from "./useAISuggestions";

export function useAISuggestionsMetrics(editor: Editor) {
	return useAISuggestions(editor).state.metrics;
}
