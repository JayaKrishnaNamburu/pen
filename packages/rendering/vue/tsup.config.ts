import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/plugin.ts"],
  format: ["esm", "cjs"],
  dts: { compilerOptions: { stripInternal: true } },
  outDir: "dist",
  clean: true,
  external: [
    "@input/pen-core",
    "@input/pen-dom",
    "@input/pen-import-html",
    "@input/pen-types",
    "vue",
  ],
  outExtension({ format }) {
    return { js: format === "esm" ? ".mjs" : ".cjs" };
  },
});
