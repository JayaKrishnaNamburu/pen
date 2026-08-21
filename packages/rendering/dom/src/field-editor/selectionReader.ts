import type { Point } from "@input/pen-types";
import { toLogicalOffset } from "./offsetDomain";

export type ReaderPoint = Point;

export type ReaderSelection =
	| {
			readonly type: "text";
			readonly anchor: ReaderPoint;
			readonly focus: ReaderPoint;
	  }
	| {
			readonly type: "block";
			readonly blockIds: readonly string[];
			readonly head?: string;
	  }
	| {
			readonly type: "app";
			readonly appId: string;
	  }
	| {
			readonly type: "cell";
			readonly blockId: string;
			readonly anchor: { readonly row: number; readonly col: number };
			readonly head: { readonly row: number; readonly col: number };
	  }
	| null;

export type ReaderAtomExtent = {
	readonly start: number;
	readonly end: number;
};

export type ReaderBlockKind = "text" | "structural";

export type ReaderBlock = {
	readonly kind: ReaderBlockKind;
	readonly text: string;
	readonly atoms?: readonly ReaderAtomExtent[];
};

export type ReaderSnapshot = {
	readonly blockOrder: readonly string[];
	readonly blocks: Readonly<Record<string, ReaderBlock>>;
};

export type GestureWindowKind = "pointer" | "ime" | "context-menu" | "drag";

export type GestureWindowState = {
	readonly pointer: boolean;
	readonly ime: boolean;
	readonly contextMenu: boolean;
	readonly drag: boolean;
};

export const CLOSED_GESTURE_WINDOWS: GestureWindowState = {
	pointer: false,
	ime: false,
	contextMenu: false,
	drag: false,
};

export type GestureEventKind =
	| "pointerdown"
	| "pointerup"
	| "pointer-settled"
	| "compositionstart"
	| "compositionend-completed"
	| "contextmenu"
	| "selectionchange"
	| "dragstart"
	| "drop-completed"
	| "dragend-completed"
	| "keydown"
	| "keyup";

export function isLogicallyEquivalent(
	domRead: ReaderSelection,
	authorityState: ReaderSelection,
	snapshot: ReaderSnapshot,
): boolean {
	if (domRead === null && authorityState === null) {
		return true;
	}
	if (domRead === null || authorityState === null) {
		return false;
	}
	if (domRead.type !== authorityState.type) {
		return false;
	}

	switch (domRead.type) {
		case "text": {
			if (authorityState.type !== "text") {
				return false;
			}
			return (
				sameSnappedPoint(domRead.anchor, authorityState.anchor, snapshot) &&
				sameSnappedPoint(domRead.focus, authorityState.focus, snapshot)
			);
		}
		case "block": {
			if (authorityState.type !== "block") {
				return false;
			}
			return sameBlockIds(domRead.blockIds, authorityState.blockIds);
		}
		case "app": {
			if (authorityState.type !== "app") {
				return false;
			}
			return domRead.appId === authorityState.appId;
		}
		case "cell": {
			if (authorityState.type !== "cell") {
				return false;
			}
			return (
				domRead.blockId === authorityState.blockId &&
				domRead.anchor.row === authorityState.anchor.row &&
				domRead.anchor.col === authorityState.anchor.col &&
				domRead.head.row === authorityState.head.row &&
				domRead.head.col === authorityState.head.col
			);
		}
		default: {
			const _exhaustive: never = domRead;
			return _exhaustive;
		}
	}
}

export function nextGestureWindowState(
	eventKind: GestureEventKind,
	state: GestureWindowState,
): GestureWindowState {
	switch (eventKind) {
		case "pointerdown":
			return { ...state, pointer: true };
		case "pointerup":
			return state;
		case "pointer-settled":
			return { ...state, pointer: false };
		case "compositionstart":
			return { ...state, ime: true };
		case "compositionend-completed":
			return { ...state, ime: false };
		case "contextmenu":
			return { ...state, contextMenu: true };
		case "selectionchange":
			return { ...state, contextMenu: false };
		case "dragstart":
			return { ...state, drag: true };
		case "drop-completed":
		case "dragend-completed":
			return { ...state, drag: false };
		case "keydown":
		case "keyup":
			return state;
		default: {
			const _exhaustive: never = eventKind;
			return _exhaustive;
		}
	}
}

export function isAdmissibleDomRead(
	eventKind: GestureEventKind,
	state: GestureWindowState,
): boolean {
	if (eventKind !== "selectionchange") {
		return false;
	}
	return state.pointer || state.ime || state.contextMenu || state.drag;
}

function sameSnappedPoint(
	domPoint: ReaderPoint,
	authorityPoint: ReaderPoint,
	snapshot: ReaderSnapshot,
): boolean {
	const fromDom = snapIdentity(toLogicalPoint(domPoint, snapshot), snapshot);
	const fromAuthority = snapIdentity(authorityPoint, snapshot);
	if (fromDom === null || fromAuthority === null) {
		return false;
	}
	return (
		fromDom.blockId === fromAuthority.blockId &&
		fromDom.offset === fromAuthority.offset
	);
}

function toLogicalPoint(
	point: ReaderPoint,
	snapshot: ReaderSnapshot,
): ReaderPoint | null {
	const block = resolveTextBlock(snapshot, point.blockId);
	if (!block) {
		return null;
	}
	return {
		blockId: point.blockId,
		offset: toLogicalOffset(point.offset, block.text),
	};
}

function snapIdentity(
	point: ReaderPoint | null,
	snapshot: ReaderSnapshot,
): ReaderPoint | null {
	if (point === null) {
		return null;
	}
	const block = resolveTextBlock(snapshot, point.blockId);
	if (!block) {
		return null;
	}
	const offset = clampOffset(block.text.length, point.offset);
	const atom = atomContaining(block, offset);
	if (!atom) {
		return { blockId: point.blockId, offset };
	}
	return { blockId: point.blockId, offset: atom.end };
}

function resolveTextBlock(
	snapshot: ReaderSnapshot,
	blockId: string,
): ReaderBlock | null {
	if (!snapshot.blockOrder.includes(blockId)) {
		return null;
	}
	const block = snapshot.blocks[blockId];
	if (!block || block.kind === "structural") {
		return null;
	}
	return block;
}

function atomContaining(
	block: ReaderBlock,
	offset: number,
): ReaderAtomExtent | null {
	for (const atom of block.atoms ?? []) {
		if (offset > atom.start && offset < atom.end) {
			return atom;
		}
	}
	return null;
}

function clampOffset(max: number, offset: number): number {
	if (offset <= 0) {
		return 0;
	}
	if (offset >= max) {
		return max;
	}
	return offset;
}

function sameBlockIds(
	left: readonly string[],
	right: readonly string[],
): boolean {
	if (left.length !== right.length) {
		return false;
	}
	for (let index = 0; index < left.length; index++) {
		if (left[index] !== right[index]) {
			return false;
		}
	}
	return true;
}
