import { resolveEditorMessage } from "@input/pen-core";
import { isMessageKey, type Editor } from "@input/pen-types";

export function resolveCatalogCopy(
	editor: Editor,
	value: string,
	params?: Record<string, unknown>,
): string {
	if (!isMessageKey(value)) {
		return value;
	}
	return resolveEditorMessage(editor, value, params as never);
}
