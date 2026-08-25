import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const PLAYGROUND_BACKEND_PORT = "8787";
const PEN_SOURCE_ALIASES = {
	"@input/pen-ai/autocomplete": fileURLToPath(
		new URL("../packages/extensions/ai/src/autocomplete.ts", import.meta.url),
	),
	"@input/pen-ai/skills": fileURLToPath(
		new URL("../packages/extensions/ai/src/skills.ts", import.meta.url),
	),
	"@input/pen-ai/stream": fileURLToPath(
		new URL("../packages/extensions/ai/src/stream.ts", import.meta.url),
	),
	"@input/pen-ai/suggestions": fileURLToPath(
		new URL("../packages/extensions/ai/src/suggestions.ts", import.meta.url),
	),
	"@input/pen-ai/tools": fileURLToPath(
		new URL("../packages/extensions/ai/src/tools.ts", import.meta.url),
	),
	"@input/pen-ai": fileURLToPath(
		new URL("../packages/extensions/ai/src/index.ts", import.meta.url),
	),
	"@input/pen-core": fileURLToPath(new URL("../packages/core/src/index.ts", import.meta.url)),
	"@input/pen-crdt-yjs": fileURLToPath(
		new URL("../packages/crdt/yjs/src/index.ts", import.meta.url),
	),
	"@input/pen-document-ops": fileURLToPath(
		new URL("../packages/extensions/document-ops/src/index.ts", import.meta.url),
	),
	"@input/pen-input-rules": fileURLToPath(
		new URL("../packages/extensions/input-rules/src/index.ts", import.meta.url),
	),
	"@input/pen-interop/html": fileURLToPath(
		new URL("../packages/extensions/interop/src/html.ts", import.meta.url),
	),
	"@input/pen-interop/json": fileURLToPath(
		new URL("../packages/extensions/interop/src/json.ts", import.meta.url),
	),
	"@input/pen-interop/markdown": fileURLToPath(
		new URL("../packages/extensions/interop/src/markdown.ts", import.meta.url),
	),
	"@input/pen-multiplayer": fileURLToPath(
		new URL("../packages/extensions/multiplayer/src/index.ts", import.meta.url),
	),
	"@input/pen-preset-default": fileURLToPath(
		new URL("../packages/presets/default/src/index.ts", import.meta.url),
	),
	"@input/pen-react": fileURLToPath(
		new URL("../packages/rendering/react/src/index.ts", import.meta.url),
	),
	"@input/pen-search": fileURLToPath(
		new URL("../packages/extensions/search/src/index.ts", import.meta.url),
	),
	"@input/pen-schema-default": fileURLToPath(
		new URL("../packages/schema/default/src/index.ts", import.meta.url),
	),
	"@input/pen-shortcuts": fileURLToPath(
		new URL("../packages/extensions/shortcuts/src/index.ts", import.meta.url),
	),
	"@input/pen-types": fileURLToPath(new URL("../packages/types/src/index.ts", import.meta.url)),
	"@input/pen-undo": fileURLToPath(
		new URL("../packages/extensions/undo/src/index.ts", import.meta.url),
	),
} as const;

export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: PEN_SOURCE_ALIASES,
		conditions: ["import", "module", "browser", "default"],
		dedupe: ["react", "react-dom", "yjs"],
	},
	server: {
		hmr: process.env.PEN_E2E === "1" ? false : undefined,
		watch: process.env.PEN_E2E === "1" ? null : undefined,
		fs: {
			allow: [fileURLToPath(new URL("..", import.meta.url))],
		},
		proxy: {
			"/api": `http://127.0.0.1:${PLAYGROUND_BACKEND_PORT}`,
			"/health": `http://127.0.0.1:${PLAYGROUND_BACKEND_PORT}`,
		},
	},
	optimizeDeps: {
		exclude: Object.keys(PEN_SOURCE_ALIASES),
	},
	test: {
		include: ["server/**/*.test.ts"],
		testTimeout: 10_000,
	},
});
