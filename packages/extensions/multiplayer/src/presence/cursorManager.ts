import type { Anchor, Editor } from "@input/pen-types";
import type { MultiplayerAwarenessState, RemoteCursorState } from "../types";

function isCursorPayload(value: unknown): value is {
	anchor: string;
	clock?: number;
} {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as { anchor?: unknown }).anchor === "string"
	);
}

interface HeldRemoteCursor {
	user: RemoteCursorState["user"];
	clock: number;
	anchor: Anchor;
}

export class RemoteCursorManager {
	private readonly held = new Map<number, HeldRemoteCursor>();

	constructor(private readonly localClientId: number) {}

	ingest(
		editor: Editor,
		states: Map<number, MultiplayerAwarenessState>,
		resolveUser: (clientId: number) => RemoteCursorState["user"],
	): void {
		this.held.clear();
		for (const [clientId, state] of states) {
			if (clientId === this.localClientId) {
				continue;
			}
			if (!isCursorPayload(state.cursor)) {
				continue;
			}
			const anchor = editor.anchors.deserialize(state.cursor.anchor);
			if (!anchor) {
				continue;
			}
			this.held.set(clientId, {
				user: resolveUser(clientId),
				clock: state.cursor.clock ?? Date.now(),
				anchor,
			});
		}
	}

	resolve(editor: Editor): readonly RemoteCursorState[] {
		const cursors: RemoteCursorState[] = [];
		for (const [clientId, held] of this.held) {
			const target = editor.anchors.resolve(held.anchor);
			if (!target) {
				continue;
			}
			cursors.push({
				clientId,
				user: held.user,
				blockId: target.blockId,
				offset: target.offset,
				clock: held.clock,
			});
		}
		return cursors;
	}
}
