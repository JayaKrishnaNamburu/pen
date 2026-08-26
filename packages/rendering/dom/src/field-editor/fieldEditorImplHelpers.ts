import { resolveFieldEditorInputMode } from "@input/pen-core";
import type { BlockSchema } from "@input/pen-types";

export function resolveInputMode(
	schema?: BlockSchema | null,
): "richtext" | "code" | "table" | "none" {
	return resolveFieldEditorInputMode(schema);
}

export function areBlockIdsEqual(
	left: readonly string[],
	right: readonly string[],
): boolean {
	if (left.length !== right.length) return false;
	for (let i = 0; i < left.length; i++) {
		if (left[i] !== right[i]) return false;
	}
	return true;
}
