import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/defs.ts"],
  format: ["esm", "cjs"],
  dts: true,
  outDir: "dist",
  clean: true,
  external: ["@pen/core"],
  outExtension({ format }) {
    return { js: format === "esm" ? ".mjs" : ".cjs" };
  },
});
