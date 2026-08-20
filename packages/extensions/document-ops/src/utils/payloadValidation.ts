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

	for (const payload of payloads) {
		const failure = validateOnePayload(editor, payload, pendingBlockIds);
		if (failure) {
			failures.push(failure);
			continue;
		}
		const op = payload as DocumentOp;
		if (op.type === "insert-block") {
			pendingBlockIds.add(op.blockId);
		}
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

	const unresolved = unresolvedTargets(editor, record, pendingBlockIds);
	if (unresolved) {
		return failure(unresolved, payload);
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
