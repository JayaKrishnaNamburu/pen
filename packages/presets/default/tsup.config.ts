import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: { compilerOptions: { stripInternal: true } },
  outDir: "dist",
  clean: true,
  external: [
    "@input/pen-delta-stream",
    "@input/pen-document-ops",
    "@input/pen-shortcuts",
    "@input/pen-types",
    "@input/pen-undo",
  ],
  outExtension({ format }) {
    return { js: format === "esm" ? ".mjs" : ".cjs" };
  },
});
