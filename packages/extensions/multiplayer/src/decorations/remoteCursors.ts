import type { InlineDecoration } from "@input/pen-types";
import { createRemotePresenceAttributes } from "../presence/presenceAttributes";
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
		attributes: createRemotePresenceAttributes({
			className: "pen-multiplayer-cursor",
			markerName: "data-pen-multiplayer-cursor",
			clientId: cursor.clientId,
			user: cursor.user,
		}),
	}));
}
