import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const PLAYGROUND_BACKEND_PORT = "8787";
const PEN_SOURCE_ALIASES = {
	"@input/pen-ai": fileURLToPath(
		new URL("../packages/extensions/ai/src/index.ts", import.meta.url),
	),
	"@input/pen-ai-skills": fileURLToPath(
		new URL("../packages/extensions/ai-skills/src/index.ts", import.meta.url),
	),
	"@input/pen-ai-autocomplete": fileURLToPath(
		new URL("../packages/extensions/ai-autocomplete/src/index.ts", import.meta.url),
	),
	"@input/pen-ai-suggestions": fileURLToPath(
		new URL("../packages/extensions/ai-suggestions/src/index.ts", import.meta.url),
	),
	"@input/pen-ai-tools": fileURLToPath(
		new URL("../packages/extensions/ai-tools/src/index.ts", import.meta.url),
	),
	"@input/pen-core": fileURLToPath(new URL("../packages/core/src/index.ts", import.meta.url)),
	"@input/pen-crdt-yjs": fileURLToPath(
		new URL("../packages/crdt/yjs/src/index.ts", import.meta.url),
	),
	"@input/pen-delta-stream": fileURLToPath(
		new URL("../packages/extensions/delta-stream/src/index.ts", import.meta.url),
	),
	"@input/pen-document-ops": fileURLToPath(
		new URL("../packages/extensions/document-ops/src/index.ts", import.meta.url),
	),
	"@input/pen-database": fileURLToPath(
		new URL("../packages/extensions/database/src/index.ts", import.meta.url),
	),
	"@input/pen-export-html": fileURLToPath(
		new URL("../packages/extensions/export-html/src/index.ts", import.meta.url),
	),
	"@input/pen-export-markdown": fileURLToPath(
		new URL("../packages/extensions/export-markdown/src/index.ts", import.meta.url),
	),
	"@input/pen-import-html": fileURLToPath(
		new URL("../packages/extensions/import-html/src/index.ts", import.meta.url),
	),
	"@input/pen-import-markdown": fileURLToPath(
		new URL("../packages/extensions/import-markdown/src/index.ts", import.meta.url),
	),
	"@input/pen-input-rules": fileURLToPath(
		new URL("../packages/extensions/input-rules/src/index.ts", import.meta.url),
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
