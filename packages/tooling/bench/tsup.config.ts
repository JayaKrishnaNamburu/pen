import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/run.ts"],
  format: ["esm", "cjs"],
  dts: true,
  outDir: "dist",
  clean: true,
  external: [
    "@input/pen-core",
    "@input/pen-types",
    "@input/pen-crdt-yjs",
    "@input/pen-schema-default",
    "@input/pen-test",
    "yjs",
  ],
  outExtension({ format }) {
    return { js: format === "esm" ? ".mjs" : ".cjs" };
  },
});
