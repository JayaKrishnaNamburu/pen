import type { Editor } from "@input/pen-types";
import type {
	MultiplayerCursorPayload,
	MultiplayerTextSelectionPayload,
} from "../types";

/** Validator-only fixture: shape-legal, not a live CRDT position. */
export const VALID_WIRE_ANCHOR = '{"v":1,"b":"b1","a":1,"p":"AA=="}';

export function serializePoint(
	editor: Editor,
	blockId: string,
	offset: number,
): string {
	const anchor = editor.anchors.create({ blockId, offset }, 1);
	if (!anchor) {
		throw new Error(`failed to mint test anchor at ${blockId}:${offset}`);
	}
	return editor.anchors.serialize(anchor);
}

export function wireCursor(
	editor: Editor,
	offset: number,
	clock = 10,
	blockId = "b1",
): MultiplayerCursorPayload {
	return {
		anchor: serializePoint(editor, blockId, offset),
		clock,
	};
}

export function wireTextSelection(
	editor: Editor,
	from: number,
	to: number,
	clock = 11,
	blockId = "b1",
): MultiplayerTextSelectionPayload {
	return {
		kind: "text",
		anchor: serializePoint(editor, blockId, from),
		head: serializePoint(editor, blockId, to),
		clock,
	};
}
