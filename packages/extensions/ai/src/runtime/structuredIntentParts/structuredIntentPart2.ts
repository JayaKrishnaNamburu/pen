// @ts-nocheck
import type { AIWorkingSetEnvelope } from "../../types";
import type { DatabaseViewState, TableColumnSchema } from "@pen/types";
import type { AITargetKind } from "../contracts";
import type { PlanConfidence } from "../planTypes";
import { STRUCTURED_INTENT_REQUEST_PREFIX, getStructuredIntentOutputSchema, buildStructuredIntentRequestPrompt, parseStructuredIntentRequestPrompt, buildStructuredIntentModelPrompt } from "./structuredIntentPart1";
import type { StructuredIntentKind, StructuredInsertPosition, StructuredTableColumn, StructuredDatabaseRow, StructuredDatabaseSeed, InsertBlockIntent, UpdateBlockIntent, MoveBlockIntent, ConvertBlockIntent, TextEditIntent, DatabaseIntent, ReviewBundleIntent, StructuredIntent, StructuredIntentParseIssue, StructuredIntentParseResult, StructuredIntentRequestEnvelope, StructuredIntentPromptConfig } from "./structuredIntentPart1";
import { readReviewBundleIntent, readStructuredPosition, readStructuredColumns, readStructuredDatabaseRows, readStructuredDatabaseSeed, readConfidence, readRequiredString, asRecord, readNonEmptyString, isFiniteNumber } from "./structuredIntentPart3";

export function parseStructuredIntentResult(
	value: unknown,
	targetKind: AITargetKind,
): StructuredIntentParseResult {
	const issues: StructuredIntentParseIssue[] = [];
	const intent = readStructuredIntent(value, "intent", issues, {
		allowPartial: false,
		targetKind,
	});
	return {
		intent,
		intentState: intent ? "validated" : "rejected",
		issues,
	};
}

export function parseStructuredIntentPreview(
	value: unknown,
	targetKind: AITargetKind,
): StructuredIntentParseResult | null {
	const issues: StructuredIntentParseIssue[] = [];
	const intent = readStructuredIntent(value, "intent", issues, {
		allowPartial: true,
		targetKind,
	});
	if (!intent) {
		return null;
	}
	return {
		intent,
		intentState: issues.length === 0 ? "validated" : "drafted",
		issues,
	};
}

export function resolveAllowedStructuredIntentKinds(
	targetKind: AITargetKind,
): StructuredIntentKind[] {
	if (targetKind === "database") {
		return ["insert_block", "database", "review_bundle"];
	}
	if (targetKind === "text") {
		return ["text_edit"];
	}
	return [
		"insert_block",
		"update_block",
		"move_block",
		"convert_block",
		"database",
		"review_bundle",
	];
}

export function stringifyContextSummary(value: unknown): string {
	try {
		return JSON.stringify(value ?? null);
	} catch {
		return "null";
	}
}

export function readStructuredIntent(
	value: unknown,
	path: string,
	issues: StructuredIntentParseIssue[],
	options: {
		allowPartial: boolean;
		targetKind: AITargetKind;
	},
): StructuredIntent | null {
	if (options.targetKind === "table") {
		issues.push({
			path,
			code: "invalid-kind",
			message:
				"Structured table intents are not supported. Use the markdown authoring lane for tables.",
		});
		return null;
	}
	const record = asRecord(value);
	if (!record) {
		issues.push({
			path,
			code: "invalid-shape",
			message: "Structured intent must be an object.",
		});
		return null;
	}
	const kind = readNonEmptyString(record.kind);
	if (!kind) {
		issues.push({
			path: `${path}.kind`,
			code: "missing-field",
			message: "Structured intent kind is required.",
		});
		return null;
	}
	switch (kind) {
		case "insert_block":
			return readInsertBlockIntent(record, path, issues, options.allowPartial);
		case "update_block":
			return readUpdateBlockIntent(record, path, issues, options.allowPartial);
		case "move_block":
			return readMoveBlockIntent(record, path, issues, options.allowPartial);
		case "convert_block":
			return readConvertBlockIntent(record, path, issues, options.allowPartial);
		case "text_edit":
			return readTextEditIntent(record, path, issues, options.allowPartial);
		case "database":
			return readDatabaseIntent(record, path, issues, options.allowPartial);
		case "review_bundle":
			return readReviewBundleIntent(record, path, issues, options);
		default:
			issues.push({
				path: `${path}.kind`,
				code: "invalid-kind",
				message: `Unsupported structured intent kind "${kind}".`,
			});
			return null;
	}
}

export function readInsertBlockIntent(
	record: Record<string, unknown>,
	path: string,
	issues: StructuredIntentParseIssue[],
	allowPartial: boolean,
): InsertBlockIntent | null {
	const blockType = readRequiredString(
		record.blockType,
		`${path}.blockType`,
		issues,
		allowPartial,
	);
	const position = readStructuredPosition(
		record.position,
		`${path}.position`,
		issues,
		allowPartial,
	);
	if (!blockType || !position) {
		return null;
	}
	if (blockType === "table") {
		if (!allowPartial) {
			issues.push({
				path: `${path}.blockType`,
				code: "invalid-kind",
				message:
					"Structured table intents are not supported. Use the markdown authoring lane for tables.",
			});
		}
		return null;
	}
	return {
		kind: "insert_block",
		blockId: readNonEmptyString(record.blockId) ?? undefined,
		blockType,
		position,
		props: asRecord(record.props) ?? undefined,
		initialText: readNonEmptyString(record.initialText) ?? undefined,
		database: readStructuredDatabaseSeed(record.database),
		confidence: readConfidence(record.confidence),
	};
}

export function readUpdateBlockIntent(
	record: Record<string, unknown>,
	path: string,
	issues: StructuredIntentParseIssue[],
	allowPartial: boolean,
): UpdateBlockIntent | null {
	const blockId = readRequiredString(
		record.blockId,
		`${path}.blockId`,
		issues,
		allowPartial,
	);
	const props = asRecord(record.props);
	if (!blockId || !props) {
		if (!props && !allowPartial) {
			issues.push({
				path: `${path}.props`,
				code: "invalid-shape",
				message: "Block update props must be an object.",
			});
		}
		return null;
	}
	return {
		kind: "update_block",
		blockId,
		props,
		confidence: readConfidence(record.confidence),
	};
}

export function readMoveBlockIntent(
	record: Record<string, unknown>,
	path: string,
	issues: StructuredIntentParseIssue[],
	allowPartial: boolean,
): MoveBlockIntent | null {
	const blockId = readRequiredString(
		record.blockId,
		`${path}.blockId`,
		issues,
		allowPartial,
	);
	const position = readStructuredPosition(
		record.position,
		`${path}.position`,
		issues,
		allowPartial,
	);
	if (!blockId || !position) {
		return null;
	}
	return {
		kind: "move_block",
		blockId,
		position,
		confidence: readConfidence(record.confidence),
	};
}

export function readConvertBlockIntent(
	record: Record<string, unknown>,
	path: string,
	issues: StructuredIntentParseIssue[],
	allowPartial: boolean,
): ConvertBlockIntent | null {
	const blockId = readRequiredString(
		record.blockId,
		`${path}.blockId`,
		issues,
		allowPartial,
	);
	const newType = readRequiredString(
		record.newType,
		`${path}.newType`,
		issues,
		allowPartial,
	);
	if (!blockId || !newType) {
		return null;
	}
	return {
		kind: "convert_block",
		blockId,
		newType,
		props: asRecord(record.props) ?? undefined,
		confidence: readConfidence(record.confidence),
	};
}

export function readTextEditIntent(
	record: Record<string, unknown>,
	path: string,
	issues: StructuredIntentParseIssue[],
	allowPartial: boolean,
): TextEditIntent | null {
	const target = asRecord(record.target);
	const blockId = readRequiredString(
		target?.blockId,
		`${path}.target.blockId`,
		issues,
		allowPartial,
	);
	const operation = readRequiredString(
		record.operation,
		`${path}.operation`,
		issues,
		allowPartial,
	) as TextEditIntent["operation"] | null;
	const text = readRequiredString(
		record.text,
		`${path}.text`,
		issues,
		allowPartial,
	);
	if (!blockId || !operation || !text) {
		return null;
	}
	const rangeRecord = asRecord(target?.range);
	return {
		kind: "text_edit",
		target: {
			blockId,
			range:
				rangeRecord &&
				isFiniteNumber(rangeRecord.startOffset) &&
				isFiniteNumber(rangeRecord.endOffset)
					? {
						startOffset: rangeRecord.startOffset,
						endOffset: rangeRecord.endOffset,
					}
					: undefined,
		},
		operation,
		text,
		confidence: readConfidence(record.confidence),
	};
}

export function readDatabaseIntent(
	record: Record<string, unknown>,
	path: string,
	issues: StructuredIntentParseIssue[],
	allowPartial: boolean,
): DatabaseIntent | null {
	const blockId = readRequiredString(
		record.blockId,
		`${path}.blockId`,
		issues,
		allowPartial,
	);
	if (!blockId) {
		return null;
	}
	return {
		kind: "database",
		blockId,
		columns: readStructuredColumns(record.columns),
		rows: readStructuredDatabaseRows(record.rows),
		views: Array.isArray(record.views)
			? (record.views.filter((view): view is DatabaseViewState => {
				return !!view && typeof view === "object";
			}) as DatabaseViewState[])
			: undefined,
		activeViewId: readNonEmptyString(record.activeViewId) ?? undefined,
		confidence: readConfidence(record.confidence),
	};
}
