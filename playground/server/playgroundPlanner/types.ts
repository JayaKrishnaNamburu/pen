export interface PlaygroundPromptContextEnvelope {
	json: string;
	jsonBytes: number;
	estimatedJsonTokens: number;
}

export type PlaygroundRequestMode =
	| "document-agent"
	| "structured-generation"
	| "selection-fast"
	| "inline-autocomplete";

export type PlaygroundResolvedContextFormat = "json" | "none";

export interface PlaygroundRequestPlan {
	mode: PlaygroundRequestMode;
	modelId: string;
	contextFormat: PlaygroundResolvedContextFormat;
	systemPrompt: string;
	prompt: string;
	maxOutputTokens?: number;
	temperature?: number;
	stopSequences?: string[];
	useTools: boolean;
	promptContext: PlaygroundPromptContextEnvelope | null;
	selectedTextLength: number | null;
}

export interface PlaygroundPlannerConfig {
	documentModel: string;
	selectionModel: string;
	documentSystemPrompt: string;
	structuredPlannerSystemPrompt: string;
	selectionFastPathSystemPrompt: string;
	autocompleteSystemPrompt: string;
	selectionSourceCharLimit: number;
	selectionStopSentinel: string;
	selectionOutputTokenCap: number;
	autocompleteOutputTokenCap: number;
	selectionDefaultOutputTokens: number;
	selectionExpandOutputTokens: number;
	selectionSummarizeOutputTokens: number;
	selectionTranslateOutputTokens: number;
}

export const NEARBY_BLOCK_RADIUS = 2;

export const STRUCTURED_PLANNER_PROMPT_PREFIX =
	"Produce a structured Pen document mutation plan.";

export const EXPLICIT_SELECTION_FAST_REQUEST_ERROR =
	"Explicit selection-fast requests require a live or pinned text selection.";

export const SESSION_PROMPT_HISTORY_HEADER = "Earlier user requests in this same session:\n";

export const SESSION_PROMPT_LATEST_HEADER = "\nLatest request:\n";

export const SESSION_PROMPT_INTROS = new Set([
	"You are continuing an existing inline editor edit session.",
	"You are continuing an existing editor chat session.",
]);

export const utf8Encoder = new TextEncoder();
