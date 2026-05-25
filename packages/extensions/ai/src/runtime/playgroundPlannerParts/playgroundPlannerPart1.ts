// @ts-nocheck
import type { Editor, ModelRequestedOperation, SelectionState } from "@pen/types";
import { parseStructuredIntentRequestPrompt } from "../structuredIntent";
import { createPlaygroundRequestMetricsSeed, estimateTokens, isStructuredPlannerPrompt, buildPromptEnvelope, buildInlineAutocompletePlan, buildInlineAutocompletePlanFromRequest, resolveAutocompleteOutputTokenCap, extractAutocompleteContinuationTargetScope, buildSelectionFastPathPlan, isExplicitLocalOperation, resolveExplicitLocalOperationSourceText, parseSessionExecutionPrompt, resolveLiveSelectedText, isInlineAutocompletePrompt, buildSelectionPromptEnvelope, parsePinnedSelectionPrompt, extractSelectionInstruction } from "./playgroundPlannerPart2";
import { classifySelectionPrompt, resolveSelectionOutputTokenBudget, resolveSelectionTemperature, resolveNearbyBlocks, resolveSelectionBlockId, truncateText } from "./playgroundPlannerPart3";

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

export function buildExplicitRequestPlan(
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

export function buildExplicitLocalOperationPlan(
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

export function buildStructuredGenerationPlan(
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

export function buildDocumentAgentPlan(
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
