import { generateId } from "@input/pen-types";
import type { AutocompleteControllerHost } from "./autocompleteControllerHost";
import {
	clearVisibleSuggestionAfterAccept,
	startPrefetchForAcceptedContinuation,
	clearSequence,
} from "./autocompleteControllerContinuation";
import {
	buildContext,
	getFieldEditor,
	runRequest,
} from "./autocompleteControllerRequest";
import {
	areBlockPoliciesEqual,
	cloneAutocompleteControllerState,
	freezeAutocompleteControllerSnapshot,
	freezeAutocompleteControllerState,
} from "./autocompleteControllerSnapshots";
import {
	clearDebounceTimer,
	emit,
	getProviderDescriptorsSnapshot,
	invalidateForPolicyChange,
	invalidateProviderDescriptorsSnapshot,
	invalidateSnapshot,
	recordPolicyInvalidation,
	resolveCurrentBlockFailure,
	setBlockedReason,
	setState,
} from "./autocompleteControllerState";
import {
	logAutocompleteEvent,
	previewAutocompleteTextForLog,
} from "./autocompleteDebug";
import type { AutocompleteContextProvider } from "./providers/types";
import { materializeStructuredCandidateAcceptance } from "./structuredCandidate";
import type {
	AutocompleteBlockPolicy,
	AutocompleteControllerSnapshot,
	AutocompleteControllerState,
	AutocompleteDismissReason,
} from "./types";

export function destroy(controller: AutocompleteControllerHost): void {
	controller._unsubscribeSelection?.();
	controller._unsubscribeSelection = null;
	controller._unsubscribeCommit?.();
	controller._unsubscribeCommit = null;
	clearDebounceTimer(controller);
	controller._abortController?.abort();
	controller._abortController = null;
	controller._prefetchAbortController?.abort();
	controller._prefetchAbortController = null;
	controller._continuation.clearContinuations();
}

export function getSnapshot(
	controller: AutocompleteControllerHost,
): AutocompleteControllerSnapshot {
	if (controller._snapshot === null) {
		const state = cloneAutocompleteControllerState(controller._state);
		controller._snapshot = freezeAutocompleteControllerSnapshot({
			state: freezeAutocompleteControllerState(state),
			providerDescriptors: getProviderDescriptorsSnapshot(controller),
		});
	}
	return controller._snapshot;
}

export function getState(
	controller: AutocompleteControllerHost,
): AutocompleteControllerState {
	return getSnapshot(controller).state;
}

export function getBlockPolicy(
	controller: AutocompleteControllerHost,
): Readonly<AutocompleteBlockPolicy> {
	return getSnapshot(controller).state.blockPolicy;
}

export function subscribe(
	controller: AutocompleteControllerHost,
	listener: () => void,
): () => void {
	controller._listeners.add(listener);
	return () => controller._listeners.delete(listener);
}

export function setEnabled(
	controller: AutocompleteControllerHost,
	enabled: boolean,
): void {
	if (controller._state.enabled === enabled) {
		return;
	}
	controller._state = {
		...controller._state,
		enabled,
		status: enabled ? "idle" : "idle",
		activeRequestId: null,
	};
	invalidateSnapshot(controller);
	if (!enabled) {
		dismiss(controller, "disabled");
	}
	emit(controller);
}

export function request(
	controller: AutocompleteControllerHost,
	options?: { explicit?: boolean },
): boolean {
	if (!controller._state.enabled) {
		setBlockedReason(controller, "disabled");
		return false;
	}
	if (!controller._model) {
		setBlockedReason(controller, "missing-model");
		return false;
	}
	// Validate that autocomplete is currently eligible, but defer reading the
	// exact caret context until the debounced request actually runs.
	if (!buildContext(controller)) {
		return false;
	}
	dismiss(controller, "request-replaced");
	const requestId = generateId();
	setState(controller, {
		status: "scheduled",
		activeRequestId: requestId,
		metrics: {
			...controller._state.metrics,
			requestCount: controller._state.metrics.requestCount + 1,
			explicitTabTriggerCount:
				controller._state.metrics.explicitTabTriggerCount +
				(options?.explicit ? 1 : 0),
		},
		diagnostics: {
			...controller._state.diagnostics,
			lastBlockedReason: null,
			lastPolicyInvalidationStage: null,
		},
	});
	clearDebounceTimer(controller);
	const delay = options?.explicit ? 0 : controller._debounceMs;
	logAutocompleteEvent("request scheduled", {
		requestId,
		explicit: options?.explicit ?? false,
		debounceMs: delay,
	});
	controller._debounceTimer = setTimeout(() => {
		void runRequest(controller, requestId);
	}, delay);
	return true;
}

export function acceptVisibleSuggestion(
	controller: AutocompleteControllerHost,
): boolean {
	const sequence = controller._continuation.sequence;
	if (!sequence || !hasVisibleSuggestion(controller)) {
		return false;
	}
	const policyFailure = resolveCurrentBlockFailure(
		controller,
		sequence.blockId,
	);
	if (policyFailure) {
		recordPolicyInvalidation(controller, policyFailure, "showing");
		return false;
	}
	return acceptFullVisibleSuggestion(controller, {
		activateContinuation: true,
	});
}

export function acceptFullVisibleSuggestion(
	controller: AutocompleteControllerHost,
	options?: {
		activateContinuation?: boolean;
	},
): boolean {
	const sequence = controller._continuation.sequence;
	if (!sequence) {
		return false;
	}
	const candidate = sequence.candidate;
	if (
		candidate.inlineText.length === 0 &&
		candidate.previewBlocks.length === 0
	) {
		dismiss(controller);
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
		appendedBlockTypes: candidate.appendedBlocks.map((block) => block.type),
		opTypes: acceptanceResult.ops.map((op) => op.type),
		nextCaretBlockId: acceptanceResult.selection.blockId,
		nextCaretOffset: acceptanceResult.selection.offset,
	});
	controller._continuation.beginAcceptingSequenceSegment();
	controller._editor.apply(acceptanceResult.ops, {
		origin: { type: "ai", groupId: requestId },
		undoGroupId: requestId,
	});
	const acceptedBlock = controller._editor.getBlock(blockId);
	const firstNextBlock = acceptedBlock?.next ?? null;
	const secondNextBlock = firstNextBlock?.next ?? null;
	logAutocompleteEvent(
		`accept applied summary requestId=${requestId} appendedBlockCount=${candidate.appendedBlocks.length} opTypes=${acceptanceResult.ops.map((op) => op.type).join(",")} currentBlockType=${acceptedBlock?.type ?? "missing"} currentBlockText=${previewAutocompleteTextForLog(acceptedBlock?.textContent() ?? "")} nextBlockType=${firstNextBlock?.type ?? "none"} nextBlockText=${previewAutocompleteTextForLog(firstNextBlock?.textContent() ?? "")} nextNextBlockType=${secondNextBlock?.type ?? "none"} nextNextBlockText=${previewAutocompleteTextForLog(secondNextBlock?.textContent() ?? "")}`,
	);
	const nextCaretBlockId = acceptanceResult.selection.blockId;
	const nextCaretOffset = acceptanceResult.selection.offset;
	setState(controller, {
		metrics: {
			...controller._state.metrics,
			acceptCount: controller._state.metrics.acceptCount + 1,
		},
	});
	const fieldEditor = getFieldEditor(controller);
	controller._editor.selectText(
		nextCaretBlockId,
		nextCaretOffset,
		nextCaretOffset,
	);
	if (fieldEditor) {
		const programmaticFieldEditor = fieldEditor as typeof fieldEditor & {
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
		} else if (typeof fieldEditor.activateTextSelection === "function") {
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

	if (options?.activateContinuation && controller._prefetchAfterAccept) {
		controller._continuation.setPendingAcceptedContinuation({
			sourceRequestId: requestId,
			blockId: nextCaretBlockId,
			startOffset: nextCaretOffset,
			continuationDepth,
		});
		clearVisibleSuggestionAfterAccept(controller);
		startPrefetchForAcceptedContinuation(controller, {
			sourceRequestId: requestId,
			blockId: nextCaretBlockId,
			startOffset: nextCaretOffset,
			continuationDepth,
		});
	} else {
		dismiss(controller, "accept");
	}
	return true;
}

export function hasVisibleSuggestion(
	controller: AutocompleteControllerHost,
): boolean {
	return (
		controller._continuation.sequence !== null &&
		controller._state.visibleSuggestionId !== null
	);
}

export function registerProvider(
	controller: AutocompleteControllerHost,
	provider: AutocompleteContextProvider,
): () => void {
	const unregister = controller._providerRegistry.registerProvider(provider);
	invalidateProviderDescriptorsSnapshot(controller);
	emit(controller);
	return () => {
		unregister();
		invalidateProviderDescriptorsSnapshot(controller);
		emit(controller);
	};
}

export function listProviderDescriptors(
	controller: AutocompleteControllerHost,
) {
	return getSnapshot(controller).providerDescriptors;
}

export function updateRuntimeSettings(
	controller: AutocompleteControllerHost,
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
		nextDebounceMs !== controller._debounceMs
	) {
		controller._debounceMs = nextDebounceMs;
		changed = true;
	}

	if (
		typeof nextPrefetchAfterAccept === "boolean" &&
		nextPrefetchAfterAccept !== controller._prefetchAfterAccept
	) {
		controller._prefetchAfterAccept = nextPrefetchAfterAccept;
		if (!nextPrefetchAfterAccept) {
			controller._prefetchAbortController?.abort();
			controller._prefetchAbortController = null;
			controller._continuation.clearContinuations();
		}
		changed = true;
	}

	if (
		nextAcceptanceStrategy === "full" &&
		nextAcceptanceStrategy !== controller._acceptanceStrategy
	) {
		controller._acceptanceStrategy = nextAcceptanceStrategy;
		changed = true;
	}

	const nextStaleAfterMs = settings.staleAfterMs;
	if (
		typeof nextStaleAfterMs === "number" &&
		Number.isFinite(nextStaleAfterMs) &&
		nextStaleAfterMs >= 0 &&
		nextStaleAfterMs !== controller._staleAfterMs
	) {
		controller._staleAfterMs = nextStaleAfterMs;
		changed = true;
	}

	if (!changed) {
		return;
	}

	setState(controller, {
		settings: {
			debounceMs: controller._debounceMs,
			prefetchAfterAccept: controller._prefetchAfterAccept,
			acceptanceStrategy: controller._acceptanceStrategy,
			staleAfterMs: controller._staleAfterMs,
		},
	});
}

export function updateBlockPolicy(
	controller: AutocompleteControllerHost,
	policy: Partial<AutocompleteBlockPolicy>,
): void {
	const nextPolicy: AutocompleteBlockPolicy = {
		...controller._state.blockPolicy,
		...policy,
	};
	if (areBlockPoliciesEqual(controller._state.blockPolicy, nextPolicy)) {
		return;
	}
	setState(controller, {
		blockPolicy: nextPolicy,
	});
	invalidateForPolicyChange(controller);
}

export function dismiss(
	controller: AutocompleteControllerHost,
	reason: AutocompleteDismissReason = "external-edit",
): void {
	clearDebounceTimer(controller);
	const cancelledRequest =
		controller._state.status === "scheduled" ||
		controller._state.status === "requesting";
	controller._abortController?.abort();
	controller._abortController = null;
	controller._prefetchAbortController?.abort();
	controller._prefetchAbortController = null;
	clearSequence(controller);
	controller._continuation.clearContinuations();
	setState(controller, {
		status: "idle",
		activeRequestId: null,
		visibleSuggestionId: null,
		metrics: {
			...controller._state.metrics,
			cancelCount:
				controller._state.metrics.cancelCount +
				(cancelledRequest ? 1 : 0),
		},
		diagnostics: {
			...controller._state.diagnostics,
			lastDismissReason: reason,
		},
	});
	controller._inlineCompletion.dismissSuggestion();
}
