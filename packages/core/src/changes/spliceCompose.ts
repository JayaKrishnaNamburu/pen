import type { BlockTextChange, TextSplice } from "./types";

type Piece =
	| { kind: "retain"; n: number }
	| { kind: "delete"; n: number }
	| { kind: "insert"; n: number };

export function composeSplices(
	first: readonly TextSplice[],
	second: readonly TextSplice[],
): TextSplice[] {
	if (first.length === 0) return mergeSplices(second);
	if (second.length === 0) return mergeSplices(first);
	return piecesToSplices(composePieces(splicesToPieces(first), splicesToPieces(second)));
}

export function composeBlockText(
	first: readonly BlockTextChange[],
	second: readonly BlockTextChange[],
): BlockTextChange[] {
	const byId = new Map<string, { splices: TextSplice[]; formatRanges: { from: number; to: number }[] }>();
	for (const change of first) {
		byId.set(change.blockId, {
			splices: [...change.splices],
			formatRanges: [...change.formatRanges],
		});
	}
	for (const change of second) {
		const prev = byId.get(change.blockId);
		if (!prev) {
			byId.set(change.blockId, {
				splices: [...change.splices],
				formatRanges: [...change.formatRanges],
			});
			continue;
		}
		prev.splices = composeSplices(prev.splices, change.splices);
		prev.formatRanges = [...prev.formatRanges, ...change.formatRanges];
	}

	const result: BlockTextChange[] = [];
	for (const [blockId, change] of byId) {
		const splices = mergeSplices(change.splices);
		if (splices.length === 0 && change.formatRanges.length === 0) continue;
		result.push({
			blockId,
			splices,
			formatRanges: change.formatRanges,
		});
	}
	return result;
}

export function mergeSplices(splices: readonly TextSplice[]): TextSplice[] {
	if (splices.length === 0) return [];
	const sorted = [...splices].sort((a, b) => a.from - b.from || a.to - b.to);
	const merged: { from: number; to: number; insertLength: number }[] = [];
	for (const splice of sorted) {
		const last = merged[merged.length - 1];
		if (last && splice.from <= last.to) {
			last.to = Math.max(last.to, splice.to);
			last.insertLength += splice.insertLength;
			continue;
		}
		merged.push({
			from: splice.from,
			to: splice.to,
			insertLength: splice.insertLength,
		});
	}
	return merged;
}

function splicesToPieces(splices: readonly TextSplice[]): Piece[] {
	const pieces: Piece[] = [];
	let pos = 0;
	for (const splice of mergeSplices(splices)) {
		if (splice.from > pos) pieces.push({ kind: "retain", n: splice.from - pos });
		if (splice.to > splice.from) {
			pieces.push({ kind: "delete", n: splice.to - splice.from });
		}
		if (splice.insertLength > 0) {
			pieces.push({ kind: "insert", n: splice.insertLength });
		}
		pos = splice.to;
	}
	return mergePieces(pieces);
}

function piecesToSplices(pieces: readonly Piece[]): TextSplice[] {
	const splices: TextSplice[] = [];
	let pos = 0;
	let pending: { from: number; to: number; insertLength: number } | null = null;

	const flush = () => {
		if (!pending) return;
		if (pending.to !== pending.from || pending.insertLength > 0) {
			splices.push(pending);
		}
		pending = null;
	};

	for (const piece of pieces) {
		if (piece.kind === "retain") {
			flush();
			pos += piece.n;
			continue;
		}
		if (!pending) pending = { from: pos, to: pos, insertLength: 0 };
		if (piece.kind === "delete") {
			pending.to += piece.n;
			pos += piece.n;
		} else {
			pending.insertLength += piece.n;
		}
	}
	flush();
	return mergeSplices(splices);
}

function composePieces(first: readonly Piece[], second: readonly Piece[]): Piece[] {
	const aQueue = first.map((piece) => ({ ...piece }));
	const bQueue = second.map((piece) => ({ ...piece }));
	const out: Piece[] = [];

	while (aQueue.length > 0 || bQueue.length > 0) {
		const a = aQueue[0];
		const b = bQueue[0];

		if (a?.kind === "delete") {
			out.push(a);
			aQueue.shift();
			continue;
		}

		if (!b) {
			if (a) {
				out.push(a);
				aQueue.shift();
			}
			continue;
		}

		if (b.kind === "insert") {
			out.push(b);
			bQueue.shift();
			continue;
		}

		if (!a) {
			out.push(b);
			bQueue.shift();
			continue;
		}

		const n = Math.min(a.n, b.n);
		if (a.kind === "retain" && b.kind === "retain") {
			out.push({ kind: "retain", n });
		} else if (a.kind === "retain" && b.kind === "delete") {
			out.push({ kind: "delete", n });
		} else if (a.kind === "insert" && b.kind === "retain") {
			out.push({ kind: "insert", n });
		}

		a.n -= n;
		b.n -= n;
		if (a.n === 0) aQueue.shift();
		if (b.n === 0) bQueue.shift();
	}

	return mergePieces(out);
}

function mergePieces(pieces: readonly Piece[]): Piece[] {
	const out: Piece[] = [];
	for (const piece of pieces) {
		if (piece.n <= 0) continue;
		const last = out[out.length - 1];
		if (last && last.kind === piece.kind) {
			last.n += piece.n;
			continue;
		}
		out.push({ ...piece });
	}
	return out;
}
