import type { Editor } from "@input/pen-types";
import {
	resolveHistoryAuthor,
	resolvePresenceDisplayHint,
} from "./identityResolver";
import type { CharacterAttribution, ResolveHistoryAuthor } from "../types";

export function getCharacterAttribution(
	editor: Editor,
	blockId: string,
	resolveAuthor?: ResolveHistoryAuthor,
): readonly CharacterAttribution[] {
	const adapter = editor.internals.adapter;
	const doc = editor.internals.crdtDoc;

	if (!adapter.getAttributionRanges) {
		return [];
	}

	return adapter.getAttributionRanges(doc, blockId).map((range) => {
		const author = resolveHistoryAuthor(editor, range.clientId, resolveAuthor);
		const displayHint = resolvePresenceDisplayHint(editor, range.clientId);
		return {
			blockId,
			offset: range.offset,
			length: range.length,
			clientId: range.clientId,
			author,
			...(displayHint ? { displayHint } : {}),
			userId: author.id,
			userName: author.name,
			...(author.verified && author.color ? { color: author.color } : {}),
			timestamp: 0,
		};
	});
}
