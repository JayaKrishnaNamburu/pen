import type {
	AISuggestionsExtensionConfig,
	AISuggestionsMode,
} from "./types";

const PRESET_CONFIG: Record<
	AISuggestionsMode,
	Omit<AISuggestionsExtensionConfig, "mode" | "model" | "analyzer" | "enabled" | "blockPolicy">
> = {
	cheap: {
		debounceMs: 1600,
		minChangedChars: 18,
		minStableMs: 1000,
		cooldownMs: 15_000,
		maxScopeChars: 220,
		maxSuggestionsPerScope: 2,
		cacheTtlMs: 8 * 60_000,
		dismissMemoryMs: 15 * 60_000,
		minConfidence: 0.9,
		groupGapChars: 2,
	},
	balanced: {
		debounceMs: 1200,
		minChangedChars: 12,
		minStableMs: 800,
		cooldownMs: 10_000,
		maxScopeChars: 320,
		maxSuggestionsPerScope: 3,
		cacheTtlMs: 5 * 60_000,
		dismissMemoryMs: 10 * 60_000,
		minConfidence: 0.8,
		groupGapChars: 3,
	},
	aggressive: {
		debounceMs: 800,
		minChangedChars: 8,
		minStableMs: 500,
		cooldownMs: 5_000,
		maxScopeChars: 420,
		maxSuggestionsPerScope: 4,
		cacheTtlMs: 3 * 60_000,
		dismissMemoryMs: 8 * 60_000,
		minConfidence: 0.7,
		groupGapChars: 4,
	},
};

export function resolveAISuggestionsConfig(
	config: AISuggestionsExtensionConfig = {},
): AISuggestionsExtensionConfig {
	const mode = config.mode ?? "balanced";

	return {
		...PRESET_CONFIG[mode],
		...config,
		mode,
	};
}
