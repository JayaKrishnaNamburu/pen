// @ts-nocheck
import type { AIWorkingSetEnvelope } from "../../types";
import type { DatabaseViewState, TableColumnSchema } from "@pen/types";
import type { AITargetKind } from "../contracts";
import type { PlanConfidence } from "../planTypes";
import { STRUCTURED_INTENT_REQUEST_PREFIX, getStructuredIntentOutputSchema, buildStructuredIntentRequestPrompt, parseStructuredIntentRequestPrompt, buildStructuredIntentModelPrompt } from "./structuredIntentPart1";
import type { StructuredIntentKind, StructuredInsertPosition, StructuredTableColumn, StructuredDatabaseRow, StructuredDatabaseSeed, InsertBlockIntent, UpdateBlockIntent, MoveBlockIntent, ConvertBlockIntent, TextEditIntent, DatabaseIntent, ReviewBundleIntent, StructuredIntent, StructuredIntentParseIssue, StructuredIntentParseResult, StructuredIntentRequestEnvelope, StructuredIntentPromptConfig } from "./structuredIntentPart1";
import { parseStructuredIntentResult, parseStructuredIntentPreview, resolveAllowedStructuredIntentKinds, stringifyContextSummary, readStructuredIntent, readInsertBlockIntent, readUpdateBlockIntent, readMoveBlockIntent, readConvertBlockIntent, readTextEditIntent, readDatabaseIntent } from "./structuredIntentPart2";

export function readReviewBundleIntent(
	record: Record<string, unknown>,
	path: string,
	issues: StructuredIntentParseIssue[],
	options: { allowPartial: boolean; targetKind: AITargetKind },
): ReviewBundleIntent | null {
	const changes = Array.isArray(record.changes)
		? record.changes
			.map((entry, index) =>
				readStructuredIntent(entry, `${path}.changes[${index}]`, issues, options),
			)
			.filter((entry): entry is StructuredIntent => entry !== null)
		: [];
	if (changes.length === 0 && !options.allowPartial) {
		issues.push({
			path: `${path}.changes`,
			code: "missing-field",
			message: "Review bundle changes are required.",
		});
		return null;
	}
	return {
		kind: "review_bundle",
		label:
			readNonEmptyString(record.label) ??
			(options.allowPartial ? "Streaming structured changes" : ""),
		reason:
			readNonEmptyString(record.reason) ??
			(options.allowPartial ? "Streaming structured preview." : ""),
		changes,
		confidence: readConfidence(record.confidence),
	};
}

export function readStructuredPosition(
	value: unknown,
	path: string,
	issues: StructuredIntentParseIssue[],
	allowPartial: boolean,
): StructuredInsertPosition | null {
	if (
		value === "before_active" ||
		value === "after_active" ||
		value === "start" ||
		value === "end"
	) {
		return value;
	}
	const record = asRecord(value);
	if (!record) {
		if (!allowPartial) {
			issues.push({
				path,
				code: "invalid-shape",
				message: "Structured position is required.",
			});
		}
		return null;
	}
	const beforeBlockId = readNonEmptyString(record.beforeBlockId);
	if (beforeBlockId) {
		return { beforeBlockId };
	}
	const afterBlockId = readNonEmptyString(record.afterBlockId);
	if (afterBlockId) {
		return { afterBlockId };
	}
	const parentId = readNonEmptyString(record.parentId);
	if (parentId && isFiniteNumber(record.index)) {
		return { parentId, index: record.index };
	}
	if (!allowPartial) {
		issues.push({
			path,
			code: "invalid-shape",
			message: "Structured position is invalid.",
		});
	}
	return null;
}

export function readStructuredColumns(
	value: unknown,
): StructuredTableColumn[] | undefined {
	if (!Array.isArray(value)) {
		return undefined;
	}
	const columns = value.flatMap((column) => {
		const record = asRecord(column);
		const title =
			readNonEmptyString(record?.title) ?? readNonEmptyString(record?.header);
		if (!title) {
			return [];
		}
		const normalizedColumn: StructuredTableColumn = {
			id: readNonEmptyString(record?.id) ?? undefined,
			title,
			type:
				(readNonEmptyString(record?.type) as TableColumnSchema["type"] | null) ??
				"text",
		};
		return [normalizedColumn];
	});
	return columns.length > 0 ? columns : undefined;
}

export function readStructuredDatabaseRows(
	value: unknown,
): StructuredDatabaseRow[] | undefined {
	if (!Array.isArray(value)) {
		return undefined;
	}
	const rows = value.flatMap((row) => {
		const record = asRecord(row);
		const values = asRecord(record?.values);
		if (!values) {
			return [];
		}
		const normalizedRow: StructuredDatabaseRow = {
			rowId: readNonEmptyString(record?.rowId) ?? undefined,
			values,
		};
		return [normalizedRow];
	});
	return rows.length > 0 ? rows : undefined;
}

export function readStructuredDatabaseSeed(
	value: unknown,
): StructuredDatabaseSeed | undefined {
	const record = asRecord(value);
	if (!record) {
		return undefined;
	}
	const columns = readStructuredColumns(record.columns);
	const rows = readStructuredDatabaseRows(record.rows);
	const views = Array.isArray(record.views)
		? (record.views.filter((view): view is DatabaseViewState => {
			return !!view && typeof view === "object";
		}) as DatabaseViewState[])
		: undefined;
	const activeViewId = readNonEmptyString(record.activeViewId) ?? undefined;
	if (!columns && !rows && !views && !activeViewId) {
		return undefined;
	}
	return {
		columns,
		rows,
		views,
		activeViewId,
	};
}

export function readConfidence(value: unknown): PlanConfidence | undefined {
	if (value == null) {
		return undefined;
	}
	if (isFiniteNumber(value)) {
		return { score: value };
	}
	const record = asRecord(value);
	if (!record) {
		return undefined;
	}
	const confidence: PlanConfidence = {};
	if (isFiniteNumber(record.score)) {
		confidence.score = record.score;
	}
	if (readNonEmptyString(record.reason)) {
		confidence.reason = record.reason as string;
	}
	return Object.keys(confidence).length > 0 ? confidence : undefined;
}

export function readRequiredString(
	value: unknown,
	path: string,
	issues: StructuredIntentParseIssue[],
	allowPartial: boolean,
): string | null {
	const stringValue = readNonEmptyString(value);
	if (stringValue) {
		return stringValue;
	}
	if (!allowPartial) {
		issues.push({
			path,
			code: "missing-field",
			message: "Field is required.",
		});
	}
	return null;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

export function readNonEmptyString(value: unknown): string | null {
	return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}
