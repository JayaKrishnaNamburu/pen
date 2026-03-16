import type { Editor } from "@pen/types";
import { resolveHistoryAuthor } from "./identityResolver";
import type { CharacterAttribution } from "../types";

export function getCharacterAttribution(
	editor: Editor,
	blockId: string,
): readonly CharacterAttribution[] {
	const adapter = editor.internals.adapter;
	const doc = editor.internals.crdtDoc;

	if (!adapter.getAttributionRanges) {
		return [];
	}

	return adapter.getAttributionRanges(doc, blockId).map((range) => {
		const author = resolveHistoryAuthor(editor, range.clientId);
		return {
			blockId,
			offset: range.offset,
			length: range.length,
			clientId: range.clientId,
			userId: author.id,
			userName: author.name,
			color: author.color,
			timestamp: 0,
		};
	});
}
