import {
	PEN_STREAM_PROTOCOL_VERSION,
	type ModelMessage,
	type ModelMessagePart,
	type PenStreamRequest,
	type ToolSchema,
} from "@input/pen-types";

type Assert<T extends true> = T;
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/**
 * Every key of `PenStreamRequest`. Adding a field to the type without
 * naming it here fails typecheck (`_PenStreamRequestKeysLocked`).
 */
export const PEN_STREAM_REQUEST_KEYS = [
	"prompt",
	"context",
	"tools",
	"toolCalls",
	"messages",
	"signal",
	"streamId",
	"protocolVersion",
] as const satisfies readonly (keyof PenStreamRequest)[];

type PenStreamRequestKey = (typeof PEN_STREAM_REQUEST_KEYS)[number];
type _PenStreamRequestKeysLocked = Assert<
	Equal<keyof PenStreamRequest, PenStreamRequestKey>
>;

type StreamRequestContext = NonNullable<PenStreamRequest["context"]>;

export const PEN_STREAM_REQUEST_CONTEXT_KEYS = [
	"docId",
	"selection",
	"blockId",
] as const satisfies readonly (keyof StreamRequestContext)[];

type StreamRequestContextKey = (typeof PEN_STREAM_REQUEST_CONTEXT_KEYS)[number];
type _PenStreamRequestContextKeysLocked = Assert<
	Equal<keyof StreamRequestContext, StreamRequestContextKey>
>;

const PEN_STREAM_REQUEST_KEY_SET = new Set<string>(PEN_STREAM_REQUEST_KEYS);
const PEN_STREAM_REQUEST_CONTEXT_KEY_SET = new Set<string>(
	PEN_STREAM_REQUEST_CONTEXT_KEYS,
);

const TOOL_SCHEMA_KEYS = new Set(["name", "description", "inputSchema"]);
const TOOL_CALL_KEYS = new Set(["toolCallId", "name", "input"]);
const MODEL_MESSAGE_KEYS = new Set([
	"role",
	"content",
	"toolCallId",
	"toolName",
]);
const TEXT_SELECTION_KEYS = new Set(["type", "anchor", "focus"]);
const BLOCK_SELECTION_KEYS = new Set(["type", "blockIds"]);
const APP_SELECTION_KEYS = new Set(["type", "appId"]);
const CELL_SELECTION_KEYS = new Set([
	"type",
	"blockId",
	"anchor",
	"head",
	"rowIds",
	"columnIds",
]);
const TEXT_POINT_KEYS = new Set(["blockId", "offset"]);
const CELL_POINT_KEYS = new Set(["row", "col"]);
const TEXT_PART_KEYS = new Set(["type", "text"]);
const TOOL_CALL_PART_KEYS = new Set([
	"type",
	"toolCallId",
	"toolName",
	"input",
]);
const TOOL_RESULT_PART_KEYS = new Set([
	"type",
	"toolCallId",
	"result",
	"isError",
]);

const MODEL_MESSAGE_ROLES = new Set<ModelMessage["role"]>([
	"system",
	"user",
	"assistant",
	"tool",
]);

const REJECTED_OWN_PROP_KEYS = new Set([
	"__proto__",
	"constructor",
	"prototype",
]);

/** Same ceiling as inbound SSE event frames and HTML ingest text. */
export const MAX_PEN_STREAM_REQUEST_BYTES = 1_048_576;
/** Same nesting ceiling as HTML/markdown ingest. */
export const MAX_PEN_STREAM_REQUEST_DEPTH = 32;
export const MAX_PEN_STREAM_REQUEST_ARRAY_ITEMS = 1024;

export function parsePenStreamRequest(
	value: unknown,
): PenStreamRequest | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return null;
	}
	if (hasRejectedOwnPropKeys(value) || exceedsRequestBounds(value)) {
		return null;
	}
	const body = value as Record<string, unknown>;
	if ("editor" in body) {
		return null;
	}
	if (body.context !== undefined) {
		if (
			typeof body.context !== "object" ||
			body.context === null ||
			Array.isArray(body.context) ||
			"editor" in body.context
		) {
			return null;
		}
	}
	if (!requestFieldsAreValid(body)) {
		return null;
	}
	return body as unknown as PenStreamRequest;
}

function requestFieldsAreValid(body: Record<string, unknown>): boolean {
	for (const key of Object.keys(body)) {
		if (!PEN_STREAM_REQUEST_KEY_SET.has(key)) {
			return false;
		}
	}
	for (const key of PEN_STREAM_REQUEST_KEYS) {
		if (!requestFieldIsValid(key, body[key])) {
			return false;
		}
	}
	return true;
}

function requestFieldIsValid(
	key: PenStreamRequestKey,
	value: unknown,
): boolean {
	switch (key) {
		case "prompt":
			return typeof value === "string";
		case "context":
			return value === undefined || isValidContext(value);
		case "tools":
			return value === undefined || isValidTools(value);
		case "toolCalls":
			return value === undefined || isValidToolCalls(value);
		case "messages":
			return value === undefined || isValidMessages(value);
		case "signal":
			return value === undefined || value instanceof AbortSignal;
		case "streamId":
			return value === undefined || typeof value === "string";
		case "protocolVersion":
			return value === undefined || value === PEN_STREAM_PROTOCOL_VERSION;
		default: {
			const unexpected: never = key;
			void unexpected;
			return false;
		}
	}
}

function isValidContext(value: unknown): boolean {
	if (!isRecord(value)) {
		return false;
	}
	for (const key of Object.keys(value)) {
		if (!PEN_STREAM_REQUEST_CONTEXT_KEY_SET.has(key)) {
			return false;
		}
	}
	for (const key of PEN_STREAM_REQUEST_CONTEXT_KEYS) {
		if (!contextFieldIsValid(key, value[key])) {
			return false;
		}
	}
	return true;
}

function contextFieldIsValid(
	key: StreamRequestContextKey,
	value: unknown,
): boolean {
	switch (key) {
		case "docId":
			return value === undefined || typeof value === "string";
		case "blockId":
			return value === undefined || typeof value === "string";
		case "selection":
			return value === undefined || isValidSelection(value);
		default: {
			const unexpected: never = key;
			void unexpected;
			return false;
		}
	}
}

function isValidSelection(value: unknown): boolean {
	if (value === null) {
		return true;
	}
	if (!isRecord(value) || typeof value.type !== "string") {
		return false;
	}
	switch (value.type) {
		case "text":
			return (
				hasOnlyKeys(value, TEXT_SELECTION_KEYS) &&
				isTextPoint(value.anchor) &&
				isTextPoint(value.focus)
			);
		case "block":
			return (
				hasOnlyKeys(value, BLOCK_SELECTION_KEYS) &&
				isStringArray(value.blockIds)
			);
		case "app":
			return (
				hasOnlyKeys(value, APP_SELECTION_KEYS) &&
				typeof value.appId === "string"
			);
		case "cell":
			return (
				hasOnlyKeys(value, CELL_SELECTION_KEYS) &&
				typeof value.blockId === "string" &&
				isCellPoint(value.anchor) &&
				isCellPoint(value.head) &&
				(value.rowIds === undefined || isStringArray(value.rowIds)) &&
				(value.columnIds === undefined ||
					isStringArray(value.columnIds))
			);
		default:
			return false;
	}
}

function isValidTools(value: unknown): value is ToolSchema[] {
	return Array.isArray(value) && value.every(isValidToolSchema);
}

function isValidToolSchema(value: unknown): value is ToolSchema {
	if (!isRecord(value) || !hasOnlyKeys(value, TOOL_SCHEMA_KEYS)) {
		return false;
	}
	return (
		typeof value.name === "string" &&
		typeof value.description === "string" &&
		isRecord(value.inputSchema)
	);
}

function isValidToolCalls(value: unknown): boolean {
	return Array.isArray(value) && value.every(isValidToolCall);
}

function isValidToolCall(value: unknown): boolean {
	if (!isRecord(value) || !hasOnlyKeys(value, TOOL_CALL_KEYS)) {
		return false;
	}
	return (
		typeof value.toolCallId === "string" &&
		typeof value.name === "string" &&
		"input" in value
	);
}

function isValidMessages(value: unknown): value is ModelMessage[] {
	return Array.isArray(value) && value.every(isValidModelMessage);
}

function isValidModelMessage(value: unknown): value is ModelMessage {
	if (!isRecord(value) || !hasOnlyKeys(value, MODEL_MESSAGE_KEYS)) {
		return false;
	}
	if (!isModelMessageRole(value.role)) {
		return false;
	}
	if (
		value.toolCallId !== undefined &&
		typeof value.toolCallId !== "string"
	) {
		return false;
	}
	if (value.toolName !== undefined && typeof value.toolName !== "string") {
		return false;
	}
	return isValidModelMessageContent(value.content);
}

function isModelMessageRole(value: unknown): value is ModelMessage["role"] {
	return (
		typeof value === "string" &&
		MODEL_MESSAGE_ROLES.has(value as ModelMessage["role"])
	);
}

function isValidModelMessageContent(value: unknown): boolean {
	if (typeof value === "string") {
		return true;
	}
	return Array.isArray(value) && value.every(isValidModelMessagePart);
}

function isValidModelMessagePart(value: unknown): value is ModelMessagePart {
	if (!isRecord(value) || typeof value.type !== "string") {
		return false;
	}
	switch (value.type) {
		case "text":
			return (
				hasOnlyKeys(value, TEXT_PART_KEYS) &&
				typeof value.text === "string"
			);
		case "tool-call":
			return (
				hasOnlyKeys(value, TOOL_CALL_PART_KEYS) &&
				typeof value.toolCallId === "string" &&
				typeof value.toolName === "string"
			);
		case "tool-result":
			return (
				hasOnlyKeys(value, TOOL_RESULT_PART_KEYS) &&
				typeof value.toolCallId === "string" &&
				"result" in value &&
				(value.isError === undefined ||
					typeof value.isError === "boolean")
			);
		default:
			return false;
	}
}

function isTextPoint(value: unknown): boolean {
	return (
		isRecord(value) &&
		hasOnlyKeys(value, TEXT_POINT_KEYS) &&
		typeof value.blockId === "string" &&
		isNonNegativeInteger(value.offset)
	);
}

function isCellPoint(value: unknown): boolean {
	return (
		isRecord(value) &&
		hasOnlyKeys(value, CELL_POINT_KEYS) &&
		isNonNegativeInteger(value.row) &&
		isNonNegativeInteger(value.col)
	);
}

function isStringArray(value: unknown): value is string[] {
	return (
		Array.isArray(value) && value.every((item) => typeof item === "string")
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
	value: Record<string, unknown>,
	allowed: ReadonlySet<string>,
): boolean {
	for (const key of Object.keys(value)) {
		if (!allowed.has(key)) {
			return false;
		}
	}
	return true;
}

function isNonNegativeInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function hasRejectedOwnPropKeys(
	value: unknown,
	seen: WeakSet<object> = new WeakSet(),
): boolean {
	if (value === null || typeof value !== "object") {
		return false;
	}
	if (seen.has(value)) {
		return false;
	}
	seen.add(value);
	if (Array.isArray(value)) {
		return value.some((item) => hasRejectedOwnPropKeys(item, seen));
	}
	const record = value as Record<string, unknown>;
	for (const key of Object.keys(record)) {
		if (REJECTED_OWN_PROP_KEYS.has(key)) {
			return true;
		}
		if (hasRejectedOwnPropKeys(record[key], seen)) {
			return true;
		}
	}
	return false;
}

function exceedsRequestBounds(
	value: unknown,
	depth = 0,
	seen: WeakSet<object> = new WeakSet(),
): boolean {
	if (depth > MAX_PEN_STREAM_REQUEST_DEPTH) {
		return true;
	}
	if (typeof value === "string") {
		return value.length > MAX_PEN_STREAM_REQUEST_BYTES;
	}
	if (value === null || typeof value !== "object") {
		return false;
	}
	if (seen.has(value)) {
		return false;
	}
	seen.add(value);
	if (Array.isArray(value)) {
		if (value.length > MAX_PEN_STREAM_REQUEST_ARRAY_ITEMS) {
			return true;
		}
		return value.some((item) =>
			exceedsRequestBounds(item, depth + 1, seen),
		);
	}
	const record = value as Record<string, unknown>;
	for (const child of Object.values(record)) {
		if (exceedsRequestBounds(child, depth + 1, seen)) {
			return true;
		}
	}
	return false;
}
