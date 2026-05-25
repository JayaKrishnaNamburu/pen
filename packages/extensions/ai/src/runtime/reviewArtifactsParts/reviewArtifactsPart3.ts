// @ts-nocheck
import type { Editor } from "@pen/types";
import type { DatabaseViewState, TableColumnSchema } from "@pen/types";
import type { DocumentMutationPlan } from "../planTypes";
import type { AITargetKind } from "../contracts";
import { buildStructuralReviewItems, buildStructuredPreviewTargets, buildStructuralPreviewArtifacts, selectStructuralReviewItemPlan, removeStructuralReviewItemPlan, buildReviewItemsForPlan, serializeStructuredPreviewTargets, buildDatabaseReviewItems, createReviewItem, createReviewItemId } from "./reviewArtifactsPart1";
import type { StructuralReviewItem, StructuralReviewComparisonRow, StructuralReviewBuildContext, DatabaseReviewSnapshot, StructuredPreviewDatabaseState, StructuredPreviewTargetState, VirtualReviewBlock } from "./reviewArtifactsPart1";
import { selectPlanAtPath, removePlanAtPath, describeTextEditLabel, describeTextEditChangeKind, describeDatabaseStepLabel, describeDatabaseStepChangeKind, describeDatabaseStepSection, describeDatabaseStepSummary, describeDatabaseStepDetail, describeDatabaseStepPreview, describeDatabaseStepBefore, describeDatabaseStepAfter, describeDatabaseStepComparisonRows, stringifyReviewValue, readTextEditBefore, readBlockPropsPreview, readBlockTypePreview } from "./reviewArtifactsPart2";
import { buildColumnComparisonRows, buildColumnSchemaComparisonRows, buildViewComparisonRows, areColumnSchemasEqual, formatViewSort } from "./reviewArtifactsPart4";

export function registerInsertedReviewBlock(
	context: StructuralReviewBuildContext,
	plan: Extract<DocumentMutationPlan, { kind: "block_insert" }>,
): void {
	if (!plan.blockId) {
		return;
	}
	if (plan.blockType === "database") {
		context.virtualBlocks.set(plan.blockId, {
			type: "database",
			database: createDefaultDatabaseReviewSnapshot(),
		});
	}
}

export function describeInsertedBlockAfter(
	plan: Extract<DocumentMutationPlan, { kind: "block_insert" }>,
): string | undefined {
	if (plan.initialText) {
		return plan.initialText;
	}
	if (plan.blockType === "database") {
		return "3 columns, 0 rows, 1 view";
	}
	return plan.blockType;
}

export function getDatabaseReviewSnapshot(
	editor: Editor,
	blockId: string,
	context: StructuralReviewBuildContext,
): DatabaseReviewSnapshot | null {
	const virtualBlock = context.virtualBlocks.get(blockId);
	if (virtualBlock?.type === "database") {
		return cloneDatabaseReviewSnapshot(virtualBlock.database);
	}
	const block = editor.getBlock(blockId);
	if (!block || block.type !== "database") {
		return null;
	}
	const columns = [...block.tableColumns()];
	const rows = Array.from({ length: block.tableRowCount() }, (_, rowIndex) => {
		const rowId = block.tableRow(rowIndex)?.id ?? `row-${rowIndex + 1}`;
		return {
			id: rowId,
			values: Object.fromEntries(
				columns.map((column, colIndex) => [
					column.id,
					block.tableCell(rowIndex, colIndex)?.textContent() ?? "",
				]),
			),
		};
	});
	return {
		columns,
		rows,
		views: [...block.databaseViews()],
		primaryViewId: block.databasePrimaryViewId(),
	};
}

export function cloneDatabaseReviewSnapshot(
	snapshot: DatabaseReviewSnapshot,
): DatabaseReviewSnapshot {
	return {
		columns: snapshot.columns.map((column) => ({ ...column })),
		rows: snapshot.rows.map((row) => ({
			id: row.id,
			values: { ...row.values },
		})),
		views: snapshot.views.map((view) => ({
			...view,
			visibleColumnIds: view.visibleColumnIds ? [...view.visibleColumnIds] : undefined,
			columnOrder: view.columnOrder ? [...view.columnOrder] : undefined,
			sort: view.sort ? [...view.sort] : undefined,
			rowPinning: view.rowPinning ? { ...view.rowPinning } : undefined,
		})),
		primaryViewId: snapshot.primaryViewId,
	};
}

export function createDefaultDatabaseReviewSnapshot(): DatabaseReviewSnapshot {
	const columns: TableColumnSchema[] = [
		{ id: "name", title: "Name", type: "text" },
		{ id: "tags", title: "Tags", type: "select" },
		{ id: "done", title: "Done", type: "checkbox" },
	];
	const primaryViewId = "view-table";
	return {
		columns,
		rows: [],
		views: [
			{
				id: primaryViewId,
				title: "Table",
				type: "table",
				visibleColumnIds: columns.map((column) => column.id),
				columnOrder: columns.map((column) => column.id),
			},
		],
		primaryViewId,
	};
}

export function applyDatabaseStepToReviewSnapshot(
	snapshot: DatabaseReviewSnapshot,
	step: Extract<DocumentMutationPlan, { kind: "database_edit" }>["steps"][number],
): void {
	switch (step.op) {
		case "add_column":
			snapshot.columns.push({ ...step.column });
			for (const row of snapshot.rows) {
				row.values[step.column.id] = "";
			}
			return;
		case "update_column": {
			const columnIndex = snapshot.columns.findIndex(
				(column) => column.id === step.columnId,
			);
			if (columnIndex !== -1) {
				snapshot.columns[columnIndex] = {
					...snapshot.columns[columnIndex]!,
					...step.patch,
				};
			}
			return;
		}
		case "insert_row":
			snapshot.rows.push({
				id: step.rowId ?? `row-${snapshot.rows.length + 1}`,
				values: stringifyRecord(step.values),
			});
			return;
		case "update_cell": {
			const row = snapshot.rows.find((entry) => entry.id === step.rowId);
			if (row) {
				row.values[step.columnId] = stringifyDatabaseValue(step.value);
			}
			return;
		}
		case "add_view":
			snapshot.views.push({
				...step.view,
				visibleColumnIds: step.view.visibleColumnIds
					? [...step.view.visibleColumnIds]
					: undefined,
				columnOrder: step.view.columnOrder ? [...step.view.columnOrder] : undefined,
				sort: step.view.sort ? [...step.view.sort] : undefined,
				rowPinning: step.view.rowPinning ? { ...step.view.rowPinning } : undefined,
			});
			return;
		case "set_active_view":
			snapshot.primaryViewId = step.viewId;
			return;
	}
}

export function summarizeColumns(columns: readonly TableColumnSchema[]): string | undefined {
	if (columns.length === 0) {
		return undefined;
	}
	return columns.map(formatColumnSchema).filter(Boolean).join(", ");
}

export function summarizeViews(views: readonly DatabaseViewState[]): string | undefined {
	if (views.length === 0) {
		return undefined;
	}
	return views.map((view) => resolveViewLabel(view)).filter(Boolean).join(", ");
}

export function findDatabaseReviewRowIndex(
	snapshot: DatabaseReviewSnapshot,
	rowId: string,
): number {
	for (let index = 0; index < snapshot.rows.length; index += 1) {
		if (snapshot.rows[index]?.id === rowId) {
			return index;
		}
	}
	return -1;
}

export function findColumnIndex(
	columns: readonly TableColumnSchema[],
	columnId: string,
): number {
	return columns.findIndex((column) => column.id === columnId);
}

export function resolveColumnLabel(column: TableColumnSchema | undefined): string {
	return column?.title || column?.id || "Column";
}

export function resolveDatabaseColumnLabel(
	columns: readonly TableColumnSchema[],
	columnId: string,
): string {
	const column = columns.find((entry) => entry.id === columnId);
	return column ? resolveColumnLabel(column) : columnId;
}

export function resolveDatabaseRowLabel(
	snapshot: DatabaseReviewSnapshot | null,
	rowId: string,
): string {
	if (!snapshot) {
		return rowId;
	}
	const rowIndex = findDatabaseReviewRowIndex(snapshot, rowId);
	if (rowIndex === -1) {
		return rowId;
	}

	const columns = snapshot.columns;
	const preferredColumnIds = [
		columns.find((column) => column.title.toLowerCase() === "name")?.id,
		columns[0]?.id,
	].filter(Boolean) as string[];

	for (const columnId of preferredColumnIds) {
		const value = snapshot.rows[rowIndex]?.values[columnId]?.trim();
		if (value) {
			return value;
		}
	}

	return `Row ${rowIndex + 1}`;
}

export function resolveDatabaseActiveViewSnapshot(
	snapshot: DatabaseReviewSnapshot | null,
): DatabaseViewState | null {
	if (!snapshot) {
		return null;
	}
	if (!snapshot.primaryViewId) {
		return snapshot.views[0] ?? null;
	}
	return (
		snapshot.views.find((view) => view.id === snapshot.primaryViewId) ??
		snapshot.views[0] ??
		null
	);
}

export function resolveViewLabel(view: DatabaseViewState | null | undefined): string | undefined {
	if (!view) {
		return undefined;
	}
	return view.title ?? view.id;
}

export function formatColumnSchema(
	column: TableColumnSchema | undefined,
): string | undefined {
	if (!column) {
		return undefined;
	}

	const parts = [`${resolveColumnLabel(column)} [${column.type}]`];
	if (column.width != null) {
		parts.push(`w:${column.width}`);
	}
	if (column.hidden) {
		parts.push("hidden");
	}
	if (column.pinned) {
		parts.push(`pinned:${column.pinned}`);
	}
	return parts.join(" ");
}

export function formatViewState(
	view: DatabaseViewState | undefined,
	columns: readonly TableColumnSchema[],
): string | undefined {
	if (!view) {
		return undefined;
	}

	const parts = [`${resolveViewLabel(view)} [${view.type}]`];
	if (view.groupBy) {
		parts.push(`group:${resolveDatabaseColumnLabel(columns, view.groupBy)}`);
	}
	if (view.visibleColumnIds && view.visibleColumnIds.length > 0) {
		parts.push(
			`visible:${view.visibleColumnIds
				.map((columnId) => resolveDatabaseColumnLabel(columns, columnId))
				.join(", ")}`,
		);
	}
	return parts.join(" ");
}

export function formatDatabaseValueKeys(
	columns: readonly TableColumnSchema[],
	values: Record<string, unknown>,
): string | undefined {
	const keys = Object.keys(values);
	if (keys.length === 0) {
		return undefined;
	}
	return keys
		.map((key) => resolveDatabaseColumnLabel(columns, key))
		.join(", ");
}

export function stringifyRecord(
	value: Record<string, unknown>,
): Record<string, string> {
	return Object.fromEntries(
		Object.entries(value).map(([key, entryValue]) => [
			key,
			stringifyDatabaseValue(entryValue),
		]),
	);
}

export function stringifyDatabaseValue(value: unknown): string {
	if (value == null) {
		return "";
	}
	if (typeof value === "string") {
		return value;
	}
	if (
		typeof value === "number" ||
		typeof value === "boolean" ||
		typeof value === "bigint"
	) {
		return String(value);
	}
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}
