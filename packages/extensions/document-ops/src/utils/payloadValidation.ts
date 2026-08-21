import type {
	ApplyOptions,
	DiagnosticEvent,
	DocumentOp,
	Editor,
	Position,
} from "@input/pen-types";
import {
	INVALID_TOOL_PAYLOAD_CODE,
	isDocumentOpType,
	MAX_OP_TEXT_FIELD_LENGTH,
} from "../constants/payloadValidation";

export interface ToolPayloadFailure {
	readonly code: typeof INVALID_TOOL_PAYLOAD_CODE;
	readonly message: string;
	readonly payload: unknown;
}

export interface ToolPayloadValidationResult {
	readonly ok: boolean;
	readonly ops: DocumentOp[];
	readonly failures: ToolPayloadFailure[];
}

const SOURCE = "document-ops";

export function validateToolPayloads(
	editor: Editor,
	payloads: readonly unknown[],
): ToolPayloadValidationResult {
	const failures: ToolPayloadFailure[] = [];
	const ops: DocumentOp[] = [];
	const pendingBlockIds = new Set<string>();
	const textLengths = new Map<string, number>();

	for (const payload of payloads) {
		const failure = validateOnePayload(
			editor,
			payload,
			pendingBlockIds,
			textLengths,
		);
		if (failure) {
			failures.push(failure);
			continue;
		}
		const op = payload as DocumentOp;
		if (op.type === "insert-block") {
			pendingBlockIds.add(op.blockId);
		}
		rememberTextLength(editor, op, pendingBlockIds, textLengths);
		ops.push(op);
	}

	if (failures.length > 0) {
		return { ok: false, ops: [], failures };
	}

	return { ok: true, ops, failures };
}

export function applyValidatedOps(
	editor: Editor,
	payloads: readonly unknown[],
	options?: ApplyOptions,
): void {
	const ops = assertValidToolPayloads(editor, payloads);
	if (ops.length === 0) {
		return;
	}
	editor.apply(ops, options);
}

export function assertValidToolPayloads(
	editor: Editor,
	payloads: readonly unknown[],
): DocumentOp[] {
	const result = validateToolPayloads(editor, payloads);
	if (result.ok) {
		return result.ops;
	}

	for (const failure of result.failures) {
		editor.internals.emit("diagnostic", toDiagnostic(failure));
	}

	throw new Error(
		`Invalid tool payload: ${result.failures.map((failure) => failure.message).join("; ")}`,
	);
}

function validateOnePayload(
	editor: Editor,
	payload: unknown,
	pendingBlockIds: Set<string>,
	textLengths: Map<string, number>,
): ToolPayloadFailure | null {
	if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
		return failure("Tool payload must be a DocumentOp object", payload);
	}

	const record = payload as Record<string, unknown>;
	if (!isDocumentOpType(record.type)) {
		return failure(
			`Unknown DocumentOp type: ${formatUnknownType(record.type)}`,
			payload,
		);
	}

	if (record.type === "stream-open") {
		return failure(
			"stream-open is not a tool-applicable DocumentOp",
			payload,
		);
	}

	if (
		typeof record.text === "string" &&
		record.text.length > MAX_OP_TEXT_FIELD_LENGTH
	) {
		return failure(
			`Op text field exceeds MAX_OP_TEXT_FIELD_LENGTH (${MAX_OP_TEXT_FIELD_LENGTH})`,
			payload,
		);
	}

	const rejectedKeys = [...new Set(rejectedOwnPropKeys(payload))];
	if (rejectedKeys.length > 0) {
		return failure(
			`Prototype keys are not allowed: ${rejectedKeys.join(", ")}`,
			payload,
		);
	}

	const unresolved = unresolvedTargets(editor, record, pendingBlockIds);
	if (unresolved) {
		return failure(unresolved, payload);
	}

	const offsetFailure = outOfRangeOffset(
		editor,
		record,
		pendingBlockIds,
		textLengths,
	);
	if (offsetFailure) {
		return failure(offsetFailure, payload);
	}

	return null;
}

function unresolvedTargets(
	editor: Editor,
	payload: Record<string, unknown>,
	pendingBlockIds: Set<string>,
): string | null {
	const type = payload.type;
	if (
		type === "set-selection" ||
		type === "create-app" ||
		type === "update-app" ||
		type === "delete-app"
	) {
		return null;
	}

	if (type === "insert-block") {
		if (typeof payload.blockId !== "string" || payload.blockId.length === 0) {
			return "Unresolved target: insert-block is missing blockId";
		}
		return unresolvedPosition(editor, payload.position, pendingBlockIds);
	}

	if (type === "merge-blocks") {
		return (
			unresolvedBlock(editor, payload.targetBlockId, pendingBlockIds, "targetBlockId") ??
			unresolvedBlock(editor, payload.sourceBlockId, pendingBlockIds, "sourceBlockId")
		);
	}

	if (type === "move-block") {
		return (
			unresolvedBlock(editor, payload.blockId, pendingBlockIds, "blockId") ??
			unresolvedPosition(editor, payload.position, pendingBlockIds)
		);
	}

	return unresolvedBlock(editor, payload.blockId, pendingBlockIds, "blockId");
}

function unresolvedBlock(
	editor: Editor,
	blockId: unknown,
	pendingBlockIds: Set<string>,
	field: string,
): string | null {
	if (typeof blockId !== "string" || blockId.length === 0) {
		return `Unresolved target: ${field} is missing`;
	}
	if (pendingBlockIds.has(blockId) || editor.getBlock(blockId)) {
		return null;
	}
	return `Unresolved target: "${blockId}"`;
}

const INSERT_OFFSET_TYPES = new Set<string>([
	"insert-text",
	"insert-inline-node",
	"remove-inline-node",
	"split-block",
]);

const SPAN_OFFSET_TYPES = new Set<string>([
	"delete-text",
	"format-text",
	"replace-text",
]);

function outOfRangeOffset(
	editor: Editor,
	payload: Record<string, unknown>,
	pendingBlockIds: Set<string>,
	textLengths: Map<string, number>,
): string | null {
	const type = payload.type;
	if (typeof type !== "string") {
		return null;
	}
	if (!INSERT_OFFSET_TYPES.has(type) && !SPAN_OFFSET_TYPES.has(type)) {
		return null;
	}

	const offset = payload.offset;
	if (typeof offset !== "number" || !Number.isFinite(offset) || offset < 0) {
		return `Offset out of range: ${formatUnknownType(offset)}`;
	}

	const blockId = payload.blockId;
	if (typeof blockId !== "string" || blockId.length === 0) {
		return null;
	}

	const length = currentTextLength(
		editor,
		blockId,
		pendingBlockIds,
		textLengths,
	);
	if (length === null) {
		return null;
	}

	if (INSERT_OFFSET_TYPES.has(type)) {
		if (offset > length) {
			return `Offset out of range: ${offset} is past the end of "${blockId}"`;
		}
		return null;
	}

	const span = payload.length;
	if (typeof span !== "number" || !Number.isFinite(span) || span < 0) {
		return "Offset out of range: length is invalid";
	}
	if (offset + span > length) {
		return `Offset out of range: ${offset}+${span} is past the end of "${blockId}"`;
	}
	return null;
}

function currentTextLength(
	editor: Editor,
	blockId: string,
	pendingBlockIds: Set<string>,
	textLengths: Map<string, number>,
): number | null {
	const tracked = textLengths.get(blockId);
	if (tracked !== undefined) {
		return tracked;
	}
	if (pendingBlockIds.has(blockId)) {
		return 0;
	}
	const block = editor.getBlock(blockId);
	if (!block || typeof block.length !== "function") {
		return null;
	}
	return block.length();
}

function rememberTextLength(
	editor: Editor,
	payload: DocumentOp,
	pendingBlockIds: Set<string>,
	textLengths: Map<string, number>,
): void {
	if (payload.type === "insert-block") {
		textLengths.set(payload.blockId, 0);
		return;
	}

	if (!("blockId" in payload) || typeof payload.blockId !== "string") {
		return;
	}

	const current = currentTextLength(
		editor,
		payload.blockId,
		pendingBlockIds,
		textLengths,
	);
	if (current === null) {
		return;
	}

	if (payload.type === "insert-text") {
		textLengths.set(payload.blockId, current + payload.text.length);
		return;
	}
	if (payload.type === "delete-text") {
		textLengths.set(payload.blockId, Math.max(0, current - payload.length));
		return;
	}
	if (payload.type === "replace-text") {
		textLengths.set(
			payload.blockId,
			Math.max(0, current - payload.length + payload.text.length),
		);
	}
}

function unresolvedPosition(
	editor: Editor,
	position: unknown,
	pendingBlockIds: Set<string>,
): string | null {
	if (position === "first" || position === "last") {
		return null;
	}
	if (!isObjectPosition(position)) {
		return "Unresolved target: invalid position";
	}
	if ("before" in position) {
		return unresolvedBlock(editor, position.before, pendingBlockIds, "position.before");
	}
	if ("after" in position) {
		return unresolvedBlock(editor, position.after, pendingBlockIds, "position.after");
	}
	return unresolvedBlock(editor, position.parent, pendingBlockIds, "position.parent");
}

function isObjectPosition(
	position: unknown,
): position is Exclude<Position, "first" | "last"> {
	if (typeof position !== "object" || position === null) {
		return false;
	}
	if ("before" in position || "after" in position) {
		return true;
	}
	return "parent" in position && "index" in position;
}

function failure(message: string, payload: unknown): ToolPayloadFailure {
	return {
		code: INVALID_TOOL_PAYLOAD_CODE,
		message,
		payload,
	};
}

function toDiagnostic(result: ToolPayloadFailure): DiagnosticEvent {
	return {
		code: result.code,
		level: "error",
		source: SOURCE,
		message: result.message,
		payload: result.payload,
	};
}

function formatUnknownType(value: unknown): string {
	return typeof value === "string" ? `"${value}"` : typeof value;
}

const REJECTED_OWN_PROP_KEYS = new Set([
	"__proto__",
	"constructor",
	"prototype",
]);

function rejectedOwnPropKeys(
	value: unknown,
	seen: WeakSet<object> = new WeakSet(),
): string[] {
	if (value === null || typeof value !== "object") {
		return [];
	}
	if (seen.has(value)) {
		return [];
	}
	seen.add(value);

	if (Array.isArray(value)) {
		const found: string[] = [];
		for (const item of value) {
			found.push(...rejectedOwnPropKeys(item, seen));
		}
		return found;
	}

	const record = value as Record<string, unknown>;
	const found: string[] = [];
	for (const key of Object.keys(record)) {
		if (REJECTED_OWN_PROP_KEYS.has(key)) {
			found.push(key);
			continue;
		}
		found.push(...rejectedOwnPropKeys(record[key], seen));
	}
	return found;
}
