import type { Editor, SelectionRecord } from "@input/pen-types";

type EditorWithSelectionRecord = Editor & {
	readonly selectionRecord: SelectionRecord;
};

/**
 * Reads the selection authority's current {@link SelectionRecord} from an editor.
 *
 * The record carries the version and origin alongside the selection state, which
 * the DOM reader needs to tell a projection echo from a fresh user gesture. The
 * plain `editor.selection` state cannot answer that.
 *
 * @param editor - Any editor; the record lives on the runtime implementation.
 * @returns The current record, or `null` on an editor that does not carry one.
 */
export function getEditorSelectionRecord(
	editor: Editor,
): SelectionRecord | null {
	const record = (editor as EditorWithSelectionRecord).selectionRecord;
	return record ?? null;
}
