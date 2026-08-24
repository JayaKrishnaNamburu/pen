import type { DocumentOp, StructuralOriginTag } from "@input/pen-types";

export type RecordedAuthorityOp =
	| {
			readonly type: "insert-block";
			readonly blockId: string;
			readonly blockType: string;
			readonly props: Record<string, unknown>;
			readonly position: "last" | { readonly after: string };
	  }
	| {
			readonly type: "insert-text";
			readonly blockId: string;
			readonly offset: number;
			readonly text: string;
	  }
	| {
			readonly type: "splice-text";
			readonly blockId: string;
			readonly from: number;
			readonly to: number;
			readonly insert: string;
	  }
	| {
			readonly type: "split-block";
			readonly blockId: string;
			readonly offset: number;
			readonly newBlockId: string;
	  }
	| {
			readonly type: "merge-blocks";
			readonly targetBlockId: string;
			readonly sourceBlockId: string;
	  }
	| {
			readonly type: "delete-block";
			readonly blockId: string;
	  };

export type AuthorityReplayBlock = {
	readonly type?: string;
	readonly text?: string;
};

export type AuthorityReplayContext = {
	readonly readBlock?: (blockId: string) => AuthorityReplayBlock | null;
};

export type AuthorityTraceKind = "split" | "merge" | "remove";

export function structuralSequenceLabel(kind: AuthorityTraceKind): string;

export function setupBlocksFromRecordedOps(
	setup: readonly RecordedAuthorityOp[],
): Map<string, { type: string; text: string }>;

export function replayContextFromSetup(
	setup: readonly RecordedAuthorityOp[],
): AuthorityReplayContext;

export function translateRecordedAuthorityOp(
	op: RecordedAuthorityOp,
	context?: AuthorityReplayContext,
): DocumentOp[];

export function translateRecordedAuthorityOps(
	ops: readonly RecordedAuthorityOp[],
	context?: AuthorityReplayContext,
): DocumentOp[];

export function structuralFromRecordedCommit(
	commit: readonly RecordedAuthorityOp[],
): StructuralOriginTag | undefined;

export function commitIsStructuralSequence(
	kind: AuthorityTraceKind,
	commit: readonly RecordedAuthorityOp[],
	setup?: readonly RecordedAuthorityOp[],
): boolean;
