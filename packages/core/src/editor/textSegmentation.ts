/**
 * Grapheme/word boundary queries and match folding (LOC4, LOC5).
 *
 * `Intl.Segmenter` is above the HOST4 floor (Firefox only since 125). It is
 * feature-detected on every call. When it is missing:
 * - character operations degrade to code points, never to UTF-16 code units
 * - word operations degrade to whitespace runs
 *
 * Offsets are in the logical text domain (`spec/rules/selection.md` §2): UTF-16
 * indices into the block string with the empty-block sentinel already erased.
 * This module does not look for the sentinel.
 */

export interface WordRange {
	readonly start: number;
	readonly end: number;
}

type SegmentGranularity = "grapheme" | "word";

const WHITESPACE = /\s/u;

const segmenters = new Map<string, Intl.Segmenter>();

function clampOffset(length: number, offset: number): number {
	if (offset <= 0) {
		return 0;
	}
	if (offset >= length) {
		return length;
	}
	return offset;
}

function resolveSegmenter(
	locale: string,
	granularity: SegmentGranularity,
): Intl.Segmenter | null {
	if (typeof Intl === "undefined" || typeof Intl.Segmenter !== "function") {
		return null;
	}

	const key = `${locale}:${granularity}`;
	const cached = segmenters.get(key);
	if (cached) {
		return cached;
	}

	const created = new Intl.Segmenter(locale, { granularity });
	segmenters.set(key, created);
	return created;
}

function previousCodePointBoundary(text: string, offset: number): number {
	if (offset <= 0) {
		return 0;
	}

	const trail = text.charCodeAt(offset - 1);
	if (trail >= 0xdc00 && trail <= 0xdfff && offset >= 2) {
		const lead = text.charCodeAt(offset - 2);
		if (lead >= 0xd800 && lead <= 0xdbff) {
			return offset - 2;
		}
	}

	return offset - 1;
}

function nextCodePointBoundary(text: string, offset: number): number {
	if (offset >= text.length) {
		return text.length;
	}

	const lead = text.charCodeAt(offset);
	if (lead >= 0xd800 && lead <= 0xdbff && offset + 1 < text.length) {
		const trail = text.charCodeAt(offset + 1);
		if (trail >= 0xdc00 && trail <= 0xdfff) {
			return offset + 2;
		}
	}

	return offset + 1;
}

function fallbackWordRanges(text: string): WordRange[] {
	const ranges: WordRange[] = [];
	let index = 0;

	while (index < text.length) {
		if (WHITESPACE.test(text[index]!)) {
			index += 1;
			continue;
		}

		const start = index;
		index += 1;
		while (index < text.length && !WHITESPACE.test(text[index]!)) {
			index += 1;
		}
		ranges.push({ start, end: index });
	}

	return ranges;
}

function wordLikeRanges(text: string, locale: string): WordRange[] {
	const segmenter = resolveSegmenter(locale, "word");
	if (!segmenter) {
		return fallbackWordRanges(text);
	}

	const ranges: WordRange[] = [];
	for (const part of segmenter.segment(text)) {
		if (part.isWordLike) {
			ranges.push({
				start: part.index,
				end: part.index + part.segment.length,
			});
		}
	}
	return ranges;
}

export function previousGraphemeBoundary(
	text: string,
	offset: number,
	locale: string,
): number {
	const clamped = clampOffset(text.length, offset);
	if (clamped === 0) {
		return 0;
	}

	const segmenter = resolveSegmenter(locale, "grapheme");
	if (!segmenter) {
		return previousCodePointBoundary(text, clamped);
	}

	let previous = 0;
	for (const { index } of segmenter.segment(text)) {
		if (index >= clamped) {
			return previous;
		}
		previous = index;
	}
	return previous;
}

export function nextGraphemeBoundary(
	text: string,
	offset: number,
	locale: string,
): number {
	const clamped = clampOffset(text.length, offset);
	if (clamped === text.length) {
		return text.length;
	}

	const segmenter = resolveSegmenter(locale, "grapheme");
	if (!segmenter) {
		return nextCodePointBoundary(text, clamped);
	}

	for (const { index, segment } of segmenter.segment(text)) {
		const end = index + segment.length;
		if (end > clamped) {
			return end;
		}
	}
	return text.length;
}

export function previousWordBoundary(
	text: string,
	offset: number,
	locale: string,
): number {
	const clamped = clampOffset(text.length, offset);
	if (clamped === 0) {
		return 0;
	}

	let previous = 0;
	for (const word of wordLikeRanges(text, locale)) {
		if (word.start >= clamped) {
			break;
		}
		previous = word.start;
	}
	return previous;
}

export function nextWordBoundary(
	text: string,
	offset: number,
	locale: string,
): number {
	const clamped = clampOffset(text.length, offset);
	if (clamped === text.length) {
		return text.length;
	}

	for (const word of wordLikeRanges(text, locale)) {
		if (word.end > clamped) {
			return word.end;
		}
	}
	return text.length;
}

export function wordRangeAt(
	text: string,
	offset: number,
	locale: string,
): WordRange | null {
	const clamped = clampOffset(text.length, offset);
	let ended: WordRange | null = null;

	for (const word of wordLikeRanges(text, locale)) {
		if (clamped >= word.start && clamped < word.end) {
			return word;
		}
		if (clamped === word.end) {
			ended = word;
		}
	}

	return ended;
}

/**
 * Locale-aware case fold plus NFC for match comparison (LOC5).
 * Maps Greek final sigma to medial sigma. Not `toLowerCase()` — that misses
 * Turkish ı/I and ς/σ.
 */
export function foldAndNormalize(text: string, locale: string): string {
	return text
		.toLocaleLowerCase(locale)
		.replaceAll("\u03C2", "\u03C3")
		.normalize("NFC");
}
