import type { DocumentOp } from "@input/pen-types";

export const MAX_OP_TEXT_FIELD_LENGTH = 1_048_576;

export const INVALID_TOOL_PAYLOAD_CODE = "invalid-tool-payload";

const DOCUMENT_OP_TYPE_FLAGS = {
	"insert-block": true,
	"update-block": true,
	"delete-block": true,
	"move-block": true,
	"convert-block": true,
	"split-block": true,
	"merge-blocks": true,
	"insert-text": true,
	"delete-text": true,
	"format-text": true,
	"replace-text": true,
	"insert-inline-node": true,
	"remove-inline-node": true,
	"update-layout": true,
	"insert-table-row": true,
	"delete-table-row": true,
	"insert-table-column": true,
	"delete-table-column": true,
	"merge-table-cells": true,
	"split-table-cell": true,
	"insert-table-cell-text": true,
	"delete-table-cell-text": true,
	"format-table-cell-text": true,
	"update-table-columns": true,
	"set-meta": true,
	"create-app": true,
	"update-app": true,
	"delete-app": true,
	"set-selection": true,
	"stream-open": true,
} as const satisfies Record<DocumentOp["type"], true>;

export const DOCUMENT_OP_TYPES = Object.keys(
	DOCUMENT_OP_TYPE_FLAGS,
) as DocumentOp["type"][];

const DOCUMENT_OP_TYPE_SET = new Set<string>(DOCUMENT_OP_TYPES);

export function isDocumentOpType(value: unknown): value is DocumentOp["type"] {
	return typeof value === "string" && DOCUMENT_OP_TYPE_SET.has(value);
}
