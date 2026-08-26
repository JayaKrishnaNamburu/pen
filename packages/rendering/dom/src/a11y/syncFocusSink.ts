import { resolveEditorMessage } from "@input/pen-core";
import type { Editor, SelectionState } from "@input/pen-types";

import type { FocusSink } from "./focusSink";

export function syncFocusSink(
	sink: FocusSink,
	editor: Editor,
	selection: SelectionState = editor.selection,
): void {
	if (selection?.type === "block" && selection.blockIds.length > 0) {
		sink.reveal({
			kind: "block",
			label: resolveEditorMessage(
				editor,
				"pen.a11y.blockSelectionEntered",
				{ count: selection.blockIds.length },
			),
		});
		return;
	}
	if (selection?.type === "cell") {
		const rows = Math.abs(selection.head.row - selection.anchor.row) + 1;
		const columns = Math.abs(selection.head.col - selection.anchor.col) + 1;
		sink.reveal({
			kind: "cell",
			label: resolveEditorMessage(
				editor,
				"pen.a11y.cellSelectionChanged",
				{ rows, columns },
			),
		});
		return;
	}
	sink.hide();
}
