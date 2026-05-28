import { FIELD_EDITOR_SLOT_KEY } from "@pen/types";
import type { DocumentCommitEvent, Editor, FieldEditor } from "@pen/types";
import type { CachedAnalysisResult } from "./cache";
import {
	buildSuggestionFingerprint,
	isCacheEntryFresh,
	isDismissFingerprintActive,
} from "./cache";
import {
	DEFAULT_CACHE_TTL_MS,
	DEFAULT_DISMISS_MEMORY_MS,
	DEFAULT_MAX_SUGGESTIONS_PER_SCOPE,
	DEFAULT_MIN_CONFIDENCE,
} from "./constants";
import { buildSuggestionGroups } from "./grouping";
import { materializeSuggestionsFromCandidates } from "./matcher";
import { analyzeSuggestionScope } from "./analyzer";
import type { AISuggestionScheduler } from "./scheduler";
import type {
	AISuggestion,
	AISuggestionCandidate,
	AISuggestionsExtensionConfig,
	AISuggestionsMetrics,
	AISuggestionsState,
} from "./types";
import { AISuggestionsControllerImpl } from "./controllerCore";
import {
	compareCandidatesForDisplay,
	rangesOverlap,
	resolvePreferredOffset,
	resolveSelectedBlockId,
} from "./controllerUtils";

type StatePatch = Omit<Partial<AISuggestionsState>, "metrics"> & {
	metrics?: Partial<AISuggestionsMetrics>;
};

type AISuggestionsControllerRuntime = {
	[key: string]: any;
	editor: Editor;
	config: AISuggestionsExtensionConfig;
	listeners: Set<() => void>;
	scheduler: AISuggestionScheduler;
	analysisCache: Map<string, CachedAnalysisResult>;
	dismissedFingerprints: Map<string, number>;
	abortController: AbortController | null;
	state: AISuggestionsState;
};

type AISuggestionsControllerRuntimePrototype = Record<string, unknown>;

const ControllerPrototype = AISuggestionsControllerImpl.prototype as unknown as AISuggestionsControllerRuntimePrototype;

ControllerPrototype.runAnalysis = async function runAnalysis(this: AISuggestionsControllerRuntime, 
	requestId: string,
	builtScope: import("./scopeBuilder").BuiltSuggestionScope,
	signal: AbortSignal,
): Promise<void> {
	try {
		const result = await analyzeSuggestionScope({
			editor: this.editor,
			scope: builtScope,
			config: this.config,
			signal,
		});

		if (signal.aborted || this.state.activeRequestId !== requestId) {
			if (!signal.aborted) {
				this.setState({
					metrics: {
						...this.state.metrics,
						cancelCount: this.state.metrics.cancelCount + 1,
					},
				});
			}
			return;
		}

		this.analysisCache.set(builtScope.scope.hash, {
			scopeHash: builtScope.scope.hash,
			candidates: result.candidates,
			createdAt: Date.now(),
		});

		const filteredCandidates = this.filterCandidatesForDisplay(
			builtScope.scope.hash,
			result.candidates,
		);
		const suggestions = materializeSuggestionsFromCandidates({
			blockId: builtScope.scope.blockId,
			scopeId: builtScope.scope.id,
			scopeHash: builtScope.scope.hash,
			scopeText: builtScope.scope.text,
			scopeFrom: builtScope.scope.from,
			candidates: filteredCandidates,
		});

		this.replaceSuggestionsForBlock(builtScope.scope.blockId, suggestions, {
			status: this.scheduler.hasDirtyBlocks() ? "scheduled" : "idle",
			activeRequestId: null,
			activeSuggestionId: suggestions[0]?.id ?? null,
			activeSuggestionGroupId: null,
			metrics: {
				successCount: this.state.metrics.successCount + 1,
				suggestionShownCount:
					this.state.metrics.suggestionShownCount + suggestions.length,
				promptTokens:
					this.state.metrics.promptTokens + result.usage.promptTokens,
				completionTokens:
					this.state.metrics.completionTokens + result.usage.completionTokens,
			},
		});
	} catch (error) {
		if (!signal.aborted) {
			this.setState({
				status: this.scheduler.hasDirtyBlocks() ? "scheduled" : "idle",
				activeRequestId: null,
				metrics: {
					...this.state.metrics,
					errorCount: this.state.metrics.errorCount + 1,
				},
			});
		}
	}
}
;
ControllerPrototype.filterCandidatesForDisplay = function filterCandidatesForDisplay(this: AISuggestionsControllerRuntime, 
	scopeHash: string,
	candidates: readonly AISuggestionCandidate[],
): readonly AISuggestionCandidate[] {
	const minConfidence = this.config.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
	const dismissMemoryMs =
		this.config.dismissMemoryMs ?? DEFAULT_DISMISS_MEMORY_MS;

	const nextCandidates: AISuggestionCandidate[] = [];
	let dismissedRepeatDropCount = 0;

	for (const candidate of candidates) {
		if (
			typeof candidate.confidence === "number" &&
			candidate.confidence < minConfidence
		) {
			continue;
		}

		const fingerprint = buildSuggestionFingerprint(scopeHash, candidate);
		const dismissedAt = this.dismissedFingerprints.get(fingerprint);
		if (
			typeof dismissedAt === "number" &&
			isDismissFingerprintActive(dismissedAt, dismissMemoryMs)
		) {
			dismissedRepeatDropCount += 1;
			continue;
		}

		nextCandidates.push(candidate);
	}

	nextCandidates.sort(compareCandidatesForDisplay);

	const maxSuggestionsPerScope =
		this.config.maxSuggestionsPerScope ?? DEFAULT_MAX_SUGGESTIONS_PER_SCOPE;
	const limitedCandidates = nextCandidates.slice(0, maxSuggestionsPerScope);

	if (dismissedRepeatDropCount > 0) {
		this.setState({
			metrics: {
				...this.state.metrics,
				dismissedRepeatDropCount:
					this.state.metrics.dismissedRepeatDropCount + dismissedRepeatDropCount,
			},
		});
	}

	return limitedCandidates;
}
;
ControllerPrototype.replaceSuggestionsForBlock = function replaceSuggestionsForBlock(this: AISuggestionsControllerRuntime, 
	blockId: string,
	nextSuggestions: readonly AISuggestion[],
	patch?: StatePatch,
): void {
	this.replaceAllSuggestions(
		[
			...this.state.suggestions.filter((suggestion) => suggestion.blockId !== blockId),
			...nextSuggestions,
		],
		patch,
	);
}
;
ControllerPrototype.replaceAllSuggestions = function replaceAllSuggestions(this: AISuggestionsControllerRuntime, 
	nextSuggestions: readonly AISuggestion[],
	patch?: StatePatch,
): void {
	const groups = buildSuggestionGroups(nextSuggestions, this.config);
	const hasActiveSuggestionPatch =
		patch != null &&
		Object.prototype.hasOwnProperty.call(patch, "activeSuggestionId");
	const hasActiveGroupPatch =
		patch != null &&
		Object.prototype.hasOwnProperty.call(patch, "activeSuggestionGroupId");
	const nextActiveSuggestionId = hasActiveSuggestionPatch
		? (patch?.activeSuggestionId ?? null)
		: this.state.activeSuggestionId;
	const activeGroupId =
		hasActiveGroupPatch
			? (patch?.activeSuggestionGroupId ?? null)
			: groups.find((group) =>
					nextActiveSuggestionId != null
						? group.suggestionIds.includes(nextActiveSuggestionId)
						: false,
				)?.id ?? null;

	this.setState({
		...patch,
		suggestions: nextSuggestions,
		groups,
		activeSuggestionId: nextActiveSuggestionId,
		activeSuggestionGroupId: activeGroupId,
	});
}
;
ControllerPrototype.setState = function setState(this: AISuggestionsControllerRuntime, 
	patch: StatePatch,
): void {
	const previousState = this.state;
	const nextState = {
		...this.state,
		...patch,
		metrics: patch.metrics
			? {
					...this.state.metrics,
					...patch.metrics,
				}
			: this.state.metrics,
	};
	this.state = nextState;
	this.emit(
		previousState.suggestions !== nextState.suggestions ||
			previousState.groups !== nextState.groups ||
			previousState.activeSuggestionId !== nextState.activeSuggestionId,
	);
}
;
ControllerPrototype.emit = function emit(this: AISuggestionsControllerRuntime, shouldRefreshDecorations = true): void {
	if (shouldRefreshDecorations) {
		this.editor.requestDecorationUpdate();
	}
	for (const listener of this.listeners) {
		listener();
	}
}
;
ControllerPrototype.pruneMemory = function pruneMemory(this: AISuggestionsControllerRuntime): void {
	const cacheTtlMs = this.config.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
	const dismissMemoryMs =
		this.config.dismissMemoryMs ?? DEFAULT_DISMISS_MEMORY_MS;
	const now = Date.now();

	for (const [scopeHash, entry] of this.analysisCache) {
		if (!isCacheEntryFresh(entry, cacheTtlMs, now)) {
			this.analysisCache.delete(scopeHash);
		}
	}

	for (const [fingerprint, dismissedAt] of this.dismissedFingerprints) {
		if (!isDismissFingerprintActive(dismissedAt, dismissMemoryMs, now)) {
			this.dismissedFingerprints.delete(fingerprint);
		}
	}
}
;
ControllerPrototype.isEditorReadyForSuggestions = function isEditorReadyForSuggestions(this: AISuggestionsControllerRuntime): boolean {
	const fieldEditor =
		this.editor.internals.getSlot<FieldEditor>(FIELD_EDITOR_SLOT_KEY) ?? null;
	if (!fieldEditor) {
		return true;
	}
	return fieldEditor.isFocused && fieldEditor.isEditing && !fieldEditor.isComposing;
}
;
ControllerPrototype.isRequesting = function isRequesting(this: AISuggestionsControllerRuntime): boolean {
	return this.state.activeRequestId != null && this.state.status === "requesting";
}
;
ControllerPrototype.resolveForcedDirtyBlock = function resolveForcedDirtyBlock(this: AISuggestionsControllerRuntime, 
	blockId: string | null | undefined,
): { blockId: string; state: import("./scheduler").DirtyBlockState } | null {
	const targetBlockId =
		blockId ?? resolveSelectedBlockId(this.editor) ?? this.editor.firstBlock()?.id ?? null;
	if (!targetBlockId) {
		return null;
	}

	const block = this.editor.getBlock(targetBlockId);
	if (!block) {
		return null;
	}

	const text = block.textContent({ resolved: true });
	return {
		blockId: targetBlockId,
		state: {
			blockId: targetBlockId,
			firstChangedAt: Date.now(),
			lastChangedAt: Date.now(),
			changeCount: 1,
			changedCharsEstimate: Math.max(1, text.trim().length),
			lastRevision: this.editor.getBlockRevision(targetBlockId),
			lastChangedOffset: resolvePreferredOffset(this.editor, targetBlockId, text.length),
		},
	};
}
;
