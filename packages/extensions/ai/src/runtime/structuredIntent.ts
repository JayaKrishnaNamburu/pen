import type { AIWorkingSetEnvelope } from "../types";
import type { DatabaseViewState, TableColumnSchema } from "@pen/types";
import type { AITargetKind } from "./contracts";
import type { PlanConfidence } from "./planTypes";

export const STRUCTURED_INTENT_REQUEST_PREFIX =
	"pen:structured-intent-request/v1";

export type StructuredIntentKind =
	| "insert_block"
	| "update_block"
	| "move_block"
	| "convert_block"
	| "text_edit"
	| "database"
	| "review_bundle";

export type StructuredInsertPosition =
	| "before_active"
	| "after_active"
	| "start"
	| "end"
	| { beforeBlockId: string }
	| { afterBlockId: string }
	| { parentId: string; index: number };

export interface StructuredTableColumn {
	id?: string;
	title: string;
	type?: TableColumnSchema["type"];
}

export interface StructuredDatabaseRow {
	rowId?: string;
	values: Record<string, unknown>;
}

export interface StructuredDatabaseSeed {
	columns?: StructuredTableColumn[];
	rows?: StructuredDatabaseRow[];
	views?: DatabaseViewState[];
	activeViewId?: string;
}

export interface InsertBlockIntent {
	kind: "insert_block";
	blockId?: string;
	blockType: string;
	position: StructuredInsertPosition;
	props?: Record<string, unknown>;
	initialText?: string;
	database?: StructuredDatabaseSeed;
	confidence?: PlanConfidence;
}

export interface UpdateBlockIntent {
	kind: "update_block";
	blockId: string;
	props: Record<string, unknown>;
	confidence?: PlanConfidence;
}

export interface MoveBlockIntent {
	kind: "move_block";
	blockId: string;
	position: StructuredInsertPosition;
	confidence?: PlanConfidence;
}

export interface ConvertBlockIntent {
	kind: "convert_block";
	blockId: string;
	newType: string;
	props?: Record<string, unknown>;
	confidence?: PlanConfidence;
}

export interface TextEditIntent {
	kind: "text_edit";
	target: {
		blockId: string;
		range?: {
			startOffset: number;
			endOffset: number;
		};
	};
	operation: "replace" | "insert" | "append";
	text: string;
	confidence?: PlanConfidence;
}

export interface DatabaseIntent {
	kind: "database";
	blockId: string;
	columns?: StructuredTableColumn[];
	rows?: StructuredDatabaseRow[];
	views?: DatabaseViewState[];
	activeViewId?: string;
	confidence?: PlanConfidence;
}

export interface ReviewBundleIntent {
	kind: "review_bundle";
	label: string;
	reason: string;
	changes: StructuredIntent[];
	confidence?: PlanConfidence;
}

export type StructuredIntent =
	| InsertBlockIntent
	| UpdateBlockIntent
	| MoveBlockIntent
	| ConvertBlockIntent
	| TextEditIntent
	| DatabaseIntent
	| ReviewBundleIntent;

export interface StructuredIntentParseIssue {
	path: string;
	code: "missing-field" | "invalid-shape" | "invalid-kind";
	message: string;
}

export interface StructuredIntentParseResult {
	intent: StructuredIntent | null;
	intentState: "drafted" | "validated" | "rejected";
	issues: StructuredIntentParseIssue[];
}

export interface StructuredIntentRequestEnvelope {
	version: 1;
	contract: "structured-intent";
	targetKind: AITargetKind;
	prompt: string;
	activeBlockId: string | null;
	contextSummary: unknown;
}

export interface StructuredIntentPromptConfig {
	prompt: string;
	targetKind: AITargetKind;
	activeBlockId: string | null;
	workingSet: AIWorkingSetEnvelope | null;
}

export function getStructuredIntentOutputSchema(
	targetKind: AITargetKind,
): Record<string, unknown> {
	const structuredColumnSchema = {
		type: "array",
		items: {
			type: "object",
			properties: {
				id: { type: "string" },
				title: { type: "string" },
				type: { type: "string" },
			},
			required: ["title"],
		},
	};
	const databaseSeedSchema = {
		type: "object",
		properties: {
			columns: structuredColumnSchema,
			rows: {
				type: "array",
				items: {
					type: "object",
					properties: {
						rowId: { type: "string" },
						values: {
							type: "object",
							additionalProperties: true,
						},
					},
					required: ["values"],
				},
			},
			views: {
				type: "array",
				items: {
					type: "object",
					additionalProperties: true,
				},
			},
			activeViewId: { type: "string" },
		},
	};
	const positionSchema = {
		anyOf: [
			{ type: "string", enum: ["before_active", "after_active", "start", "end"] },
			{
				type: "object",
				properties: {
					beforeBlockId: { type: "string" },
				},
				required: ["beforeBlockId"],
			},
			{
				type: "object",
				properties: {
					afterBlockId: { type: "string" },
				},
				required: ["afterBlockId"],
			},
			{
				type: "object",
				properties: {
					parentId: { type: "string" },
					index: { type: "number" },
				},
				required: ["parentId", "index"],
			},
		],
	};
	const insertBlockSchema = {
		type: "object",
		properties: {
			kind: { const: "insert_block" },
			blockId: { type: "string" },
			blockType: {
				type: "string",
				enum:
					targetKind === "database"
						? ["database"]
						: ["paragraph", "heading", "database"],
			},
			position: positionSchema,
			props: {
				type: "object",
				additionalProperties: true,
			},
			initialText: { type: "string" },
			database: databaseSeedSchema,
			confidence: {
				anyOf: [
					{ type: "number" },
					{
						type: "object",
						properties: {
							score: { type: "number" },
							reason: { type: "string" },
						},
					},
				],
			},
		},
		required: ["kind", "blockType", "position"],
	};
	const databaseSchema = {
		type: "object",
		properties: {
			kind: { const: "database" },
			blockId: { type: "string" },
			columns: structuredColumnSchema,
			rows: databaseSeedSchema.properties.rows,
			views: databaseSeedSchema.properties.views,
			activeViewId: { type: "string" },
		},
		required: ["kind", "blockId"],
	};
	return {
		type: "object",
		anyOf: [
			insertBlockSchema,
			databaseSchema,
			{
				type: "object",
				properties: {
					kind: { const: "review_bundle" },
					label: { type: "string" },
					reason: { type: "string" },
					changes: {
						type: "array",
						items: {
							anyOf: [insertBlockSchema, databaseSchema],
						},
					},
				},
				required: ["kind", "label", "reason", "changes"],
			},
		],
	};
}

export function buildStructuredIntentRequestPrompt(
	config: StructuredIntentPromptConfig,
): string {
	const envelope: StructuredIntentRequestEnvelope = {
		version: 1,
		contract: "structured-intent",
		targetKind: config.targetKind,
		prompt: config.prompt,
		activeBlockId: config.activeBlockId,
		contextSummary: config.workingSet?.context ?? null,
	};
	return [
		STRUCTURED_INTENT_REQUEST_PREFIX,
		JSON.stringify(envelope),
	].join("\n");
}

export function parseStructuredIntentRequestPrompt(
	value: string,
): StructuredIntentRequestEnvelope | null {
	if (!value.startsWith(`${STRUCTURED_INTENT_REQUEST_PREFIX}\n`)) {
		return null;
	}
	const jsonPayload = value
		.slice(STRUCTURED_INTENT_REQUEST_PREFIX.length)
		.trimStart();
	try {
		const parsed = JSON.parse(jsonPayload) as StructuredIntentRequestEnvelope;
		if (
			parsed?.version === 1 &&
			parsed.contract === "structured-intent" &&
			typeof parsed.prompt === "string" &&
			typeof parsed.targetKind === "string"
		) {
			return parsed;
		}
		return null;
	} catch {
		return null;
	}
}

export function buildStructuredIntentModelPrompt(
	request: StructuredIntentRequestEnvelope,
): string {
	const allowedKinds = resolveAllowedStructuredIntentKinds(request.targetKind);
	return [
		"Produce one structured Pen intent object.",
		"Return valid JSON only and no markdown fences or prose.",
		`Target kind: ${request.targetKind}`,
		`Allowed top-level intent kinds: ${allowedKinds.join(", ")}`,
		"",
		"Use these intent rules:",
		'- always include a top-level "kind" field',
		'- use "review_bundle" with a "changes" array for mixed edits',
		'- use "insert_block" for new blocks with position "after_active", "before_active", "start", or "end"',
		'- when creating a new database, prefer one "insert_block" with embedded "database" seed data',
		'- for database rows, use "rows" with "values" keyed by column id',
		'- do not emit executor-level row/col operations',
		"",
		"Context summary:",
		stringifyContextSummary(request.contextSummary),
		"",
		"User request:",
		request.prompt,
	].join("\n");
}

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

function resolveAllowedStructuredIntentKinds(
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

function stringifyContextSummary(value: unknown): string {
	try {
		return JSON.stringify(value ?? null);
	} catch {
		return "null";
	}
}

function readStructuredIntent(
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

function readInsertBlockIntent(
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

function readUpdateBlockIntent(
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

function readMoveBlockIntent(
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

function readConvertBlockIntent(
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

function readTextEditIntent(
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

function readDatabaseIntent(
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

function readReviewBundleIntent(
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

function readStructuredPosition(
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

function readStructuredColumns(
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

function readStructuredDatabaseRows(
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

function readStructuredDatabaseSeed(
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

function readConfidence(value: unknown): PlanConfidence | undefined {
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

function readRequiredString(
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

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function readNonEmptyString(value: unknown): string | null {
	return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}
