// @ts-nocheck
import type { Editor, ModelRequestedOperation, SelectionState } from "@pen/types";
import { parseStructuredIntentRequestPrompt } from "../structuredIntent";
import { NEARBY_BLOCK_RADIUS, STRUCTURED_PLANNER_PROMPT_PREFIX, EXPLICIT_SELECTION_FAST_REQUEST_ERROR, SESSION_PROMPT_HISTORY_HEADER, SESSION_PROMPT_LATEST_HEADER, SESSION_PROMPT_INTROS, utf8Encoder, buildPlaygroundRequestPlan, buildExplicitRequestPlan, buildExplicitLocalOperationPlan, buildExplicitLocalOperationPrompt, buildStructuredGenerationPlan, buildDocumentAgentPlan, buildPromptContext } from "./playgroundPlannerPart1";
import type { PlaygroundPromptContextEnvelope, PlaygroundRequestMode, PlaygroundResolvedContextFormat, PlaygroundRequestPlan, PlaygroundPlannerConfig } from "./playgroundPlannerPart1";
import { createPlaygroundRequestMetricsSeed, estimateTokens, isStructuredPlannerPrompt, buildPromptEnvelope, buildInlineAutocompletePlan, buildInlineAutocompletePlanFromRequest, resolveAutocompleteOutputTokenCap, extractAutocompleteContinuationTargetScope, buildSelectionFastPathPlan, isExplicitLocalOperation, resolveExplicitLocalOperationSourceText, parseSessionExecutionPrompt, resolveLiveSelectedText, isInlineAutocompletePrompt, buildSelectionPromptEnvelope, parsePinnedSelectionPrompt, extractSelectionInstruction } from "./playgroundPlannerPart2";

export function classifySelectionPrompt(
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

export function resolveSelectionOutputTokenBudget(
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

export function resolveSelectionTemperature(
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

export function resolveNearbyBlocks(
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

export function resolveSelectionBlockId(
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

export function truncateText(value: string, limit: number): string {
	if (value.length <= limit) {
		return value;
	}

	return `${value.slice(0, limit)}...`;
}
