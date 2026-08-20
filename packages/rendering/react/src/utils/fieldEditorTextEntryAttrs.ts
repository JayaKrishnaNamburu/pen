import { resolveEditorA11yLabel } from "@input/pen-core";
import type { Editor } from "@input/pen-types";
import { DATA_ATTRS } from "./dataAttributes";

export function fieldEditorTextEntryAttrs(
	isActive: boolean,
	editor: Editor,
): Record<string, unknown> {
	if (!isActive) {
		return {
			[DATA_ATTRS.fieldEditorActiveSurface]: undefined,
			role: undefined,
			"aria-multiline": undefined,
			"aria-label": undefined,
			"aria-labelledby": undefined,
		};
	}
	return {
		[DATA_ATTRS.fieldEditorActiveSurface]: "",
		role: "textbox",
		"aria-multiline": true,
		...resolveEditorA11yLabel(editor),
	};
}
