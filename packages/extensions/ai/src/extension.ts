import {
	createDecorationSet,
	ensureInlineCompletionController,
	getInlineCompletionController as getInlineCompletionControllerFromCore,
} from "@pen/core";
import type {
	Editor,
	Extension,
	KeyBinding,
	ModelAdapter,
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
	UNDO_HISTORY_METADATA_CONTROLLER_SLOT_KEY,
} from "@pen/types";
import { defaultAICommands } from "./commands/defaultCommands";
import { AICommandRegistry } from "./commands/registry";
import { AIInlineHistoryService, AIReviewService } from "./controllers";
import type { AIContentFormat } from "./runtime/contracts";
import { SuggestedAIOperationRunner } from "./runtime/suggestedOperationRunner";
import {
	AI_SESSION_SUGGESTION_ORIGIN,
	interceptApplyForSuggestMode,
	shouldBypassSuggestMode,
	SUGGESTION_RESOLUTION_ORIGIN,
} from "./suggestions/suggestMode";
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
	AIReviewController,
	AIStreamEvent,
	PersistentSuggestion,
} from "./types";
import { aiControllerMethodsPart1 } from "./extensionParts/aiControllerMethodsPart1";
import { aiControllerMethodsPart2 } from "./extensionParts/aiControllerMethodsPart2";
import { aiControllerMethodsPart3 } from "./extensionParts/aiControllerMethodsPart3";
import { aiControllerMethodsPart4 } from "./extensionParts/aiControllerMethodsPart4";
import { aiControllerMethodsPart5 } from "./extensionParts/aiControllerMethodsPart5";
import { aiControllerMethodsPart6 } from "./extensionParts/aiControllerMethodsPart6";
import { aiControllerMethodsPart7 } from "./extensionParts/aiControllerMethodsPart7";
import { aiControllerMethodsPart8 } from "./extensionParts/aiControllerMethodsPart8";
import { aiControllerMethodsPart9 } from "./extensionParts/aiControllerMethodsPart9";
import { aiControllerMethodsPart10 } from "./extensionParts/aiControllerMethodsPart10";
import { aiControllerMethodsPart11 } from "./extensionParts/aiControllerMethodsPart11";
import { aiControllerMethodsPart12 } from "./extensionParts/aiControllerMethodsPart12";
import { aiControllerMethodsPart13 } from "./extensionParts/aiControllerMethodsPart13";
import { aiControllerMethodsPart14 } from "./extensionParts/aiControllerMethodsPart14";
import { aiControllerMethodsPart15 } from "./extensionParts/aiControllerMethodsPart15";
import { aiControllerMethodsPart16 } from "./extensionParts/aiControllerMethodsPart16";
import { AI_UNDO_HISTORY_METADATA_KEY, createDefaultSessionFastApplyMetrics, readModelId } from "./extensionParts/extensionHelpers";
import type { AIInlineHistoryRestoreRequest } from "./extensionParts/extensionHelpers";

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
		description: "Undo AI inline turn",
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
		description: "Redo AI inline turn",
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
		description: "Redo AI inline turn",
		handler: (editor) => {
			const inlineHistory = getAIInlineHistoryController(editor);
			if (!inlineHistory?.canHandleShortcut("redo")) {
				return false;
			}
			return inlineHistory.handleShortcut("redo");
		},
	},
];

class AIControllerImpl {
	private readonly _editor: Editor;

	private readonly _registry = new AICommandRegistry();

	private readonly _inlineCompletion: AIInlineCompletionController;

	private readonly _listeners = new Set<() => void>();

	private readonly _sessionListeners = new Set<() => void>();

	private readonly _streamEventListeners = new Set<() => void>();

	private readonly _model: ModelAdapter | undefined;

	private readonly _author: string;

	private readonly _suggestedOperationRunner: SuggestedAIOperationRunner;

	private readonly _maxAgenticSteps: number;

	private readonly _contentFormat: {
			blockGeneration: AIContentFormat;
			selectionRewrite: AIContentFormat;
		};

	private _state: AIControllerState;

	private _suggestions: readonly PersistentSuggestion[] = [];

	private _streamEvents: readonly AIStreamEvent[] = [];

	private _abortController: AbortController | null = null;

	private _lastPrompt: string | null = null;

	private _lastCommandId: string | null = null;

	private _documentVersion = 0;

	private _unsubscribeHistoryApplied: (() => void) | null = null;

	private _unsubscribeInlineCompletion: (() => void) | null = null;

	private _unsubscribeUndoHistoryMetadata: (() => void) | null = null;

	private readonly _undoHistoryMetadata: UndoHistoryMetadataController | null;

	private _inlineHistory: AIInlineHistorySnapshot[] = [];

	private _inlineHistoryIndex = -1;

	private _pendingInlineHistoryRestore: AIInlineHistoryRestoreRequest | null =
			null;

	private _queuedInlineHistoryShortcutDirections: AIInlineHistoryDirection[] =
			[];

	private _queuedInlineHistoryShortcutFlushScheduled = false;

	private _isRestoringInlineHistory = false;

	private _handledUndoHistoryRequestId: number | null = null;

	constructor(
			editor: Editor,
			config: AIExtensionConfig,
			services: {
				inlineCompletion: AIInlineCompletionController;
			},
		) {
			this._editor = editor;
			this._inlineCompletion = services.inlineCompletion;
			this._model = config.model;
			this._author = config.author ?? "assistant";
			this._suggestedOperationRunner = new SuggestedAIOperationRunner({
				editor: this._editor,
				author: this._author,
				model: readModelId(this._model),
				getSession: (sessionId) =>
					this._state.sessions.find((session) => session.id === sessionId) ??
					null,
				getActiveGeneration: () => this._state.activeGeneration,
			});
			this._maxAgenticSteps = config.maxAgenticSteps ?? 10;
			this._contentFormat = {
				blockGeneration: config.contentFormat?.blockGeneration ?? "text",
				selectionRewrite: config.contentFormat?.selectionRewrite ?? "text",
			};
			this._undoHistoryMetadata =
				this._editor.internals.getSlot<UndoHistoryMetadataController>(
					UNDO_HISTORY_METADATA_CONTROLLER_SLOT_KEY,
				) ?? null;
			this._state = {
				status: "idle",
				activeGeneration: null,
				sessions: [],
				activeSessionId: null,
				suggestMode: config.suggestMode ?? false,
				ephemeralSuggestion: null,
				commandMenuOpen: false,
			};

			for (const command of defaultAICommands) {
				this._registry.register(command);
			}
			for (const command of config.commands ?? []) {
				this._registry.register(command);
			}

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
}

interface AIControllerImpl extends AIController {
	[key: string]: any;
}

Object.assign(
	AIControllerImpl.prototype,
	aiControllerMethodsPart1,
	aiControllerMethodsPart2,
	aiControllerMethodsPart3,
	aiControllerMethodsPart4,
	aiControllerMethodsPart5,
	aiControllerMethodsPart6,
	aiControllerMethodsPart7,
	aiControllerMethodsPart8,
	aiControllerMethodsPart9,
	aiControllerMethodsPart10,
	aiControllerMethodsPart11,
	aiControllerMethodsPart12,
	aiControllerMethodsPart13,
	aiControllerMethodsPart14,
	aiControllerMethodsPart15,
	aiControllerMethodsPart16,
);

export function aiExtension(config: AIExtensionConfig = {}): Extension {
	let unsubscribeBeforeApply: (() => void) | null = null;
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
			editor.internals.setSlot(AI_CONTROLLER_SLOT, controller);
			editor.internals.setSlot(AI_INLINE_HISTORY_SLOT, inlineHistory);
			editor.internals.setSlot(
				AI_REVIEW_CONTROLLER_SLOT,
				reviewController,
			);
			unsubscribeTrackedOrigins =
				editor.undoManager.registerTrackedOrigins([
					AI_SESSION_SUGGESTION_ORIGIN,
					SUGGESTION_RESOLUTION_ORIGIN,
				]);

			unsubscribeBeforeApply = editor.onBeforeApply(
				(ops, options) => {
					if (!controller?.getState().suggestMode) return ops;
					if (shouldBypassSuggestMode(options.origin)) return ops;
					const originType = options.origin
						? getOpOriginType(options.origin)
						: undefined;
					return interceptApplyForSuggestMode(
						ops,
						editor,
						originType === "ai"
							? "assistant"
							: (config.author ?? "user"),
						originType === "ai" ? "ai" : "user",
						readModelId(config.model),
					);
				},
				{ priority: 200 },
			);
		},

		deactivateClient: async () => {
			controller?.cancelActiveGeneration();
			controller?.destroy();
			activeEditor?.internals.setSlot(AI_CONTROLLER_SLOT, null);
			activeEditor?.internals.setSlot(AI_INLINE_HISTORY_SLOT, null);
			activeEditor?.internals.setSlot(AI_REVIEW_CONTROLLER_SLOT, null);
			releaseInlineCompletion?.();
			unsubscribeTrackedOrigins?.();
			unsubscribeTrackedOrigins = null;
			unsubscribeBeforeApply?.();
			unsubscribeBeforeApply = null;
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
				activeEditor?.internals.getSlot(
					AI_AUTOCOMPLETE_CONTROLLER_SLOT,
				) == null
					? (inlineCompletion?.buildDecorations() ?? [])
					: [];
			return createDecorationSet([...decorations, ...inlineDecorations]);
		},
	});
}

export function getAIController(editor: Editor): AIController | null {
	return editor.internals.getSlot<AIController>(AI_CONTROLLER_SLOT) ?? null;
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
		editor.internals.getSlot<AIInlineHistoryController>(
			AI_INLINE_HISTORY_SLOT,
		) ?? null
	);
}

export function getAIReviewController(
	editor: Editor,
): AIReviewController | null {
	return (
		editor.internals.getSlot<AIReviewController>(
			AI_REVIEW_CONTROLLER_SLOT,
		) ?? null
	);
}
