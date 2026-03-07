import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const PEN_SOURCE_ALIASES = {
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
  "@pen/react": fileURLToPath(
    new URL("../packages/rendering/react/src/index.ts", import.meta.url),
  ),
  "@pen/schema-default": fileURLToPath(
    new URL("../packages/schema/default/src/index.ts", import.meta.url),
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
  },
  optimizeDeps: {
    exclude: Object.keys(PEN_SOURCE_ALIASES),
  },
});
