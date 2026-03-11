import type { BlockSchema, ContentType } from "@pen/types";

type RuntimeContentType =
	| "inline"
	| "none"
	| "table"
	| "database"
	| "subdocument"
	| "nested";

export function resolveRuntimeContentType(
	schema: Pick<BlockSchema, "content"> | null | undefined,
): RuntimeContentType {
	if (!schema) {
		return "none";
	}

	if (Array.isArray(schema.content)) {
		return "nested";
	}

	return schema.content;
}
