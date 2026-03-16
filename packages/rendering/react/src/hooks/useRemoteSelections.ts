import { useSyncExternalStore } from "react";
import type {
	MultiplayerController,
	RemoteSelectionState,
} from "@pen/multiplayer";
import { getMultiplayerController } from "@pen/multiplayer";
import type { Editor, Unsubscribe } from "@pen/types";

const EMPTY_REMOTE_SELECTIONS: readonly RemoteSelectionState[] = [];

export function useRemoteSelections(
	editor: Editor,
): readonly RemoteSelectionState[] {
	const controller = getMultiplayerController(editor);
	const canReadRemoteSelections = isRemoteSelectionController(controller);

	return useSyncExternalStore(
		(callback) => {
			if (!canReadRemoteSelections) {
				return () => {};
			}
			return controller.subscribe(callback);
		},
		() =>
			canReadRemoteSelections
				? controller.getRemoteSelections()
				: EMPTY_REMOTE_SELECTIONS,
		() => EMPTY_REMOTE_SELECTIONS,
	);
}

function isRemoteSelectionController(
	controller: MultiplayerController | null,
): controller is MultiplayerController & {
	subscribe(listener: () => void): Unsubscribe;
	getRemoteSelections(): readonly RemoteSelectionState[];
} {
	return (
		typeof controller?.subscribe === "function" &&
		typeof controller?.getRemoteSelections === "function"
	);
}
