export type BlockDirection = "ltr" | "rtl";
export type BlockDirectionSetting = BlockDirection | "auto";

const LRI = 0x2066;
const RLI = 0x2067;
const FSI = 0x2068;
const PDI = 0x2069;
const LRM = 0x200e;
const RLM = 0x200f;
const ALM = 0x061c;

const LETTER = /\p{L}/u;

function isIsolateInitiator(cp: number): boolean {
	return cp === LRI || cp === RLI || cp === FSI;
}

function codePointWidth(cp: number): number {
	return cp > 0xffff ? 2 : 1;
}

/** P2: skip from an isolate initiator through its matching PDI, or to end. */
function skipIsolate(text: string, start: number): number {
	const opener = text.codePointAt(start);
	if (opener === undefined || !isIsolateInitiator(opener)) {
		return start;
	}
	let depth = 1;
	let i = start + codePointWidth(opener);
	while (i < text.length) {
		const cp = text.codePointAt(i);
		if (cp === undefined) {
			break;
		}
		const width = codePointWidth(cp);
		if (isIsolateInitiator(cp)) {
			depth += 1;
		} else if (cp === PDI) {
			depth -= 1;
			if (depth === 0) {
				return i + width;
			}
		}
		i += width;
	}
	return text.length;
}

function isArabicIndicDigit(cp: number): boolean {
	return (cp >= 0x0660 && cp <= 0x0669) || (cp >= 0x06f0 && cp <= 0x06f9);
}

/** First-strong classes only: L, R, AL. */
function strongType(cp: number): "L" | "R" | "AL" | null {
	if (cp === LRM) {
		return "L";
	}
	if (cp === RLM) {
		return "R";
	}
	if (cp === ALM) {
		return "AL";
	}
	if (cp >= 0x0590 && cp <= 0x05ff) {
		return "R";
	}
	if (cp >= 0xfb1d && cp <= 0xfb4f) {
		return "R";
	}
	if (isArabicIndicDigit(cp)) {
		return null;
	}
	if (cp >= 0x0600 && cp <= 0x08ff && LETTER.test(String.fromCodePoint(cp))) {
		return "AL";
	}
	if (cp >= 0xfb50 && cp <= 0xfdff) {
		return "AL";
	}
	if (cp >= 0xfe70 && cp <= 0xfeff) {
		return "AL";
	}
	if (LETTER.test(String.fromCodePoint(cp))) {
		return "L";
	}
	return null;
}

/**
 * UAX#9 P2/P3 first-strong heuristic.
 * First L → ltr; first AL or R → rtl; none → `base` (default `"ltr"`).
 */
export function resolveFirstStrong(
	text: string,
	base: BlockDirection = "ltr",
): BlockDirection {
	let i = 0;
	while (i < text.length) {
		const cp = text.codePointAt(i);
		if (cp === undefined) {
			break;
		}
		if (isIsolateInitiator(cp)) {
			i = skipIsolate(text, i);
			continue;
		}
		const strong = strongType(cp);
		if (strong === "L") {
			return "ltr";
		}
		if (strong === "R" || strong === "AL") {
			return "rtl";
		}
		i += codePointWidth(cp);
	}
	return base;
}
