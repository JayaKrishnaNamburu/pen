import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/suggestions.ts",
    "src/autocomplete.ts",
    "src/skills.ts",
    "src/tools.ts",
    "src/stream.ts",
  ],
  format: ["esm", "cjs"],
  dts: { compilerOptions: { stripInternal: true } },
  outDir: "dist",
  clean: true,
  external: [
    "@input/pen-core",
    "@input/pen-content-ops",
    "@input/pen-document-ops",
    "@input/pen-types",
  ],
  outExtension({ format }) {
    return { js: format === "esm" ? ".mjs" : ".cjs" };
  },
});
