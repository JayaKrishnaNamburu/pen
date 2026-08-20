import { messagesFacet } from "@input/pen-core";
import type { Editor } from "@input/pen-types";

export function resolveEditorSchemaPlaceholder(
	editor: Editor,
	blockId: string,
): string | undefined {
	const block = editor.getBlock(blockId);
	if (!block) {
		return undefined;
	}
	const raw = editor.schema.resolve(block.type)?.placeholder;
	const catalog = editor.facet(messagesFacet) as Record<string, unknown>;
	const mapped = catalog[`pen.schema.${block.type}.placeholder`];
	return typeof mapped === "string" ? mapped : raw;
}
