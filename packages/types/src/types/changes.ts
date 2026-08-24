/**
 * Which side of a position inserted text lands on. `-1` sticks to the
 * character before the position, `1` to the character after — so a caret with
 * `assoc: -1` stays put when text is inserted at its offset, and one with
 * `assoc: 1` is pushed along by it.
 *
 * This is the single declaration; `@input/pen-types/anchors` re-exports it.
 */
export type Assoc = -1 | 1;

export type DefaultAssoc = 1;

export interface Point {
	readonly blockId: string;
	readonly offset: number;
}

export interface TextSplice {
	readonly from: number;
	readonly to: number;
	readonly insertLength: number;
}

export interface BlockTextChange {
	readonly blockId: string;
	readonly splices: readonly TextSplice[];
	readonly formatRanges: readonly { from: number; to: number }[];
}

export type StructuralChange =
	| {
			readonly type: "block-inserted";
			readonly blockId: string;
			readonly parentId: string | null;
			readonly index: number;
	  }
	| {
			readonly type: "block-removed";
			readonly blockId: string;
			readonly parentId: string | null;
			readonly index: number;
	  }
	| {
			readonly type: "block-moved";
			readonly blockId: string;
			readonly fromParentId: string | null;
			readonly fromIndex: number;
			readonly toParentId: string | null;
			readonly toIndex: number;
	  }
	| {
			readonly type: "block-props-changed";
			readonly blockId: string;
			readonly keys: readonly string[];
	  }
	| {
			readonly type: "block-split";
			readonly blockId: string;
			readonly newBlockId: string;
			readonly offset: number;
	  }
	| {
			readonly type: "blocks-merged";
			readonly targetBlockId: string;
			readonly sourceBlockId: string;
			readonly joinOffset: number;
	  }
	| { readonly type: "table-changed"; readonly blockId: string }
	| { readonly type: "apps-changed"; readonly appIds: readonly string[] }
	| {
			readonly type: "metadata-changed";
			readonly namespaces: readonly string[];
	  };

export interface ChangeSummary {
	readonly commitId: number;
	readonly blockText: readonly BlockTextChange[];
	readonly structural: readonly StructuralChange[];
	readonly affectedBlockIds: readonly string[];
}

/**
 * The splice helper is a function, not an algebra. `mapOffsetThroughSplices`
 * is a pure convenience for derived-tier providers shifting per-block results
 * within **one** summary. Clamp semantics only. There is no `compose`, no
 * multi-summary form, no map modes, and no cross-commit law: code that needs a
 * position to survive more than one commit uses an anchor (I13).
 */
export function mapOffsetThroughSplices(
	splices: readonly TextSplice[],
	offset: number,
	assoc: Assoc,
): number {
	let delta = 0;
	for (const splice of splices) {
		const deleted = splice.to - splice.from;
		if (offset < splice.from) {
			return offset + delta;
		}
		if (splice.from < offset && offset < splice.to) {
			return splice.from + delta;
		}
		if (offset === splice.from) {
			if (splice.insertLength > 0) {
				return assoc === -1
					? splice.from + delta
					: splice.from + delta + splice.insertLength;
			}
			if (deleted > 0) {
				return splice.from + delta;
			}
			continue;
		}
		if (offset === splice.to && deleted > 0) {
			return splice.from + delta + splice.insertLength;
		}
		delta += splice.insertLength - deleted;
	}
	return offset + delta;
}
