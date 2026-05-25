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

ControllerPrototype.destroy = function destroy(this: AutocompleteControllerRuntime): void {
	this._unsubscribeSelection?.();
	this._unsubscribeSelection = null;
	this._unsubscribeCommit?.();
	this._unsubscribeCommit = null;
	this._clearDebounceTimer();
	this._abortController?.abort();
	this._abortController = null;
	this._prefetchAbortController?.abort();
	this._prefetchAbortController = null;
	this._continuation.clearContinuations();
}
;
ControllerPrototype.getSnapshot = function getSnapshot(this: AutocompleteControllerRuntime): AutocompleteControllerSnapshot {
	if (this._snapshot === null) {
		const state = cloneAutocompleteControllerState(this._state);
		this._snapshot = freezeAutocompleteControllerSnapshot({
			state: freezeAutocompleteControllerState(state),
			providerDescriptors: this._getProviderDescriptorsSnapshot(),
		});
	}
	return this._snapshot;
}
;
ControllerPrototype.getState = function getState(this: AutocompleteControllerRuntime): AutocompleteControllerState {
	return this.getSnapshot().state;
}
;
ControllerPrototype.getBlockPolicy = function getBlockPolicy(this: AutocompleteControllerRuntime): Readonly<AutocompleteBlockPolicy> {
	return this.getSnapshot().state.blockPolicy;
}
;
ControllerPrototype.subscribe = function subscribe(this: AutocompleteControllerRuntime, listener: () => void): () => void {
	this._listeners.add(listener);
	return () => this._listeners.delete(listener);
}
;
ControllerPrototype.setEnabled = function setEnabled(this: AutocompleteControllerRuntime, enabled: boolean): void {
	if (this._state.enabled === enabled) {
		return;
	}
	this._state = {
		...this._state,
		enabled,
		status: enabled ? "idle" : "idle",
		activeRequestId: null,
	};
	this._invalidateSnapshot();
	if (!enabled) {
		this.dismiss("disabled");
	}
	this._emit();
}
;
ControllerPrototype.request = function request(this: AutocompleteControllerRuntime, options?: { explicit?: boolean }): boolean {
	if (!this._state.enabled) {
		this._setBlockedReason("disabled");
		return false;
	}
	if (!this._model) {
		this._setBlockedReason("missing-model");
		return false;
	}
	// Validate that autocomplete is currently eligible, but defer reading the
	// exact caret context until the debounced request actually runs.
	if (!this._buildContext()) {
		return false;
	}
	this.dismiss("request-replaced");
	const requestId = crypto.randomUUID();
	this._setState({
		status: "scheduled",
		activeRequestId: requestId,
		metrics: {
			...this._state.metrics,
			requestCount: this._state.metrics.requestCount + 1,
			explicitTabTriggerCount:
				this._state.metrics.explicitTabTriggerCount +
				(options?.explicit ? 1 : 0),
		},
		diagnostics: {
			...this._state.diagnostics,
			lastBlockedReason: null,
			lastPolicyInvalidationStage: null,
		},
	});
	this._clearDebounceTimer();
	const delay = options?.explicit ? 0 : this._debounceMs;
	logAutocompleteEvent("request scheduled", {
		requestId,
		explicit: options?.explicit ?? false,
		debounceMs: delay,
	});
	this._debounceTimer = setTimeout(() => {
		void this._runRequest(requestId);
	}, delay);
	return true;
}
;
ControllerPrototype.acceptVisibleSuggestion = function acceptVisibleSuggestion(this: AutocompleteControllerRuntime): boolean {
	const sequence = this._continuation.sequence;
	if (!sequence || !this.hasVisibleSuggestion()) {
		return false;
	}
	const policyFailure = this._resolveCurrentBlockFailure(
		sequence.blockId,
	);
	if (policyFailure) {
		this._recordPolicyInvalidation(policyFailure, "showing");
		return false;
	}
	return this._acceptFullVisibleSuggestion({
		activateContinuation: true,
	});
}
;
ControllerPrototype._acceptFullVisibleSuggestion = function _acceptFullVisibleSuggestion(this: AutocompleteControllerRuntime, options?: {
	activateContinuation?: boolean;
}): boolean {
	const sequence = this._continuation.sequence;
	if (!sequence) {
		return false;
	}
	const candidate = sequence.candidate;
	if (
		candidate.inlineText.length === 0 &&
		candidate.previewBlocks.length === 0
	) {
		this.dismiss();
		return false;
	}
	const blockId = sequence.blockId;
	const requestId = sequence.requestId;
	const continuationDepth = sequence.continuationDepth + 1;
	const acceptanceResult = materializeStructuredCandidateAcceptance({
		blockId,
		offset: sequence.startOffset,
		candidate,
	});
	logAutocompleteEvent("accept visible suggestion", {
		requestId,
		blockId,
		startOffset: sequence.startOffset,
		inlineLength: candidate.inlineText.length,
		inlinePreview: previewAutocompleteTextForLog(candidate.inlineText),
		appendedBlockCount: candidate.appendedBlocks.length,
		appendedBlockTypes: candidate.appendedBlocks.map(
			(block) => block.type,
		),
		opTypes: acceptanceResult.ops.map((op) => op.type),
		nextCaretBlockId: acceptanceResult.selection.blockId,
		nextCaretOffset: acceptanceResult.selection.offset,
	});
	this._continuation.beginAcceptingSequenceSegment();
	this._editor.apply(acceptanceResult.ops, {
		origin: "ai",
		undoGroup: true,
	});
	const acceptedBlock = this._editor.getBlock(blockId);
	const firstNextBlock = acceptedBlock?.next ?? null;
	const secondNextBlock = firstNextBlock?.next ?? null;
	logAutocompleteEvent(
		`accept applied summary requestId=${requestId} appendedBlockCount=${candidate.appendedBlocks.length} opTypes=${acceptanceResult.ops.map((op) => op.type).join(",")} currentBlockType=${acceptedBlock?.type ?? "missing"} currentBlockText=${previewAutocompleteTextForLog(acceptedBlock?.textContent() ?? "")} nextBlockType=${firstNextBlock?.type ?? "none"} nextBlockText=${previewAutocompleteTextForLog(firstNextBlock?.textContent() ?? "")} nextNextBlockType=${secondNextBlock?.type ?? "none"} nextNextBlockText=${previewAutocompleteTextForLog(secondNextBlock?.textContent() ?? "")}`,
	);
	const nextCaretBlockId = acceptanceResult.selection.blockId;
	const nextCaretOffset = acceptanceResult.selection.offset;
	this._setState({
		metrics: {
			...this._state.metrics,
			acceptCount: this._state.metrics.acceptCount + 1,
		},
	});
	const fieldEditor = this._getFieldEditor();
	this._editor.selectText(
		nextCaretBlockId,
		nextCaretOffset,
		nextCaretOffset,
	);
	if (fieldEditor) {
		const programmaticFieldEditor =
			fieldEditor as typeof fieldEditor & {
				commitProgrammaticTextSelection?: (
					blockId: string,
					anchorOffset: number,
					focusOffset: number,
				) => void;
			};
		if (
			typeof programmaticFieldEditor.commitProgrammaticTextSelection ===
			"function"
		) {
			programmaticFieldEditor.commitProgrammaticTextSelection(
				nextCaretBlockId,
				nextCaretOffset,
				nextCaretOffset,
			);
		} else if (
			typeof fieldEditor.activateTextSelection === "function"
		) {
			fieldEditor.activateTextSelection(
				nextCaretBlockId,
				nextCaretOffset,
				nextCaretOffset,
			);
		} else if (typeof fieldEditor.activate === "function") {
			fieldEditor.activate(nextCaretBlockId);
		}
		if (typeof fieldEditor.focus === "function") {
			fieldEditor.focus();
		}
	}

	if (options?.activateContinuation && this._prefetchAfterAccept) {
		this._continuation.setPendingAcceptedContinuation({
			sourceRequestId: requestId,
			blockId: nextCaretBlockId,
			startOffset: nextCaretOffset,
			continuationDepth,
		});
		this._clearVisibleSuggestionAfterAccept();
		this._startPrefetchForAcceptedContinuation({
			sourceRequestId: requestId,
			blockId: nextCaretBlockId,
			startOffset: nextCaretOffset,
			continuationDepth,
		});
	} else {
		this.dismiss("accept");
	}
	return true;
}
;
ControllerPrototype.hasVisibleSuggestion = function hasVisibleSuggestion(this: AutocompleteControllerRuntime): boolean {
	return (
		this._continuation.sequence !== null &&
		this._state.visibleSuggestionId !== null
	);
}
;
ControllerPrototype.registerProvider = function registerProvider(this: AutocompleteControllerRuntime, provider: AutocompleteContextProvider): () => void {
	const unregister = this._providerRegistry.registerProvider(provider);
	this._invalidateProviderDescriptorsSnapshot();
	this._emit();
	return () => {
		unregister();
		this._invalidateProviderDescriptorsSnapshot();
		this._emit();
	};
}
;
ControllerPrototype.listProviderDescriptors = function listProviderDescriptors(this: AutocompleteControllerRuntime) {
	return this.getSnapshot().providerDescriptors;
}
;
ControllerPrototype.updateRuntimeSettings = function updateRuntimeSettings(this: AutocompleteControllerRuntime, 
	settings: Partial<AutocompleteControllerState["settings"]>,
): void {
	const nextDebounceMs = settings.debounceMs;
	const nextPrefetchAfterAccept = settings.prefetchAfterAccept;
	const nextAcceptanceStrategy = settings.acceptanceStrategy;
	let changed = false;

	if (
		typeof nextDebounceMs === "number" &&
		Number.isFinite(nextDebounceMs) &&
		nextDebounceMs >= 0 &&
		nextDebounceMs !== this._debounceMs
	) {
		this._debounceMs = nextDebounceMs;
		changed = true;
	}

	if (
		typeof nextPrefetchAfterAccept === "boolean" &&
		nextPrefetchAfterAccept !== this._prefetchAfterAccept
	) {
		this._prefetchAfterAccept = nextPrefetchAfterAccept;
		if (!nextPrefetchAfterAccept) {
			this._prefetchAbortController?.abort();
			this._prefetchAbortController = null;
			this._continuation.clearContinuations();
		}
		changed = true;
	}

	if (
		nextAcceptanceStrategy === "full" &&
		nextAcceptanceStrategy !== this._acceptanceStrategy
	) {
		this._acceptanceStrategy = nextAcceptanceStrategy;
		changed = true;
	}

	const nextStaleAfterMs = settings.staleAfterMs;
	if (
		typeof nextStaleAfterMs === "number" &&
		Number.isFinite(nextStaleAfterMs) &&
		nextStaleAfterMs >= 0 &&
		nextStaleAfterMs !== this._staleAfterMs
	) {
		this._staleAfterMs = nextStaleAfterMs;
		changed = true;
	}

	if (!changed) {
		return;
	}

	this._setState({
		settings: {
			debounceMs: this._debounceMs,
			prefetchAfterAccept: this._prefetchAfterAccept,
			acceptanceStrategy: this._acceptanceStrategy,
			staleAfterMs: this._staleAfterMs,
		},
	});
}
;
ControllerPrototype.updateBlockPolicy = function updateBlockPolicy(this: AutocompleteControllerRuntime, policy: Partial<AutocompleteBlockPolicy>): void {
	const nextPolicy: AutocompleteBlockPolicy = {
		...this._state.blockPolicy,
		...policy,
	};
	if (areBlockPoliciesEqual(this._state.blockPolicy, nextPolicy)) {
		return;
	}
	this._setState({
		blockPolicy: nextPolicy,
	});
	this._invalidateForPolicyChange();
}
;
ControllerPrototype.dismiss = function dismiss(this: AutocompleteControllerRuntime, reason: AutocompleteDismissReason = "external-edit"): void {
	this._clearDebounceTimer();
	const cancelledRequest =
		this._state.status === "scheduled" ||
		this._state.status === "requesting";
	this._abortController?.abort();
	this._abortController = null;
	this._prefetchAbortController?.abort();
	this._prefetchAbortController = null;
	this._clearSequence();
	this._continuation.clearContinuations();
	this._setState({
		status: "idle",
		activeRequestId: null,
		visibleSuggestionId: null,
		metrics: {
			...this._state.metrics,
			cancelCount:
				this._state.metrics.cancelCount +
				(cancelledRequest ? 1 : 0),
		},
		diagnostics: {
			...this._state.diagnostics,
			lastDismissReason: reason,
		},
	});
	this._inlineCompletion.dismissSuggestion();
}
;
