import type { DocumentRange, StreamingTarget, ToolRuntime } from "@input/pen-types";
import type { BlockAdapter } from "../runtime/blockAdapters";
import type { AIContentFormat } from "../runtime/contracts";
import type { RequestRouterDecision } from "../runtime/router";
import type {
	AIMutationReceipt,
	AIRequestedOperation,
	AISession,
	AIWorkingSetEnvelope,
	GenerationState,
	GenerationStructuredPreviewState,
} from "../types";
import type {
	GenerationExecutionContext,
	GenerationTarget,
} from "../helpers";

export interface ExecuteGenerationInput {
	prompt: string;
	target: GenerationTarget;
	commandId?: string;
	maxSteps?: number;
	context?: GenerationExecutionContext;
}

export interface ExecuteLocalOperationInput {
	prompt: string;
	target: GenerationTarget;
	blockId: string;
	commandId?: string;
	context?: GenerationExecutionContext;
	abortController: AbortController;
	baselineSuggestionIds: Set<string>;
	operation: AIRequestedOperation;
}

export interface LocalOperationExecutionState {
	context?: GenerationExecutionContext;
	sessionTurnId: string | undefined;
	operation: AIRequestedOperation;
	currentText: string;
	currentMutationReceipt: AIMutationReceipt | null;
	seedGeneration: GenerationState;
	abortController: AbortController;
	baselineSuggestionIds: Set<string>;
}

export interface GenerationExecutionState {
	prompt: string;
	target: GenerationTarget;
	commandId?: string;
	maxSteps?: number;
	context?: GenerationExecutionContext;
	toolRuntime: ToolRuntime;
	abortController: AbortController;
	baselineSuggestionIds: Set<string>;
	blockId: string;
	requestedOperation: AIRequestedOperation | null;
	route: RequestRouterDecision;
	workingSet: AIWorkingSetEnvelope | null;
	adapter: BlockAdapter;
	contentFormat: AIContentFormat;
	currentText: string;
	streamingTarget: StreamingTarget | null;
	blockStreamingStarted: boolean;
	shouldStreamDirectly: boolean;
	selectionRange: DocumentRange | null;
	selectionSourceText: string;
	shouldReplaceMarkdownTarget: boolean;
	canStreamSelectionSuggestions: boolean;
	canStreamBlockSuggestions: boolean;
	canStreamMarkdownBlockSuggestions: boolean;
	streamedSuggestionInitialized: boolean;
	streamedSuggestionLength: number;
	streamedMarkdownSuggestionIds: string[];
	lastStreamedMarkdownPreviewText: string;
	sessionTurnId: string | undefined;
	existingSession: AISession | null;
	executionPrompt: string;
	shouldTrimLeadingBlankBlockText: boolean;
	useStructuredIntentTransport: boolean;
	generationPrompt: string;
	seedGeneration: GenerationState;
	currentStructuredPreview: GenerationStructuredPreviewState | null;
	currentStructuredIntent: GenerationState["structuredIntent"];
	currentMutationReceipt: AIMutationReceipt | null;
}
