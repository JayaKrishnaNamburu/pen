import type { AISuggestionCandidate } from "./types";

export interface CachedAnalysisResult {
	scopeHash: string;
	candidates: readonly AISuggestionCandidate[];
	createdAt: number;
}

export function buildSuggestionFingerprint(
	scopeHash: string,
	candidate: Pick<
		AISuggestionCandidate,
		"kind" | "originalText" | "replacementText"
	>,
): string {
	return [
		scopeHash,
		candidate.kind,
		normalizeFingerprintText(candidate.originalText),
		normalizeFingerprintText(candidate.replacementText),
	].join("::");
}

export function isCacheEntryFresh(
	entry: CachedAnalysisResult,
	cacheTtlMs: number,
	now = Date.now(),
): boolean {
	return now - entry.createdAt <= cacheTtlMs;
}

export function isDismissFingerprintActive(
	dismissedAt: number,
	dismissMemoryMs: number,
	now = Date.now(),
): boolean {
	return now - dismissedAt <= dismissMemoryMs;
}

function normalizeFingerprintText(value: string): string {
	return value.trim().replace(/\s+/g, " ").toLowerCase();
}
