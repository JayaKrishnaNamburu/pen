/**
 * Editor-scoped UAX#9 run resolution (BR1, BR4).
 *
 * Implemented: P2/P3 via caller-supplied `base`; X1 plus isolates X5a–X5c/X6a
 * (LRI/RLI/FSI/PDI, including unmatched closers / implicit end; FSI first-strong
 * skips nested isolates per P2); W1–W7; N0 for `()[]{}`; N1–N2; I1–I2; L1
 * (B/S and adjoining / trailing WS); L2 run-level visual order. Isolate
 * initiators and PDI stay in the string as BN/NI so logical offsets match
 * the input.
 *
 * BR2 atom convention: U+FFFC (`BIDI_ATOM_MARKER`, same code point as the
 * field-editor object-replacement atom) is Bidi_Class ON and always a run
 * boundary. Callers that do not use that marker can still pass a string with
 * U+FFFC at each atom slot; there is no separate offset-list hook.
 *
 * Known UAX#9 gaps (named; not a full BidiTest dump):
 * - X2–X5/X7 explicit embeddings (LRE/RLE/LRO/RLO/PDF) — treated as BN/NI
 * - Full `BidiBrackets.txt` / `BidiMirroring.txt` (N0 is ASCII pairs only; no L4)
 * - Full Bidi_Class table (Latin-1 + Hebrew + Arabic + isolate/mark extras;
 *   other letters default to L, matching the CodeMirror-proven classifier)
 * - P1 multi-paragraph split (one call is one paragraph; B only resets via L1)
 * - L3 combining-mark reordering (run-level output does not need it)
 */

export type BlockDirection = "ltr" | "rtl";

export interface BidiRun {
	readonly from: number;
	readonly to: number;
	readonly level: number;
}

/** BR2: object-replacement slot. Same code point as field-editor atoms. */
export const BIDI_ATOM_MARKER = "\uFFFC";

const LTR = 0;
const RTL = 1;

const enum T {
	L = 1,
	R = 2,
	AL = 4,
	EN = 8,
	AN = 16,
	ET = 64,
	CS = 128,
	NI = 256,
	NSM = 512,
	Strong = T.L | T.R | T.AL,
	Num = T.EN | T.AN,
}

interface Isolate {
	from: number;
	to: number;
	direction: 0 | 1;
	inner: Isolate[];
}

const MAX_DEPTH = 125;
const LRI = 0x2066;
const RLI = 0x2067;
const FSI = 0x2068;
const PDI = 0x2069;
const ATOM = 0xfffc;

function dec(str: string): readonly T[] {
	const result: T[] = [];
	for (let i = 0; i < str.length; i++) result.push((1 << +str[i]) as T);
	return result;
}

const LowTypes = dec(
	"88888888888888888888888888888888888666888888787833333333337888888000000000000000000000000008888880000000000000000000000000088888888888888888888888888888888888887866668888088888663380888308888800000000000000000000000800000000000000000000000000000008",
);

const ArabicTypes = dec(
	"4444448826627288999999999992222222222222222222222222222222222222222222222229999999999999999999994444444444644222822222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222999999949999999229989999223333333333",
);

const Brackets: Record<number, number> = {
	0x28: 0x29,
	0x29: -0x28,
	0x5b: 0x5d,
	0x5d: -0x5b,
	0x7b: 0x7d,
	0x7d: -0x7b,
};

const enum Bracketed {
	OppositeBefore = 1,
	EmbedInside = 2,
	OppositeInside = 4,
}

const BidiRE =
	/[\u0590-\u05f4\u0600-\u06ff\u0700-\u08ac\ufb50-\ufdff\u2066-\u2069\ufffc]/;

function charType(ch: number): T {
	if (ch === ATOM) return T.NI;
	if (ch === LRI || ch === RLI || ch === FSI || ch === PDI) return T.NI;
	if (ch === 0x200e) return T.L;
	if (ch === 0x200f) return T.R;
	if (ch === 0x061c) return T.AL;
	if (ch >= 0x202a && ch <= 0x202e) return T.NI;
	if (ch <= 0xf7) return LowTypes[ch] ?? T.L;
	if (ch >= 0x590 && ch <= 0x5f4) return T.R;
	if (ch >= 0x600 && ch <= 0x6f9) return ArabicTypes[ch - 0x600] ?? T.AL;
	if (ch >= 0x6ee && ch <= 0x8ac) return T.AL;
	if (ch >= 0x2000 && ch <= 0x200c) return T.NI;
	if (ch >= 0xfb50 && ch <= 0xfdff) return T.AL;
	return T.L;
}

function isBidiSep(ch: number): boolean {
	return (
		ch === 0x0a ||
		ch === 0x0d ||
		ch === 0x1c ||
		ch === 0x1d ||
		ch === 0x1e ||
		ch === 0x85 ||
		ch === 0x2029
	);
}

function isBidiWs(ch: number): boolean {
	return (
		ch === 0x09 ||
		ch === 0x0b ||
		ch === 0x0c ||
		ch === 0x20 ||
		ch === 0xa0 ||
		(ch >= 0x2000 && ch <= 0x200a) ||
		ch === 0x2028 ||
		ch === 0x205f ||
		ch === 0x3000
	);
}

function firstStrong(text: string, from: number, to: number): 0 | 1 {
	for (let i = from; i < to; i++) {
		const ch = text.charCodeAt(i);
		if (ch === LRI || ch === RLI || ch === FSI) {
			let depth = 1;
			for (i++; i < to; i++) {
				const next = text.charCodeAt(i);
				if (next === LRI || next === RLI || next === FSI) depth++;
				else if (next === PDI) {
					depth--;
					if (depth === 0) break;
				}
			}
			continue;
		}
		const type = charType(ch);
		if (type === T.L) return LTR;
		if (type === T.R || type === T.AL) return RTL;
	}
	return LTR;
}

function parseIsolates(text: string): Isolate[] {
	type Frame = { from: number; direction: 0 | 1; inner: Isolate[] };
	const root: Isolate[] = [];
	const stack: Frame[] = [];
	const dest = (): Isolate[] =>
		stack.length > 0 ? stack[stack.length - 1]!.inner : root;

	for (let i = 0; i < text.length; i++) {
		const ch = text.charCodeAt(i);
		if (ch === LRI || ch === RLI || ch === FSI) {
			if (stack.length >= MAX_DEPTH) continue;
			let direction: 0 | 1 = ch === LRI ? LTR : ch === RLI ? RTL : LTR;
			if (ch === FSI) {
				let depth = 1;
				let end = text.length;
				for (let j = i + 1; j < text.length; j++) {
					const next = text.charCodeAt(j);
					if (next === LRI || next === RLI || next === FSI) depth++;
					else if (next === PDI) {
						depth--;
						if (depth === 0) {
							end = j;
							break;
						}
					}
				}
				direction = firstStrong(text, i + 1, end);
			}
			stack.push({ from: i + 1, direction, inner: [] });
		} else if (ch === PDI) {
			const frame = stack.pop();
			if (!frame) continue;
			dest().push({
				from: frame.from,
				to: i,
				direction: frame.direction,
				inner: frame.inner,
			});
		}
	}
	while (stack.length > 0) {
		const frame = stack.pop()!;
		dest().push({
			from: frame.from,
			to: text.length,
			direction: frame.direction,
			inner: frame.inner,
		});
	}
	return root;
}

function nextIsolateLevel(parent: number, direction: 0 | 1): number {
	if (direction === LTR) {
		return parent % 2 === 0 ? parent + 2 : parent + 1;
	}
	return parent % 2 === 1 ? parent + 2 : parent + 1;
}

function assignEmbedLevels(
	from: number,
	to: number,
	level: number,
	isolates: readonly Isolate[],
	embed: number[],
): void {
	let i = from;
	let iI = 0;
	while (i < to) {
		if (iI < isolates.length && i === isolates[iI]!.from) {
			const iso = isolates[iI]!;
			assignEmbedLevels(
				iso.from,
				iso.to,
				nextIsolateLevel(level, iso.direction),
				iso.inner,
				embed,
			);
			i = iso.to;
			iI++;
			continue;
		}
		embed[i] = level;
		i++;
	}
}

function computeCharTypes(
	line: string,
	rFrom: number,
	rTo: number,
	isolates: readonly Isolate[],
	outerType: T,
	types: T[],
): void {
	for (let iI = 0; iI <= isolates.length; iI++) {
		const from = iI ? isolates[iI - 1]!.to : rFrom;
		const to = iI < isolates.length ? isolates[iI]!.from : rTo;
		const prevType = iI ? T.NI : outerType;

		for (
			let i = from, prev = prevType, prevStrong = prevType;
			i < to;
			i++
		) {
			let type = charType(line.charCodeAt(i));
			if (type === T.NSM) type = prev;
			else if (type === T.EN && prevStrong === T.AL) type = T.AN;
			types[i] = type === T.AL ? T.R : type;
			if (type & T.Strong) prevStrong = type;
			prev = type;
		}

		for (
			let i = from, prev = prevType, prevStrong = prevType;
			i < to;
			i++
		) {
			const type = types[i]!;
			if (type === T.CS) {
				if (i < to - 1 && prev === types[i + 1] && prev & T.Num) {
					types[i] = prev;
				} else {
					types[i] = T.NI;
				}
			} else if (type === T.ET) {
				let end = i + 1;
				while (end < to && types[end] === T.ET) end++;
				const replace =
					(i && prev === T.EN) || (end < rTo && types[end] === T.EN)
						? prevStrong === T.L
							? T.L
							: T.EN
						: T.NI;
				for (let j = i; j < end; j++) types[j] = replace;
				i = end - 1;
			} else if (type === T.EN && prevStrong === T.L) {
				types[i] = T.L;
			}
			prev = type;
			if (type & T.Strong) prevStrong = type;
		}
	}
}

function processBracketPairs(
	line: string,
	rFrom: number,
	rTo: number,
	isolates: readonly Isolate[],
	outerType: T,
	types: T[],
): void {
	const oppositeType = outerType === T.L ? T.R : T.L;
	const stack: number[] = [];

	for (let iI = 0, context = 0; iI <= isolates.length; iI++) {
		const from = iI ? isolates[iI - 1]!.to : rFrom;
		const to = iI < isolates.length ? isolates[iI]!.from : rTo;
		for (let i = from; i < to; i++) {
			const ch = line.charCodeAt(i);
			const br = Brackets[ch];
			if (br) {
				if (br < 0) {
					for (let sJ = stack.length - 3; sJ >= 0; sJ -= 3) {
						if (stack[sJ + 1] === -br) {
							const flags = stack[sJ + 2]!;
							const type =
								flags & Bracketed.EmbedInside
									? outerType
									: !(flags & Bracketed.OppositeInside)
										? 0
										: flags & Bracketed.OppositeBefore
											? oppositeType
											: outerType;
							if (type) {
								types[i] = type;
								types[stack[sJ]!] = type;
							}
							stack.length = sJ;
							break;
						}
					}
				} else if (stack.length < MAX_DEPTH * 3) {
					stack.push(i, ch, context);
				}
			} else {
				const type = types[i]!;
				if (type === T.R || type === T.L) {
					const embed = type === outerType;
					context = embed ? 0 : Bracketed.OppositeBefore;
					for (let sJ = stack.length - 3; sJ >= 0; sJ -= 3) {
						const cur = stack[sJ + 2]!;
						if (cur & Bracketed.EmbedInside) break;
						stack[sJ + 2] = embed
							? cur | Bracketed.EmbedInside
							: cur | Bracketed.OppositeInside;
						if (!embed && cur & Bracketed.OppositeInside) break;
					}
				}
			}
		}
	}
}

function processNeutrals(
	rFrom: number,
	rTo: number,
	isolates: readonly Isolate[],
	outerType: T,
	types: T[],
): void {
	for (let iI = 0, prev = outerType; iI <= isolates.length; iI++) {
		let from = iI ? isolates[iI - 1]!.to : rFrom;
		let to = iI < isolates.length ? isolates[iI]!.from : rTo;
		for (let i = from; i < to; ) {
			if (types[i] !== T.NI) {
				prev = types[i]!;
				i++;
				continue;
			}
			let end = i + 1;
			let scanI = iI;
			let scanTo = to;
			for (;;) {
				if (end === scanTo) {
					if (scanI === isolates.length) break;
					end = isolates[scanI]!.to;
					scanI++;
					scanTo =
						scanI < isolates.length ? isolates[scanI]!.from : rTo;
				} else if (types[end] === T.NI) {
					end++;
				} else {
					break;
				}
			}
			const beforeL = prev === T.L;
			const afterL = (end < rTo ? types[end] : outerType) === T.L;
			const replace =
				beforeL === afterL ? (beforeL ? T.L : T.R) : outerType;
			let j = end;
			let jI = scanI;
			let fromJ = jI ? isolates[jI - 1]!.to : rFrom;
			while (j > i) {
				if (j === fromJ) {
					j = isolates[--jI]!.from;
					fromJ = jI ? isolates[jI - 1]!.to : rFrom;
				}
				types[--j] = replace;
			}
			i = end;
			iI = scanI;
			to = scanTo;
		}
	}
}

function resolveTypes(
	line: string,
	from: number,
	to: number,
	isolates: readonly Isolate[],
	outerType: T,
	types: T[],
): void {
	computeCharTypes(line, from, to, isolates, outerType, types);
	processBracketPairs(line, from, to, isolates, outerType, types);
	processNeutrals(from, to, isolates, outerType, types);
	for (const iso of isolates) {
		resolveTypes(
			line,
			iso.from,
			iso.to,
			iso.inner,
			iso.direction === LTR ? T.L : T.R,
			types,
		);
	}
}

function implicitLevel(type: T, embed: number): number {
	if (embed % 2 === 0) {
		if (type === T.R) return embed + 1;
		if (type === T.AN || type === T.EN) return embed + 2;
		return embed;
	}
	if (type === T.L || type === T.EN || type === T.AN) return embed + 1;
	return embed;
}

function applyL1(text: string, levels: number[], paraLevel: number): void {
	const resetWsBefore = (end: number): void => {
		let i = end - 1;
		while (i >= 0 && isBidiWs(text.charCodeAt(i))) {
			levels[i] = paraLevel;
			i--;
		}
	};
	for (let i = 0; i < text.length; i++) {
		if (isBidiSep(text.charCodeAt(i))) {
			levels[i] = paraLevel;
			resetWsBefore(i);
		}
	}
	resetWsBefore(text.length);
}

function logicalRuns(text: string, levels: readonly number[]): BidiRun[] {
	if (text.length === 0) return [];
	const runs: BidiRun[] = [];
	let from = 0;
	for (let i = 1; i <= text.length; i++) {
		const atomHere = i <= text.length && text.charCodeAt(i - 1) === ATOM;
		const atomNext = i < text.length && text.charCodeAt(i) === ATOM;
		const levelBreak = i === text.length || levels[i] !== levels[from];
		if (atomHere || atomNext || levelBreak) {
			runs.push({ from, to: i, level: levels[from]! });
			from = i;
		}
	}
	return runs;
}

function reorderVisual(runs: BidiRun[]): BidiRun[] {
	const ordered = runs.slice();
	let max = 0;
	for (const run of ordered) if (run.level > max) max = run.level;
	for (let level = max; level >= 1; level--) {
		let i = 0;
		while (i < ordered.length) {
			if (ordered[i]!.level < level) {
				i++;
				continue;
			}
			let j = i + 1;
			while (j < ordered.length && ordered[j]!.level >= level) j++;
			ordered.splice(i, j - i, ...ordered.slice(i, j).reverse());
			i = j;
		}
	}
	return ordered;
}

export function computeBidiRuns(
	text: string,
	base: BlockDirection,
): readonly BidiRun[] {
	const paraLevel = base === "rtl" ? RTL : LTR;
	if (text.length === 0) return [];
	if (
		paraLevel === LTR &&
		!BidiRE.test(text) &&
		!text.includes(BIDI_ATOM_MARKER)
	) {
		return [{ from: 0, to: text.length, level: 0 }];
	}

	const isolates = parseIsolates(text);
	const types: T[] = new Array(text.length);
	const embed: number[] = new Array(text.length);
	assignEmbedLevels(0, text.length, paraLevel, isolates, embed);
	resolveTypes(
		text,
		0,
		text.length,
		isolates,
		paraLevel === RTL ? T.R : T.L,
		types,
	);

	const levels = new Array<number>(text.length);
	for (let i = 0; i < text.length; i++) {
		levels[i] = implicitLevel(types[i] ?? T.NI, embed[i] ?? paraLevel);
	}
	applyL1(text, levels, paraLevel);
	return reorderVisual(logicalRuns(text, levels));
}
