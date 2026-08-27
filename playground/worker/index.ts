import {
	COLLABORATION_ROUTE,
	roomFromPath,
} from "../server/collaborationRoute";
import { handleChatFetch } from "./chat";
import type { Env } from "./env";

export { YjsRoom } from "./yjsRoom";

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === "/api/chat") {
			if (request.method !== "POST") {
				return new Response("Method Not Allowed", { status: 405 });
			}
			return handleChatFetch(request, env.ANTHROPIC_API_KEY);
		}

		if (
			url.pathname === COLLABORATION_ROUTE ||
			url.pathname.startsWith(`${COLLABORATION_ROUTE}/`)
		) {
			if (request.headers.get("Upgrade") !== "websocket") {
				return new Response("Expected WebSocket", { status: 426 });
			}
			const id = env.YJS_ROOMS.idFromName(roomFromPath(url.pathname));
			return env.YJS_ROOMS.get(id).fetch(request);
		}

		return new Response("Not found", { status: 404 });
	},
};
