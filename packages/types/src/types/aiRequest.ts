import type { ModelMessage, ToolSchema } from "./tools";

export interface AIRequestContext {
	readonly feature:
		| "generation"
		| "suggestions"
		| "autocomplete"
		| "agentic-step";
	readonly messages: readonly ModelMessage[];
	readonly documentExcerpts: readonly {
		readonly blockId: string;
		readonly kind: "selection" | "target" | "context" | "tool-result";
		readonly text: string;
	}[];
	readonly tools: readonly ToolSchema[];
}

export type AIRequestFilter = (
	context: AIRequestContext,
) => AIRequestContext | null;
