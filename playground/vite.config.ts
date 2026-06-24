import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const PLAYGROUND_BACKEND_PORT = "8787";
const PEN_SOURCE_ALIASES = {
	"@pen/ai": fileURLToPath(
		new URL("../packages/extensions/ai/src/index.ts", import.meta.url),
	),
	"@pen/ai-skills": fileURLToPath(
		new URL("../packages/extensions/ai-skills/src/index.ts", import.meta.url),
	),
	"@pen/ai-autocomplete": fileURLToPath(
		new URL("../packages/extensions/ai-autocomplete/src/index.ts", import.meta.url),
	),
	"@pen/ai-suggestions": fileURLToPath(
		new URL("../packages/extensions/ai-suggestions/src/index.ts", import.meta.url),
	),
	"@pen/ai-tools": fileURLToPath(
		new URL("../packages/extensions/ai-tools/src/index.ts", import.meta.url),
	),
	"@pen/core": fileURLToPath(new URL("../packages/core/src/index.ts", import.meta.url)),
	"@pen/crdt-yjs": fileURLToPath(
		new URL("../packages/crdt/yjs/src/index.ts", import.meta.url),
	),
	"@pen/delta-stream": fileURLToPath(
		new URL("../packages/extensions/delta-stream/src/index.ts", import.meta.url),
	),
	"@pen/document-ops": fileURLToPath(
		new URL("../packages/extensions/document-ops/src/index.ts", import.meta.url),
	),
	"@pen/database": fileURLToPath(
		new URL("../packages/extensions/database/src/index.ts", import.meta.url),
	),
	"@pen/export-html": fileURLToPath(
		new URL("../packages/extensions/export-html/src/index.ts", import.meta.url),
	),
	"@pen/export-markdown": fileURLToPath(
		new URL("../packages/extensions/export-markdown/src/index.ts", import.meta.url),
	),
	"@pen/import-html": fileURLToPath(
		new URL("../packages/extensions/import-html/src/index.ts", import.meta.url),
	),
	"@pen/import-markdown": fileURLToPath(
		new URL("../packages/extensions/import-markdown/src/index.ts", import.meta.url),
	),
	"@pen/input-rules": fileURLToPath(
		new URL("../packages/extensions/input-rules/src/index.ts", import.meta.url),
	),
	"@pen/multiplayer": fileURLToPath(
		new URL("../packages/extensions/multiplayer/src/index.ts", import.meta.url),
	),
	"@pen/preset-default": fileURLToPath(
		new URL("../packages/presets/default/src/index.ts", import.meta.url),
	),
	"@pen/react": fileURLToPath(
		new URL("../packages/rendering/react/src/index.ts", import.meta.url),
	),
	"@pen/search": fileURLToPath(
		new URL("../packages/extensions/search/src/index.ts", import.meta.url),
	),
	"@pen/schema-default": fileURLToPath(
		new URL("../packages/schema/default/src/index.ts", import.meta.url),
	),
	"@pen/shortcuts": fileURLToPath(
		new URL("../packages/extensions/shortcuts/src/index.ts", import.meta.url),
	),
	"@pen/content-ops": fileURLToPath(
		new URL("../packages/shared/content-ops/src/index.ts", import.meta.url),
	),
	"@pen/dom": fileURLToPath(new URL("../packages/rendering/dom/src", import.meta.url)),
	"@pen/history": fileURLToPath(
		new URL("../packages/extensions/history/src/index.ts", import.meta.url),
	),
	"@pen/markdown-serialization": fileURLToPath(
		new URL("../packages/shared/markdown-serialization/src/index.ts", import.meta.url),
	),
	"@pen/assets-memory": fileURLToPath(
		new URL("../packages/tooling/assets-memory/src/index.ts", import.meta.url)
	),
	"@pen/types": fileURLToPath(new URL("../packages/types/src/index.ts", import.meta.url)),
	"@pen/undo": fileURLToPath(
		new URL("../packages/extensions/undo/src/index.ts", import.meta.url),
	),
} as const;

export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: PEN_SOURCE_ALIASES,
		conditions: ["import", "module", "browser", "default"],
		dedupe: ["react", "react-dom"],
	},
	server: {
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
});
