import {
	docs as collaborationDocs,
	setupWSConnection,
} from "@y/websocket-server/utils";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { type WebSocket, WebSocketServer } from "ws";

export interface PlaygroundCollaborationServerOptions {
	routePrefix: string;
	defaultDocName: string;
}

export function createPlaygroundCollaborationServer(
	options: PlaygroundCollaborationServerOptions,
): WebSocketServer {
	const server = new WebSocketServer({ noServer: true });
	server.on("connection", (socket: WebSocket, request: IncomingMessage) => {
		setupWSConnection(socket, request, {
			docName: resolveCollaborationDocName(request, options),
			gc: true,
		});
	});
	return server;
}

export function getPlaygroundCollaborationStats(): {
	documents: number;
	connections: number;
} {
	return {
		documents: collaborationDocs.size,
		connections: Array.from(collaborationDocs.values()).reduce(
			(total, doc) => total + doc.conns.size,
			0,
		),
	};
}

export function handleCollaborationUpgrade(
	server: WebSocketServer,
	options: PlaygroundCollaborationServerOptions,
	request: IncomingMessage,
	socket: Duplex,
	head: Buffer,
): void {
	const requestUrl = new URL(
		request.url ?? options.routePrefix,
		`ws://${request.headers.host ?? "localhost"}`,
	);
	if (!requestUrl.pathname.startsWith(options.routePrefix)) {
		socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
		socket.destroy();
		return;
	}

	server.handleUpgrade(request, socket, head, (ws: WebSocket) => {
		server.emit("connection", ws, request);
	});
}

function resolveCollaborationDocName(
	request: IncomingMessage,
	options: PlaygroundCollaborationServerOptions,
): string {
	const requestUrl = new URL(
		request.url ?? options.routePrefix,
		`ws://${request.headers.host ?? "localhost"}`,
	);
	const roomPath = requestUrl.pathname
		.slice(options.routePrefix.length)
		.replace(/^\/+/, "");
	return roomPath || options.defaultDocName;
}
