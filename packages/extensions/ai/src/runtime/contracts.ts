/*
 * Exported from this module but deliberately not from the package barrel: the
 * router-property test reads them to prove every member still has a producer
 * (UC5), which is not a reason to hand hosts a second vocabulary to switch on.
 */
export const AI_ROUTE_LANES = [
	"selection-rewrite",
	"cursor-context",
	"tool-loop",
	"review",
] as const;

export type AIRouteLane = (typeof AI_ROUTE_LANES)[number];

export const AI_MUTATION_MODES = [
	"direct-stream",
	"persistent-suggestions",
	"streaming-suggestions",
	"staged-review",
] as const;

export type AIMutationMode = (typeof AI_MUTATION_MODES)[number];

/**
 * Host-level default for how AI mutations land. "suggestions" stages
 * track-changes for hosts with a review UI; "direct" applies edits
 * immediately for hosts without one. Suggest mode and the review lane
 * always stage regardless of this preference.
 */
const AI_MUTATION_PREFERENCES = ["suggestions", "direct"] as const;

/** Host default: `"suggestions"` stages review, `"direct"` applies immediately. */
export type AIMutationPreference = (typeof AI_MUTATION_PREFERENCES)[number];

export function isAIMutationPreference(
	value: unknown,
): value is AIMutationPreference {
	return (AI_MUTATION_PREFERENCES as readonly string[]).includes(
		value as string,
	);
}

/**
 * What the prompt asked for. Lives here rather than next to the classifier in
 * `router.ts` because the classifier and the loop both read it, and a second
 * copy of the union is how a new member gets missed.
 */
export type PromptIntent =
	| "rewrite"
	| "continue"
	| "local-edit"
	| "structural"
	| "search"
	| "review"
	/** Asking about the document, not asking to change it. */
	| "question"
	| "unknown";

const AI_CONTENT_FORMATS = ["text", "markdown"] as const;

export type AIContentFormat = (typeof AI_CONTENT_FORMATS)[number];

export type AIWorkingSetViewMode = "raw" | "resolved";

export const AI_EXECUTION_MODES = [
	"direct-stream",
	"persistent-suggestions",
	"staged-review",
] as const;

export type AIExecutionMode = (typeof AI_EXECUTION_MODES)[number];

export const AI_TARGET_KINDS = ["text", "block", "table"] as const;

export type AITargetKind = (typeof AI_TARGET_KINDS)[number];

export const AI_BLOCK_CLASSES = ["flow"] as const;

export type AIBlockClass = (typeof AI_BLOCK_CLASSES)[number];

export const AI_BLOCK_ADAPTER_IDS = ["flow-markdown"] as const;

export type AIBlockAdapterId = (typeof AI_BLOCK_ADAPTER_IDS)[number];

export const AI_TRANSPORT_KINDS = ["flow-text"] as const;

export type AITransportKind = (typeof AI_TRANSPORT_KINDS)[number];
