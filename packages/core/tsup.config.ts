import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  outDir: "dist",
  clean: true,
  external: [
    "@pen/content-ops",
    "@pen/types",
    "@pen/crdt-yjs",
    "@pen/undo",
    "@pen/document-ops",
    "@pen/delta-stream",
    "@pen/markdown-serialization",
  ],
  outExtension({ format }) {
    return { js: format === "esm" ? ".mjs" : ".cjs" };
  },
});
