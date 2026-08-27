import { useSyncExternalStore } from "react";
import { snapshotsControllerFacet } from "@input/pen-core";
import type { SnapshotsController, SnapshotsState } from "@input/pen-snapshots";
import type { Editor, Unsubscribe } from "@input/pen-types";

const EMPTY_HISTORY_STATE: SnapshotsState = {
	snapshots: [],
	isRestoring: false,
};

export function useSnapshots(editor: Editor): SnapshotsState {
	const controller =
		(editor.facet(snapshotsControllerFacet) as SnapshotsController | null) ??
		null;
	const canReadControllerState = isHistoryController(controller);

	return useSyncExternalStore(
		(callback) => {
			if (!canReadControllerState) {
				return () => {};
			}
			return controller.subscribe(callback);
		},
		() =>
			canReadControllerState
				? controller.getState()
				: EMPTY_HISTORY_STATE,
		() => EMPTY_HISTORY_STATE,
	);
}

function isHistoryController(
	controller: SnapshotsController | null,
): controller is SnapshotsController & {
	subscribe(listener: () => void): Unsubscribe;
	getState(): SnapshotsState;
} {
	return (
		typeof controller?.subscribe === "function" &&
		typeof controller?.getState === "function"
	);
}
