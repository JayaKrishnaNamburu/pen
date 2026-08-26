import { setupWSConnection } from "@y/websocket-server/utils";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import type { Plugin } from "vite";
import { WebSocketServer, type WebSocket } from "ws";

const ROUTE_PREFIX = "/collaboration";
const DEFAULT_ROOM = "pen-playground";

/**
 * Serves the Yjs websocket on the Vite dev server at `/collaboration`.
 *
 * Kitchen-sink runs this on a second process and port. The playground keeps
 * `pnpm dev` as the only command, the same way the chat route does.
 */
export function collaborationPlugin(): Plugin {
	return {
		name: "pen-playground-collaboration",
		configureServer(vite) {
			const sockets = new WebSocketServer({ noServer: true });
			sockets.on(
				"connection",
				(socket: WebSocket, request: IncomingMessage) => {
					setupWSConnection(socket, request, {
						docName: roomFromRequest(request),
						gc: true,
					});
				},
			);

			vite.httpServer?.on("upgrade", (request, socket, head) => {
				const path = new URL(
					request.url ?? ROUTE_PREFIX,
					"http://localhost",
				).pathname;
				if (!path.startsWith(ROUTE_PREFIX)) {
					return;
				}

				sockets.handleUpgrade(
					request,
					socket as Duplex,
					head,
					(websocket: WebSocket) => {
						sockets.emit("connection", websocket, request);
					},
				);
			});
		},
	};
}

function roomFromRequest(request: IncomingMessage): string {
	const path = new URL(request.url ?? ROUTE_PREFIX, "http://localhost")
		.pathname;
	const room = path.slice(ROUTE_PREFIX.length).replace(/^\/+/, "");
	return room || DEFAULT_ROOM;
}

