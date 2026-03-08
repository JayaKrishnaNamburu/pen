import { useRef, useState, useEffect } from "react";
import type { Editor } from "@pen/core";

export interface SelectionToolbarState {
	isOpen: boolean;
	selectionRect: DOMRect | null;
}

const CLOSED_STATE: SelectionToolbarState = {
	isOpen: false,
	selectionRect: null,
};

/**
 * Tracks whether the editor has a non-collapsed text selection and
 * provides the native DOM rect of that selection for positioning a
 * floating toolbar.
 *
 * The rect is measured from `window.getSelection().getRangeAt(0)` so
 * it stays in sync with the actual rendered caret/highlight, including
 * after scroll and resize.
 */
export function useSelectionToolbar(editor: Editor): SelectionToolbarState {
	const [state, setState] = useState<SelectionToolbarState>(CLOSED_STATE);
	const rafRef = useRef(0);

	useEffect(() => {
		const update = () => {
			cancelAnimationFrame(rafRef.current);
			rafRef.current = requestAnimationFrame(() => {
				const selection = editor.selection;
				if (
					!selection ||
					selection.type !== "text" ||
					selection.isCollapsed
				) {
					setState(CLOSED_STATE);
					return;
				}

				const domSelection = window.getSelection();
				if (!domSelection || domSelection.rangeCount === 0) {
					setState(CLOSED_STATE);
					return;
				}

				const range = domSelection.getRangeAt(0);
				const rect = range.getBoundingClientRect();

				if (rect.width === 0 && rect.height === 0) {
					setState(CLOSED_STATE);
					return;
				}

				setState({ isOpen: true, selectionRect: rect });
			});
		};

		const unsubs = [
			editor.on("selectionChange", update),
			editor.onDocumentCommit(update),
		];

		update();

		return () => {
			cancelAnimationFrame(rafRef.current);
			unsubs.forEach((u) => u());
		};
	}, [editor]);

	return state;
}
