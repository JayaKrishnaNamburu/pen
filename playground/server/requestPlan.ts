import { AUTOCOMPLETE_SYSTEM_PROMPT } from "@pen/ai-autocomplete";
import {
	buildPlaygroundRequestPlan as buildSharedPlaygroundRequestPlan,
	buildPromptContext as buildSharedPromptContext,
} from "@pen/ai";
import type { Editor, ModelRequestedOperation } from "@pen/types";
import {
	PLAYGROUND_AUTOCOMPLETE_OUTPUT_TOKEN_CAP,
	PLAYGROUND_DOCUMENT_MODEL,
	PLAYGROUND_DOCUMENT_SYSTEM_PROMPT,
	PLAYGROUND_SELECTION_DEFAULT_OUTPUT_TOKENS,
	PLAYGROUND_SELECTION_EXPAND_OUTPUT_TOKENS,
	PLAYGROUND_SELECTION_FAST_PATH_SYSTEM_PROMPT,
	PLAYGROUND_SELECTION_MODEL,
	PLAYGROUND_SELECTION_OUTPUT_TOKEN_CAP,
	PLAYGROUND_SELECTION_SOURCE_CHAR_LIMIT,
	PLAYGROUND_SELECTION_STOP_SENTINEL,
	PLAYGROUND_SELECTION_SUMMARIZE_OUTPUT_TOKENS,
	PLAYGROUND_SELECTION_TRANSLATE_OUTPUT_TOKENS,
	PLAYGROUND_STRUCTURED_PLANNER_SYSTEM_PROMPT,
} from "./config";
import type {
	AISuggestionRequestScope,
	BuildSharedPlaygroundRequestPlan,
	PlaygroundRequestMode,
	PlaygroundRequestPlan,
	PlaygroundRequestedMode,
	PromptContextEnvelope,
} from "./types";

const buildTypedSharedPlaygroundRequestPlan =
	buildSharedPlaygroundRequestPlan as BuildSharedPlaygroundRequestPlan;

export function buildPlaygroundRequestPlan(
	editor: Editor,
	prompt: string,
	requestedMode: PlaygroundRequestMode | null,
	requestedOperation: ModelRequestedOperation | null,
): PlaygroundRequestPlan {
	return buildTypedSharedPlaygroundRequestPlan(
		editor,
		prompt,
		{
			documentModel: PLAYGROUND_DOCUMENT_MODEL,
			selectionModel: PLAYGROUND_SELECTION_MODEL,
			documentSystemPrompt: PLAYGROUND_DOCUMENT_SYSTEM_PROMPT,
			structuredPlannerSystemPrompt:
				PLAYGROUND_STRUCTURED_PLANNER_SYSTEM_PROMPT,
			selectionFastPathSystemPrompt:
				PLAYGROUND_SELECTION_FAST_PATH_SYSTEM_PROMPT,
			autocompleteSystemPrompt: AUTOCOMPLETE_SYSTEM_PROMPT,
			selectionSourceCharLimit: PLAYGROUND_SELECTION_SOURCE_CHAR_LIMIT,
			selectionStopSentinel: PLAYGROUND_SELECTION_STOP_SENTINEL,
			selectionOutputTokenCap: PLAYGROUND_SELECTION_OUTPUT_TOKEN_CAP,
			autocompleteOutputTokenCap:
				PLAYGROUND_AUTOCOMPLETE_OUTPUT_TOKEN_CAP,
			selectionDefaultOutputTokens:
				PLAYGROUND_SELECTION_DEFAULT_OUTPUT_TOKENS,
			selectionExpandOutputTokens:
				PLAYGROUND_SELECTION_EXPAND_OUTPUT_TOKENS,
			selectionSummarizeOutputTokens:
				PLAYGROUND_SELECTION_SUMMARIZE_OUTPUT_TOKENS,
			selectionTranslateOutputTokens:
				PLAYGROUND_SELECTION_TRANSLATE_OUTPUT_TOKENS,
		},
		requestedMode,
		requestedOperation,
	);
}

export function parsePlaygroundRequestMode(
	value: unknown,
): PlaygroundRequestMode | null {
	const requestedMode =
		value === "document-agent" ||
		value === "structured-generation" ||
		value === "selection-fast" ||
		value === "inline-autocomplete" ||
		value === "bottom-chat" ||
		value === "inline-edit" ||
		value === "structured-planner"
			? (value as PlaygroundRequestedMode)
			: null;
	if (!requestedMode) return null;
	if (requestedMode === "bottom-chat") return "document-agent";
	if (requestedMode === "inline-edit") return "selection-fast";
	if (requestedMode === "structured-planner") return "structured-generation";
	return requestedMode;
}

export function resolveOperationRequestMode(
	operation: ModelRequestedOperation | null,
	requestedMode: PlaygroundRequestMode | null,
): PlaygroundRequestMode | null {
	if (
		operation?.kind === "rewrite-selection" ||
		operation?.kind === "rewrite-block" ||
		operation?.kind === "continue-block"
	) {
		return "selection-fast";
	}
	if (operation) return requestedMode ?? "document-agent";
	return requestedMode;
}

export function parseAISuggestionRequestScope(
	value: unknown,
): AISuggestionRequestScope | null {
	if (!value || typeof value !== "object") return null;
	const candidate = value as Record<string, unknown>;
	return typeof candidate.targetText === "string" &&
		typeof candidate.contextBefore === "string" &&
		typeof candidate.contextAfter === "string" &&
		(candidate.blockType === null ||
			typeof candidate.blockType === "string")
		? {
				blockType: (candidate.blockType as string | null) ?? null,
				targetText: candidate.targetText,
				contextBefore: candidate.contextBefore,
				contextAfter: candidate.contextAfter,
			}
		: null;
}

export function resolveUsageTokenValue(
	usage: unknown,
	key: "inputTokens" | "outputTokens",
): number {
	if (!usage || typeof usage !== "object") return 0;
	const value = (usage as Record<string, unknown>)[key];
	return typeof value === "number" ? value : 0;
}

export function buildPromptContext(editor: Editor): PromptContextEnvelope {
	return buildSharedPromptContext(editor);
}
