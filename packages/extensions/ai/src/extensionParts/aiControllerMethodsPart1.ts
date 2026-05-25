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
import { resolveGenerationRequestMode, isLocalRequestedOperation, EMPTY_TOOL_RUNTIME, MAX_STREAM_EVENTS, AI_UNDO_HISTORY_METADATA_KEY, resolveOrderedReviewItems, sortReviewItemsForRemoval, compareReviewItemRemovalOrder, resolveActiveBlockId, readModelId, supportsStructuredIntent, createAIStreamEvent, resolvePromptTarget, resolveSessionTarget, resolveSessionAnchor, resolveSessionSelectionSnapshot, resolveContextualPromptAnchor, resolveContextualPromptState, createInlineHistorySnapshot, cloneSessionTarget, cloneInlineHistorySessions, recreateTextSelection, resolveSelectionSnapshotBlockRange, resolveSelectionSnapshotRangeStart, resolveSelectionSnapshotRangeEnd, resolveRequestedOperationForSession, resolveLocalOperationContentFormat, canUseLocalBlockTextOperation, canReuseBottomChatSessionOperation, resolveResolvedEditTargetFromRequestedOperation, areResolvedEditTargetsEqual, buildSessionExecutionPrompt, createRewriteSelectionOperation, createRewriteSelectionOperationFromResolvedTarget, createRewriteBlockOperation, createContinueBlockOperation, createDocumentTransformOperation, resolvePreviousGeneratedBlockIds, shouldReplacePreviousGeneratedBlocks, resolveReplacementDeleteBlockIds, createResolvedSelectionEditTarget, createResolvedScopedEditTarget, createResolvedEditProposal, resolveResolvedEditProposal, resolveSelectionForRequestedOperation, resolveFullBlockTextSelection, resolveDocumentBlockRangeSelection, resolveDocumentTitleSelection, resolveDocumentParagraphSelection, parseParagraphReference, resolveWordOrdinal, resolveBlockIdForRequestedOperation, resolveRequestedOperationConflict, resolveContinueInsertionOffset, createSelectionSignature, resolveSessionSelectionTarget, resolveLiveInlineSelectionTarget, resolvePendingInlineSelectionTarget, resolveAcceptedInlineSelectionTarget, shouldCloseInlineSessionPrompt, closeInlineSessionPrompt, createDefaultSessionFastApplyMetrics, accumulateSessionFastApplyMetrics, selectionMatchesSnapshot, resolveSessionSelectionSnapshots, sessionTargetMatches, sessionSelectionMatches, resolveSessionBlockId, resolveBlockInsertionOffset, appendUniqueString, areSuggestionsEqual, areAIControllerStatesEqual, areGenerationsEqual, areSessionsEqual, areInlineHistorySnapshotsEqual, didInlineHistoryCheckpointChange, buildInlineHistoryCheckpoint, countSettledInlineTurns, hasStreamingInlineTurns, resolveInlineShortcutHistoryState, areInlineShortcutHistoryStatesEqual, shouldReplaceInlineShortcutWaypointRepresentative, areEphemeralSuggestionsEqual, areStringArraysEqual, areStructuredValuesEqual, buildSelectionReplacementOps, sliceInlineDeltasFromOffset, resolveSelectionText, shouldReplaceEmptyMarkdownTarget, shouldTrimLeadingBlankBlockGenerationText, trimLeadingBlankBlockGenerationText, isVisuallyEmptyInlineText } from "./extensionHelpers";
import type { GenerationTarget, GenerationExecutionContext, AIInlineHistoryRestoreRequest, AIInlineShortcutHistoryPhase, AIInlineShortcutHistoryState, AIInlineShortcutHistoryWaypoint, AIStreamEventInput } from "./extensionHelpers";

export const aiControllerMethodsPart1 = {
destroy(this: any): void {
		this._unsubscribeInlineCompletion?.();
		this._unsubscribeInlineCompletion = null;
		this._unsubscribeHistoryApplied?.();
		this._unsubscribeHistoryApplied = null;
		this._unsubscribeUndoHistoryMetadata?.();
		this._unsubscribeUndoHistoryMetadata = null;
	},

getState(this: any): AIControllerState {
		return this._state;
	},

subscribe(this: any, listener: () => void): () => void {
		this._listeners.add(listener);
		return () => this._listeners.delete(listener);
	},

getSessions(this: any): readonly AISession[] {
		return this._state.sessions;
	},

getActiveSession(this: any): AISession | null {
		const activeSessionId = this._state.activeSessionId;
		if (!activeSessionId) {
			return null;
		}
		return (
			this._state.sessions.find(
				(session) => session.id === activeSessionId,
			) ?? null
		);
	},

subscribeSessions(this: any, listener: () => void): () => void {
		this._sessionListeners.add(listener);
		return () => this._sessionListeners.delete(listener);
	},

getStreamEvents(this: any): readonly AIStreamEvent[] {
		return this._streamEvents;
	},

subscribeStreamEvents(this: any, listener: () => void): () => void {
		this._streamEventListeners.add(listener);
		return () => this._streamEventListeners.delete(listener);
	},

getCommands(this: any): readonly AICommandBinding[] {
		return this._registry.list(this.getCommandContext());
	},

getCommandContext(this: any): AICommandContext {
		const selection = this._editor.selection;
		const blockId = resolveActiveBlockId(selection);
		return {
			editor: this._editor,
			selection,
			selectedText:
				selection?.type === "text"
					? resolveSelectionText(this._editor, selection)
					: "",
			blockType: blockId
				? (this._editor.getBlock(blockId)?.type ?? null)
				: null,
			blockId,
		};
	},

startSession(this: any, input: {
		surface: AISurface;
		target?: "auto" | "selection" | "block" | "document";
	}): AISession {
		const now = Date.now();
		const target = resolveSessionTarget(this._editor, input.target);
		const session: AISession = {
			id: crypto.randomUUID(),
			surface: input.surface,
			status: "idle",
			target,
			contextualPrompt:
				input.surface === "inline-edit"
					? resolveContextualPromptState(target)
					: undefined,
			turns: [],
			activeTurnId: undefined,
			promptHistory: [],
			generationIds: [],
			pendingSuggestionIds: [],
			pendingReviewItemIds: [],
			createdAt: now,
			updatedAt: now,
			metrics: {
				streamEventCount: 0,
				patchCount: 0,
				fastApply: createDefaultSessionFastApplyMetrics(),
			},
			anchor: resolveSessionAnchor(this._editor.selection),
		};
		this._setState({
			sessions: [...this._state.sessions, session],
			activeSessionId: session.id,
		});
		return session;
	},

openContextualPrompt(this: any, input?: {
		surface?: Extract<AISurface, "inline-edit">;
		target?: "auto" | "selection" | "block" | "document";
	}): AISession | null {
		const surface = input?.surface ?? "inline-edit";
		const target = resolveSessionTarget(
			this._editor,
			input?.target ?? "selection",
		);
		if (surface === "inline-edit" && target.kind !== "selection") {
			return null;
		}
		const activeSession = this._state.sessions.find(
			(session) =>
				session.id === this._state.activeSessionId &&
				session.surface === surface &&
				session.status !== "cancelled",
		);
		if (
			activeSession &&
			activeSession.status !== "complete" &&
			sessionTargetMatches(activeSession, target)
		) {
			this._updateSession(activeSession.id, {
				target,
				anchor: resolveSessionAnchor(this._editor.selection),
				contextualPrompt: {
					...(activeSession.contextualPrompt ??
						resolveContextualPromptState(target)),
					anchor: resolveContextualPromptAnchor(target),
					composer: {
						...(activeSession.contextualPrompt?.composer ?? {
							draftPrompt: "",
							isSubmitting: false,
							canSubmitFollowUp: true,
							openReason: "user",
						}),
						isOpen: true,
						openReason: "user",
					},
				},
			});
			return this.getActiveSession();
		}
		if (activeSession?.surface === "inline-edit") {
			this._setInlineSessionComposerOpen(activeSession.id, false);
		}
		const nextSession = this.startSession({
			surface,
			target: input?.target ?? "selection",
		});
		return nextSession.contextualPrompt?.anchor.kind === "text-range"
			? nextSession
			: null;
	},

updateContextualPromptDraft(this: any, sessionId: string, draftPrompt: string): void {
		const session = this._state.sessions.find(
			(item) => item.id === sessionId,
		);
		if (!session?.contextualPrompt) {
			return;
		}
		this._updateSession(sessionId, {
			contextualPrompt: {
				...session.contextualPrompt,
				composer: {
					...session.contextualPrompt.composer,
					draftPrompt,
				},
			},
		});
	},

setContextualPromptAnchorRect(this: any, 
		sessionId: string,
		rect: AIContextualPromptRect | null,
	): void {
		const session = this._state.sessions.find(
			(item) => item.id === sessionId,
		);
		if (!session?.contextualPrompt) {
			return;
		}
		this._updateSession(sessionId, {
			contextualPrompt: {
				...session.contextualPrompt,
				anchor: {
					...session.contextualPrompt.anchor,
					lastResolvedRect: rect,
				},
			},
		});
	},

resolveSessionTurn(this: any, 
		sessionId: string,
		turnId: string,
		resolution: AISessionResolution,
	): boolean {
		return this._resolveSessionTurn(sessionId, turnId, resolution);
	},

acceptSessionTurn(this: any, sessionId: string, turnId: string): boolean {
		return this.resolveSessionTurn(sessionId, turnId, "accept");
	},

rejectSessionTurn(this: any, sessionId: string, turnId: string): boolean {
		return this.resolveSessionTurn(sessionId, turnId, "reject");
	},

runSessionPrompt(this: any, 
		sessionId: string,
		prompt: string,
		options?: AICommandExecutionOptions,
	): Promise<GenerationState> {
		const session = this._state.sessions.find(
			(item) => item.id === sessionId,
		);
		if (!session) {
			return Promise.reject(
				new Error(`Unknown AI session "${sessionId}"`),
			);
		}
		this._recordInlinePromptSubmissionCheckpoint(sessionId, prompt);

		const operation =
			options?.operation ??
			resolveRequestedOperationForSession(
				this._editor,
				session,
				prompt,
				options,
				this._documentVersion,
			);
		if (operation.kind === "rewrite-selection") {
			const selection = resolveSelectionForRequestedOperation(
				this._editor,
				operation,
			);
			if (!selection) {
				return Promise.reject(
					new Error(
						"Cannot run a session prompt without a valid text selection",
					),
				);
			}
			return this._runSelectionGeneration(
				prompt,
				selection,
				undefined,
				options?.maxSteps,
				{
					sessionId,
					surface: session.surface,
					operation,
				},
			);
		}
		if (operation.kind === "document-transform") {
			const targetBlockIds =
				operation.target.kind === "document" &&
				(operation.target.blockIds?.length ?? 0) > 0
					? [...(operation.target.blockIds ?? [])]
					: undefined;
			const replacePreviousGeneratedBlocks =
				shouldReplacePreviousGeneratedBlocks(session, prompt);
			return this._runDocumentGeneration(
				prompt,
				options?.blockId ??
					(operation.target.kind === "document"
						? operation.target.activeBlockId
						: null),
				undefined,
				options?.maxSteps,
				{
					sessionId,
					surface: session.surface,
					operation,
					replaceBlockIds:
						targetBlockIds ??
						(replacePreviousGeneratedBlocks
							? resolvePreviousGeneratedBlockIds(session)
							: undefined),
				},
			);
		}
		const blockId =
			options?.blockId ??
			resolveBlockIdForRequestedOperation(operation) ??
			this._editor.lastBlock()?.id ??
			this._editor.firstBlock()?.id;
		if (!blockId) {
			return Promise.reject(
				new Error(
					"Cannot run an AI session prompt without a target block",
				),
			);
		}
		return this._runBlockGeneration(
			prompt,
			blockId,
			undefined,
			options?.maxSteps,
			{
				sessionId,
				surface: session.surface,
				operation,
			},
		);
	}
};
