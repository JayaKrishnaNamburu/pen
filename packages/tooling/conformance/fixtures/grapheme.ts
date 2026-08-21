import type { TestBlock } from "@input/pen-test";

/**
 * Multi-codepoint grapheme clusters. M6 used to operate mid-`Hello`, where a
 * walk that advances one code point still passes. Each of these is more than
 * one code point under `Intl.Segmenter({ granularity: "grapheme" })`.
 */
export const GRAPHEME_ZWJ_FAMILY = "👨‍👩‍👧‍👦";
export const GRAPHEME_COMBINING = "e\u0301";
export const GRAPHEME_FLAG = "🇯🇵";
export const GRAPHEME_DEVANAGARI = "क्ष";
export const GRAPHEME_THAI = "ก้";

export const GRAPHEME_ZWJ_ID = "grapheme-zwj";
export const GRAPHEME_COMBINING_ID = "grapheme-combining";
export const GRAPHEME_FLAG_ID = "grapheme-flag";
export const GRAPHEME_DEVANAGARI_ID = "grapheme-devanagari";
export const GRAPHEME_THAI_ID = "grapheme-thai";
export const GRAPHEME_RTL_ID = "grapheme-rtl";

export const GRAPHEME_ZWJ_LINE = `x${GRAPHEME_ZWJ_FAMILY}y`;
export const GRAPHEME_COMBINING_LINE = `caf${GRAPHEME_COMBINING}s`;
export const GRAPHEME_FLAG_LINE = `hi${GRAPHEME_FLAG}x`;
export const GRAPHEME_DEVANAGARI_LINE = `a${GRAPHEME_DEVANAGARI}b`;
export const GRAPHEME_THAI_LINE = `a${GRAPHEME_THAI}b`;
export const GRAPHEME_RTL_LINE = `مرحبا ${GRAPHEME_ZWJ_FAMILY} Hello`;

export const GRAPHEME_ZWJ_AFTER = 1 + GRAPHEME_ZWJ_FAMILY.length;
export const GRAPHEME_COMBINING_AFTER = 3 + GRAPHEME_COMBINING.length;
export const GRAPHEME_FLAG_AFTER = 2 + GRAPHEME_FLAG.length;
export const GRAPHEME_DEVANAGARI_AFTER = 1 + GRAPHEME_DEVANAGARI.length;
export const GRAPHEME_THAI_AFTER = 1 + GRAPHEME_THAI.length;
export const GRAPHEME_RTL_FAMILY_AFTER =
	GRAPHEME_RTL_LINE.indexOf(GRAPHEME_ZWJ_FAMILY) + GRAPHEME_ZWJ_FAMILY.length;

export const GRAPHEME_ZWJ_AFTER_BACKSPACE = "xy";
export const GRAPHEME_COMBINING_AFTER_BACKSPACE = "cafs";
export const GRAPHEME_FLAG_AFTER_BACKSPACE = "hix";
export const GRAPHEME_DEVANAGARI_AFTER_BACKSPACE = "ab";
export const GRAPHEME_THAI_AFTER_BACKSPACE = "ab";
export const GRAPHEME_RTL_AFTER_BACKSPACE = "مرحبا  Hello";

export const GRAPHEME_CLUSTER_BLOCKS: readonly TestBlock[] = [
	{
		id: GRAPHEME_ZWJ_ID,
		type: "paragraph",
		content: GRAPHEME_ZWJ_LINE,
	},
	{
		id: GRAPHEME_COMBINING_ID,
		type: "paragraph",
		content: GRAPHEME_COMBINING_LINE,
	},
	{
		id: GRAPHEME_FLAG_ID,
		type: "paragraph",
		content: GRAPHEME_FLAG_LINE,
	},
	{
		id: GRAPHEME_DEVANAGARI_ID,
		type: "paragraph",
		content: GRAPHEME_DEVANAGARI_LINE,
	},
	{
		id: GRAPHEME_THAI_ID,
		type: "paragraph",
		content: GRAPHEME_THAI_LINE,
	},
	{
		id: GRAPHEME_RTL_ID,
		type: "paragraph",
		props: { direction: "rtl" },
		content: GRAPHEME_RTL_LINE,
	},
];
