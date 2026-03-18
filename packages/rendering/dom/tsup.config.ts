import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/constants/selectAll.ts",
    "src/field-editor/*.ts",
    "src/utils/dataAttributes.ts",
    "src/utils/inlineDecorations.ts",
    "src/utils/parentIdTree.ts",
    "src/types/paste.ts",
  ],
  format: ["esm", "cjs"],
  dts: true,
  outDir: "dist",
  clean: true,
  external: ["@pen/core", "@pen/shortcuts", "@pen/types"],
  outExtension({ format }) {
    return { js: format === "esm" ? ".mjs" : ".cjs" };
  },
});
