import type { BlockSchema, FieldEditorType } from "./schema";

export type FieldEditorBehavior =
	| "inline-richtext"
	| "inline-plaintext"
	| "inline-code"
	| "grid"
	| "none";

export type FieldEditorInputMode = "richtext" | "code" | "table" | "none";

type FieldEditorSchemaLike = Pick<BlockSchema, "content" | "fieldEditor">;

export function resolveFieldEditorBehavior(
	schema: FieldEditorSchemaLike | null | undefined,
): FieldEditorBehavior {
	if (!schema) {
		return "none";
	}

	const declaredType = normalizeFieldEditorType(schema);
	if (declaredType === "none") {
		return "none";
	}
	if (declaredType === "table" || declaredType === "database") {
		return "grid";
	}
	if (declaredType === "code") {
		return "inline-code";
	}
	if (declaredType === "plaintext") {
		return "inline-plaintext";
	}
	if (schema.content === "inline") {
		return "inline-richtext";
	}
	return "none";
}

export function resolveFieldEditorInputMode(
	schema: FieldEditorSchemaLike | null | undefined,
): FieldEditorInputMode {
	const behavior = resolveFieldEditorBehavior(schema);
	if (behavior === "inline-code") {
		return "code";
	}
	if (behavior === "grid") {
		return "table";
	}
	if (behavior === "none") {
		return "none";
	}
	return "richtext";
}

export function usesInlineTextSelection(
	schema: FieldEditorSchemaLike | null | undefined,
): boolean {
	const behavior = resolveFieldEditorBehavior(schema);
	return (
		behavior === "inline-richtext" ||
		behavior === "inline-plaintext" ||
		behavior === "inline-code"
	);
}

export function supportsInlineMarks(
	schema: FieldEditorSchemaLike | null | undefined,
): boolean {
	return resolveFieldEditorBehavior(schema) === "inline-richtext";
}

export function supportsInlineInputRules(
	schema: FieldEditorSchemaLike | null | undefined,
): boolean {
	return resolveFieldEditorBehavior(schema) === "inline-richtext";
}

export function delegatesToGridEditing(
	schema: FieldEditorSchemaLike | null | undefined,
): boolean {
	return resolveFieldEditorBehavior(schema) === "grid";
}

export function hasFieldEditorSurface(
	schema: FieldEditorSchemaLike | null | undefined,
): boolean {
	return resolveFieldEditorBehavior(schema) !== "none";
}

function normalizeFieldEditorType(
	schema: FieldEditorSchemaLike,
): Exclude<FieldEditorType, undefined> {
	if (schema.fieldEditor) {
		return schema.fieldEditor;
	}
	if (schema.content === "inline") {
		return "richtext";
	}
	if (schema.content === "table" || schema.content === "database") {
		return "table";
	}
	return "none";
}
