import {
	buildNormalPositionSnapshot,
	getEditorSelectionRecord,
	snapToNormalPosition,
} from "@input/pen-core";
import type { Editor, Point, SelectionRecordState } from "@input/pen-types";
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

export type DomSelectionReadDecision =
	| "ignore-inflight"
	| "no-proposal"
	| "equivalent"
	| "continue";

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

/**
 * §4.2 steps 1–3. Step 4 (I4 re-project) and step 5 (`authority.set`)
 * stay unwired — fall through to the v1 heuristics when this returns
 * `"continue"`.
 */
export function classifyDomSelectionRead(input: {
	projectionInFlight: boolean;
	proposal: ReaderSelection | null;
	authorityState: ReaderSelection;
	snapshot: ReaderSnapshot;
}): DomSelectionReadDecision {
	if (input.projectionInFlight) {
		return "ignore-inflight";
	}
	if (input.proposal === null) {
		return "no-proposal";
	}
	if (
		isLogicallyEquivalent(
			input.proposal,
			input.authorityState,
			input.snapshot,
		)
	) {
		return "equivalent";
	}
	return "continue";
}

export function shouldStopEquivalentDomRead(
	editor: Editor,
	proposal: ReaderSelection,
): boolean {
	const record = getEditorSelectionRecord(editor);
	if (record === null) {
		return false;
	}
	return (
		classifyDomSelectionRead({
			projectionInFlight: false,
			proposal,
			authorityState: toReaderSelection(record.state),
			snapshot: buildNormalPositionSnapshot(editor),
		}) === "equivalent"
	);
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

function toReaderSelection(state: SelectionRecordState): ReaderSelection {
	if (state === null) {
		return null;
	}
	switch (state.type) {
		case "text":
			return {
				type: "text",
				anchor: state.anchor,
				focus: state.focus,
			};
		case "block":
			return {
				type: "block",
				blockIds: state.blockIds,
				head: state.head,
			};
		case "app":
			return { type: "app", appId: state.appId };
		case "cell":
			return {
				type: "cell",
				blockId: state.blockId,
				anchor: state.anchor,
				head: state.head,
			};
		default: {
			const _exhaustive: never = state;
			return _exhaustive;
		}
	}
}

function sameSnappedPoint(
	domPoint: ReaderPoint,
	authorityPoint: ReaderPoint,
	snapshot: ReaderSnapshot,
): boolean {
	const logicalDom = toLogicalPoint(domPoint, snapshot);
	if (logicalDom === null) {
		return false;
	}
	return sameSnapResult(
		snapToNormalPosition(snapshot, logicalDom, 1),
		snapToNormalPosition(snapshot, authorityPoint, 1),
	);
}

function sameSnapResult(
	left: ReturnType<typeof snapToNormalPosition>,
	right: ReturnType<typeof snapToNormalPosition>,
): boolean {
	if (left === null || right === null) {
		return false;
	}
	const leftBoundary = "blockBoundary" in left;
	const rightBoundary = "blockBoundary" in right;
	if (leftBoundary || rightBoundary) {
		return (
			leftBoundary &&
			rightBoundary &&
			left.blockBoundary === right.blockBoundary
		);
	}
	return left.blockId === right.blockId && left.offset === right.offset;
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
