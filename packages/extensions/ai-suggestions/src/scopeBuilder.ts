import type { Editor } from "@pen/types";
import { DEFAULT_MAX_SCOPE_CHARS } from "./constants";
import type { AISuggestionScope, AISuggestionsExtensionConfig } from "./types";
import type { DirtyBlockState } from "./scheduler";

export interface BuiltSuggestionScope {
	scope: AISuggestionScope;
	contextBefore: string;
	contextAfter: string;
}

const SENTENCE_BOUNDARY_REGEX = /(?<=[.!?])\s+/g;

export function buildSuggestionScope(
	editor: Editor,
	dirtyBlock: DirtyBlockState,
	config: AISuggestionsExtensionConfig = {},
): BuiltSuggestionScope | null {
	const block = editor.getBlock(dirtyBlock.blockId);
	if (!block) {
		return null;
	}

	const text = block.textContent({ resolved: true });
	if (!text.trim()) {
		return null;
	}

	const maxScopeChars = config.maxScopeChars ?? DEFAULT_MAX_SCOPE_CHARS;
	const anchorOffset = clampOffset(
		dirtyBlock.lastChangedOffset ?? text.length,
		text.length,
	);
	const sentenceRange = findSentenceRange(text, anchorOffset);
	const boundedRange = clampRangeToMaxChars(text, sentenceRange, maxScopeChars);
	const targetText = text.slice(boundedRange.from, boundedRange.to);
	if (!targetText.trim()) {
		return null;
	}

	const contextRadius = Math.floor(maxScopeChars / 2);

	return {
		scope: {
			id: crypto.randomUUID(),
			blockId: block.id,
			blockType: block.type ?? null,
			text: targetText,
			from: boundedRange.from,
			to: boundedRange.to,
			hash: `${block.id}:${normalizeScopeText(targetText)}`,
			documentGeneration: editor.documentState.generation,
			blockRevision: editor.getBlockRevision(block.id),
		},
		contextBefore: text.slice(
			Math.max(0, boundedRange.from - contextRadius),
			boundedRange.from,
		),
		contextAfter: text.slice(
			boundedRange.to,
			Math.min(text.length, boundedRange.to + contextRadius),
		),
	};
}

function findSentenceRange(
	text: string,
	anchorOffset: number,
): { from: number; to: number } {
	const boundaries = [0];
	for (const match of text.matchAll(SENTENCE_BOUNDARY_REGEX)) {
		boundaries.push((match.index ?? 0) + match[0].length);
	}
	boundaries.push(text.length);

	let from = 0;
	let to = text.length;
	for (let index = 0; index < boundaries.length - 1; index += 1) {
		const start = boundaries[index] ?? 0;
		const end = boundaries[index + 1] ?? text.length;
		if (anchorOffset >= start && anchorOffset <= end) {
			from = start;
			to = end;
			break;
		}
	}

	return {
		from: trimLeadingWhitespaceIndex(text, from, to),
		to: trimTrailingWhitespaceIndex(text, from, to),
	};
}

function clampRangeToMaxChars(
	text: string,
	range: { from: number; to: number },
	maxChars: number,
): { from: number; to: number } {
	if (range.to - range.from <= maxChars) {
		return range;
	}

	const midpoint = range.from + Math.floor((range.to - range.from) / 2);
	const from = Math.max(0, midpoint - Math.floor(maxChars / 2));
	const to = Math.min(text.length, from + maxChars);

	return {
		from: trimLeadingWhitespaceIndex(text, from, to),
		to: trimTrailingWhitespaceIndex(text, from, to),
	};
}

function trimLeadingWhitespaceIndex(
	text: string,
	from: number,
	to: number,
): number {
	let nextFrom = from;
	while (nextFrom < to && /\s/.test(text[nextFrom] ?? "")) {
		nextFrom += 1;
	}
	return nextFrom;
}

function trimTrailingWhitespaceIndex(
	text: string,
	from: number,
	to: number,
): number {
	let nextTo = to;
	while (nextTo > from && /\s/.test(text[nextTo - 1] ?? "")) {
		nextTo -= 1;
	}
	return nextTo;
}

function clampOffset(offset: number, length: number): number {
	return Math.max(0, Math.min(offset, length));
}

function normalizeScopeText(text: string): string {
	return text.trim().replace(/\s+/g, " ");
}
