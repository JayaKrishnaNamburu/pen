import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import pkg from "./package.json" with { type: "json" };

const workspacePenPackages = Object.keys({
  ...pkg.dependencies,
  ...pkg.devDependencies,
}).filter((name) => name === "@input/pen" || name.startsWith("@input/pen-"));

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5176,
    strictPort: true,
  },
  optimizeDeps: {
    exclude: workspacePenPackages,
  },
});
