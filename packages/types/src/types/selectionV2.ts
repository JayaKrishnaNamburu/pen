/**
 * Additive unused selection types v2 (`spec-v2/03-selection.md` §1.1).
 *
 * Not wired to the package barrel, SelectionManager, or consumers.
 * `packages/core/src/selection/transitions.ts` keeps its own local copies.
 */

export type Affinity = "upstream" | "downstream";

export interface Point {
	readonly blockId: string;
	readonly offset: number;
}

export interface TextSelectionV2 {
	readonly type: "text";
	readonly anchor: Point;
	readonly focus: Point;
	readonly affinity: Affinity;
	readonly goalX: number | null;
}

export interface BlockSelectionV2 {
	readonly type: "block";
	readonly blockIds: readonly string[];
	readonly head: string;
}

export interface AppSelectionV2 {
	readonly type: "app";
	readonly appId: string;
}

export interface CellSelectionV2 {
	readonly type: "cell";
	readonly blockId: string;
	readonly anchor: { readonly row: number; readonly col: number };
	readonly head: { readonly row: number; readonly col: number };
}

export type SelectionStateV2 =
	| TextSelectionV2
	| BlockSelectionV2
	| AppSelectionV2
	| CellSelectionV2
	| null;

export type SelectionOriginV2 =
	| "pointer"
	| "keyboard"
	| "ime"
	| "programmatic"
	| "mapped"
	| "restore"
	| "gc";

export interface SelectionRecordV2 {
	readonly state: SelectionStateV2;
	readonly version: number;
	readonly origin: SelectionOriginV2;
	readonly commitId: number;
}

type SelectionDocV2 = {
	readonly blockOrder: readonly string[];
};

export function isCollapsed(sel: SelectionStateV2): boolean {
	if (sel === null) {
		return false;
	}
	switch (sel.type) {
		case "text":
			return (
				sel.anchor.blockId === sel.focus.blockId &&
				sel.anchor.offset === sel.focus.offset
			);
		case "cell":
			return (
				sel.anchor.row === sel.head.row && sel.anchor.col === sel.head.col
			);
		case "block":
		case "app":
			return false;
		default: {
			const _exhaustive: never = sel;
			return _exhaustive;
		}
	}
}

export function isMultiBlock(sel: SelectionStateV2): boolean {
	if (sel === null) {
		return false;
	}
	switch (sel.type) {
		case "text":
			return sel.anchor.blockId !== sel.focus.blockId;
		case "block":
			return sel.blockIds.length > 1;
		case "app":
		case "cell":
			return false;
		default: {
			const _exhaustive: never = sel;
			return _exhaustive;
		}
	}
}

export function getSelectionBlockRange(
	doc: SelectionDocV2,
	sel: SelectionStateV2,
): readonly string[] {
	if (sel === null) {
		return [];
	}
	switch (sel.type) {
		case "text":
			return textBlockRange(doc.blockOrder, sel);
		case "block":
			return sel.blockIds;
		case "cell":
			return [sel.blockId];
		case "app":
			return [];
		default: {
			const _exhaustive: never = sel;
			return _exhaustive;
		}
	}
}

export function selectionToRange(
	doc: SelectionDocV2,
	sel: SelectionStateV2,
): { readonly start: Point; readonly end: Point } | null {
	if (sel === null || sel.type !== "text") {
		return null;
	}
	return orderedTextRange(doc.blockOrder, sel);
}

function textBlockRange(
	blockOrder: readonly string[],
	sel: TextSelectionV2,
): readonly string[] {
	const startIdx = blockOrder.indexOf(sel.anchor.blockId);
	const endIdx = blockOrder.indexOf(sel.focus.blockId);
	if (startIdx === -1 || endIdx === -1) {
		return [];
	}
	const from = Math.min(startIdx, endIdx);
	const to = Math.max(startIdx, endIdx);
	return blockOrder.slice(from, to + 1);
}

function orderedTextRange(
	blockOrder: readonly string[],
	sel: TextSelectionV2,
): { readonly start: Point; readonly end: Point } | null {
	const aIdx = blockOrder.indexOf(sel.anchor.blockId);
	const bIdx = blockOrder.indexOf(sel.focus.blockId);
	if (aIdx === -1 || bIdx === -1) {
		return null;
	}
	if (aIdx < bIdx) {
		return { start: sel.anchor, end: sel.focus };
	}
	if (aIdx > bIdx) {
		return { start: sel.focus, end: sel.anchor };
	}
	if (sel.anchor.offset <= sel.focus.offset) {
		return { start: sel.anchor, end: sel.focus };
	}
	return { start: sel.focus, end: sel.anchor };
}
