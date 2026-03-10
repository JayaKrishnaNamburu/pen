import type { Decoration, DecorationSet, Editor } from "@pen/core";
import { emptyDecorationSet } from "@pen/core";
import { useSyncExternalStoreWithSelector } from "../utils/useSyncExternalStoreWithSelector";

export function useBlockDecorations(
	editor: Editor,
	blockId: string,
): readonly Decoration[] {
	return useSyncExternalStoreWithSelector(
		(callback) => editor.on("decorationsChange", callback),
		() => getDecorationSet(editor),
		() => emptyDecorationSet(),
		(decorations) => decorations.forBlock(blockId),
		decorationsEqual,
	);
}

function getDecorationSet(editor: Editor): DecorationSet {
	const editorWithDecorations = editor as unknown as {
		getDecorations?: () => DecorationSet;
	};
	if (typeof editorWithDecorations.getDecorations === "function") {
		return editorWithDecorations.getDecorations();
	}
	return emptyDecorationSet();
}

function decorationsEqual(
	a: readonly Decoration[],
	b: readonly Decoration[],
): boolean {
	if (a === b) return true;
	if (a.length === 0 && b.length === 0) {
		return true;
	}
	if (a.length !== b.length) return false;

	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) {
			return false;
		}
	}

	return true;
}
