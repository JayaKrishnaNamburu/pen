export const AI_REFERENCE_ARCHITECTURE = {
	production: {
		mode: "Mode A",
		driver: "native-model-adapter",
		authority: "server-owned-headless-pen",
	},
	agents: {
		mode: "skills",
		driver: "external-agent",
		authority: "ai-skills-lane",
	},
	demo: {
		mode: "playground",
		driver: "http-session-adapter",
		authority: "demo-only",
	},
	research: {
		mode: "review-or-branch",
		driver: "isolated-lane",
		authority: "evidence-gated",
	},
} as const;

export const AI_ROUTE_LANES = [
	"selection-rewrite",
	"cursor-context",
	"context-first",
	"tool-loop",
	"review",
] as const;

export type AIRouteLane = (typeof AI_ROUTE_LANES)[number];

export const AI_MUTATION_MODES = [
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
export const AI_MUTATION_PREFERENCES = ["suggestions", "direct"] as const;

/** One of {@link AI_MUTATION_PREFERENCES}. */
export type AIMutationPreference = (typeof AI_MUTATION_PREFERENCES)[number];

export function isAIMutationPreference(
	value: unknown,
): value is AIMutationPreference {
	return (AI_MUTATION_PREFERENCES as readonly string[]).includes(
		value as string,
	);
}

/**
 * Which channel carries a durable edit. "fast-apply" is the `<pen-fast-apply>`
 * XML contract parsed out of the assistant text stream; "tool" is the
 * block-addressed `edit_document` tool call. "fast-apply" stays the default
 * until the Wave 0 measurement decides
 * (`spec-better-ai/01-edit-channel.md` EC12).
 */
export const AI_EDIT_CHANNELS = ["fast-apply", "tool"] as const;

/** One of {@link AI_EDIT_CHANNELS}. */
export type AIEditChannel = (typeof AI_EDIT_CHANNELS)[number];

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

export const AI_CONTENT_FORMATS = [
	"text",
	"markdown",
] as const;

export type AIContentFormat = (typeof AI_CONTENT_FORMATS)[number];

export const AI_APPLY_STRATEGIES = [
	"text-fast-apply",
	"markdown-fast-apply",
	"markdown-full-replace",
	/**
	 * Durable edits arrive as `edit_document` tool calls, so nothing is parsed
	 * out of the assistant text stream (`spec-better-ai/01-edit-channel.md`
	 * EC1). Selected by `editChannel: "tool"`.
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

export const AI_PLANNER_MODES = ["text", "structured"] as const;

export type AIPlannerMode = (typeof AI_PLANNER_MODES)[number];

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

export const AI_QUALITY_METRIC_IDS = [
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
