import type { Anchor, Editor } from "@input/pen-types";
import type {
	RemoteBlockSelectionState,
	MultiplayerAwarenessState,
	RemoteSelectionState,
	RemoteTextSelectionState,
} from "../types";

function isTextSelectionPayload(value: unknown): value is {
	kind?: "text";
	anchor: string;
	head: string;
	clock?: number;
} {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as { anchor?: unknown }).anchor === "string" &&
		typeof (value as { head?: unknown }).head === "string"
	);
}

function isBlockSelectionPayload(value: unknown): value is {
	kind: "block";
	blockIds: readonly string[];
	clock?: number;
} {
	return (
		typeof value === "object" &&
		value !== null &&
		(value as { kind?: unknown }).kind === "block" &&
		Array.isArray((value as { blockIds?: unknown }).blockIds) &&
		(value as { blockIds: unknown[] }).blockIds.every(
			(blockId) => typeof blockId === "string",
		)
	);
}

interface HeldRemoteTextSelection {
	kind: "text";
	user: RemoteSelectionState["user"];
	clock: number;
	anchor: Anchor;
	head: Anchor;
}

interface HeldRemoteBlockSelection {
	kind: "block";
	user: RemoteSelectionState["user"];
	clock: number;
	blockIds: readonly string[];
}

type HeldRemoteSelection = HeldRemoteTextSelection | HeldRemoteBlockSelection;

export class RemoteSelectionManager {
	private readonly held = new Map<number, HeldRemoteSelection>();

	constructor(private readonly localClientId: number) {}

	ingest(
		editor: Editor,
		states: Map<number, MultiplayerAwarenessState>,
		resolveUser: (clientId: number) => RemoteSelectionState["user"],
	): void {
		this.held.clear();
		for (const [clientId, state] of states) {
			if (clientId === this.localClientId) {
				continue;
			}
			if (isBlockSelectionPayload(state.selection)) {
				this.held.set(clientId, {
					kind: "block",
					user: resolveUser(clientId),
					clock: state.selection.clock ?? Date.now(),
					blockIds: state.selection.blockIds,
				});
				continue;
			}
			if (!isTextSelectionPayload(state.selection)) {
				continue;
			}
			const anchor = editor.anchors.deserialize(state.selection.anchor);
			const head = editor.anchors.deserialize(state.selection.head);
			if (!anchor || !head) {
				continue;
			}
			this.held.set(clientId, {
				kind: "text",
				user: resolveUser(clientId),
				clock: state.selection.clock ?? Date.now(),
				anchor,
				head,
			});
		}
	}

	resolve(editor: Editor): readonly RemoteSelectionState[] {
		const selections: RemoteSelectionState[] = [];
		for (const [clientId, held] of this.held) {
			if (held.kind === "block") {
				selections.push({
					kind: "block",
					clientId,
					user: held.user,
					blockIds: held.blockIds,
					clock: held.clock,
				} satisfies RemoteBlockSelectionState);
				continue;
			}
			const anchor = editor.anchors.resolve(held.anchor);
			const head = editor.anchors.resolve(held.head);
			if (!anchor || !head) {
				continue;
			}
			selections.push({
				kind: "text",
				clientId,
				user: held.user,
				anchor: { blockId: anchor.blockId, offset: anchor.offset },
				head: { blockId: head.blockId, offset: head.offset },
				clock: held.clock,
			} satisfies RemoteTextSelectionState);
		}
		return selections;
	}
}
