import type {
	Editor,
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
import type { AIExtensionConfig, AIContentFormatOptions, ResolvedEditTarget, ResolvedEditProposal, AIStatus, AISurface, AISessionStatus, AISessionTarget, AISessionPrompt, AISessionSelectionSnapshot, AIContextualPromptRect, AIContextualPromptAnchorKind, AIContextualPromptAnchorStatus, AIContextualPromptAnchor, AIContextualPromptComposerState, AIContextualPromptState, AISessionTurnStatus, AISessionTurn, AISessionMetrics, AISessionFastApplyMetrics, AISessionAnchor, AISession, AIStreamingReviewPreview, AIStreamingReviewPreviewInput, AIInlineHistorySnapshot, AIExternalInlineTurnResult, AgenticStep, AIStreamEventType, AIStreamEventBase, AIStreamEvent, StructuredPreviewPatchOperation, GenerationStructuredPreviewState, GenerationState, GenerationPlanState, GenerationTargetKind, EphemeralSuggestion, AIInlineCompletionState, AIInlineCompletionController, PersistentSuggestionBase, PersistentTextSuggestion } from "./typesPart1";

export interface PersistentBlockSuggestion extends PersistentSuggestionBase {
	kind: "block";
	action: "insert-block" | "delete-block" | "move-block" | "convert-block";
	previousState?: {
		type?: string;
		position?: import("@pen/types").Position;
		props?: Record<string, unknown>;
	};
}

export type PersistentSuggestion =
	| PersistentTextSuggestion
	| PersistentBlockSuggestion;

export interface BlockSuggestionMeta {
	id: string;
	action: "insert-block" | "delete-block" | "move-block" | "convert-block";
	author: string;
	authorType: "user" | "ai";
	createdAt: number;
	model?: string;
	sessionId?: string;
	requestId?: string;
	turnId?: string;
	generationId?: string;
	previousState?: {
		type?: string;
		position?: import("@pen/types").Position;
		props?: Record<string, unknown>;
	};
}

export interface AIAwarenessState {
	status: AIStatus;
	activeBlockId: string | null;
	activeTool?: { name: string; toolCallId: string };
	model: string;
	generationZoneId?: string;
}

export interface AICommandContext {
	editor: Editor;
	selection: SelectionState;
	selectedText: string;
	blockType: string | null;
	blockId: string | null;
}

export type AICommandGuard = (ctx: AICommandContext) => boolean;

export interface AICommandBinding {
	id: string;
	label: string;
	description?: string;
	icon?: string;
	group?: string;
	prompt: string | ((ctx: AICommandContext) => string);
	guard?: AICommandGuard;
	shortcut?: string;
	target?: "selection" | "block";
}

export interface AIControllerState {
	status: AIStatus;
	activeGeneration: GenerationState | null;
	sessions: readonly AISession[];
	activeSessionId?: string | null;
	suggestMode: boolean;
	ephemeralSuggestion: EphemeralSuggestion | null;
	streamingReviewPreview: AIStreamingReviewPreview | null;
	commandMenuOpen: boolean;
	lastRoute?: AIRouteLane;
}

export type AIPromptTarget = "auto" | "selection" | "block" | "document";

export type AISessionResolution = "accept" | "reject";

export type AIInlineHistoryDirection = "undo" | "redo";

export interface AIInlineHistoryController {
	canUndoInlineHistory(): boolean;
	canRedoInlineHistory(): boolean;
	canHandleShortcut(direction: AIInlineHistoryDirection): boolean;
	handleShortcut(direction: AIInlineHistoryDirection): boolean;
	undoInlineHistory(): boolean;
	redoInlineHistory(): boolean;
}

export interface AIReviewController {
	getSuggestions(): readonly PersistentSuggestion[];
	acceptSuggestion(id: string): boolean;
	rejectSuggestion(id: string): boolean;
	acceptAllSuggestions(): void;
	rejectAllSuggestions(): void;
}

export interface AICommandExecutionOptions {
	blockId?: string | null;
	maxSteps?: number;
	target?: AIPromptTarget;
	operation?: AIRequestedOperation | null;
}

export type AIRequestedOperation = ModelRequestedOperation;

export interface AIController {
	getState(): AIControllerState;
	subscribe(listener: () => void): () => void;
	getSessions(): readonly AISession[];
	getActiveSession(): AISession | null;
	subscribeSessions(listener: () => void): () => void;
	getStreamEvents(): readonly AIStreamEvent[];
	subscribeStreamEvents(listener: () => void): () => void;
	getCommands(): readonly AICommandBinding[];
	getCommandContext(): AICommandContext;
	startSession(input: {
		surface: AISurface;
		target?: "auto" | "selection" | "block" | "document";
	}): AISession;
	openContextualPrompt(input?: {
		surface?: Extract<AISurface, "inline-edit">;
		target?: "auto" | "selection" | "block" | "document";
	}): AISession | null;
	updateContextualPromptDraft(sessionId: string, draftPrompt: string): void;
	setContextualPromptAnchorRect(
		sessionId: string,
		rect: AIContextualPromptRect | null,
	): void;
	runSessionPrompt(
		sessionId: string,
		prompt: string,
		options?: AICommandExecutionOptions,
	): Promise<GenerationState>;
	canReuseSessionPrompt(
		sessionId: string,
		prompt: string,
		options?: AICommandExecutionOptions,
	): boolean;
	resolveSessionTurn(
		sessionId: string,
		turnId: string,
		resolution: AISessionResolution,
	): boolean;
	acceptSessionTurn(sessionId: string, turnId: string): boolean;
	rejectSessionTurn(sessionId: string, turnId: string): boolean;
	resolveSession(sessionId: string, resolution: AISessionResolution): boolean;
	acceptSession(sessionId: string): boolean;
	rejectSession(sessionId: string): boolean;
	registerExternalInlineTurnResult(input: AIExternalInlineTurnResult): boolean;
	cancelSession(sessionId: string): void;
	suspendInlineSession(sessionId: string): void;
	resumeInlineSession(sessionId: string): void;
	canUndoInlineHistory(): boolean;
	canRedoInlineHistory(): boolean;
	undoInlineHistory(): boolean;
	redoInlineHistory(): boolean;
	runCommand(commandId: string, options?: AICommandExecutionOptions): Promise<GenerationState>;
	runPrompt(prompt: string, options?: AICommandExecutionOptions): Promise<GenerationState>;
	retryActiveGeneration(): Promise<GenerationState | null>;
	acceptActiveGeneration(): boolean;
	rejectActiveGeneration(): boolean;
	acceptReviewItem(id: string): boolean;
	rejectReviewItem(id: string): boolean;
	acceptReviewItems(ids: readonly string[]): boolean;
	rejectReviewItems(ids: readonly string[]): boolean;
	cancelActiveGeneration(): void;
	openCommandMenu(): void;
	closeCommandMenu(): void;
	setSuggestMode(enabled: boolean): void;
	setStreamingReviewPreview(input: AIStreamingReviewPreviewInput): void;
	clearStreamingReviewPreview(sessionId?: string): void;
	showEphemeralSuggestion(suggestion: EphemeralSuggestion): void;
	dismissEphemeralSuggestion(): void;
	acceptEphemeralSuggestion(): void;
	getSuggestions(): readonly PersistentSuggestion[];
	acceptSuggestion(id: string): boolean;
	rejectSuggestion(id: string): boolean;
	acceptAllSuggestions(): void;
	rejectAllSuggestions(): void;
}

export interface AgenticLoopOptions {
	model: ModelAdapter;
	editor: Editor;
	toolRuntime: ToolRuntime;
	prompt: string;
	blockId: string;
	generationId?: string;
	zoneId?: string;
	maxSteps?: number;
	signal?: AbortSignal;
	requestMode?: string;
	operation?: AIRequestedOperation | null;
	sessionId?: string;
	turnId?: string;
	onStatusChange?: (status: AIAwarenessState["status"]) => void;
	onStep?: (step: AgenticStep) => void;
	onTextDelta?: (delta: string) => void;
	onCompleteText?: (text: string) => void;
	onToolCall?: (event: {
		toolCallId: string;
		toolName: string;
		input: unknown;
	}) => void;
	onToolOutput?: (event: {
		toolCallId: string;
		toolName: string;
		part: unknown;
		output: unknown;
	}) => void;
	onToolResult?: (event: {
		toolCallId: string;
		toolName: string;
		output: unknown;
		state: "complete" | "error";
	}) => void;
	onStructuredData?: (event: {
		data: unknown;
		final: boolean;
	}) => void;
	onMessagesChange?: (messages: ModelMessage[]) => void;
	onStreamingStart?: (zoneId: string, blockId: string) => void;
	onStreamingEnd?: (status: "complete" | "cancelled" | "error") => void;
	workingSet?: AIWorkingSetEnvelope | null;
	validateWorkingSet?: (
		workingSet: AIWorkingSetEnvelope | null,
	) => { valid: boolean; canRefresh: boolean; reason?: string };
	refreshWorkingSet?: () => Promise<AIWorkingSetEnvelope | null>;
	onDebug?: (debug: GenerationDebugState) => void;
}

export interface AIWorkingSetEnvelope {
	documentVersion: number;
	viewMode: AIWorkingSetViewMode;
	source: "cursor-context" | "document-summary" | "selection";
	context: unknown;
	routeConfidence?: number;
	trackedBlockIds: string[];
	blockRevisions: Record<string, number>;
	selectionSignature: string | null;
}

export interface AIWorkingSetRetrievedSpan {
	id: string;
	blockIds: string[];
	range: {
		startBlockId: string;
		endBlockId: string;
	};
	blockTypes: string[];
	headingPath: string[];
	preview: string;
	markdown: string;
	score: number;
	rationale: string;
	neighbors: {
		beforeBlockId: string | null;
		afterBlockId: string | null;
	};
}

export interface GenerationDebugState {
	messageAssemblyLatencyMs: number;
	firstToolStartMs: number | null;
	firstToolResultMs: number | null;
	firstVisibleTextMs: number | null;
	toolExecutionMs: number;
	qualitySignals: Partial<Record<AIQualityMetricId, number>>;
	routeConfidence?: number;
	structured?: StructuredGenerationDebugState;
	fastApply?: FastApplyDebugState;
}

export interface StructuredGenerationDebugState {
	plannerMode?: AIPlannerMode;
	executionMode?: AIExecutionMode;
	targetKind?: AITargetKind;
	validationIssueCount?: number;
}

export interface FastApplyDebugState {
	attempted: boolean;
	succeeded: boolean;
	executionPath?:
	| "native-fast-apply"
	| "scoped-replacement"
	| "plain-markdown";
	contextChars?: number;
	diffChars?: number;
	confidence?: number;
	fallbackReason?: string;
	verificationFailureReason?: string;
	untouchedBlockMutationCount?: number;
	alignment?: FlowPatchAlignmentMetrics;
	fallback?: FastApplyFallbackMetrics;
}

export interface FastApplyFallbackMetrics {
	kind: "scoped-replacement" | "plain-markdown";
	opsCount: number;
	insertedBlockCount: number;
	deletedBlockCount: number;
	targetBlockCount?: number;
}

export type AIMutationReceiptStatus =
	| "applied"
	| "staged_review"
	| "staged_suggestions"
	| "noop"
	| "invalid"
	| "error";

export interface AIMutationReceiptEvidence {
	commitId: string;
	opsCount: number;
	affectedBlockIds: string[];
	createdBlockIds: string[];
	adapterId: AIBlockAdapterId;
	blockClass: AIBlockClass;
	transportKind: AITransportKind;
}

export interface AIMutationReceipt {
	id: string;
	status: AIMutationReceiptStatus;
	evidence: AIMutationReceiptEvidence;
	issues: string[];
}
