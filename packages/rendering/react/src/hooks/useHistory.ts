import { useSyncExternalStore } from "react";
import type { Editor, Unsubscribe } from "@pen/types";
import {
	getHistoryController,
	type HistoryController,
	type HistoryState,
} from "@pen/history";

const EMPTY_HISTORY_STATE: HistoryState = {
	snapshots: [],
	isRestoring: false,
};

export function useHistory(editor: Editor): HistoryState {
	const controller = getHistoryController(editor);
	const canReadControllerState = isHistoryController(controller);

	return useSyncExternalStore(
		(callback) => {
			if (!canReadControllerState) {
				return () => {};
			}
			return controller.subscribe(callback);
		},
		() => (canReadControllerState ? controller.getState() : EMPTY_HISTORY_STATE),
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
