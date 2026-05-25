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
import { resolveContextualPromptAnchor, resolveContextualPromptState, createInlineHistorySnapshot, cloneSessionTarget, cloneInlineHistorySessions, recreateTextSelection, resolveSelectionSnapshotBlockRange, resolveSelectionSnapshotRangeStart, resolveSelectionSnapshotRangeEnd } from "./extensionHelpersPart2";
import { resolveRequestedOperationForSession, resolveLocalOperationContentFormat, canUseLocalBlockTextOperation, canReuseBottomChatSessionOperation, resolveResolvedEditTargetFromRequestedOperation, areResolvedEditTargetsEqual, buildSessionExecutionPrompt } from "./extensionHelpersPart3";
import { createRewriteSelectionOperation, createRewriteSelectionOperationFromResolvedTarget, createRewriteBlockOperation, createContinueBlockOperation, createDocumentTransformOperation, resolvePreviousGeneratedBlockIds, shouldReplacePreviousGeneratedBlocks, resolveReplacementDeleteBlockIds, createResolvedSelectionEditTarget, createResolvedScopedEditTarget, createResolvedEditProposal } from "./extensionHelpersPart4";
import { resolveResolvedEditProposal, resolveSelectionForRequestedOperation, resolveFullBlockTextSelection, resolveDocumentBlockRangeSelection, resolveDocumentTitleSelection, resolveDocumentParagraphSelection, parseParagraphReference, resolveWordOrdinal, resolveBlockIdForRequestedOperation } from "./extensionHelpersPart5";
import { resolveRequestedOperationConflict, resolveContinueInsertionOffset, createSelectionSignature, resolveSessionSelectionTarget, resolveLiveInlineSelectionTarget, resolvePendingInlineSelectionTarget, resolveAcceptedInlineSelectionTarget, shouldCloseInlineSessionPrompt, closeInlineSessionPrompt, createDefaultSessionFastApplyMetrics, accumulateSessionFastApplyMetrics, selectionMatchesSnapshot } from "./extensionHelpersPart6";
import { resolveSessionSelectionSnapshots, sessionTargetMatches, sessionSelectionMatches, resolveSessionBlockId, resolveBlockInsertionOffset, appendUniqueString, areSuggestionsEqual, areAIControllerStatesEqual, areGenerationsEqual, areSessionsEqual, areInlineHistorySnapshotsEqual, didInlineHistoryCheckpointChange } from "./extensionHelpersPart7";
import { buildSelectionReplacementOps, sliceInlineDeltasFromOffset, resolveSelectionText, shouldReplaceEmptyMarkdownTarget, shouldTrimLeadingBlankBlockGenerationText, trimLeadingBlankBlockGenerationText, isVisuallyEmptyInlineText } from "./extensionHelpersPart9";

export function buildInlineHistoryCheckpoint(state: AIControllerState): {
	activeSessionId: string | null;
	sessions: Array<{
		id: string;
		isOpen: boolean;
		target: AISessionSelectionSnapshot | null;
		latestSettledTurn: {
			id: string;
			prompt: string;
			selection: AISessionSelectionSnapshot | null;
		} | null;
		settledTurnCount: number;
	}>;
} {
	const inlineSessions = state.sessions.filter(
		(session) => session.surface === "inline-edit",
	);
	return {
		activeSessionId: state.activeSessionId ?? null,
		sessions: inlineSessions.map((session) => {
			const settledTurns = session.turns.filter(
				(turn) => turn.status !== "streaming",
			);
			const latestSettledTurn =
				settledTurns[settledTurns.length - 1] ?? null;
			return {
				id: session.id,
				isOpen: session.contextualPrompt?.composer.isOpen ?? false,
				target:
					session.contextualPrompt?.anchor.selectionSnapshot ??
					(session.target.kind === "selection"
						? resolveSessionSelectionSnapshot(
								session.target.selection,
							)
						: null),
				latestSettledTurn: latestSettledTurn
					? {
							id: latestSettledTurn.id,
							prompt: latestSettledTurn.prompt,
							selection: latestSettledTurn.selection ?? null,
						}
					: null,
				settledTurnCount: settledTurns.length,
			};
		}),
	};
}

export function countSettledInlineTurns(
	snapshot: AIInlineHistorySnapshot,
	sessionId?: string | null,
): number {
	if (sessionId) {
		const session = snapshot.sessions.find(
			(item) => item.id === sessionId && item.surface === "inline-edit",
		);
		if (!session) {
			return 0;
		}
		return session.turns.filter((turn) => turn.status !== "streaming")
			.length;
	}
	return snapshot.sessions
		.filter((session) => session.surface === "inline-edit")
		.reduce(
			(count, session) =>
				count +
				session.turns.filter((turn) => turn.status !== "streaming")
					.length,
			0,
		);
}

export function hasStreamingInlineTurns(
	snapshot: AIInlineHistorySnapshot,
	sessionId?: string | null,
): boolean {
	if (sessionId) {
		const session = snapshot.sessions.find(
			(item) => item.id === sessionId && item.surface === "inline-edit",
		);
		return (
			session?.turns.some((turn) => turn.status === "streaming") ?? false
		);
	}
	return snapshot.sessions
		.filter((session) => session.surface === "inline-edit")
		.some((session) =>
			session.turns.some((turn) => turn.status === "streaming"),
		);
}

export function resolveInlineShortcutHistoryState(
	snapshot: AIInlineHistorySnapshot,
	sessionId: string | null,
): AIInlineShortcutHistoryState | null {
	const session = sessionId
		? (snapshot.sessions.find(
				(item) =>
					item.id === sessionId && item.surface === "inline-edit",
			) ?? null)
		: null;
	if (!session) {
		return {
			sessionId: null,
			phase: "none",
			turnCount: 0,
			turnId: null,
		};
	}
	const durableTurns = session.turns.filter(
		(turn) => turn.status !== "streaming" && turn.status !== "cancelled",
	);
	if (durableTurns.length === 0) {
		return {
			sessionId: null,
			phase: "none",
			turnCount: 0,
			turnId: null,
		};
	}
	const latestTurn = durableTurns[durableTurns.length - 1] ?? null;
	if (!latestTurn) {
		return null;
	}
	if (latestTurn.status === "review") {
		return {
			sessionId,
			phase: "review",
			turnCount: durableTurns.length,
			turnId: latestTurn.id,
		};
	}
	if (latestTurn.status === "accepted" || latestTurn.status === "rejected") {
		return {
			sessionId,
			phase: "resolved",
			turnCount: durableTurns.length,
			turnId: latestTurn.id,
			resolution: latestTurn.status,
		};
	}
	return null;
}

export function areInlineShortcutHistoryStatesEqual(
	left: AIInlineShortcutHistoryState,
	right: AIInlineShortcutHistoryState,
): boolean {
	return (
		left.sessionId === right.sessionId &&
		left.phase === right.phase &&
		left.turnCount === right.turnCount &&
		left.turnId === right.turnId &&
		left.resolution === right.resolution
	);
}

export function shouldReplaceInlineShortcutWaypointRepresentative(
	state: AIInlineShortcutHistoryState,
	currentSnapshot: AIInlineHistorySnapshot | null,
	nextSnapshot: AIInlineHistorySnapshot,
): boolean {
	if (!currentSnapshot) {
		return true;
	}
	const currentSession = state.sessionId
		? (currentSnapshot.sessions.find(
				(session) =>
					session.id === state.sessionId &&
					session.surface === "inline-edit",
			) ?? null)
		: null;
	const nextSession = state.sessionId
		? (nextSnapshot.sessions.find(
				(session) =>
					session.id === state.sessionId &&
					session.surface === "inline-edit",
			) ?? null)
		: null;
	if (state.phase === "review") {
		const currentOpen =
			currentSession?.contextualPrompt?.composer.isOpen === true;
		const nextOpen =
			nextSession?.contextualPrompt?.composer.isOpen === true;
		if (currentOpen !== nextOpen) {
			return nextOpen;
		}
	}
	if (state.phase === "resolved") {
		const currentOpen =
			currentSession?.contextualPrompt?.composer.isOpen === true;
		const nextOpen =
			nextSession?.contextualPrompt?.composer.isOpen === true;
		if (currentOpen !== nextOpen) {
			return !nextOpen;
		}
	}
	return true;
}

export function areEphemeralSuggestionsEqual(
	previous: AIControllerState["ephemeralSuggestion"],
	next: AIControllerState["ephemeralSuggestion"],
): boolean {
	if (previous === next) {
		return true;
	}
	if (!previous || !next) {
		return previous === next;
	}

	return (
		previous.id === next.id &&
		previous.blockId === next.blockId &&
		previous.offset === next.offset &&
		previous.text === next.text &&
		previous.type === next.type &&
		previous.blockType === next.blockType &&
		previous.props === next.props
	);
}

export function areStringArraysEqual(
	previous: readonly string[] | undefined,
	next: readonly string[] | undefined,
): boolean {
	if (previous === next) {
		return true;
	}
	if (!previous || !next) {
		return previous === next;
	}
	if (previous.length !== next.length) {
		return false;
	}

	for (let index = 0; index < previous.length; index += 1) {
		if (previous[index] !== next[index]) {
			return false;
		}
	}

	return true;
}

export function areStructuredValuesEqual(previous: unknown, next: unknown): boolean {
	if (previous === next) {
		return true;
	}
	if (!previous || !next) {
		return previous === next;
	}

	try {
		return JSON.stringify(previous) === JSON.stringify(next);
	} catch {
		return false;
	}
}
