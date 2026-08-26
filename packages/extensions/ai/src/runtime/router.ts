import { isCollapsed } from "@input/pen-core";
import type { SelectionState } from "@input/pen-types";
import type { AISurface } from "../types";
import type {
	AIContentFormat,
	AIMutationMode,
	AIMutationPreference,
	AIRouteLane,
	AITargetKind,
	PromptIntent,
} from "./contracts";
import {
	resolveMutationMode,
	shouldStreamDirectAIOutput,
} from "./mutationPolicy";
import { resolveGenerationTargetKind } from "./generationTarget";

export interface RequestRouterInput {
	prompt: string;
	selection: SelectionState;
	blockType: string | null;
	blockCount: number;
	suggestMode: boolean;
	target: "selection" | "block";
	contentFormat: AIContentFormat;
	surface?: AISurface;
	mutationPreference?: AIMutationPreference;
}

export interface RequestRouterDecision {
	target: "selection" | "block";
	lane: AIRouteLane;
	mutationMode: AIMutationMode;
	contentFormat: AIContentFormat;
	editsArriveAsToolCalls: boolean;
	targetKind: AITargetKind;
	suggestMode: boolean;
	surface?: AISurface;
	mutationPreference?: AIMutationPreference;
	allowToolUse: boolean;
	useCursorContext: boolean;
	useDocumentSummary: boolean;
	shouldStreamDirectly: boolean;
	intent: PromptIntent;
	confidence: number;
}

interface NavigatorRefinementInput {
	selectedTextLength?: number;
	activeBlockType?: string | null;
	structuredTargetKind?: AITargetKind | null;
}

export type { PromptIntent } from "./contracts";

const REWRITE_PATTERNS =
	/\b(rewrite|retry|redo|again|do.?over|summari[sz]e|translate|simplify|fix|improve|shorten|expand|extend|polish|paraphrase|edit|revise|reword|rephrase)\b/i;
const CONTINUE_PATTERNS =
	/\b(continue|finish|complete|keep writing|next paragraph|next section)\b/i;
const GENERATIVE_PATTERNS =
	/\b(write|create|draft|compose|generate|brainstorm)\b/i;
const SEARCH_PATTERNS =
	/\b(find|search|look for|locate|where (?:is|are|does|do)|list (?:all|every|each|the)|scan for)\b/i;
const STRUCTURAL_PATTERNS =
	/\b(restructure|reorganize|outline|move|delete section|insert section|change blocks|convert|turn\s+(?:\S+\s+){0,8}?into|(?:bullet(?:ed)?|numbered|ordered) list|checklist|table|heading hierarchy|merge|split)\b/i;
const REVIEW_PATTERNS =
	/\b(review|critique|audit|compare|analyze entire|check whole)\b/i;
/**
 * Opening interrogatives only, and deliberately without the polite modals
 * (`can`, `could`, `would`, `will`): "Can you make the title purple?" is an
 * edit request wearing a question mark, and a trailing `?` cannot tell the two
 * apart. The asymmetry decides the conservatism — a question misread as an
 * edit rewrites the document, while an edit misread as a question only loses
 * EC17's forced tool choice and still edits when the model picks the tool.
 */
const QUESTION_PATTERNS =
	/^\s*(what|why|how|who|when|where|which|whose|is|are|was|were|does|do|did|has|have|should|am)\b/i;
const TABLE_TARGET_PATTERNS = /\b(table|grid|rows?|columns?)\b/i;

/**
 * Largest document whose working set annotates every block. Bigger documents
 * still take the tool loop; they just do not ship a fully annotated copy.
 * The working-set builder is the only reader.
 */
export const AI_ANNOTATED_WORKING_SET_MAX_BLOCKS = 120;

/**
 * Whether this lane's durable edits arrive as `edit_document` tool calls (EC1).
 *
 * This replaced a three-member apply-strategy union (UC5). The other two
 * members — "text fast apply" and "markdown full replace" — were a restatement
 * of `target` and `contentFormat`, which the decision already carries, and no
 * consumer read them for anything but the absence of `tool-edit`. What every
 * reader actually needed was this one bit: may the assistant text become a
 * durable mutation, or is text the model talking?
 */
function editsArriveAsToolCalls(lane: AIRouteLane): boolean {
	return lane === "tool-loop";
}

export function routeAIRequest(
	input: RequestRouterInput,
): RequestRouterDecision {
	const selectionExpanded =
		input.selection?.type === "text" && !isCollapsed(input.selection);
	const intent = classifyPromptIntent(input.prompt);

	let lane: AIRouteLane;
	if (
		selectionExpanded &&
		input.target === "selection" &&
		intent === "rewrite"
	) {
		lane = "selection-rewrite";
	} else if (
		input.target === "block" &&
		(intent === "continue" ||
			(input.surface === "inline-edit" && intent === "local-edit")) &&
		(!selectionExpanded || input.surface === "inline-edit") &&
		!isStructuralBlockType(input.blockType)
	) {
		lane = "cursor-context";
	} else if (
		(intent === "review" || intent === "structural") &&
		input.suggestMode
	) {
		lane = "review";
	} else if (selectionExpanded && input.target === "selection") {
		lane = "selection-rewrite";
	} else {
		lane = "tool-loop";
	}

	let mutationMode = resolveMutationMode({
		lane,
		suggestMode: input.suggestMode,
		selection: input.selection,
		surface: input.surface,
		mutationPreference: input.mutationPreference,
	});
	let targetKind = resolveGenerationTargetKind({
		target: input.target,
		blockType: input.blockType,
		workingSet: null,
	});
	const promptTargetKind = inferPromptTargetKind(input.prompt);
	if (
		input.target === "block" &&
		targetKind === "block" &&
		promptTargetKind === "table"
	) {
		targetKind = promptTargetKind;
	}
	mutationMode = resolveStructuredMutationMode({
		mutationMode,
		target: input.target,
		targetKind,
		surface: input.surface,
		activeBlockType: input.blockType,
	});
	const resolvedContentFormat = resolveGenerationContentFormat({
		target: input.target,
		targetKind,
		surface: input.surface,
		fallback: input.contentFormat,
	});

	return {
		target: input.target,
		lane,
		mutationMode,
		contentFormat: resolvedContentFormat,
		editsArriveAsToolCalls: editsArriveAsToolCalls(lane),
		targetKind,
		suggestMode: input.suggestMode,
		surface: input.surface,
		mutationPreference: input.mutationPreference,
		allowToolUse: lane === "tool-loop" || lane === "review",
		useCursorContext: lane === "cursor-context",
		useDocumentSummary: lane === "tool-loop" || lane === "review",
		shouldStreamDirectly: shouldStreamDirectAIOutput({
			mutationMode,
			contentFormat: resolvedContentFormat,
			target: input.target,
		}),
		intent,
		confidence: estimateBaseConfidence(lane, intent),
	};
}

export function refineRouteWithNavigator(
	decision: RequestRouterDecision,
	input: NavigatorRefinementInput,
): RequestRouterDecision {
	let lane = decision.lane;
	let confidence = decision.confidence;
	let targetKind = decision.targetKind;

	if (input.activeBlockType && isStructuralBlockType(input.activeBlockType)) {
		if (input.activeBlockType === "table") {
			targetKind = "table";
		}
		confidence = Math.min(confidence, 0.45);
		if (lane === "cursor-context") {
			lane = "tool-loop";
		}
	}

	if (
		(input.selectedTextLength ?? 0) > 1200 &&
		lane === "selection-rewrite"
	) {
		confidence = Math.min(confidence, 0.55);
	}

	if (input.structuredTargetKind === "table") {
		targetKind = input.structuredTargetKind;
		confidence = Math.min(confidence, 0.5);
		if (lane === "cursor-context") {
			lane = "tool-loop";
		}
	}

	const mutationMode = resolveStructuredMutationMode({
		mutationMode:
			lane === decision.lane
				? decision.mutationMode
				: resolveMutationMode({
						lane,
						suggestMode: decision.suggestMode,
						selection: null,
						surface: decision.surface,
						mutationPreference: decision.mutationPreference,
					}),
		target: "block",
		targetKind,
		surface: decision.surface,
		activeBlockType: input.activeBlockType ?? null,
	});
	const contentFormat = resolveGenerationContentFormat({
		target: decision.target,
		targetKind,
		surface: decision.surface,
		fallback: decision.contentFormat,
	});

	if (lane === decision.lane) {
		return {
			...decision,
			confidence,
			targetKind,
			contentFormat,
			mutationMode,
			editsArriveAsToolCalls: editsArriveAsToolCalls(lane),
			shouldStreamDirectly: shouldStreamDirectAIOutput({
				mutationMode,
				contentFormat,
				target: decision.target,
			}),
		};
	}

	return {
		...decision,
		lane,
		mutationMode,
		contentFormat,
		editsArriveAsToolCalls: editsArriveAsToolCalls(lane),
		targetKind,
		allowToolUse: lane === "tool-loop" || lane === "review",
		useCursorContext: lane === "cursor-context",
		useDocumentSummary: lane === "tool-loop" || lane === "review",
		shouldStreamDirectly: shouldStreamDirectAIOutput({
			mutationMode,
			contentFormat,
			target: decision.target,
		}),
		confidence,
	};
}

export function classifyPromptIntent(prompt: string): PromptIntent {
	if (REWRITE_PATTERNS.test(prompt)) {
		return "rewrite";
	}
	if (CONTINUE_PATTERNS.test(prompt)) {
		return "continue";
	}
	if (REVIEW_PATTERNS.test(prompt)) {
		return "review";
	}
	if (STRUCTURAL_PATTERNS.test(prompt)) {
		return "structural";
	}
	if (SEARCH_PATTERNS.test(prompt)) {
		return "search";
	}
	if (GENERATIVE_PATTERNS.test(prompt)) {
		return "unknown";
	}
	// Last, so every edit verb above wins: "Improve this?" is a rewrite.
	if (QUESTION_PATTERNS.test(prompt)) {
		return "question";
	}
	if (prompt.trim().length <= 80) {
		return "local-edit";
	}
	return "unknown";
}

function resolveGenerationContentFormat(input: {
	target: "selection" | "block";
	targetKind: AITargetKind;
	surface?: AISurface;
	fallback: AIContentFormat;
}): AIContentFormat {
	if (input.target === "selection") {
		return input.fallback;
	}
	if (
		input.targetKind === "table" ||
		input.fallback === "markdown" ||
		input.surface === "bottom-chat"
	) {
		return "markdown";
	}
	return input.fallback;
}

function isStructuralBlockType(blockType: string | null): boolean {
	return blockType === "table" || blockType === "kanban";
}

function inferPromptTargetKind(prompt: string): AITargetKind | null {
	if (TABLE_TARGET_PATTERNS.test(prompt)) {
		return "table";
	}
	return null;
}

function estimateBaseConfidence(
	lane: AIRouteLane,
	intent: PromptIntent,
): number {
	if (lane === "selection-rewrite" && intent === "rewrite") {
		return 0.95;
	}
	if (lane === "cursor-context" && intent === "continue") {
		return 0.9;
	}
	if (lane === "tool-loop" || lane === "review") {
		return 0.75;
	}
	return 0.8;
}

function resolveStructuredMutationMode(input: {
	mutationMode: AIMutationMode;
	target: "selection" | "block";
	targetKind: AITargetKind;
	surface?: AISurface;
	activeBlockType?: string | null;
}): AIMutationMode {
	if (
		input.surface === "bottom-chat" &&
		input.target === "block" &&
		input.targetKind === "table" &&
		input.activeBlockType !== "table"
	) {
		return "streaming-suggestions";
	}
	return input.mutationMode;
}
