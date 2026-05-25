import { FIELD_EDITOR_SLOT_KEY } from "@pen/types";
import type { DocumentCommitEvent, Editor, FieldEditor } from "@pen/types";
import { buildApplySuggestionOps } from "./apply";
import {
	buildSuggestionFingerprint,
	type CachedAnalysisResult,
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
import { AISuggestionScheduler } from "./scheduler";
import { buildSuggestionScope } from "./scopeBuilder";
import { rangesOverlap } from "./controllerUtils";
import type {
	AISuggestion,
	AISuggestionCandidate,
	AISuggestionGroup,
	AISuggestionsController,
	AISuggestionsExtensionConfig,
	AISuggestionsMetrics,
	AISuggestionsState,
} from "./types";

type StatePatch = Omit<Partial<AISuggestionsState>, "metrics"> & {
	metrics?: Partial<AISuggestionsMetrics>;
};

const INITIAL_METRICS: AISuggestionsMetrics = {
	requestCount: 0,
	successCount: 0,
	errorCount: 0,
	cancelCount: 0,
	cacheHitCount: 0,
	dismissedRepeatDropCount: 0,
	suggestionShownCount: 0,
	suggestionAppliedCount: 0,
	suggestionDismissedCount: 0,
	promptTokens: 0,
	completionTokens: 0,
};

export interface AISuggestionsControllerImpl {
	runAnalysis(
		requestId: string,
		builtScope: import("./scopeBuilder").BuiltSuggestionScope,
		signal: AbortSignal,
	): Promise<void>;
	filterCandidatesForDisplay(
	scopeHash: string,
	candidates: readonly AISuggestionCandidate[],
): readonly AISuggestionCandidate[];
	replaceSuggestionsForBlock(
	blockId: string,
	nextSuggestions: readonly AISuggestion[],
	patch?: StatePatch,
): void;
	replaceAllSuggestions(
	nextSuggestions: readonly AISuggestion[],
	patch?: StatePatch,
): void;
	setState(
		patch: StatePatch,
	): void;
	emit(shouldRefreshDecorations?: boolean): void;
	pruneMemory(): void;
	isEditorReadyForSuggestions(): boolean;
	isRequesting(): boolean;
	resolveForcedDirtyBlock(
		blockId: string | null | undefined,
	): ReturnType<AISuggestionScheduler["consumeNextReadyBlock"]>;
}

export class AISuggestionsControllerImpl implements AISuggestionsController {
	private readonly editor: Editor;
	private readonly config: AISuggestionsExtensionConfig;
	private readonly listeners = new Set<() => void>();
	private readonly scheduler: AISuggestionScheduler;
	private readonly analysisCache = new Map<string, CachedAnalysisResult>();
	private readonly dismissedFingerprints = new Map<string, number>();
	private abortController: AbortController | null = null;
	private state: AISuggestionsState;

	constructor(editor: Editor, config: AISuggestionsExtensionConfig = {}) {
		this.editor = editor;
		this.config = config;
		this.state = {
			enabled: config.enabled ?? true,
			status: "idle",
			activeRequestId: null,
			activeSuggestionId: null,
			activeSuggestionGroupId: null,
			suggestions: [],
			groups: [],
			metrics: { ...INITIAL_METRICS },
		};
		this.scheduler = new AISuggestionScheduler(editor, config, {
			onScheduledChange: (scheduled) => {
				if (!this.state.enabled) {
					return;
				}
				this.setState({
					status: scheduled ? "scheduled" : this.isRequesting() ? "requesting" : "idle",
				});
			},
		});
	}

	getState(): AISuggestionsState {
		return this.state;
	}

	getSuggestionGroups(): readonly AISuggestionGroup[] {
		return this.state.groups;
	}

	getRuntimeSettings(): AISuggestionsExtensionConfig {
		return { ...this.config };
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	updateRuntimeSettings(
		patch: Partial<
			Omit<AISuggestionsExtensionConfig, "model" | "analyzer" | "blockPolicy">
		>,
	): AISuggestionsExtensionConfig {
		Object.assign(this.config, patch);
		this.emit(false);
		return this.getRuntimeSettings();
	}

	setEnabled(enabled: boolean): void {
		if (this.state.enabled === enabled) {
			return;
		}

		if (!enabled) {
			const wasRequesting = this.isRequesting();
			this.abortController?.abort();
			this.abortController = null;
			this.scheduler.reset();
			this.replaceAllSuggestions([], {
				enabled: false,
				status: "idle",
				activeRequestId: null,
				activeSuggestionId: null,
				activeSuggestionGroupId: null,
				metrics: wasRequesting
					? {
							cancelCount: this.state.metrics.cancelCount + 1,
						}
					: undefined,
			});
			return;
		}

		this.setState({
			enabled: true,
			status: this.scheduler.hasDirtyBlocks()
				? "scheduled"
				: this.isRequesting()
					? "requesting"
					: "idle",
		});
	}

	setActiveSuggestion(id: string | null): void {
		if (this.state.activeSuggestionId === id) {
			return;
		}

		const activeGroupId =
			id == null
				? null
				: this.state.groups.find((group) => group.suggestionIds.includes(id))?.id ??
					null;

		this.setState({
			activeSuggestionId: id,
			activeSuggestionGroupId: activeGroupId,
		});
	}

	setActiveSuggestionGroup(id: string | null): void {
		if (this.state.activeSuggestionGroupId === id) {
			return;
		}

		const firstSuggestionId =
			id == null
				? null
				: this.state.groups.find((group) => group.id === id)?.suggestionIds[0] ?? null;

		this.setState({
			activeSuggestionGroupId: id,
			activeSuggestionId: firstSuggestionId,
		});
	}

	request(options?: { force?: boolean; blockId?: string | null }): boolean {
		if (
			!this.state.enabled ||
			(!options?.force && !this.isEditorReadyForSuggestions())
		) {
			return false;
		}

		const ready = options?.force
			? this.resolveForcedDirtyBlock(options.blockId)
			: this.scheduler.consumeNextReadyBlock();
		if (!ready) {
			if (!this.isRequesting()) {
				this.setState({
					status: this.scheduler.hasDirtyBlocks() ? "scheduled" : "idle",
				});
			}
			return false;
		}

		const builtScope = buildSuggestionScope(this.editor, ready.state, this.config);
		if (!builtScope) {
			this.setState({
				status: this.scheduler.hasDirtyBlocks() ? "scheduled" : "idle",
			});
			return false;
		}

		this.pruneMemory();
		const cacheTtlMs = this.config.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
		const cached = this.analysisCache.get(builtScope.scope.hash);
		if (cached && isCacheEntryFresh(cached, cacheTtlMs)) {
			const cachedCandidates = this.filterCandidatesForDisplay(
				builtScope.scope.hash,
				cached.candidates,
			);
			const suggestions = materializeSuggestionsFromCandidates({
				blockId: builtScope.scope.blockId,
				scopeId: builtScope.scope.id,
				scopeHash: builtScope.scope.hash,
				scopeText: builtScope.scope.text,
				scopeFrom: builtScope.scope.from,
				candidates: cachedCandidates,
			});

			this.replaceSuggestionsForBlock(builtScope.scope.blockId, suggestions, {
				status: this.scheduler.hasDirtyBlocks() ? "scheduled" : "idle",
				activeSuggestionId: suggestions[0]?.id ?? null,
				metrics: {
					cacheHitCount: this.state.metrics.cacheHitCount + 1,
					suggestionShownCount:
						this.state.metrics.suggestionShownCount + suggestions.length,
				},
			});
			return true;
		}

		this.abortController?.abort();
		this.abortController = new AbortController();
		const requestId = crypto.randomUUID();

		this.setState({
			status: "requesting",
			activeRequestId: requestId,
			metrics: {
				...this.state.metrics,
				requestCount: this.state.metrics.requestCount + 1,
			},
		});

		void this.runAnalysis(requestId, builtScope, this.abortController.signal);
		return true;
	}

	applySuggestion(id: string): boolean {
		const suggestion = this.state.suggestions.find(
			(item) => item.id === id && !item.invalidated,
		);
		if (!suggestion) {
			return false;
		}

		const ops = buildApplySuggestionOps(this.editor, suggestion);
		if (ops.length === 0) {
			return false;
		}

		this.editor.apply(ops, {
			origin: "ai",
			undoGroup: true,
		});

		const nextSuggestions = this.state.suggestions.filter(
			(item) =>
				item.blockId !== suggestion.blockId ||
				!rangesOverlap(item.from, item.to, suggestion.from, suggestion.to),
		);

		this.replaceAllSuggestions(nextSuggestions, {
			activeSuggestionId: null,
			activeSuggestionGroupId: null,
			metrics: {
				suggestionAppliedCount:
					this.state.metrics.suggestionAppliedCount + 1,
			},
		});
		return true;
	}

	applySuggestionGroup(id: string): number {
		const group = this.state.groups.find((item) => item.id === id);
		if (!group) {
			return 0;
		}

		const suggestions = group.suggestionIds
			.map((suggestionId) =>
				this.state.suggestions.find((item) => item.id === suggestionId) ?? null,
			)
			.filter(Boolean)
			.sort((left, right) => (right?.from ?? 0) - (left?.from ?? 0));

		let appliedCount = 0;
		for (const suggestion of suggestions) {
			if (suggestion && this.applySuggestion(suggestion.id)) {
				appliedCount += 1;
			}
		}
		return appliedCount;
	}

	dismissSuggestion(id: string): boolean {
		const suggestion = this.state.suggestions.find((item) => item.id === id);
		if (!suggestion) {
			return false;
		}

		this.dismissedFingerprints.set(
			buildSuggestionFingerprint(suggestion.scopeHash, {
				kind: suggestion.kind,
				originalText: suggestion.originalText,
				replacementText: suggestion.replacementText,
			}),
			Date.now(),
		);

		this.replaceAllSuggestions(
			this.state.suggestions.filter((item) => item.id !== id),
			{
				activeSuggestionId: null,
				activeSuggestionGroupId: null,
				metrics: {
					suggestionDismissedCount:
						this.state.metrics.suggestionDismissedCount + 1,
				},
			},
		);
		return true;
	}

	dismissSuggestionGroup(id: string): number {
		const group = this.state.groups.find((item) => item.id === id);
		if (!group) {
			return 0;
		}

		let dismissedCount = 0;
		for (const suggestionId of group.suggestionIds) {
			if (this.dismissSuggestion(suggestionId)) {
				dismissedCount += 1;
			}
		}
		return dismissedCount;
	}

	dismissAllInBlock(blockId: string): number {
		const removedCount = this.state.suggestions.filter(
			(suggestion) => suggestion.blockId === blockId,
		).length;
		if (removedCount === 0) {
			return 0;
		}

		this.replaceAllSuggestions(
			this.state.suggestions.filter((suggestion) => suggestion.blockId !== blockId),
			{
				activeSuggestionId: null,
				activeSuggestionGroupId: null,
				metrics: {
					suggestionDismissedCount:
						this.state.metrics.suggestionDismissedCount + removedCount,
				},
			},
		);
		return removedCount;
	}

	clearInvalidSuggestions(): void {
		const nextSuggestions = this.state.suggestions.filter(
			(suggestion) => !suggestion.invalidated,
		);
		if (nextSuggestions.length === this.state.suggestions.length) {
			return;
		}

		this.replaceAllSuggestions(nextSuggestions, {
			activeSuggestionId: nextSuggestions.some(
				(suggestion) => suggestion.id === this.state.activeSuggestionId,
			)
				? this.state.activeSuggestionId
				: null,
			activeSuggestionGroupId: nextSuggestions.some((suggestion) =>
				this.state.groups
					.find((group) => group.id === this.state.activeSuggestionGroupId)
					?.suggestionIds.includes(suggestion.id),
			)
				? this.state.activeSuggestionGroupId
				: null,
		});
	}

	handleDocumentCommit(event: DocumentCommitEvent): void {
		if (event.origin !== "user" && event.origin !== "input-rule") {
			return;
		}

		const affectedBlockIds = new Set(event.affectedBlocks);
		let changed = false;
		const nextSuggestions = this.state.suggestions.map((suggestion) => {
			if (!affectedBlockIds.has(suggestion.blockId) || suggestion.invalidated) {
				return suggestion;
			}
			changed = true;
			return {
				...suggestion,
				invalidated: true,
			};
		});

		if (changed) {
			this.replaceAllSuggestions(nextSuggestions);
		}

		this.scheduler.markDirty(event, () => {
			void Promise.resolve().then(() => {
				this.request();
			});
		});
	}

	destroy(): void {
		this.abortController?.abort();
		this.abortController = null;
		this.scheduler.destroy();
		this.analysisCache.clear();
		this.dismissedFingerprints.clear();
		this.listeners.clear();
	}

}
