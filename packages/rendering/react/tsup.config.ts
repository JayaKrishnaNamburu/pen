import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/ai.ts",
    "src/aiSuggestions.ts",
    "src/history.ts",
    "src/multiplayer.ts",
    "src/search.ts",
  ],
  format: ["esm", "cjs"],
  dts: { compilerOptions: { stripInternal: true } },
  outDir: "dist",
  clean: true,
  external: [
    "react",
    "react-dom",
    "@input/pen-core",
    "@input/pen-types",
    "@input/pen-schema-default",
    "@input/pen-interop",
  ],
  outExtension({ format }) {
    return { js: format === "esm" ? ".mjs" : ".cjs" };
  },
});
