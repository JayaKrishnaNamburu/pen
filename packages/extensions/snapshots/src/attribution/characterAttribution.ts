import type { Editor } from "@input/pen-types";
import {
	resolveHistoryAuthor,
	resolvePresenceDisplayHint,
} from "./identityResolver";
import type { CharacterAttribution, ResolveSnapshotAuthor } from "../types";

/**
 * Read per-character authorship for one block from the CRDT adapter.
 * Returns an empty array when the adapter does not track attribution, so
 * a host can call this without first checking adapter capabilities.
 *
 * Without `resolveAuthor` every range reports an opaque client handle;
 * peer-asserted presence names ride along as `displayHint` and are never
 * promoted into `author`.
 */
export function getCharacterAttribution(
	editor: Editor,
	blockId: string,
	resolveAuthor?: ResolveSnapshotAuthor,
): readonly CharacterAttribution[] {
	const adapter = editor.internals.adapter;
	const doc = editor.internals.crdtDoc;

	if (!adapter.getAttributionRanges) {
		return [];
	}

	return adapter.getAttributionRanges(doc, blockId).map((range) => {
		const author = resolveHistoryAuthor(
			editor,
			range.clientId,
			resolveAuthor,
		);
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
