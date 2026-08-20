import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/defs.ts"],
  format: ["esm", "cjs"],
  dts: { compilerOptions: { stripInternal: true } },
  outDir: "dist",
  clean: true,
  external: ["@input/pen-core"],
  outExtension({ format }) {
    return { js: format === "esm" ? ".mjs" : ".cjs" };
  },
});
