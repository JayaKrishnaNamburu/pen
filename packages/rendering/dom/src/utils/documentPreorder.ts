import type { Editor } from "@input/pen-types";

export function getPreorderBlockIds(editor: Editor): string[] {
	const ids: string[] = [];
	for (const block of editor.documentState.blocks) {
		ids.push(block.id);
	}
	return ids;
}
