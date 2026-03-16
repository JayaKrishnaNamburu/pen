import type { MultiplayerAwarenessState, RemoteCursorState } from "../types";

function isCursorPayload(value: unknown): value is {
	blockId: string;
	offset: number;
	clock?: number;
} {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as { blockId?: unknown }).blockId === "string" &&
		typeof (value as { offset?: unknown }).offset === "number"
	);
}

export class RemoteCursorManager {
	constructor(private readonly localClientId: number) {}

	build(
		states: Map<number, MultiplayerAwarenessState>,
		resolveUser: (clientId: number) => RemoteCursorState["user"],
	): readonly RemoteCursorState[] {
		const cursors: RemoteCursorState[] = [];

		for (const [clientId, state] of states) {
			if (clientId === this.localClientId) {
				continue;
			}

			if (!isCursorPayload(state.cursor)) {
				continue;
			}

			cursors.push({
				clientId,
				user: resolveUser(clientId),
				blockId: state.cursor.blockId,
				offset: state.cursor.offset,
				clock: state.cursor.clock ?? Date.now(),
			});
		}

		return cursors;
	}
}
