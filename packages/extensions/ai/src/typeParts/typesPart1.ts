import type {
	Editor,
	DocumentOp,
	InlineCompletionController as CoreInlineCompletionController,
	InlineCompletionState as CoreInlineCompletionState,
	ModelAdapter,
	ModelMessage,
	ModelOperationScopedRangeTarget,
	ModelOperationSelectionTarget,
	ModelRequestedOperation,
	SelectionState,
	TextSelection,
	ToolRuntime,
} from "@pen/types";
import type {
	AIApplyStrategy,
	AIMutationMode,
	AIRouteLane,
	AIContentFormat,
	AIBlockAdapterId,
	AIBlockClass,
	AIExecutionMode,
	AIPlannerMode,
	AIQualityMetricId,
	AITargetKind,
	AITransportKind,
	AIWorkingSetViewMode,
} from "../runtime/contracts";
import type { DocumentMutationPlan } from "../runtime/planTypes";
import type { FlowPatchAlignmentMetrics } from "../runtime/planExecutor";
import type {
	StructuralReviewItem,
	StructuredPreviewTargetState,
} from "../runtime/reviewArtifacts";
import type { StructuredIntent } from "../runtime/structuredIntent";
import type {
	PersistentBlockSuggestion,
	PersistentSuggestion,
	BlockSuggestionMeta,
	AIAwarenessState,
	AICommandContext,
	AICommandGuard,
	AICommandBinding,
	AIControllerState,
	AIPromptTarget,
	AISessionResolution,
	AIInlineHistoryDirection,
	AIInlineHistoryController,
	AIReviewController,
	AICommandExecutionOptions,
	AIRequestedOperation,
	AIController,
	AgenticLoopOptions,
	AIWorkingSetEnvelope,
	AIWorkingSetRetrievedSpan,
	GenerationDebugState,
	StructuredGenerationDebugState,
	FastApplyDebugState,
	FastApplyFallbackMetrics,
	AIMutationReceiptStatus,
	AIMutationReceiptEvidence,
	AIMutationReceipt,
} from "./typesPart2";

export interface AIExtensionConfig {
	model?: ModelAdapter;
	suggestMode?: boolean;
	suggestionPresentation?: AISuggestionPresentation;
	commands?: AICommandBinding[];
	maxAgenticSteps?: number;
	author?: string;
	contentFormat?: AIContentFormatOptions;
}

export type AISuggestionPresentation = "track-changes" | "final-text";

export interface AIContentFormatOptions {
	blockGeneration?: AIContentFormat;
	selectionRewrite?: AIContentFormat;
}

export type ResolvedEditTarget =
	| ModelOperationSelectionTarget
	| ModelOperationScopedRangeTarget;

export interface ResolvedEditProposal {
	promptIntent: string;
	target: ResolvedEditTarget;
}

export type AIStatus =
	| "idle"
	| "reading"
	| "thinking"
	| "writing"
	| "tool-calling";

export type AISurface = "inline-edit" | "bottom-chat";

export type AISessionStatus =
	| "idle"
	| "streaming"
	| "paused"
	| "complete"
	| "cancelled"
	| "error";

export type AISessionTarget =
	| {
			kind: "selection";
			selection: TextSelection;
			blockId: string | null;
	  }
	| {
			kind: "block";
			blockId: string;
	  }
	| {
			kind: "document";
	  };

export interface AISessionPrompt {
	id: string;
	prompt: string;
	createdAt: number;
	generationId?: string;
	operation?: AIRequestedOperation;
}

export interface AISessionSelectionSnapshot {
	anchor: { blockId: string; offset: number };
	focus: { blockId: string; offset: number };
	blockRange: string[];
	isMultiBlock: boolean;
}

export interface AIContextualPromptRect {
	top: number;
	left: number;
	width: number;
	height: number;
}

export type AIContextualPromptAnchorKind = "text-range" | "block" | "document";

export type AIContextualPromptAnchorStatus = "valid" | "shifted" | "invalid";

export interface AIContextualPromptAnchor {
	kind: AIContextualPromptAnchorKind;
	selectionSnapshot?: AISessionSelectionSnapshot;
	focusBlockId: string | null;
	status: AIContextualPromptAnchorStatus;
	lastResolvedRect: AIContextualPromptRect | null;
}

export interface AIContextualPromptComposerState {
	draftPrompt: string;
	isOpen: boolean;
	isSubmitting: boolean;
	canSubmitFollowUp: boolean;
	openReason?: "user" | "history";
}

export interface AIContextualPromptState {
	anchor: AIContextualPromptAnchor;
	composer: AIContextualPromptComposerState;
}

export type AISessionTurnStatus =
	| "streaming"
	| "review"
	| "accepted"
	| "rejected"
	| "complete"
	| "cancelled"
	| "error";

export interface AISessionTurn {
	id: string;
	prompt: string;
	createdAt: number;
	undoGroupId?: string;
	generationId?: string;
	target: Exclude<AIPromptTarget, "auto">;
	status: AISessionTurnStatus;
	suggestionIds: string[];
	reviewItemIds: string[];
	generatedBlockIds: string[];
	operation?: AIRequestedOperation;
	structuredPreview?: GenerationStructuredPreviewState | null;
	anchor?: AISessionAnchor;
	selection?: AISessionSelectionSnapshot;
}

export interface AISessionMetrics {
	firstTokenMs?: number;
	totalMs?: number;
	toolMs?: number;
	streamEventCount: number;
	patchCount: number;
	fastApply: AISessionFastApplyMetrics;
}

export interface AISessionFastApplyMetrics {
	attemptCount: number;
	nativeFastApplyCount: number;
	scopedReplacementCount: number;
	plainMarkdownCount: number;
	failedCount: number;
}

export interface AISessionAnchor {
	blockId?: string;
	from?: number;
	to?: number;
}

export type AIStreamingReviewPreviewTarget =
	| {
			kind: "text-range";
			blockId: string;
			from: number;
			to: number;
	  }
	| {
			kind: "block-range";
			start: { blockId: string; offset: number };
			end: { blockId: string; offset: number };
			blockIds: string[];
	  }
	| {
			kind: "insertion-point";
			blockId: string;
			offset: number;
	  };

export interface AIStreamingReviewPreviewInput {
	sessionId: string;
	turnId?: string;
	target: AIStreamingReviewPreviewTarget;
	text: string;
}

export interface AIStreamingReviewPreview extends AIStreamingReviewPreviewInput {
	previousTextLength: number;
	revision: number;
	updatedAt: number;
}

export interface AISession {
	id: string;
	surface: AISurface;
	status: AISessionStatus;
	target: AISessionTarget;
	operation?: AIRequestedOperation | null;
	contextualPrompt?: AIContextualPromptState;
	turns: AISessionTurn[];
	activeTurnId?: string;
	promptHistory: AISessionPrompt[];
	generationIds: string[];
	pendingSuggestionIds: string[];
	pendingReviewItemIds: string[];
	createdAt: number;
	updatedAt: number;
	metrics: AISessionMetrics;
	anchor?: AISessionAnchor;
}

export interface AIInlineHistorySnapshot {
	id: string;
	sessionId: string | null;
	sessions: readonly AISession[];
	activeSessionId: string | null;
	documentVersion: number;
	kind: "document-coupled" | "ui-local";
}

export interface AIExternalInlineTurnResult {
	sessionId: string;
	turnId: string;
	historyId: string;
	operations: readonly DocumentOp[];
	suggestionIds: readonly string[];
}

export interface AgenticStep {
	index: number;
	type: "text" | "tool-call" | "tool-result";
	toolName?: string;
	toolCallId?: string;
	input?: unknown;
	output?: unknown;
	status: "pending" | "running" | "complete" | "error";
}

export type AIStreamEventType =
	| "generation-start"
	| "status"
	| "text-delta"
	| "operation"
	| "app-partial"
	| "tool-call"
	| "tool-output"
	| "tool-result"
	| "structured-preview"
	| "generation-finish";

export interface AIStreamEventBase {
	type: AIStreamEventType;
	generationId: string;
	sessionId?: string;
	zoneId: string;
	blockId: string;
	timestamp: number;
}

export type AIStreamEvent =
	| (AIStreamEventBase & {
			type: "generation-start";
			prompt: string;
			target: GenerationState["target"];
	  })
	| (AIStreamEventBase & {
			type: "status";
			status: AIStatus;
	  })
	| (AIStreamEventBase & {
			type: "text-delta";
			delta: string;
			text: string;
	  })
	| (AIStreamEventBase & {
			type: "app-partial";
			data: unknown;
			final: boolean;
	  })
	| (AIStreamEventBase & {
			type: "tool-call";
			toolCallId: string;
			toolName: string;
			input: unknown;
	  })
	| (AIStreamEventBase & {
			type: "tool-output";
			toolCallId: string;
			toolName: string;
			part: unknown;
			output: unknown;
	  })
	| (AIStreamEventBase & {
			type: "tool-result";
			toolCallId: string;
			toolName: string;
			output: unknown;
			state: "complete" | "error";
	  })
	| (AIStreamEventBase & {
			type: "structured-preview";
			preview: GenerationStructuredPreviewState;
			patches: readonly StructuredPreviewPatchOperation[];
	  })
	| (AIStreamEventBase & {
			type: "operation";
			operation: AIRequestedOperation;
			phase: "preview" | "final" | "conflict";
			text?: string;
			reason?: string;
	  })
	| (AIStreamEventBase & {
			type: "generation-finish";
			status: GenerationState["status"];
			text: string;
	  });

export interface StructuredPreviewPatchOperation {
	op: "add" | "remove" | "replace";
	path: string;
	value?: unknown;
}

export interface GenerationStructuredPreviewState {
	planState: "drafted" | "validated";
	plan: DocumentMutationPlan;
	reviewItems: StructuralReviewItem[];
	targets: StructuredPreviewTargetState[];
}

export interface GenerationState {
	id: string;
	zoneId: string;
	blockId: string;
	target: "selection" | "block";
	sessionId?: string;
	turnId?: string;
	surface?: AISurface;
	prompt: string;
	operation?: AIRequestedOperation | null;
	status: "streaming" | "complete" | "cancelled" | "error";
	tokenCount: number;
	steps: AgenticStep[];
	undoGroupId: string;
	text: string;
	commandId?: string;
	suggestionIds?: string[];
	route?: AIRouteLane;
	mutationMode?: AIMutationMode;
	contentFormat?: AIContentFormat;
	applyStrategy?: AIApplyStrategy;
	planState?: GenerationPlanState;
	plan?: DocumentMutationPlan | null;
	structuredIntent?: StructuredIntent | null;
	reviewItems?: StructuralReviewItem[];
	structuredPreview?: GenerationStructuredPreviewState | null;
	targetKind?: GenerationTargetKind;
	blockClass?: AIBlockClass;
	adapterId?: AIBlockAdapterId;
	transportKind?: AITransportKind;
	mutationReceipt?: AIMutationReceipt | null;
	debug?: GenerationDebugState;
}

export type GenerationPlanState = "none" | "drafted" | "validated" | "rejected";

export type GenerationTargetKind = AITargetKind;

export interface EphemeralSuggestion {
	id: string;
	blockId: string;
	offset: number;
	text: string;
	type: "inline" | "block";
	blockType?: string;
	props?: Record<string, unknown>;
}

export type AIInlineCompletionState = CoreInlineCompletionState;

export type AIInlineCompletionController = CoreInlineCompletionController;

export interface PersistentSuggestionBase {
	id: string;
	author: string;
	authorType: "user" | "ai";
	createdAt: number;
	model?: string;
	sessionId?: string;
	requestId?: string;
	turnId?: string;
	generationId?: string;
	blockId: string;
}

export interface PersistentTextSuggestion extends PersistentSuggestionBase {
	kind: "text";
	action: "insert" | "delete";
	offset: number;
	length: number;
}
