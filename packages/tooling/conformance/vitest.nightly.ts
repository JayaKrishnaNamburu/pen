import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export default defineConfig({
	root: repoRoot,
	test: {
		name: "wave0-properties",
		include: ["packages/core/src/__tests__/changeSummaries.properties.test.ts"],
		// I2/I3 plus A5 collapsed mapRange and a UTF-16 text model that starts
		// in Hebrew/Arabic and inserts RTL, neutrals, digits, isolates, graphemes.
		testTimeout: 1_800_000,
	},
});
