import type { Point } from "./changes";
import type { DocumentRange } from "./documentRange";

/**
 * Caret display side at line-wrap and bidi-run boundaries (`03-selection.md` §1.1).
 * Meaningless for a non-collapsed text selection.
 */
export type Affinity = "upstream" | "downstream";

export type SelectionOrigin =
	| "pointer"
	| "keyboard"
	| "ime"
	| "programmatic"
	| "mapped"
	| "restore"
	| "gc";

export interface TextSelection {
	type: "text";
	anchor: Point;
	focus: Point;
	/**
	 * Written by SelectionAuthority (Wave 5.3). Absent on v1 manager
	 * objects; readers default to `"downstream"`.
	 */
	readonly affinity?: Affinity;
	/**
	 * Preserved visual x for vertical caret motion. Null unless the last
	 * motion was vertical. Written by SelectionAuthority.
	 */
	readonly goalX?: number | null;
	/**
	 * v1 computed field. Stays until consumer conversion (Wave 5.1 / 5.3).
	 * Equivalent to `anchor.blockId === focus.blockId && anchor.offset === focus.offset`.
	 * Do not add a helper here — runtime functions in this package work against API3;
	 * the helper belongs in `@input/pen-core` when the authority lands.
	 */
	readonly isCollapsed: boolean;
	/**
	 * v1 computed field. Equivalent to `anchor.blockId !== focus.blockId`.
	 * Same relocation as `isCollapsed`.
	 */
	readonly isMultiBlock: boolean;
	/**
	 * v1 computed field. Document-order block ids covered by the range.
	 * Same relocation as `isCollapsed`.
	 */
	readonly blockRange: string[];
	/** v1 computed method. Same relocation as `isCollapsed`. */
	toRange(): DocumentRange;
}

export interface BlockSelection {
	type: "block";
	readonly blockIds: readonly string[];
	/** Block that extends/shrinks on shift-arrow. Written by SelectionAuthority. */
	readonly head?: string;
}

export interface AppSelection {
	type: "app";
	appId: string;
}

export interface CellSelection {
	type: "cell";
	blockId: string;
	anchor: { row: number; col: number };
	head: { row: number; col: number };
	rowIds?: string[];
	columnIds?: string[];
}

export type SelectionState =
	| TextSelection
	| BlockSelection
	| AppSelection
	| CellSelection
	| null;

/**
 * Read view of `SelectionState`. Helpers only read, so they take this
 * rather than the live writable value. Nested fields are readonly
 * (`blockRange` is `readonly string[]`; cell coords are readonly;
 * `toRange` is omitted because helpers do not call it). A live
 * `SelectionState` assigns here, and so does any deep-readonly unwrap
 * of the same value. `Readonly<SelectionState>` is not this type — it
 * is shallow and still exposes a mutable `blockRange`.
 */
export type ReadonlySelectionState =
	| {
			readonly type: "text";
			readonly anchor: Point;
			readonly focus: Point;
			readonly affinity?: Affinity;
			readonly goalX?: number | null;
			readonly isCollapsed?: boolean;
			readonly isMultiBlock?: boolean;
			readonly blockRange: readonly string[];
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
			readonly rowIds?: readonly string[];
			readonly columnIds?: readonly string[];
	  }
	| null;

/**
 * Serializable selection as of a commit. Same variants as `SelectionState`
 * without computed properties. `affinity` / `goalX` / `head` are required
 * here because `snapshotSelectionRecord` already writes them.
 *
 * Becomes `SelectionState` when 5.3 moves `isCollapsed` / `isMultiBlock` /
 * `blockRange` / `toRange` off the live value. Helpers belong in core
 * (API3: do not add them to this package).
 */
export type SelectionRecordState =
	| {
			readonly type: "text";
			readonly anchor: Point;
			readonly focus: Point;
			readonly affinity: Affinity;
			readonly goalX: number | null;
	  }
	| {
			readonly type: "block";
			readonly blockIds: readonly string[];
			readonly head: string;
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

export interface SelectionRecord {
	readonly state: SelectionRecordState;
	readonly version: number;
	readonly origin: SelectionOrigin;
	readonly commitId: number;
}
