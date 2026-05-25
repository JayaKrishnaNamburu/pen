import type {
	Editor,
	FieldEditor,
	InlineCompletionController,
	ModelAdapter,
} from "@pen/types";
import { getOpOriginType } from "@pen/types";
import {
	DEFAULT_DEBOUNCE_MS,
	DEFAULT_ACCEPTANCE_STRATEGY,
	DEFAULT_MAX_NEIGHBOR_CHARS,
	DEFAULT_MAX_PREFIX_CHARS,
	DEFAULT_MAX_PROVIDER_CHARS,
	DEFAULT_MAX_PROVIDER_TIME_MS,
	DEFAULT_MAX_SUFFIX_CHARS,
	DEFAULT_PREFETCH_AFTER_ACCEPT,
	DEFAULT_STALE_AFTER_MS,
} from "./constants";
import { builtinAutocompleteProviders } from "./providers/builtins";
import { AutocompleteProviderRegistry } from "./providers/registry";
import type {
	AutocompleteContextProvider,
	AutocompleteProviderDescriptor,
} from "./providers/types";
import type {
	AutocompleteAcceptanceStrategy,
	AutocompleteBlockedReason,
	AutocompleteBlockPolicy,
	AutocompleteController,
	AutocompleteControllerSnapshot,
	AutocompleteControllerState,
	AutocompleteDismissReason,
	AutocompleteExtensionConfig,
	AutocompletePolicyInvalidationStage,
	AutocompleteRequestContext,
} from "./types";
import { AutocompleteContinuationState } from "./continuationState";

export interface AutocompleteControllerImpl {
	destroy(): void;
	getSnapshot(): AutocompleteControllerSnapshot;
	getState(): AutocompleteControllerState;
	getBlockPolicy(): Readonly<AutocompleteBlockPolicy>;
	subscribe(listener: () => void): () => void;
	setEnabled(enabled: boolean): void;
	request(options?: { explicit?: boolean }): boolean;
	acceptVisibleSuggestion(): boolean;
	_acceptFullVisibleSuggestion(options?: {
		activateContinuation?: boolean;
	}): boolean;
	hasVisibleSuggestion(): boolean;
	registerProvider(provider: AutocompleteContextProvider): () => void;
	listProviderDescriptors(): readonly AutocompleteProviderDescriptor[];
	updateRuntimeSettings(
	settings: Partial<AutocompleteControllerState["settings"]>,
): void;
	updateBlockPolicy(policy: Partial<AutocompleteBlockPolicy>): void;
	dismiss(reason?: AutocompleteDismissReason): void;
	_runRequest(requestId: string): Promise<void>;
	_buildContext(): AutocompleteRequestContext | null;
	_buildContextForPosition(
	blockId: string,
	offset: number,
): AutocompleteRequestContext | null;
	_shouldContinueRequest(
	requestId: string,
	context: AutocompleteRequestContext,
): boolean;
	_shouldDismissForExternalCommit(
	affectedBlocks: readonly string[],
): boolean;
	_shouldDismissForSelectionChange(): boolean;
	_getFieldEditor(): FieldEditor | null;
	_showSequenceSuggestion(): void;
	_startPrefetchForAcceptedContinuation(options: {
		sourceRequestId: string;
		blockId: string;
		startOffset: number;
		continuationDepth: number;
	}): void;
	_runPrefetchRequest(options: {
		abortController: AbortController;
		context: AutocompleteRequestContext;
		continuationDepth: number;
		sourceRequestId: string;
	}): Promise<void>;
	_activatePendingAcceptedContinuation(): boolean;
	_clearSequence(): void;
	_clearVisibleSuggestionAfterAccept(): void;
	_setBlockedReason(reason: AutocompleteBlockedReason): void;
	_recordPolicyInvalidation(
	policyFailure: AutocompleteBlockedReason,
	invalidationStage: AutocompletePolicyInvalidationStage | null,
): void;
	_invalidateForPolicyChange(): void;
	_getActiveSelectionBlockId(): string | null;
	_getPolicyInvalidationStage(): AutocompletePolicyInvalidationStage | null;
	_resolveCurrentBlockFailure(
	blockId: string,
): AutocompleteBlockedReason | null;
	_resolveContextEligibilityFailure(
	blockId: string,
	blockType: string | null,
): AutocompleteBlockedReason | null;
	_resolveBlockPolicyFailure(
	blockType: string | null,
): AutocompleteBlockedReason | null;
	_clearDebounceTimer(): void;
	_setState(next: Partial<AutocompleteControllerState>): void;
	_getProviderDescriptorsSnapshot(): readonly AutocompleteProviderDescriptor[];
	_invalidateSnapshot(): void;
	_invalidateProviderDescriptorsSnapshot(): void;
	_emit(): void;
}

export class AutocompleteControllerImpl implements AutocompleteController {
	private readonly _editor: Editor;
	private readonly _model: ModelAdapter | undefined;
	private _debounceMs: number;
	private _acceptanceStrategy: AutocompleteAcceptanceStrategy;
	private _staleAfterMs: number;
	private readonly _maxPrefixChars: number;
	private readonly _maxSuffixChars: number;
	private readonly _maxNeighborChars: number;
	private readonly _maxProviderChars: number;
	private readonly _maxProviderTimeMs: number;
	private _prefetchAfterAccept: boolean;
	private readonly _providerRegistry: AutocompleteProviderRegistry;
	private readonly _inlineCompletion: InlineCompletionController;
	private readonly _listeners = new Set<() => void>();
	private _snapshot: AutocompleteControllerSnapshot | null = null;
	private _providerDescriptorsSnapshot:
		| readonly AutocompleteProviderDescriptor[]
		| null = null;
	private _state: AutocompleteControllerState = {
		enabled: true,
		status: "idle",
		activeRequestId: null,
		visibleSuggestionId: null,
		settings: {
			debounceMs: DEFAULT_DEBOUNCE_MS,
			prefetchAfterAccept: DEFAULT_PREFETCH_AFTER_ACCEPT,
			acceptanceStrategy: "full",
			staleAfterMs: DEFAULT_STALE_AFTER_MS,
		},
		blockPolicy: {
			allowInCodeBlocks: true,
			allowInTables: false,
			deniedBlockTypes: ["database"],
		},
		metrics: {
			requestCount: 0,
			successCount: 0,
			cancelCount: 0,
			staleDropCount: 0,
			explicitTabTriggerCount: 0,
			acceptCount: 0,
			policyInvalidationScheduledCount: 0,
			policyInvalidationRequestingCount: 0,
			policyInvalidationShowingCount: 0,
		},
		providerTimings: [],
		diagnostics: {
			lastDismissReason: null,
			lastBlockedReason: null,
			lastPolicyInvalidationStage: null,
		},
	};
	private _debounceTimer: ReturnType<typeof setTimeout> | null = null;
	private _abortController: AbortController | null = null;
	private _unsubscribeSelection: (() => void) | null = null;
	private _unsubscribeCommit: (() => void) | null = null;
	private readonly _continuation = new AutocompleteContinuationState();
	private _prefetchAbortController: AbortController | null = null;

	constructor(
		editor: Editor,
		config: AutocompleteExtensionConfig,
		services: { inlineCompletion: InlineCompletionController },
	) {
		this._editor = editor;
		this._inlineCompletion = services.inlineCompletion;
		this._model = config.model;
		this._debounceMs = config.debounceMs ?? DEFAULT_DEBOUNCE_MS;
		this._acceptanceStrategy = config.acceptanceStrategy ?? "full";
		this._staleAfterMs = config.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
		this._state.blockPolicy = {
			allowInCodeBlocks: true,
			allowInTables: false,
			deniedBlockTypes: ["database"],
			...config.blockPolicy,
		};
		this._maxPrefixChars =
			config.maxPrefixChars ?? DEFAULT_MAX_PREFIX_CHARS;
		this._maxSuffixChars =
			config.maxSuffixChars ?? DEFAULT_MAX_SUFFIX_CHARS;
		this._maxNeighborChars =
			config.maxNeighborChars ?? DEFAULT_MAX_NEIGHBOR_CHARS;
		this._maxProviderChars =
			config.maxProviderChars ?? DEFAULT_MAX_PROVIDER_CHARS;
		this._maxProviderTimeMs =
			config.maxProviderTimeMs ?? DEFAULT_MAX_PROVIDER_TIME_MS;
		this._prefetchAfterAccept =
			config.prefetchAfterAccept ?? DEFAULT_PREFETCH_AFTER_ACCEPT;
		this._providerRegistry = new AutocompleteProviderRegistry([
			...builtinAutocompleteProviders,
			...(config.providers ?? []),
		]);
		this._state.enabled = config.enabled ?? true;
		this._state.settings = {
			debounceMs: this._debounceMs,
			prefetchAfterAccept: this._prefetchAfterAccept,
			acceptanceStrategy: this._acceptanceStrategy,
			staleAfterMs: this._staleAfterMs,
		};

		this._unsubscribeSelection = this._editor.onSelectionChange(() => {
			if (this._shouldDismissForSelectionChange()) {
				this.dismiss("selection-change");
			}
		});
		this._unsubscribeCommit = this._editor.onDocumentCommit((event) => {
			if (!this._state.enabled) {
				return;
			}
			if (this._continuation.consumeAcceptedAiCommit(event.origin)) {
				return;
			}
			const originType = getOpOriginType(event.origin);
			if (originType !== "user" && originType !== "input-rule") {
				if (
					this._shouldDismissForExternalCommit(event.affectedBlocks)
				) {
					this.dismiss("external-edit");
				}
				return;
			}
			this.request();
		});
	}
}
