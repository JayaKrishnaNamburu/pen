// @ts-nocheck
import type { Editor } from "@pen/types";
import type { DatabaseViewState, TableColumnSchema } from "@pen/types";
import type { DocumentMutationPlan } from "../planTypes";
import type { AITargetKind } from "../contracts";
import { buildStructuralReviewItems, buildStructuredPreviewTargets, buildStructuralPreviewArtifacts, selectStructuralReviewItemPlan, removeStructuralReviewItemPlan, buildReviewItemsForPlan, serializeStructuredPreviewTargets, buildDatabaseReviewItems, createReviewItem, createReviewItemId } from "./reviewArtifactsPart1";
import type { StructuralReviewItem, StructuralReviewComparisonRow, StructuralReviewBuildContext, DatabaseReviewSnapshot, StructuredPreviewDatabaseState, StructuredPreviewTargetState, VirtualReviewBlock } from "./reviewArtifactsPart1";
import { registerInsertedReviewBlock, describeInsertedBlockAfter, getDatabaseReviewSnapshot, cloneDatabaseReviewSnapshot, createDefaultDatabaseReviewSnapshot, applyDatabaseStepToReviewSnapshot, summarizeColumns, summarizeViews, findDatabaseReviewRowIndex, findColumnIndex, resolveColumnLabel, resolveDatabaseColumnLabel, resolveDatabaseRowLabel, resolveDatabaseActiveViewSnapshot, resolveViewLabel, formatColumnSchema, formatViewState, formatDatabaseValueKeys, stringifyRecord, stringifyDatabaseValue } from "./reviewArtifactsPart3";
import { buildColumnComparisonRows, buildColumnSchemaComparisonRows, buildViewComparisonRows, areColumnSchemasEqual, formatViewSort } from "./reviewArtifactsPart4";

export function selectPlanAtPath(
	plan: DocumentMutationPlan,
	bundlePath: number[],
	stepIndex: number | null,
): DocumentMutationPlan | null {
	if (bundlePath.length > 0) {
		if (plan.kind !== "review_bundle") {
			return null;
		}
		const [head, ...tail] = bundlePath;
		const nestedPlan = plan.plans[head];
		if (!nestedPlan) {
			return null;
		}
		return selectPlanAtPath(nestedPlan, tail, stepIndex);
	}

	if (stepIndex == null) {
		return plan;
	}

	if (plan.kind === "database_edit") {
		const step = plan.steps[stepIndex];
		return step ? { ...plan, steps: [step] } : null;
	}
	if (plan.kind === "flow_patch") {
		const edit = plan.edits[stepIndex];
		return edit ? { ...plan, edits: [edit] } : null;
	}

	return null;
}

export function removePlanAtPath(
	plan: DocumentMutationPlan,
	bundlePath: number[],
	stepIndex: number | null,
): DocumentMutationPlan | null {
	if (bundlePath.length > 0) {
		if (plan.kind !== "review_bundle") {
			return null;
		}
		const [head, ...tail] = bundlePath;
		const nestedPlan = plan.plans[head];
		if (!nestedPlan) {
			return plan;
		}
		const nextNestedPlan = removePlanAtPath(nestedPlan, tail, stepIndex);
		const nextPlans = plan.plans.flatMap((entry, index) => {
			if (index !== head) {
				return [entry];
			}
			return nextNestedPlan ? [nextNestedPlan] : [];
		});
		if (nextPlans.length === 0) {
			return null;
		}
		if (nextPlans.length === 1) {
			return nextPlans[0] ?? null;
		}
		return { ...plan, plans: nextPlans };
	}

	if (stepIndex == null) {
		return null;
	}

	if (plan.kind === "database_edit") {
		const nextSteps = plan.steps.filter((_, index) => index !== stepIndex);
		return nextSteps.length > 0 ? { ...plan, steps: nextSteps } : null;
	}
	if (plan.kind === "flow_patch") {
		const nextEdits = plan.edits.filter((_, index) => index !== stepIndex);
		return nextEdits.length > 0 ? { ...plan, edits: nextEdits } : null;
	}

	return null;
}

export function describeTextEditLabel(
	operation: "replace" | "insert" | "append",
): string {
	if (operation === "replace") {
		return "Replace text";
	}
	if (operation === "insert") {
		return "Insert text";
	}
	return "Append text";
}

export function describeTextEditChangeKind(
	operation: "replace" | "insert" | "append",
): StructuralReviewItem["changeKind"] {
	return operation === "replace" ? "updated" : "added";
}

export function describeDatabaseStepLabel(step: string): string {
	switch (step) {
		case "add_column":
			return "Add column";
		case "update_column":
			return "Update column";
		case "insert_row":
			return "Insert row";
		case "update_cell":
			return "Update cell";
		case "add_view":
			return "Add view";
		case "set_active_view":
			return "Set active view";
		default:
			return "Database change";
	}
}

export function describeDatabaseStepChangeKind(
	step: string,
): StructuralReviewItem["changeKind"] {
	switch (step) {
		case "add_column":
		case "insert_row":
		case "add_view":
			return "added";
		case "update_column":
		case "update_cell":
		case "set_active_view":
		default:
			return "updated";
	}
}

export function describeDatabaseStepSection(
	step: string,
): StructuralReviewItem["section"] {
	switch (step) {
		case "add_column":
		case "update_column":
			return "schema";
		case "insert_row":
			return "row";
		case "update_cell":
			return "cell";
		case "add_view":
		case "set_active_view":
		default:
			return "view";
	}
}

export function describeDatabaseStepSummary(
	blockId: string,
	step: Extract<
		DocumentMutationPlan,
		{ kind: "database_edit" }
	>["steps"][number],
): string {
	switch (step.op) {
		case "add_column":
			return `Adds a column to database "${blockId}".`;
		case "update_column":
			return `Updates a column in database "${blockId}".`;
		case "insert_row":
			return `Adds a row to database "${blockId}".`;
		case "update_cell":
			return `Updates a database cell in "${blockId}".`;
		case "add_view":
			return `Adds a view to database "${blockId}".`;
		case "set_active_view":
			return `Changes the active view for database "${blockId}".`;
	}
}

export function describeDatabaseStepDetail(
	snapshot: DatabaseReviewSnapshot | null,
	step: Extract<
		DocumentMutationPlan,
		{ kind: "database_edit" }
	>["steps"][number],
): string | undefined {
	switch (step.op) {
		case "add_column":
			return resolveColumnLabel(step.column);
		case "update_column":
			return resolveDatabaseColumnLabel(snapshot?.columns ?? [], step.columnId);
		case "insert_row":
			return formatDatabaseValueKeys(snapshot?.columns ?? [], step.values);
		case "update_cell":
			return `${resolveDatabaseRowLabel(snapshot, step.rowId)} · ${resolveDatabaseColumnLabel(snapshot?.columns ?? [], step.columnId)}`;
		case "add_view":
			return resolveViewLabel(step.view);
		case "set_active_view":
			return (
				snapshot?.views.find((view) => view.id === step.viewId)?.title ??
				snapshot?.views.find((view) => view.id === step.viewId)?.id ??
				step.viewId
			);
	}
}

export function describeDatabaseStepPreview(
	step: Extract<
		DocumentMutationPlan,
		{ kind: "database_edit" }
	>["steps"][number],
): string | undefined {
	switch (step.op) {
		case "update_cell":
			return stringifyReviewValue(step.value);
		case "insert_row":
			return stringifyReviewValue(step.values);
		default:
			return undefined;
	}
}

export function describeDatabaseStepBefore(
	snapshot: DatabaseReviewSnapshot | null,
	step: Extract<
		DocumentMutationPlan,
		{ kind: "database_edit" }
	>["steps"][number],
): string | undefined {
	switch (step.op) {
		case "add_column":
			return summarizeColumns(snapshot?.columns ?? []);
		case "update_column":
			return formatColumnSchema(
				snapshot?.columns.find((column) => column.id === step.columnId),
			);
		case "insert_row":
			return snapshot ? `${snapshot.rows.length} rows` : undefined;
		case "update_cell": {
			if (!snapshot) {
				return undefined;
			}
			const rowIndex = findDatabaseReviewRowIndex(snapshot, step.rowId);
			const colIndex = findColumnIndex(snapshot.columns, step.columnId);
			if (rowIndex === -1 || colIndex === -1) {
				return undefined;
			}
			const columnId = snapshot.columns[colIndex]?.id;
			return columnId ? snapshot.rows[rowIndex]?.values[columnId] ?? "" : undefined;
		}
		case "add_view":
			return summarizeViews(snapshot?.views ?? []);
		case "set_active_view":
			return snapshot ? resolveViewLabel(resolveDatabaseActiveViewSnapshot(snapshot)) : undefined;
	}
}

export function describeDatabaseStepAfter(
	snapshot: DatabaseReviewSnapshot | null,
	step: Extract<
		DocumentMutationPlan,
		{ kind: "database_edit" }
	>["steps"][number],
): string | undefined {
	switch (step.op) {
		case "add_column":
			return formatColumnSchema(step.column);
		case "update_column": {
			const column = snapshot?.columns.find((entry) => entry.id === step.columnId);
			return formatColumnSchema(column ? { ...column, ...step.patch } : undefined);
		}
		case "insert_row":
			return snapshot ? `${snapshot.rows.length + 1} rows` : undefined;
		case "update_cell":
			return stringifyReviewValue(step.value);
		case "add_view":
			return formatViewState(step.view, snapshot?.columns ?? []);
		case "set_active_view": {
			const nextView = snapshot?.views.find((view) => view.id === step.viewId);
			return resolveViewLabel(nextView) ?? step.viewId;
		}
	}
}

export function describeDatabaseStepComparisonRows(
	snapshot: DatabaseReviewSnapshot | null,
	step: Extract<
		DocumentMutationPlan,
		{ kind: "database_edit" }
	>["steps"][number],
): StructuralReviewComparisonRow[] | undefined {
	switch (step.op) {
		case "add_column":
			return [
				{
					label: "Column",
					before: undefined,
					after: formatColumnSchema(step.column),
					changeKind: "added",
					section: "schema",
				},
			];
		case "update_column": {
			const column = snapshot?.columns.find((entry) => entry.id === step.columnId);
			const nextColumn = column ? { ...column, ...step.patch } : undefined;
			if (!column && !nextColumn) {
				return undefined;
			}
			return buildColumnSchemaComparisonRows(column, nextColumn);
		}
		case "add_view":
			return buildViewComparisonRows(undefined, step.view, snapshot?.columns ?? []);
		case "set_active_view":
			return buildViewComparisonRows(
				resolveDatabaseActiveViewSnapshot(snapshot) ?? undefined,
				snapshot?.views.find((view) => view.id === step.viewId),
				snapshot?.columns ?? [],
			);
		default:
			return undefined;
	}
}

export function stringifyReviewValue(value: unknown): string | undefined {
	if (value == null) {
		return undefined;
	}
	if (typeof value === "string") {
		return value;
	}
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

export function readTextEditBefore(
	editor: Editor,
	plan: Extract<DocumentMutationPlan, { kind: "text_edit" }>,
): string | undefined {
	const block = editor.getBlock(plan.target.blockId);
	if (!block) {
		return undefined;
	}
	const text = block.textContent();
	if (plan.target.range) {
		return text.slice(
			plan.target.range.startOffset,
			plan.target.range.endOffset,
		);
	}
	return text;
}

export function readBlockPropsPreview(editor: Editor, blockId: string): string | undefined {
	const block = editor.getBlock(blockId);
	return block ? stringifyReviewValue(block.props) : undefined;
}

export function readBlockTypePreview(editor: Editor, blockId: string): string | undefined {
	const block = editor.getBlock(blockId);
	return block?.type;
}
