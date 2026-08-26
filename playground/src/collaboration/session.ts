import {
	createYjsProviderSession,
	getYjsAwareness,
	getYjsDoc,
} from "@input/pen-crdt-yjs";
import { multiplayerExtension } from "@input/pen-multiplayer";
import { generateId, type Extension } from "@input/pen-types";
import { WebsocketProvider } from "y-websocket";

const USER_STORAGE_KEY = "pen:playground:collaboration-user";
const ROOM_QUERY = "room";
const USER_COLORS = [
	"#2563eb",
	"#7c3aed",
	"#db2777",
	"#ea580c",
	"#0891b2",
	"#16a34a",
] as const;

export interface CollaborationUser {
	id: string;
	name: string;
	color: string;
}

export interface CollaborationSession {
	room: string;
	user: CollaborationUser;
}

export function readRoomFromUrl(): string | null {
	if (typeof window === "undefined") {
		return null;
	}
	const room = new URL(window.location.href).searchParams
		.get(ROOM_QUERY)
		?.trim();
	return room ? room : null;
}

export function suggestRoomId(): string {
	return `pen-${generateId().slice(0, 8)}`;
}

export function writeRoomToUrl(room: string | null): void {
	const next = new URL(window.location.href);
	if (room) {
		next.searchParams.set(ROOM_QUERY, room);
	} else {
		next.searchParams.delete(ROOM_QUERY);
	}
	window.history.replaceState(null, "", next);
}

export function readStoredUser(): CollaborationUser {
	const stored = window.sessionStorage.getItem(USER_STORAGE_KEY);
	if (stored) {
		try {
			const parsed = JSON.parse(stored) as Partial<CollaborationUser>;
			if (
				typeof parsed.id === "string" &&
				typeof parsed.name === "string" &&
				typeof parsed.color === "string"
			) {
				return {
					id: parsed.id,
					name: parsed.name,
					color: parsed.color,
				};
			}
		} catch {
			// fall through and mint a new one
		}
	}

	const id = generateId();
	const user: CollaborationUser = {
		id,
		name: "",
		color: USER_COLORS[hashString(id) % USER_COLORS.length],
	};
	window.sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
	return user;
}

export function saveUserName(name: string): CollaborationUser {
	const user = {
		...readStoredUser(),
		name: name.trim(),
	};
	window.sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
	return user;
}

export function readSession(): CollaborationSession | null {
	const room = readRoomFromUrl();
	const user = readStoredUser();
	if (!room || !user.name) {
		return null;
	}
	return { room, user };
}

export function createCollaborationExtension(
	session: CollaborationSession,
): Extension {
	return multiplayerExtension({
		user: session.user,
		sessionFactory: ({ editor, awareness }) => {
			const protocol =
				window.location.protocol === "https:" ? "wss:" : "ws:";
			const provider = new WebsocketProvider(
				`${protocol}//${window.location.host}/collaboration`,
				session.room,
				getYjsDoc(editor),
				{
					awareness: getYjsAwareness(awareness),
					connect: false,
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
					const handle = (event: {
						status: "disconnected" | "connecting" | "connected";
					}) => {
						listener(event.status);
					};
					provider.on("status", handle);
					return () => {
						provider.off("status", handle);
					};
				},
				onSync: (listener) => {
					const handle = (isSynced: boolean) => {
						listener(isSynced);
					};
					provider.on("sync", handle);
					return () => {
						provider.off("sync", handle);
					};
				},
			});
		},
	});
}

function hashString(value: string): number {
	let hash = 0;
	for (const character of value) {
		hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
	}
	return hash;
}
