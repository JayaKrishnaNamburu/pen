import { foldAndNormalize } from "@input/pen-core";
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
	locale: string,
): string {
	return [
		scopeHash,
		candidate.kind,
		normalizeFingerprintText(candidate.originalText, locale),
		normalizeFingerprintText(candidate.replacementText, locale),
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

function normalizeFingerprintText(value: string, locale: string): string {
	return foldAndNormalize(value.trim().replace(/\s+/g, " "), locale);
}
