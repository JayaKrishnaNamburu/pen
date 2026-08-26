import { messagesFacet } from "@input/pen-core";
import {
	SCHEMA_DISPLAY_CATALOG,
	resolveDisplayCopy,
	resolveDisplayGroup,
	schemaDisplayKey,
} from "@input/pen-schema-default";
import type { Editor } from "@input/pen-types";

export function displayCatalogForEditor(
	editor?: Editor,
): Record<string, string> {
	const catalog: Record<string, string> = { ...SCHEMA_DISPLAY_CATALOG };
	if (!editor) {
		return catalog;
	}
	for (const [key, value] of Object.entries(editor.facet(messagesFacet))) {
		if (typeof value === "string") {
			catalog[key] = value;
		}
	}
	return catalog;
}

export function resolveSlashMenuTitle(
	type: string,
	title: string | undefined,
	catalog: Record<string, string>,
): string {
	const fromType = catalog[schemaDisplayKey(type, "title")];
	if (fromType) {
		return fromType;
	}
	return resolveDisplayCopy(title, catalog) ?? type;
}

export function resolveSlashMenuGroup(
	group: string | undefined,
	catalog: Record<string, string>,
): string {
	return (
		resolveDisplayGroup(group, catalog) ??
		catalog["pen.display.group.other"] ??
		group ??
		""
	);
}

export function resolveEditorSchemaPlaceholder(
	editor: Editor,
	blockId: string,
): string | undefined {
	const block = editor.getBlock(blockId);
	if (!block) {
		return undefined;
	}
	const raw = editor.schema.resolve(block.type)?.placeholder;
	const catalog = displayCatalogForEditor(editor);
	return (
		catalog[schemaDisplayKey(block.type, "placeholder")] ??
		resolveDisplayCopy(raw, catalog)
	);
}
