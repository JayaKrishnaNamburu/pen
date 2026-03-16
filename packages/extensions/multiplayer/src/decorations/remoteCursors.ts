import type { InlineDecoration } from "@pen/types";
import type { RemoteCursorState } from "../types";

export function buildRemoteCursorDecorations(
	cursors: readonly RemoteCursorState[],
): InlineDecoration[] {
	return cursors.map((cursor) => ({
		type: "inline",
		blockId: cursor.blockId,
		from: cursor.offset,
		to: cursor.offset,
		key: `multiplayer-cursor:${cursor.clientId}:${cursor.blockId}:${cursor.offset}:${cursor.clock}`,
		attributes: {
			class: "pen-multiplayer-cursor",
			style: `--pen-multiplayer-color: ${cursor.user.color}`,
			"data-pen-multiplayer-cursor": "",
			"data-multiplayer-client-id": String(cursor.clientId),
			"data-user-id": cursor.user.id,
			"data-user-name": cursor.user.name,
		},
	}));
}
