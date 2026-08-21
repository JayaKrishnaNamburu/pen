import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["src/__tests__/**/*.test.ts", "src/soak/**/*.test.ts"],
		testTimeout: 30_000,
	},
});
