const AI_ROUTE_LANES = [
	"selection-rewrite",
	"cursor-context",
	"tool-loop",
	"review",
] as const;

export type AIRouteLane = (typeof AI_ROUTE_LANES)[number];

const AI_MUTATION_MODES = [
	"ephemeral-preview",
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
 * `router.ts` because the planner reads it too, and a second copy of the union
 * is how a new member gets missed.
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

const AI_CONTENT_FORMATS = [
	"text",
	"markdown",
] as const;

export type AIContentFormat = (typeof AI_CONTENT_FORMATS)[number];

export const AI_APPLY_STRATEGIES = [
	"text-fast-apply",
	"markdown-full-replace",
	/**
	 * Durable document edits arrive as `edit_document` tool calls. Nothing is
	 * parsed out of the assistant text stream
	 * (`spec/packages/extensions/ai.md` EC1). Streaming lanes still use
	 * `text-fast-apply` / `markdown-full-replace` for generation into a
	 * target, which is not an edit plan.
	 */
	"tool-edit",
] as const;

export type AIApplyStrategy = (typeof AI_APPLY_STRATEGIES)[number];

export type AIWorkingSetViewMode = "raw" | "resolved";

export const AI_STRUCTURED_LANES = [
	"block-structure",
	"table",
	"review",
] as const;

export type AIStructuredLane = (typeof AI_STRUCTURED_LANES)[number];

export const AI_EXECUTION_MODES = [
	"direct-stream",
	"persistent-suggestions",
	"staged-review",
] as const;

export type AIExecutionMode = (typeof AI_EXECUTION_MODES)[number];

export const AI_TARGET_KINDS = ["text", "block", "table"] as const;

export type AITargetKind = (typeof AI_TARGET_KINDS)[number];

export const AI_BLOCK_CLASSES = ["flow", "app"] as const;

export type AIBlockClass = (typeof AI_BLOCK_CLASSES)[number];

export const AI_BLOCK_ADAPTER_IDS = [
	"flow-markdown",
] as const;

export type AIBlockAdapterId = (typeof AI_BLOCK_ADAPTER_IDS)[number];

export const AI_TRANSPORT_KINDS = [
	"flow-text",
	"app-structured",
] as const;

export type AITransportKind = (typeof AI_TRANSPORT_KINDS)[number];

const AI_QUALITY_METRIC_IDS = [
	"wrongLaneRate",
	"staleContextRate",
	"unnecessaryToolCallRate",
	"toolEscalationRate",
	"selectionRewriteAcceptanceRate",
	"suggestionAcceptRejectRatioByLane",
	"structuralEditCorrectionRate",
	"requestRestartRateUnderChurn",
] as const;

export type AIQualityMetricId = (typeof AI_QUALITY_METRIC_IDS)[number];
