import { generateId } from "@pen/types";
import type { Position, TableColumnSchema } from "@pen/types";
import type {
	BlockConvertPlan,
	BlockInsertPlan,
	BlockMovePlan,
	BlockUpdatePlan,
	DatabaseEditPlan,
	DocumentMutationPlan,
	ReviewBundlePlan,
	TextEditPlan,
} from "./planTypes";
import type {
	ConvertBlockIntent,
	DatabaseIntent,
	InsertBlockIntent,
	MoveBlockIntent,
	ReviewBundleIntent,
	StructuredDatabaseRow,
	StructuredInsertPosition,
	StructuredIntent,
	StructuredTableColumn,
	TextEditIntent,
	UpdateBlockIntent,
} from "./structuredIntent";

export interface StructuredIntentCompilationIssue {
	path: string;
	code: "invalid-shape" | "missing-field";
	message: string;
}

export interface StructuredIntentCompilationResult {
	plan: DocumentMutationPlan | null;
	issues: StructuredIntentCompilationIssue[];
}

export function compileStructuredIntentToPlan(
	intent: StructuredIntent,
	options: { activeBlockId: string | null },
): StructuredIntentCompilationResult {
	const issues: StructuredIntentCompilationIssue[] = [];
	const plan = lowerStructuredIntent(intent, options, "intent", issues);
	return {
		plan,
		issues,
	};
}

function lowerStructuredIntent(
	intent: StructuredIntent,
	options: { activeBlockId: string | null },
	path: string,
	issues: StructuredIntentCompilationIssue[],
): DocumentMutationPlan | null {
	switch (intent.kind) {
		case "insert_block":
			return lowerInsertBlockIntent(intent, options, path, issues);
		case "update_block":
			return lowerUpdateBlockIntent(intent);
		case "move_block":
			return lowerMoveBlockIntent(intent, options, path, issues);
		case "convert_block":
			return lowerConvertBlockIntent(intent);
		case "text_edit":
			return lowerTextEditIntent(intent);
		case "database":
			return lowerDatabaseIntent(intent);
		case "review_bundle":
			return lowerReviewBundleIntent(intent, options, path, issues);
	}
}

function lowerInsertBlockIntent(
	intent: InsertBlockIntent,
	options: { activeBlockId: string | null },
	path: string,
	issues: StructuredIntentCompilationIssue[],
): DocumentMutationPlan | null {
	if (intent.blockType === "table") {
		issues.push({
			path,
			code: "invalid-shape",
			message:
				"Structured table block inserts are not supported. Use the markdown authoring lane for tables.",
		});
		return null;
	}
	const blockId = intent.blockId ?? generateId();
	const position = lowerInsertPosition(intent.position, options.activeBlockId, path, issues);
	if (!position) {
		return null;
	}
	const insertPlan: BlockInsertPlan = {
		kind: "block_insert",
		blockId,
		blockType: intent.blockType,
		position,
		props: intent.props,
		initialText: intent.initialText,
		confidence: intent.confidence,
	};
	const nestedPlans: DocumentMutationPlan[] = [insertPlan];
	if (
		intent.blockType === "database" &&
		(intent.database?.columns ||
			intent.database?.rows ||
			intent.database?.views ||
			intent.database?.activeViewId)
	) {
		const databasePlan = lowerDatabaseIntent({
			kind: "database",
			blockId,
			columns: intent.database?.columns,
			rows: intent.database?.rows,
			views: intent.database?.views,
			activeViewId: intent.database?.activeViewId,
			confidence: intent.confidence,
		});
		if (databasePlan) {
			nestedPlans.push(databasePlan);
		}
	}
	if (nestedPlans.length === 1) {
		return insertPlan;
	}
	return {
		kind: "review_bundle",
		label: `Insert ${intent.blockType}`,
		reason: `Insert a ${intent.blockType} block and seed its structured data.`,
		plans: nestedPlans,
		confidence: intent.confidence,
	};
}

function lowerUpdateBlockIntent(intent: UpdateBlockIntent): BlockUpdatePlan {
	return {
		kind: "block_update",
		blockId: intent.blockId,
		props: intent.props,
		confidence: intent.confidence,
	};
}

function lowerMoveBlockIntent(
	intent: MoveBlockIntent,
	options: { activeBlockId: string | null },
	path: string,
	issues: StructuredIntentCompilationIssue[],
): BlockMovePlan | null {
	const position = lowerInsertPosition(intent.position, options.activeBlockId, path, issues);
	if (!position) {
		return null;
	}
	return {
		kind: "block_move",
		blockId: intent.blockId,
		position,
		confidence: intent.confidence,
	};
}

function lowerConvertBlockIntent(intent: ConvertBlockIntent): BlockConvertPlan {
	return {
		kind: "block_convert",
		blockId: intent.blockId,
		newType: intent.newType,
		props: intent.props,
		confidence: intent.confidence,
	};
}

function lowerTextEditIntent(intent: TextEditIntent): TextEditPlan {
	return {
		kind: "text_edit",
		target: intent.target,
		operation: intent.operation,
		text: intent.text,
		confidence: intent.confidence,
	};
}

function lowerDatabaseIntent(intent: DatabaseIntent): DatabaseEditPlan | null {
	const columns = deriveDatabaseColumns(intent.columns, intent.rows);
	const steps: DatabaseEditPlan["steps"] = [];
	for (const column of columns) {
		steps.push({
			op: "add_column",
			column,
		});
	}
	for (const row of intent.rows ?? []) {
		steps.push({
			op: "insert_row",
			rowId: row.rowId,
			values: row.values,
		});
	}
	for (const view of intent.views ?? []) {
		steps.push({
			op: "add_view",
			view,
		});
	}
	if (intent.activeViewId) {
		steps.push({
			op: "set_active_view",
			viewId: intent.activeViewId,
		});
	}
	return {
		kind: "database_edit",
		blockId: intent.blockId,
		steps,
		confidence: intent.confidence,
	};
}

function lowerReviewBundleIntent(
	intent: ReviewBundleIntent,
	options: { activeBlockId: string | null },
	path: string,
	issues: StructuredIntentCompilationIssue[],
): ReviewBundlePlan | null {
	const plans = intent.changes
		.map((change, index) =>
			lowerStructuredIntent(change, options, `${path}.changes[${index}]`, issues),
		)
		.filter((plan): plan is DocumentMutationPlan => plan !== null);
	if (plans.length === 0) {
		issues.push({
			path: `${path}.changes`,
			code: "missing-field",
			message: "Review bundle produced no executable changes.",
		});
		return null;
	}
	return {
		kind: "review_bundle",
		label: intent.label,
		reason: intent.reason,
		plans,
		confidence: intent.confidence,
	};
}

function lowerInsertPosition(
	position: StructuredInsertPosition,
	activeBlockId: string | null,
	path: string,
	issues: StructuredIntentCompilationIssue[],
): Position | null {
	if (position === "start") {
		return "first";
	}
	if (position === "end") {
		return "last";
	}
	if (position === "before_active") {
		if (!activeBlockId) {
			issues.push({
				path: `${path}.position`,
				code: "missing-field",
				message: "Cannot resolve before_active without an active block.",
			});
			return null;
		}
		return { before: activeBlockId };
	}
	if (position === "after_active") {
		if (!activeBlockId) {
			issues.push({
				path: `${path}.position`,
				code: "missing-field",
				message: "Cannot resolve after_active without an active block.",
			});
			return null;
		}
		return { after: activeBlockId };
	}
	if ("beforeBlockId" in position) {
		return { before: position.beforeBlockId };
	}
	if ("afterBlockId" in position) {
		return { after: position.afterBlockId };
	}
	return {
		parent: position.parentId,
		index: position.index,
	};
}

function deriveDatabaseColumns(
	columns: readonly StructuredTableColumn[] | undefined,
	rows: readonly StructuredDatabaseRow[] | undefined,
): TableColumnSchema[] {
	const explicitColumns = (columns ?? []).map((column, index) =>
		toTableColumnSchema(column, index),
	);
	if (explicitColumns.length > 0) {
		return explicitColumns;
	}
	const inferredKeys = new Set<string>();
	for (const row of rows ?? []) {
		for (const key of Object.keys(row.values)) {
			inferredKeys.add(key);
		}
	}
	return [...inferredKeys].map((key, index) => ({
		id: toColumnId(key, index),
		title: key,
		type: "text",
	}));
}

function toTableColumnSchema(
	column: StructuredTableColumn,
	index: number,
): TableColumnSchema {
	return {
		id: column.id ?? toColumnId(column.title, index),
		title: column.title,
		type: column.type ?? "text",
	};
}

function toColumnId(value: string, index: number): string {
	const normalized = value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");
	return normalized.length > 0 ? normalized : `column_${index + 1}`;
}
