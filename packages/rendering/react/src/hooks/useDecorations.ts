import { useSyncExternalStore } from "react";
import type { DecorationSet, Editor } from "@input/pen-types";
import { emptyDecorationSet } from "@input/pen-core";

export function useDecorations(editor: Editor): DecorationSet {
	return useSyncExternalStore(
		(callback) => editor.on("decorationsChange", callback),
		() => editor.getDecorations(),
		() => emptyDecorationSet(),
	);
}
