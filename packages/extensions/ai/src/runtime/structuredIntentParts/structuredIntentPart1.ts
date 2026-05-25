// @ts-nocheck
import type { AIWorkingSetEnvelope } from "../../types";
import type { DatabaseViewState, TableColumnSchema } from "@pen/types";
import type { AITargetKind } from "../contracts";
import type { PlanConfidence } from "../planTypes";
import { parseStructuredIntentResult, parseStructuredIntentPreview, resolveAllowedStructuredIntentKinds, stringifyContextSummary, readStructuredIntent, readInsertBlockIntent, readUpdateBlockIntent, readMoveBlockIntent, readConvertBlockIntent, readTextEditIntent, readDatabaseIntent } from "./structuredIntentPart2";
import { readReviewBundleIntent, readStructuredPosition, readStructuredColumns, readStructuredDatabaseRows, readStructuredDatabaseSeed, readConfidence, readRequiredString, asRecord, readNonEmptyString, isFiniteNumber } from "./structuredIntentPart3";

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
