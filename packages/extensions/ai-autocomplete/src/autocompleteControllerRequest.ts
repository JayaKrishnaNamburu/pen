import type { Editor, FieldEditor, ModelAdapter } from "@pen/types";
import { FIELD_EDITOR_SLOT_KEY } from "@pen/types";
import { buildAutocompleteMessages } from "./promptBuilder";
import type { AutocompleteProviderRegistry } from "./providers/registry";
import type { AutocompleteContextProvider, AutocompleteProviderDescriptor } from "./providers/types";
import type {
	AutocompleteAcceptanceStrategy,
	AutocompleteBlockedReason,
	AutocompleteBlockPolicy,
	AutocompleteControllerSnapshot,
	AutocompleteControllerState,
	AutocompleteDismissReason,
	AutocompleteExtensionConfig,
	AutocompletePolicyInvalidationStage,
	AutocompleteRequestContext,
} from "./types";
import {
	createAutocompleteStructuredCandidate,
	materializeStructuredCandidateAcceptance,
} from "./structuredCandidate";
import type { AutocompleteContinuationState } from "./continuationState";
import { AutocompleteControllerImpl } from "./autocompleteControllerCore";
import { handleModelEvent, head, normalizeCompletionText, tail } from "./autocompleteCompletionText";
import { logAutocompleteEvent, previewAutocompleteTextForLog } from "./autocompleteDebug";
import {
	areBlockPoliciesEqual,
	cloneAutocompleteControllerState,
	freezeAutocompleteControllerSnapshot,
	freezeAutocompleteControllerState,
	freezeProviderDescriptors,
	incrementPolicyInvalidationMetrics,
} from "./autocompleteControllerSnapshots";

const AUTOCOMPLETE_REQUEST_MODE = "inline-autocomplete";

type AutocompleteControllerRuntime = {
	[key: string]: any;
	_editor: Editor;
	_model: ModelAdapter | undefined;
	_debounceMs: number;
	_acceptanceStrategy: AutocompleteAcceptanceStrategy;
	_staleAfterMs: number;
	_maxPrefixChars: number;
	_maxSuffixChars: number;
	_maxNeighborChars: number;
	_maxProviderChars: number;
	_maxProviderTimeMs: number;
	_prefetchAfterAccept: boolean;
	_providerRegistry: AutocompleteProviderRegistry;
	_inlineCompletion: import("@pen/types").InlineCompletionController;
	_listeners: Set<() => void>;
	_snapshot: AutocompleteControllerSnapshot | null;
	_providerDescriptorsSnapshot: readonly AutocompleteProviderDescriptor[] | null;
	_state: AutocompleteControllerState;
	_debounceTimer: ReturnType<typeof setTimeout> | null;
	_abortController: AbortController | null;
	_unsubscribeSelection: (() => void) | null;
	_unsubscribeCommit: (() => void) | null;
	_continuation: AutocompleteContinuationState;
	_prefetchAbortController: AbortController | null;
};

type RuntimePrototype = Record<string, unknown>;

const ControllerPrototype = AutocompleteControllerImpl.prototype as unknown as RuntimePrototype;

ControllerPrototype._runRequest = async function _runRequest(this: AutocompleteControllerRuntime, requestId: string): Promise<void> {
	if (this._state.activeRequestId !== requestId || !this._model) {
		logAutocompleteEvent("request skipped before start", {
			requestId,
			hasModel: !!this._model,
			activeRequestId: this._state.activeRequestId,
		});
		return;
	}
	this._abortController?.abort();
	const abortController = new AbortController();
	this._abortController = abortController;
	const context = this._buildContext();
	if (!context) {
		logAutocompleteEvent("request blocked before prompt build", {
			requestId,
			lastBlockedReason: this._state.diagnostics.lastBlockedReason,
		});
		this._setState({
			status: "idle",
			activeRequestId: null,
		});
		return;
	}
	this._setState({
		status: "requesting",
		activeRequestId: requestId,
	});
	logAutocompleteEvent("request started", {
		requestId,
		blockId: context.blockId,
		offset: context.offset,
	});

	const { messages, providerTimings } = await buildAutocompleteMessages({
		context,
		registry: this._providerRegistry,
		maxProviderChars: this._maxProviderChars,
		maxProviderTimeMs: this._maxProviderTimeMs,
		continuationDepth: 0,
	});
	if (!this._shouldContinueRequest(requestId, context)) {
		logAutocompleteEvent("request cancelled after prompt build", {
			requestId,
			activeRequestId: this._state.activeRequestId,
			lastBlockedReason: this._state.diagnostics.lastBlockedReason,
		});
		return;
	}
	this._setState({ providerTimings });
	logAutocompleteEvent("request prompt ready", {
		requestId,
		providerTimings,
		promptLength: String(messages[1]?.content ?? "").length,
	});
	const startedAt = Date.now();

	let text = "";
	try {
		logAutocompleteEvent("request model stream opening", { requestId });
		for await (const event of this._model.stream({
			messages,
			tools: [],
			signal: abortController.signal,
			requestMode: AUTOCOMPLETE_REQUEST_MODE,
		})) {
			if (!this._shouldContinueRequest(requestId, context)) {
				logAutocompleteEvent("request cancelled during stream", {
					requestId,
					activeRequestId: this._state.activeRequestId,
					lastBlockedReason:
						this._state.diagnostics.lastBlockedReason,
				});
				abortController.abort();
				return;
			}
			logAutocompleteEvent("request model event", {
				requestId,
				type: event.type,
			});
			if (
				!handleModelEvent(event, (delta) => {
					text += delta;
				})
			) {
				break;
			}
		}
	} catch {
		logAutocompleteEvent("request stream threw", {
			requestId,
			aborted: abortController.signal.aborted,
		});
		if (!abortController.signal.aborted) {
			this._setState({
				status: "idle",
				activeRequestId: null,
			});
		}
		return;
	}

	if (!this._shouldContinueRequest(requestId, context)) {
		logAutocompleteEvent("request cancelled after stream", {
			requestId,
			activeRequestId: this._state.activeRequestId,
			lastBlockedReason: this._state.diagnostics.lastBlockedReason,
		});
		return;
	}
	if (Date.now() - startedAt > this._staleAfterMs) {
		logAutocompleteEvent("request dropped as stale", {
			requestId,
			elapsedMs: Date.now() - startedAt,
			staleAfterMs: this._staleAfterMs,
		});
		this._setState({
			status: "idle",
			activeRequestId: null,
			metrics: {
				...this._state.metrics,
				staleDropCount: this._state.metrics.staleDropCount + 1,
			},
			diagnostics: {
				...this._state.diagnostics,
				lastDismissReason: "stale",
			},
		});
		return;
	}
	const normalizedText = normalizeCompletionText(context, text);
	logAutocompleteEvent("request normalized text", {
		requestId,
		blockType: context.blockType,
		rawLength: text.length,
		rawPreview: previewAutocompleteTextForLog(text),
		normalizedLength: normalizedText.length,
		normalizedPreview: previewAutocompleteTextForLog(normalizedText),
	});
	if (!normalizedText) {
		logAutocompleteEvent("request produced empty normalized text", {
			requestId,
			rawLength: text.length,
		});
		this._setState({
			status: "idle",
			activeRequestId: null,
		});
		return;
	}

	const candidate = createAutocompleteStructuredCandidate(
		this._editor,
		normalizedText,
		{
			activeBlockType: context.blockType,
			continuationDepth: 0,
		},
	);
	this._continuation.setSequence({
		requestId,
		blockId: context.blockId,
		startOffset: context.offset,
		candidate,
		continuationDepth: 0,
	});
	this._setState({
		metrics: {
			...this._state.metrics,
			successCount: this._state.metrics.successCount + 1,
		},
	});
	logAutocompleteEvent("request produced suggestion", {
		requestId,
		blockType: context.blockType,
		normalizedLength: normalizedText.length,
		inlineLength: candidate.inlineText.length,
		inlinePreview: previewAutocompleteTextForLog(candidate.inlineText),
		appendedBlockCount: candidate.appendedBlocks.length,
		appendedBlockTypes: candidate.appendedBlocks.map(
			(block) => block.type,
		),
		previewBlockCount: candidate.previewBlocks.length,
	});
	this._showSequenceSuggestion();
}
;
ControllerPrototype._buildContext = function _buildContext(this: AutocompleteControllerRuntime): AutocompleteRequestContext | null {
	const selection = this._editor.selection;
	if (selection == null) {
		this._setBlockedReason("missing-context");
		return null;
	}
	if (selection.type !== "text") {
		this._setBlockedReason("selection-not-text");
		return null;
	}
	if (!selection.isCollapsed) {
		this._setBlockedReason("selection-not-collapsed");
		return null;
	}
	if (selection.isMultiBlock) {
		this._setBlockedReason("selection-multi-block");
		return null;
	}
	const fieldEditor = this._getFieldEditor();
	if (!fieldEditor) {
		this._setBlockedReason("field-editor-unavailable");
		return null;
	}
	if (!fieldEditor.isEditing) {
		this._setBlockedReason("field-editor-not-editing");
		return null;
	}
	if (!fieldEditor.isFocused) {
		this._setBlockedReason("field-editor-not-focused");
		return null;
	}
	if (fieldEditor.isComposing) {
		this._setBlockedReason("field-editor-composing");
		return null;
	}
	return this._buildContextForPosition(
		selection.focus.blockId,
		selection.focus.offset,
	);
}
;
ControllerPrototype._buildContextForPosition = function _buildContextForPosition(this: AutocompleteControllerRuntime, 
	blockId: string,
	offset: number,
): AutocompleteRequestContext | null {
	const block = this._editor.getBlock(blockId);
	if (!block) {
		this._setBlockedReason("block-missing");
		return null;
	}
	const blockPolicyFailure = this._resolveContextEligibilityFailure(
		block.id,
		block.type,
	);
	if (blockPolicyFailure) {
		this._setBlockedReason(blockPolicyFailure);
		return null;
	}
	const blockText = block.textContent();
	return {
		editor: this._editor,
		blockId: block.id,
		blockType: block.type,
		offset,
		prefixText: tail(blockText.slice(0, offset), this._maxPrefixChars),
		suffixText: head(blockText.slice(offset), this._maxSuffixChars),
		previousBlockText: tail(
			block.prev?.textContent() ?? "",
			this._maxNeighborChars,
		),
		nextBlockText: head(
			block.next?.textContent() ?? "",
			this._maxNeighborChars,
		),
	};
}
;
ControllerPrototype._shouldContinueRequest = function _shouldContinueRequest(this: AutocompleteControllerRuntime, 
	requestId: string,
	context: AutocompleteRequestContext,
): boolean {
	if (this._state.activeRequestId !== requestId) {
		logAutocompleteEvent("request continuation blocked: replaced", {
			requestId,
			activeRequestId: this._state.activeRequestId,
		});
		return false;
	}
	const selection = this._editor.selection;
	if (
		selection?.type !== "text" ||
		!selection.isCollapsed ||
		selection.isMultiBlock ||
		selection.focus.blockId !== context.blockId ||
		selection.focus.offset !== context.offset
	) {
		logAutocompleteEvent(
			"request continuation blocked: selection changed",
			{
				requestId,
				expected: {
					blockId: context.blockId,
					offset: context.offset,
				},
				actual:
					selection?.type === "text"
						? {
								type: selection.type,
								blockId: selection.focus.blockId,
								offset: selection.focus.offset,
								isCollapsed: selection.isCollapsed,
								isMultiBlock: selection.isMultiBlock,
							}
						: selection,
			},
		);
		return false;
	}
	const fieldEditor = this._getFieldEditor();
	if (
		!fieldEditor?.isEditing ||
		!fieldEditor.isFocused ||
		fieldEditor.isComposing
	) {
		logAutocompleteEvent(
			"request continuation blocked: field editor state",
			{
				requestId,
				fieldEditor: fieldEditor
					? {
							isEditing: fieldEditor.isEditing,
							isFocused: fieldEditor.isFocused,
							isComposing: fieldEditor.isComposing,
							focusBlockId: fieldEditor.focusBlockId,
						}
					: null,
			},
		);
		return false;
	}
	const block = this._editor.getBlock(context.blockId);
	const policyFailure = block
		? this._resolveContextEligibilityFailure(block.id, block.type)
		: "block-missing";
	if (policyFailure) {
		this._setBlockedReason(policyFailure);
		return false;
	}
	return true;
}
;
ControllerPrototype._shouldDismissForExternalCommit = function _shouldDismissForExternalCommit(this: AutocompleteControllerRuntime, 
	affectedBlocks: readonly string[],
): boolean {
	const visibleSuggestion =
		this._inlineCompletion.getState().visibleSuggestion;
	return (
		!!visibleSuggestion &&
		affectedBlocks.includes(visibleSuggestion.blockId)
	);
}
;
ControllerPrototype._shouldDismissForSelectionChange = function _shouldDismissForSelectionChange(this: AutocompleteControllerRuntime): boolean {
	const visibleSuggestion =
		this._inlineCompletion.getState().visibleSuggestion;
	if (!visibleSuggestion || visibleSuggestion.type !== "inline") {
		return false;
	}
	const selection = this._editor.selection;
	if (
		selection?.type !== "text" ||
		!selection.isCollapsed ||
		selection.isMultiBlock
	) {
		return true;
	}
	return (
		selection.focus.blockId !== visibleSuggestion.blockId ||
		selection.focus.offset !== visibleSuggestion.offset
	);
}
;
ControllerPrototype._getFieldEditor = function _getFieldEditor(this: AutocompleteControllerRuntime): FieldEditor | null {
	return (
		this._editor.internals.getSlot<FieldEditor>(
			FIELD_EDITOR_SLOT_KEY,
		) ?? null
	);
}
;
