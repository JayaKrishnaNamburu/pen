// @ts-nocheck
import {
	createDecorationSet,
	ensureInlineCompletionController,
	getInlineCompletionController as getInlineCompletionControllerFromCore,
} from "@pen/core";
import {
	buildDocumentWriteOps,
	getDocumentToolRuntime,
} from "@pen/document-ops";
import type {
	Decoration,
	DocumentOp,
	Editor,
	Extension,
	HistoryAppliedEvent,
	KeyBinding,
	ModelAdapter,
	ModelOperationScopedRangeTarget,
	ModelOperationSelectionTarget,
	OpOrigin,
	SelectionState,
	StreamingTarget,
	TextSelection,
	ToolDefinition,
	ToolRuntime,
	UndoHistoryMetadataController,
} from "@pen/types";
import {
	AI_AUTOCOMPLETE_CONTROLLER_SLOT,
	AI_CONTROLLER_SLOT as CORE_AI_CONTROLLER_SLOT,
	AI_INLINE_HISTORY_SLOT as CORE_AI_INLINE_HISTORY_SLOT,
	AI_REVIEW_CONTROLLER_SLOT as CORE_AI_REVIEW_CONTROLLER_SLOT,
	INLINE_COMPLETION_SLOT as CORE_INLINE_COMPLETION_SLOT,
	defineExtension,
	getOpOriginType,
	isScopedSelectionTarget,
	renderSelectionTargetBlockText,
	resolveSelectionTargetBlockIds,
	shouldExposeBlockInTooling,
	UNDO_HISTORY_METADATA_CONTROLLER_SLOT_KEY,
	usesInlineTextSelection,
} from "@pen/types";
import { runAgenticLoop } from "../agentic/loop";
import { defaultAICommands } from "../commands/defaultCommands";
import { AICommandRegistry } from "../commands/registry";
import { AIInlineHistoryService, AIReviewService } from "../controllers";
import { buildAffectedRangeDecorations } from "../decorations/affectedRange";
import { buildGenerationZoneDecorations } from "../decorations/generationZone";
import { buildTrackChangesDecorations } from "../decorations/trackChanges";
import { getBlockAdapter } from "../runtime/blockAdapters";
import type {
	AIApplyStrategy,
	AIContentFormat,
	AITargetKind,
} from "../runtime/contracts";
import { resolveDocumentInsertionAnchor } from "../runtime/documentInsertionAnchor";
import {
	MARKDOWN_FAST_APPLY_ROOT_TAG,
	normalizeFlowMarkdownOutput,
} from "../runtime/flowMarkdown";
import {
	applyMarkdownFastApply,
	parseMarkdownFastApplyContract,
} from "../runtime/markdownFastApply";
import { parseMarkdownPatchPlanContract } from "../runtime/markdownPatchPlan";
import { buildMutationReceipt } from "../runtime/mutationReceipt";
import { buildDocumentMutationPlanExecution } from "../runtime/planExecutor";
import { validateDocumentMutationPlanShape } from "../runtime/planValidation";
import type { StructuralReviewItem } from "../runtime/reviewArtifacts";
import {
	buildStructuralReviewItems,
	removeStructuralReviewItemPlan,
	selectStructuralReviewItemPlan,
} from "../runtime/reviewArtifacts";
import {
	classifyPromptIntent,
	refineRouteWithNavigator,
	routeAIRequest,
} from "../runtime/router";
import {
	isClearDocumentPrompt,
	isDocumentFollowUpEditPrompt,
	isDocumentResetPrompt,
	isWholeDocumentRewritePrompt,
} from "../runtime/promptTargeting";
import { SuggestedAIOperationRunner } from "../runtime/suggestedOperationRunner";
import { compileStructuredIntentToPlan } from "../runtime/structuredIntentCompiler";
import {
	buildPlannerPrompt,
	parseStructuredPlanPreview,
	parseStructuredPlanResult,
	resolveExecutionMode,
} from "../runtime/structuredPlanner";
import {
	buildGenerationStructuredPreviewState,
	buildStructuredPreviewPatchOperations,
} from "../runtime/structuredPreview";
import {
	acceptAllSuggestions,
	acceptSuggestion,
	acceptSuggestions,
	rejectAllSuggestions,
	rejectSuggestion,
	rejectSuggestions,
} from "../suggestions/acceptReject";
import { readAllSuggestions } from "../suggestions/persistent";
import {
	AI_SESSION_SUGGESTION_ORIGIN,
	interceptApplyForSuggestMode,
	shouldBypassSuggestMode,
	SUGGESTION_RESOLUTION_ORIGIN,
} from "../suggestions/suggestMode";
import type {
	AICommandBinding,
	AICommandContext,
	AICommandExecutionOptions,
	AIContextualPromptRect,
	AIController,
	AIControllerState,
	AIExtensionConfig,
	AIInlineCompletionController,
	AIInlineHistoryController,
	AIInlineHistoryDirection,
	AIInlineHistorySnapshot,
	AIMutationReceipt,
	AIReviewController,
	AIRequestedOperation,
	AISession,
	AISessionMetrics,
	AISessionResolution,
	AISessionSelectionSnapshot,
	AISessionTarget,
	AIStreamEvent,
	AISurface,
	AIWorkingSetEnvelope,
	AIWorkingSetRetrievedSpan,
	FastApplyDebugState,
	GenerationState,
	GenerationStructuredPreviewState,
	PersistentTextSuggestion,
	PersistentSuggestion,
	ResolvedEditProposal,
	ResolvedEditTarget,
} from "../types";
import { resolveContextualPromptAnchor, resolveContextualPromptState, createInlineHistorySnapshot, cloneSessionTarget, cloneInlineHistorySessions, recreateTextSelection, resolveSelectionSnapshotBlockRange, resolveSelectionSnapshotRangeStart, resolveSelectionSnapshotRangeEnd } from "./extensionHelpersPart2";
import { resolveRequestedOperationForSession, resolveLocalOperationContentFormat, canUseLocalBlockTextOperation, canReuseBottomChatSessionOperation, resolveResolvedEditTargetFromRequestedOperation, areResolvedEditTargetsEqual, buildSessionExecutionPrompt } from "./extensionHelpersPart3";
import { createRewriteSelectionOperation, createRewriteSelectionOperationFromResolvedTarget, createRewriteBlockOperation, createContinueBlockOperation, createDocumentTransformOperation, resolvePreviousGeneratedBlockIds, shouldReplacePreviousGeneratedBlocks, resolveReplacementDeleteBlockIds, createResolvedSelectionEditTarget, createResolvedScopedEditTarget, createResolvedEditProposal } from "./extensionHelpersPart4";
import { resolveResolvedEditProposal, resolveSelectionForRequestedOperation, resolveFullBlockTextSelection, resolveDocumentBlockRangeSelection, resolveDocumentTitleSelection, resolveDocumentParagraphSelection, parseParagraphReference, resolveWordOrdinal, resolveBlockIdForRequestedOperation } from "./extensionHelpersPart5";
import { resolveRequestedOperationConflict, resolveContinueInsertionOffset, createSelectionSignature, resolveSessionSelectionTarget, resolveLiveInlineSelectionTarget, resolvePendingInlineSelectionTarget, resolveAcceptedInlineSelectionTarget, shouldCloseInlineSessionPrompt, closeInlineSessionPrompt, createDefaultSessionFastApplyMetrics, accumulateSessionFastApplyMetrics, selectionMatchesSnapshot } from "./extensionHelpersPart6";
import { resolveSessionSelectionSnapshots, sessionTargetMatches, sessionSelectionMatches, resolveSessionBlockId, resolveBlockInsertionOffset, appendUniqueString, areSuggestionsEqual, areAIControllerStatesEqual, areGenerationsEqual, areSessionsEqual, areInlineHistorySnapshotsEqual, didInlineHistoryCheckpointChange } from "./extensionHelpersPart7";
import { buildInlineHistoryCheckpoint, countSettledInlineTurns, hasStreamingInlineTurns, resolveInlineShortcutHistoryState, areInlineShortcutHistoryStatesEqual, shouldReplaceInlineShortcutWaypointRepresentative, areEphemeralSuggestionsEqual, areStringArraysEqual, areStructuredValuesEqual } from "./extensionHelpersPart8";
import { buildSelectionReplacementOps, sliceInlineDeltasFromOffset, resolveSelectionText, shouldReplaceEmptyMarkdownTarget, shouldTrimLeadingBlankBlockGenerationText, trimLeadingBlankBlockGenerationText, isVisuallyEmptyInlineText } from "./extensionHelpersPart9";

export type GenerationTarget =
	| {
			type: "block";
			blockId: string;
			offset: number;
	  }
	| {
			type: "selection";
			selection: TextSelection;
	  };

export interface GenerationExecutionContext {
	sessionId?: string;
	surface?: AISurface;
	targetType?: GenerationTarget["type"];
	operation?: AIRequestedOperation | null;
	replaceTargetBlock?: boolean;
	replaceBlockIds?: string[];
}

export function resolveGenerationRequestMode(
	context?: GenerationExecutionContext,
): string | undefined {
	if (context?.operation?.kind === "rewrite-selection") {
		if (context.surface === "inline-edit") {
			return "inline-edit";
		}
		if (context.surface === "bottom-chat") {
			return "selection-fast";
		}
	}
	if (context?.targetType === "selection") {
		if (context.surface === "inline-edit") {
			return "inline-edit";
		}
		if (context.surface === "bottom-chat") {
			return "selection-fast";
		}
	}
	if (context?.surface === "inline-edit") {
		return "inline-edit";
	}
	if (context?.surface === "bottom-chat") {
		return "bottom-chat";
	}
	return undefined;
}

export function isLocalRequestedOperation(
	operation: AIRequestedOperation | null | undefined,
): operation is AIRequestedOperation {
	return (
		operation?.kind === "rewrite-selection" ||
		operation?.kind === "rewrite-block" ||
		operation?.kind === "continue-block" ||
		(operation?.kind === "document-transform" &&
			operation.target.kind === "document" &&
			(operation.target.transform === "rewrite" ||
				operation.target.transform === "remove" ||
				operation.target.placement === "replace-blocks"))
	);
}

export const EMPTY_TOOL_RUNTIME: ToolRuntime = {
	registerTool(_def: ToolDefinition): void {},
	unregisterTool(_name: string): void {},
	listTools(): readonly ToolDefinition[] {
		return [];
	},
	getTool(): ToolDefinition | null {
		return null;
	},
	async executeTool(name: string): Promise<unknown> {
		throw new Error(`Unknown tool: "${name}"`);
	},
};

export const MAX_STREAM_EVENTS = 200;

export const AI_UNDO_HISTORY_METADATA_KEY = "ai:inline-session-history";

export interface AIInlineHistoryRestoreRequest {
	direction: AIInlineHistoryDirection;
	targetSnapshotId: string;
	targetDocumentVersion: number;
	shortcutOnly?: boolean;
	sessionId?: string | null;
	targetState?: AIInlineShortcutHistoryState | null;
}

export type AIInlineShortcutHistoryPhase = "none" | "review" | "resolved";

export interface AIInlineShortcutHistoryState {
	sessionId: string | null;
	phase: AIInlineShortcutHistoryPhase;
	turnCount: number;
	turnId: string | null;
	resolution?: "accepted" | "rejected";
}

export interface AIInlineShortcutHistoryWaypoint {
	startIndex: number;
	endIndex: number;
	representativeIndex: number;
	state: AIInlineShortcutHistoryState;
}

export function resolveOrderedReviewItems(
	reviewItems: readonly StructuralReviewItem[],
	ids: readonly string[],
): StructuralReviewItem[] {
	const remainingIds = new Set(ids);
	const orderedReviewItems: StructuralReviewItem[] = [];
	for (const reviewItem of reviewItems) {
		if (!remainingIds.has(reviewItem.id)) {
			continue;
		}
		orderedReviewItems.push(reviewItem);
		remainingIds.delete(reviewItem.id);
	}
	return orderedReviewItems;
}

export function sortReviewItemsForRemoval(
	reviewItems: readonly StructuralReviewItem[],
): StructuralReviewItem[] {
	return [...reviewItems].sort(compareReviewItemRemovalOrder);
}

export function compareReviewItemRemovalOrder(
	left: StructuralReviewItem,
	right: StructuralReviewItem,
): number {
	const maxPathLength = Math.max(
		left.bundlePath.length,
		right.bundlePath.length,
	);
	for (let index = 0; index < maxPathLength; index += 1) {
		const leftPart = left.bundlePath[index] ?? -1;
		const rightPart = right.bundlePath[index] ?? -1;
		if (leftPart !== rightPart) {
			return rightPart - leftPart;
		}
	}

	const leftStepIndex = left.stepIndex ?? -1;
	const rightStepIndex = right.stepIndex ?? -1;
	return rightStepIndex - leftStepIndex;
}

export function resolveActiveBlockId(selection: SelectionState): string | null {
	if (!selection) return null;
	if (selection.type === "text") return selection.focus.blockId;
	if (selection.type === "block") return selection.blockIds[0] ?? null;
	if (selection.type === "cell") return selection.blockId;
	return null;
}

export function readModelId(model: ModelAdapter | undefined): string | undefined {
	if (!model || typeof model !== "object") return undefined;
	const candidate = model as ModelAdapter & {
		name?: string;
		modelId?: string;
	};
	return candidate.modelId ?? candidate.name;
}

export function supportsStructuredIntent(model: ModelAdapter | undefined): boolean {
	return model?.capabilities?.structuredIntent === true;
}

export type AIStreamEventInput =
	| {
			type: "generation-start";
			prompt: string;
			target: GenerationState["target"];
	  }
	| {
			type: "status";
			status: AIControllerState["status"];
	  }
	| {
			type: "text-delta";
			delta: string;
			text: string;
	  }
	| {
			type: "operation";
			operation: AIRequestedOperation;
			phase: "preview" | "final" | "conflict";
			text?: string;
			reason?: string;
	  }
	| {
			type: "app-partial";
			data: unknown;
			final: boolean;
	  }
	| {
			type: "tool-call";
			toolCallId: string;
			toolName: string;
			input: unknown;
	  }
	| {
			type: "tool-output";
			toolCallId: string;
			toolName: string;
			part: unknown;
			output: unknown;
	  }
	| {
			type: "tool-result";
			toolCallId: string;
			toolName: string;
			output: unknown;
			state: "complete" | "error";
	  }
	| {
			type: "structured-preview";
			preview: GenerationStructuredPreviewState;
			patches: readonly {
				op: "add" | "remove" | "replace";
				path: string;
				value?: unknown;
			}[];
	  }
	| {
			type: "generation-finish";
			status: GenerationState["status"];
			text: string;
	  };

export function createAIStreamEvent(
	generation: Pick<
		GenerationState,
		"id" | "zoneId" | "blockId" | "sessionId"
	>,
	event: AIStreamEventInput,
): AIStreamEvent {
	return {
		...event,
		generationId: generation.id,
		sessionId: generation.sessionId,
		zoneId: generation.zoneId,
		blockId: generation.blockId,
		timestamp: Date.now(),
	};
}

export function resolvePromptTarget(
	selection: SelectionState,
	target: "auto" | "selection" | "block" | "document" | undefined,
): "selection" | "block" | "document" {
	if (target === "selection") {
		return "selection";
	}
	if (target === "block") {
		return "block";
	}
	if (target === "document") {
		return "document";
	}
	return selection?.type === "text" && !selection.isCollapsed
		? "selection"
		: "block";
}

export function resolveSessionTarget(
	editor: Editor,
	target: "auto" | "selection" | "block" | "document" | undefined,
): AISessionTarget {
	if (target === "document") {
		return { kind: "document" };
	}
	const selection = editor.selection;
	if (
		(target === "selection" || target === "auto") &&
		selection?.type === "text" &&
		!selection.isCollapsed
	) {
		const range = selection.toRange();
		const selectionSnapshot = resolveSessionSelectionSnapshot(selection);
		return {
			kind: "selection",
			selection: recreateTextSelection(editor, selectionSnapshot),
			blockId: range.start.blockId,
		};
	}
	const blockId =
		target === "block" || target === "auto"
			? (resolveActiveBlockId(selection) ??
				editor.lastBlock()?.id ??
				editor.firstBlock()?.id ??
				null)
			: null;
	return blockId ? { kind: "block", blockId } : { kind: "document" };
}

export function resolveSessionAnchor(
	selection: SelectionState | TextSelection,
): AISession["anchor"] | undefined {
	if (selection?.type !== "text") {
		return undefined;
	}
	const range = selection.toRange();
	return {
		blockId: range.start.blockId,
		from: range.start.offset,
		to: range.end.offset,
	};
}

export function resolveSessionSelectionSnapshot(
	selection: TextSelection,
): AISessionSelectionSnapshot {
	return {
		anchor: { ...selection.anchor },
		focus: { ...selection.focus },
		blockRange: [...selection.blockRange],
		isMultiBlock: selection.isMultiBlock,
	};
}
