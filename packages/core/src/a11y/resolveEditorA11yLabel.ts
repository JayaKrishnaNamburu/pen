import { isA11yLabelledBy, type Editor } from "@input/pen-types";

import { a11yLabelFacet } from "../facets/a11yFacets";
import { resolveEditorMessage } from "../i18n/resolveEditorMessage";

export const A11Y_MISSING_LABEL_CODE = "a11y-missing-label";

export interface EditorA11yLabelAttrs {
	"aria-label"?: string;
	"aria-labelledby"?: string;
}

const missingLabelWarned = new WeakSet<Editor>();

export function resolveEditorA11yLabel(editor: Editor): EditorA11yLabelAttrs {
	const value = editor.facet(a11yLabelFacet);
	if (typeof value === "string") {
		return { "aria-label": value };
	}
	if (value != null && isA11yLabelledBy(value)) {
		return { "aria-labelledby": value.labelledBy };
	}
	warnMissingA11yLabel(editor);
	return {
		"aria-label": resolveEditorMessage(editor, "pen.editor.label"),
	};
}

function warnMissingA11yLabel(editor: Editor): void {
	if (missingLabelWarned.has(editor)) {
		return;
	}
	missingLabelWarned.add(editor);
	if (!editor.internals.hasListeners("diagnostic")) {
		return;
	}
	editor.internals.emit("diagnostic", {
		code: A11Y_MISSING_LABEL_CODE,
		level: "warn",
		source: "a11y",
		message:
			'pen.a11yLabel is required; provide createEditor({ a11yLabel }) or a11yLabelFacet.of(...)',
		remediation:
			"Pass a11yLabel at createEditor or register a pen.a11yLabel facet provider.",
	});
}
