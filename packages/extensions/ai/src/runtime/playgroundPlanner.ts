import type { Editor, ModelRequestedOperation, SelectionState } from "@pen/types";
import { parseStructuredIntentRequestPrompt } from "./structuredIntent";

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

const NEARBY_BLOCK_RADIUS = 2;
const STRUCTURED_PLANNER_PROMPT_PREFIX =
	"Produce a structured Pen document mutation plan.";
const EXPLICIT_SELECTION_FAST_REQUEST_ERROR =
	"Explicit selection-fast requests require a live or pinned text selection.";
const SESSION_PROMPT_HISTORY_HEADER = "Earlier user requests in this same session:\n";
const SESSION_PROMPT_LATEST_HEADER = "\nLatest request:\n";
const SESSION_PROMPT_INTROS = new Set([
	"You are continuing an existing inline editor edit session.",
	"You are continuing an existing editor chat session.",
]);
const utf8Encoder = new TextEncoder();

export function buildPlaygroundRequestPlan(
	editor: Editor,
	prompt: string,
	config: PlaygroundPlannerConfig,
	requestedMode: PlaygroundRequestMode | null = null,
	requestedOperation: ModelRequestedOperation | null = null,
): PlaygroundRequestPlan {
	const explicitPlan = buildExplicitRequestPlan(
		editor,
		prompt,
		config,
		requestedMode,
		requestedOperation,
	);
	if (explicitPlan) {
		return explicitPlan;
	}
	if (parseStructuredIntentRequestPrompt(prompt)) {
		return buildStructuredGenerationPlan(prompt, config);
	}

	const inlineAutocompletePlan = buildInlineAutocompletePlan(prompt, config);
	if (inlineAutocompletePlan) {
		return inlineAutocompletePlan;
	}

	const selectionPlan = buildSelectionFastPathPlan(editor, prompt, config);
	if (selectionPlan) {
		return selectionPlan;
	}

	if (isStructuredPlannerPrompt(prompt)) {
		return buildStructuredGenerationPlan(prompt, config);
	}

	return buildDocumentAgentPlan(editor, prompt, config, requestedOperation);
}

function buildExplicitRequestPlan(
	editor: Editor,
	prompt: string,
	config: PlaygroundPlannerConfig,
	requestedMode: PlaygroundRequestMode | null,
	requestedOperation: ModelRequestedOperation | null,
): PlaygroundRequestPlan | null {
	if (requestedMode === "inline-autocomplete") {
		return buildInlineAutocompletePlanFromRequest(prompt, config);
	}
	if (requestedMode === "selection-fast") {
		if (requestedOperation && isExplicitLocalOperation(requestedOperation)) {
			return buildExplicitLocalOperationPlan(prompt, config, requestedOperation);
		}
		const selectionFastPathPlan = buildSelectionFastPathPlan(
			editor,
			prompt,
			config,
			requestedOperation,
		);
		if (selectionFastPathPlan) {
			return selectionFastPathPlan;
		}
		throw new Error(EXPLICIT_SELECTION_FAST_REQUEST_ERROR);
	}
	if (requestedMode === "structured-generation") {
		return buildStructuredGenerationPlan(prompt, config);
	}
	if (requestedMode === "document-agent") {
		return buildDocumentAgentPlan(editor, prompt, config, requestedOperation);
	}
	return null;
}

function buildExplicitLocalOperationPlan(
	prompt: string,
	config: PlaygroundPlannerConfig,
	operation: ModelRequestedOperation,
): PlaygroundRequestPlan {
	return {
		mode: "selection-fast",
		modelId: config.selectionModel,
		contextFormat: "none",
		systemPrompt: config.selectionFastPathSystemPrompt,
		prompt: buildExplicitLocalOperationPrompt(prompt, operation),
		useTools: false,
		maxOutputTokens: config.selectionOutputTokenCap,
		temperature: 0,
		stopSequences: undefined,
		promptContext: null,
		selectedTextLength: resolveExplicitLocalOperationSourceText(operation).length,
	};
}

export function buildExplicitLocalOperationPrompt(
	prompt: string,
	operation: ModelRequestedOperation,
): string {
	const parsedPrompt = parseSessionExecutionPrompt(prompt);
	const latestPrompt = parsedPrompt?.latestPrompt ?? prompt;
	const previousPromptSection =
		(parsedPrompt?.previousPrompts.length ?? 0) > 0
			? [
				"Earlier requests in this same session:",
				...parsedPrompt!.previousPrompts.map(
					(previousPrompt, index) => `${index + 1}. ${previousPrompt}`,
				),
				"",
			]
			: [];
	if (operation.kind === "rewrite-selection") {
		const target =
			operation.target.kind === "selection" ||
				operation.target.kind === "scoped-range"
				? operation.target
				: null;
		if (!target) {
			return prompt;
		}
		if (
			target.kind === "scoped-range" &&
			target.contentFormat === "markdown"
		) {
			return [
				"Instruction:",
				latestPrompt,
				"",
				...previousPromptSection,
				"Treat the latest instruction as authoritative.",
				"If the instruction asks for a rewrite, replace the full target scope instead of continuing from it.",
				"If the instruction removes the target content, return an empty payload wrapper.",
				"Return the full replacement markdown for the selected target scope.",
				"",
				"Target content (rough markdown):",
				target.sourceText || "(empty)",
				"",
				"Wrap the resulting markdown content exactly like this:",
				"<pen_local_operation>markdown content</pen_local_operation>",
				"Do not output anything before or after the wrapper.",
			].join("\n");
		}
		return [
			"Instruction:",
			latestPrompt,
			"",
			...previousPromptSection,
			"Selected text to replace:",
			target.sourceText,
			"",
			"Wrap the rewritten replacement text exactly like this:",
			"<pen_local_operation>replacement text</pen_local_operation>",
			"Do not output anything before or after the wrapper.",
		].join("\n");
	}
	if (operation.kind === "rewrite-block") {
		const target = operation.target.kind === "block" ? operation.target : null;
		if (!target) {
			return prompt;
		}
		return [
			"Instruction:",
			latestPrompt,
			"",
			...previousPromptSection,
			`Block type: ${target.blockType ?? "unknown"}`,
			"Current block content:",
			target.sourceText,
			"",
			"Wrap the rewritten replacement content exactly like this:",
			"<pen_local_operation>replacement content</pen_local_operation>",
			"Do not output anything before or after the wrapper.",
		].join("\n");
	}
	if (operation.kind === "continue-block") {
		const target = operation.target.kind === "block" ? operation.target : null;
		if (!target) {
			return prompt;
		}
		const insertionOffset = target.insertionOffset ?? target.sourceText.length;
		return [
			"Instruction:",
			latestPrompt,
			"",
			...previousPromptSection,
			`Block type: ${target.blockType ?? "unknown"}`,
			"Text before cursor:",
			target.sourceText.slice(0, insertionOffset),
			"",
			"Text after cursor:",
			target.sourceText.slice(insertionOffset),
			"",
			"Wrap the continuation text exactly like this:",
			"<pen_local_operation>continuation text</pen_local_operation>",
			"Do not output anything before or after the wrapper.",
		].join("\n");
	}
	return prompt;
}

function buildStructuredGenerationPlan(
	prompt: string,
	config: PlaygroundPlannerConfig,
): PlaygroundRequestPlan {
	return {
		mode: "structured-generation",
		modelId: config.documentModel,
		contextFormat: "none",
		systemPrompt: config.structuredPlannerSystemPrompt,
		prompt,
		useTools: false,
		temperature: undefined,
		stopSequences: undefined,
		promptContext: null,
		selectedTextLength: null,
	};
}

function buildDocumentAgentPlan(
	editor: Editor,
	prompt: string,
	config: PlaygroundPlannerConfig,
	requestedOperation?: ModelRequestedOperation | null,
): PlaygroundRequestPlan {
	const promptContext = buildPromptContext(editor);
	return {
		mode: "document-agent",
		modelId: config.documentModel,
		contextFormat: "json",
		systemPrompt: config.documentSystemPrompt,
		prompt: buildPromptEnvelope(prompt, promptContext.json, requestedOperation),
		useTools: false,
		temperature: undefined,
		stopSequences: undefined,
		promptContext,
		selectedTextLength: null,
	};
}

export function buildPromptContext(
	editor: Editor,
): PlaygroundPromptContextEnvelope {
	const blocks = Array.from(editor.blocks()).map((block) => ({
		id: block.id,
		type: block.type,
		text: truncateText(block.textContent({ resolved: true }), 240),
		childCount: block.children.length,
	}));
	const selection = editor.selection;
	const selectedText = truncateText(editor.getSelectedText(), 600);
	const activeBlockId = resolveSelectionBlockId(selection);
	const activeBlockIndex = activeBlockId
		? blocks.findIndex((block) => block.id === activeBlockId)
		: -1;
	const nearbyBlocks = resolveNearbyBlocks(blocks, activeBlockIndex);
	const activeBlock =
		activeBlockIndex >= 0 ? blocks[activeBlockIndex] ?? null : blocks[0] ?? null;
	const payload = {
		blockCount: editor.blockCount(),
		selectionType: selection?.type ?? null,
		activeBlockId,
		selectedText,
		activeBlock,
		nearbyBlocks,
		blockTypes: [...new Set(blocks.map((block) => block.type))],
	};
	const json = JSON.stringify(payload);

	return {
		json,
		jsonBytes: utf8Encoder.encode(json).byteLength,
		estimatedJsonTokens: estimateTokens(json),
	};
}

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

function isStructuredPlannerPrompt(prompt: string): boolean {
	const normalizedPrompt = prompt.trimStart();
	return (
		normalizedPrompt.startsWith(STRUCTURED_PLANNER_PROMPT_PREFIX) ||
		normalizedPrompt.includes(`User request:\n${STRUCTURED_PLANNER_PROMPT_PREFIX}`)
	);
}

function buildPromptEnvelope(
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

function buildInlineAutocompletePlan(
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

function buildInlineAutocompletePlanFromRequest(
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

function resolveAutocompleteOutputTokenCap(
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

function extractAutocompleteContinuationTargetScope(
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

function buildSelectionFastPathPlan(
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

function isExplicitLocalOperation(
	operation: ModelRequestedOperation,
): operation is ModelRequestedOperation {
	return (
		operation.kind === "rewrite-selection" ||
		operation.kind === "rewrite-block" ||
		operation.kind === "continue-block"
	);
}

function resolveExplicitLocalOperationSourceText(
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

function parseSessionExecutionPrompt(
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

function resolveLiveSelectedText(editor: Editor): string {
	const selection = editor.selection;
	if (!selection || selection.type !== "text" || selection.isCollapsed) {
		return "";
	}
	return editor.getSelectedText();
}

function isInlineAutocompletePrompt(prompt: string): boolean {
	const normalizedPrompt = prompt.trim();
	const promptLines = normalizedPrompt.split("\n");
	return (
		promptLines[0]?.startsWith("prefix=") === true &&
		promptLines[1] === "cursor_here=true" &&
		promptLines[2]?.startsWith("suffix=") === true
	);
}

function buildSelectionPromptEnvelope(
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

function parsePinnedSelectionPrompt(
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

function extractSelectionInstruction(prompt: string, selectedText: string): string {
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

function classifySelectionPrompt(
	instruction: string,
): "rewrite" | "summarize" | "translate" | "expand" {
	const normalizedInstruction = instruction.trim().toLowerCase();

	if (normalizedInstruction.startsWith("summarize")) {
		return "summarize";
	}

	if (normalizedInstruction.startsWith("translate")) {
		return "translate";
	}

	if (
		normalizedInstruction.startsWith("expand") ||
		normalizedInstruction.includes("more detail")
	) {
		return "expand";
	}

	if (
		normalizedInstruction.startsWith("rewrite") ||
		normalizedInstruction.startsWith("fix grammar") ||
		normalizedInstruction.startsWith("simplify") ||
		normalizedInstruction.startsWith("shorten") ||
		normalizedInstruction.startsWith("make") ||
		normalizedInstruction.startsWith("improve")
	) {
		return "rewrite";
	}

	return "rewrite";
}

function resolveSelectionOutputTokenBudget(
	promptKind: "rewrite" | "summarize" | "translate" | "expand",
	selectedText: string,
	config: PlaygroundPlannerConfig,
): number {
	const selectedTokenEstimate = estimateTokens(selectedText);

	if (promptKind === "summarize") {
		return Math.min(
			config.selectionSummarizeOutputTokens,
			Math.max(80, Math.ceil(selectedTokenEstimate * 0.6)),
		);
	}

	if (promptKind === "translate") {
		return Math.min(
			config.selectionTranslateOutputTokens,
			Math.max(120, Math.ceil(selectedTokenEstimate * 1.35)),
		);
	}

	if (promptKind === "expand") {
		return Math.min(
			config.selectionOutputTokenCap,
			Math.max(
				config.selectionExpandOutputTokens,
				Math.ceil(selectedTokenEstimate * 2),
			),
		);
	}

	if (promptKind === "rewrite") {
		return Math.min(
			220,
			Math.max(72, Math.ceil(selectedTokenEstimate * 1.1)),
		);
	}

	return Math.min(
		config.selectionOutputTokenCap,
		Math.max(
			config.selectionDefaultOutputTokens,
			selectedTokenEstimate,
		),
	);
}

function resolveSelectionTemperature(
	promptKind: "rewrite" | "summarize" | "translate" | "expand",
): number {
	if (promptKind === "expand") {
		return 0.3;
	}

	if (promptKind === "translate") {
		return 0.2;
	}

	return 0;
}

function resolveNearbyBlocks(
	blocks: Array<{ id: string; type: string; text: string; childCount: number }>,
	activeBlockIndex: number,
) {
	if (blocks.length === 0) {
		return [];
	}

	if (activeBlockIndex < 0) {
		return blocks.slice(0, 5);
	}

	const startIndex = Math.max(0, activeBlockIndex - 2);
	const endIndex = Math.min(blocks.length, activeBlockIndex + 3);
	return blocks.slice(startIndex, endIndex);
}

function resolveSelectionBlockId(
	selection: SelectionState,
): string | null {
	if (!selection) {
		return null;
	}

	if (selection.type === "text" && "anchor" in selection) {
		return selection.anchor.blockId;
	}

	if (selection.type === "cell") {
		return selection.blockId;
	}

	if (selection.type === "block") {
		return selection.blockIds[0] ?? null;
	}

	return null;
}

function truncateText(value: string, limit: number): string {
	if (value.length <= limit) {
		return value;
	}

	return `${value.slice(0, limit)}...`;
}
