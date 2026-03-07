import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  outDir: "dist",
  clean: true,
  external: ["@pen/types", "@pen/document-ops", "@pen/core"],
  outExtension({ format }) {
    return { js: format === "esm" ? ".mjs" : ".cjs" };
  },
});
