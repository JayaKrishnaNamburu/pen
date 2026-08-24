import type { DocumentOp } from "@input/pen-types";

export const MAX_OP_TEXT_FIELD_LENGTH = 1_048_576;

export const INVALID_TOOL_PAYLOAD_CODE = "invalid-tool-payload";

const DOCUMENT_OP_TYPE_FLAGS = {
	"splice-text": true,
	"format-text": true,
	"insert-block": true,
	"delete-block": true,
	"move-block": true,
	"set-props": true,
	"set-meta": true,
	"grid": true,
	"app": true,
	"stream-open": true,
} as const satisfies Record<DocumentOp["type"], true>;

export const DOCUMENT_OP_TYPES = Object.keys(
	DOCUMENT_OP_TYPE_FLAGS,
) as DocumentOp["type"][];

const DOCUMENT_OP_TYPE_SET = new Set<string>(DOCUMENT_OP_TYPES);

export function isDocumentOpType(value: unknown): value is DocumentOp["type"] {
	return typeof value === "string" && DOCUMENT_OP_TYPE_SET.has(value);
}
