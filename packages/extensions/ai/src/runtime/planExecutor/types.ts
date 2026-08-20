import type { DocumentOp } from "@input/pen-types";

export interface PlanExecutionIssue {
	path: string;
	code:
		| "missing-block"
		| "invalid-target"
		| "unsupported-target"
		| "invalid-range";
	message: string;
}

export interface PlanExecutionResult {
	ops: DocumentOp[];
	issues: PlanExecutionIssue[];
	reviewSafe: boolean;
	metrics?: PlanExecutionMetrics;
}

export interface PlanExecutionMetrics {
	flowPatchAlignment?: FlowPatchAlignmentMetrics;
}

export interface FlowPatchAlignmentMetrics {
	preservedBlockCount: number;
	rewrittenBlockCount: number;
	unchangedBlockCount: number;
	insertedBlockCount: number;
	deletedBlockCount: number;
	estimatedOperationCost: number;
}

export interface VirtualBlockState {
	type: string;
	props: Record<string, unknown>;
	textLength: number;
}

export interface PlanExecutionContext {
	virtualBlocks: Map<string, VirtualBlockState>;
}

export interface PendingInlineMark {
	type: string;
	props?: Record<string, unknown>;
	start: number;
	end: number;
}

export interface PendingInlineBlock {
	type: string;
	props: Record<string, unknown>;
	content?: string;
	marks?: PendingInlineMark[];
	children?: unknown[];
}

export interface InlineAlignmentStep {
	kind: "substitute" | "insert" | "delete";
	targetIndex?: number;
	parsedIndex?: number;
}

export interface InlineAlignmentResolution {
	steps: InlineAlignmentStep[];
	metrics: FlowPatchAlignmentMetrics;
}
