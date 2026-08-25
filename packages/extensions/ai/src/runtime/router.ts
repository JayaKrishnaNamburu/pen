import { isCollapsed } from "@input/pen-core";
import type { SelectionState } from "@input/pen-types";
import type { AISurface } from "../types";
import type {
	AIApplyStrategy,
	AIBlockAdapterId,
	AIBlockClass,
	AIContentFormat,
	AIEditChannel,
	AIMutationMode,
	AIMutationPreference,
	AIPlannerMode,
	AIRouteLane,
	AITargetKind,
	AITransportKind,
	PromptIntent,
} from "./contracts";
import {
	resolveBlockAdapter,
	resolveBlockAdapterContentFormat,
} from "./blockAdapters";
import {
	resolveMutationMode,
	shouldStreamDirectAIOutput,
} from "./mutationPolicy";
import {
	resolveGenerationTargetKind,
	resolvePlannerMode,
} from "./structuredPlanner";

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
	editChannel?: AIEditChannel;
}

export interface RequestRouterDecision {
	target: "selection" | "block";
	lane: AIRouteLane;
	mutationMode: AIMutationMode;
	contentFormat: AIContentFormat;
	plannerMode: AIPlannerMode;
	applyStrategy: AIApplyStrategy;
	targetKind: AITargetKind;
	blockClass: AIBlockClass;
	adapterId: AIBlockAdapterId;
	transportKind: AITransportKind;
	suggestMode: boolean;
	surface?: AISurface;
	mutationPreference?: AIMutationPreference;
	editChannel?: AIEditChannel;
	allowToolUse: boolean;
	useCursorContext: boolean;
	useDocumentSummary: boolean;
	shouldStreamDirectly: boolean;
	intent: PromptIntent;
	confidence: number;
}

interface NavigatorRefinementInput {
	surroundingBlockCount?: number;
	selectedTextLength?: number;
	activeBlockType?: string | null;
	structuredTargetKind?: AITargetKind | null;
}

export type { PromptIntent } from "./contracts";

const REWRITE_PATTERNS = /\b(rewrite|retry|redo|again|do.?over|summari[sz]e|translate|simplify|fix|improve|shorten|expand|extend|polish|paraphrase|edit|revise|reword|rephrase)\b/i;
const CONTINUE_PATTERNS = /\b(continue|finish|complete|keep writing|next paragraph|next section)\b/i;
const GENERATIVE_PATTERNS = /\b(write|create|draft|compose|generate|brainstorm)\b/i;
const SEARCH_PATTERNS = /\b(find|search|look for|locate|where (?:is|are|does|do)|list (?:all|every|each|the)|scan for)\b/i;
const STRUCTURAL_PATTERNS = /\b(restructure|reorganize|outline|move|delete section|insert section|change blocks|convert|turn\s+(?:\S+\s+){0,8}?into|(?:bullet(?:ed)?|numbered|ordered) list|checklist|table|heading hierarchy|merge|split)\b/i;
const REVIEW_PATTERNS = /\b(review|critique|audit|compare|analyze entire|check whole)\b/i;
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
 * Largest document that ships whole into a fast-apply prompt. Structural work
 * only takes the single-pass lane when the whole document fits, so the lane
 * and its context agree by construction; bigger documents go to the tool loop,
 * which can read what it needs. The working-set builder reads the same bound.
 */
export const AI_FAST_APPLY_MAX_DOCUMENT_BLOCKS = 120;

/**
 * The tool edit channel replaces the one lane that commits a durable edit by
 * parsing the assistant text stream. Streaming lanes (selection rewrite,
 * cursor continuation) keep writing text deltas, and the review lane keeps
 * staging (`spec-better-ai/01-edit-channel.md` EC1, EC12).
 */
function applyEditChannelLane(
	lane: AIRouteLane,
	editChannel: AIEditChannel | undefined,
): AIRouteLane {
	if (editChannel !== "tool") return lane;
	return lane === "context-first" ? "tool-loop" : lane;
}

/**
 * A tool-channel lane must not also ask the model for a text-parsed edit plan:
 * the prompt would demand XML while the channel expects a tool call, and the
 * durable edit would have two possible sources. Lanes that only stream text
 * keep their text strategy (EC1).
 */
function applyEditChannelStrategy(
	strategy: AIApplyStrategy,
	lane: AIRouteLane,
	editChannel: AIEditChannel | undefined,
): AIApplyStrategy {
	if (editChannel !== "tool") return strategy;
	return lane === "tool-loop" ? "tool-edit" : strategy;
}

export function routeAIRequest(
	input: RequestRouterInput,
): RequestRouterDecision {
	const selectionExpanded =
		input.selection?.type === "text" && !isCollapsed(input.selection);
	const intent = classifyPromptIntent(input.prompt);

	let lane: AIRouteLane;
	if (selectionExpanded && input.target === "selection" && intent === "rewrite") {
		lane = "selection-rewrite";
	} else if (
		input.target === "block" &&
		(intent === "continue" ||
			(input.surface === "inline-edit" && intent === "local-edit")) &&
		(!selectionExpanded || input.surface === "inline-edit") &&
		!isStructuralBlockType(input.blockType)
	) {
		lane = "cursor-context";
	} else if (intent === "review") {
		lane = input.suggestMode ? "review" : "tool-loop";
	} else if (intent === "structural") {
		// Structural edits on flow blocks resolve fastest through the
		// markdown fast-apply lane; structured blocks (tables, boards) and
		// large documents still need the tool loop.
		lane = input.suggestMode
			? "review"
			: !isStructuralBlockType(input.blockType) &&
				  input.blockCount <= AI_FAST_APPLY_MAX_DOCUMENT_BLOCKS
				? "context-first"
				: "tool-loop";
	} else if (intent === "search") {
		lane = "tool-loop";
	} else if (
		!selectionExpanded &&
		input.blockCount <= AI_FAST_APPLY_MAX_DOCUMENT_BLOCKS
	) {
		lane = "context-first";
	} else if (selectionExpanded && input.target === "selection") {
		lane = "selection-rewrite";
	} else {
		lane = "tool-loop";
	}
	lane = applyEditChannelLane(lane, input.editChannel);

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
	let plannerMode = resolvePlannerMode({
		target: input.target,
		targetKind,
		intent,
	});
	mutationMode = resolveStructuredMutationMode({
		mutationMode,
		target: input.target,
		targetKind,
		surface: input.surface,
		activeBlockType: input.blockType,
	});
	const adapter = resolveBlockAdapter({
		targetKind,
		plannerMode,
		target: input.target,
		activeBlockType: input.blockType,
		surface: input.surface,
		mutationMode,
	});
	const resolvedContentFormat = resolveBlockAdapterContentFormat({
		adapter,
		target: input.target,
		targetKind,
		surface: input.surface,
		mutationMode,
		fallback: input.contentFormat,
	});
	plannerMode = reconcilePlannerModeWithPrompt({
		plannerMode,
		adapterId: adapter.id,
		contentFormat: resolvedContentFormat,
		intent,
	});

	return {
		target: input.target,
		lane,
		mutationMode,
		contentFormat: resolvedContentFormat,
		plannerMode,
		applyStrategy: applyEditChannelStrategy(
			resolveApplyStrategy({
				target: input.target,
				targetKind,
				contentFormat: resolvedContentFormat,
				plannerMode,
				mutationMode,
				intent,
				surface: input.surface,
			}),
			lane,
			input.editChannel,
		),
		targetKind,
		blockClass: adapter.blockClass,
		adapterId: adapter.id,
		transportKind: adapter.transportKind,
		suggestMode: input.suggestMode,
		surface: input.surface,
		mutationPreference: input.mutationPreference,
		editChannel: input.editChannel,
		allowToolUse: lane === "tool-loop" || lane === "review",
		useCursorContext: lane === "cursor-context" || lane === "context-first",
		useDocumentSummary: lane === "context-first" || lane === "tool-loop" || lane === "review",
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
		if (lane === "cursor-context" || lane === "context-first") {
			lane = "tool-loop";
		}
	}

	if ((input.surroundingBlockCount ?? 0) <= 1 && lane === "cursor-context") {
		confidence = Math.min(confidence, 0.4);
		lane = "context-first";
	}

	if ((input.selectedTextLength ?? 0) > 1200 && lane === "selection-rewrite") {
		confidence = Math.min(confidence, 0.55);
	}

	if (input.structuredTargetKind === "table") {
		targetKind = input.structuredTargetKind;
		confidence = Math.min(confidence, 0.5);
		if (lane === "cursor-context" || lane === "context-first") {
			lane = "tool-loop";
		}
	}
	lane = applyEditChannelLane(lane, decision.editChannel);

	let plannerMode = resolvePlannerMode({
		target: decision.target,
		targetKind,
		intent: decision.intent,
	});
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
	const adapter = resolveBlockAdapter({
		targetKind,
		plannerMode,
		target: decision.target,
		activeBlockType: input.activeBlockType ?? null,
		surface: decision.surface,
		mutationMode,
	});
	const contentFormat = resolveBlockAdapterContentFormat({
		adapter,
		target: decision.target,
		targetKind,
		surface: decision.surface,
		mutationMode,
		fallback: decision.contentFormat,
	});
	plannerMode = reconcilePlannerModeWithPrompt({
		plannerMode,
		adapterId: adapter.id,
		contentFormat,
		intent: decision.intent,
	});

	if (lane === decision.lane) {
		return {
			...decision,
			confidence,
			targetKind,
			blockClass: adapter.blockClass,
			adapterId: adapter.id,
			transportKind: adapter.transportKind,
			contentFormat,
			mutationMode,
			plannerMode,
			applyStrategy: applyEditChannelStrategy(
				resolveApplyStrategy({
					target: decision.target,
					targetKind,
					contentFormat,
					plannerMode,
					mutationMode,
					intent: decision.intent,
					surface: decision.surface,
				}),
				lane,
				decision.editChannel,
			),
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
		plannerMode,
		applyStrategy: applyEditChannelStrategy(
			resolveApplyStrategy({
				target: decision.target,
				targetKind,
				contentFormat,
				plannerMode,
				mutationMode,
				intent: decision.intent,
				surface: decision.surface,
			}),
			lane,
			decision.editChannel,
		),
		targetKind,
		blockClass: adapter.blockClass,
		adapterId: adapter.id,
		transportKind: adapter.transportKind,
		allowToolUse: lane === "tool-loop" || lane === "review",
		useCursorContext: lane === "cursor-context" || lane === "context-first",
		useDocumentSummary: lane === "context-first" || lane === "tool-loop" || lane === "review",
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

function isStructuralBlockType(blockType: string | null): boolean {
	return blockType === "table" || blockType === "kanban";
}

/**
 * The flow-markdown adapter with markdown content sends the fast-apply
 * prompt, so the finalize path must commit the buffered markdown instead of
 * expecting a structured JSON plan. Review intent stays structured because it
 * produces review bundles, not edits.
 *
 * This runs as a second pass because `resolveBlockAdapter` takes `plannerMode`
 * as input, so the content format that decides the prompt shape is only known
 * after the planner mode has been picked. Fold it upstream only by breaking
 * that parameter dependency first.
 */
function reconcilePlannerModeWithPrompt(input: {
	plannerMode: AIPlannerMode;
	adapterId: AIBlockAdapterId;
	contentFormat: AIContentFormat;
	intent: PromptIntent;
}): AIPlannerMode {
	if (
		input.plannerMode === "structured" &&
		input.adapterId === "flow-markdown" &&
		input.contentFormat === "markdown" &&
		input.intent !== "review"
	) {
		return "text";
	}
	return input.plannerMode;
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

function resolveApplyStrategy(input: {
	target: "selection" | "block";
	targetKind: AITargetKind;
	contentFormat: AIContentFormat;
	plannerMode: AIPlannerMode;
	mutationMode: AIMutationMode;
	intent: PromptIntent;
	surface?: AISurface;
}): AIApplyStrategy {
	if (input.target === "selection" || input.contentFormat === "text") {
		return "text-fast-apply";
	}
	if (
		input.surface === "bottom-chat" &&
		input.mutationMode === "streaming-suggestions"
	) {
		return "markdown-full-replace";
	}
	if (
		input.intent === "rewrite" ||
		input.intent === "continue" ||
		input.intent === "local-edit" ||
		input.intent === "structural" ||
		// Questions used to classify as `local-edit` and land here. Keeping
		// them means the XML channel is unchanged by the question intent; the
		// intent exists to stop the tool channel forcing an edit (EC17).
		input.intent === "question" ||
		input.targetKind === "table"
	) {
		return "markdown-fast-apply";
	}
	return "markdown-full-replace";
}
