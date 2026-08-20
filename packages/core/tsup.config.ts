import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: { compilerOptions: { stripInternal: true } },
  outDir: "dist",
  clean: true,
  external: [
    "@input/pen-content-ops",
    "@input/pen-types",
    "@input/pen-crdt-yjs",
    "@input/pen-undo",
    "@input/pen-document-ops",
    "@input/pen-delta-stream",
    "@input/pen-markdown-serialization",
  ],
  outExtension({ format }) {
    return { js: format === "esm" ? ".mjs" : ".cjs" };
  },
});
