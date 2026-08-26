import { defineConfig } from "vitest/config";

// CH9 (spec/rules/reliability.md): explicit suite timeout.
// Vitest's 5000ms default is not a chosen budget — selectedTextDeletion.07's
// blockquote-exit case alone takes ~4031ms idle and fails when a worker
// consumes the remaining 20% (11-audit.md F39).
export default defineConfig({
	test: {
		testTimeout: 10_000,
	},
});
