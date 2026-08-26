import type { AITargetKind } from "../contracts";
import type { DocumentMutationPlan } from "../planTypes";

export interface StructuralReviewItem {
	id: string;
	targetKind: AITargetKind | "bundle";
	planKind: DocumentMutationPlan["kind"];
	changeKind: "added" | "removed" | "updated" | "moved";
	section: "content" | "block" | "row" | "cell" | "schema" | "view";
	groupId: string;
	groupLabel: string;
	label: string;
	summary: string;
	detail?: string;
	preview?: string;
	before?: string;
	after?: string;
	comparisonRows?: StructuralReviewComparisonRow[];
	bundlePath: number[];
	stepIndex: number | null;
}

export interface StructuralReviewComparisonRow {
	label: string;
	before?: string;
	after?: string;
	changeKind: "added" | "removed" | "updated";
	section: "schema" | "view";
}
