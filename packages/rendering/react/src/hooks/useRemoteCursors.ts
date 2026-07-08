import { useSyncExternalStore } from "react";
import type {
	MultiplayerController,
	RemoteCursorState,
} from "@input/pen-multiplayer";
import { getMultiplayerController } from "@input/pen-multiplayer";
import type { Editor, Unsubscribe } from "@input/pen-types";

const EMPTY_REMOTE_CURSORS: readonly RemoteCursorState[] = [];

export function useRemoteCursors(
	editor: Editor,
): readonly RemoteCursorState[] {
	const controller = getMultiplayerController(editor);
	const canReadRemoteCursors = isRemoteCursorController(controller);

	return useSyncExternalStore(
		(callback) => {
			if (!canReadRemoteCursors) {
				return () => {};
			}
			return controller.subscribe(callback);
		},
		() =>
			canReadRemoteCursors
				? controller.getRemoteCursors()
				: EMPTY_REMOTE_CURSORS,
		() => EMPTY_REMOTE_CURSORS,
	);
}

function isRemoteCursorController(
	controller: MultiplayerController | null,
): controller is MultiplayerController & {
	subscribe(listener: () => void): Unsubscribe;
	getRemoteCursors(): readonly RemoteCursorState[];
} {
	return (
		typeof controller?.subscribe === "function" &&
		typeof controller?.getRemoteCursors === "function"
	);
}
