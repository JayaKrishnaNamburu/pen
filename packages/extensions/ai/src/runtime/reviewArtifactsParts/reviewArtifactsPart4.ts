// @ts-nocheck
import type { Editor } from "@pen/types";
import type { DatabaseViewState, TableColumnSchema } from "@pen/types";
import type { DocumentMutationPlan } from "../planTypes";
import type { AITargetKind } from "../contracts";
import { buildStructuralReviewItems, buildStructuredPreviewTargets, buildStructuralPreviewArtifacts, selectStructuralReviewItemPlan, removeStructuralReviewItemPlan, buildReviewItemsForPlan, serializeStructuredPreviewTargets, buildDatabaseReviewItems, createReviewItem, createReviewItemId } from "./reviewArtifactsPart1";
import type { StructuralReviewItem, StructuralReviewComparisonRow, StructuralReviewBuildContext, DatabaseReviewSnapshot, StructuredPreviewDatabaseState, StructuredPreviewTargetState, VirtualReviewBlock } from "./reviewArtifactsPart1";
import { selectPlanAtPath, removePlanAtPath, describeTextEditLabel, describeTextEditChangeKind, describeDatabaseStepLabel, describeDatabaseStepChangeKind, describeDatabaseStepSection, describeDatabaseStepSummary, describeDatabaseStepDetail, describeDatabaseStepPreview, describeDatabaseStepBefore, describeDatabaseStepAfter, describeDatabaseStepComparisonRows, stringifyReviewValue, readTextEditBefore, readBlockPropsPreview, readBlockTypePreview } from "./reviewArtifactsPart2";
import { registerInsertedReviewBlock, describeInsertedBlockAfter, getDatabaseReviewSnapshot, cloneDatabaseReviewSnapshot, createDefaultDatabaseReviewSnapshot, applyDatabaseStepToReviewSnapshot, summarizeColumns, summarizeViews, findDatabaseReviewRowIndex, findColumnIndex, resolveColumnLabel, resolveDatabaseColumnLabel, resolveDatabaseRowLabel, resolveDatabaseActiveViewSnapshot, resolveViewLabel, formatColumnSchema, formatViewState, formatDatabaseValueKeys, stringifyRecord, stringifyDatabaseValue } from "./reviewArtifactsPart3";

export function buildColumnComparisonRows(
	beforeColumns: readonly TableColumnSchema[],
	afterColumns: readonly TableColumnSchema[],
): StructuralReviewComparisonRow[] | undefined {
	const rows: StructuralReviewComparisonRow[] = [];
	const beforeOrder = beforeColumns.map((column) => resolveColumnLabel(column)).join(", ");
	const afterOrder = afterColumns.map((column) => resolveColumnLabel(column)).join(", ");
	if (beforeOrder !== afterOrder) {
		rows.push({
			label: "Order",
			before: beforeOrder || undefined,
			after: afterOrder || undefined,
			changeKind: "updated",
			section: "schema",
		});
	}

	const beforeById = new Map(beforeColumns.map((column) => [column.id, column]));
	const afterById = new Map(afterColumns.map((column) => [column.id, column]));
	const allIds = [...new Set([...beforeById.keys(), ...afterById.keys()])];

	for (const id of allIds) {
		const beforeColumn = beforeById.get(id);
		const afterColumn = afterById.get(id);
		if (!beforeColumn && afterColumn) {
			rows.push({
				label: `Added ${resolveColumnLabel(afterColumn)}`,
				after: formatColumnSchema(afterColumn),
				changeKind: "added",
				section: "schema",
			});
			continue;
		}
		if (beforeColumn && !afterColumn) {
			rows.push({
				label: `Removed ${resolveColumnLabel(beforeColumn)}`,
				before: formatColumnSchema(beforeColumn),
				changeKind: "removed",
				section: "schema",
			});
			continue;
		}
		if (!beforeColumn || !afterColumn) {
			continue;
		}
		if (!areColumnSchemasEqual(beforeColumn, afterColumn)) {
			rows.push({
				label: resolveColumnLabel(afterColumn),
				before: formatColumnSchema(beforeColumn),
				after: formatColumnSchema(afterColumn),
				changeKind: "updated",
				section: "schema",
			});
		}
	}

	return rows.length > 0 ? rows : undefined;
}

export function buildColumnSchemaComparisonRows(
	beforeColumn: TableColumnSchema | undefined,
	afterColumn: TableColumnSchema | undefined,
): StructuralReviewComparisonRow[] | undefined {
	if (!beforeColumn && !afterColumn) {
		return undefined;
	}

	const rows: StructuralReviewComparisonRow[] = [];
	const label = resolveColumnLabel(afterColumn ?? beforeColumn);
	rows.push({
		label,
		before: formatColumnSchema(beforeColumn),
		after: formatColumnSchema(afterColumn),
		changeKind:
			beforeColumn == null ? "added" : afterColumn == null ? "removed" : "updated",
		section: "schema",
	});

	return rows;
}

export function buildViewComparisonRows(
	beforeView: DatabaseViewState | undefined,
	afterView: DatabaseViewState | undefined,
	columns: readonly TableColumnSchema[],
): StructuralReviewComparisonRow[] | undefined {
	if (!beforeView && !afterView) {
		return undefined;
	}

	const rows: StructuralReviewComparisonRow[] = [
		{
			label: "View",
			before: resolveViewLabel(beforeView),
			after: resolveViewLabel(afterView),
			changeKind:
				beforeView == null ? "added" : afterView == null ? "removed" : "updated",
			section: "view",
		},
		{
			label: "Type",
			before: beforeView?.type,
			after: afterView?.type,
			changeKind: "updated",
			section: "view",
		},
		{
			label: "Group by",
			before: beforeView?.groupBy
				? resolveDatabaseColumnLabel(columns, beforeView.groupBy)
				: undefined,
			after: afterView?.groupBy
				? resolveDatabaseColumnLabel(columns, afterView.groupBy)
				: undefined,
			changeKind: "updated",
			section: "view",
		},
		{
			label: "Visible columns",
			before: beforeView?.visibleColumnIds?.length
				? beforeView.visibleColumnIds
						.map((columnId) => resolveDatabaseColumnLabel(columns, columnId))
						.join(", ")
				: undefined,
			after: afterView?.visibleColumnIds?.length
				? afterView.visibleColumnIds
						.map((columnId) => resolveDatabaseColumnLabel(columns, columnId))
						.join(", ")
				: undefined,
			changeKind: "updated",
			section: "view",
		},
		{
			label: "Sort",
			before: formatViewSort(beforeView, columns),
			after: formatViewSort(afterView, columns),
			changeKind: "updated",
			section: "view",
		},
	];

	const meaningfulRows = rows.filter((row) => row.before !== row.after);
	return meaningfulRows.length > 0 ? meaningfulRows : undefined;
}

export function areColumnSchemasEqual(
	left: TableColumnSchema,
	right: TableColumnSchema,
): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

export function formatViewSort(
	view: DatabaseViewState | undefined,
	columns: readonly TableColumnSchema[],
): string | undefined {
	if (!view?.sort || view.sort.length === 0) {
		return undefined;
	}
	return view.sort
		.map(
			(sortEntry) =>
				`${resolveDatabaseColumnLabel(columns, sortEntry.columnId)} ${sortEntry.direction}`,
		)
		.join(", ");
}
