import { parseStructuredIntentRequestPrompt } from "@input/pen-ai";
import type { Editor, ModelRequestedOperation } from "@input/pen-types";
import {
	buildPromptEnvelope,
	buildSelectionPromptEnvelope,
	extractSelectionInstruction,
	isExplicitLocalOperation,
	isInlineAutocompletePrompt,
	isStructuredPlannerPrompt,
	parsePinnedSelectionPrompt,
	parseSessionExecutionPrompt,
	resolveAutocompleteOutputTokenCap,
	resolveExplicitLocalOperationSourceText,
	resolveLiveSelectedText,
} from "./prompts";
import {
	classifySelectionPrompt,
	estimateTokens,
	resolveNearbyBlocks,
	resolveSelectionBlockId,
	resolveSelectionOutputTokenBudget,
	resolveSelectionTemperature,
	truncateText,
} from "./selection";
import {
	EXPLICIT_SELECTION_FAST_REQUEST_ERROR,
	utf8Encoder,
	type PlaygroundPlannerConfig,
	type PlaygroundPromptContextEnvelope,
	type PlaygroundRequestMode,
	type PlaygroundRequestPlan,
} from "./types";

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
