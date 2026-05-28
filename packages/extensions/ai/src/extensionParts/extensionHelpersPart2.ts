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
import { resolveGenerationRequestMode, isLocalRequestedOperation, EMPTY_TOOL_RUNTIME, MAX_STREAM_EVENTS, AI_UNDO_HISTORY_METADATA_KEY, resolveOrderedReviewItems, sortReviewItemsForRemoval, compareReviewItemRemovalOrder, resolveActiveBlockId, readModelId, supportsStructuredIntent, createAIStreamEvent, resolvePromptTarget, resolveSessionTarget, resolveSessionAnchor, resolveSessionSelectionSnapshot } from "./extensionHelpersPart1";
import type { GenerationTarget, GenerationExecutionContext, AIInlineHistoryRestoreRequest, AIInlineShortcutHistoryPhase, AIInlineShortcutHistoryState, AIInlineShortcutHistoryWaypoint, AIStreamEventInput } from "./extensionHelpersPart1";
import { resolveRequestedOperationForSession, resolveLocalOperationContentFormat, canUseLocalBlockTextOperation, canReuseBottomChatSessionOperation, resolveResolvedEditTargetFromRequestedOperation, areResolvedEditTargetsEqual, buildSessionExecutionPrompt } from "./extensionHelpersPart3";
import { createRewriteSelectionOperation, createRewriteSelectionOperationFromResolvedTarget, createRewriteBlockOperation, createContinueBlockOperation, createDocumentTransformOperation, resolvePreviousGeneratedBlockIds, shouldReplacePreviousGeneratedBlocks, resolveReplacementDeleteBlockIds, createResolvedSelectionEditTarget, createResolvedScopedEditTarget, createResolvedEditProposal } from "./extensionHelpersPart4";
import { resolveResolvedEditProposal, resolveSelectionForRequestedOperation, resolveFullBlockTextSelection, resolveDocumentBlockRangeSelection, resolveDocumentTitleSelection, resolveDocumentParagraphSelection, parseParagraphReference, resolveWordOrdinal, resolveBlockIdForRequestedOperation } from "./extensionHelpersPart5";
import { resolveRequestedOperationConflict, resolveContinueInsertionOffset, createSelectionSignature, resolveSessionSelectionTarget, resolveLiveInlineSelectionTarget, resolvePendingInlineSelectionTarget, resolveAcceptedInlineSelectionTarget, shouldCloseInlineSessionPrompt, closeInlineSessionPrompt, createDefaultSessionFastApplyMetrics, accumulateSessionFastApplyMetrics, selectionMatchesSnapshot } from "./extensionHelpersPart6";
import { resolveSessionSelectionSnapshots, sessionTargetMatches, sessionSelectionMatches, resolveSessionBlockId, resolveBlockInsertionOffset, appendUniqueString, areSuggestionsEqual, areAIControllerStatesEqual, areGenerationsEqual, areSessionsEqual, areInlineHistorySnapshotsEqual, didInlineHistoryCheckpointChange } from "./extensionHelpersPart7";
import { buildInlineHistoryCheckpoint, countSettledInlineTurns, hasStreamingInlineTurns, resolveInlineShortcutHistoryState, areInlineShortcutHistoryStatesEqual, shouldReplaceInlineShortcutWaypointRepresentative, areEphemeralSuggestionsEqual, areStringArraysEqual, areStructuredValuesEqual } from "./extensionHelpersPart8";
import { buildSelectionReplacementOps, sliceInlineDeltasFromOffset, resolveSelectionText, shouldReplaceEmptyMarkdownTarget, shouldTrimLeadingBlankBlockGenerationText, trimLeadingBlankBlockGenerationText, isVisuallyEmptyInlineText } from "./extensionHelpersPart9";

export function resolveContextualPromptAnchor(
	target: AISessionTarget,
): NonNullable<AISession["contextualPrompt"]>["anchor"] {
	if (target.kind === "selection") {
		const range = target.selection.toRange();
		return {
			kind: "text-range",
			selectionSnapshot: resolveSessionSelectionSnapshot(
				target.selection,
			),
			focusBlockId: range.start.blockId,
			status: "valid",
			lastResolvedRect: null,
		};
	}
	if (target.kind === "block") {
		return {
			kind: "block",
			focusBlockId: target.blockId,
			status: "valid",
			lastResolvedRect: null,
		};
	}
	return {
		kind: "document",
		focusBlockId: null,
		status: "valid",
		lastResolvedRect: null,
	};
}

export function resolveContextualPromptState(
	target: AISessionTarget,
): NonNullable<AISession["contextualPrompt"]> {
	return {
		anchor: resolveContextualPromptAnchor(target),
		composer: {
			draftPrompt: "",
			isOpen: true,
			isSubmitting: false,
			canSubmitFollowUp: true,
			openReason: "user",
		},
	};
}

export function createInlineHistorySnapshot(
	editor: Editor,
	sessions: readonly AISession[],
	activeSessionId: string | null,
	documentVersion: number,
	options?: {
		kind?: AIInlineHistorySnapshot["kind"];
	},
): AIInlineHistorySnapshot {
	return {
		id: crypto.randomUUID(),
		sessionId: activeSessionId,
		sessions: cloneInlineHistorySessions(editor, sessions),
		activeSessionId,
		documentVersion,
		kind: options?.kind ?? "document-coupled",
	};
}

export function cloneSessionTarget(
	editor: Editor,
	target: AISessionTarget,
): AISessionTarget {
	if (target.kind !== "selection") {
		return { ...target };
	}
	return {
		kind: "selection",
		blockId: target.blockId,
		selection: recreateTextSelection(
			editor,
			resolveSessionSelectionSnapshot(target.selection),
		),
	};
}

export function cloneInlineHistorySessions(
	editor: Editor,
	sessions: readonly AISession[],
): AISession[] {
	return sessions.map((session) => ({
		...session,
		target: cloneSessionTarget(editor, session.target),
		contextualPrompt: session.contextualPrompt
			? {
					...session.contextualPrompt,
					anchor: {
						...session.contextualPrompt.anchor,
						selectionSnapshot: session.contextualPrompt.anchor
							.selectionSnapshot
							? {
									...session.contextualPrompt.anchor
										.selectionSnapshot,
									anchor: {
										...session.contextualPrompt.anchor
											.selectionSnapshot.anchor,
									},
									focus: {
										...session.contextualPrompt.anchor
											.selectionSnapshot.focus,
									},
									blockRange: [
										...session.contextualPrompt.anchor
											.selectionSnapshot.blockRange,
									],
								}
							: undefined,
					},
					composer: {
						...session.contextualPrompt.composer,
					},
				}
			: undefined,
		turns: session.turns.map((turn) => ({
			...turn,
			suggestionIds: [...turn.suggestionIds],
			reviewItemIds: [...turn.reviewItemIds],
			anchor: turn.anchor ? { ...turn.anchor } : undefined,
			selection: turn.selection
				? {
						...turn.selection,
						anchor: { ...turn.selection.anchor },
						focus: { ...turn.selection.focus },
						blockRange: [...turn.selection.blockRange],
					}
				: undefined,
		})),
		promptHistory: session.promptHistory.map((prompt) => ({ ...prompt })),
		generationIds: [...session.generationIds],
		pendingSuggestionIds: [...session.pendingSuggestionIds],
		pendingReviewItemIds: [...session.pendingReviewItemIds],
		metrics: {
			...session.metrics,
			fastApply: { ...session.metrics.fastApply },
		},
		anchor: session.anchor ? { ...session.anchor } : undefined,
	}));
}

export function recreateTextSelection(
	editor: Editor,
	snapshot: AISessionSelectionSnapshot,
): TextSelection {
	const blockRange = resolveSelectionSnapshotBlockRange(editor, snapshot);
	const isCollapsed =
		snapshot.anchor.blockId === snapshot.focus.blockId &&
		snapshot.anchor.offset === snapshot.focus.offset;
	const documentRange = {
		start: resolveSelectionSnapshotRangeStart(snapshot, blockRange),
		end: resolveSelectionSnapshotRangeEnd(snapshot, blockRange),
		get isMultiBlock() {
			return blockRange.length > 1;
		},
		get blockRange() {
			return [...blockRange];
		},
		contains(point: { blockId: string; offset: number }): boolean {
			if (!blockRange.includes(point.blockId)) {
				return false;
			}
			const isSingleBlock = blockRange.length === 1;
			if (isSingleBlock) {
				return (
					point.offset >= this.start.offset &&
					point.offset <= this.end.offset
				);
			}
			if (point.blockId === this.start.blockId) {
				return point.offset >= this.start.offset;
			}
			if (point.blockId === this.end.blockId) {
				return point.offset <= this.end.offset;
			}
			return true;
		},
		overlaps(other: {
			start: { blockId: string; offset: number };
			end: { blockId: string; offset: number };
			contains: (point: { blockId: string; offset: number }) => boolean;
		}): boolean {
			return (
				this.contains(other.start) ||
				this.contains(other.end) ||
				other.contains(this.start)
			);
		},
		equals(other: {
			start: { blockId: string; offset: number };
			end: { blockId: string; offset: number };
		}): boolean {
			return (
				this.start.blockId === other.start.blockId &&
				this.start.offset === other.start.offset &&
				this.end.blockId === other.end.blockId &&
				this.end.offset === other.end.offset
			);
		},
		toTextSelection() {
			return recreateTextSelection(editor, snapshot);
		},
	};
	return {
		type: "text",
		anchor: { ...snapshot.anchor },
		focus: { ...snapshot.focus },
		get isCollapsed() {
			return isCollapsed;
		},
		get isMultiBlock() {
			return blockRange.length > 1;
		},
		get blockRange() {
			return [...blockRange];
		},
		toRange() {
			return documentRange;
		},
	};
}

export function resolveSelectionSnapshotBlockRange(
	editor: Editor,
	snapshot: AISessionSelectionSnapshot,
): string[] {
	if (snapshot.blockRange.length > 0) {
		return [...snapshot.blockRange];
	}
	const blockOrder = editor.documentState.blockOrder;
	const anchorIndex = blockOrder.indexOf(snapshot.anchor.blockId);
	const focusIndex = blockOrder.indexOf(snapshot.focus.blockId);
	if (anchorIndex === -1 || focusIndex === -1) {
		return [snapshot.anchor.blockId];
	}
	const startIndex = Math.min(anchorIndex, focusIndex);
	const endIndex = Math.max(anchorIndex, focusIndex);
	return blockOrder.slice(startIndex, endIndex + 1);
}

export function resolveSelectionSnapshotRangeStart(
	snapshot: AISessionSelectionSnapshot,
	blockRange: readonly string[],
): { blockId: string; offset: number } {
	if (blockRange.length <= 1) {
		return {
			blockId: snapshot.anchor.blockId,
			offset: Math.min(snapshot.anchor.offset, snapshot.focus.offset),
		};
	}
	const firstBlockId = blockRange[0] ?? snapshot.anchor.blockId;
	return snapshot.anchor.blockId === firstBlockId
		? { ...snapshot.anchor }
		: { ...snapshot.focus };
}

export function resolveSelectionSnapshotRangeEnd(
	snapshot: AISessionSelectionSnapshot,
	blockRange: readonly string[],
): { blockId: string; offset: number } {
	if (blockRange.length <= 1) {
		return {
			blockId: snapshot.anchor.blockId,
			offset: Math.max(snapshot.anchor.offset, snapshot.focus.offset),
		};
	}
	const lastBlockId =
		blockRange[blockRange.length - 1] ?? snapshot.focus.blockId;
	return snapshot.anchor.blockId === lastBlockId
		? { ...snapshot.anchor }
		: { ...snapshot.focus };
}
