import {
	createYjsProviderSession,
	getYjsAwareness,
	getYjsDoc,
} from "@pen/crdt-yjs";
import type {
	MultiplayerSession,
	MultiplayerSessionContext,
} from "@pen/types";
import { WebsocketProvider } from "y-websocket";

export interface CreateYWebsocketSessionFactoryOptions {
	serverUrl: string;
	room: string;
	params?: Record<string, string>;
	maxBackoffTime?: number;
}

export function createYWebsocketSessionFactory(
	options: CreateYWebsocketSessionFactoryOptions,
): (context: MultiplayerSessionContext) => MultiplayerSession {
	return ({ editor, awareness }) => {
		const provider = new WebsocketProvider(
			options.serverUrl,
			options.room,
			getYjsDoc(editor),
			{
				awareness: getYjsAwareness(awareness),
				connect: false,
				params: options.params,
				maxBackoffTime: options.maxBackoffTime,
			},
		);

		return createYjsProviderSession({
			connect: () => provider.connect(),
			disconnect: () => provider.disconnect(),
			destroy: () => provider.destroy(),
			getStatus: () => {
				if (provider.wsconnected) {
					return "connected";
				}

				if (provider.wsconnecting) {
					return "connecting";
				}

				return "disconnected";
			},
			getIsSynced: () => provider.synced,
			onStatusChange: (listener) => {
				const handleStatus = (event: {
					status: "disconnected" | "connecting" | "connected";
				}) => {
					listener(event.status);
				};

				provider.on("status", handleStatus);
				return () => {
					provider.off("status", handleStatus);
				};
			},
			onSync: (listener) => {
				provider.on("sync", listener);
				return () => {
					provider.off("sync", listener);
				};
			},
		});
	};
}
