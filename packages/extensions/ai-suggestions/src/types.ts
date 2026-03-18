import type { Editor, ModelAdapter, Unsubscribe } from "@pen/types";

export type AISuggestionKind =
	| "spelling"
	| "grammar"
	| "rephrase"
	| "clarity";

export interface AISuggestion {
	id: string;
	kind: AISuggestionKind;
	title: string;
	blockId: string;
	from: number;
	to: number;
	originalText: string;
	replacementText: string;
	reason?: string;
	confidence?: number;
	scopeId: string;
	scopeHash: string;
	createdAt: number;
	invalidated: boolean;
}

export interface AISuggestionCandidate {
	kind: AISuggestionKind;
	title: string;
	originalText: string;
	replacementText: string;
	reason?: string;
	confidence?: number;
}

export interface AISuggestionScope {
	id: string;
	blockId: string;
	blockType: string | null;
	text: string;
	from: number;
	to: number;
	hash: string;
	documentGeneration: number;
	blockRevision: number;
}

export interface AISuggestionGroup {
	id: string;
	blockId: string;
	suggestionIds: readonly string[];
	kind: AISuggestionKind | "mixed";
	title: string;
	from: number;
	to: number;
}

export interface AISuggestionsMetrics {
	requestCount: number;
	successCount: number;
	errorCount: number;
	cancelCount: number;
	cacheHitCount: number;
	dismissedRepeatDropCount: number;
	suggestionShownCount: number;
	suggestionAppliedCount: number;
	suggestionDismissedCount: number;
	promptTokens: number;
	completionTokens: number;
}

export interface AISuggestionsState {
	enabled: boolean;
	status: "idle" | "scheduled" | "requesting";
	activeRequestId: string | null;
	activeSuggestionId: string | null;
	activeSuggestionGroupId: string | null;
	suggestions: readonly AISuggestion[];
	groups: readonly AISuggestionGroup[];
	metrics: AISuggestionsMetrics;
}

export interface AISuggestionsBlockPolicy {
	allowedBlockTypes?: readonly string[];
	deniedBlockTypes?: readonly string[];
}

export interface AISuggestionsAnalyzerResult {
	candidates: readonly AISuggestionCandidate[];
	usage?: {
		promptTokens?: number;
		completionTokens?: number;
	};
}

export interface AISuggestionsAnalyzer {
	analyze(input: {
		editor: Editor;
		scope: AISuggestionScope;
		contextBefore: string;
		contextAfter: string;
		signal?: AbortSignal;
	}): Promise<AISuggestionsAnalyzerResult>;
}

export type AISuggestionsMode = "cheap" | "balanced" | "aggressive";

export interface AISuggestionsExtensionConfig {
	mode?: AISuggestionsMode;
	model?: ModelAdapter;
	analyzer?: AISuggestionsAnalyzer;
	enabled?: boolean;
	debounceMs?: number;
	minChangedChars?: number;
	minStableMs?: number;
	cooldownMs?: number;
	maxScopeChars?: number;
	maxSuggestionsPerScope?: number;
	cacheTtlMs?: number;
	dismissMemoryMs?: number;
	minConfidence?: number;
	groupGapChars?: number;
	blockPolicy?: AISuggestionsBlockPolicy;
}

export interface AISuggestionsController {
	getState(): AISuggestionsState;
	getSuggestionGroups(): readonly AISuggestionGroup[];
	subscribe(listener: () => void): Unsubscribe;
	getRuntimeSettings(): AISuggestionsExtensionConfig;
	updateRuntimeSettings(
		patch: Partial<Omit<AISuggestionsExtensionConfig, "model" | "analyzer" | "blockPolicy">>,
	): AISuggestionsExtensionConfig;
	setEnabled(enabled: boolean): void;
	setActiveSuggestion(id: string | null): void;
	setActiveSuggestionGroup(id: string | null): void;
	request(options?: { force?: boolean; blockId?: string | null }): boolean;
	applySuggestion(id: string): boolean;
	applySuggestionGroup(id: string): number;
	dismissSuggestion(id: string): boolean;
	dismissSuggestionGroup(id: string): number;
	dismissAllInBlock(blockId: string): number;
	clearInvalidSuggestions(): void;
	handleDocumentCommit(
		event: import("@pen/types").DocumentCommitEvent,
	): void;
	destroy(): void;
}
