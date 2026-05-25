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

ControllerPrototype._setBlockedReason = function _setBlockedReason(this: AutocompleteControllerRuntime, reason: AutocompleteBlockedReason): void {
	this._setState({
		diagnostics: {
			...this._state.diagnostics,
			lastBlockedReason: reason,
		},
	});
}
;
ControllerPrototype._recordPolicyInvalidation = function _recordPolicyInvalidation(this: AutocompleteControllerRuntime, 
	policyFailure: AutocompleteBlockedReason,
	invalidationStage: AutocompletePolicyInvalidationStage | null,
): void {
	this._setBlockedReason(policyFailure);
	if (invalidationStage) {
		this._setState({
			metrics: incrementPolicyInvalidationMetrics(
				this._state.metrics,
				invalidationStage,
			),
			diagnostics: {
				...this._state.diagnostics,
				lastPolicyInvalidationStage: invalidationStage,
			},
		});
	}
	if (invalidationStage || this._continuation.hasPrefetchedContinuation) {
		this.dismiss("policy-change");
	}
}
;
ControllerPrototype._invalidateForPolicyChange = function _invalidateForPolicyChange(this: AutocompleteControllerRuntime): void {
	const activeBlockId =
		this._continuation.sequence?.blockId ??
		this._getActiveSelectionBlockId();
	if (!activeBlockId) {
		return;
	}
	const policyFailure = this._resolveCurrentBlockFailure(activeBlockId);
	if (!policyFailure) {
		return;
	}
	const invalidationStage = this._getPolicyInvalidationStage();
	this._recordPolicyInvalidation(policyFailure, invalidationStage);
}
;
ControllerPrototype._getActiveSelectionBlockId = function _getActiveSelectionBlockId(this: AutocompleteControllerRuntime): string | null {
	const selection = this._editor.selection;
	return selection?.type === "text" ? selection.focus.blockId : null;
}
;
ControllerPrototype._getPolicyInvalidationStage = function _getPolicyInvalidationStage(this: AutocompleteControllerRuntime): AutocompletePolicyInvalidationStage | null {
	if (
		this._state.status === "scheduled" ||
		this._state.status === "requesting"
	) {
		return this._state.status;
	}
	if (
		this._state.status === "showing" ||
		this._continuation.sequence ||
		this._continuation.hasPrefetchedContinuation
	) {
		return "showing";
	}
	return null;
}
;
ControllerPrototype._resolveCurrentBlockFailure = function _resolveCurrentBlockFailure(this: AutocompleteControllerRuntime, 
	blockId: string,
): AutocompleteBlockedReason | null {
	const block = this._editor.getBlock(blockId);
	if (!block) {
		return "block-missing";
	}
	return this._resolveContextEligibilityFailure(block.id, block.type);
}
;
ControllerPrototype._resolveContextEligibilityFailure = function _resolveContextEligibilityFailure(this: AutocompleteControllerRuntime, 
	blockId: string,
	blockType: string | null,
): AutocompleteBlockedReason | null {
	const blockPolicyFailure = this._resolveBlockPolicyFailure(blockType);
	if (blockPolicyFailure) {
		return blockPolicyFailure;
	}
	const fieldEditor = this._getFieldEditor() as
		| (FieldEditor & { activeCellCoord?: { blockId: string } | null })
		| null;
	if (
		fieldEditor?.activeCellCoord &&
		fieldEditor.activeCellCoord.blockId === blockId &&
		this._state.blockPolicy.allowInTables !== true
	) {
		return "table-cell-active";
	}
	return null;
}
;
ControllerPrototype._resolveBlockPolicyFailure = function _resolveBlockPolicyFailure(this: AutocompleteControllerRuntime, 
	blockType: string | null,
): AutocompleteBlockedReason | null {
	if (!blockType) {
		return null;
	}
	const allowedBlockTypes = this._state.blockPolicy.allowedBlockTypes;
	if (
		allowedBlockTypes &&
		allowedBlockTypes.length > 0 &&
		!allowedBlockTypes.includes(blockType)
	) {
		return "block-type-not-allowed";
	}
	const deniedBlockTypes = this._state.blockPolicy.deniedBlockTypes;
	if (deniedBlockTypes?.includes(blockType)) {
		return "block-type-denied";
	}
	if (
		blockType === "codeBlock" &&
		this._state.blockPolicy.allowInCodeBlocks === false
	) {
		return "code-block-disabled";
	}
	if (
		blockType === "table" &&
		this._state.blockPolicy.allowInTables !== true
	) {
		return "table-disabled";
	}
	return null;
}
;
ControllerPrototype._clearDebounceTimer = function _clearDebounceTimer(this: AutocompleteControllerRuntime): void {
	if (this._debounceTimer !== null) {
		clearTimeout(this._debounceTimer);
		this._debounceTimer = null;
	}
}
;
ControllerPrototype._setState = function _setState(this: AutocompleteControllerRuntime, next: Partial<AutocompleteControllerState>): void {
	this._state = {
		...this._state,
		...next,
	};
	this._invalidateSnapshot();
	this._emit();
}
;
ControllerPrototype._getProviderDescriptorsSnapshot = function _getProviderDescriptorsSnapshot(this: AutocompleteControllerRuntime): readonly AutocompleteProviderDescriptor[] {
	if (this._providerDescriptorsSnapshot === null) {
		this._providerDescriptorsSnapshot = freezeProviderDescriptors(
			this._providerRegistry.listProviderDescriptors(),
		);
	}
	return this._providerDescriptorsSnapshot;
}
;
ControllerPrototype._invalidateSnapshot = function _invalidateSnapshot(this: AutocompleteControllerRuntime): void {
	this._snapshot = null;
}
;
ControllerPrototype._invalidateProviderDescriptorsSnapshot = function _invalidateProviderDescriptorsSnapshot(this: AutocompleteControllerRuntime): void {
	this._providerDescriptorsSnapshot = null;
	this._invalidateSnapshot();
}
;
ControllerPrototype._emit = function _emit(this: AutocompleteControllerRuntime): void {
	for (const listener of this._listeners) {
		listener();
	}
}
;
