import { defineConfig } from "vite";
import pkg from "./package.json" with { type: "json" };

const workspacePenPackages = Object.keys({
  ...pkg.dependencies,
  ...pkg.devDependencies,
}).filter((name) => name === "@input/pen" || name.startsWith("@input/pen-"));

export default defineConfig({
  server: {
    port: 5177,
    strictPort: true,
  },
  optimizeDeps: {
    exclude: workspacePenPackages,
  },
});
