import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/plugin.ts"],
  format: ["esm", "cjs"],
  dts: true,
  outDir: "dist",
  clean: true,
  external: ["@pen/core", "@pen/dom", "@pen/types", "vue"],
  outExtension({ format }) {
    return { js: format === "esm" ? ".mjs" : ".cjs" };
  },
});
