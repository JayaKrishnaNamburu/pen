/** Selection types v2 (`spec-v2/03-selection.md` §1.1). */
// Not on the package barrel: v1 Point / TextSelection / SelectionState collide.
// SelectionRecord on CommitEvent is SelectionRecordV2. Helpers wait for the
// live selection.ts rewrite so they are not unreachable source runtime.
// packages/core/src/selection/transitions.ts keeps its own local copies.

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
