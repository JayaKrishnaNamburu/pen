import type { TestBlock } from "@input/pen-test";

/** LTR paragraph with an RTL embed. First-strong Latin, explicit ltr. */
export const BIDI_LTR_EMBED_TEXT = "Hello مرحبا";
/** RTL paragraph with an LTR embed. First-strong Arabic, explicit rtl. */
export const BIDI_RTL_EMBED_TEXT = "مرحبا Hello";
/** Pure-RTL first line for M5 vertical motion. */
export const BIDI_RTL_LINE_A = "שלום עולם";
/** Pure-RTL second line for M5 vertical motion. */
export const BIDI_RTL_LINE_B = "שורה שנייה";

export const BIDI_LTR_EMBED_ID = "bidi-ltr-embed";
export const BIDI_RTL_EMBED_ID = "bidi-rtl-embed";
export const BIDI_RTL_LINE_A_ID = "bidi-rtl-line-a";
export const BIDI_RTL_LINE_B_ID = "bidi-rtl-line-b";

/** Logical start of the Latin embed inside `BIDI_RTL_EMBED_TEXT`. */
export const BIDI_RTL_LATIN_START = BIDI_RTL_EMBED_TEXT.indexOf("Hello");
/** Mid-word offset inside that Latin embed ("He|llo"). */
export const BIDI_RTL_LATIN_MID = BIDI_RTL_LATIN_START + 2;

export const BIDI_MIXED_BLOCKS: readonly TestBlock[] = [
	{
		id: BIDI_LTR_EMBED_ID,
		type: "paragraph",
		props: { direction: "ltr" },
		content: BIDI_LTR_EMBED_TEXT,
	},
	{
		id: BIDI_RTL_EMBED_ID,
		type: "paragraph",
		props: { direction: "rtl" },
		content: BIDI_RTL_EMBED_TEXT,
	},
	{
		id: BIDI_RTL_LINE_A_ID,
		type: "paragraph",
		props: { direction: "rtl" },
		content: BIDI_RTL_LINE_A,
	},
	{
		id: BIDI_RTL_LINE_B_ID,
		type: "paragraph",
		props: { direction: "rtl" },
		content: BIDI_RTL_LINE_B,
	},
];
