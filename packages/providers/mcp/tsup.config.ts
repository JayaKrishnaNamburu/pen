import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  outDir: "dist",
  clean: true,
  external: ["@pen/core", "@pen/types", "@modelcontextprotocol/sdk"],
  outExtension({ format }) {
    return { js: format === "esm" ? ".mjs" : ".cjs" };
  },
});
