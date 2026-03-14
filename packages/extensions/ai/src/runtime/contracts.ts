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

export const AI_CONTENT_FORMATS = [
	"text",
	"markdown",
] as const;

export type AIContentFormat = (typeof AI_CONTENT_FORMATS)[number];

export const AI_APPLY_STRATEGIES = [
	"text-fast-apply",
	"markdown-fast-apply",
	"markdown-full-replace",
	"structured-database",
] as const;

export type AIApplyStrategy = (typeof AI_APPLY_STRATEGIES)[number];

export type AIWorkingSetViewMode = "raw" | "resolved";

export const AI_STRUCTURED_LANES = [
	"block-structure",
	"table",
	"database",
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

export const AI_TARGET_KINDS = ["text", "block", "table", "database"] as const;

export type AITargetKind = (typeof AI_TARGET_KINDS)[number];

export const AI_BLOCK_CLASSES = ["flow", "app"] as const;

export type AIBlockClass = (typeof AI_BLOCK_CLASSES)[number];

export const AI_BLOCK_ADAPTER_IDS = [
	"flow-markdown",
	"database-app",
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
