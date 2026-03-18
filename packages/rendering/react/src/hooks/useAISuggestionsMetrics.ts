import type { Editor } from "@pen/types";
import { useAISuggestions } from "./useAISuggestions";

export function useAISuggestionsMetrics(editor: Editor) {
	return useAISuggestions(editor).state.metrics;
}
