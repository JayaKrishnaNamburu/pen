// @ts-nocheck
import type { Editor, ModelRequestedOperation, SelectionState } from "@pen/types";
import { parseStructuredIntentRequestPrompt } from "../structuredIntent";
import { NEARBY_BLOCK_RADIUS, STRUCTURED_PLANNER_PROMPT_PREFIX, EXPLICIT_SELECTION_FAST_REQUEST_ERROR, SESSION_PROMPT_HISTORY_HEADER, SESSION_PROMPT_LATEST_HEADER, SESSION_PROMPT_INTROS, utf8Encoder, buildPlaygroundRequestPlan, buildExplicitRequestPlan, buildExplicitLocalOperationPlan, buildExplicitLocalOperationPrompt, buildStructuredGenerationPlan, buildDocumentAgentPlan, buildPromptContext } from "./playgroundPlannerPart1";
import type { PlaygroundPromptContextEnvelope, PlaygroundRequestMode, PlaygroundResolvedContextFormat, PlaygroundRequestPlan, PlaygroundPlannerConfig } from "./playgroundPlannerPart1";
import { classifySelectionPrompt, resolveSelectionOutputTokenBudget, resolveSelectionTemperature, resolveNearbyBlocks, resolveSelectionBlockId, truncateText } from "./playgroundPlannerPart3";

export function createPlaygroundRequestMetricsSeed(
	requestPlan: PlaygroundRequestPlan,
): {
	requestMode: PlaygroundRequestMode;
	requestModel: string;
	contextFormat: PlaygroundResolvedContextFormat;
	firstToolStartMs: number | null;
	firstToolResultMs: number | null;
	firstTextDeltaServerMs: number | null;
	totalServerMs: number | null;
	toolCallCount: number;
	toolExecutionMs: number;
	contextBytesJson: number | null;
	contextEstimatedTokensJson: number | null;
} {
	return {
		requestMode: requestPlan.mode,
		requestModel: requestPlan.modelId,
		contextFormat: requestPlan.contextFormat,
		firstToolStartMs: null,
		firstToolResultMs: null,
		firstTextDeltaServerMs: null,
		totalServerMs: null,
		toolCallCount: 0,
		toolExecutionMs: 0,
		contextBytesJson: requestPlan.promptContext?.jsonBytes ?? null,
		contextEstimatedTokensJson:
			requestPlan.promptContext?.estimatedJsonTokens ?? null,
	};
}

export function estimateTokens(value: string): number {
	return Math.max(1, Math.ceil(value.length / 4));
}

export function isStructuredPlannerPrompt(prompt: string): boolean {
	const normalizedPrompt = prompt.trimStart();
	return (
		normalizedPrompt.startsWith(STRUCTURED_PLANNER_PROMPT_PREFIX) ||
		normalizedPrompt.includes(`User request:\n${STRUCTURED_PLANNER_PROMPT_PREFIX}`)
	);
}

export function buildPromptEnvelope(
	prompt: string,
	context: string,
	requestedOperation?: ModelRequestedOperation | null,
): string {
	const operationEnvelope =
		requestedOperation == null
			? null
			: JSON.stringify({
				kind: requestedOperation.kind,
				target: requestedOperation.target,
				provenance: requestedOperation.provenance ?? null,
			});
	return [
		"Direct document context (JSON, compact summary):",
		context,
		"",
		...(operationEnvelope
			? [
				"Resolved operation envelope (authoritative target and scope):",
				operationEnvelope,
				"",
			]
			: []),
		"Use this summary first. Call tools only when you need more precise or broader context.",
		"When you answer with document content, return only the content to insert or apply.",
		'Do not add conversational lead-ins like "Here is", "Here\'s", or "I wrote".',
		"",
		"User request:",
		prompt,
	].join("\n");
}

export function buildInlineAutocompletePlan(
	prompt: string,
	config: PlaygroundPlannerConfig,
): PlaygroundRequestPlan | null {
	if (!isInlineAutocompletePrompt(prompt)) {
		return null;
	}

	return {
		mode: "inline-autocomplete",
		modelId: config.selectionModel,
		contextFormat: "none",
		systemPrompt: config.autocompleteSystemPrompt,
		prompt,
		maxOutputTokens: resolveAutocompleteOutputTokenCap(prompt, config),
		temperature: 0,
		stopSequences: undefined,
		useTools: false,
		promptContext: null,
		selectedTextLength: null,
	};
}

export function buildInlineAutocompletePlanFromRequest(
	prompt: string,
	config: PlaygroundPlannerConfig,
): PlaygroundRequestPlan {
	return {
		mode: "inline-autocomplete",
		modelId: config.selectionModel,
		contextFormat: "none",
		systemPrompt: config.autocompleteSystemPrompt,
		prompt,
		useTools: false,
		maxOutputTokens: config.autocompleteOutputTokenCap,
		temperature: 0,
		stopSequences: undefined,
		promptContext: null,
		selectedTextLength: null,
	};
}

export function resolveAutocompleteOutputTokenCap(
	prompt: string,
	config: PlaygroundPlannerConfig,
): number {
	const targetScope = extractAutocompleteContinuationTargetScope(prompt);
	if (targetScope === "continue-across-paragraphs") {
		return Math.max(config.autocompleteOutputTokenCap * 8, 640);
	}
	if (targetScope === "finish-paragraph") {
		return Math.max(config.autocompleteOutputTokenCap * 4, 256);
	}
	return config.autocompleteOutputTokenCap;
}

export function extractAutocompleteContinuationTargetScope(
	prompt: string,
): "finish-paragraph" | "continue-across-paragraphs" | null {
	const match = prompt.match(/^target_scope=(.+)$/m);
	if (!match) {
		return null;
	}
	if (match[1] === "finish-paragraph") {
		return "finish-paragraph";
	}
	if (match[1] === "continue-across-paragraphs") {
		return "continue-across-paragraphs";
	}
	return null;
}

export function buildSelectionFastPathPlan(
	editor: Editor,
	prompt: string,
	config: PlaygroundPlannerConfig,
	requestedOperation?: ModelRequestedOperation | null,
): PlaygroundRequestPlan | null {
	const parsedPromptSelection = parsePinnedSelectionPrompt(prompt);
	const explicitOperationSelection =
		requestedOperation?.kind === "rewrite-selection" &&
		requestedOperation.target.kind === "selection"
			? requestedOperation.target.sourceText
			: null;
	const selectedText = (
		explicitOperationSelection ??
		parsedPromptSelection?.selectedText ??
		resolveLiveSelectedText(editor)
	).trim();
	if (!selectedText || selectedText.length > config.selectionSourceCharLimit) {
		return null;
	}

	const instruction =
		parsedPromptSelection?.instruction ??
		extractSelectionInstruction(prompt, selectedText);
	const promptKind = classifySelectionPrompt(instruction);

	return {
		mode: "selection-fast",
		modelId: config.selectionModel,
		contextFormat: "none",
		systemPrompt: config.selectionFastPathSystemPrompt,
		prompt: buildSelectionPromptEnvelope(
			instruction,
			selectedText,
			config.selectionStopSentinel,
		),
		maxOutputTokens: resolveSelectionOutputTokenBudget(
			promptKind,
			selectedText,
			config,
		),
		temperature: resolveSelectionTemperature(promptKind),
		stopSequences: [config.selectionStopSentinel],
		useTools: false,
		promptContext: null,
		selectedTextLength: selectedText.length,
	};
}

export function isExplicitLocalOperation(
	operation: ModelRequestedOperation,
): operation is ModelRequestedOperation {
	return (
		operation.kind === "rewrite-selection" ||
		operation.kind === "rewrite-block" ||
		operation.kind === "continue-block"
	);
}

export function resolveExplicitLocalOperationSourceText(
	operation: ModelRequestedOperation,
): string {
	if (
		operation.target.kind === "selection" ||
		operation.target.kind === "scoped-range" ||
		operation.target.kind === "block"
	) {
		return operation.target.sourceText;
	}
	return "";
}

export function parseSessionExecutionPrompt(
	prompt: string,
): {
	latestPrompt: string;
	previousPrompts: string[];
} | null {
	const normalizedPrompt = prompt.replace(/\r\n?/g, "\n").trim();
	const historyHeaderIndex = normalizedPrompt.indexOf(SESSION_PROMPT_HISTORY_HEADER);
	const latestHeaderIndex = normalizedPrompt.indexOf(SESSION_PROMPT_LATEST_HEADER);
	if (
		historyHeaderIndex < 0 ||
		latestHeaderIndex < 0 ||
		latestHeaderIndex <= historyHeaderIndex
	) {
		return null;
	}

	const intro = normalizedPrompt.slice(0, historyHeaderIndex).trim();
	if (!SESSION_PROMPT_INTROS.has(intro)) {
		return null;
	}

	const historyAndInstruction = normalizedPrompt.slice(
		historyHeaderIndex + SESSION_PROMPT_HISTORY_HEADER.length,
		latestHeaderIndex,
	);
	const historySection = historyAndInstruction.split("\n\n")[0]?.trim() ?? "";
	const latestPrompt = normalizedPrompt
		.slice(latestHeaderIndex + SESSION_PROMPT_LATEST_HEADER.length)
		.trim();
	if (!historySection || !latestPrompt) {
		return null;
	}

	const previousPrompts = Array.from(
		historySection.matchAll(/(?:^|\n)\d+\.\s([\s\S]*?)(?=(?:\n\d+\.\s)|$)/g),
	)
		.map((match) => match[1]?.trim() ?? "")
		.filter((item) => item.length > 0);
	if (previousPrompts.length === 0) {
		return null;
	}

	return {
		latestPrompt,
		previousPrompts,
	};
}

export function resolveLiveSelectedText(editor: Editor): string {
	const selection = editor.selection;
	if (!selection || selection.type !== "text" || selection.isCollapsed) {
		return "";
	}
	return editor.getSelectedText();
}

export function isInlineAutocompletePrompt(prompt: string): boolean {
	const normalizedPrompt = prompt.trim();
	const promptLines = normalizedPrompt.split("\n");
	return (
		promptLines[0]?.startsWith("prefix=") === true &&
		promptLines[1] === "cursor_here=true" &&
		promptLines[2]?.startsWith("suffix=") === true
	);
}

export function buildSelectionPromptEnvelope(
	instruction: string,
	selectedText: string,
	stopSentinel: string,
): string {
	return [
		"Instruction:",
		instruction,
		"",
		"Selected text:",
		selectedText,
		"",
		`Return only the final replacement text. When finished, output ${stopSentinel}.`,
	].join("\n");
}

export function parsePinnedSelectionPrompt(
	prompt: string,
): { instruction: string; selectedText: string } | null {
	const normalizedPrompt = prompt.replace(/\r\n?/g, "\n");
	const selectionMarker =
		"Context summary:\nSource: selection\nSelected text:\n";
	const requestMarker = "\n\nUser request:\n";
	const selectionStart = normalizedPrompt.indexOf(selectionMarker);
	if (selectionStart < 0) {
		return null;
	}
	const requestStart = normalizedPrompt.lastIndexOf(requestMarker);
	if (requestStart <= selectionStart + selectionMarker.length) {
		return null;
	}
	const selectedText = normalizedPrompt
		.slice(selectionStart + selectionMarker.length, requestStart)
		.trim();
	const instruction = normalizedPrompt
		.slice(requestStart + requestMarker.length)
		.trim();
	if (!selectedText || !instruction) {
		return null;
	}
	return {
		instruction,
		selectedText,
	};
}

export function extractSelectionInstruction(prompt: string, selectedText: string): string {
	const trimmedPrompt = prompt.trim();
	const trimmedSelection = selectedText.trim();
	if (!trimmedSelection) {
		return trimmedPrompt;
	}

	const selectionSuffix = `\n\n${trimmedSelection}`;
	if (trimmedPrompt.endsWith(selectionSuffix)) {
		return trimmedPrompt.slice(0, -selectionSuffix.length).trim();
	}

	if (trimmedPrompt.endsWith(trimmedSelection)) {
		return trimmedPrompt.slice(0, -trimmedSelection.length).trim();
	}

	return trimmedPrompt;
}
