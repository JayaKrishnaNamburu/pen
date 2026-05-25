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

ControllerPrototype._showSequenceSuggestion = function _showSequenceSuggestion(this: AutocompleteControllerRuntime): void {
	const sequence = this._continuation.sequence;
	if (!sequence) {
		return;
	}
	const suggestionId = sequence.requestId;
	const preview = sequence.candidate;
	this._inlineCompletion.showSuggestion({
		id: suggestionId,
		blockId: sequence.blockId,
		offset: sequence.startOffset,
		text: preview.inlineText,
		type: "inline",
		previewBlocks: preview.previewBlocks,
		accept: () =>
			this._acceptFullVisibleSuggestion({
				activateContinuation: true,
			}),
	});
	this._setState({
		status: "showing",
		activeRequestId: sequence.requestId,
		visibleSuggestionId: suggestionId,
	});
}
;
ControllerPrototype._startPrefetchForAcceptedContinuation = function _startPrefetchForAcceptedContinuation(this: AutocompleteControllerRuntime, options: {
	sourceRequestId: string;
	blockId: string;
	startOffset: number;
	continuationDepth: number;
}): void {
	if (!this._prefetchAfterAccept) {
		return;
	}
	const context = this._buildContextForPosition(
		options.blockId,
		options.startOffset,
	);
	if (!context) {
		return;
	}
	this._prefetchAbortController?.abort();
	const abortController = new AbortController();
	this._prefetchAbortController = abortController;
	void this._runPrefetchRequest({
		abortController,
		context,
		continuationDepth: options.continuationDepth,
		sourceRequestId: options.sourceRequestId,
	});
}
;
ControllerPrototype._runPrefetchRequest = async function _runPrefetchRequest(this: AutocompleteControllerRuntime, options: {
	abortController: AbortController;
	context: AutocompleteRequestContext;
	continuationDepth: number;
	sourceRequestId: string;
}): Promise<void> {
	if (!this._model) {
		return;
	}
	const { abortController, context, continuationDepth, sourceRequestId } =
		options;
	const requestId = crypto.randomUUID();
	const { messages } = await buildAutocompleteMessages({
		context,
		registry: this._providerRegistry,
		maxProviderChars: this._maxProviderChars,
		maxProviderTimeMs: this._maxProviderTimeMs,
		mode: "continuation",
		continuationDepth,
	});
	if (abortController.signal.aborted) {
		return;
	}

	let text = "";
	try {
		for await (const event of this._model.stream({
			messages,
			tools: [],
			signal: abortController.signal,
			requestMode: AUTOCOMPLETE_REQUEST_MODE,
		})) {
			if (abortController.signal.aborted) {
				return;
			}
			if (
				!handleModelEvent(event, (delta) => {
					text += delta;
				})
			) {
				break;
			}
		}
	} catch {
		return;
	}

	if (abortController.signal.aborted) {
		return;
	}
	const normalizedText = normalizeCompletionText(context, text);
	if (!normalizedText) {
		logAutocompleteEvent("prefetch produced empty normalized text", {
			requestId,
			sourceRequestId,
			blockType: context.blockType,
			rawLength: text.length,
			rawPreview: previewAutocompleteTextForLog(text),
		});
		return;
	}
	const candidate = createAutocompleteStructuredCandidate(
		this._editor,
		normalizedText,
		{
			activeBlockType: context.blockType,
			continuationDepth,
		},
	);
	logAutocompleteEvent("prefetch produced suggestion", {
		requestId,
		sourceRequestId,
		blockType: context.blockType,
		rawLength: text.length,
		rawPreview: previewAutocompleteTextForLog(text),
		normalizedLength: normalizedText.length,
		normalizedPreview: previewAutocompleteTextForLog(normalizedText),
		inlineLength: candidate.inlineText.length,
		inlinePreview: previewAutocompleteTextForLog(candidate.inlineText),
		appendedBlockCount: candidate.appendedBlocks.length,
		appendedBlockTypes: candidate.appendedBlocks.map(
			(block) => block.type,
		),
		previewBlockCount: candidate.previewBlocks.length,
	});
	this._continuation.setPrefetchedContinuation({
		sourceRequestId,
		requestId,
		blockId: context.blockId,
		startOffset: context.offset,
		candidate,
		continuationDepth,
	});
	this._activatePendingAcceptedContinuation();
}
;
ControllerPrototype._activatePendingAcceptedContinuation = function _activatePendingAcceptedContinuation(this: AutocompleteControllerRuntime): boolean {
	if (
		!this._continuation.activatePendingAcceptedContinuation(
			this._editor.selection,
		)
	) {
		return false;
	}
	this._showSequenceSuggestion();
	return true;
}
;
ControllerPrototype._clearSequence = function _clearSequence(this: AutocompleteControllerRuntime): void {
	this._continuation.clearSequence();
}
;
ControllerPrototype._clearVisibleSuggestionAfterAccept = function _clearVisibleSuggestionAfterAccept(this: AutocompleteControllerRuntime): void {
	this._clearSequence();
	this._setState({
		status: "idle",
		activeRequestId: null,
		visibleSuggestionId: null,
		diagnostics: {
			...this._state.diagnostics,
			lastDismissReason: "accept",
		},
	});
	this._inlineCompletion.dismissSuggestion();
}
;
