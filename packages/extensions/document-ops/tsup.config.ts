import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["esm", "cjs"],
	dts: { compilerOptions: { stripInternal: true } },
	outDir: "dist",
	clean: true,
	external: [
		"@input/pen-content-ops",
		"@input/pen-markdown-serialization",
		"@input/pen-types",
	],
	outExtension({ format }) {
		return { js: format === "esm" ? ".mjs" : ".cjs" };
	},
});
