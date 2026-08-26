import type { Plugin } from "vite";
import { handleChatRequest } from "./chatRoute";

/**
 * Serves `/api/chat` from the Vite dev server.
 *
 * A playground does not need a second process and a second port to answer one
 * endpoint. Vite already runs a Node HTTP server in dev, so the chat route
 * lives there and `pnpm dev` is the only command you run.
 */
export function aiPlugin(apiKey: string | undefined): Plugin {
	return {
		name: "pen-playground-ai",
		configureServer(server) {
			server.middlewares.use("/api/chat", (incoming, response, next) => {
				if (incoming.method !== "POST") {
					next();
					return;
				}

				void handleChatRequest(incoming, response, apiKey);
			});
		},
	};
}
