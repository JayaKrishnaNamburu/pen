import type { Editor, ModelRequestedOperation } from "@pen/types";

export interface AIRequestBody {
	prompt?: unknown;
	sessionId?: unknown;
	contextFormat?: unknown;
	requestMode?: unknown;
	operation?: unknown;
	expectedSyncRevision?: unknown;
	expectedSyncedGeneration?: unknown;
	suggestionScope?: unknown;
}

export interface ToolExecuteBody {
	input?: unknown;
}

export interface SessionCreateResponse {
	sessionId: string;
}

export interface SessionDiagnosticsResponse {
	sessionId: string;
	headless: true;
	blockCount: number;
	generation: number;
	plainText: string;
	stateVector: string;
	extensionRoot: {
		namespace: string;
		version: number;
		requestCount: number;
		lastRequestMode: string | null;
		lastSyncedRevision: number | null;
	};
}

export interface SessionSyncBody {
	sessionId?: unknown;
	editorState?: unknown;
	revision?: unknown;
	generation?: unknown;
}

export interface PlaygroundRequestMetrics {
	requestId: string;
	sessionId: string;
	requestMode: PlaygroundRequestMode;
	requestModel: string;
	contextFormat: PlaygroundResolvedContextFormat;
	startedAt: number;
	firstToolStartMs: number | null;
	firstToolResultMs: number | null;
	firstTextDeltaServerMs: number | null;
	totalServerMs: number | null;
	toolCallCount: number;
	toolExecutionMs: number;
	contextBytesJson: number | null;
	contextEstimatedTokensJson: number | null;
}

export interface PromptContextEnvelope {
	json: string;
	jsonBytes: number;
	estimatedJsonTokens: number;
}

export interface AISuggestionRequestScope {
	blockType: string | null;
	targetText: string;
	contextBefore: string;
	contextAfter: string;
}

export type PlaygroundRequestMode =
	| "document-agent"
	| "structured-generation"
	| "selection-fast"
	| "inline-autocomplete";
export type PlaygroundRequestedMode =
	| PlaygroundRequestMode
	| "bottom-chat"
	| "inline-edit"
	| "structured-planner";
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
	promptContext: PromptContextEnvelope | null;
	selectedTextLength: number | null;
}

export type BuildSharedPlaygroundRequestPlan = (
	editor: Editor,
	prompt: string,
	config: {
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
	},
	requestedMode?: PlaygroundRequestMode | null,
	requestedOperation?: ModelRequestedOperation | null,
) => PlaygroundRequestPlan;
