import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export default defineConfig({
	root: repoRoot,
	test: {
		name: "wave0-properties",
		include: ["packages/core/src/__tests__/changeSummaries.properties.test.ts"],
		testTimeout: 1_800_000,
	},
});
