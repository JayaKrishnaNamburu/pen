import { useSyncExternalStore } from "react";
import { historyControllerFacet } from "@input/pen-core";
import type { HistoryController, HistoryState } from "@input/pen-history";
import type { Editor, Unsubscribe } from "@input/pen-types";

const EMPTY_HISTORY_STATE: HistoryState = {
	snapshots: [],
	isRestoring: false,
};

export function useHistory(editor: Editor): HistoryState {
	const controller =
		(editor.facet(historyControllerFacet) as HistoryController | null) ??
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
	controller: HistoryController | null,
): controller is HistoryController & {
	subscribe(listener: () => void): Unsubscribe;
	getState(): HistoryState;
} {
	return (
		typeof controller?.subscribe === "function" &&
		typeof controller?.getState === "function"
	);
}
