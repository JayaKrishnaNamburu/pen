import type { SelectionState } from "@input/pen-types";
import type {
	AIContentFormat,
	AIMutationMode,
	AIMutationPreference,
	AIRouteLane,
} from "./contracts";

interface MutationPolicyInput {
	lane: AIRouteLane;
	suggestMode: boolean;
	selection: SelectionState;
	surface?: "inline-edit" | "bottom-chat";
	mutationPreference?: AIMutationPreference;
}

export function resolveMutationMode(
	input: MutationPolicyInput,
): AIMutationMode {
	if (
		input.mutationPreference === "direct" &&
		!input.suggestMode &&
		input.lane !== "review"
	) {
		return "direct-stream";
	}
	if (input.lane === "selection-rewrite") {
		return "streaming-suggestions";
	}
	if (
		(input.surface === "bottom-chat" || input.surface === "inline-edit") &&
		input.lane === "cursor-context"
	) {
		return "streaming-suggestions";
	}
	if (input.lane === "cursor-context") {
		return "direct-stream";
	}
	if (input.lane === "review") {
		return "staged-review";
	}
	if (input.suggestMode || isStructuralSelection(input.selection)) {
		return "persistent-suggestions";
	}
	return input.lane === "tool-loop"
		? "persistent-suggestions"
		: "direct-stream";
}

function isStructuralSelection(selection: SelectionState): boolean {
	return selection?.type === "block" || selection?.type === "cell";
}

export function shouldStreamDirectAIOutput(options: {
	mutationMode: AIMutationMode;
	contentFormat: AIContentFormat;
	target: "selection" | "block";
}): boolean {
	if (options.target === "block" && options.contentFormat === "markdown") {
		return false;
	}

	return options.mutationMode === "direct-stream";
}

/** Durable text lands as suggestion marks rather than applying immediately. */
export function stagesAsSuggestions(
	mode: AIMutationMode | undefined,
): boolean {
	return mode != null && mode !== "direct-stream";
}
