import {
	aiAutocompleteControllerFacet,
	aiControllerFacet,
	aiInlineHistoryFacet,
	aiReviewControllerFacet,
	beforeApplyFacet,
	undoMetadataControllerFacet,
	createDecorationSet,
	ensureInlineCompletionController,
	getInlineCompletionController as getInlineCompletionControllerFromCore,
} from "@input/pen-core";
import type {
	CommitEvent,
	Decoration,
	Editor,
	Extension,
	HistoryAppliedEvent,
	KeyBinding,
	ModelAdapter,
	UndoHistoryMetadataController,
} from "@input/pen-types";
import {
	AI_CONTROLLER_SLOT as CORE_AI_CONTROLLER_SLOT,
	AI_INLINE_HISTORY_SLOT as CORE_AI_INLINE_HISTORY_SLOT,
	AI_REVIEW_CONTROLLER_SLOT as CORE_AI_REVIEW_CONTROLLER_SLOT,
	INLINE_COMPLETION_SLOT as CORE_INLINE_COMPLETION_SLOT,
	defineExtension,
	getOpOriginType,
} from "@input/pen-types";
import { defaultAICommands } from "./commands/defaultCommands";
import { resolveCatalogCopy } from "./i18n/resolveCatalogCopy";
import { AICommandRegistry } from "./commands/registry";
import { AIInlineHistoryService, AIReviewService } from "./controllers";
import type { AIContentFormat } from "./runtime/contracts";
import { SuggestedAIOperationRunner } from "./runtime/suggestedOperationRunner";
import { ExternalInlineTurnRegistry } from "./runtime/externalInlineTurnRegistry";
import {
	AI_SESSION_SUGGESTION_ORIGIN,
	shouldBypassSuggestMode,
	SUGGESTION_RESOLUTION_ORIGIN,
	transformOpsForSuggestMode,
} from "./suggestions/suggestMode";
import type {
	AICommandBinding,
	AICommandContext,
	AICommandExecutionOptions,
	AIContextualPromptRect,
	AIController,
	AIControllerState,
	AIExtensionConfig,
	AIExternalInlineTurnResult,
	AIInlineCompletionController,
	AIInlineHistoryController,
	AIInlineHistoryDirection,
	AIInlineHistorySnapshot,
	AIReviewController,
	AIStreamEvent,
	GenerationState,
} from "./types";
import { AIControllerSessionState } from "./controller/sessionState";
import { reviewResolutionMethods } from "./controller/reviewResolutionMethods";
import { decorationControllerMethods } from "./controller/decorationControllerMethods";
import { generationRunnerMethods } from "./controller/generationRunnerMethods";
import { suggestionControllerMethods } from "./controller/suggestionControllerMethods";
import { commitSupportMethods } from "./controller/commitSupportMethods";
import { operationCommitMethods } from "./controller/operationCommitMethods";
import { bufferedBlockGenerationMethods } from "./controller/bufferedBlockGenerationMethods";
import { markdownFastApplyMethods } from "./controller/markdownFastApplyMethods";
import { fastApplySupportMethods } from "./controller/fastApplySupportMethods";
import { workingSetMethods } from "./controller/workingSetMethods";
import { workingSetValidationMethods } from "./controller/workingSetValidationMethods";
import { inlineHistoryRecording } from "./controller/inlineHistoryRecording";
import { inlineHistoryNavigation } from "./controller/inlineHistoryNavigation";
import { inlineHistoryRestore } from "./controller/inlineHistoryRestore";
import {
	AI_UNDO_HISTORY_METADATA_KEY,
	MAX_STREAM_EVENTS,
	readModelId,
	resolveActiveBlockId,
	resolvePromptTarget,
	resolveSelectionText,
} from "./helpers";

export const AI_EXTENSION_NAME = "ai";

export const AI_CONTROLLER_SLOT = CORE_AI_CONTROLLER_SLOT;

export const INLINE_COMPLETION_SLOT = CORE_INLINE_COMPLETION_SLOT;

export const AI_INLINE_COMPLETION_SLOT = INLINE_COMPLETION_SLOT;

export const AI_INLINE_HISTORY_SLOT = CORE_AI_INLINE_HISTORY_SLOT;

export const AI_REVIEW_CONTROLLER_SLOT = CORE_AI_REVIEW_CONTROLLER_SLOT;

const AI_SHORTCUT_KEY_BINDINGS: readonly KeyBinding[] = [
	{
		key: "Mod-z",
		priority: 1000,
		description: "pen.ai.shortcut.undoInline",
		handler: (editor) => {
			const inlineHistory = getAIInlineHistoryController(editor);
			if (!inlineHistory?.canHandleShortcut("undo")) {
				return false;
			}
			return inlineHistory.handleShortcut("undo");
		},
	},
	{
		key: "Mod-Shift-z",
		priority: 1000,
		description: "pen.ai.shortcut.redoInline",
		handler: (editor) => {
			const inlineHistory = getAIInlineHistoryController(editor);
			if (!inlineHistory?.canHandleShortcut("redo")) {
				return false;
			}
			return inlineHistory.handleShortcut("redo");
		},
	},
	{
		key: "Ctrl-y",
		priority: 1000,
		description: "pen.ai.shortcut.redoInline",
		handler: (editor) => {
			const inlineHistory = getAIInlineHistoryController(editor);
			if (!inlineHistory?.canHandleShortcut("redo")) {
				return false;
			}
			return inlineHistory.handleShortcut("redo");
		},
	},
];

class AIControllerImpl extends AIControllerSessionState {
	private readonly _registry = new AICommandRegistry();

	private readonly _inlineCompletion: AIInlineCompletionController;

	private readonly _streamEventListeners = new Set<() => void>();

	private readonly _model: ModelAdapter | undefined;

	private readonly _author: string;

	private readonly _suggestedOperationRunner: SuggestedAIOperationRunner;

	private readonly _maxAgenticSteps: number;

	private readonly _suggestionPresentation: NonNullable<
		AIExtensionConfig["suggestionPresentation"]
	>;

	private readonly _contentFormat: {
		blockGeneration: AIContentFormat;
		selectionRewrite: AIContentFormat;
	};

	private _streamEvents: readonly AIStreamEvent[] = [];

	private _abortController: AbortController | null = null;

	private _lastPrompt: string | null = null;

	private _lastCommandId: string | null = null;

	private _inlineHistory: AIInlineHistorySnapshot[] = [];

	private _inlineHistoryIndex = -1;

	private _externalInlineTurnRegistry = new ExternalInlineTurnRegistry();

	private _queuedInlineHistoryShortcutDirections: AIInlineHistoryDirection[] =
		[];

	private _queuedInlineHistoryShortcutFlushScheduled = false;

	private _handledUndoHistoryRequestId: number | null = null;

	constructor(
		editor: Editor,
		config: AIExtensionConfig,
		services: {
			inlineCompletion: AIInlineCompletionController;
		},
	) {
		super(editor, {
			status: "idle",
			activeGeneration: null,
			sessions: [],
			activeSessionId: null,
			suggestMode: config.suggestMode ?? false,
			ephemeralSuggestion: null,
			streamingReviewPreview: null,
			commandMenuOpen: false,
		});
		this._inlineCompletion = services.inlineCompletion;
		this._model = config.model;
		this._author = config.author ?? "assistant";
		this._suggestedOperationRunner = new SuggestedAIOperationRunner({
			editor: this._editor,
			author: this._author,
			model: readModelId(this._model),
			getSession: (sessionId) =>
				this._state.sessions.find(
					(session) => session.id === sessionId,
				) ?? null,
			getActiveGeneration: () => this._state.activeGeneration,
		});
		this._maxAgenticSteps = config.maxAgenticSteps ?? 10;
		this._suggestionPresentation =
			config.suggestionPresentation ?? "track-changes";
		this._contentFormat = {
			blockGeneration: config.contentFormat?.blockGeneration ?? "text",
			selectionRewrite: config.contentFormat?.selectionRewrite ?? "text",
		};
		this._undoHistoryMetadata =
			(this._editor.facet(
				undoMetadataControllerFacet,
			) as UndoHistoryMetadataController | null) ?? null;

		for (const command of defaultAICommands) {
			this._registry.register(command);
		}
		for (const command of config.commands ?? []) {
			this._registry.register(command);
		}

		installControllerMethods(this);
		this._syncSuggestionsFromDocument();

		this._unsubscribeInlineCompletion = this._inlineCompletion.subscribe(
			() => {
				this._setState({
					ephemeralSuggestion:
						this._inlineCompletion.getState().visibleSuggestion,
				});
			},
		);
		this._unsubscribeHistoryApplied = this._editor.onHistoryApplied(
			(event) => {
				this._handleHistoryApplied(event);
			},
		);
		this._unsubscribeUndoHistoryMetadata =
			this._undoHistoryMetadata?.registerMetadataRestorer<AIInlineHistorySnapshot>(
				AI_UNDO_HISTORY_METADATA_KEY,
				(snapshot, context) => {
					if (!snapshot) {
						return;
					}
					this._handledUndoHistoryRequestId = context.requestId;
					this._restoreInlineHistorySnapshotFromUndo(snapshot);
				},
			) ?? null;
	}

	getStreamEvents(): readonly AIStreamEvent[] {
		return this._streamEvents;
	}

	subscribeStreamEvents(listener: () => void): () => void {
		this._streamEventListeners.add(listener);
		return () => {
			this._streamEventListeners.delete(listener);
		};
	}

	getCommands(): readonly AICommandBinding[] {
		return this._registry.list(this.getCommandContext()).map((command) => ({
			...command,
			label: resolveCatalogCopy(this._editor, command.label),
			description: command.description
				? resolveCatalogCopy(this._editor, command.description)
				: command.description,
		}));
	}

	getCommandContext(): AICommandContext {
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
	}

	_setStreamEvents(nextEvents: readonly AIStreamEvent[]): void {
		this._streamEvents = nextEvents;
		this._emitStreamEvents();
	}

	_appendStreamEvent(event: AIStreamEvent): void {
		const lastEvent = this._streamEvents[this._streamEvents.length - 1];
		if (
			lastEvent?.type === "status" &&
			event.type === "status" &&
			lastEvent.generationId === event.generationId &&
			lastEvent.status === event.status
		) {
			return;
		}
		const nextEvents =
			this._streamEvents.length >= MAX_STREAM_EVENTS
				? [...this._streamEvents.slice(-(MAX_STREAM_EVENTS - 1)), event]
				: [...this._streamEvents, event];
		this._setStreamEvents(nextEvents);
	}

	_emitStreamEvents(): void {
		for (const listener of this._streamEventListeners) {
			listener();
		}
	}

	canUndoInlineHistory(): boolean {
		return this._inlineHistoryIndex > 0;
	}

	canRedoInlineHistory(): boolean {
		return (
			this._inlineHistoryIndex >= 0 &&
			this._inlineHistoryIndex < this._inlineHistory.length - 1
		);
	}

	undoInlineHistory(): boolean {
		return this.asHost()._navigateInlineHistory("undo");
	}

	redoInlineHistory(): boolean {
		return this.asHost()._navigateInlineHistory("redo");
	}

	canHandleInlineHistoryShortcut(
		direction: AIInlineHistoryDirection,
	): boolean {
		if (this._pendingInlineHistoryRestore) {
			return true;
		}
		return this.asHost()._canHandleInlineHistoryShortcut(direction, {
			shortcutOnly: true,
		});
	}

	handleInlineHistoryShortcut(direction: AIInlineHistoryDirection): boolean {
		if (this._pendingInlineHistoryRestore) {
			this._queuedInlineHistoryShortcutDirections.push(direction);
			return true;
		}
		return this.asHost()._navigateInlineHistory(direction, {
			shortcutOnly: true,
		});
	}

	async runCommand(
		commandId: string,
		options?: AICommandExecutionOptions,
	): Promise<GenerationState> {
		const ctx = this.getCommandContext();
		const command = this._registry.resolve(commandId);
		if (!command) {
			throw new Error(`Unknown AI command "${commandId}"`);
		}
		if (command.guard && !command.guard(ctx)) {
			throw new Error(
				`AI command "${resolveCatalogCopy(this._editor, command.label)}" is not available in this context`,
			);
		}

		const prompt = this._registry.resolvePrompt(command, ctx);
		this._lastPrompt = prompt;
		this._lastCommandId = command.id;

		if (
			command.target === "selection" &&
			ctx.selection?.type === "text" &&
			!ctx.selection.isCollapsed
		) {
			return this.asHost()._runSelectionGeneration(
				prompt,
				ctx.selection,
				command.id,
				options?.maxSteps,
			);
		}

		const targetBlockId =
			options?.blockId ??
			ctx.blockId ??
			this._editor.lastBlock()?.id ??
			this._editor.firstBlock()?.id;
		if (!targetBlockId) {
			throw new Error("Cannot run AI command without a target block");
		}
		return this.asHost()._runBlockGeneration(
			prompt,
			targetBlockId,
			command.id,
			options?.maxSteps,
		);
	}

	async runPrompt(
		prompt: string,
		options?: AICommandExecutionOptions,
	): Promise<GenerationState> {
		this._lastPrompt = prompt;
		this._lastCommandId = null;
		const promptTarget = resolvePromptTarget(
			this._editor.selection,
			options?.target,
		);
		if (promptTarget === "selection") {
			const selection = this._editor.selection;
			if (selection?.type !== "text" || selection.isCollapsed) {
				throw new Error(
					"Cannot run a selection prompt without selected text",
				);
			}
			return this.asHost()._runSelectionGeneration(
				prompt,
				selection,
				undefined,
				options?.maxSteps,
			);
		}
		if (promptTarget === "document") {
			return this.asHost()._runDocumentGeneration(
				prompt,
				options?.blockId,
				undefined,
				options?.maxSteps,
			);
		}
		const blockId =
			options?.blockId ??
			resolveActiveBlockId(this._editor.selection) ??
			this._editor.lastBlock()?.id ??
			this._editor.firstBlock()?.id;
		if (!blockId) {
			throw new Error("Cannot run AI prompt without a target block");
		}
		return this.asHost()._runBlockGeneration(
			prompt,
			blockId,
			undefined,
			options?.maxSteps,
		);
	}

	async retryActiveGeneration(): Promise<GenerationState | null> {
		const prompt = this._lastPrompt;
		if (!prompt) return null;
		this.asHost().rejectActiveGeneration();
		const active = this._state.activeGeneration;
		const blockId =
			active?.blockId ??
			resolveActiveBlockId(this._editor.selection) ??
			this._editor.lastBlock()?.id ??
			this._editor.firstBlock()?.id;
		if (!blockId) return null;
		if (active?.sessionId) {
			const activeSession = this._state.sessions.find(
				(session) => session.id === active.sessionId,
			);
			const retryTarget =
				activeSession?.target.kind === "document"
					? "document"
					: (active?.target ?? "block");
			return this.asHost().runSessionPrompt(active.sessionId, prompt, {
				blockId: retryTarget === "document" ? null : blockId,
				target: retryTarget,
			});
		}
		if (this._lastCommandId) {
			return this.runCommand(this._lastCommandId, { blockId });
		}
		return this.runPrompt(prompt, {
			blockId,
			target: active?.target ?? "block",
		});
	}
}

interface AIControllerExtensionSurface {
	destroy(): void;
	handleDocumentChange(events: readonly CommitEvent[]): void;
	buildDecorations(): Decoration[];
	canHandleInlineHistoryShortcut(
		direction: AIInlineHistoryDirection,
	): boolean;
	handleInlineHistoryShortcut(direction: AIInlineHistoryDirection): boolean;
}

interface AIControllerImpl extends AIController, AIControllerExtensionSurface {
	_setState(partial: Partial<AIControllerState>): void;
	_syncSuggestionsFromDocument(): boolean;
	_handleHistoryApplied(event: HistoryAppliedEvent): void;
	_restoreInlineHistorySnapshotFromUndo(
		snapshot: AIInlineHistorySnapshot,
	): void;
}

function installControllerMethods(controller: AIControllerImpl): void {
	Object.assign(
		controller,
		reviewResolutionMethods,
		generationRunnerMethods,
		decorationControllerMethods,
		suggestionControllerMethods,
		commitSupportMethods,
		operationCommitMethods,
		bufferedBlockGenerationMethods,
		markdownFastApplyMethods,
		fastApplySupportMethods,
		workingSetMethods,
		workingSetValidationMethods,
		inlineHistoryRecording,
		inlineHistoryNavigation,
		inlineHistoryRestore,
	);
}

export function aiExtension(config: AIExtensionConfig = {}): Extension {
	let unsubscribeTrackedOrigins: (() => void) | null = null;
	let controller: AIControllerImpl | null = null;
	let inlineCompletion: AIInlineCompletionController | null = null;
	let releaseInlineCompletion: (() => void) | null = null;
	let inlineHistory: AIInlineHistoryService | null = null;
	let reviewController: AIReviewService | null = null;
	let activeEditor: Editor | null = null;

	return defineExtension({
		name: AI_EXTENSION_NAME,
		dependencies: ["document-ops", "delta-stream", "undo"],
		keyBindings: AI_SHORTCUT_KEY_BINDINGS,
		facets: [
			beforeApplyFacet.of((ops, options) => {
				if (!controller?.getState().suggestMode) {
					return ops;
				}
				if (shouldBypassSuggestMode(options.origin)) {
					return ops;
				}
				const editor = activeEditor;
				if (!editor) {
					return ops;
				}
				const originType = options.origin
					? getOpOriginType(options.origin)
					: undefined;
				return transformOpsForSuggestMode(
					ops,
					editor,
					originType === "ai"
						? "assistant"
						: (config.author ?? "user"),
					originType === "ai" ? "ai" : "user",
					readModelId(config.model),
				);
			}, "high"),
		],

		activateClient: async ({ editor }) => {
			activeEditor = editor;
			const inlineCompletionRegistration =
				ensureInlineCompletionController(editor);
			inlineCompletion = inlineCompletionRegistration.controller;
			releaseInlineCompletion = inlineCompletionRegistration.release;
			controller = new AIControllerImpl(editor, config, {
				inlineCompletion,
			});
			inlineHistory = new AIInlineHistoryService({
				canUndoInlineHistory: () =>
					controller ? controller.canUndoInlineHistory() : false,
				canRedoInlineHistory: () =>
					controller ? controller.canRedoInlineHistory() : false,
				canHandleShortcut: (direction) =>
					controller
						? controller.canHandleInlineHistoryShortcut(direction)
						: false,
				handleShortcut: (direction) =>
					controller
						? controller.handleInlineHistoryShortcut(direction)
						: false,
				undoInlineHistory: () =>
					controller ? controller.undoInlineHistory() : false,
				redoInlineHistory: () =>
					controller ? controller.redoInlineHistory() : false,
			});
			reviewController = new AIReviewService({
				getSuggestions: () => controller?.getSuggestions() ?? [],
				acceptSuggestion: (id) =>
					controller?.acceptSuggestion(id) ?? false,
				rejectSuggestion: (id) =>
					controller?.rejectSuggestion(id) ?? false,
				acceptAllSuggestions: () => controller?.acceptAllSuggestions(),
				rejectAllSuggestions: () => controller?.rejectAllSuggestions(),
			});
			editor.internals.assignSlot(AI_CONTROLLER_SLOT, controller);
			editor.internals.assignSlot(AI_INLINE_HISTORY_SLOT, inlineHistory);
			editor.internals.assignSlot(
				AI_REVIEW_CONTROLLER_SLOT,
				reviewController,
			);
			unsubscribeTrackedOrigins =
				editor.undoManager.registerTrackedOrigins([
					AI_SESSION_SUGGESTION_ORIGIN,
					SUGGESTION_RESOLUTION_ORIGIN,
				]);

		},

		deactivateClient: async () => {
			controller?.cancelActiveGeneration();
			controller?.destroy();
			activeEditor?.internals.assignSlot(AI_CONTROLLER_SLOT, null);
			activeEditor?.internals.assignSlot(AI_INLINE_HISTORY_SLOT, null);
			activeEditor?.internals.assignSlot(AI_REVIEW_CONTROLLER_SLOT, null);
			releaseInlineCompletion?.();
			unsubscribeTrackedOrigins?.();
			unsubscribeTrackedOrigins = null;
			controller = null;
			inlineCompletion = null;
			releaseInlineCompletion = null;
			inlineHistory = null;
			reviewController = null;
			activeEditor = null;
		},

		observe: (events, editor) => {
			if (!controller) {
				editor.requestDecorationUpdate();
				return;
			}
			controller.handleDocumentChange(events);
		},

		decorations: () => {
			const decorations = controller?.buildDecorations() ?? [];
			const inlineDecorations =
				activeEditor?.facet(aiAutocompleteControllerFacet) == null
					? (inlineCompletion?.buildDecorations() ?? [])
					: [];
			return createDecorationSet([...decorations, ...inlineDecorations]);
		},
	});
}

export function getAIController(editor: Editor): AIController | null {
	return (editor.facet(aiControllerFacet) as AIController | null) ?? null;
}

export function getInlineCompletionController(
	editor: Editor,
): AIInlineCompletionController | null {
	return getInlineCompletionControllerFromCore(editor);
}

export function getAIInlineCompletionController(
	editor: Editor,
): AIInlineCompletionController | null {
	return getInlineCompletionController(editor);
}

export function getAIInlineHistoryController(
	editor: Editor,
): AIInlineHistoryController | null {
	return (
		(editor.facet(aiInlineHistoryFacet) as AIInlineHistoryController | null) ??
		null
	);
}

export function getAIReviewController(
	editor: Editor,
): AIReviewController | null {
	return (
		(editor.facet(aiReviewControllerFacet) as AIReviewController | null) ??
		null
	);
}
