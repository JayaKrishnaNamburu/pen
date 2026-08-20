import type { Position } from "@input/pen-types";

export const DOCUMENT_MUTATION_PLAN_KINDS = [
	"text_edit",
	"flow_patch",
	"block_insert",
	"block_update",
	"block_move",
	"block_convert",
	"review_bundle",
] as const;

export type DocumentMutationPlanKind =
	(typeof DOCUMENT_MUTATION_PLAN_KINDS)[number];

export interface PlanTextRange {
	startOffset: number;
	endOffset: number;
}

export interface PlanConfidence {
	score?: number;
	reason?: string;
}

export interface TextEditPlan {
	kind: "text_edit";
	target: {
		blockId: string;
		range?: PlanTextRange;
	};
	operation: "replace" | "insert" | "append";
	text: string;
	confidence?: PlanConfidence;
}

export interface FlowPatchLocator {
	blockId?: string;
	blockIds?: string[];
	retrievedSpanId?: string;
	expectedBlockType?: string;
	anchorBefore?: string;
	anchorAfter?: string;
}

export type FlowPatchEditOperation =
	| "replace_text"
	| "append_text"
	| "insert_before"
	| "insert_after"
	| "replace_blocks"
	| "delete_blocks";

export interface FlowPatchEdit {
	operation: FlowPatchEditOperation;
	locator: FlowPatchLocator;
	text?: string;
	markdown?: string;
	confidence?: PlanConfidence;
}

export interface FlowPatchPlan {
	kind: "flow_patch";
	instructions: string;
	scope?: "single-block" | "adjacent-blocks" | "section";
	targetSpanId?: string;
	edits: FlowPatchEdit[];
	confidence?: PlanConfidence;
}

export interface BlockInsertPlan {
	kind: "block_insert";
	blockId?: string;
	blockType: string;
	position: Position;
	props?: Record<string, unknown>;
	initialText?: string;
	confidence?: PlanConfidence;
}

export interface BlockUpdatePlan {
	kind: "block_update";
	blockId: string;
	props: Record<string, unknown>;
	confidence?: PlanConfidence;
}

export interface BlockMovePlan {
	kind: "block_move";
	blockId: string;
	position: Position;
	confidence?: PlanConfidence;
}

export interface BlockConvertPlan {
	kind: "block_convert";
	blockId: string;
	newType: string;
	props?: Record<string, unknown>;
	confidence?: PlanConfidence;
}

export interface ReviewBundlePlan {
	kind: "review_bundle";
	label: string;
	reason: string;
	plans: DocumentMutationPlan[];
	confidence?: PlanConfidence;
}

export type DocumentMutationPlan =
	| TextEditPlan
	| FlowPatchPlan
	| BlockInsertPlan
	| BlockUpdatePlan
	| BlockMovePlan
	| BlockConvertPlan
	| ReviewBundlePlan;
