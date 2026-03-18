import { createYjsProviderSession, getYjsAwareness, getYjsDoc } from "@pen/crdt-yjs";
import { multiplayerExtension } from "@pen/multiplayer";
import type {
	DocumentOp,
	Editor,
	Extension,
	MultiplayerSession,
	MultiplayerSessionContext,
} from "@pen/types";
import { WebsocketProvider } from "y-websocket";

const PLAYGROUND_COLLAB_USER_STORAGE_KEY = "pen:playground:collaboration-user";
const DEFAULT_PLAYGROUND_COLLAB_SERVER_PORT = "8787";
const DEFAULT_PLAYGROUND_COLLAB_SERVER_PATH = "/collaboration";
const DEFAULT_PLAYGROUND_COLLAB_ROOM = "pen-playground";
const PLAYGROUND_COLLAB_ROOM_QUERY_PARAM = "room";
const PLAYGROUND_USER_COLORS = [
	"#2563eb",
	"#7c3aed",
	"#db2777",
	"#ea580c",
	"#0891b2",
	"#16a34a",
] as const;

export interface PlaygroundCollaborationUser {
	id: string;
	name: string;
	color: string;
}

export interface PlaygroundCollaborationConfig {
	serverUrl: string;
	room: string;
	user: PlaygroundCollaborationUser;
}

export function getPlaygroundCollaborationConfig(): PlaygroundCollaborationConfig {
	const storedUser = getStoredPlaygroundUser();
	const configuredName = getConfiguredPlaygroundCollaborationUserName();
	return {
		serverUrl: resolvePlaygroundCollaborationServerUrl(),
		room: getPlaygroundCollaborationRoom(),
		user: {
			id: storedUser.id,
			name: configuredName ?? storedUser.name,
			color:
				import.meta.env.VITE_PLAYGROUND_COLLAB_USER_COLOR ?? storedUser.color,
		},
	};
}

export function getPlaygroundCollaborationRoom(): string {
	const roomFromUrl = getPlaygroundCollaborationRoomFromUrl();
	if (roomFromUrl) {
		return roomFromUrl;
	}
	return (
		import.meta.env.VITE_PLAYGROUND_COLLAB_ROOM ??
		DEFAULT_PLAYGROUND_COLLAB_ROOM
	);
}

export function startFreshPlaygroundCollaborationRoom(): string {
	const nextRoom = createFreshPlaygroundCollaborationRoomId();
	if (typeof window !== "undefined") {
		window.location.assign(
			buildPlaygroundCollaborationRoomUrl(window.location.href, nextRoom),
		);
	}
	return nextRoom;
}

export function getPlaygroundCollaborationUserName(): string {
	return getConfiguredPlaygroundCollaborationUserName() ?? getStoredPlaygroundUser().name;
}

export function savePlaygroundCollaborationUserName(
	name: string,
): PlaygroundCollaborationUser {
	const nextUser = {
		...getStoredPlaygroundUser(),
		name: name.trim(),
	};
	storePlaygroundUser(nextUser);
	return nextUser;
}

export function createPlaygroundCollaborationExtension(): Extension {
	const collaboration = getPlaygroundCollaborationConfig();
	return multiplayerExtension({
		user: collaboration.user,
		sessionFactory: createYWebsocketSessionFactory({
			serverUrl: collaboration.serverUrl,
			room: collaboration.room,
		}),
	});
}

export function normalizePlaygroundCollaborationDocument(editor: Editor): boolean {
	const blockIds = [...editor.documentState.blockOrder];
	if (blockIds.length === 0) {
		editor.apply(
			[
				{
					type: "insert-block",
					blockId: crypto.randomUUID(),
					blockType: "paragraph",
					props: {},
					position: "last",
				},
			],
			{ origin: "system" },
		);
		return true;
	}

	if (!isEmptyParagraphOnlyDocument(editor, blockIds)) {
		return false;
	}

	if (blockIds.length === 1) {
		return false;
	}

	const deleteOps: DocumentOp[] = blockIds.slice(1).map((blockId) => ({
		type: "delete-block",
		blockId,
	}));
	editor.apply(deleteOps, { origin: "system" });
	return true;
}

function createYWebsocketSessionFactory(options: {
	serverUrl: string;
	room: string;
}): (context: MultiplayerSessionContext) => MultiplayerSession {
	return ({ editor, awareness }) => {
		const provider = new WebsocketProvider(
			options.serverUrl,
			options.room,
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
			onStatusChange: (
				listener: (
					status: "disconnected" | "connecting" | "connected",
				) => void,
			) => {
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
			onSync: (listener: (isSynced: boolean) => void) => {
				const handleSync = (isSynced: boolean) => {
					listener(isSynced);
				};

				provider.on("sync", handleSync);
				return () => {
					provider.off("sync", handleSync);
				};
			},
		});
	};
}

function resolvePlaygroundCollaborationServerUrl(): string {
	if (import.meta.env.VITE_PLAYGROUND_COLLAB_SERVER_URL) {
		return import.meta.env.VITE_PLAYGROUND_COLLAB_SERVER_URL;
	}

	if (typeof window === "undefined") {
		return `ws://127.0.0.1:${DEFAULT_PLAYGROUND_COLLAB_SERVER_PORT}${DEFAULT_PLAYGROUND_COLLAB_SERVER_PATH}`;
	}

	const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
	return `${protocol}//${window.location.hostname}:${DEFAULT_PLAYGROUND_COLLAB_SERVER_PORT}${DEFAULT_PLAYGROUND_COLLAB_SERVER_PATH}`;
}

function getPlaygroundCollaborationRoomFromUrl(): string | null {
	if (typeof window === "undefined") {
		return null;
	}
	const room = new URL(window.location.href).searchParams
		.get(PLAYGROUND_COLLAB_ROOM_QUERY_PARAM)
		?.trim();
	return room ? room : null;
}

function createFreshPlaygroundCollaborationRoomId(): string {
	const suffix =
		typeof crypto !== "undefined" && "randomUUID" in crypto
			? crypto.randomUUID().slice(0, 8)
			: Math.random().toString(36).slice(2, 10);
	return `${DEFAULT_PLAYGROUND_COLLAB_ROOM}-${suffix}`;
}

function buildPlaygroundCollaborationRoomUrl(
	currentUrl: string,
	room: string,
): string {
	const nextUrl = new URL(currentUrl);
	nextUrl.searchParams.set(PLAYGROUND_COLLAB_ROOM_QUERY_PARAM, room);
	return nextUrl.toString();
}

function getConfiguredPlaygroundCollaborationUserName(): string | null {
	const configuredName = import.meta.env.VITE_PLAYGROUND_COLLAB_USER_NAME?.trim();
	return configuredName ? configuredName : null;
}

function isEmptyParagraphOnlyDocument(
	editor: Editor,
	blockIds: readonly string[],
): boolean {
	for (const blockId of blockIds) {
		const block = editor.getBlock(blockId);
		if (!block || block.type !== "paragraph") {
			return false;
		}
		if (block.textContent().trim().length > 0) {
			return false;
		}
		if (Object.keys(block.props).length > 0) {
			return false;
		}
	}

	return true;
}

function getStoredPlaygroundUser(): PlaygroundCollaborationUser {
	if (typeof window === "undefined") {
		return createPlaygroundUser();
	}

	const storedValue = window.sessionStorage.getItem(
		PLAYGROUND_COLLAB_USER_STORAGE_KEY,
	);
	if (storedValue) {
		const parsedUser = parseStoredPlaygroundUser(storedValue);
		if (parsedUser) {
			return parsedUser;
		}
	}

	const nextUser = createPlaygroundUser();
	storePlaygroundUser(nextUser);
	return nextUser;
}

function parseStoredPlaygroundUser(
	value: string,
): PlaygroundCollaborationUser | null {
	try {
		const parsedValue = JSON.parse(value) as Partial<PlaygroundCollaborationUser>;
		if (
			typeof parsedValue.id !== "string" ||
			typeof parsedValue.name !== "string" ||
			typeof parsedValue.color !== "string"
		) {
			return null;
		}

		return {
			id: parsedValue.id,
			name: parsedValue.name,
			color: parsedValue.color,
		};
	} catch {
		return null;
	}
}

function createPlaygroundUser(): PlaygroundCollaborationUser {
	const id = createPlaygroundUserId();
	return {
		id,
		name: "",
		color: PLAYGROUND_USER_COLORS[hashString(id) % PLAYGROUND_USER_COLORS.length],
	};
}

function storePlaygroundUser(user: PlaygroundCollaborationUser): void {
	if (typeof window === "undefined") {
		return;
	}

	window.sessionStorage.setItem(
		PLAYGROUND_COLLAB_USER_STORAGE_KEY,
		JSON.stringify(user),
	);
}

function createPlaygroundUserId(): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return crypto.randomUUID();
	}

	return `playground-${Math.random().toString(36).slice(2, 10)}`;
}

function hashString(value: string): number {
	let hash = 0;
	for (const character of value) {
		hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
	}
	return hash;
}
