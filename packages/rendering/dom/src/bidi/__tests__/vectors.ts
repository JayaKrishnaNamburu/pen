import { BIDI_ATOM_MARKER, type BidiRun, type BlockDirection } from "../levels";

export interface BidiVector {
	readonly id: string;
	readonly text: string;
	readonly base: BlockDirection;
	readonly runs: readonly BidiRun[];
}

const LRI = "\u2066";
const RLI = "\u2067";
const FSI = "\u2068";
const PDI = "\u2069";
const ATOM = BIDI_ATOM_MARKER;

/**
 * Representative UAX#9 run vectors (Latin / Arabic / Hebrew / isolates / digits).
 * Not the full Unicode BidiTest.txt dump — that lives with the conformance track.
 */
export const BIDI_VECTORS: readonly BidiVector[] = [
	{
		id: "latin-ltr",
		text: "Hello",
		base: "ltr",
		runs: [{ from: 0, to: 5, level: 0 }],
	},
	{
		id: "latin-rtl-base",
		text: "Hello",
		base: "rtl",
		runs: [{ from: 0, to: 5, level: 2 }],
	},
	{
		id: "arabic-rtl",
		text: "مرحبا",
		base: "rtl",
		runs: [{ from: 0, to: 5, level: 1 }],
	},
	{
		id: "arabic-ltr-base",
		text: "مرحبا",
		base: "ltr",
		runs: [{ from: 0, to: 5, level: 1 }],
	},
	{
		id: "hebrew-rtl",
		text: "שלום",
		base: "rtl",
		runs: [{ from: 0, to: 4, level: 1 }],
	},
	{
		id: "hebrew-ltr-base",
		text: "שלום",
		base: "ltr",
		runs: [{ from: 0, to: 4, level: 1 }],
	},
	{
		id: "latin-arabic-ltr",
		text: "Hello مرحبا",
		base: "ltr",
		runs: [
			{ from: 0, to: 6, level: 0 },
			{ from: 6, to: 11, level: 1 },
		],
	},
	{
		id: "arabic-latin-rtl",
		text: "مرحبا Hello",
		base: "rtl",
		runs: [
			{ from: 6, to: 11, level: 2 },
			{ from: 0, to: 6, level: 1 },
		],
	},
	{
		id: "hebrew-latin-ltr",
		text: "abאבcd",
		base: "ltr",
		runs: [
			{ from: 0, to: 2, level: 0 },
			{ from: 2, to: 4, level: 1 },
			{ from: 4, to: 6, level: 0 },
		],
	},
	{
		id: "digits-ltr",
		text: "123",
		base: "ltr",
		runs: [{ from: 0, to: 3, level: 0 }],
	},
	{
		id: "digits-rtl",
		text: "123",
		base: "rtl",
		runs: [{ from: 0, to: 3, level: 2 }],
	},
	{
		id: "arabic-digits-rtl",
		text: "مرحبا 123",
		base: "rtl",
		runs: [
			{ from: 6, to: 9, level: 2 },
			{ from: 0, to: 6, level: 1 },
		],
	},
	{
		id: "latin-digits-arabic-ltr",
		text: "Fig 12 ערך",
		base: "ltr",
		runs: [
			{ from: 0, to: 7, level: 0 },
			{ from: 7, to: 10, level: 1 },
		],
	},
	{
		id: "lri-arabic-in-ltr",
		text: `Hello ${LRI}مرحبا${PDI}!`,
		base: "ltr",
		runs: [
			{ from: 0, to: 7, level: 0 },
			{ from: 7, to: 12, level: 3 },
			{ from: 12, to: 14, level: 0 },
		],
	},
	{
		id: "rli-latin-in-ltr",
		text: `say ${RLI}ABC${PDI}.`,
		base: "ltr",
		runs: [
			{ from: 0, to: 5, level: 0 },
			{ from: 5, to: 8, level: 2 },
			{ from: 8, to: 10, level: 0 },
		],
	},
	{
		id: "fsi-arabic-picks-rtl",
		text: `x${FSI}مرحبا${PDI}y`,
		base: "ltr",
		runs: [
			{ from: 0, to: 2, level: 0 },
			{ from: 2, to: 7, level: 1 },
			{ from: 7, to: 9, level: 0 },
		],
	},
	{
		id: "fsi-latin-picks-ltr",
		text: `ש${FSI}AB${PDI}ם`,
		base: "rtl",
		runs: [
			{ from: 4, to: 6, level: 1 },
			{ from: 2, to: 4, level: 2 },
			{ from: 0, to: 2, level: 1 },
		],
	},
	{
		id: "fsi-skips-nested-isolate-for-p2",
		text: `${FSI}${RLI}م${PDI}AB${PDI}`,
		base: "ltr",
		runs: [
			{ from: 0, to: 1, level: 0 },
			{ from: 1, to: 2, level: 2 },
			{ from: 2, to: 3, level: 3 },
			{ from: 3, to: 6, level: 2 },
			{ from: 6, to: 7, level: 0 },
		],
	},
	{
		id: "nested-rli-in-lri",
		text: `${LRI}ab${RLI}גד${PDI}cd${PDI}`,
		base: "ltr",
		runs: [
			{ from: 0, to: 1, level: 0 },
			{ from: 1, to: 4, level: 2 },
			{ from: 4, to: 6, level: 3 },
			{ from: 6, to: 9, level: 2 },
			{ from: 9, to: 10, level: 0 },
		],
	},
	{
		id: "atom-latin-ltr",
		text: `ab${ATOM}cd`,
		base: "ltr",
		runs: [
			{ from: 0, to: 2, level: 0 },
			{ from: 2, to: 3, level: 0 },
			{ from: 3, to: 5, level: 0 },
		],
	},
	{
		id: "atom-arabic-rtl",
		text: `مر${ATOM}حبا`,
		base: "rtl",
		runs: [
			{ from: 3, to: 6, level: 1 },
			{ from: 2, to: 3, level: 1 },
			{ from: 0, to: 2, level: 1 },
		],
	},
	{
		id: "atom-between-scripts",
		text: `ab${ATOM}גד`,
		base: "ltr",
		runs: [
			{ from: 0, to: 2, level: 0 },
			{ from: 2, to: 3, level: 0 },
			{ from: 3, to: 5, level: 1 },
		],
	},
	{
		id: "l1-trailing-ws-rtl",
		text: "abc   ",
		base: "rtl",
		runs: [
			{ from: 3, to: 6, level: 1 },
			{ from: 0, to: 3, level: 2 },
		],
	},
	{
		id: "empty",
		text: "",
		base: "ltr",
		runs: [],
	},
	{
		id: "unmatched-pdi-ignored",
		text: `A${PDI}B`,
		base: "ltr",
		runs: [{ from: 0, to: 3, level: 0 }],
	},
	{
		id: "unclosed-lri-to-end",
		text: `A${LRI}مرحبا`,
		base: "ltr",
		runs: [
			{ from: 0, to: 2, level: 0 },
			{ from: 2, to: 7, level: 3 },
		],
	},
	{
		id: "l1-newline-before-hebrew",
		text: "ab\nשלום",
		base: "ltr",
		runs: [
			{ from: 0, to: 3, level: 0 },
			{ from: 3, to: 7, level: 1 },
		],
	},
];
