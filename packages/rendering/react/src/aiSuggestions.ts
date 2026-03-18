export {
	AISuggestionsRoot,
	AISuggestionsPopover,
	type AISuggestionsRootProps,
	type AISuggestionsPopoverProps,
} from "./primitives/aiSuggestions/index";
export { useAISuggestions } from "./hooks/useAISuggestions";
export {
	useAISuggestionPopover,
	type AISuggestionPopoverPosition,
} from "./hooks/useAISuggestionPopover";
export { useAISuggestionsMetrics } from "./hooks/useAISuggestionsMetrics";
export type {
	AISuggestion,
	AISuggestionGroup,
	AISuggestionsMetrics,
	AISuggestionsState,
} from "@pen/ai-suggestions";
