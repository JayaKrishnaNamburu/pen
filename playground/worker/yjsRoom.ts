import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";
import type { Env } from "./env";

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const MESSAGE_QUERY_AWARENESS = 3;
const YDOC_KEY = "ydoc";

interface SocketAttachment {
	clientIds: number[];
}

/**
 * One Yjs document per room. Speaks the y-websocket wire protocol so the
 * playground client does not change between `pnpm dev` and Cloudflare.
 *
 * The document is stored on the Durable Object so a hibernation wake still
 * has the room. Awareness is rebuilt from clients. The Awareness heartbeat
 * interval is cleared so it cannot keep the isolate awake.
 */
export class YjsRoom {
	readonly ctx: DurableObjectState;
	readonly env: Env;
	#doc: Y.Doc | null = null;
	#awareness: awarenessProtocol.Awareness | null = null;

	constructor(ctx: DurableObjectState, env: Env) {
		this.ctx = ctx;
		this.env = env;
	}

	async fetch(request: Request): Promise<Response> {
		if (request.headers.get("Upgrade") !== "websocket") {
			return new Response("Expected WebSocket", { status: 426 });
		}

		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair);
		this.ctx.acceptWebSocket(server);
		writeAttachment(server, { clientIds: [] });

		const doc = await this.ensureDoc();
		send(server, encodeSyncStep1(doc));
		const awareness = this.#awareness;
		if (awareness && awareness.getStates().size > 0) {
			send(
				server,
				encodeAwareness(
					awareness,
					Array.from(awareness.getStates().keys()),
				),
			);
		}

		return new Response(null, { status: 101, webSocket: client });
	}

	async webSocketMessage(
		ws: WebSocket,
		message: ArrayBuffer | ArrayBufferView | string,
	): Promise<void> {
		const doc = await this.ensureDoc();
		const awareness = this.#awareness;
		if (!awareness) {
			return;
		}

		const bytes = toBytes(message);
		const decoder = decoding.createDecoder(bytes);
		const encoder = encoding.createEncoder();
		const messageType = decoding.readVarUint(decoder);

		switch (messageType) {
			case MESSAGE_SYNC: {
				encoding.writeVarUint(encoder, MESSAGE_SYNC);
				syncProtocol.readSyncMessage(decoder, encoder, doc, ws);
				if (encoding.length(encoder) > 1) {
					send(ws, encoding.toUint8Array(encoder));
				}
				return;
			}
			case MESSAGE_AWARENESS: {
				awarenessProtocol.applyAwarenessUpdate(
					awareness,
					decoding.readVarUint8Array(decoder),
					ws,
				);
				return;
			}
			case MESSAGE_QUERY_AWARENESS: {
				send(
					ws,
					encodeAwareness(
						awareness,
						Array.from(awareness.getStates().keys()),
					),
				);
				return;
			}
			default:
				return;
		}
	}

	async webSocketClose(ws: WebSocket): Promise<void> {
		await this.dropSocket(ws);
	}

	async webSocketError(ws: WebSocket): Promise<void> {
		await this.dropSocket(ws);
	}

	async ensureDoc(): Promise<Y.Doc> {
		if (this.#doc && this.#awareness) {
			return this.#doc;
		}

		const doc = new Y.Doc({ gc: true });
		const stored = await this.ctx.storage.get<Uint8Array>(YDOC_KEY);
		if (stored) {
			Y.applyUpdate(doc, stored);
		}

		const awareness = new awarenessProtocol.Awareness(doc);
		awareness.setLocalState(null);
		disableAwarenessHeartbeat(awareness);

		doc.on("update", (update: Uint8Array) => {
			this.broadcast(encodeSyncUpdate(update));
			this.ctx.waitUntil(
				this.ctx.storage.put(YDOC_KEY, Y.encodeStateAsUpdate(doc)),
			);
		});

		awareness.on(
			"update",
			(
				{
					added,
					updated,
					removed,
				}: {
					added: number[];
					updated: number[];
					removed: number[];
				},
				origin: unknown,
			) => {
				if (origin instanceof WebSocket) {
					const attachment = readAttachment(origin);
					for (const id of added) {
						attachment.clientIds.push(id);
					}
					attachment.clientIds = attachment.clientIds.filter(
						(id) => !removed.includes(id),
					);
					writeAttachment(origin, attachment);
				}
				const changed = added.concat(updated, removed);
				this.broadcast(encodeAwareness(awareness, changed));
			},
		);

		this.#doc = doc;
		this.#awareness = awareness;
		return doc;
	}

	broadcast(message: Uint8Array): void {
		for (const socket of this.ctx.getWebSockets()) {
			send(socket, message);
		}
	}

	async dropSocket(ws: WebSocket): Promise<void> {
		const awareness = this.#awareness;
		if (!awareness) {
			return;
		}
		const { clientIds } = readAttachment(ws);
		if (clientIds.length > 0) {
			awarenessProtocol.removeAwarenessStates(awareness, clientIds, null);
		}
		try {
			ws.close(1000, "done");
		} catch {
			// already closed
		}
	}
}

function encodeSyncStep1(doc: Y.Doc): Uint8Array {
	const encoder = encoding.createEncoder();
	encoding.writeVarUint(encoder, MESSAGE_SYNC);
	syncProtocol.writeSyncStep1(encoder, doc);
	return encoding.toUint8Array(encoder);
}

function encodeSyncUpdate(update: Uint8Array): Uint8Array {
	const encoder = encoding.createEncoder();
	encoding.writeVarUint(encoder, MESSAGE_SYNC);
	syncProtocol.writeUpdate(encoder, update);
	return encoding.toUint8Array(encoder);
}

function encodeAwareness(
	awareness: awarenessProtocol.Awareness,
	clients: number[],
): Uint8Array {
	const encoder = encoding.createEncoder();
	encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
	encoding.writeVarUint8Array(
		encoder,
		awarenessProtocol.encodeAwarenessUpdate(awareness, clients),
	);
	return encoding.toUint8Array(encoder);
}

function send(socket: WebSocket, message: Uint8Array): void {
	if (socket.readyState !== WebSocket.OPEN) {
		return;
	}
	try {
		socket.send(message);
	} catch {
		// peer already gone
	}
}

function toBytes(message: ArrayBuffer | ArrayBufferView | string): Uint8Array {
	if (typeof message === "string") {
		return new TextEncoder().encode(message);
	}
	if (message instanceof ArrayBuffer) {
		return new Uint8Array(message);
	}
	return new Uint8Array(
		message.buffer,
		message.byteOffset,
		message.byteLength,
	);
}

function readAttachment(ws: WebSocket): SocketAttachment {
	const raw = ws.deserializeAttachment() as SocketAttachment | null;
	if (raw && Array.isArray(raw.clientIds)) {
		return { clientIds: raw.clientIds };
	}
	return { clientIds: [] };
}

function writeAttachment(ws: WebSocket, attachment: SocketAttachment): void {
	ws.serializeAttachment(attachment);
}

function disableAwarenessHeartbeat(
	awareness: awarenessProtocol.Awareness,
): void {
	const timer = (
		awareness as unknown as {
			_checkInterval?: ReturnType<typeof setInterval>;
		}
	)._checkInterval;
	if (timer !== undefined) {
		clearInterval(timer);
	}
}
