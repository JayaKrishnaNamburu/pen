import type {
	RemoteBlockSelectionState,
	MultiplayerAwarenessState,
	RemoteSelectionState,
	RemoteTextSelectionState,
} from "../types";

function isPointPayload(value: unknown): value is {
	blockId: string;
	offset: number;
} {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as { blockId?: unknown }).blockId === "string" &&
		typeof (value as { offset?: unknown }).offset === "number"
	);
}

function isSelectionPayload(value: unknown): value is {
	kind?: "text";
	anchor: { blockId: string; offset: number };
	head: { blockId: string; offset: number };
	clock?: number;
} {
	return (
		typeof value === "object" &&
		value !== null &&
		isPointPayload((value as { anchor?: unknown }).anchor) &&
		isPointPayload((value as { head?: unknown }).head)
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

export class RemoteSelectionManager {
	constructor(private readonly localClientId: number) {}

	build(
		states: Map<number, MultiplayerAwarenessState>,
		resolveUser: (clientId: number) => RemoteSelectionState["user"],
	): readonly RemoteSelectionState[] {
		const selections: RemoteSelectionState[] = [];

		for (const [clientId, state] of states) {
			if (clientId === this.localClientId) {
				continue;
			}

			if (!isSelectionPayload(state.selection)) {
				if (!isBlockSelectionPayload(state.selection)) {
					continue;
				}

				selections.push({
					kind: "block",
					clientId,
					user: resolveUser(clientId),
					blockIds: state.selection.blockIds,
					clock: state.selection.clock ?? Date.now(),
				} satisfies RemoteBlockSelectionState);
				continue;
			}

			selections.push({
				kind: "text",
				clientId,
				user: resolveUser(clientId),
				anchor: state.selection.anchor,
				head: state.selection.head,
				clock: state.selection.clock ?? Date.now(),
			} satisfies RemoteTextSelectionState);
		}

		return selections;
	}
}
