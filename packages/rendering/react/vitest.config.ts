import { defineConfig } from "vitest/config";

// CH9: package-local so `vitest run` from this package keeps this root
// and picks up the explicit timeout instead of the 5000ms default.
export default defineConfig({
	test: {
		testTimeout: 10_000,
	},
});
