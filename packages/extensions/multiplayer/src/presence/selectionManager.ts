import type { Anchor, Editor } from "@input/pen-types";
import { clampCellCoord, readGridSize } from "./gridSize";
import type {
	RemoteBlockSelectionState,
	MultiplayerAwarenessState,
	MultiplayerCellCoord,
	RemoteCellSelectionState,
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

function isCellSelectionPayload(value: unknown): value is {
	kind: "cell";
	blockId: string;
	anchor: MultiplayerCellCoord;
	head: MultiplayerCellCoord;
	clock?: number;
} {
	return (
		typeof value === "object" &&
		value !== null &&
		(value as { kind?: unknown }).kind === "cell" &&
		typeof (value as { blockId?: unknown }).blockId === "string" &&
		isCellCoord((value as { anchor?: unknown }).anchor) &&
		isCellCoord((value as { head?: unknown }).head)
	);
}

function isCellCoord(value: unknown): value is MultiplayerCellCoord {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as { row?: unknown }).row === "number" &&
		typeof (value as { col?: unknown }).col === "number"
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

interface HeldRemoteCellSelection {
	kind: "cell";
	user: RemoteSelectionState["user"];
	clock: number;
	blockId: string;
	anchor: MultiplayerCellCoord;
	head: MultiplayerCellCoord;
}

type HeldRemoteSelection =
	| HeldRemoteTextSelection
	| HeldRemoteBlockSelection
	| HeldRemoteCellSelection;

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
			if (isCellSelectionPayload(state.selection)) {
				this.held.set(clientId, {
					kind: "cell",
					user: resolveUser(clientId),
					clock: state.selection.clock ?? Date.now(),
					blockId: state.selection.blockId,
					anchor: state.selection.anchor,
					head: state.selection.head,
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
			const selection = resolveHeldSelection(editor, clientId, held);
			if (selection) {
				selections.push(selection);
			}
		}
		return selections;
	}
}

function resolveHeldSelection(
	editor: Editor,
	clientId: number,
	held: HeldRemoteSelection,
): RemoteSelectionState | null {
	switch (held.kind) {
		case "block":
			return {
				kind: "block",
				clientId,
				user: held.user,
				blockIds: held.blockIds,
				clock: held.clock,
			} satisfies RemoteBlockSelectionState;
		case "cell": {
			// a commit can shrink the grid under a held selection, so re-read it
			// here; a table that is gone or emptied drops the peer entirely.
			const grid = readGridSize(editor, held.blockId);
			if (!grid) {
				return null;
			}
			return {
				kind: "cell",
				clientId,
				user: held.user,
				blockId: held.blockId,
				anchor: clampCellCoord(held.anchor, grid),
				head: clampCellCoord(held.head, grid),
				clock: held.clock,
			} satisfies RemoteCellSelectionState;
		}
		case "text": {
			const anchor = editor.anchors.resolve(held.anchor);
			const head = editor.anchors.resolve(held.head);
			if (!anchor || !head) {
				return null;
			}
			return {
				kind: "text",
				clientId,
				user: held.user,
				anchor: { blockId: anchor.blockId, offset: anchor.offset },
				head: { blockId: head.blockId, offset: head.offset },
				clock: held.clock,
			} satisfies RemoteTextSelectionState;
		}
		default: {
			const _exhaustive: never = held;
			return _exhaustive;
		}
	}
}
