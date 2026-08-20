/**
 * Change-summary contracts from spec-v2/02-change-summaries.md.
 * Local so this module stands alone while `@input/pen-types` `changes.ts`
 * is restored in parallel. Shapes match the package types when present.
 */

export type Assoc = -1 | 1;

export type PointMapMode =
	| "clamp"
	| "delete"
	| "delete-before"
	| "delete-after";

export type DefaultAssoc = 1;
export type DefaultPointMapMode = "clamp";

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
			readonly type: "block-converted";
			readonly blockId: string;
			readonly fromType: string;
			readonly toType: string;
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
	readonly originType: string;
	readonly text: readonly BlockTextChange[];
	readonly structural: readonly StructuralChange[];
	readonly isEmpty: boolean;

	mapOffset(
		blockId: string,
		offset: number,
		assoc?: Assoc,
		mode?: PointMapMode,
	): number | null;
	mapPoint(
		point: { blockId: string; offset: number },
		assoc?: Assoc,
		mode?: PointMapMode,
	): { blockId: string; offset: number } | null;
	mapRange(
		range: { anchor: Point; focus: Point },
		options?: { anchorAssoc?: Assoc; focusAssoc?: Assoc; mode?: PointMapMode },
	): { anchor: Point; focus: Point } | null;

	compose(next: ChangeSummary): ChangeSummary;
}
