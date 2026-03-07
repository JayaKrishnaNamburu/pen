import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  outDir: "dist",
  clean: true,
  external: [
    "react",
    "react-dom",
    "@pen/core",
    "@pen/types",
    "@pen/schema-default",
    "@pen/import-html",
    "@pen/import-markdown",
  ],
  outExtension({ format }) {
    return { js: format === "esm" ? ".mjs" : ".cjs" };
  },
});
