import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import pkg from "./package.json" with { type: "json" };

const workspacePenPackages = Object.keys({
	...pkg.dependencies,
	...pkg.devDependencies,
}).filter((name) => name === "@input/pen" || name.startsWith("@input/pen-"));

export default defineConfig({
	base: process.env.PEN_DOCS_BASE ?? "/",
	plugins: [react()],
	resolve: {
		dedupe: ["react", "react-dom"],
	},
	server: {
		port: 5174,
		strictPort: true,
	},
	optimizeDeps: {
		exclude: workspacePenPackages,
	},
});
