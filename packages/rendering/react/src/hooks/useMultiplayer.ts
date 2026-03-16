import { useSyncExternalStore } from "react";
import type { Editor, Unsubscribe } from "@pen/types";
import {
	type MultiplayerController,
	getMultiplayerController,
	type MultiplayerState,
} from "@pen/multiplayer";

const EMPTY_MULTIPLAYER_STATE: MultiplayerState = {
	connectionState: "disconnected",
	peers: [],
	localUser: {
		id: "",
		name: "",
	},
	isConnected: false,
};

export function useMultiplayer(editor: Editor): MultiplayerState {
	const controller = getMultiplayerController(editor);
	const canReadControllerState = isMultiplayerController(controller);

	return useSyncExternalStore(
		(callback) => {
			if (!canReadControllerState) {
				return () => { };
			}
			return controller.subscribe(callback);
		},
		() =>
			canReadControllerState ? controller.getState() : EMPTY_MULTIPLAYER_STATE,
		() => EMPTY_MULTIPLAYER_STATE,
	);
}

function isMultiplayerController(
	controller: MultiplayerController | null,
): controller is MultiplayerController & {
	subscribe(listener: () => void): Unsubscribe;
	getState(): MultiplayerState;
} {
	return (
		typeof controller?.subscribe === "function" &&
		typeof controller?.getState === "function"
	);
}
