import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { aiPlugin } from "./server/aiPlugin";
import { collaborationPlugin } from "./server/collaborationPlugin";

export default defineConfig(({ mode }) => {
	// The empty prefix loads every variable, not just `VITE_` ones. The key
	// stays on the server: it is passed to the plugin, never to the client.
	const env = loadEnv(mode, process.cwd(), "");
	const apiKey = process.env.ANTHROPIC_API_KEY ?? env.ANTHROPIC_API_KEY;

	return {
		plugins: [react(), aiPlugin(apiKey), collaborationPlugin()],
		resolve: {
			// One copy of React, one copy of each Pen package. Two copies of
			// either means two editor registries and very confusing bugs.
			dedupe: ["react", "react-dom", "yjs"],
		},
		server: {
			port: 5173,
		},
	};
});
