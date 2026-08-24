import type { AppPlacement } from "./block";

export type OpOriginType =
	| "user"
	| "ai"
	| "ai-session"
	| "suggestion-resolution"
	| "collaborator"
	| "extension"
	| "history"
	| "input-rule"
	| "app"
	| "import"
	| "system"
	| "migration";

export interface StructuredOpOrigin {
	type: OpOriginType | (string & {});
	groupId?: string;
	requestId?: string;
	actorId?: string;
	source?: string;
	intent?: string;
}

export type OpOrigin = OpOriginType | StructuredOpOrigin;

export interface MutationGroupMetadata {
	groupId: string;
	originType: string;
	requestId?: string;
	actorId?: string;
	source?: string;
}

export type StructuralOriginTag =
	| {
			kind: "split";
			blockId: string;
			newBlockId: string;
			offset: number;
	  }
	| {
			kind: "merge";
			targetBlockId: string;
			sourceBlockId: string;
	  };

export interface ApplyOptions {
	origin?: OpOrigin;
	undoGroup?: boolean;
	groupId?: string;
	undoGroupId?: string;
	/** In-transaction AN14 stamp for split/merge recipes. Not hung on origin. */
	structural?: StructuralOriginTag;
}

export const MUTATION_GROUP_METADATA_KEY = "mutation-group";

export type Position =
	| "first"
	| "last"
	| { before: string }
	| { after: string }
	| { parent: string; index: number };

// ── Document Operations ─────────────────────────────────────

export type DocumentOp =
	| SpliceTextOp
	| FormatTextOp
	| InsertBlockOp
	| DeleteBlockOp
	| MoveBlockOp
	| SetPropsOp
	| SetMetaOp
	| GridOp
	| AppOp
	| StreamOpenOp;

export type InlineInsert =
	| string
	| { readonly nodeType: string; readonly props: Record<string, unknown> };

export interface SpliceTextOp {
	type: "splice-text";
	blockId: string;
	cell?: { row: number; col: number };
	from: number;
	to: number;
	insert: InlineInsert | readonly InlineInsert[];
	marks?: Record<string, unknown | null>;
}

export interface FormatTextOp {
	type: "format-text";
	blockId: string;
	cell?: { row: number; col: number };
	from: number;
	to: number;
	marks: Record<string, unknown | null>;
}

export interface InsertBlockOp {
	type: "insert-block";
	blockId: string;
	blockType: string;
	props: Record<string, unknown>;
	position: Position;
}

export interface DeleteBlockOp {
	type: "delete-block";
	blockId: string;
}

export interface MoveBlockOp {
	type: "move-block";
	blockId: string;
	position: Position;
}

export interface SetPropsOp {
	type: "set-props";
	blockId: string;
	props: Record<string, unknown | null>;
}

export interface SetMetaOp {
	type: "set-meta";
	blockId: string;
	namespace: string;
	data: Record<string, unknown> | null;
}

export type GridChange =
	| { kind: "insert-row"; index: number }
	| { kind: "delete-row"; index: number }
	| { kind: "insert-column"; index: number }
	| { kind: "delete-column"; index: number }
	| {
			kind: "merge-cells";
			anchor: { row: number; col: number };
			head: { row: number; col: number };
	  }
	| { kind: "split-cell"; row: number; col: number };

export interface GridOp {
	type: "grid";
	blockId: string;
	change: GridChange;
}

export type AppChange =
	| {
			kind: "create";
			appId: string;
			appType: string;
			config: Record<string, unknown>;
			placement: AppPlacement;
	  }
	| { kind: "update"; appId: string; patch: Record<string, unknown> }
	| { kind: "delete"; appId: string };

export interface AppOp {
	type: "app";
	change: AppChange;
}

/** Synthetic open-time op for stream veto (`06-commit-pipeline.md` ST1). */
export interface StreamOpenOp {
	type: "stream-open";
	blockId: string;
}
