import { useSyncExternalStore } from "react";
import { multiplayerControllerFacet } from "@input/pen-core";
import type {
	MultiplayerController,
	RemoteSelectionState,
} from "@input/pen-multiplayer";
import type { Editor, Unsubscribe } from "@input/pen-types";

const EMPTY_REMOTE_SELECTIONS: readonly RemoteSelectionState[] = [];

export function useRemoteSelections(
	editor: Editor,
): readonly RemoteSelectionState[] {
	const controller =
		(editor.facet(multiplayerControllerFacet) as MultiplayerController | null) ??
		null;
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
