import type { ModelMessage, ToolSchema } from "./tools";

export const AI_REQUEST_REFUSED_CODE = "ai-request-refused";
export const AI_EGRESS_INVENTORY_CODE = "ai-egress-inventory";

export type AIRequestFeature =
	| "generation"
	| "suggestions"
	| "autocomplete"
	| "agentic-step";

export type AIDocumentExcerptKind =
	| "selection"
	| "target"
	| "context"
	| "tool-result";

export interface AIDocumentExcerpt {
	readonly blockId: string;
	readonly kind: AIDocumentExcerptKind;
	readonly text: string;
}

export interface AIRequestContext {
	readonly feature: AIRequestFeature;
	readonly messages: readonly ModelMessage[];
	readonly documentExcerpts: readonly AIDocumentExcerpt[];
	readonly tools: readonly ToolSchema[];
}

export type AIRequestFilter = (
	context: AIRequestContext,
) => AIRequestContext | null;
